import type { ISODateString } from './common';

export type BloodType = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | 'unknown';

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

/**
 * Minimal Universal Health Profile. Backs the QR share flow so clinic staff can
 * read essential data without paperwork. Full editing is a later phase.
 */
export interface HealthProfile {
  fullName: string;
  dateOfBirth: ISODateString;
  bloodType: BloodType;
  allergies: string[];
  conditions: string[];
  emergencyContact: EmergencyContact;
}

/**
 * Payload encoded into the shareable QR. Kept intentionally small and free of
 * secrets — it references a short-lived token the (future) backend resolves.
 */
export interface HealthSharePayload {
  version: 1;
  type: 'agapai.health-id';
  /** Opaque share token (mocked now, backend-issued later). */
  token: string;
  /** Non-sensitive preview so the scanner can confirm identity. */
  preview: {
    fullName: string;
    bloodType: BloodType;
  };
}
