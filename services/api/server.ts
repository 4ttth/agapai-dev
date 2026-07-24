import type {
  AgapaiSession,
  ConsultationRow,
  EgovProfile,
  FollowUpEligibility,
  FollowUpMessageRow,
  FollowUpShareRow,
  FollowUpThread,
  IceServerConfig,
  Professional,
  ServerUser,
} from '@/types';
import { api } from './http';

export interface SealedThreadKey {
  wrappedKey: string;
  wrapNonce: string;
  wrapEphemPub: string;
}

export interface EncryptedBlob {
  ciphertext: string;
  iv: string;
  salt: string;
}

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
    mobile2?: string;
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

  /** Unlock editing on a new phone via Face Liveness (alternative to eVerify). */
  livenessUnlock(livenessToken: string) {
    return api<{ verified: boolean; score: number }>('/identity/liveness-unlock', {
      body: { livenessToken },
      timeoutMs: 30000,
    });
  },

  /** Escrow the patient's consultation key so a future phone can recover it. */
  escrowKey(patientKey: string, deviceId: string) {
    return api<{ ok: boolean }>('/keys/escrow', { body: { patientKey, deviceId } });
  },

  /** Recover the escrowed key on a new phone after passing Face Liveness. */
  recoverKey(livenessToken: string, deviceId: string) {
    return api<{ patientKey: string; score: number }>('/keys/recover', {
      body: { livenessToken, deviceId },
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
   * Neural text-to-speech via Gemini (relayed by the server so the key stays
   * server-side). Returns base64 signed-16-bit PCM plus its sample rate, which
   * the client decodes and plays. Falls back to the device voice on failure.
   */
  synthesizeSpeech(text: string, voice?: string) {
    return api<{ audio: string; mimeType: string; rate: number }>('/ai/tts', {
      body: { text, voice },
      timeoutMs: 30000,
    });
  },

  /**
   * Classify a medicine name into a small, fixed set of visual categories
   * (pill, capsule, liquid, inhaler, injection, drops, cream, other) so the UI
   * can show a matching icon. Cached server-side per normalized name.
   */
  medicationCategory(name: string) {
    return api<{ name: string; category: string; source: string }>(
      `/ai/medication-category?name=${encodeURIComponent(name)}`,
    );
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
        category?: import('@/types').MedicationCategory;
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

  // ---------- Follow-ups ----------

  /** Publish this device's follow-up public key so a doctor can be sealed to. */
  publishPublicKey(publicKey: string) {
    return api<{ ok: boolean }>('/keys/public', { body: { publicKey } });
  },

  /** Register this device's Expo push token so calls can ring in the background. */
  publishPushToken(pushToken: string, platform?: string) {
    return api<{ ok: boolean }>('/keys/push-token', { body: { pushToken, platform } });
  },

  // ---------- Medication Live Activities (iOS) ----------

  /** Register the ActivityKit push-to-start token so the server can start a
   *  medication Live Activity via APNs even when the app is closed. */
  registerLiveActivityToken(pushToStartToken: string) {
    return api<{ ok: boolean }>('/live-activity/token', { body: { pushToStartToken } });
  },

  /** Register a running activity's update token so the server can push it to the
   *  "due" state at the exact dose time. */
  registerLiveActivityUpdateToken(medicationId: string, updateToken: string) {
    return api<{ ok: boolean }>('/live-activity/activity-token', {
      body: { medicationId, updateToken },
    });
  },

  /** Note a dose taken from a Live Activity button (server marks it dispensed-
   *  free "taken" for reminder logic). Mirrors the widget's App Intent call. */
  markLiveActivityTaken(medicationId: string, scheduledAt: string) {
    return api<{ ok: boolean }>('/live-activity/taken', { body: { medicationId, scheduledAt } });
  },

  /** Ring the other participant for a call (push + live). */
  ringFollowUpCall(id: string) {
    return api<{ ok: boolean; callId: string; rang: boolean }>(`/follow-up/threads/${id}/call`, { body: {} });
  },

  /** Who the patient may follow up with (their most recent doctor) + pubkey. */
  followUpEligibility() {
    return api<FollowUpEligibility>('/follow-up/eligibility');
  },

  /** Open (or resume) a follow-up thread with the most recent doctor. */
  startFollowUp(input: {
    doctorId: string;
    consultationId?: string | null;
    sealed: SealedThreadKey;
    shares?: Array<{ kind: 'CONSULTATION' | 'AI_HISTORY'; label?: string } & EncryptedBlob>;
    firstMessage?: EncryptedBlob;
  }) {
    return api<{ thread: FollowUpThread; resumed: boolean }>('/follow-up/threads', {
      body: {
        doctorId: input.doctorId,
        consultationId: input.consultationId,
        wrappedKey: input.sealed.wrappedKey,
        wrapNonce: input.sealed.wrapNonce,
        wrapEphemPub: input.sealed.wrapEphemPub,
        shares: input.shares,
        firstMessage: input.firstMessage,
      },
    });
  },

  listFollowUps() {
    return api<{ threads: FollowUpThread[] }>('/follow-up/threads');
  },

  getFollowUp(id: string) {
    return api<{
      thread: FollowUpThread;
      wrap: SealedThreadKey | null;
      shares: FollowUpShareRow[];
    }>(`/follow-up/threads/${id}`);
  },

  followUpMessages(id: string) {
    return api<{ messages: FollowUpMessageRow[] }>(`/follow-up/threads/${id}/messages`);
  },

  sendFollowUpMessage(id: string, blob: EncryptedBlob) {
    return api<{ message: FollowUpMessageRow }>(`/follow-up/threads/${id}/messages`, { body: blob });
  },

  closeFollowUp(id: string) {
    return api<{ thread: FollowUpThread }>(`/follow-up/threads/${id}/close`, { body: {} });
  },

  followUpIce() {
    return api<IceServerConfig>('/follow-up/ice');
  },

  health() {
    return api<{ ok: boolean; db: boolean; services: Record<string, { reachable: boolean }> }>(
      '/health',
    );
  },
};

export type { AgapaiSession };
