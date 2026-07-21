import type { TextStyle } from 'react-native';

/**
 * Font family keys. These strings must match the keys registered with
 * `useFonts` in the root layout (see app/_layout.tsx). Lexend is used for
 * display/heading roles; Inter for everything readable and interactive.
 */
export const fontFamilies = {
  // Lexend — titles, hero, headers, section headings
  displayRegular: 'Lexend_400Regular',
  displaySemiBold: 'Lexend_600SemiBold',
  displayBold: 'Lexend_700Bold',
  // Inter — body, buttons, labels, forms, captions
  textRegular: 'Inter_400Regular',
  textMedium: 'Inter_500Medium',
  textSemiBold: 'Inter_600SemiBold',
  textBold: 'Inter_700Bold',
} as const;

/**
 * Typography roles. Sizes are intentionally large with generous line-height
 * for readability by elderly users and users with low vision. Values scale
 * with the OS font-size setting because we do not disable `allowFontScaling`.
 */
export const typography = {
  title: {
    fontFamily: fontFamilies.displayBold,
    fontSize: 30,
    lineHeight: 38,
  },
  heading: {
    fontFamily: fontFamilies.displaySemiBold,
    fontSize: 24,
    lineHeight: 32,
  },
  section: {
    fontFamily: fontFamilies.displaySemiBold,
    fontSize: 20,
    lineHeight: 28,
  },
  body: {
    fontFamily: fontFamilies.textRegular,
    fontSize: 18,
    lineHeight: 28,
  },
  bodyStrong: {
    fontFamily: fontFamilies.textSemiBold,
    fontSize: 18,
    lineHeight: 28,
  },
  label: {
    fontFamily: fontFamilies.textMedium,
    fontSize: 16,
    lineHeight: 22,
  },
  button: {
    fontFamily: fontFamilies.textSemiBold,
    fontSize: 18,
    lineHeight: 24,
  },
  caption: {
    fontFamily: fontFamilies.textRegular,
    fontSize: 14,
    lineHeight: 20,
  },
} as const satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;
