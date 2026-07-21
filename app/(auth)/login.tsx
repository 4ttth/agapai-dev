import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/hooks/useAuth';
import { appConfig } from '@/constants';
import { colors, radii, spacing } from '@/theme';

/**
 * Mocked eGovPH Single Sign-On entry point. Designed to feel like a native
 * part of the eGovPH SuperApp. The real SSO/Digital ID exchange plugs into the
 * same `signIn` action later with no UI change.
 */
export default function LoginScreen() {
  const { signIn, signingIn, error } = useAuth();

  return (
    <Screen background="default" contentContainerStyle={styles.container}>
      <View style={styles.hero}>
        <View style={styles.logo}>
          <Ionicons name="heart-circle" size={64} color={colors.primary} />
        </View>
        <AppText variant="title" center>
          {appConfig.appName}
        </AppText>
        <AppText variant="body" color="secondary" center style={styles.tagline}>
          {appConfig.tagline}. Sign in securely with your eGovPH Digital ID.
        </AppText>
      </View>

      <View style={styles.actions}>
        {error ? (
          <View style={styles.errorBox} accessibilityRole="alert">
            <Ionicons name="warning-outline" size={20} color={colors.danger} />
            <AppText variant="label" color="danger" style={styles.flex}>
              {error}
            </AppText>
          </View>
        ) : null}

        <Button
          label="Continue with eGovPH"
          onPress={signIn}
          loading={signingIn}
          icon={<Ionicons name="shield-checkmark" size={22} color={colors.onPrimary} />}
          accessibilityHint="Signs you in with your eGovPH Digital ID"
        />
        <AppText variant="caption" color="muted" center style={styles.disclaimer}>
          Your health information is private and protected. AgapAI only shows what you choose to
          share.
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { justifyContent: 'space-between' },
  hero: { alignItems: 'center', marginTop: spacing.xxxl, gap: spacing.lg },
  logo: {
    width: 112,
    height: 112,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagline: { marginTop: spacing.sm, paddingHorizontal: spacing.lg },
  actions: { gap: spacing.lg, marginBottom: spacing.xl },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerLight,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  flex: { flex: 1 },
  disclaimer: { paddingHorizontal: spacing.lg },
});
