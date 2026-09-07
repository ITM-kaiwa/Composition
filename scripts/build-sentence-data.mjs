// scripts/build-sentence-data.mjs
//
// Merges the per-chunk OCR extraction JSON files in scripts/ocr-source/
// (produced by reading the Minna no Nihongo Vol.1/Vol.2 textbook scans --
// 文型/例文/練習A from every lesson 1-50), re-tokenizes each sentence into
// real word-level tiles with kuromoji (a proper Japanese morphological
// analyzer -- IPADIC dictionary), and writes the static
// src/lib/sentenceBattleData.ts data file consumed by SentenceBattleGame.tsx.
//
// The OCR JSON's sentence text still carries the textbook's printed
// phrase-level spacing (e.g. "マリアさんも ブラジル人です。"), which is too
// coarse for the drag-and-drop game -- kuromoji splits it down to real
// words/particles (マリア|さん|も|ブラジル|人|です|。), which is what the game
// actually uses as draggable tiles.
//
// Not wired into `npm run build` -- run manually whenever the source OCR
// JSON changes (e.g. after re-extracting or hand-correcting a lesson).
//
// Usage: node scripts/build-sentence-data.mjs [path-to-ocr-source-dir]
//   (defaults to scripts/ocr-source relative to the repo root)

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import kuromoji from "kuromoji";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const outFile = join(rootDir, "src", "lib", "sentenceBattleData.ts");
const srcDir = process.argv[2] ?? join(__dirname, "ocr-source");
const dicPath = join(rootDir, "node_modules", "kuromoji", "dict");

const files = readdirSync(srcDir).filter((f) => f.endsWith(".json"));
if (files.length === 0) {
  console.error(`No .json files found in ${srcDir}`);
  process.exit(1);
}

function buildTokenizer() {
  return new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath }).build((err, tokenizer) => {
      if (err) reject(err);
      else resolve(tokenizer);
    });
  });
}

// Punctuation/separator characters read as their own token from kuromoji
// (sentence-final "。", "、", "？", "！", and the mid-word name separator "・")
// -- fold each onto the end of the previous tile rather than leaving it as
// its own draggable piece, which would be a meaningless drag target.
const ATTACH_TO_PREVIOUS = new Set(["。", "、", "！", "？", "…", "・"]);

const KATAKANA_START = 0x30a1;
const KATAKANA_END = 0x30f6;
const HIRAGANA_OFFSET = 0x30a1 - 0x3041; // = 0x60

function katakanaToHiragana(str) {
  let out = "";
  for (const ch of str) {
    const code = ch.codePointAt(0);
    out += code >= KATAKANA_START && code <= KATAKANA_END
      ? String.fromCodePoint(code - HIRAGANA_OFFSET)
      : ch;
  }
  return out;
}

function isKanjiChar(ch) {
  const code = ch.codePointAt(0);
  return (code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf);
}

function hasKanji(str) {
  return Array.from(str).some(isKanjiChar);
}

// Breaks a token's surface form into a plain prefix, a kanji-bearing "core"
// that needs furigana, and a plain suffix -- e.g. surface "見ます" + reading
// "みます" -> { prefix: "", kanji: "見", reading: "み", suffix: "ます" }, so
// the ruby annotation lands only over the kanji itself, matching how
// furigana is printed in the source textbook (not over okurigana that's
// already phonetic). Returns null when the token has no kanji, or no
// reading was available to align against (unknown-dictionary words).
function buildFuri(surface, readingHiragana) {
  if (!readingHiragana || !hasKanji(surface)) return null;
  const s = Array.from(surface);
  const r = Array.from(readingHiragana);

  let suf = 0;
  while (
    suf < s.length - 1 &&
    suf < r.length &&
    !isKanjiChar(s[s.length - 1 - suf]) &&
    s[s.length - 1 - suf] === r[r.length - 1 - suf]
  ) {
    suf++;
  }

  const sRem = s.slice(0, s.length - suf);
  const rRem = r.slice(0, r.length - suf);
  let pre = 0;
  while (
    pre < sRem.length - 1 &&
    pre < rRem.length &&
    !isKanjiChar(sRem[pre]) &&
    sRem[pre] === rRem[pre]
  ) {
    pre++;
  }

  const kanjiCore = sRem.slice(pre).join("");
  const readingCore = rRem.slice(pre).join("");
  if (!kanjiCore || !readingCore) return null;

  return {
    prefix: s.slice(0, pre).join(""),
    kanji: kanjiCore,
    reading: readingCore,
    suffix: s.slice(s.length - suf).join(""),
  };
}

function tokenizeWithFurigana(tokenizer, text) {
  const rawTokens = tokenizer.tokenize(text);
  const tiles = [];
  for (const tok of rawTokens) {
    const surface = tok.surface_form;
    if (!surface) continue;
    if (ATTACH_TO_PREVIOUS.has(surface) && tiles.length > 0) {
      const prev = tiles[tiles.length - 1];
      prev.text += surface;
      if (prev.furi) prev.furi.suffix += surface;
      continue;
    }
    const readingHiragana = tok.reading ? katakanaToHiragana(tok.reading) : null;
    tiles.push({ text: surface, furi: buildFuri(surface, readingHiragana) });
  }
  return tiles;
}

/** lesson number (string) -> { bunkei: Set<string>, reibun: Set<string>, renshuA: Set<string> } */
const merged = new Map();

function ensureLesson(n) {
  if (!merged.has(n)) {
    merged.set(n, { bunkei: new Set(), reibun: new Set(), renshuA: new Set() });
  }
  return merged.get(n);
}

