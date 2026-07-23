import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FaceLivenessModal } from '@/lib/FaceLivenessModal';
import { useSession } from '@/lib/SessionContext';
import { colors, radii, spacing } from '@/lib/theme';
import { Banner, Btn, Card, T } from '@/lib/ui';
import type { Role } from '@/lib/api';

/**
 * Real eGov verification sign-in: scan your National ID (eVerify), then a
 * one-time role registration. Names come from the government record only.
 */
export default function LoginScreen() {
  const router = useRouter();
  const { registerPro, pending, session } = useSession();
  const [role, setRole] = useState<Role>('DOCTOR');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [livenessOpen, setLivenessOpen] = useState(false);

  // eVerify has already confirmed the identity; Face Liveness now confirms a
  // real, live person is present before the professional account is created.
  const onLivenessResult = async (token: string | null) => {
    setLivenessOpen(false);
    if (!token) return; // cancelled
    setBusy(true);
    try {
      await registerPro(role, token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setBusy(false);
    }
  };

  if (session) {
    router.replace(session.user.role === 'PHARMACIST' ? '/pharmacist' : '/doctor');
    return null;
  }

  const identity = pending?.identity;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.scroll, { paddingTop: 60 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.hero}>
        <View style={styles.logo}>
          <Image
            source={require('@/assets/icon.png')}
            style={styles.logoImage}
            accessibilityLabel="AgapAI Pro logo"
            resizeMode="contain"
          />
        </View>
        <T size={30} weight="800" center>
          AgapAI Pro
        </T>
        <T size={16} color={colors.textSecondary} center>
          For licensed doctors and pharmacists. Verify with your Philippine National ID.
        </T>
      </View>

      {error ? <Banner text={error} tone="danger" /> : null}

      {!identity ? (
        <Card style={styles.card}>
          <Btn label="Verify with my National ID" onPress={() => router.push('/scan-login')} />
          <View style={styles.privacyRow}>
            <Ionicons name="lock-closed" size={13} color={colors.textMuted} />
            <T size={12} color={colors.textMuted}>
              eVerify (PhilSys) confirms your identity — nothing is typed by hand.
            </T>
          </View>
        </Card>
      ) : (
        <Card style={styles.card}>
          <View style={styles.identityRow}>
            <View style={styles.identityIcon}>
              <Ionicons name="shield-checkmark" size={22} color={colors.onPrimary} />
            </View>
            <View style={styles.flex}>
              <T size={17} weight="700">
                {[identity.firstName, identity.middleName, identity.lastName, identity.suffix]
                  .filter(Boolean)
                  .join(' ')}
              </T>
              <T size={13} color={colors.success}>
                Verified via eVerify ✓
              </T>
            </View>
          </View>
          <T size={14} color={colors.textSecondary}>
            One-time registration: choose your profession, then pass a quick Face Liveness test to
            confirm you&apos;re really you. An administrator will verify your PRC license before you
            can upload or dispense.
          </T>
          <View style={styles.roleRow}>
            {(
              [
                ['DOCTOR', 'Doctor', 'medical'],
                ['PHARMACIST', 'Pharmacist', 'flask'],
              ] as Array<[Role, string, keyof typeof Ionicons.glyphMap]>
            ).map(([r, label, icon]) => (
              <Pressable
                key={r}
                onPress={() => setRole(r)}
                style={[styles.roleBtn, role === r && styles.roleActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: role === r }}
              >
                <Ionicons name={icon} size={26} color={role === r ? colors.onPrimary : colors.primary} />
                <T size={15} weight="700" color={role === r ? colors.onPrimary : colors.text}>
                  {label}
                </T>
              </Pressable>
            ))}
          </View>
          <Btn
            label="Continue to Face Liveness"
            onPress={() => {
              setError(null);
              setLivenessOpen(true);
            }}
            loading={busy}
          />
        </Card>
      )}

      <FaceLivenessModal
        visible={livenessOpen}
        purpose="pro-register"
        onResult={(token) => void onLivenessResult(token)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceMuted },
  scroll: { padding: spacing.xl, gap: spacing.xl, paddingBottom: spacing.xxl },
  hero: { alignItems: 'center', gap: spacing.md, marginBottom: spacing.md },
  logo: {
    width: 84,
    height: 84,
    borderRadius: radii.pill,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: { width: 68, height: 68 },
  card: { gap: spacing.lg },
  privacyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  identityIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  roleRow: { flexDirection: 'row', gap: spacing.md },
  roleBtn: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  roleActive: { backgroundColor: colors.primary, borderColor: colors.primary },
});
