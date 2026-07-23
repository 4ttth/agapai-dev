import type { HealthProfile, Medication } from '@/types';

/**
 * Medications the app starts with on a fresh install: none. A new patient's
 * list is empty until they add their own medicine or a doctor/pharmacist
 * prescribes one that syncs from the server.
 */
export function seedMedications(): Medication[] {
  return [];
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
