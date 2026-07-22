import type {
  AgapaiSession,
  ConsultationRow,
  EgovProfile,
  Professional,
  ServerUser,
} from '@/types';
import { api } from './http';

/** Thin, typed wrappers over the AgapAI server (which proxies all eGov APIs). */

export interface SsoResult {
  registered: boolean;
  egovProfile: EgovProfile;
  user?: ServerUser;
  token?: string;
}

export interface EverifyLoginResult {
  registered: boolean;
  identity: import('@/types').VerifiedIdentity;
  user?: ServerUser;
  token?: string;
  /** Short-lived signed identity ticket for first-time registration. */
  ticket?: string;
}

export const serverApi = {
  /**
   * Real eGov verification: resolve a National ID QR through eVerify.
   * scope PATIENT so a doctor/pharmacist account on the same National ID
   * doesn't shadow this person's Health ID.
   */
  everifyLogin(value: string) {
    return api<EverifyLoginResult>('/auth/everify-login', {
      body: { value, scope: 'PATIENT' },
      timeoutMs: 30000,
    });
  },

  /** Live eGov SSO: exchange code captured from the SSO redirect. */
  ssoExchange(exchange_code: string) {
    return api<SsoResult>('/auth/sso/exchange', { body: { exchange_code, scope: 'PATIENT' } });
  },

  register(input: {
    /** Identity comes from the server-issued eVerify ticket — never typed. */
    ticket: string;
    role: 'PATIENT' | 'DOCTOR' | 'PHARMACIST';
    mobile?: string;
    bloodType?: string;
    gender?: string;
    pronouns?: string;
    allergies?: string[];
    conditions?: string[];
    emergencyName?: string;
    emergencyPhone?: string;
  }) {
    return api<{ user: ServerUser; token: string }>('/auth/register', { body: input });
  },

  me() {
    return api<{ user: ServerUser }>('/users/me');
  },

  updateMe(input: Partial<ServerUser>) {
    return api<{ user: ServerUser }>('/users/me', { method: 'PATCH', body: input });
  },

  getUser(id: string) {
    return api<{ user: ServerUser }>(`/users/${id}`);
  },

  everifyQrCheck(value: string) {
    return api<{ verified: boolean; score: number }>('/everify/qr-check', {
      body: { value },
      timeoutMs: 30000,
    });
  },

  askAssistant(prompt: string, firstName?: string, documentText?: string) {
    return api<{ reply: string; source: string }>('/ai/assistant', {
      body: { prompt, firstName, documentText },
      timeoutMs: 60000,
    });
  },

  /**
   * Run a photo of a document (lab result, prescription, clinic form) through
   * eGov AI's extractor. The returned text can be passed back to askAssistant
   * as documentText so the AI can interpret it.
   */
  extractDocument(base64: string, filename = 'document.jpg', mimeType = 'image/jpeg') {
    return api<{ text: string; source: string }>('/documents/extract', {
      body: { base64, filename, mimeType },
      timeoutMs: 90000,
    });
  },

  listConsultations() {
    return api<{ consultations: ConsultationRow[] }>('/consultations');
  },

  serverMedications() {
    return api<{
      medications: Array<{
        id: string;
        name: string;
        dosage: string;
        instructions?: string | null;
        times: string[];
        quantity?: number | null;
        source: 'SELF' | 'DOCTOR' | 'PHARMACIST';
        createdAt: string;
      }>;
    }>('/medications');
  },

  syncSelfMedications(
    medications: Array<{ name: string; dosage: string; times: string[]; instructions?: string }>,
  ) {
    return api<{ ok: boolean }>('/medications/sync', { method: 'PUT', body: { medications } });
  },

  directory() {
    return api<{ professionals: Professional[] }>('/directory/professionals');
  },

  health() {
    return api<{ ok: boolean; db: boolean; services: Record<string, { reachable: boolean }> }>(
      '/health',
    );
  },
};

export type { AgapaiSession };
