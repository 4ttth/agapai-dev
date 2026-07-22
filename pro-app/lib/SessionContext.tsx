import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { api, loadSession, saveSession, type ProUser, type Role, type Session } from './api';

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
  registerPro: (role: Role) => Promise<void>;
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

  const signIn = useCallback(async (qrValue: string) => {
    const result = await api<EverifyLoginResult>('/auth/everify-login', {
      body: { value: qrValue },
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
    async (role: Role) => {
      if (!pending) throw new Error('Scan your National ID first.');
      const { user, token } = await api<{ user: ProUser; token: string }>('/auth/register', {
        body: { role, ticket: pending.ticket },
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
