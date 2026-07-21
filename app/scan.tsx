import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { QrScanner } from '@/components/qr';
import { LoadingState } from '@/components/states/LoadingState';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { ProfileSummary, useHealthProfile } from '@/features/health-profile';
import type { HealthSharePayload } from '@/types';
import { colors, radii, spacing } from '@/theme';

type ScanResult =
  | { kind: 'idle' }
  | { kind: 'valid'; payload: HealthSharePayload }
  | { kind: 'invalid' };

function parsePayload(raw: string): HealthSharePayload | null {
  try {
    const parsed = JSON.parse(raw) as Partial<HealthSharePayload> & { v?: number };
    if (parsed?.type === 'agapai.health-id' && (parsed.version === 1 || parsed.v === 2) && parsed.preview) {
      return parsed as HealthSharePayload;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Clinic-side flow: scan a patient's Health ID QR to view essential data.
 * In this phase the resolved profile is the mocked local profile; a real
 * backend would resolve the scanned token to the patient's record.
 */
export default function ScanScreen() {
  const router = useRouter();
  const [result, setResult] = useState<ScanResult>({ kind: 'idle' });
  const { status, profile } = useHealthProfile();

  const handleScanned = (data: string) => {
    const payload = parsePayload(data);
    setResult(payload ? { kind: 'valid', payload } : { kind: 'invalid' });
  };

  if (result.kind === 'idle') {
    return (
      <View style={styles.fill}>
        <View style={styles.instructions}>
          <AppText variant="body" color="secondary" center>
            Point the camera at the patient&apos;s Health ID QR code.
          </AppText>
        </View>
        <QrScanner onScanned={handleScanned} />
      </View>
    );
  }

  if (result.kind === 'invalid') {
    return (
      <Screen contentContainerStyle={styles.centered}>
        <Ionicons name="close-circle-outline" size={56} color={colors.danger} />
        <AppText variant="section" center>
          This isn&apos;t a Health ID code
        </AppText>
        <AppText variant="body" color="secondary" center>
          Please try scanning the AgapAI Health ID QR again.
        </AppText>
        <Button label="Scan again" onPress={() => setResult({ kind: 'idle' })} fullWidth={false} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.successBanner}>
        <Ionicons name="checkmark-circle" size={22} color={colors.onSuccess} />
        <AppText variant="label" color="inverse">
          Verified: {result.payload.preview.fullName} · {result.payload.preview.bloodType}
        </AppText>
      </View>

      {status === 'loading' || !profile ? (
        <LoadingState message="Loading patient record…" />
      ) : (
        <ProfileSummary profile={profile} compact />
      )}

      <View style={styles.actions}>
        <Button label="Scan another" variant="secondary" onPress={() => setResult({ kind: 'idle' })} />
        <Button label="Done" variant="ghost" onPress={() => router.back()} fullWidth={false} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  instructions: { padding: spacing.xl },
  centered: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.success,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  actions: { gap: spacing.md, marginTop: spacing.xxl, alignItems: 'center' },
});
