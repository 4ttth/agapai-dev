// Import the module directly (not the feature barrel) to avoid a circular
// dependency: the barrel pulls in useMedications, which uses this service.
import { guessCategory } from '@/features/pill-tracker/medicationCategory';
import type { MedicationService } from '@/services/api';
import { medicationService as localService } from '@/services/mock/medicationService';
import type { Medication, MedicationCategory, NewMedicationInput } from '@/types';
import { readJson, writeJson } from '@/utils/storage';
import { serverApi } from './server';

/**
 * Local-first medication service with server sync:
 * - self-added medicines live locally (existing, tested behavior) and are
 *   pushed to the server so the eMessage SMS reminder cron knows the schedule;
 * - medicines prescribed by a doctor or dispensed by a pharmacy arrive from
 *   the server and are merged into the same list (read-only rows).
 */

const SERVER_MEDS_KEY = 'agapai/server-meds-v1';
const HIDDEN_KEY = 'agapai/hidden-server-meds-v1';

interface ServerMed {
  id: string;
  name: string;
  dosage: string;
  instructions?: string | null;
  times: string[];
  quantity?: number | null;
  source: 'SELF' | 'DOCTOR' | 'PHARMACIST';
  /** Visual category classified server-side (AI + cache); may be absent. */
  category?: MedicationCategory;
  createdAt: string;
}

function toMedication(m: ServerMed): Medication {
  // Prefer the server's classified category; fall back to an offline guess so
  // prescribed medicines always get a meaningful icon.
  const category = m.category ?? guessCategory(m.name);
  return {
    id: `srv-${m.id}`,
    name: m.name,
    dosage: m.dosage || '—',
    unit: '',
    form: 'tablet',
    appearance: {
      color: m.source === 'PHARMACIST' ? 'From pharmacy' : 'Prescribed',
      colorHex: m.source === 'PHARMACIST' ? '#0F6E6E' : '#0B4F9E',
      shape: 'round',
      category,
    },
    schedule: {
      frequency: 'custom',
      times: m.times.length > 0 ? m.times : ['08:00'],
      startDate: m.createdAt.slice(0, 10),
    },
    instructions:
      [m.instructions, m.quantity ? `Quantity: ${m.quantity}` : null].filter(Boolean).join(' · ') ||
      undefined,
    prescribingDoctor: m.source === 'PHARMACIST' ? 'Pharmacy (dispensed)' : 'Your doctor',
    createdAt: m.createdAt,
  };
}

async function pullServerMeds(): Promise<Medication[]> {
  try {
    const { medications } = await serverApi.serverMedications();
    const remote = medications.filter((m) => m.source !== 'SELF');
    await writeJson(SERVER_MEDS_KEY, remote);
    return remote.map(toMedication);
  } catch {
    const cached = await readJson<ServerMed[]>(SERVER_MEDS_KEY, []);
    return cached.map(toMedication);
  }
}

async function pushSelfMeds(): Promise<void> {
  try {
    const meds = await localService.list();
    await serverApi.syncSelfMedications(
      meds.map((m) => ({
        name: m.name,
        dosage: `${m.dosage}${m.unit ? ` ${m.unit}` : ''}`.trim(),
        times: m.schedule.times,
        instructions: m.instructions,
      })),
    );
  } catch {
    // Offline or signed out — the next successful mutation will re-sync.
  }
}

export const syncedMedicationService: MedicationService = {
  async list() {
    const [local, hidden] = await Promise.all([
      localService.list(),
      readJson<string[]>(HIDDEN_KEY, []),
    ]);
    const remote = (await pullServerMeds()).filter((m) => !hidden.includes(m.id));
    return [...remote, ...local];
  },

  async get(id) {
    if (id.startsWith('srv-')) {
      const all = await this.list();
      return all.find((m) => m.id === id) ?? null;
    }
    return localService.get(id);
  },

  async add(input: NewMedicationInput) {
    const created = await localService.add(input);
    void pushSelfMeds();
    return created;
  },

  async update(id, input) {
    if (id.startsWith('srv-')) {
      throw new Error('Prescribed medicines are managed by your doctor or pharmacy.');
    }
    const updated = await localService.update(id, input);
    void pushSelfMeds();
    return updated;
  },

  async remove(id) {
    if (id.startsWith('srv-')) {
      // A doctor-prescribed / pharmacy-dispensed row. Delete it on the server
      // so it leaves the patient's official medicine record too (the doctor's
      // consultation stays intact) — then drop it locally so it disappears at
      // once and can't reappear from a stale pull.
      const serverId = id.slice('srv-'.length);
      try {
        await serverApi.deleteServerMedication(serverId);
      } catch {
        // Offline or the request failed — fall through to hiding it locally so
        // it vanishes on this device now; a later successful pull reconciles it.
      }
      const [hidden, cached] = await Promise.all([
        readJson<string[]>(HIDDEN_KEY, []),
        readJson<ServerMed[]>(SERVER_MEDS_KEY, []),
      ]);
      if (!hidden.includes(id)) await writeJson(HIDDEN_KEY, [...hidden, id]);
      await writeJson(
        SERVER_MEDS_KEY,
        cached.filter((m) => `srv-${m.id}` !== id),
      );
      return;
    }
    await localService.remove(id);
    void pushSelfMeds();
  },

  listDoseLogs: () => localService.listDoseLogs(),
  saveDoseLog: (dose) => localService.saveDoseLog(dose),
};
