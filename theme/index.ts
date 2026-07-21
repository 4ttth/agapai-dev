import { colors, palette } from './colors';
import { radii } from './radii';
import { layout, spacing } from './spacing';
import { fontFamilies, typography } from './typography';

/**
 * Single import surface for the design system.
 *   import { theme } from '@/theme';
 */
export const theme = {
  colors,
  palette,
  spacing,
  layout,
  radii,
  typography,
  fontFamilies,
} as const;

export { colors, palette } from './colors';
export { radii } from './radii';
export { layout, spacing } from './spacing';
export { fontFamilies, typography } from './typography';
export type { ColorToken } from './colors';
export type { RadiusToken } from './radii';
export type { SpacingToken } from './spacing';
export type { TypographyVariant } from './typography';

/** Font map consumed by `useFonts` in the root layout. */
export const appFonts = {
  fontFamilies,
} as const;
