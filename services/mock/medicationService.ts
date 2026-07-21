import { storageKeys } from '@/constants';
import type { MedicationService } from '@/services/api';
import type { DoseLog, Medication, NewMedicationInput } from '@/types';
import { createId } from '@/utils/id';
import { readJson, writeJson } from '@/utils/storage';
import { delay, maybeFail } from './helpers';
import { seedMedications } from './seed';

/**
 * File-backed mock of the medication API. On first launch it seeds realistic
 * data. All reads/writes go through AsyncStorage so state survives restarts.
 */

async function loadMedications(): Promise<Medication[]> {
  const existing = await readJson<Medication[] | null>(storageKeys.medications, null);
  if (existing) return existing;
  const seeded = seedMedications();
  await writeJson(storageKeys.medications, seeded);
  return seeded;
}

async function saveMedications(meds: Medication[]): Promise<void> {
  await writeJson(storageKeys.medications, meds);
}

async function loadDoseLogs(): Promise<DoseLog[]> {
  return readJson<DoseLog[]>(storageKeys.doseLogs, []);
}

async function saveDoseLogs(logs: DoseLog[]): Promise<void> {
  await writeJson(storageKeys.doseLogs, logs);
}

export const medicationService: MedicationService = {
  async list() {
    await delay();
    maybeFail('loading medications');
    return loadMedications();
  },

  async get(id) {
    await delay(200);
    const meds = await loadMedications();
    return meds.find((m) => m.id === id) ?? null;
  },

  async add(input: NewMedicationInput) {
    await delay();
    maybeFail('saving the medication');
    const meds = await loadMedications();
    const medication: Medication = {
      ...input,
      id: createId('med'),
      createdAt: new Date().toISOString(),
    };
    await saveMedications([medication, ...meds]);
    return medication;
  },

  async update(id, input) {
    await delay();
    maybeFail('updating the medication');
    const meds = await loadMedications();
    const index = meds.findIndex((m) => m.id === id);
    if (index === -1) throw new Error('Medication not found.');
    const updated: Medication = { ...meds[index], ...input, id, createdAt: meds[index].createdAt };
    const next = [...meds];
    next[index] = updated;
    await saveMedications(next);
    return updated;
  },

  async remove(id) {
    await delay(300);
    const meds = await loadMedications();
    await saveMedications(meds.filter((m) => m.id !== id));
    const logs = await loadDoseLogs();
    await saveDoseLogs(logs.filter((l) => l.medicationId !== id));
  },

  async listDoseLogs() {
    await delay(200);
    return loadDoseLogs();
  },

  async saveDoseLog(dose: DoseLog) {
    const logs = await loadDoseLogs();
    const index = logs.findIndex((l) => l.id === dose.id);
    const next = [...logs];
    if (index === -1) {
      next.push(dose);
    } else {
      next[index] = dose;
    }
    await saveDoseLogs(next);
  },
};
