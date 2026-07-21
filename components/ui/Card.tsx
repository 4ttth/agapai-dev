import { type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { colors, layout, radii, spacing } from '@/theme';

interface CardProps {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Adds a colored left rail to signal status without relying on color alone elsewhere. */
  accent?: string;
  padded?: boolean;
  style?: ViewStyle;
  testID?: string;
}

/**
 * Neutral surface container. When `onPress` is provided it becomes an
 * accessible button with a large touch target.
 */
export function Card({
  children,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  accent,
  padded = true,
  style,
  testID,
}: CardProps) {
  const content = (
    <View
      style={[
        styles.card,
        padded && styles.padded,
        accent ? { borderLeftWidth: 6, borderLeftColor: accent } : null,
        style,
      ]}
    >
      {children}
    </View>
  );

  if (!onPress) {
    return (
      <View testID={testID} accessible accessibilityLabel={accessibilityLabel}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [pressed && styles.pressed, { minHeight: layout.minTouchTarget }]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  padded: { padding: spacing.xl },
  pressed: { opacity: 0.9 },
});
