import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { QrCode } from '@/components/qr';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { LoadingState } from '@/components/states/LoadingState';
import { ProfileSummary, useHealthProfile } from '@/features/health-profile';
import { useAuth } from '@/hooks/useAuth';
import { colors, palette, radii, spacing } from '@/theme';

/** The patient's shareable Health ID QR + profile summary. */
export default function HealthIdScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { profile, sharePayload } = useHealthProfile();

  if (!profile) {
    return <LoadingState message="Preparing your Health ID…" />;
  }

  // New phone: the consultation key hasn't been recovered yet, so we can't mint
  // a working QR. Prompt Face Liveness recovery rather than spinning forever.
  if (!sharePayload || !session?.patientKey) {
    return (
      <Screen>
        <Card style={styles.lockedCard}>
          <View style={styles.lockedIcon}>
            <Ionicons name="lock-closed" size={30} color={colors.primary} />
          </View>
          <AppText variant="title" center>
            Unlock your Health ID
          </AppText>
          <AppText variant="body" color="secondary" center>
            It looks like you&apos;re on a new phone. Pass a quick Face Liveness test to bring your
            Health ID and encrypted records onto this device. Your old phone will then stop working.
          </AppText>
          <Button
            label="Recover with Face Liveness"
            icon={<Ionicons name="happy" size={20} color={colors.onPrimary} />}
            onPress={() => router.push('/recover-records')}
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <LinearGradient
        colors={[palette.blue900, palette.blue500]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.shareCard}
      >
        <AppText variant="section" color="inverse" center>
          Show this to your doctor or pharmacist
        </AppText>
        <AppText variant="caption" color="inverse" center style={styles.hint}>
          Scanning unlocks your essential info and your encrypted records — only for the people you
          physically show this to.
        </AppText>
        <View style={styles.qrWrap}>
          <QrCode
            value={JSON.stringify(sharePayload)}
            accessibilityLabel={`Health ID QR code for ${profile.fullName}`}
          />
        </View>
        <View style={styles.secureRow}>
          <Ionicons name="lock-closed" size={14} color={palette.blue100} />
          <AppText variant="caption" color="inverse">
            End-to-end encrypted · you own this data
          </AppText>
        </View>
      </LinearGradient>

      <View style={styles.section}>
        <ProfileSummary profile={profile} />
      </View>

      <Button
        label="Scan someone's Health ID"
        variant="secondary"
        icon={<Ionicons name="scan" size={22} color={colors.primary} />}
        onPress={() => router.push('/scan')}
        accessibilityHint="Opens the camera to scan a Health ID"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  shareCard: { borderRadius: radii.xl, padding: spacing.xl, gap: spacing.md },
  hint: { opacity: 0.9 },
  qrWrap: { alignItems: 'center', marginVertical: spacing.md },
  secureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  section: { marginVertical: spacing.xl },
  lockedCard: { gap: spacing.lg, alignItems: 'center', marginTop: spacing.xxl, padding: spacing.xl },
  lockedIcon: {
    width: 72,
    height: 72,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
