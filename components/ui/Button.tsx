import { memo, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from 'react-native';

import { colors, layout, radii, spacing, typography } from '@/theme';
import { AppText } from './AppText';

type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';
type ButtonSize = 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  /** Optional leading icon element (e.g. an Ionicons node). */
  icon?: ReactNode;
  /** Screen-reader hint describing what happens on activation. */
  accessibilityHint?: string;
  testID?: string;
}

const variantStyles: Record<ButtonVariant, { bg: string; text: 'primary' | 'inverse'; border?: string }> = {
  primary: { bg: colors.primary, text: 'inverse' },
  secondary: { bg: colors.surface, text: 'primary', border: colors.borderStrong },
  success: { bg: colors.success, text: 'inverse' },
  danger: { bg: colors.danger, text: 'inverse' },
  ghost: { bg: 'transparent', text: 'primary' },
};

/**
 * Large, high-contrast button with a 56pt default height for confident taps.
 * Exposes loading and disabled states and a full accessibility contract.
 */
function ButtonComponent({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled = false,
  loading = false,
  fullWidth = true,
  icon,
  accessibilityHint,
  testID,
}: ButtonProps) {
  const v = variantStyles[variant];
  const isDisabled = disabled || loading;
  const height = size === 'lg' ? layout.buttonHeight : layout.minTouchTarget;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      hitSlop={8}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          backgroundColor: v.bg,
          borderColor: v.border ?? 'transparent',
          borderWidth: v.border ? 1.5 : 0,
          width: fullWidth ? '100%' : undefined,
        },
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.text === 'inverse' ? colors.onPrimary : colors.primary} />
      ) : (
        <View style={styles.content}>
          {icon ? <View style={styles.icon}>{icon}</View> : null}
          <AppText variant="button" color={v.text} style={typography.button}>
            {label}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  content: { flexDirection: 'row', alignItems: 'center' },
  icon: { marginRight: spacing.sm },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.45 },
});

export const Button = memo(ButtonComponent);
