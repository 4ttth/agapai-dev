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
    if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
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
