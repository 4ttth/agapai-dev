import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';

/** Hairline separator with vertical breathing room. Decorative only. */
export function Divider({ spacingY = spacing.lg }: { spacingY?: number }) {
  return <View accessibilityElementsHidden importantForAccessibility="no" style={[styles.line, { marginVertical: spacingY }]} />;
}

const styles = StyleSheet.create({
  line: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    width: '100%',
  },
});
