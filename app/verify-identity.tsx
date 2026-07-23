import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { QrScanner } from '@/components/qr';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { FaceLivenessModal } from '@/components/FaceLivenessModal';
import { useAuth } from '@/hooks/useAuth';
import { serverApi } from '@/services/api/server';
import { colors, radii, spacing } from '@/theme';

type Phase = 'intro' | 'scanning' | 'verifying' | 'done' | 'failed';

/**
 * One-time eVerify (PhilSys National ID) check that unlocks editing personal
 * information. The QR value goes to the AgapAI server, which calls the eVerify
 * QR-check API; the ID itself is never stored.
 */
export default function VerifyIdentityScreen() {
  const router = useRouter();
  const { session, updateUser } = useAuth();
  const [phase, setPhase] = useState<Phase>('intro');
  const [message, setMessage] = useState<string | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [livenessOpen, setLivenessOpen] = useState(false);

  const onScanned = useCallback(
    async (value: string) => {
      setPhase('verifying');
      try {
        const result = await serverApi.everifyQrCheck(value);
        setScore(result.score);
        const { user } = await serverApi.me();
        await updateUser(user);
        setPhase('done');
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Verification failed.');
        setPhase('failed');
      }
    },
    [updateUser],
  );

  const onLivenessResult = useCallback(
    async (token: string | null) => {
      setLivenessOpen(false);
      if (!token) return; // cancelled
      setPhase('verifying');
      try {
        const result = await serverApi.livenessUnlock(token);
        setScore(result.score);
        const { user } = await serverApi.me();
        await updateUser(user);
        setPhase('done');
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Face Liveness verification failed.');
        setPhase('failed');
      }
    },
    [updateUser],
  );

  return (
    <View style={styles.root}>
      {phase === 'intro' ? (
        <View style={styles.center}>
          <View style={styles.iconWrap}>
            <Ionicons name="id-card" size={44} color={colors.primary} />
          </View>
          <AppText variant="title" center>
            Verify with your National ID
          </AppText>
          <AppText variant="body" color="secondary" center>
            Scan the QR code on your Philippine National ID (PhilSys). AgapAI sends only the QR
            value to eVerify — your ID photo is never uploaded or stored.
          </AppText>
          <Button
            label="Scan my National ID QR"
            icon={<Ionicons name="scan" size={22} color={colors.onPrimary} />}
            onPress={() => setPhase('scanning')}
          />
          <AppText variant="caption" color="muted" center>
            On a new phone? Use Face Liveness instead — no National ID needed.
          </AppText>
          <Button
            label="Verify with Face Liveness"
            variant="secondary"
            icon={<Ionicons name="happy" size={22} color={colors.primary} />}
            onPress={() => setLivenessOpen(true)}
          />
          <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
        </View>
      ) : phase === 'scanning' ? (
        <View style={styles.scanWrap}>
          <QrScanner onScanned={(v) => void onScanned(v)} />
          <AppText variant="body" color="secondary" center style={styles.scanHint}>
            Point the camera at the QR on the back of your National ID.
          </AppText>
        </View>
      ) : phase === 'verifying' ? (
        <View style={styles.center}>
          <Ionicons name="shield-half" size={44} color={colors.primary} />
          <AppText variant="section" center>
            Checking with eVerify…
          </AppText>
        </View>
      ) : phase === 'done' ? (
        <View style={styles.center}>
          <Ionicons name="checkmark-circle" size={64} color={colors.success} />
          <AppText variant="title" center>
            Identity verified!
          </AppText>
          <AppText variant="body" color="secondary" center>
            {session?.user.firstName}, your National ID matched your Health ID
            {score != null ? ` at ${score}%` : ''} — you can now edit your personal information.
          </AppText>
          <Button label="Edit my information" onPress={() => router.replace('/edit-profile')} />
        </View>
      ) : (
        <View style={styles.center}>
          <Ionicons name="close-circle" size={64} color={colors.danger} />
          <AppText variant="title" center>
            Verification failed
          </AppText>
          <AppText variant="body" color="secondary" center>
            {message ?? 'The QR could not be verified.'}
          </AppText>
          <Button label="Try again" onPress={() => setPhase('scanning')} />
          <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
        </View>
      )}

      <FaceLivenessModal
        visible={livenessOpen}
        purpose="edit-unlock"
        onResult={(token) => void onLivenessResult(token)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: spacing.lg,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanWrap: { flex: 1, padding: spacing.xl, gap: spacing.lg },
  scanHint: { paddingBottom: spacing.xl },
});
