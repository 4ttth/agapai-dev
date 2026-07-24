import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { serverApi } from '@/services/api/server';
import { setAuthToken } from '@/services/api/http';
import type { AgapaiSession, ServerUser, VerifiedIdentity } from '@/types';
import { Platform } from 'react-native';

import { makePatientKey } from '@/utils/crypto';
import { getDeviceId } from '@/utils/device';
import { getDeviceKeyPair } from '@/utils/followupKeys';
import { registerForPushToken } from '@/utils/notifications';
import { readJson, removeKeys, writeJson } from '@/utils/storage';

const SESSION_KEY = 'agapai/session-v2';
const patientKeyStorage = (userId: string) => `agapai/pkey/${userId}`;

export type AuthStatus = 'initializing' | 'signedOut' | 'registering' | 'signedIn';

interface RegisterInput {
  bloodType?: string;
  gender?: string;
  pronouns?: string;
  allergies?: string[];
  conditions?: string[];
  emergencyName?: string;
  emergencyPhone?: string;
  mobile?: string;
  mobile2?: string;
}

interface PendingIdentity {
  identity: VerifiedIdentity;
  ticket: string;
}

interface AuthContextValue {
  status: AuthStatus;
  session: AgapaiSession | null;
  /** eVerify-confirmed identity awaiting first-time registration. */
  pending: PendingIdentity | null;
  signingIn: boolean;
  error: string | null;
  /** Real eGov verification: sign in by scanning the National ID QR. */
  signInWithNationalId: (qrValue: string) => Promise<void>;
  /** Complete first-time registration → creates the Health ID. */
  register: (input: RegisterInput) => Promise<void>;
  updateUser: (user: ServerUser) => Promise<void>;
  /** Store a Face-Liveness-recovered consultation key and unlock records. */
  recoverPatientKey: (patientKey: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('initializing');
  const [session, setSession] = useState<AgapaiSession | null>(null);
  const [pending, setPending] = useState<PendingIdentity | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    readJson<AgapaiSession | null>(SESSION_KEY, null).then((restored) => {
      if (!active) return;
      if (restored) {
        setAuthToken(restored.token);
        setSession(restored);
        setStatus('signedIn');
        // Refresh the profile in the background (verification status may have changed).
        serverApi
          .me()
          .then(({ user }) => {
            const next = { ...restored, user };
            setSession(next);
            void writeJson(SESSION_KEY, next);
          })
          .catch(() => {});
      } else {
        setStatus('signedOut');
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const persistSession = useCallback(
    async (token: string, user: ServerUser, opts: { isRegistration?: boolean } = {}) => {
      setAuthToken(token);
      let patientKey: string | undefined;
      if (user.role === 'PATIENT') {
        const deviceId = await getDeviceId();
        const localKey = (await readJson<string | null>(patientKeyStorage(user.id), null)) ?? undefined;
        if (localKey) {
          // Same phone (or re-login here): reuse the key and make sure it is
          // escrowed so a future phone can recover it. Idempotent.
          patientKey = localKey;
          void serverApi.escrowKey(localKey, deviceId).catch(() => {});
        } else if (opts.isRegistration) {
          // Brand-new account: mint the key and escrow it under the liveness gate.
          patientKey = await makePatientKey();
          await writeJson(patientKeyStorage(user.id), patientKey);
          void serverApi.escrowKey(patientKey, deviceId).catch(() => {});
        } else {
          // Registered account on a NEW phone: do NOT mint a fresh key (that
          // would orphan every past record). Records stay locked until the
          // patient recovers the escrowed key via Face Liveness.
          patientKey = undefined;
        }
      }
      // Publish this device's follow-up public key so their doctor can seal a
      // thread key to it. Best-effort — a follow-up just won't start until it
      // succeeds, and it's retried on every sign-in.
      try {
        const { publicKey } = await getDeviceKeyPair();
        if (user.publicKey !== publicKey) void serverApi.publishPublicKey(publicKey).catch(() => {});
      } catch {
        /* ignore */
      }

      // Register a push token so a doctor's follow-up call rings in the background.
      void registerForPushToken()
        .then((token) => {
          if (token) void serverApi.publishPushToken(token, Platform.OS).catch(() => {});
        })
        .catch(() => {});

      const next: AgapaiSession = { token, user, patientKey };
      await writeJson(SESSION_KEY, next);
      setSession(next);
      setPending(null);
      setStatus('signedIn');
    },
    [],
  );

  /**
   * After a successful Face Liveness recovery on a new phone: persist the
   * recovered key locally and unlock records in the live session.
   */
  const recoverPatientKey = useCallback(
    async (patientKey: string) => {
      if (!session) return;
      await writeJson(patientKeyStorage(session.user.id), patientKey);
      const next = { ...session, patientKey };
      setSession(next);
      await writeJson(SESSION_KEY, next);
    },
    [session],
  );

  const signInWithNationalId = useCallback(
    async (qrValue: string) => {
      setSigningIn(true);
      setError(null);
      try {
        const result = await serverApi.everifyLogin(qrValue);
        if (result.registered && result.user && result.token) {
          await persistSession(result.token, result.user);
        } else if (result.ticket) {
          setPending({ identity: result.identity, ticket: result.ticket });
          setStatus('registering');
        } else {
          setError('eVerify did not return a usable identity. Please try again.');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'We could not reach eVerify.');
        throw err;
      } finally {
        setSigningIn(false);
      }
    },
    [persistSession],
  );

  const register = useCallback(
    async (input: RegisterInput) => {
      if (!pending) throw new Error('Scan your National ID first.');
      setSigningIn(true);
      setError(null);
      try {
        const { user, token } = await serverApi.register({
          ticket: pending.ticket,
          role: 'PATIENT',
          ...input,
        });
        await persistSession(token, user, { isRegistration: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Registration failed. Please try again.');
        throw err;
      } finally {
        setSigningIn(false);
      }
    },
    [pending, persistSession],
  );

  const updateUser = useCallback(
    async (user: ServerUser) => {
      if (!session) return;
      const next = { ...session, user };
      setSession(next);
      await writeJson(SESSION_KEY, next);
    },
    [session],
  );

  const signOut = useCallback(async () => {
    // The patient key mapping stays on-device so records reopen on next sign-in.
    await removeKeys([SESSION_KEY]);
    setAuthToken(null);
    setSession(null);
    setPending(null);
    setStatus('signedOut');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      pending,
      signingIn,
      error,
      signInWithNationalId,
      register,
      updateUser,
      recoverPatientKey,
      signOut,
    }),
    [
      status,
      session,
      pending,
      signingIn,
      error,
      signInWithNationalId,
      register,
      updateUser,
      recoverPatientKey,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
