import type { BloodType } from './healthProfile';

/** Roles known to the AgapAI server. */
export type ServerRole = 'PATIENT' | 'DOCTOR' | 'PHARMACIST';

/** User row as returned by the AgapAI server. */
export interface ServerUser {
  id: string;
  role: ServerRole;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  suffix?: string | null;
  birthDate?: string | null;
  mobile?: string | null;
  bloodType?: string | null;
  allergies: string[];
  conditions: string[];
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  prcLicense?: string | null;
  verified: boolean;
  everified: boolean;
  createdAt: string;
}

/** Profile shape returned by eGov SSO (subset we use). */
export interface EgovProfile {
  uniqid: string;
  email?: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  mobile?: string;
  birth_date?: string;
  nationality?: string;
}

/** Server-normalized identity resolved from eVerify (National ID QR). */
export interface VerifiedIdentity {
  uniqid: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  suffix?: string | null;
  birthDate?: string | null;
  mobile?: string | null;
  bloodType?: string | null;
  gender?: string | null;
}

/** Session persisted on-device after registration/login. */
export interface AgapaiSession {
  token: string;
  user: ServerUser;
  /** Patient-held secret; encrypts consultation records end-to-end. */
  patientKey?: string;
}

export const CONSULTATION_TYPES = [
  'General Consultation (Check-up)',
  'Follow-up Check-up',
  'Specialist Consultation',
  'Preventive Care',
  'Teleconsultation',
] as const;
export type ConsultationType = (typeof CONSULTATION_TYPES)[number];

/** Encrypted consultation row from the server. */
export interface ConsultationRow {
  id: string;
  patientId: string;
  doctorId: string;
  date: string;
  type: string;
  ciphertext: string;
  iv: string;
  salt: string;
  hasVoice: boolean;
  hasRxImage: boolean;
  dispensedAt?: string | null;
  createdAt: string;
  doctor?: { firstName: string; lastName: string; prcLicense?: string | null };
  patient?: { firstName: string; lastName: string; bloodType?: string | null };
}

export interface PrescriptionItem {
  name: string;
  dosage: string;
  times: string[];
  quantity?: number;
  instructions?: string;
}

/** Plaintext consultation payload (exists only on doctor + patient devices). */
export interface DecryptedConsultation {
  description: string;
  /** base64 m4a voice note recorded by the doctor, if any. */
  voiceB64?: string;
  prescriptions: PrescriptionItem[];
  /** base64 jpeg of a scanned paper prescription, if any. */
  rxImageB64?: string;
}

/** Health ID QR payload v2 — carries the patient key for E2E decryption. */
export interface HealthIdPayload {
  v: 2;
  type: 'agapai.health-id';
  healthId: string;
  key: string;
  preview: { fullName: string; bloodType: BloodType | string };
}

export type MoodLevel = 1 | 2 | 3 | 4 | 5;

/** Map of ISO date (YYYY-MM-DD) → mood level for the calendar. */
export type MoodMap = Record<string, MoodLevel>;

export interface ScannedDoc {
  id: string;
  name: string;
  uri: string;
  createdAt: string;
  sizeBytes: number;
}

export interface Professional {
  id: string;
  role: ServerRole;
  firstName: string;
  lastName: string;
  prcLicense?: string | null;
}
