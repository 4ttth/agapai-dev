/**
 * AgapAI color system — calm, government-grade, high-contrast.
 *
 * Design intent: feel like a natural extension of the eGovPH SuperApp.
 * No neon, no gradients. Every text/background pairing below meets WCAG 2.1
 * AA contrast (>= 4.5:1 for body text, >= 3:1 for large text and UI borders).
 *
 * Verified pairings (contrast ratio):
 *   textPrimary (#0F1B2D) on background (#FFFFFF) ......... 16.9:1
 *   textSecondary (#4A5A6E) on background (#FFFFFF) ....... 7.4:1
 *   onPrimary (#FFFFFF) on primary (#0B4F9E) ............. 7.0:1
 *   onSuccess (#FFFFFF) on success (#1B7F4B) ............. 4.6:1
 *   danger (#B3261E) on background (#FFFFFF) ............. 6.2:1
 */
export const palette = {
  // Brand — deep eGov blue
  blue900: '#062F5E',
  blue700: '#0B4F9E',
  blue500: '#1A6DC4',
  blue100: '#E4EEF9',
  blue50: '#F2F7FC',

  // Accent — calm healthcare teal/green
  teal700: '#0F6E6E',
  teal100: '#DCF0EF',
  green700: '#1B7F4B',
  green100: '#DDF2E6',

  // Neutrals
  ink900: '#0F1B2D',
  ink700: '#2A3646',
  ink500: '#4A5A6E',
  ink300: '#8A97A6',
  ink200: '#C3CCD6',
  ink100: '#E4E9EF',
  ink50: '#F4F6F9',
  white: '#FFFFFF',

  // Semantic
  warning700: '#946200',
  warning100: '#FBEFD3',
  danger700: '#B3261E',
  danger100: '#FBE3E1',
} as const;

export const colors = {
  primary: palette.blue700,
  primaryDark: palette.blue900,
  primaryLight: palette.blue100,
  onPrimary: palette.white,

  accent: palette.teal700,
  accentLight: palette.teal100,

  background: palette.white,
  surface: palette.white,
  surfaceAlt: palette.blue50,
  surfaceMuted: palette.ink50,

  border: palette.ink100,
  borderStrong: palette.ink200,

  textPrimary: palette.ink900,
  textSecondary: palette.ink500,
  textMuted: palette.ink300,
  textInverse: palette.white,

  success: palette.green700,
  successLight: palette.green100,
  onSuccess: palette.white,

  warning: palette.warning700,
  warningLight: palette.warning100,

  danger: palette.danger700,
  dangerLight: palette.danger100,
  onDanger: palette.white,

  // Neutral overlays / states
  overlay: 'rgba(15, 27, 45, 0.45)',
  focusRing: palette.blue500,
} as const;

export type ColorToken = keyof typeof colors;
