import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/states/LoadingState';
import { colors, radii, spacing } from '@/theme';

interface QrScannerProps {
  /** Fires once per scan with the decoded string. */
  onScanned: (data: string) => void;
  active?: boolean;
}

/**
 * QR scanner representing the clinic-side "scan the patient's Health ID" flow.
 * Handles the permission lifecycle with plain-language fallbacks.
 */
export function QrScanner({ onScanned, active = true }: QrScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  const handleScan = useCallback(
    (data: string) => {
      if (handled.current) return;
      handled.current = true;
      onScanned(data);
    },
    [onScanned],
  );

  if (!permission) {
    return <LoadingState message="Preparing camera…" />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.center} accessible accessibilityLabel="Camera permission needed">
        <AppText variant="section" center>
          Camera access is needed
        </AppText>
        <AppText variant="body" color="secondary" center style={styles.message}>
          To scan a Health ID QR code, please allow AgapAI to use the camera.
        </AppText>
        <Button label="Allow camera" onPress={requestPermission} fullWidth={false} />
      </View>
    );
  }

  return (
    <View style={styles.cameraWrap}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={active ? ({ data }) => handleScan(data) : undefined}
      />
      <View style={styles.reticle} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.lg },
  message: { marginBottom: spacing.sm },
  cameraWrap: {
    flex: 1,
    minHeight: 320,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.textPrimary,
  },
  reticle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 200,
    height: 200,
    marginTop: -100,
    marginLeft: -100,
    borderWidth: 3,
    borderColor: colors.onPrimary,
    borderRadius: radii.lg,
  },
});
