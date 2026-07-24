import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

/** Server discovery: EXPO_PUBLIC_API_URL, else the Expo dev machine, port 4000. */
function resolveServerUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const hostUri: string | undefined =
    Constants.expoConfig?.hostUri ??
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;
  const host = hostUri?.split(':')[0];
  return host ? `http://${host}:4000` : 'http://localhost:4000';
}

export const SERVER_URL = resolveServerUrl();

export type Role = 'DOCTOR' | 'PHARMACIST';

export interface ProUser {
  id: string;
  role: 'PATIENT' | Role;
  firstName: string;
  lastName: string;
  bloodType?: string | null;
  allergies: string[];
  conditions: string[];
  emergencyName?: string | null;
  emergencyPhone?: string | null;
  birthDate?: string | null;
  mobile?: string | null;
  prcLicense?: string | null;
  verified: boolean;
  publicKey?: string | null;
  /** Doctor opt-in: allow follow-up chat with the most recent patient. */
  followUpChat?: boolean;
  /** Doctor opt-in: allow follow-up calls with the most recent patient. */
  followUpCall?: boolean;
}

export interface Session {
  token: string;
  user: ProUser;
}

const SESSION_KEY = 'agapai-pro/session-v1';
let currentToken: string | null = null;

export async function loadSession(): Promise<Session | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    currentToken = s.token;
    return s;
  } catch {
    return null;
  }
}

export async function saveSession(s: Session | null): Promise<void> {
  currentToken = s?.token ?? null;
  if (s) await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else await AsyncStorage.removeItem(SESSION_KEY);
}

/** The active bearer token — the follow-up WebSocket authenticates with it. */
export function getCurrentToken(): string | null {
  return currentToken;
}

type UnauthorizedCallback = (msg: string) => void;
let unauthorizedListener: UnauthorizedCallback | null = null;

export function setOnUnauthorized(cb: UnauthorizedCallback | null) {
  unauthorizedListener = cb;
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), options.timeoutMs ?? 25000);
  try {
    const res = await fetch(`${SERVER_URL}/api${path}`, {
      method: options.method ?? (options.body ? 'POST' : 'GET'),
      headers: {
        'Content-Type': 'application/json',
        ...(currentToken ? { Authorization: `Bearer ${currentToken}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: ctrl.signal,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string };
    if (!res.ok) {
      const msg = data.error ?? `Request failed (${res.status})`;
      if (res.status === 401 || msg.includes('logged out') || msg.includes('no account found')) {
        if (unauthorizedListener) {
          unauthorizedListener(msg);
        }
      }
      throw new Error(msg);
    }
    return data as T;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError')
      throw new Error('Server timeout — check your connection.');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Health ID QR payload shown by the patient app. */
export interface HealthIdPayload {
  v: 2;
  type: 'agapai.health-id';
  healthId: string;
  key: string;
  preview: { fullName: string; bloodType: string };
}

export function parseHealthId(raw: string): HealthIdPayload | null {
  try {
    const p = JSON.parse(raw) as Partial<HealthIdPayload>;
    if (p.type === 'agapai.health-id' && p.v === 2 && p.healthId && p.key) return p as HealthIdPayload;
    return null;
  } catch {
    return null;
  }
}

export const CONSULTATION_TYPES = [
  'General Consultation (Check-up)',
  'Follow-up Check-up',
  'Specialist Consultation',
  'Preventive Care',
  'Teleconsultation',
] as const;

export interface PrescriptionItem {
  name: string;
  dosage: string;
  times: string[];
  quantity?: number;
  instructions?: string;
}

export interface ConsultationRow {
  id: string;
  patientId: string;
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

// ---------- Follow-ups (doctor side) ----------

export interface FollowUpCounterpart {
  id: string;
  role: 'PATIENT' | Role;
  firstName: string;
  lastName: string;
  prcLicense?: string | null;
}

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

export interface FollowUpMessageRow {
  id: string;
  threadId: string;
  senderId: string;
  senderRole: 'PATIENT' | Role;
  ciphertext: string;
  iv: string;
  salt: string;
  createdAt: string;
}

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

export interface IceServerConfig {
  iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }>;
}

/** Decrypted follow-up message body. */
export interface FollowUpMessageBody {
  text: string;
}

/** Decrypted CONSULTATION share payload. */
export interface SharedConsultationPayload {
  date?: string;
  type?: string;
  doctorName?: string;
  description: string;
  prescriptions: Array<{ name: string; dosage: string; times: string[]; quantity?: number; instructions?: string }>;
  hasVoice?: boolean;
  voiceB64?: string;
}

/** Decrypted AI_HISTORY share payload. */
export interface SharedAiHistoryPayload {
  conversations: Array<{
    startedAt: string;
    mode: 'text' | 'voice';
    messages: Array<{ who: 'user' | 'ai'; text: string }>;
  }>;
}

export const followUpApi = {
  publishPublicKey: (publicKey: string) => api<{ ok: boolean }>('/keys/public', { body: { publicKey } }),
  publishPushToken: (pushToken: string, platform?: string) =>
    api<{ ok: boolean }>('/keys/push-token', { body: { pushToken, platform } }),
  ringCall: (id: string) =>
    api<{ ok: boolean; callId: string; rang: boolean }>(`/follow-up/threads/${id}/call`, { body: {} }),
  updateSettings: (input: { followUpChat?: boolean; followUpCall?: boolean }) =>
    api<{ user: ProUser }>('/users/me', { method: 'PATCH', body: input }),
  list: () => api<{ threads: FollowUpThread[] }>('/follow-up/threads'),
  get: (id: string) =>
    api<{ thread: FollowUpThread; wrap: SealedThreadKey | null; shares: FollowUpShareRow[] }>(
      `/follow-up/threads/${id}`,
    ),
  messages: (id: string) => api<{ messages: FollowUpMessageRow[] }>(`/follow-up/threads/${id}/messages`),
  send: (id: string, blob: EncryptedBlob) =>
    api<{ message: FollowUpMessageRow }>(`/follow-up/threads/${id}/messages`, { body: blob }),
  close: (id: string) => api<{ thread: FollowUpThread }>(`/follow-up/threads/${id}/close`, { body: {} }),
  ice: () => api<IceServerConfig>('/follow-up/ice'),
};
