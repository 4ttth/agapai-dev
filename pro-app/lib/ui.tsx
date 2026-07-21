import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { colors, radii, spacing } from './theme';

export function T({
  children,
  size = 16,
  weight = '400',
  color = colors.text,
  center,
  style,
}: {
  children: ReactNode;
  size?: number;
  weight?: TextStyle['fontWeight'];
  color?: string;
  center?: boolean;
  style?: TextStyle;
}) {
  return (
    <Text style={[{ fontSize: size, fontWeight: weight, color, lineHeight: size * 1.4 }, center && { textAlign: 'center' }, style]}>
      {children}
    </Text>
  );
}

export function Btn({
  label,
  onPress,
  kind = 'primary',
  loading,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const bg =
    kind === 'primary'
      ? colors.primary
      : kind === 'danger'
        ? colors.danger
        : kind === 'secondary'
          ? colors.surface
          : 'transparent';
  const fg = kind === 'primary' || kind === 'danger' ? colors.onPrimary : colors.primary;
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg },
        kind === 'secondary' && { borderWidth: 1.5, borderColor: colors.borderStrong },
        pressed && { opacity: 0.85 },
        isDisabled && { opacity: 0.45 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <T size={17} weight="600" color={fg}>
          {label}
        </T>
      )}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Banner({ text, tone = 'warning' }: { text: string; tone?: 'warning' | 'success' | 'danger' }) {
  const bg = tone === 'warning' ? colors.warningLight : tone === 'success' ? colors.successLight : colors.dangerLight;
  const fg = tone === 'warning' ? colors.warning : tone === 'success' ? colors.success : colors.danger;
  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <T size={14} weight="600" color={fg}>
        {text}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 54,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  banner: { borderRadius: radii.md, padding: spacing.lg },
});
