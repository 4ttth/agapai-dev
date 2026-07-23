import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { TextField } from '@/components/ui/Field';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/hooks/useAuth';
import { serverApi } from '@/services/api/server';
import { colors, radii, spacing } from '@/theme';
import type { BloodType } from '@/types';

const BLOOD_TYPES: BloodType[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'];

/** Personal info editing — unlocked only after eVerify. */
export default function EditProfileScreen() {
  const router = useRouter();
  const { session, updateUser } = useAuth();
  const user = session?.user;

  const [firstName, setFirstName] = useState(user?.firstName ?? '');
  const [middleName, setMiddleName] = useState(user?.middleName ?? '');
  const [lastName, setLastName] = useState(user?.lastName ?? '');
  const [suffix, setSuffix] = useState(user?.suffix ?? '');
  const [mobile, setMobile] = useState(user?.mobile ?? '+639');
  const [mobile2, setMobile2] = useState(user?.mobile2 ?? '');
  const [bloodType, setBloodType] = useState<string>(user?.bloodType ?? 'unknown');
  const [emergencyName, setEmergencyName] = useState(user?.emergencyName ?? '');
  const [emergencyPhone, setEmergencyPhone] = useState(user?.emergencyPhone ?? '+639');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user && !user.everified) router.replace('/verify-identity');
  }, [user, router]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const { user: next } = await serverApi.updateMe({
        firstName: firstName.trim(),
        middleName: middleName.trim() || undefined,
        lastName: lastName.trim(),
        suffix: suffix.trim() || undefined,
        mobile: mobile.trim(),
        mobile2: mobile2.trim() || undefined,
        bloodType,
        emergencyName: emergencyName.trim(),
        emergencyPhone: emergencyPhone.trim(),
      });
      await updateUser(next);
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <View style={styles.verifiedRow}>
        <Ionicons name="shield-checkmark" size={18} color={colors.success} />
        <AppText variant="caption" color="success">
          Identity verified via eVerify — editing unlocked
        </AppText>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <AppText variant="label" color="danger">
            {error}
          </AppText>
        </View>
      ) : null}

      <View style={styles.form}>
        <TextField label="First name" value={firstName} onChangeText={setFirstName} />
        <TextField label="Middle name" value={middleName} onChangeText={setMiddleName} />
        <TextField label="Last name" value={lastName} onChangeText={setLastName} />
        <TextField label="Suffix" value={suffix} onChangeText={setSuffix} />
        <TextField label="Mobile number" keyboardType="phone-pad" value={mobile} onChangeText={setMobile} hint="Used for SMS medication reminders (+639XXXXXXXXX)" />
        <TextField
          label="Second mobile number (optional)"
          keyboardType="phone-pad"
          value={mobile2}
          onChangeText={setMobile2}
          hint="eMessage reminders are also sent here (e.g. a caregiver's number)"
        />
        <View style={styles.group}>
          <AppText variant="label">Blood type</AppText>
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
        </View>
        <TextField label="Emergency contact — name" value={emergencyName} onChangeText={setEmergencyName} />
        <TextField
          label="Emergency contact — mobile"
          keyboardType="phone-pad"
          value={emergencyPhone}
          onChangeText={setEmergencyPhone}
        />
        <Button label="Save changes" loading={saving} onPress={() => void save()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  errorBox: {
    backgroundColor: colors.dangerLight,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  form: { gap: spacing.xl },
  group: { gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
