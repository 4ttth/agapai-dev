import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { doseId } from '@/features/pill-tracker/logic';
import { services } from '@/services';
import type { AsyncStatus, DoseLog, Medication, NewMedicationInput } from '@/types';
import { todayString, toDateString } from '@/utils/datetime';
import { getDeviceId } from '@/utils/device';
import { readNotificationPrefs } from '@/utils/notificationPrefs';
import { reconcileNotifications, requestNotificationPermission } from '@/utils/notifications';
import { setHapticsEnabled } from '@/utils/haptics';
import { initLiveActivities, teardownLiveActivities } from '@/utils/liveActivities';

interface MedicationContextValue {
  status: AsyncStatus;
  error: string | null;
  medications: Medication[];
  doseLogs: DoseLog[];
  /** Notification permission granted (undefined until first checked). */
  remindersEnabled: boolean | undefined;
  refresh: () => Promise<void>;
  addMedication: (input: NewMedicationInput) => Promise<Medication>;
  updateMedication: (id: string, input: NewMedicationInput) => Promise<Medication>;
  removeMedication: (id: string) => Promise<void>;
  getMedication: (id: string) => Medication | undefined;
  /** Persist a dose log (taken/pending/missed) by id. */
  recordDose: (dose: DoseLog) => Promise<void>;
}

export const MedicationContext = createContext<MedicationContextValue | undefined>(undefined);

/**
 * Central store for medications and dose logs. Loads from the (mock) service,
 * persists via AsyncStorage, and keeps local reminders in sync with schedules.
 */
export function MedicationProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AsyncStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [doseLogs, setDoseLogs] = useState<DoseLog[]>([]);
  const [remindersEnabled, setRemindersEnabled] = useState<boolean | undefined>(undefined);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const [meds, logs] = await Promise.all([
        services.medication.list(),
        services.medication.listDoseLogs(),
      ]);
      setMedications(meds);
      setDoseLogs(logs);
      setStatus('success');
      // Align local notifications (medication + mood reminders) with the saved
      // list and preferences on every load, and sync the haptics switch.
      void readNotificationPrefs().then((prefs) => {
        setHapticsEnabled(prefs.haptics);
        return reconcileNotifications(meds, prefs);
      });
    } catch {
      setStatus('error');
      setError('We could not load your medicines. Please try again.');
    }
  }, []);

  useEffect(() => {
    void load();
    void requestNotificationPermission().then(setRemindersEnabled);
  }, [load]);

  // Reschedule medication reminders whenever the list changes, honouring the
  // patient's notification preferences (and preserving the mood reminder, which
  // reconcileNotifications reschedules alongside the medication ones).
  const reschedule = useCallback(async (next: Medication[]) => {
    const prefs = await readNotificationPrefs();
    await reconcileNotifications(next, prefs);
  }, []);

  const addMedication = useCallback(async (input: NewMedicationInput) => {
    const created = await services.medication.add(input);
    const next = [created, ...medications];
    setMedications(next);
    void reschedule(next);
    return created;
  }, [medications, reschedule]);

  const updateMedication = useCallback(
    async (id: string, input: NewMedicationInput) => {
      const updated = await services.medication.update(id, input);
      const next = medications.map((m) => (m.id === id ? updated : m));
      setMedications(next);
      void reschedule(next);
      return updated;
    },
    [medications, reschedule],
  );

  const removeMedication = useCallback(
    async (id: string) => {
      await services.medication.remove(id);
      const next = medications.filter((m) => m.id !== id);
      setMedications(next);
      setDoseLogs((prev) => prev.filter((l) => l.medicationId !== id));
      void reschedule(next);
    },
    [medications, reschedule],
  );

  const getMedication = useCallback(
    (id: string) => medications.find((m) => m.id === id),
    [medications],
  );

  const recordDose = useCallback(async (dose: DoseLog) => {
    // Optimistic update; the write is idempotent by dose id.
    setDoseLogs((prev) => {
      const index = prev.findIndex((l) => l.id === dose.id);
      if (index === -1) return [...prev, dose];
      const next = [...prev];
      next[index] = dose;
      return next;
    });
    await services.medication.saveDoseLog(dose);
  }, []);

  /**
   * Mark a dose taken from a medication Live Activity ("I already took it").
   * Rebuilds the deterministic dose id from the scheduled time (local day + HH:mm)
   * so it overlays the correct materialized dose in the tracker.
   */
  const recordDoseTaken = useCallback(
    (medicationId: string, scheduledAtISO: string) => {
      const d = new Date(scheduledAtISO);
      if (Number.isNaN(d.getTime())) return;
      const day = toDateString(d);
      const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      void recordDose({
        id: doseId(medicationId, day, time),
        medicationId,
        scheduledAt: scheduledAtISO,
        status: 'taken',
        takenAt: new Date().toISOString(),
      });
    },
    [recordDose],
  );

  // Wire the iOS medication Live Activity: share auth config with the widget,
  // register APNs tokens, and reconcile doses confirmed from the activity.
  // No-op where the native module is absent (Expo Go, Android, web).
  useEffect(() => {
    void (async () => {
      const deviceId = await getDeviceId();
      await initLiveActivities(deviceId, recordDoseTaken);
    })();
    return () => teardownLiveActivities();
  }, [recordDoseTaken]);

  const value = useMemo<MedicationContextValue>(
    () => ({
      status,
      error,
      medications,
      doseLogs,
      remindersEnabled,
      refresh: load,
      addMedication,
      updateMedication,
      removeMedication,
      getMedication,
      recordDose,
    }),
    [
      status,
      error,
      medications,
      doseLogs,
      remindersEnabled,
      load,
      addMedication,
      updateMedication,
      removeMedication,
      getMedication,
      recordDose,
    ],
  );

  return <MedicationContext.Provider value={value}>{children}</MedicationContext.Provider>;
}

// Re-exported for the current day so consumers share one definition.
export { todayString };
