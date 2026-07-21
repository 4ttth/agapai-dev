import { StyleSheet, View } from 'react-native';

import { colors, radii, spacing } from '@/theme';
import { AppText } from './AppText';

type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  /** Optional leading icon element for redundant, non-color status cues. */
  icon?: React.ReactNode;
}

const toneStyles: Record<BadgeTone, { bg: string; fg: string }> = {
  neutral: { bg: colors.surfaceMuted, fg: colors.textSecondary },
  primary: { bg: colors.primaryLight, fg: colors.primaryDark },
  success: { bg: colors.successLight, fg: colors.success },
  warning: { bg: colors.warningLight, fg: colors.warning },
  danger: { bg: colors.dangerLight, fg: colors.danger },
};

/** Compact status pill. Always pair color with text (and optionally an icon). */
export function Badge({ label, tone = 'neutral', icon }: BadgeProps) {
  const t = toneStyles[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <AppText variant="caption" style={{ color: t.fg }}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  icon: { marginRight: spacing.xs },
});
