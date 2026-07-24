import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { Platform } from 'react-native';

import { api, followUpApi, loadSession, saveSession, type ProUser, type Role, type Session } from './api';
import { getDeviceKeyPair } from './followupKeys';
import { registerForPushToken } from './notifications';

export interface VerifiedIdentity {
  uniqid: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  suffix?: string | null;
  birthDate?: string | null;
}

interface EverifyLoginResult {
  registered: boolean;
  identity: VerifiedIdentity;
  user?: ProUser;
  token?: string;
  ticket?: string;
}

interface Ctx {
  ready: boolean;
  session: Session | null;
  /** eVerify-confirmed identity awaiting one-time professional registration. */
  pending: { identity: VerifiedIdentity; ticket: string } | null;
  /** Real eGov verification: sign in by scanning the National ID QR. */
  signIn: (qrValue: string) => Promise<void>;
  registerPro: (role: Role, livenessToken: string) => Promise<void>;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionCtx = createContext<Ctx | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [pending, setPending] = useState<Ctx['pending']>(null);

  useEffect(() => {
    loadSession().then((s) => {
      setSession(s);
      setReady(true);
      if (s) {
        api<{ user: ProUser }>('/users/me')
          .then(({ user }) => {
            const next = { ...s, user };
            setSession(next);
            void saveSession(next);
          })
          .catch(() => {});
      }
    });
  }, []);

  // Publish this device's follow-up public key so patients can seal a thread key
  // to it. Best-effort and idempotent; retried whenever the session id changes.
  useEffect(() => {
    if (!session?.user?.id) return;
    let active = true;
    getDeviceKeyPair()
      .then(({ publicKey }) => {
        if (active && session.user.publicKey !== publicKey) void followUpApi.publishPublicKey(publicKey).catch(() => {});
      })
      .catch(() => {});
    // Register a push token so a patient's follow-up call rings in the background.
    void registerForPushToken()
      .then((token) => {
        if (active && token) void followUpApi.publishPushToken(token, Platform.OS).catch(() => {});
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [session?.user?.id, session?.user?.publicKey]);

  const signIn = useCallback(async (qrValue: string) => {
    // scope PRO: resolve this National ID's professional account, not the
    // Health ID the same person may hold in the patient app.
    const result = await api<EverifyLoginResult>('/auth/everify-login', {
      body: { value: qrValue, scope: 'PRO' },
      timeoutMs: 30000,
    });
    if (result.registered && result.user && result.token) {
      const s = { token: result.token, user: result.user };
      await saveSession(s);
      setSession(s);
    } else if (result.ticket) {
      setPending({ identity: result.identity, ticket: result.ticket });
    } else {
      throw new Error('eVerify did not return a usable identity.');
    }
  }, []);

  const registerPro = useCallback(
    async (role: Role, livenessToken: string) => {
      if (!pending) throw new Error('Scan your National ID first.');
      const { user, token } = await api<{ user: ProUser; token: string }>('/auth/register', {
        body: { role, ticket: pending.ticket, livenessToken },
      });
      const s = { token, user };
      await saveSession(s);
      setSession(s);
      setPending(null);
    },
    [pending],
  );

  const refresh = useCallback(async () => {
    if (!session) return;
    const { user } = await api<{ user: ProUser }>('/users/me');
    const next = { ...session, user };
    setSession(next);
    await saveSession(next);
  }, [session]);

  const signOut = useCallback(async () => {
    await saveSession(null);
    setSession(null);
    setPending(null);
  }, []);

  const value = useMemo(
    () => ({ ready, session, pending, signIn, registerPro, refresh, signOut }),
    [ready, session, pending, signIn, registerPro, refresh, signOut],
  );

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession(): Ctx {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
