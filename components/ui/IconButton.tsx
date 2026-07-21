import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import { colors, layout, radii } from '@/theme';

interface IconButtonProps {
  /** Ionicons glyph name. */
  name: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  /** Required: icons carry no text, so a label is mandatory for screen readers. */
  accessibilityLabel: string;
  accessibilityHint?: string;
  color?: string;
  size?: number;
  tone?: 'default' | 'onPrimary';
  testID?: string;
}

/** Icon-only tap target that always meets the 48pt minimum size. */
export function IconButton({
  name,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  color,
  size = 26,
  tone = 'default',
  testID,
}: IconButtonProps) {
  const iconColor = color ?? (tone === 'onPrimary' ? colors.onPrimary : colors.textPrimary);
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      hitSlop={8}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Ionicons name={name} size={size} color={iconColor} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
  },
  pressed: { opacity: 0.6 },
});
