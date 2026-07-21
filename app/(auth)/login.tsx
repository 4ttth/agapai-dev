import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/hooks/useAuth';
import { appConfig } from '@/constants';
import { colors, layout, palette, radii, spacing, typography } from '@/theme';

const FEATURES = [
  { icon: 'medkit' as const, label: 'Medication reminders' },
  { icon: 'document-text' as const, label: 'Private health records' },
  { icon: 'chatbubbles' as const, label: 'AI health assistant' },
];

/**
 * eGovPH Single Sign-On entry point. Demo mode uses the same server flow and
 * response shape as the live SSO exchange.
 */
export default function LoginScreen() {
  const router = useRouter();
  const { signInWithEgov, signingIn, error, status } = useAuth();
  const [seed, setSeed] = useState('');
  const fade = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(rise, { toValue: 0, useNativeDriver: true, damping: 14 }),
    ]).start();
  }, [fade, rise]);

  useEffect(() => {
    if (status === 'registering') router.push('/(auth)/register');
  }, [status, router]);

  return (
    <Screen edgeToEdge contentContainerStyle={styles.container}>
      <LinearGradient
        colors={[palette.blue900, palette.blue700, palette.blue500]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <Animated.View style={[styles.heroInner, { opacity: fade, transform: [{ translateY: rise }] }]}>
          <View style={styles.logo}>
            <Ionicons name="heart" size={44} color={colors.primary} />
          </View>
          <AppText variant="title" color="inverse" center style={styles.appName}>
            {appConfig.appName}
          </AppText>
          <AppText variant="body" color="inverse" center style={styles.tagline}>
            {appConfig.tagline} — powered by eGovPH
          </AppText>
          <View style={styles.features}>
            {FEATURES.map((f) => (
              <View key={f.label} style={styles.feature}>
                <Ionicons name={f.icon} size={18} color={palette.blue100} />
                <AppText variant="caption" color="inverse">
                  {f.label}
                </AppText>
              </View>
            ))}
          </View>
        </Animated.View>
      </LinearGradient>

      <Animated.View style={[styles.actions, { opacity: fade }]}>
        {error ? (
          <View style={styles.errorBox} accessibilityRole="alert">
            <Ionicons name="warning-outline" size={20} color={colors.danger} />
            <AppText variant="label" color="danger" style={styles.flex}>
              {error}
            </AppText>
          </View>
        ) : null}

        <View>
          <AppText variant="label" style={styles.inputLabel}>
            eGovPH demo identity
          </AppText>
          <TextInput
            value={seed}
            onChangeText={setSeed}
            placeholder="e.g. juan (any nickname)"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            style={styles.input}
            accessibilityLabel="eGovPH demo identity"
          />
        </View>

        <Button
          label="Continue with eGovPH"
          onPress={() => void signInWithEgov(seed.trim() || 'demo')}
          loading={signingIn}
          icon={<Ionicons name="shield-checkmark" size={22} color={colors.onPrimary} />}
          accessibilityHint="Signs you in with your eGovPH Digital ID"
        />
        <AppText variant="caption" color="muted" center style={styles.disclaimer}>
          eGov SSO verifies your identity, then AgapAI checks for your Health ID. First time here?
          You&apos;ll register once.
        </AppText>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { justifyContent: 'space-between', paddingTop: 0 },
  hero: {
    borderBottomLeftRadius: radii.xl * 1.5,
    borderBottomRightRadius: radii.xl * 1.5,
    paddingTop: spacing.xxxl + spacing.xl,
    paddingBottom: spacing.xxl,
    paddingHorizontal: layout.screenPadding,
  },
  heroInner: { alignItems: 'center', gap: spacing.md },
  logo: {
    width: 96,
    height: 96,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  appName: { marginTop: spacing.sm },
  tagline: { opacity: 0.9 },
  features: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.lg, flexWrap: 'wrap', justifyContent: 'center' },
  feature: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  actions: { gap: spacing.lg, padding: layout.screenPadding, paddingBottom: spacing.xxl },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerLight,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  flex: { flex: 1 },
  inputLabel: { marginBottom: spacing.sm },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    minHeight: layout.buttonHeight,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
  },
  disclaimer: { paddingHorizontal: spacing.lg },
});
