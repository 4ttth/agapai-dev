import { useMemo } from 'react';

import { useAuth } from '@/hooks/useAuth';
import type { BloodType, HealthIdPayload, HealthProfile } from '@/types';

/**
 * Derives the Universal Health Profile + Health ID QR payload from the
 * signed-in AgapAI session. The QR carries the patient key so records stay
 * end-to-end encrypted: only people the patient physically shows the QR to
 * (doctor, pharmacist) can read their consultations.
 */
export function useHealthProfile() {
  const { session } = useAuth();
  const user = session?.user ?? null;

  const profile = useMemo<HealthProfile | null>(() => {
    if (!user) return null;
    const fullName = [user.firstName, user.middleName, user.lastName, user.suffix]
      .filter(Boolean)
      .join(' ');
    return {
      fullName,
      dateOfBirth: user.birthDate ?? '—',
      bloodType: (user.bloodType as BloodType) ?? 'unknown',
      allergies: user.allergies,
      conditions: user.conditions,
      emergencyContact: {
        name: user.emergencyName ?? '—',
        relationship: 'Emergency contact',
        phone: user.emergencyPhone ?? '—',
      },
    };
  }, [user]);

  const sharePayload = useMemo<HealthIdPayload | null>(() => {
    if (!user || !session?.patientKey || !profile) return null;
    return {
      v: 2,
      type: 'agapai.health-id',
      healthId: user.id,
      key: session.patientKey,
      preview: { fullName: profile.fullName, bloodType: profile.bloodType },
    };
  }, [user, session?.patientKey, profile]);

  return {
    status: profile ? ('success' as const) : ('loading' as const),
    error: null,
    profile,
    sharePayload,
    refresh: () => {},
  };
}
