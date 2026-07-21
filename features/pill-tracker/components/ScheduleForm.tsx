import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Field, TextField } from '@/components/ui/Field';
import { IconButton } from '@/components/ui/IconButton';
import { colors, radii, spacing } from '@/theme';
import type { FrequencyKind, Medication, NewMedicationInput } from '@/types';
import { formatTimeLabel } from '@/utils/datetime';
import {
  colorOptions,
  medicationFormOptions,
  shapeOptions,
  unitOptions,
} from '../options';
import { useMedicationForm } from '../useMedicationForm';

interface ScheduleFormProps {
  medication?: Medication;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (input: NewMedicationInput) => void;
}

const frequencyChips: { value: FrequencyKind; label: string }[] = [
  { value: 'once_daily', label: 'Once a day' },
  { value: 'twice_daily', label: 'Twice a day' },
  { value: 'three_times_daily', label: '3 times a day' },
  { value: 'custom', label: 'Custom' },
];

/** Add/edit medication form. Prioritizes taps over typing for older users. */
export function ScheduleForm({ medication, submitting, submitLabel, onSubmit }: ScheduleFormProps) {
  const form = useMedicationForm(medication);
  const { state, errors } = form;

  const handleSubmit = () => {
    const input = form.validate();
    if (input) onSubmit(input);
  };

  return (
    <View style={styles.container}>
      <TextField
        label="Medicine name"
        required
        value={state.name}
        onChangeText={(v) => form.set('name', v)}
        error={errors.name}
        placeholder="e.g. Amlodipine"
        autoCapitalize="words"
        returnKeyType="next"
      />

      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField
            label="Dose amount"
            required
            value={state.dosage}
            onChangeText={(v) => form.set('dosage', v)}
            error={errors.dosage}
            placeholder="e.g. 500"
            keyboardType="numeric"
          />
        </View>
      </View>

      <Field label="Unit" required error={errors.unit}>
        <View style={styles.wrap}>
          {unitOptions.map((unit) => (
            <Chip
              key={unit}
              label={unit}
              selected={state.unit === unit}
              onPress={() => form.set('unit', unit)}
            />
          ))}
        </View>
      </Field>

      <Field label="Form">
        <View style={styles.wrap}>
          {medicationFormOptions.map((opt) => (
            <Chip
              key={opt.value}
              label={opt.label}
              selected={state.form === opt.value}
              onPress={() => form.set('form', opt.value)}
            />
          ))}
        </View>
      </Field>

      <Field label="How often" required>
        <View style={styles.wrap}>
          {frequencyChips.map((opt) => (
            <Chip
              key={opt.value}
              label={opt.label}
              selected={state.frequency === opt.value}
              onPress={() => form.selectFrequency(opt.value)}
            />
          ))}
        </View>
      </Field>

      <Field
        label="Reminder times"
        required
        hint="Use the plus and minus buttons to adjust each time by 30 minutes."
        error={errors.times}
      >
        <View style={styles.times}>
          {state.times.map((time, index) => (
            <View key={`${time}-${index}`} style={styles.timeRow}>
              <IconButton
                name="remove-circle-outline"
                accessibilityLabel={`Make time ${index + 1} earlier by 30 minutes`}
                onPress={() => form.adjustTime(index, -30)}
                color={colors.primary}
              />
              <AppText variant="bodyStrong" style={styles.timeLabel}>
                {formatTimeLabel(time)}
              </AppText>
              <IconButton
                name="add-circle-outline"
                accessibilityLabel={`Make time ${index + 1} later by 30 minutes`}
                onPress={() => form.adjustTime(index, 30)}
                color={colors.primary}
              />
              {state.times.length > 1 ? (
                <IconButton
                  name="trash-outline"
                  accessibilityLabel={`Remove reminder time ${index + 1}`}
                  onPress={() => form.removeTime(index)}
                  color={colors.danger}
                />
              ) : null}
            </View>
          ))}
          <Button label="Add another time" variant="secondary" onPress={form.addTime} fullWidth={false} />
        </View>
      </Field>

      <Field label="Pill color" hint="Helps you recognize the pill.">
        <View style={styles.wrap}>
          {colorOptions.map((c) => {
            const selected = state.colorHex === c.hex;
            return (
              <Pressable
                key={c.hex}
                accessibilityRole="button"
                accessibilityLabel={c.name}
                accessibilityState={{ selected }}
                onPress={() => form.setColor(c.name, c.hex)}
                style={[
                  styles.swatch,
                  { backgroundColor: c.hex },
                  selected && styles.swatchSelected,
                ]}
              >
                {selected ? <Ionicons name="checkmark" size={20} color={colors.textPrimary} /> : null}
              </Pressable>
            );
          })}
        </View>
      </Field>

      <Field label="Pill shape">
        <View style={styles.wrap}>
          {shapeOptions.map((opt) => (
            <Chip
              key={opt.value}
              label={opt.label}
              selected={state.shape === opt.value}
              onPress={() => form.set('shape', opt.value)}
            />
          ))}
        </View>
      </Field>

      <TextField
        label="Doctor's instructions"
        value={state.instructions}
        onChangeText={(v) => form.set('instructions', v)}
        placeholder="e.g. Take after meals"
        multiline
      />

      <TextField
        label="Prescribing doctor"
        value={state.doctor}
        onChangeText={(v) => form.set('doctor', v)}
        placeholder="e.g. Dr. Reyes"
        autoCapitalize="words"
      />

      <Button
        label={submitLabel}
        onPress={handleSubmit}
        loading={submitting}
        accessibilityHint="Saves this medicine and its reminders"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xl },
  row: { flexDirection: 'row', gap: spacing.lg },
  flex: { flex: 1 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  times: { gap: spacing.md },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  timeLabel: { minWidth: 96, textAlign: 'center' },
  swatch: {
    width: 48,
    height: 48,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchSelected: { borderColor: colors.primary, borderWidth: 3 },
});
