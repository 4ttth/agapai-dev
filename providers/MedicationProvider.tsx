import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { services } from '@/services';
import type { AsyncStatus, DoseLog, Medication, NewMedicationInput } from '@/types';
import { todayString } from '@/utils/datetime';
import { requestNotificationPermission, syncAllReminders } from '@/utils/notifications';

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
    } catch {
      setStatus('error');
      setError('We could not load your medicines. Please try again.');
    }
  }, []);

  useEffect(() => {
    void load();
    void requestNotificationPermission().then(setRemindersEnabled);
  }, [load]);

  const addMedication = useCallback(async (input: NewMedicationInput) => {
    const created = await services.medication.add(input);
    const next = [created, ...medications];
    setMedications(next);
    void syncAllReminders(next);
    return created;
  }, [medications]);

  const updateMedication = useCallback(
    async (id: string, input: NewMedicationInput) => {
      const updated = await services.medication.update(id, input);
      const next = medications.map((m) => (m.id === id ? updated : m));
      setMedications(next);
      void syncAllReminders(next);
      return updated;
    },
    [medications],
  );

  const removeMedication = useCallback(
    async (id: string) => {
      await services.medication.remove(id);
      const next = medications.filter((m) => m.id !== id);
      setMedications(next);
      setDoseLogs((prev) => prev.filter((l) => l.medicationId !== id));
      void syncAllReminders(next);
    },
    [medications],
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
