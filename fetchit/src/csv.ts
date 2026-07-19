import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { STORAGE_PREFIX } from './brand';
import { Box } from './types';

function csvField(v: string | number): string {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Spreadsheet-friendly export, matching the column layout of the web tab. */
export function boxesToCsv(boxes: Box[]): string {
  const rows: (string | number)[][] = [['box_id', 'box_number', 'box_label', 'box_note', 'item']];
  boxes
    .slice()
    .sort((a, b) => a.number - b.number)
    .forEach((b) => {
      if (b.items.length === 0) {
        rows.push([b.id, b.number, b.label, b.note, '']);
      } else {
        b.items.forEach((it) => rows.push([b.id, b.number, b.label, b.note, it]));
      }
    });
  return rows.map((r) => r.map(csvField).join(',')).join('\n') + '\n';
}

/** JSON backup of the full inventory (boxes, items, photo captions). */
export function boxesToJson(boxes: Box[]): string {
  return JSON.stringify({ updated: new Date().toISOString(), boxes }, null, 2) + '\n';
}

async function shareText(content: string, filename: string, mime: string): Promise<void> {
  const uri = FileSystem.cacheDirectory + filename;
  await FileSystem.writeAsStringAsync(uri, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: mime, UTI: 'public.comma-separated-values-text' });
  }
}

export async function exportCsv(boxes: Box[]): Promise<void> {
  await shareText(boxesToCsv(boxes), `${STORAGE_PREFIX}-inventory.csv`, 'text/csv');
}

export async function exportJson(boxes: Box[]): Promise<void> {
  await shareText(boxesToJson(boxes), `${STORAGE_PREFIX}-backup.json`, 'application/json');
}
