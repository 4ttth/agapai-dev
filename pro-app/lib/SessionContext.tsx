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

interface SsoResult {
  registered: boolean;
  user?: ProUser;
  token?: string;
  egovProfile: { uniqid: string; first_name: string; last_name: string };
}

interface Ctx {
  ready: boolean;
  session: Session | null;
  /** eGov identity verified but not yet registered in AgapAI. */
  pendingEgov: SsoResult['egovProfile'] | null;
  signIn: (seed: string) => Promise<void>;
  registerPro: (role: Role, firstName: string, lastName: string) => Promise<void>;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionCtx = createContext<Ctx | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [pendingEgov, setPendingEgov] = useState<SsoResult['egovProfile'] | null>(null);

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

  const signIn = useCallback(async (seed: string) => {
    const result = await api<SsoResult>('/auth/mock-sso', { body: { seed: `pro-${seed}` } });
    if (result.registered && result.user && result.token) {
      const s = { token: result.token, user: result.user };
      await saveSession(s);
      setSession(s);
    } else {
      setPendingEgov(result.egovProfile);
    }
  }, []);

  const registerPro = useCallback(
    async (role: Role, firstName: string, lastName: string) => {
      const { user, token } = await api<{ user: ProUser; token: string }>('/auth/register', {
        body: { role, firstName, lastName, egovUniqid: pendingEgov?.uniqid },
      });
      const s = { token, user };
      await saveSession(s);
      setSession(s);
      setPendingEgov(null);
    },
    [pendingEgov],
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
    setPendingEgov(null);
  }, []);

  const value = useMemo(
    () => ({ ready, session, pendingEgov, signIn, registerPro, refresh, signOut }),
    [ready, session, pendingEgov, signIn, registerPro, refresh, signOut],
  );

  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession(): Ctx {
  const ctx = useContext(SessionCtx);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
