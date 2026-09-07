"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LESSON_COUNT,
  MINNA_SENTENCES,
  sentenceText,
  type SentenceEntry,
  type SentenceFuri,
} from "@/lib/sentenceBattleData";
import { downloadSentenceList } from "@/lib/downloadSentenceList";
import { LANG_STORAGE_KEY, STRINGS, type Lang } from "@/lib/i18n";

const TOTAL_ROUNDS = 5;
const PLAYER_MAX_HP = 3;
const BGM_SRC = "/audio/enemy_bgm.mp3";
const BGM_VOLUME = 0.5;

const DEFAULT_LANG: Lang = "vi";

function loadStoredLang(): Lang {
  if (typeof window === "undefined") return DEFAULT_LANG;
  try {
    const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
    return stored === "ja" || stored === "vi" ? stored : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

interface Enemy {
  name: string;
  emoji: string;
}

const ENEMIES: Enemy[] = [
  { name: "スライム", emoji: "🟢" },
  { name: "コウモリ", emoji: "🦇" },
  { name: "ゴブリン", emoji: "👺" },
  { name: "ゴースト", emoji: "👻" },
  { name: "オーガ", emoji: "👹" },
  { name: "クモ", emoji: "🕷️" },
  { name: "オオカミ", emoji: "🐺" },
];

const BOSS: Enemy = { name: "まおう", emoji: "😈" };

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

interface Tile {
  key: string;
  text: string;
  furi: SentenceFuri | null;
}

function buildTiles(entry: SentenceEntry): Tile[] {
  return entry.tiles.map((tile, i) => ({ key: `${entry.id}-${i}`, text: tile.text, furi: tile.furi }));
}

/** Renders a tile's text, annotated with furigana (via <ruby>/<rt>) over the
 * kanji-bearing part only, when the tile carries a furi breakdown. */
function TileLabel({ text, furi }: { text: string; furi: SentenceFuri | null }) {
  if (!furi) return <>{text}</>;
  return (
    <>
      {furi.prefix}
      <ruby>
        {furi.kanji}
        <rt>{furi.reading}</rt>
      </ruby>
      {furi.suffix}
    </>
  );
}

type Phase = "battle" | "result" | "victory" | "defeat";

interface DragInfo {
  key: string;
  text: string;
  furi: SentenceFuri | null;
  x: number;
  y: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  from: "bank" | number; // "bank" or the slot index it was dragged from
}

// The battle log's text is derived from `t` at render time (not baked in when
// set) so a mid-battle language switch immediately re-renders the current
// message in the new language, instead of leaving it stuck in whichever
// language was active when it was written.
type LogState =
  | { kind: "scatter" }
  | { kind: "noLesson" }
  | { kind: "success"; sentence: string }
  | { kind: "fail"; sentence: string };

function logText(state: LogState, t: (typeof STRINGS)["ja"]): string {
  switch (state.kind) {
    case "scatter":
      return t.scatterLog;
    case "noLesson":
      return t.noLessonDataMessage;
    case "success":
      return t.successLog(state.sentence);
    case "fail":
      return t.failLog(state.sentence);
  }
}

export default function SentenceBattleGame() {
  const [lang, setLang] = useState<Lang>(DEFAULT_LANG);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const t = STRINGS[lang];

  useEffect(() => {
    setLang(loadStoredLang());
  }, []);

  function changeLang(next: Lang) {
    setLang(next);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // localStorage unavailable (private mode, etc) -- language just won't persist.
    }
  }

  const [lessonChoice, setLessonChoice] = useState(0); // 0 = random across all lessons
  const [round, setRound] = useState(1);
  const [enemy, setEnemy] = useState<Enemy>(ENEMIES[0]);
  const [enemyHp, setEnemyHp] = useState(TOTAL_ROUNDS);
  const [playerHp, setPlayerHp] = useState(PLAYER_MAX_HP);
  const [phase, setPhase] = useState<Phase>("battle");
  const [current, setCurrent] = useState<SentenceEntry | null>(null);
  const [bank, setBank] = useState<Tile[]>([]);
  const [slots, setSlots] = useState<(Tile | null)[]>([]);
  const [lastOutcome, setLastOutcome] = useState<"success" | "fail" | null>(null);
  const [enemyHit, setEnemyHit] = useState(false);
  const [log, setLog] = useState<LogState>({ kind: "scatter" });
  const lastIdRef = useRef<string | null>(null);

  const [drag, setDrag] = useState<DragInfo | null>(null);
  const dragRef = useRef<DragInfo | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);

  // Battle BGM: plays for as long as an enemy encounter is active ("battle"
  // or "result" phase, i.e. between startBattle and victory/defeat), and
  // pauses once the encounter ends. Browsers block audio.play() before any
  // user gesture, so a failed autoplay attempt is silently retried on the
  // player's first tap/click anywhere on the page.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const audio = new Audio(BGM_SRC);
    audio.loop = true;
    audio.volume = BGM_VOLUME;
    audioRef.current = audio;
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (phase === "battle" || phase === "result") {
      const playPromise = audio.play();
      if (playPromise) {
        playPromise.catch(() => {
          const retry = () => {
            audio.play().catch(() => {});
          };
          window.addEventListener("pointerdown", retry, { once: true });
        });
      }
    } else {
      audio.pause();
    }
  }, [phase]);

  const pool = useMemo(() => {
    if (lessonChoice === 0) return MINNA_SENTENCES;
    return MINNA_SENTENCES.filter((s) => s.lesson === lessonChoice);
  }, [lessonChoice]);

  const pickSentence = useCallback(
    (candidates: SentenceEntry[]): SentenceEntry | null => {
      if (candidates.length === 0) return null;
      if (candidates.length === 1) return candidates[0];
      let pick = candidates[Math.floor(Math.random() * candidates.length)];
      let guard = 0;
      while (pick.id === lastIdRef.current && guard < 5) {
        pick = candidates[Math.floor(Math.random() * candidates.length)];
        guard++;
      }
      return pick;
    },
    []
  );

  const startRound = useCallback(
    (roundNum: number) => {
      const entry = pickSentence(pool);
      lastIdRef.current = entry?.id ?? null;
      setCurrent(entry);
      setBank(entry ? shuffle(buildTiles(entry)) : []);
      setSlots(entry ? entry.tiles.map(() => null) : []);
      setLastOutcome(null);
      setPhase("battle");
      const e = roundNum >= TOTAL_ROUNDS ? BOSS : ENEMIES[Math.floor(Math.random() * ENEMIES.length)];
      if (roundNum === 1) {
        setEnemy(e);
        setEnemyHp(TOTAL_ROUNDS);
      }
      setLog(entry ? { kind: "scatter" } : { kind: "noLesson" });
    },
    [pool, pickSentence]
  );

  const startBattle = useCallback(() => {
    setRound(1);
    setPlayerHp(PLAYER_MAX_HP);
    setEnemyHp(TOTAL_ROUNDS);
    setEnemy(ENEMIES[Math.floor(Math.random() * ENEMIES.length)]);
    lastIdRef.current = null;
    startRound(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool]);

  // Restart the battle whenever the eligible sentence pool changes (lesson switch).
  useEffect(() => {
    startBattle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool]);

  function returnAllToBank() {
    if (!current) return;
    setBank(shuffle(buildTiles(current)));
    setSlots(current.tiles.map(() => null));
  }

  function placeTile(tile: Tile, fromBank: boolean, fromSlotIndex: number | undefined, targetSlot: number | null) {
    setSlots((prevSlots) => {
      const nextSlots = [...prevSlots];
      // Pull the tile out of its origin first.
      if (!fromBank && fromSlotIndex != null) nextSlots[fromSlotIndex] = null;

      if (targetSlot != null && nextSlots[targetSlot] == null) {
        nextSlots[targetSlot] = tile;
        setBank((prevBank) => prevBank.filter((tl) => tl.key !== tile.key));
      } else {
        // No valid empty slot under the pointer -> tile goes back to the bank.
        setBank((prevBank) => (prevBank.some((tl) => tl.key === tile.key) ? prevBank : [...prevBank, tile]));
      }
      return nextSlots;
    });
  }

  function findSlotIndexAtPoint(x: number, y: number): number | null {
    const el = document.elementFromPoint(x, y);
    const slotEl = el?.closest<HTMLElement>("[data-slot-index]");
    if (!slotEl) return null;
    const idx = Number(slotEl.dataset.slotIndex);
    return Number.isNaN(idx) ? null : idx;
  }

  function isOverBank(x: number, y: number): boolean {
    const el = document.elementFromPoint(x, y);
    return Boolean(el?.closest("[data-bank-area]"));
  }

  const onPointerMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const next = { ...d, x: e.clientX, y: e.clientY };
    dragRef.current = next;
    setDrag(next);
  }, []);

  const onPointerUp = useCallback(
    (e: PointerEvent) => {
      const d = dragRef.current;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      dragRef.current = null;
      setDrag(null);
      if (!d) return;

      const moved = Math.abs(e.clientX - d.startX) > 5 || Math.abs(e.clientY - d.startY) > 5;
      const targetSlot = findSlotIndexAtPoint(e.clientX, e.clientY);
      const overBank = isOverBank(e.clientX, e.clientY);

      if (!moved) return; // treated as a click/tap; the element's own onClick handles it

      const tile: Tile = { key: d.key, text: d.text, furi: d.furi };
      if (overBank) {
        if (d.from !== "bank") {
          setSlots((prev) => {
            const copy = [...prev];
            if (typeof d.from === "number") copy[d.from] = null;
            return copy;
          });
          setBank((prev) => (prev.some((tl) => tl.key === tile.key) ? prev : [...prev, tile]));
        }
        return;
      }
      placeTile(tile, d.from === "bank", typeof d.from === "number" ? d.from : undefined, targetSlot);
    },
    [onPointerMove]
  );

  function startDrag(e: React.PointerEvent, tile: Tile, from: "bank" | number, rect: DOMRect) {
    const info: DragInfo = {
      key: tile.key,
      text: tile.text,
      furi: tile.furi,
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      from,
    };
    dragRef.current = info;
    setDrag(info);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  function onBankTileClick(tile: Tile) {
    // Functional updater: multiple clicks landing in the same React batch
    // (fast taps, programmatic clicks) must each see the previous click's
    // result, not a stale `slots` snapshot from render time.
    setSlots((prevSlots) => {
      const emptyIndex = prevSlots.findIndex((s) => s == null);
      if (emptyIndex === -1) return prevSlots;
      const nextSlots = [...prevSlots];
      nextSlots[emptyIndex] = tile;
      return nextSlots;
    });
    setBank((prev) => prev.filter((tl) => tl.key !== tile.key));
  }

  function onSlotTileClick(index: number) {
    const tile = slots[index];
    if (!tile) return;
    setSlots((prevSlots) => {
      const nextSlots = [...prevSlots];
      nextSlots[index] = null;
      return nextSlots;
    });
    setBank((prev) => [...prev, tile]);
  }

  const allFilled = current != null && slots.every((s) => s != null) && slots.length > 0;

  function handleCast() {
    if (!current || !allFilled) return;
    const built = slots.map((s) => s!.text);
    const correct = built.join("") === current.tiles.map((t) => t.text).join("");

    if (correct) {
      const nextHp = Math.max(0, enemyHp - 1);
      setEnemyHp(nextHp);
      setEnemyHit(true);
      setTimeout(() => setEnemyHit(false), 400);
      setLastOutcome("success");
      setLog({ kind: "success", sentence: sentenceText(current) });
      if (nextHp <= 0) {
        setPhase("victory");
        return;
      }
    } else {
      const nextHp = Math.max(0, playerHp - 1);
      setPlayerHp(nextHp);
      setLastOutcome("fail");
      setLog({ kind: "fail", sentence: sentenceText(current) });
      if (nextHp <= 0) {
        setPhase("defeat");
        return;
      }
    }
    setPhase("result");
  }

  function handleNext() {
    const nextRound = round + 1;
    setRound(nextRound);
    startRound(nextRound);
  }

  const enemyHpPct = (enemyHp / TOTAL_ROUNDS) * 100;

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Gear icon: always pinned to the top-right of the screen. */}
      <button
        type="button"
        onClick={() => setSettingsOpen(true)}
        aria-label={t.settingsButtonLabel}
        title={t.settingsButtonLabel}
        className="btn-press fixed right-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-sand-200 text-sand-700 shadow-card hover:bg-sand-300 hover:brightness-95"
      >
        <GearIcon />
      </button>

      {settingsOpen && (
        <SettingsPanel lang={lang} t={t} onChangeLang={changeLang} onClose={() => setSettingsOpen(false)} />
      )}

      {/* Controls */}
      <div className="mb-3 flex flex-wrap items-center justify-center gap-3">
        <label className="flex items-center gap-2 text-sm text-sand-600">
          <span className="font-medium">{t.lessonSelectLabel}</span>
          <select
            value={lessonChoice}
            onChange={(e) => setLessonChoice(Number(e.target.value))}
            className="btn-press rounded-full border border-sand-300 bg-sand-50 px-3 py-1.5 text-sm text-sand-700 shadow-inner focus:outline-none focus:ring-2 focus:ring-sand-400"
          >
            <option value={0}>{t.randomOption}</option>
            <optgroup label={t.vol1Group}>
              {Array.from({ length: 25 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {t.lessonLabel(n)}
                </option>
              ))}
            </optgroup>
            <optgroup label={t.vol2Group}>
              {Array.from({ length: LESSON_COUNT - 25 }, (_, i) => i + 26).map((n) => (
                <option key={n} value={n}>
                  {t.lessonLabel(n)}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <button
          type="button"
          onClick={() => downloadSentenceList(MINNA_SENTENCES)}
          className="btn-press rounded-full border border-sand-300 bg-sand-50 px-3 py-1.5 text-xs font-semibold text-sand-600 shadow-inner hover:bg-sand-200"
        >
          {t.downloadButton}
        </button>
      </div>

      {MINNA_SENTENCES.length === 0 && (
        <div className="mx-auto max-w-md rounded-2xl border border-sand-300 bg-sand-50 p-8 text-center text-sand-600 shadow-card">
          {t.noDataMessage}
        </div>
      )}

      {MINNA_SENTENCES.length > 0 && pool.length === 0 && (
        <div className="mx-auto max-w-md rounded-2xl border border-sand-300 bg-sand-50 p-8 text-center text-sand-600 shadow-card">
          {t.noLessonDataMessage}
        </div>
      )}

      {pool.length > 0 && (
        <>
          {/* Battle stage */}
          <div className="rounded-3xl border-4 border-kanjibrown/40 bg-gradient-to-b from-[#1b2440] to-[#3a2d55] p-4 shadow-card sm:p-6">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold text-lemon-200">
              <span>{t.roundLabel(round, TOTAL_ROUNDS)}</span>
              <span className="flex items-center gap-1">
                {Array.from({ length: PLAYER_MAX_HP }, (_, i) => (
                  <span key={i}>{i < playerHp ? "❤️" : "🖤"}</span>
                ))}
              </span>
            </div>

            {/* Enemy */}
            <div className="flex flex-col items-center py-4">
              <p className="mb-1 text-sm font-bold text-lemon-100">
                {enemy.name}
                {round >= TOTAL_ROUNDS && enemy.name === BOSS.name ? t.bossSuffix : ""}
              </p>
              <div
                className={`text-7xl transition-transform duration-150 ${
                  enemyHit ? "scale-125 drop-shadow-[0_0_18px_rgba(255,80,80,0.9)]" : ""
                }`}
              >
                {enemy.emoji}
              </div>
              <div className="mt-5 h-3 w-56 overflow-hidden rounded-full bg-black/40">
                <div
                  className="h-full bg-gradient-to-r from-leaf-400 to-leaf-300 transition-all duration-300"
                  style={{ width: `${enemyHpPct}%` }}
                />
              </div>
            </div>

            {/* Message log, DQ-style */}
            <div className="mx-auto mb-4 min-h-[3.2rem] max-w-xl rounded-xl border-2 border-lemon-200/80 bg-[#0d1024]/90 px-4 py-2 text-center text-sm leading-relaxed text-lemon-100">
              {logText(log, t)}
            </div>

            {phase === "battle" && current && (
              <>
                {/* Answer slots (drop target) */}
                <div
                  ref={boardRef}
                  className="mx-auto mb-3 flex min-h-[3.2rem] max-w-2xl flex-wrap items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-lemon-200/60 bg-white/5 p-3"
                >
                  {slots.map((tile, i) => (
                    <div
                      key={i}
                      data-slot-index={i}
                      onPointerDown={(e) => {
                        if (!tile) return;
                        startDrag(e, tile, i, e.currentTarget.getBoundingClientRect());
                      }}
                      onClick={() => onSlotTileClick(i)}
                      className={`flex h-14 min-w-[3rem] whitespace-nowrap items-end justify-center rounded-lg border px-2 pb-1 pt-1 text-base font-medium leading-none ${
                        tile
                          ? `cursor-grab select-none border-lemon-300 bg-lemon-100 text-kanjibrown shadow active:cursor-grabbing ${
                              drag?.key === tile.key ? "opacity-30" : ""
                            }`
                          : "border-lemon-200/50 bg-transparent text-transparent"
                      }`}
                    >
                      {tile ? <TileLabel text={tile.text} furi={tile.furi} /> : "・"}
                    </div>
                  ))}
                </div>

                <div className="mb-3 flex justify-center">
                  <button
                    type="button"
                    disabled={!allFilled}
                    onClick={handleCast}
                    className="btn-press rounded-full bg-gradient-to-b from-lemon-200 to-lemon-300 px-6 py-2 text-sm font-bold text-kanjibrown shadow disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {t.castButton}
                  </button>
                  {slots.some((s) => s != null) && (
                    <button
                      type="button"
                      onClick={returnAllToBank}
                      className="btn-press ml-2 rounded-full border border-lemon-200/60 px-4 py-2 text-xs font-semibold text-lemon-100 hover:bg-white/10"
                    >
                      {t.redoButton}
                    </button>
                  )}
                </div>

                {/* Tile bank (drag source) */}
                <div
                  data-bank-area
                  className="mx-auto flex min-h-[3.4rem] max-w-2xl flex-wrap items-center justify-center gap-2 rounded-2xl bg-white/5 p-3"
                >
                  {bank.length === 0 && (
                    <p className="text-xs text-lemon-200/70">{t.allPlacedMessage}</p>
                  )}
                  {bank.map((tile) => (
                    <BankTile
                      key={tile.key}
                      tile={tile}
                      dimmed={drag?.key === tile.key}
                      onClick={onBankTileClick}
                      onStartDrag={startDrag}
                    />
                  ))}
                </div>
              </>
            )}

            {phase === "result" && current && (
              <div className="text-center">
                <p
                  className={`mb-2 animate-pop-in text-lg font-bold ${
                    lastOutcome === "success" ? "text-leaf-300" : "text-red-300"
                  }`}
                >
                  {lastOutcome === "success" ? t.successLabel : t.failLabel}
                </p>
                <p className="mb-3 px-4 pt-3 text-2xl font-medium leading-loose text-lemon-100 sm:text-3xl">
                  {current.tiles.map((tile, i) => (
                    <TileLabel key={i} text={tile.text} furi={tile.furi} />
                  ))}
                </p>
                <button
                  type="button"
                  onClick={handleNext}
                  className="btn-press rounded-full bg-sand-600 px-5 py-2 text-sm font-semibold text-sand-50 hover:brightness-95"
                >
                  {t.nextButton}
                </button>
              </div>
            )}
          </div>

          {(phase === "victory" || phase === "defeat") && (
            <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-md animate-pop-in space-y-4 rounded-2xl border border-sand-300 bg-sand-50 p-8 text-center shadow-card">
                <p className="text-2xl">{phase === "victory" ? "🏆" : "💀"}</p>
                <p className="text-lg font-bold text-sand-700">
                  {phase === "victory" ? t.victoryTitle : t.defeatTitle}
                </p>
                <p className="text-sand-600">
                  {phase === "victory" ? t.victorySubtitle : t.defeatSubtitle}
                </p>
                <button
                  type="button"
                  onClick={startBattle}
                  className="btn-press rounded-full bg-sand-600 px-5 py-2 text-sm font-semibold text-sand-50 hover:brightness-95"
                >
                  {t.fightAgainButton}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Floating drag ghost */}
      {drag && (
        <div
          className="pointer-events-none fixed z-50 flex h-14 min-w-[3rem] whitespace-nowrap items-end justify-center rounded-lg border border-lemon-300 bg-lemon-100 px-2 pb-1 pt-1 text-base font-medium leading-none text-kanjibrown shadow-lg"
          style={{ left: drag.x - drag.offsetX, top: drag.y - drag.offsetY }}
        >
          <TileLabel text={drag.text} furi={drag.furi} />
        </div>
      )}
    </div>
  );
}

function BankTile({
  tile,
  dimmed,
  onClick,
  onStartDrag,
}: {
  tile: Tile;
  dimmed?: boolean;
  onClick: (tile: Tile) => void;
  onStartDrag: (e: React.PointerEvent, tile: Tile, from: "bank" | number, rect: DOMRect) => void;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);
  return (
    <button
      ref={ref}
      type="button"
      onPointerDown={(e) => {
        if (!ref.current) return;
        onStartDrag(e, tile, "bank", ref.current.getBoundingClientRect());
      }}
      onClick={() => onClick(tile)}
      className={`btn-press flex h-14 min-w-[3rem] whitespace-nowrap cursor-grab select-none items-end justify-center rounded-lg border border-leaf-300 bg-leaf-100 px-2 pb-1 pt-1 text-base font-medium leading-none text-kanjibrown shadow active:cursor-grabbing ${
        dimmed ? "opacity-30" : ""
      }`}
    >
      <TileLabel text={tile.text} furi={tile.furi} />
    </button>
  );
}

function GearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065Z"
      />
      <circle cx="12" cy="12" r="3.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SettingsPanel({
  lang,
  t,
  onChangeLang,
  onClose,
}: {
  lang: Lang;
  t: (typeof STRINGS)["ja"];
  onChangeLang: (lang: Lang) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs animate-pop-in rounded-2xl border border-sand-300 bg-sand-50 p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-center text-base font-bold text-sand-700">{t.settingsTitle}</h2>

        <p className="mb-2 text-sm font-medium text-sand-600">{t.languageLabel}</p>
        <div className="mb-5 flex rounded-full bg-sand-200 p-1 shadow-inner">
          <button
            type="button"
            onClick={() => onChangeLang("ja")}
            className={`btn-press flex-1 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
              lang === "ja" ? "bg-sand-600 text-sand-50 shadow" : "text-sand-600 hover:bg-sand-300/70"
            }`}
          >
            日本語
          </button>
          <button
            type="button"
            onClick={() => onChangeLang("vi")}
            className={`btn-press flex-1 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
              lang === "vi" ? "bg-sand-600 text-sand-50 shadow" : "text-sand-600 hover:bg-sand-300/70"
            }`}
          >
            Tiếng Việt
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="btn-press w-full rounded-full bg-sand-600 px-4 py-2 text-sm font-semibold text-sand-50 hover:brightness-95"
        >
          {t.closeButton}
        </button>
      </div>
    </div>
  );
}
