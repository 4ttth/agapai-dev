import { useContext } from 'react';

import { AuthContext } from '@/providers/AuthProvider';

/** Access the eGovPH auth session and actions. Must be used within AuthProvider. */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return ctx;
}
