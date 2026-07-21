import { type ReactNode, useId } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { colors, layout, radii, spacing, typography } from '@/theme';
import { AppText } from './AppText';

interface FieldWrapperProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}

/** Labelled form field with an accessible error message. */
export function Field({ label, error, hint, required, children }: FieldWrapperProps) {
  return (
    <View style={styles.field}>
      <AppText variant="label">
        {label}
        {required ? ' *' : ''}
      </AppText>
      {hint ? (
        <AppText variant="caption" color="muted" style={styles.hint}>
          {hint}
        </AppText>
      ) : null}
      {children}
      {error ? (
        <AppText variant="caption" color="danger" style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
}

/** Text input paired with the Field wrapper and full a11y labelling. */
export function TextField({ label, error, hint, required, ...inputProps }: TextFieldProps) {
  const id = useId();
  return (
    <Field label={label} error={error} hint={hint} required={required}>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        aria-labelledby={id}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, error ? styles.inputError : null]}
        {...inputProps}
      />
    </Field>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.sm },
  hint: { marginTop: -spacing.xs },
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
  inputError: { borderColor: colors.danger },
  error: { marginTop: spacing.xs },
});
