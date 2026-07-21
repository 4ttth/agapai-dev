import { Pressable, StyleSheet } from 'react-native';

import { colors, layout, radii, spacing } from '@/theme';
import { AppText } from './AppText';

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  accessibilityHint?: string;
}

/** Selectable pill used for single/multi choice inputs (units, frequency, etc.). */
export function Chip({ label, selected, onPress, accessibilityHint }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      hitSlop={6}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.selected : styles.unselected,
        pressed && styles.pressed,
      ]}
    >
      <AppText variant="label" color={selected ? 'inverse' : 'primary'}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: layout.minTouchTarget,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  unselected: { backgroundColor: colors.surface, borderColor: colors.borderStrong },
  pressed: { opacity: 0.8 },
});
