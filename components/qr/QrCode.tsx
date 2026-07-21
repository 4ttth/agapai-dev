import { StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { colors, radii, spacing } from '@/theme';

interface QrCodeProps {
  /** String payload to encode (e.g. JSON of the health share payload). */
  value: string;
  size?: number;
  accessibilityLabel?: string;
}

/** Renders a scannable QR inside a high-contrast white card. */
export function QrCode({ value, size = 220, accessibilityLabel }: QrCodeProps) {
  return (
    <View
      style={styles.frame}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel ?? 'Health ID QR code'}
    >
      <QRCode value={value} size={size} color={colors.textPrimary} backgroundColor={colors.surface} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignSelf: 'center',
    padding: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
