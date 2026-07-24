import { serverApi } from '@/services/api/server';
import { syncedMedicationService } from '@/services/api/syncedMedicationService';

jest.mock('@/services/api/server', () => ({
  serverApi: {
    serverMedications: jest.fn(),
    syncSelfMedications: jest.fn(),
  },
}));

jest.mock('@/services/mock/medicationService', () => ({
  medicationService: {
    list: jest.fn().mockResolvedValue([]),
    get: jest.fn().mockResolvedValue(null),
    add: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    listDoseLogs: jest.fn().mockResolvedValue([]),
    saveDoseLog: jest.fn(),
  },
}));

jest.mock('@/utils/storage', () => ({
  readJson: jest.fn().mockResolvedValue([]),
  writeJson: jest.fn().mockResolvedValue(undefined),
}));

describe('syncedMedicationService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('fetches and converts doctor-prescribed medications from server', async () => {
    (serverApi.serverMedications as jest.Mock).mockResolvedValueOnce({
      medications: [
        {
          id: 'med_rx_101',
          name: 'Amoxicillin',
          dosage: '500mg',
          instructions: 'Take after meals',
          times: ['08:00', '20:00'],
          quantity: 21,
          source: 'DOCTOR',
          category: 'capsule',
          createdAt: '2026-07-24T00:00:00.000Z',
        },
      ],
    });

    const result = await syncedMedicationService.list();

    expect(serverApi.serverMedications).toHaveBeenCalledTimes(1);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'srv-med_rx_101',
      name: 'Amoxicillin',
      dosage: '500mg',
      prescribingDoctor: 'Your doctor',
      schedule: {
        frequency: 'custom',
        times: ['08:00', '20:00'],
        startDate: '2026-07-24',
      },
    });
  });

  it('throws when attempting to edit a doctor-prescribed medication directly', async () => {
    await expect(
      syncedMedicationService.update('srv-med_rx_101', {
        name: 'Amoxicillin Modified',
        dosage: '1000mg',
        unit: 'mg',
        form: 'capsule',
        appearance: { color: 'blue', colorHex: '#000', shape: 'capsule', category: 'capsule' },
        schedule: { frequency: 'once_daily', times: ['08:00'], startDate: '2026-07-24' },
      }),
    ).rejects.toThrow('Prescribed medicines are managed by your doctor or pharmacy.');
  });
});
