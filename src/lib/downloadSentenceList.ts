import { CATEGORY_LABELS, sentenceText, type SentenceEntry } from "./sentenceBattleData";

/**
 * Downloads the full extracted sentence pool as a UTF-8 CSV (with BOM, so it
 * opens correctly in Excel) grouped by lesson. Mirrors the click-to-download
 * pattern used by lib/pdf/* (temporary object URL + synthetic <a> click).
 */
export function downloadSentenceList(sentences: SentenceEntry[]) {
  const sorted = [...sentences].sort((a, b) => a.lesson - b.lesson || a.id.localeCompare(b.id));

  const rows = [["課", "種別", "文"]];
  for (const entry of sorted) {
    rows.push([String(entry.lesson), CATEGORY_LABELS[entry.category], sentenceText(entry)]);
  }

  const csv = rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "minna-no-nihongo-bunshou-list.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
