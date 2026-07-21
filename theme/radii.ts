/** Corner radii — soft and friendly without being playful. */
export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

export type RadiusToken = keyof typeof radii;
