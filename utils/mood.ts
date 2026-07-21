import type { MoodLevel, MoodMap } from '@/types';
import { readJson, writeJson } from './storage';

const KEY = 'agapai/mood-v1';

export const MOODS: Array<{ level: MoodLevel; emoji: string; label: string; color: string }> = [
  { level: 1, emoji: '😞', label: 'Very low', color: '#B3261E' },
  { level: 2, emoji: '😕', label: 'Low', color: '#E08700' },
  { level: 3, emoji: '😐', label: 'Okay', color: '#C3CCD6' },
  { level: 4, emoji: '🙂', label: 'Good', color: '#4FB286' },
  { level: 5, emoji: '😄', label: 'Great', color: '#1B7F4B' },
];

export const moodMeta = (level: MoodLevel) => MOODS.find((m) => m.level === level)!;

export const todayKey = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export async function readMoods(): Promise<MoodMap> {
  return readJson<MoodMap>(KEY, {});
}

export async function setMood(date: string, level: MoodLevel): Promise<MoodMap> {
  const map = await readMoods();
  const next = { ...map, [date]: level };
  await writeJson(KEY, next);
  return next;
}

/** Last 30 days, oldest first, for the GitHub-style grid. */
export function last30Days(): string[] {
  const out: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(todayKey(d));
  }
  return out;
}
