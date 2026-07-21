import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { ErrorState } from '@/components/states/ErrorState';
import { LoadingState } from '@/components/states/LoadingState';
import { QrCode } from '@/components/qr';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Divider } from '@/components/ui/Divider';
import { Screen } from '@/components/ui/Screen';
import { ProfileSummary, useHealthProfile } from '@/features/health-profile';
import { useAuth } from '@/hooks/useAuth';
import { colors, radii, spacing } from '@/theme';
import { StyleSheet, View } from 'react-native';

export default function ProfileScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const { status, error, profile, sharePayload, refresh } = useHealthProfile();

  if (status === 'loading' || status === 'idle') {
    return <LoadingState message="Loading your health profile…" />;
  }

  if (status === 'error' || !profile || !sharePayload) {
    return <ErrorState message={error ?? undefined} onRetry={refresh} />;
  }

  return (
    <Screen>
      <View style={styles.shareCard} accessible accessibilityLabel="Your Health ID QR code to share with clinic staff">
        <AppText variant="section" color="inverse" center>
          Show this to your healthcare worker
        </AppText>
        <AppText variant="caption" color="inverse" center style={styles.shareHint}>
          They can scan it to see your essential health information — no paper forms.
        </AppText>
        <View style={styles.qr}>
          <QrCode
            value={JSON.stringify(sharePayload)}
            accessibilityLabel={`Health ID QR code for ${profile.fullName}`}
          />
        </View>
        {session ? (
          <AppText variant="caption" color="inverse" center>
            eGovPH Digital ID: {session.maskedId}
          </AppText>
        ) : null}
      </View>

      <View style={styles.section}>
        <ProfileSummary profile={profile} />
      </View>

      <Divider />

      <Button
        label="Scan a Health ID"
        variant="secondary"
        icon={<Ionicons name="scan" size={22} color={colors.primary} />}
        onPress={() => router.push('/scan')}
        accessibilityHint="Opens the camera to scan a patient's Health ID (for clinic staff)"
      />

      <View style={styles.signOut}>
        <Button
          label="Sign out"
          variant="ghost"
          onPress={signOut}
          fullWidth={false}
          accessibilityHint="Signs you out of AgapAI"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  shareCard: {
    backgroundColor: colors.primary,
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  shareHint: { marginBottom: spacing.sm },
  qr: { marginVertical: spacing.md },
  section: { marginTop: spacing.xl },
  signOut: { alignItems: 'center', marginTop: spacing.lg },
});