function cleanSentence(s) {
  return s.replace(/\s+/g, " ").trim();
}

let fileCount = 0;
let warnCount = 0;

for (const file of files) {
  const full = join(srcDir, file);
  let data;
  try {
    data = JSON.parse(readFileSync(full, "utf-8"));
  } catch (err) {
    console.error(`Failed to parse ${file}: ${err.message}`);
    warnCount++;
    continue;
  }
  fileCount++;

  for (const [lessonKey, entry] of Object.entries(data)) {
    const lessonNum = Number(lessonKey);
    if (!Number.isInteger(lessonNum) || lessonNum < 1 || lessonNum > 50) {
      console.warn(`  [${file}] skipping unexpected lesson key "${lessonKey}"`);
      warnCount++;
      continue;
    }
    const bucket = ensureLesson(lessonNum);
    for (const cat of ["bunkei", "reibun", "renshuA"]) {
      const list = Array.isArray(entry[cat]) ? entry[cat] : [];
      for (const raw of list) {
        if (typeof raw !== "string") continue;
        const cleaned = cleanSentence(raw);
        if (!cleaned) continue;
        bucket[cat].add(cleaned);
      }
    }
  }
}

console.log(`Merged ${fileCount} file(s), ${warnCount} warning(s).`);

const lessonsFound = [...merged.keys()].sort((a, b) => a - b);
for (let n = 1; n <= 50; n++) {
  if (!lessonsFound.includes(n)) {
    console.warn(`  ! Lesson ${n} has NO data at all.`);
  }
}

console.log("Loading kuromoji dictionary (IPADIC)...");
const tokenizer = await buildTokenizer();
console.log("Tokenizing sentences into word-level tiles...");

const entries = [];
for (const lessonNum of lessonsFound) {
  const bucket = merged.get(lessonNum);
  for (const cat of ["bunkei", "reibun", "renshuA"]) {
    let i = 0;
    for (const spacedText of bucket[cat]) {
      // The OCR text still carries the textbook's printed phrase spacing;
      // strip it before tokenizing since kuromoji expects real (unspaced)
      // Japanese text and does its own word segmentation.
      const plain = spacedText.replace(/\s+/g, "");
      const tiles = tokenizeWithFurigana(tokenizer, plain).filter((t) => t.text);
      if (tiles.length < 2) continue; // need at least 2 tiles for a scramble
      i++;
      entries.push({
        id: `L${lessonNum}-${cat}-${i}`,
        lesson: lessonNum,
        category: cat,
        tiles,
      });
    }
  }
}

console.log(`Total sentences: ${entries.length}`);

const body = entries
  .map(
    (e) =>
      `  { id: ${JSON.stringify(e.id)}, lesson: ${e.lesson}, category: ${JSON.stringify(
        e.category
      )}, tiles: ${JSON.stringify(e.tiles)} },`
  )
  .join("\n");

const fileContents = `/**
 * Sentence pool for the "呪文バトル" (spell-battle) sentence-scramble game.
 *
 * Sourced by OCR from the "みんなのにほんご" (Minna no Nihongo) Vol.1 (課1-25)
 * and Vol.2 (課26-50) main textbooks: the 文型 (sentence-pattern) and 例文
 * (example-sentence) lists from every lesson, plus a handful of sentences
 * generated from each lesson's 練習A substitution-drill tables.
 *
 * \`tiles\` is the sentence pre-split into real word/particle-level tokens via
 * kuromoji (IPADIC) morphological analysis -- e.g. "マリアさんもブラジル人です。"
 * becomes ["マリア","さん","も","ブラジル","人","です。"] -- these are exactly
 * the draggable pieces the player reassembles in the game, so the split is
 * authoritative and should not be re-tokenized client-side.
 *
 * Each tile also carries \`furi\`: a kanji/reading breakdown (from the same
 * kuromoji analysis) for rendering furigana, e.g. the tile "見ます" carries
 * furi { prefix: "", kanji: "見", reading: "み", suffix: "ます" } so ruby
 * annotation lands only on the kanji itself, matching print convention.
 * \`furi\` is null for tiles with no kanji (nothing to annotate).
 *
 * Auto-generated by scripts/build-sentence-data.mjs from scripts/ocr-source/
 * -- do not hand-edit the MINNA_SENTENCES array below; fix the source JSON
 * (or add a lesson override file) and regenerate instead.
 */

export type SentenceCategory = "bunkei" | "reibun" | "renshuA";

export interface SentenceFuri {
  prefix: string;
  kanji: string;
  reading: string;
  suffix: string;
}

export interface SentenceTile {
  text: string;
  furi: SentenceFuri | null;
}

export interface SentenceEntry {
  id: string;
  /** 1-25 = Vol.1 (N5), 26-50 = Vol.2 (N4). */
  lesson: number;
  category: SentenceCategory;
  tiles: SentenceTile[];
}

export const CATEGORY_LABELS: Record<SentenceCategory, string> = {
  bunkei: "文型",
  reibun: "例文",
  renshuA: "練習A",
};

export const LESSON_COUNT = 50;

export const MINNA_SENTENCES: SentenceEntry[] = [
${body}
];

export function lessonLabel(lesson: number): string {
  return \`第\${lesson}課\`;
}

export function sentenceText(entry: SentenceEntry): string {
  return entry.tiles.map((t) => t.text).join("");
}
`;

writeFileSync(outFile, fileContents, "utf-8");
console.log(`Wrote ${outFile}`);
