import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { TextField } from '@/components/ui/Field';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/hooks/useAuth';
import { colors, radii, spacing } from '@/theme';
import type { BloodType } from '@/types';

const BLOOD_TYPES: BloodType[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'];
const ALLERGY_OPTIONS = ['Penicillin', 'Aspirin', 'Sulfa drugs', 'Seafood', 'Peanuts', 'Eggs', 'Dust', 'Pollen'];
const CONDITION_OPTIONS = [
  'Hypertension',
  'Diabetes',
  'Asthma',
  'Heart disease',
  'Kidney disease',
  'Tuberculosis',
  'Arthritis',
  'Cancer',
];

const title = (s: string) =>
  s
    .toLowerCase()
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');

function MultiSelect({
  options,
  selected,
  onToggle,
  otherValue,
  onOther,
  label,
}: {
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  otherValue: string;
  onOther: (v: string) => void;
  label: string;
}) {
  return (
    <View style={styles.group}>
      <AppText variant="label">{label}</AppText>
      <View style={styles.chips}>
        {options.map((o) => (
          <Chip key={o} label={o} selected={selected.includes(o)} onPress={() => onToggle(o)} />
        ))}
      </View>
      <TextField
        label={`Others (${label.toLowerCase()})`}
        placeholder="Separate with commas, or leave blank"
        value={otherValue}
        onChangeText={onOther}
      />
    </View>
  );
}

/** First-time registration — the answers become the patient's Health ID. */
export default function RegisterScreen() {
  const router = useRouter();
  const { pendingEgov, register, signingIn, error, status } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [suffix, setSuffix] = useState('');
  const [bloodType, setBloodType] = useState<BloodType | null>(null);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [allergyOther, setAllergyOther] = useState('');
  const [conditions, setConditions] = useState<string[]>([]);
  const [conditionOther, setConditionOther] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('+639');
  const [agreed, setAgreed] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (pendingEgov) {
      setFirstName(title(pendingEgov.first_name ?? ''));
      setMiddleName(title(pendingEgov.middle_name ?? ''));
      setLastName(title(pendingEgov.last_name ?? ''));
    }
  }, [pendingEgov]);

  useEffect(() => {
    if (status === 'signedOut') router.replace('/(auth)/login');
  }, [status, router]);

  const phoneOk = /^\+639\d{9}$/.test(emergencyPhone.trim());
  const errors = useMemo(
    () => ({
      firstName: firstName.trim() ? undefined : 'First name is required',
      lastName: lastName.trim() ? undefined : 'Last name is required',
      bloodType: bloodType ? undefined : 'Please choose your blood type',
      emergencyName: emergencyName.trim() ? undefined : 'Emergency contact name is required',
      emergencyPhone: phoneOk ? undefined : 'Use the format +639XXXXXXXXX',
      agreed: agreed ? undefined : 'Please agree to continue',
    }),
    [firstName, lastName, bloodType, emergencyName, phoneOk, agreed],
  );
  const valid = Object.values(errors).every((e) => !e);

  const toggle = (list: string[], set: (v: string[]) => void) => (v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const splitOthers = (v: string) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    try {
      await register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        middleName: middleName.trim() || undefined,
        suffix: suffix.trim() || undefined,
        bloodType: bloodType ?? undefined,
        allergies: [...allergies, ...splitOthers(allergyOther)],
        conditions: [...conditions, ...splitOthers(conditionOther)],
        emergencyName: emergencyName.trim(),
        emergencyPhone: emergencyPhone.trim(),
      });
    } catch {
      // error state is surfaced by the provider
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title">Create your Health ID</AppText>
        <AppText variant="body" color="secondary">
          One-time registration. Your eGovPH identity is verified — just complete your health
          details below.
        </AppText>
      </View>

      {error ? (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Ionicons name="warning-outline" size={20} color={colors.danger} />
          <AppText variant="label" color="danger" style={styles.flex}>
            {error}
          </AppText>
        </View>
      ) : null}

      <View style={styles.form}>
        <TextField
          label="First name"
          required
          value={firstName}
          onChangeText={setFirstName}
          error={touched ? errors.firstName : undefined}
        />
        <TextField label="Middle name" value={middleName} onChangeText={setMiddleName} />
        <TextField
          label="Last name"
          required
          value={lastName}
          onChangeText={setLastName}
          error={touched ? errors.lastName : undefined}
        />
        <TextField label="Suffix (if any)" placeholder="Jr., Sr., III…" value={suffix} onChangeText={setSuffix} />

        <View style={styles.group}>
          <AppText variant="label">Blood type *</AppText>
          <View style={styles.chips}>
            {BLOOD_TYPES.map((b) => (
              <Chip
                key={b}
                label={b === 'unknown' ? "Don't know" : b}
                selected={bloodType === b}
                onPress={() => setBloodType(b)}
              />
            ))}
          </View>
          {touched && errors.bloodType ? (
            <AppText variant="caption" color="danger">
              {errors.bloodType}
            </AppText>
          ) : null}
        </View>

        <MultiSelect
          label="Allergies"
          options={ALLERGY_OPTIONS}
          selected={allergies}
          onToggle={toggle(allergies, setAllergies)}
          otherValue={allergyOther}
          onOther={setAllergyOther}
        />

        <MultiSelect
          label="Existing conditions"
          options={CONDITION_OPTIONS}
          selected={conditions}
          onToggle={toggle(conditions, setConditions)}
          otherValue={conditionOther}
          onOther={setConditionOther}
        />

        <TextField
          label="Emergency contact — full name"
          required
          value={emergencyName}
          onChangeText={setEmergencyName}
          error={touched ? errors.emergencyName : undefined}
        />
        <TextField
          label="Emergency contact — mobile number"
          required
          keyboardType="phone-pad"
          value={emergencyPhone}
          onChangeText={setEmergencyPhone}
          hint="Philippine mobile format: +639XXXXXXXXX"
          error={touched ? errors.emergencyPhone : undefined}
        />

        <Pressable
          onPress={() => setAgreed((a) => !a)}
          style={styles.agreeRow}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreed }}
          accessibilityLabel="Agree to the Privacy Policy and Terms and Conditions"
        >
          <Ionicons
            name={agreed ? 'checkbox' : 'square-outline'}
            size={28}
            color={agreed ? colors.primary : colors.textMuted}
          />
          <AppText variant="body" style={styles.flex}>
            I agree to the{' '}
            <AppText variant="body" color="accent" onPress={() => router.push('/privacy')}>
              Privacy Policy
            </AppText>{' '}
            and{' '}
            <AppText variant="body" color="accent" onPress={() => router.push('/terms')}>
              Terms &amp; Conditions
            </AppText>
            .
          </AppText>
        </Pressable>
        {touched && errors.agreed ? (
          <AppText variant="caption" color="danger">
            {errors.agreed}
          </AppText>
        ) : null}

        <Button
          label="Create my Health ID"
          onPress={() => void submit()}
          loading={signingIn}
          icon={<Ionicons name="id-card" size={22} color={colors.onPrimary} />}
          accessibilityHint="Completes registration and creates your Health ID"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.xl },
  form: { gap: spacing.xl },
  group: { gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  agreeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48 },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.dangerLight,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  flex: { flex: 1 },
});
