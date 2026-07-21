import { memo } from 'react';
import { StyleSheet, Text, type TextProps } from 'react-native';

import { colors, typography, type TypographyVariant } from '@/theme';

type AppTextColor = 'primary' | 'secondary' | 'muted' | 'inverse' | 'accent' | 'danger' | 'success';

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  color?: AppTextColor;
  center?: boolean;
}

const colorMap: Record<AppTextColor, string> = {
  primary: colors.textPrimary,
  secondary: colors.textSecondary,
  muted: colors.textMuted,
  inverse: colors.textInverse,
  accent: colors.accent,
  danger: colors.danger,
  success: colors.success,
};

/**
 * The only component that touches raw font families. Every screen uses
 * `variant` (Lexend for display roles, Inter for text roles) so hierarchy and
 * accessible sizing stay consistent. `allowFontScaling` stays on so OS text-size
 * settings are respected.
 */
function AppTextComponent({
  variant = 'body',
  color = 'primary',
  center = false,
  style,
  ...rest
}: AppTextProps) {
  return (
    <Text
      style={[typography[variant], { color: colorMap[color] }, center && styles.center, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
});

export const AppText = memo(AppTextComponent);
