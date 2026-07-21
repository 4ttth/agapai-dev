import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

import type { ScannedDoc } from '@/types';
import { createId } from '@/utils/id';
import { readJson, writeJson } from '@/utils/storage';

/**
 * Offline-only scanned medical records. Images are resized + recompressed
 * before saving so storage stays small, and never leave the device.
 */

const INDEX_KEY = 'agapai/docs-v1';
const DIR = `${FileSystem.documentDirectory}scans/`;

async function ensureDir() {
  const info = await FileSystem.getInfoAsync(DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
}

export async function listDocuments(): Promise<ScannedDoc[]> {
  return readJson<ScannedDoc[]>(INDEX_KEY, []);
}

export async function saveDocument(sourceUri: string, name: string): Promise<ScannedDoc> {
  await ensureDir();
  // Storage optimization: cap the long edge and recompress to ~50% JPEG.
  const optimized = await ImageManipulator.manipulateAsync(
    sourceUri,
    [{ resize: { width: 1400 } }],
    { compress: 0.5, format: ImageManipulator.SaveFormat.JPEG },
  );
  const id = createId('doc');
  const dest = `${DIR}${id}.jpg`;
  await FileSystem.moveAsync({ from: optimized.uri, to: dest });
  const info = await FileSystem.getInfoAsync(dest);
  const doc: ScannedDoc = {
    id,
    name: name || 'Medical record',
    uri: dest,
    createdAt: new Date().toISOString(),
    sizeBytes: info.exists && 'size' in info ? (info.size ?? 0) : 0,
  };
  const docs = await listDocuments();
  await writeJson(INDEX_KEY, [doc, ...docs]);
  return doc;
}

export async function deleteDocument(id: string): Promise<ScannedDoc[]> {
  const docs = await listDocuments();
  const doc = docs.find((d) => d.id === id);
  if (doc) await FileSystem.deleteAsync(doc.uri, { idempotent: true }).catch(() => {});
  const next = docs.filter((d) => d.id !== id);
  await writeJson(INDEX_KEY, next);
  return next;
}

export const formatBytes = (n: number) =>
  n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
