import {
  deriveDisplayStatus,
  doseId,
  getNextDose,
  joinAndSort,
  materializeDosesForDay,
  mergeWithPersisted,
  summarize,
} from '@/features/pill-tracker/logic';
import type { DoseLog, Medication } from '@/types';

function makeMedication(overrides: Partial<Medication> = {}): Medication {
  return {
    id: 'med_1',
    name: 'Amlodipine',
    dosage: '5',
    unit: 'mg',
    form: 'tablet',
    appearance: { color: 'White', colorHex: '#fff', shape: 'round' },
    schedule: { frequency: 'twice_daily', times: ['08:00', '20:00'], startDate: '2026-07-22' },
    createdAt: '2026-07-22T00:00:00.000Z',
    ...overrides,
  };
}

describe('materializeDosesForDay', () => {
  it('creates one pending dose per scheduled time on an active day', () => {
    const doses = materializeDosesForDay([makeMedication()], '2026-07-22');
    expect(doses).toHaveLength(2);
    expect(doses.every((d) => d.status === 'pending')).toBe(true);
    expect(doses[0].id).toBe(doseId('med_1', '2026-07-22', '08:00'));
  });

  it('skips medications whose schedule has not started', () => {
    const med = makeMedication({ schedule: { frequency: 'once_daily', times: ['08:00'], startDate: '2026-08-01' } });
    expect(materializeDosesForDay([med], '2026-07-22')).toHaveLength(0);
  });

  it('skips medications whose schedule has ended', () => {
    const med = makeMedication({
      schedule: { frequency: 'once_daily', times: ['08:00'], startDate: '2026-07-01', endDate: '2026-07-10' },
    });
    expect(materializeDosesForDay([med], '2026-07-22')).toHaveLength(0);
  });
});

describe('mergeWithPersisted', () => {
  it('overlays persisted status onto materialized doses by id', () => {
    const materialized = materializeDosesForDay([makeMedication()], '2026-07-22');
    const persisted: DoseLog[] = [{ ...materialized[0], status: 'taken', takenAt: '2026-07-22T08:05:00.000Z' }];
    const merged = mergeWithPersisted(materialized, persisted);
    expect(merged[0].status).toBe('taken');
    expect(merged[1].status).toBe('pending');
  });
});

describe('deriveDisplayStatus', () => {
  const base: DoseLog = {
    id: 'd1',
    medicationId: 'med_1',
    scheduledAt: '2026-07-22T08:00:00.000Z',
    status: 'pending',
  };

  it('keeps taken as taken', () => {
    expect(deriveDisplayStatus({ ...base, status: 'taken' }, new Date('2026-07-22T09:00:00Z'))).toBe('taken');
  });

  it('marks a long-overdue pending dose as missed', () => {
    expect(deriveDisplayStatus(base, new Date('2026-07-22T10:00:00Z'))).toBe('missed');
  });

  it('keeps a recently-due pending dose as pending within grace', () => {
    expect(deriveDisplayStatus(base, new Date('2026-07-22T08:30:00Z'))).toBe('pending');
  });
});

describe('summarize and getNextDose', () => {
  const meds = [makeMedication()];
  const day = '2026-07-22';

  it('counts taken/missed/pending correctly', () => {
    const materialized = materializeDosesForDay(meds, day);
    const persisted: DoseLog[] = [{ ...materialized[0], status: 'taken' }];
    const joined = joinAndSort(mergeWithPersisted(materialized, persisted), meds);
    // Local-time `now` so the comparison holds regardless of the test TZ:
    // 08:00 dose taken, 20:00 dose overdue at 21:30 local.
    const summary = summarize(joined, new Date('2026-07-22T21:30:00'));
    expect(summary.total).toBe(2);
    expect(summary.taken).toBe(1);
    expect(summary.missed).toBe(1);
  });

  it('returns the soonest upcoming outstanding dose', () => {
    const joined = joinAndSort(materializeDosesForDay(meds, day), meds);
    const next = getNextDose(joined, new Date('2026-07-22T07:00:00'));
    expect(next?.dose.scheduledAt).toBe(new Date('2026-07-22T08:00:00').toISOString());
  });

  it('returns null when everything is taken', () => {
    const materialized = materializeDosesForDay(meds, day);
    const persisted = materialized.map((d) => ({ ...d, status: 'taken' as const }));
    const joined = joinAndSort(mergeWithPersisted(materialized, persisted), meds);
    expect(getNextDose(joined, new Date('2026-07-22T09:00:00'))).toBeNull();
  });
});
