import { useContext, useEffect, useMemo, useState } from 'react';

import { MedicationContext } from '@/providers/MedicationProvider';
import type { DoseLog, DoseWithMedication } from '@/types';
import { todayString } from '@/utils/datetime';
import { success as hapticSuccess, tap as hapticTap } from '@/utils/haptics';
import {
  deriveDisplayStatus,
  getNextDose,
  joinAndSort,
  materializeDosesForDay,
  mergeWithPersisted,
  summarize,
} from './logic';

function useContextOrThrow() {
  const ctx = useContext(MedicationContext);
  if (!ctx) throw new Error('useMedications must be used within a MedicationProvider.');
  return ctx;
}

/** Re-render every `intervalMs` so derived "missed" status stays current. */
function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Feature hook for the Visual Pill Tracker. Wraps the medication store and
 * derives today's doses, the next dose, and a taken/missed/pending summary.
 */
export function useMedications() {
  const ctx = useContextOrThrow();
  const now = useNow();
  const day = todayString(now);

  const todaysDoses = useMemo<DoseWithMedication[]>(() => {
    const materialized = materializeDosesForDay(ctx.medications, day);
    const merged = mergeWithPersisted(materialized, ctx.doseLogs);
    return joinAndSort(merged, ctx.medications);
  }, [ctx.medications, ctx.doseLogs, day]);

  const summary = useMemo(() => summarize(todaysDoses, now), [todaysDoses, now]);
  const nextDose = useMemo(() => getNextDose(todaysDoses, now), [todaysDoses, now]);

  const markTaken = (dose: DoseLog) => {
    // A confirming success buzz — the patient feels the dose was logged even if
    // they can't hear a sound or see the screen clearly.
    hapticSuccess();
    return ctx.recordDose({ ...dose, status: 'taken', takenAt: new Date().toISOString() });
  };

  const undoTaken = (dose: DoseLog) => {
    hapticTap();
    return ctx.recordDose({ ...dose, status: 'pending', takenAt: undefined });
  };

  return {
    status: ctx.status,
    error: ctx.error,
    refresh: ctx.refresh,
    remindersEnabled: ctx.remindersEnabled,
    medications: ctx.medications,
    doseLogs: ctx.doseLogs,
    getMedication: ctx.getMedication,
    addMedication: ctx.addMedication,
    updateMedication: ctx.updateMedication,
    removeMedication: ctx.removeMedication,
    todaysDoses,
    summary,
    nextDose,
    markTaken,
    undoTaken,
    displayStatusOf: (dose: DoseLog) => deriveDisplayStatus(dose, now),
    now,
  };
}
