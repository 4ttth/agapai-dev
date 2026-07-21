import { useCallback, useEffect, useMemo, useState } from 'react';

import { services } from '@/services';
import type { AsyncStatus, HealthProfile, HealthSharePayload } from '@/types';
import { createId } from '@/utils/id';

/** Loads the Universal Health Profile and derives a QR share payload. */
export function useHealthProfile() {
  const [status, setStatus] = useState<AsyncStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<HealthProfile | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const result = await services.healthProfile.get();
      setProfile(result);
      setStatus('success');
    } catch {
      setStatus('error');
      setError('We could not load your health profile. Please try again.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sharePayload = useMemo<HealthSharePayload | null>(() => {
    if (!profile) return null;
    return {
      version: 1,
      type: 'agapai.health-id',
      // Mock token; a real backend would issue a short-lived, revocable token.
      token: createId('share'),
      preview: { fullName: profile.fullName, bloodType: profile.bloodType },
    };
  }, [profile]);

  return { status, error, profile, sharePayload, refresh: load };
}
