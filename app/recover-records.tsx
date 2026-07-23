import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/hooks/useAuth';
import { serverApi } from '@/services/api/server';
import { colors, radii, spacing } from '@/theme';
import { getDeviceId, runFaceLiveness } from '@/utils/liveness';

type Phase = 'intro' | 'running' | 'done' | 'failed';

/**
 * New-phone record recovery. Face Liveness is the master key: once the patient
 * proves they're a live person, the server releases the escrowed consultation
 * key to THIS phone and retires the old one.
 */
export default function RecoverRecordsScreen() {
  const router = useRouter();
  const { recoverPatientKey } = useAuth();
  const [phase, setPhase] = useState<Phase>('intro');
  const [message, setMessage] = useState<string | null>(null);

  const run = async () => {
    setPhase('running');
    setMessage(null);
    const live = await runFaceLiveness('key-recovery');
    if (!live.ok) {
      if (live.reason === 'cancelled') return setPhase('intro');
      setMessage(live.message ?? 'Face Liveness could not start.');
      return setPhase('failed');
    }
    try {
      const deviceId = await getDeviceId();
      const { patientKey } = await serverApi.recoverKey(live.token, deviceId);
      await recoverPatientKey(patientKey);
      setPhase('done');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Recovery failed. Please try again.');
      setPhase('failed');
    }
  };

  return (
    <View style={styles.root}>
      {phase === 'done' ? (
        <View style={styles.center}>
          <Ionicons name="lock-open" size={64} color={colors.success} />
          <AppText variant="title" center>
            Records unlocked
          </AppText>
          <AppText variant="body" color="secondary" center>
            Your consultation history is now readable on this phone. Your previous phone can no
            longer open these records.
          </AppText>
          <Button label="Back to my records" onPress={() => router.replace('/(tabs)/records')} />
        </View>
      ) : (
        <View style={styles.center}>
          <View style={styles.iconWrap}>
            <Ionicons name="scan-circle" size={52} color={colors.primary} />
          </View>
          <AppText variant="title" center>
            Recover your records
          </AppText>
          <Card style={styles.card}>
            <AppText variant="body" color="secondary">
              Your consultations are end-to-end encrypted. On a new phone, a quick Face Liveness
              test acts as your master key — it releases your records to this device.
            </AppText>
            <View style={styles.noteRow}>
              <Ionicons name="phone-portrait" size={16} color={colors.warning} />
              <AppText variant="caption" color="secondary" style={styles.flex}>
                Your old phone will stop being able to open these records once this phone takes over.
              </AppText>
            </View>
          </Card>
          {message ? (
            <AppText variant="caption" color="danger" center>
              {message}
            </AppText>
          ) : null}
          <Button
            label={phase === 'running' ? 'Waiting for Face Liveness…' : 'Start Face Liveness test'}
            loading={phase === 'running'}
            icon={<Ionicons name="happy" size={20} color={colors.onPrimary} />}
            onPress={() => void run()}
          />
          <Button label="Not now" variant="ghost" onPress={() => router.back()} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.lg },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { gap: spacing.md, width: '100%' },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flex: { flex: 1 },
});
