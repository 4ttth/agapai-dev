import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { TextField } from '@/components/ui/Field';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/hooks/useAuth';
import { colors, radii, spacing } from '@/theme';
import type { BloodType } from '@/types';

const BLOOD_TYPES: BloodType[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'];
const GENDERS = ['Male', 'Female', 'Prefer not to say'];
const PRONOUN_OPTIONS = ['he/him', 'she/her', 'they/them'];
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

/**
 * First-time registration. Identity (name, birth date) is locked to what
 * eVerify returned from the National ID — only health details are asked.
 */
export default function RegisterScreen() {
  const router = useRouter();
  const { pending, register, signingIn, error, status } = useAuth();
  const identity = pending?.identity;

  const [bloodType, setBloodType] = useState<BloodType | null>(null);
  const [gender, setGender] = useState<string | null>(null);
  const [genderOther, setGenderOther] = useState('');
  const [pronouns, setPronouns] = useState<string | null>(null);
  const [pronounsOther, setPronounsOther] = useState('');
  const [allergies, setAllergies] = useState<string[]>([]);
  const [allergyOther, setAllergyOther] = useState('');
  const [conditions, setConditions] = useState<string[]>([]);
  const [conditionOther, setConditionOther] = useState('');
  const [mobile, setMobile] = useState('+639');
  // True once eVerify supplies a valid mobile number: it comes from the
  // National ID and must not be edited on the registration field.
  const [mobileLocked, setMobileLocked] = useState(false);
  const [mobile2, setMobile2] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('+639');
  const [agreed, setAgreed] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (status === 'signedOut') router.replace('/(auth)/login');
  }, [status, router]);

  useEffect(() => {
    if (identity?.bloodType) {
      const match = BLOOD_TYPES.find((b) => b.toLowerCase() === identity.bloodType?.toLowerCase());
      if (match) setBloodType(match);
    }
    if (identity?.mobile) {
      const m = identity.mobile.replace(/^0/, '+63').replace(/^63/, '+63');
      if (/^\+639\d{9}$/.test(m)) {
        setMobile(m);
        setMobileLocked(true);
      }
    }
    // eVerify carries a sex marker; it seeds gender but never pronouns, which
    // are always the patient's own choice.
    if (identity?.gender) {
      const g = GENDERS.find((x) => x.toLowerCase() === identity.gender?.toLowerCase());
      if (g) setGender(g);
      else setGenderOther(identity.gender);
    }
  }, [identity]);

  const phoneOk = /^\+639\d{9}$/.test(emergencyPhone.trim());
  const mobileOk = /^\+639\d{9}$/.test(mobile.trim());
  // A typed "other" value always wins over the chip selection.
  const genderValue = genderOther.trim() || gender || '';
  const pronounsValue = pronounsOther.trim() || pronouns || '';
  const errors = useMemo(
    () => ({
      bloodType: bloodType ? undefined : 'Please choose your blood type',
      gender: genderValue ? undefined : 'Please choose your gender',
      pronouns: pronounsValue ? undefined : 'Please choose the pronouns we should use for you',
      mobile: mobileOk ? undefined : 'Use the format +639XXXXXXXXX',
      emergencyName: emergencyName.trim() ? undefined : 'Emergency contact name is required',
      emergencyPhone: phoneOk ? undefined : 'Use the format +639XXXXXXXXX',
      agreed: agreed ? undefined : 'Please agree to continue',
    }),
    [bloodType, genderValue, pronounsValue, mobileOk, emergencyName, phoneOk, agreed],
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
        bloodType: bloodType ?? undefined,
        gender: genderValue,
        pronouns: pronounsValue,
        allergies: [...allergies, ...splitOthers(allergyOther)],
        conditions: [...conditions, ...splitOthers(conditionOther)],
        mobile: mobile.trim(),
        mobile2: mobile2.trim() || undefined,
        emergencyName: emergencyName.trim(),
        emergencyPhone: emergencyPhone.trim(),
      });
    } catch {
      // error state is surfaced by the provider
    }
  };

  if (!identity) return null;

  const fullName = [identity.firstName, identity.middleName, identity.lastName, identity.suffix]
    .filter(Boolean)
    .join(' ');

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title">Create your Health ID</AppText>
        <AppText variant="body" color="secondary">
          Your identity is confirmed by eVerify — just complete your health details below.
        </AppText>
      </View>

      <Card style={styles.identityCard}>
        <View style={styles.identityRow}>
          <View style={styles.identityIcon}>
            <Ionicons name="shield-checkmark" size={24} color={colors.onPrimary} />
          </View>
          <View style={styles.flex}>
            <AppText variant="section">{fullName}</AppText>
            <AppText variant="caption" color="secondary">
              {identity.birthDate ? `Born ${identity.birthDate} · ` : ''}from your National ID
            </AppText>
          </View>
        </View>
        <Badge label="Verified via eVerify (PhilSys)" tone="success" />
      </Card>

      {error ? (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Ionicons name="warning-outline" size={20} color={colors.danger} />
          <AppText variant="label" color="danger" style={styles.flex}>
            {error}
          </AppText>
        </View>
      ) : null}

      <View style={styles.form}>
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

        <View style={styles.group}>
          <AppText variant="label">Gender *</AppText>
          <View style={styles.chips}>
            {GENDERS.map((g) => (
              <Chip
                key={g}
                label={g}
                selected={!genderOther.trim() && gender === g}
                onPress={() => {
                  setGender(g);
                  setGenderOther('');
                }}
              />
            ))}
          </View>
          <TextField
            label="Or type your own (gender)"
            placeholder="Leave blank to use the choice above"
            value={genderOther}
            onChangeText={setGenderOther}
          />
          {touched && errors.gender ? (
            <AppText variant="caption" color="danger">
              {errors.gender}
            </AppText>
          ) : null}
        </View>

        <View style={styles.group}>
          <AppText variant="label">Your pronouns *</AppText>
          <AppText variant="caption" color="secondary">
            The AgapAI assistant will use these when it talks about you.
          </AppText>
          <View style={styles.chips}>
            {PRONOUN_OPTIONS.map((p) => (
              <Chip
                key={p}
                label={p}
                selected={!pronounsOther.trim() && pronouns === p}
                onPress={() => {
                  setPronouns(p);
                  setPronounsOther('');
                }}
              />
            ))}
          </View>
          <TextField
            label="Or type your own (pronouns)"
            placeholder="e.g. ze/zir — leave blank to use the choice above"
            value={pronounsOther}
            onChangeText={setPronounsOther}
          />
          {touched && errors.pronouns ? (
            <AppText variant="caption" color="danger">
              {errors.pronouns}
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
          label="Your mobile number"
          required
          keyboardType="phone-pad"
          value={mobile}
          onChangeText={setMobile}
          editable={!mobileLocked}
          hint={
            mobileLocked
              ? 'From your National ID (eVerify) — used for SMS medication reminders. This number cannot be changed.'
              : 'Used for SMS medication reminders (+639XXXXXXXXX)'
          }
          error={touched && !mobileLocked ? errors.mobile : undefined}
        />
        <TextField
          label="Second mobile number (optional)"
          keyboardType="phone-pad"
          value={mobile2}
          onChangeText={setMobile2}
          hint="eMessage reminders are also sent here — e.g. a caregiver's number"
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
  header: { gap: spacing.sm, marginBottom: spacing.lg },
  identityCard: { gap: spacing.md, marginBottom: spacing.lg },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  identityIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
