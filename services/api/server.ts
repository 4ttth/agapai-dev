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

export const serverApi = {
  /** Demo-mode eGov SSO (deterministic sandbox identity, same response shape as live). */
  mockSso(seed: string, names?: { firstName?: string; lastName?: string; mobile?: string }) {
    return api<SsoResult>('/auth/mock-sso', { body: { seed, ...names } });
  },

  /** Live eGov SSO: exchange code captured from the SSO redirect. */
  ssoExchange(exchange_code: string) {
    return api<SsoResult>('/auth/sso/exchange', { body: { exchange_code } });
  },

  register(input: {
    egovUniqid?: string;
    role: 'PATIENT' | 'DOCTOR' | 'PHARMACIST';
    firstName: string;
    lastName: string;
    middleName?: string;
    suffix?: string;
    birthDate?: string;
    mobile?: string;
    bloodType?: string;
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
    return api<{ verified: boolean; data: Record<string, unknown> }>('/everify/qr-check', {
      body: { value },
      timeoutMs: 30000,
    });
  },

  askAssistant(prompt: string, firstName?: string) {
    return api<{ reply: string; source: string }>('/ai/assistant', {
      body: { prompt, firstName },
      timeoutMs: 60000,
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
