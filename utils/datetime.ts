import type { FrequencyKind, ISODateString, ISODateTimeString } from '@/types';

/** Zero-padded local date string "YYYY-MM-DD" for a given Date. */
export function toDateString(date: Date): ISODateString {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Today's date string in the device's local timezone. */
export function todayString(now: Date = new Date()): ISODateString {
  return toDateString(now);
}

/** Parse "HH:mm" into { hours, minutes }. Returns null for malformed input. */
export function parseTimeOfDay(time: string): { hours: number; minutes: number } | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) return null;
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

/** Combine a date and "HH:mm" into a Date in local time. */
export function combineDateAndTime(date: ISODateString, time: string): Date | null {
  const tod = parseTimeOfDay(time);
  if (!tod) return null;
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, tod.hours, tod.minutes, 0, 0);
}

/** Human 12-hour label for "HH:mm", e.g. "8:00 AM". */
export function formatTimeLabel(time: string): string {
  const tod = parseTimeOfDay(time);
  if (!tod) return time;
  const period = tod.hours >= 12 ? 'PM' : 'AM';
  const hour12 = tod.hours % 12 === 0 ? 12 : tod.hours % 12;
  return `${hour12}:${String(tod.minutes).padStart(2, '0')} ${period}`;
}

/** Friendly date label, e.g. "Wed, Jul 22". */
export function formatDateLabel(value: ISODateTimeString | ISODateString): string {
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Default reminder times for each preset frequency. */
export const defaultTimesForFrequency: Record<Exclude<FrequencyKind, 'custom'>, string[]> = {
  once_daily: ['08:00'],
  twice_daily: ['08:00', '20:00'],
  three_times_daily: ['08:00', '13:00', '20:00'],
};

/** Whether a schedule is active on a given day (inclusive of start/end). */
export function isScheduleActiveOn(
  schedule: { startDate: ISODateString; endDate?: ISODateString },
  day: ISODateString,
): boolean {
  if (day < schedule.startDate) return false;
  if (schedule.endDate && day > schedule.endDate) return false;
  return true;
}
