import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { QrScanner } from '@/components/qr';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { colors, spacing } from '@/theme';

type Phase = 'scan' | 'checking' | 'failed';

/** Sign-in via real eGov verification: scan the National ID QR → eVerify. */
export default function ScanIdScreen() {
  const router = useRouter();
  const { signInWithNationalId, status } = useAuth();
  const [phase, setPhase] = useState<Phase>('scan');
  const [message, setMessage] = useState<string | null>(null);
  const [scanKey, setScanKey] = useState(0);

  const onScanned = useCallback(
    async (value: string) => {
      setPhase('checking');
      try {
        await signInWithNationalId(value);
        // Route guard takes over: registered → tabs, first-timer → registration.
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Verification failed.');
        setPhase('failed');
      }
    },
    [signInWithNationalId],
  );

  if (status === 'signedIn' || status === 'registering') return null;

  if (phase === 'checking') {
    return (
      <View style={styles.center}>
        <Ionicons name="shield-half" size={48} color={colors.primary} />
        <AppText variant="section" center>
          Checking with eVerify…
        </AppText>
        <AppText variant="body" color="secondary" center>
          Confirming your identity with PhilSys. This takes a few seconds.
        </AppText>
      </View>
    );
  }

  if (phase === 'failed') {
    return (
      <View style={styles.center}>
        <Ionicons name="close-circle" size={56} color={colors.danger} />
        <AppText variant="section" center>
          Verification failed
        </AppText>
        <AppText variant="body" color="secondary" center>
          {message ?? 'Please try again.'}
        </AppText>
        <Button
          label="Scan again"
          onPress={() => {
            setScanKey((k) => k + 1);
            setPhase('scan');
          }}
        />
        <Button label="Back" variant="ghost" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.instructions}>
        <AppText variant="body" color="secondary" center>
          Point the camera at the QR code on the back of your Philippine National ID.
        </AppText>
      </View>
      <QrScanner key={scanKey} onScanned={(v) => void onScanned(v)} />
      <View style={styles.privacyRow}>
        <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
        <AppText variant="caption" color="muted">
          Only the QR value is sent to eVerify. No photo of your ID is stored.
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  instructions: { padding: spacing.xl },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    padding: spacing.lg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.lg,
    backgroundColor: colors.background,
  },
});
