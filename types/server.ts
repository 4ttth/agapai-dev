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
  gender?: string | null;
  /** Free-form, e.g. "he/him" — drives how the assistant refers to them. */
  pronouns?: string | null;
  mobile?: string | null;
  /** Optional secondary number; eMessage reminders go to both. */
  mobile2?: string | null;
  bloodType?: string | null;
  allergies: string[];
  conditions: string[];
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  prcLicense?: string | null;
  verified: boolean;
  everified: boolean;
  liveVerified?: boolean;
  activeDeviceId?: string | null;
  /** Send an SMS when a doctor saves a new consultation. Default true. */
  notifyPostConsult?: boolean;
  /** Send an SMS when a pharmacist dispenses medicine. Default true. */
  notifyPostDispense?: boolean;
  /** This device's NaCl public key for end-to-end follow-up key exchange. */
  publicKey?: string | null;
  /** Doctor opt-in: allow follow-up chat with the most recent patient. */
  followUpChat?: boolean;
  /** Doctor opt-in: allow follow-up calls with the most recent patient. */
  followUpCall?: boolean;
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

// ---------- Follow-ups (doctor ⇄ patient) ----------

export interface FollowUpCounterpart {
  id: string;
  role: ServerRole;
  firstName: string;
  lastName: string;
  prcLicense?: string | null;
}

/** A follow-up thread as returned by the server (no plaintext). */
export interface FollowUpThread {
  id: string;
  status: 'OPEN' | 'CLOSED';
  consultationId?: string | null;
  createdAt: string;
  lastMessageAt: string;
  expiresAt: string;
  closedAt?: string | null;
  messageCount?: number;
  counterpart: FollowUpCounterpart | null;
}

/** An encrypted follow-up message row. */
export interface FollowUpMessageRow {
  id: string;
  threadId: string;
  senderId: string;
  senderRole: ServerRole;
  ciphertext: string;
  iv: string;
  salt: string;
  createdAt: string;
}

/** An encrypted shared attachment row (past consultation / AI history). */
export interface FollowUpShareRow {
  id: string;
  threadId: string;
  kind: 'CONSULTATION' | 'AI_HISTORY';
  label?: string | null;
  ciphertext: string;
  iv: string;
  salt: string;
  createdAt: string;
}

/** Who the patient may follow up with, plus that doctor's public key. */
export interface FollowUpEligibility {
  eligible: boolean;
  reason?: string;
  chatEnabled?: boolean;
  callEnabled?: boolean;
  doctor?: {
    id: string;
    firstName: string;
    lastName: string;
    prcLicense?: string | null;
    publicKey?: string | null;
  };
  consultationId?: string | null;
  existingThreadId?: string | null;
}

/** Decrypted follow-up message payload (exists only on the two devices). */
export interface FollowUpMessageBody {
  text: string;
}

/** Decrypted CONSULTATION share payload (a past visit the patient re-shared). */
export interface SharedConsultationPayload {
  date?: string;
  type?: string;
  doctorName?: string;
  description: string;
  prescriptions: PrescriptionItem[];
  hasVoice?: boolean;
  voiceB64?: string;
}

/** Decrypted AI_HISTORY share payload (the patient's local assistant chats). */
export interface SharedAiHistoryPayload {
  conversations: Array<{
    startedAt: string;
    mode: 'text' | 'voice';
    messages: Array<{ who: 'user' | 'ai'; text: string }>;
  }>;
}

export interface IceServerConfig {
  iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }>;
}
