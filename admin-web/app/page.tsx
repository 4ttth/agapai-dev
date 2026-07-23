'use client';

import { useEffect, useState } from 'react';

import { getAdminKey } from '@/lib/api';
import { Dashboard } from '@/components/dashboard';
import { LoginGate } from '@/components/login-gate';

export default function Page() {
  // Avoid hydration mismatch: decide auth state only after mount (localStorage).
  const [mounted, setMounted] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    setAuthed(!!getAdminKey());
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return authed ? (
    <Dashboard onSignOut={() => setAuthed(false)} />
  ) : (
    <LoginGate onAuthed={() => setAuthed(true)} />
  );
}
