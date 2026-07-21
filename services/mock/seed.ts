import type { HealthProfile, Medication } from '@/types';
import { todayString } from '@/utils/datetime';

/** Realistic seed medications for first-run and demos. */
export function seedMedications(): Medication[] {
  const start = todayString();
  const createdAt = new Date().toISOString();
  return [
    {
      id: 'med_seed_amlodipine',
      name: 'Amlodipine',
      dosage: '5',
      unit: 'mg',
      form: 'tablet',
      appearance: { color: 'White', colorHex: '#F3F4F6', shape: 'round' },
      schedule: { frequency: 'once_daily', times: ['08:00'], startDate: start },
      instructions: 'Take one tablet every morning for blood pressure.',
      prescribingDoctor: 'Dr. Reyes',
      createdAt,
    },
    {
      id: 'med_seed_metformin',
      name: 'Metformin',
      dosage: '500',
      unit: 'mg',
      form: 'tablet',
      appearance: { color: 'Off-white', colorHex: '#ECEBE4', shape: 'oval' },
      schedule: { frequency: 'twice_daily', times: ['08:00', '20:00'], startDate: start },
      instructions: 'Take after meals to help control blood sugar.',
      prescribingDoctor: 'Dr. Santos',
      createdAt,
    },
    {
      id: 'med_seed_vitamind',
      name: 'Vitamin D',
      dosage: '1000',
      unit: 'IU',
      form: 'capsule',
      appearance: { color: 'Yellow', colorHex: '#F7E7A6', shape: 'capsule' },
      schedule: { frequency: 'once_daily', times: ['13:00'], startDate: start },
      instructions: 'Take one capsule at lunch.',
      createdAt,
    },
  ];
}

/** Seed Universal Health Profile backing the QR share flow. */
export function seedHealthProfile(): HealthProfile {
  return {
    fullName: 'Maria Dela Cruz',
    dateOfBirth: '1952-03-14',
    bloodType: 'O+',
    allergies: ['Penicillin', 'Peanuts'],
    conditions: ['Hypertension', 'Type 2 Diabetes'],
    emergencyContact: {
      name: 'Jose Dela Cruz',
      relationship: 'Son',
      phone: '+63 917 555 0134',
    },
  };
}
