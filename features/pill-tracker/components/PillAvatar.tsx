import { Image } from 'react-native';
import { StyleSheet, View } from 'react-native';

import { colors, radii } from '@/theme';
import type { PillAppearance } from '@/types';

const shapeRadius: Record<PillAppearance['shape'], number> = {
  round: radii.pill,
  oval: 20,
  capsule: radii.pill,
  oblong: 12,
  other: radii.sm,
};

interface PillAvatarProps {
  appearance: PillAppearance;
  size?: number;
}

/**
 * Visual pill identifier. Shows the actual photo when available, otherwise a
 * color/shape swatch so patients can match the physical pill at a glance.
 */
export function PillAvatar({ appearance, size = 56 }: PillAvatarProps) {
  const borderRadius = shapeRadius[appearance.shape];
  const isWide = appearance.shape === 'capsule' || appearance.shape === 'oblong';
  const width = size;
  const height = isWide ? size * 0.6 : size;

  if (appearance.imageUri) {
    return (
      <Image
        source={{ uri: appearance.imageUri }}
        style={[styles.image, { width: size, height: size, borderRadius: radii.md }]}
        accessibilityIgnoresInvertColors
      />
    );
  }

  return (
    <View
      accessible
      accessibilityLabel={`${appearance.color} ${appearance.shape} pill`}
      style={[
        styles.swatch,
        { width, height, borderRadius, backgroundColor: appearance.colorHex },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.surfaceMuted },
  swatch: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
});
