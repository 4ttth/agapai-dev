import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { services } from '@/services';
import type { AuthStatus, EgovSession } from '@/types';

interface AuthContextValue {
  status: AuthStatus;
  session: EgovSession | null;
  signingIn: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Owns the eGovPH session lifecycle: restore on launch, sign in, sign out.
 * Consumed via the `useAuth` hook; the root layout uses `status` to gate routes.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('initializing');
  const [session, setSession] = useState<EgovSession | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    services.auth
      .restore()
      .then((restored) => {
        if (!active) return;
        setSession(restored);
        setStatus(restored ? 'signedIn' : 'signedOut');
      })
      .catch(() => {
        if (!active) return;
        setStatus('signedOut');
      });
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async () => {
    setSigningIn(true);
    setError(null);
    try {
      const next = await services.auth.signInWithEgov();
      setSession(next);
      setStatus('signedIn');
    } catch {
      setError('We could not connect to eGovPH. Please try again.');
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await services.auth.signOut();
    setSession(null);
    setStatus('signedOut');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, session, signingIn, error, signIn, signOut }),
    [status, session, signingIn, error, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
