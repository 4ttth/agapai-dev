import AsyncStorage from '@react-native-async-storage/async-storage';

import { medicationService } from '@/services/mock/medicationService';
import type { DoseLog } from '@/types';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('medicationService (mock, AsyncStorage-backed)', () => {
  it('starts with no medications on a fresh install', async () => {
    const meds = await medicationService.list();
    expect(meds).toHaveLength(0);
  });

  it('adds a medication and persists it across reads', async () => {
    const before = await medicationService.list();
    const created = await medicationService.add({
      name: 'Losartan',
      dosage: '50',
      unit: 'mg',
      form: 'tablet',
      appearance: { color: 'White', colorHex: '#fff', shape: 'round' },
      schedule: { frequency: 'once_daily', times: ['09:00'], startDate: '2026-07-22' },
    });
    expect(created.id).toMatch(/^med_/);
    const after = await medicationService.list();
    expect(after).toHaveLength(before.length + 1);
    expect(after.find((m) => m.id === created.id)).toBeDefined();
  });

  it('removes a medication and its dose logs', async () => {
    const target = await medicationService.add({
      name: 'Losartan',
      dosage: '50',
      unit: 'mg',
      form: 'tablet',
      appearance: { color: 'White', colorHex: '#fff', shape: 'round' },
      schedule: { frequency: 'once_daily', times: ['09:00'], startDate: '2026-07-22' },
    });
    const dose: DoseLog = {
      id: `dose_${target.id}_2026-07-22_08:00`,
      medicationId: target.id,
      scheduledAt: '2026-07-22T08:00:00.000Z',
      status: 'taken',
    };
    await medicationService.saveDoseLog(dose);
    expect(await medicationService.listDoseLogs()).toHaveLength(1);

    await medicationService.remove(target.id);
    expect((await medicationService.list()).find((m) => m.id === target.id)).toBeUndefined();
    expect(await medicationService.listDoseLogs()).toHaveLength(0);
  });

  it('upserts a dose log by id (idempotent)', async () => {
    const dose: DoseLog = {
      id: 'dose_med_1_2026-07-22_08:00',
      medicationId: 'med_1',
      scheduledAt: '2026-07-22T08:00:00.000Z',
      status: 'pending',
    };
    await medicationService.saveDoseLog(dose);
    await medicationService.saveDoseLog({ ...dose, status: 'taken' });
    const logs = await medicationService.listDoseLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].status).toBe('taken');
  });
});
