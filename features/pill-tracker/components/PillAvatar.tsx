import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image, StyleSheet, View } from 'react-native';

import { colors, radii } from '@/theme';
import type { Medication } from '@/types';
import { categoryMeta, resolveCategory } from '../medicationCategory';

interface PillAvatarProps {
  medication: Pick<Medication, 'name' | 'form' | 'appearance'>;
  size?: number;
}

/**
 * Visual medicine identifier. Shows the actual photo when available; otherwise
 * a category icon (pill, capsule, liquid, inhaler, injection, drops, cream, or
 * a generic fallback) so every medicine has a clear, recognizable image. For
 * pills/capsules the badge is tinted with the patient's chosen pill color so it
 * still helps match the physical medicine at a glance.
 */
export function PillAvatar({ medication, size = 56 }: PillAvatarProps) {
  const { appearance } = medication;

  if (appearance.imageUri) {
    return (
      <Image
        source={{ uri: appearance.imageUri }}
        style={[styles.image, { width: size, height: size, borderRadius: radii.md }]}
        accessibilityIgnoresInvertColors
      />
    );
  }

  const category = resolveCategory({
    name: medication.name,
    form: medication.form,
    category: appearance.category,
  });
  const meta = categoryMeta[category];
  // Preserve the "match the pill color" affordance for tablets/capsules: use the
  // patient's chosen (pale) pill color as the badge, with the icon on top.
  const tinted = category === 'pill' || category === 'capsule';
  const background = tinted && appearance.colorHex ? appearance.colorHex : meta.bg;

  return (
    <View
      accessible
      accessibilityLabel={`${meta.label}${appearance.color ? `, ${appearance.color}` : ''}`}
      style={[styles.badge, { width: size, height: size, borderRadius: radii.md, backgroundColor: background }]}
    >
      <MaterialCommunityIcons name={meta.icon} size={size * 0.55} color={meta.color} />
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: colors.surfaceMuted },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
});
