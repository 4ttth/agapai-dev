import type { DoseLog, DoseStatus, DoseWithMedication, ISODateString, Medication } from '@/types';
import { combineDateAndTime, isScheduleActiveOn } from '@/utils/datetime';

/** Grace period after the scheduled time before a pending dose reads as "missed". */
export const MISSED_GRACE_MINUTES = 60;

/** Deterministic id so a given med/day/time always maps to the same dose log. */
export function doseId(medicationId: string, day: ISODateString, time: string): string {
  return `dose_${medicationId}_${day}_${time}`;
}

/**
 * Build the set of scheduled doses for a single day from the active medications.
 * These start as "pending"; real status comes from persisted logs (see merge).
 */
export function materializeDosesForDay(medications: Medication[], day: ISODateString): DoseLog[] {
  const logs: DoseLog[] = [];
  for (const med of medications) {
    if (!isScheduleActiveOn(med.schedule, day)) continue;
    for (const time of med.schedule.times) {
      const at = combineDateAndTime(day, time);
      if (!at) continue;
      logs.push({
        id: doseId(med.id, day, time),
        medicationId: med.id,
        scheduledAt: at.toISOString(),
        status: 'pending',
      });
    }
  }
  return logs;
}

/** Overlay persisted logs (which hold real taken/missed status) onto materialized doses. */
export function mergeWithPersisted(materialized: DoseLog[], persisted: DoseLog[]): DoseLog[] {
  const byId = new Map(persisted.map((l) => [l.id, l]));
  return materialized.map((dose) => byId.get(dose.id) ?? dose);
}

/**
 * Derive the display status. Stored status wins; otherwise a pending dose whose
 * scheduled time (plus grace) has passed reads as "missed".
 */
export function deriveDisplayStatus(dose: DoseLog, now: Date): DoseStatus {
  if (dose.status === 'taken') return 'taken';
  if (dose.status === 'missed') return 'missed';
  const scheduled = new Date(dose.scheduledAt).getTime();
  const cutoff = scheduled + MISSED_GRACE_MINUTES * 60_000;
  return now.getTime() > cutoff ? 'missed' : 'pending';
}

/** Join doses with their medication and sort chronologically. */
export function joinAndSort(doses: DoseLog[], medications: Medication[]): DoseWithMedication[] {
  const byId = new Map(medications.map((m) => [m.id, m]));
  return doses
    .map((dose) => {
      const medication = byId.get(dose.medicationId);
      return medication ? { dose, medication } : null;
    })
    .filter((x): x is DoseWithMedication => x !== null)
    .sort((a, b) => a.dose.scheduledAt.localeCompare(b.dose.scheduledAt));
}

export interface DoseSummary {
  total: number;
  taken: number;
  missed: number;
  pending: number;
}

export function summarize(doses: DoseWithMedication[], now: Date): DoseSummary {
  return doses.reduce<DoseSummary>(
    (acc, { dose }) => {
      const status = deriveDisplayStatus(dose, now);
      acc.total += 1;
      acc[status] += 1;
      return acc;
    },
    { total: 0, taken: 0, missed: 0, pending: 0 },
  );
}

/** The soonest not-yet-taken dose (upcoming preferred, else the most overdue). */
export function getNextDose(
  doses: DoseWithMedication[],
  now: Date,
): DoseWithMedication | null {
  const outstanding = doses.filter(({ dose }) => deriveDisplayStatus(dose, now) !== 'taken');
  if (outstanding.length === 0) return null;
  const nowMs = now.getTime();
  const upcoming = outstanding
    .filter(({ dose }) => new Date(dose.scheduledAt).getTime() >= nowMs)
    .sort((a, b) => a.dose.scheduledAt.localeCompare(b.dose.scheduledAt));
  if (upcoming.length > 0) return upcoming[0];
  // All outstanding are in the past — surface the most recent overdue one.
  return outstanding.sort((a, b) => b.dose.scheduledAt.localeCompare(a.dose.scheduledAt))[0];
}
