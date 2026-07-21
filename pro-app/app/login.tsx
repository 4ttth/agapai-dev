import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSession } from '@/lib/SessionContext';
import { colors, radii, spacing } from '@/lib/theme';
import { Banner, Btn, Card, T } from '@/lib/ui';
import type { Role } from '@/lib/api';

/** eGov SSO sign-in + one-time professional registration (then admin verification). */
export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signIn, registerPro, pendingEgov, session } = useSession();
  const [seed, setSeed] = useState('');
  const [role, setRole] = useState<Role>('DOCTOR');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn(seed.trim() || 'demo');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach eGov SSO.');
    } finally {
      setBusy(false);
    }
  };

  const doRegister = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setError('First name and last name are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await registerPro(role, firstName.trim(), lastName.trim());
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

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xxl }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.hero}>
        <View style={styles.logo}>
          <Ionicons name="medkit" size={40} color={colors.onPrimary} />
        </View>
        <T size={30} weight="800" center>
          AgapAI Pro
        </T>
        <T size={16} color={colors.textSecondary} center>
          For licensed doctors and pharmacists. Sign in with your eGovPH identity.
        </T>
      </View>

      {error ? <Banner text={error} tone="danger" /> : null}

      {!pendingEgov ? (
        <Card style={styles.card}>
          <T size={14} weight="600" color={colors.textSecondary}>
            eGovPH demo identity
          </T>
          <TextInput
            value={seed}
            onChangeText={setSeed}
            placeholder="e.g. drsantos"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            style={styles.input}
          />
          <Btn label="Continue with eGovPH" onPress={() => void doSignIn()} loading={busy} />
        </Card>
      ) : (
        <Card style={styles.card}>
          <T size={18} weight="700">
            One-time registration
          </T>
          <T size={14} color={colors.textSecondary}>
            eGov identity verified. Choose your profession — an administrator will verify your PRC
            license before you can upload or dispense.
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
          <TextInput
            value={firstName}
            onChangeText={setFirstName}
            placeholder="First name"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <TextInput
            value={lastName}
            onChangeText={setLastName}
            placeholder="Last name"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
          />
          <Btn label="Register" onPress={() => void doRegister()} loading={busy} />
        </Card>
      )}
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
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { gap: spacing.lg },
  input: {
    fontSize: 17,
    color: colors.text,
    minHeight: 54,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
  },
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
