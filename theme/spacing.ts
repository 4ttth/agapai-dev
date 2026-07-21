/**
 * 8pt spacing scale with generous defaults for elderly-friendly layouts.
 * Use tokens instead of magic numbers so spacing stays consistent.
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/** Consistent screen gutter used by the Screen wrapper. */
export const layout = {
  screenPadding: spacing.xl,
  cardPadding: spacing.xl,
  gap: spacing.lg,
  /** Minimum accessible touch target (WCAG 2.5.5 / iOS HIG / Material). */
  minTouchTarget: 48,
  /** Preferred height for primary buttons — large for older users. */
  buttonHeight: 56,
  maxContentWidth: 640,
} as const;

export type SpacingToken = keyof typeof spacing;
