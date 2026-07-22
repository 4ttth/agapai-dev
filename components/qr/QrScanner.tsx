import { Ionicons } from '@expo/vector-icons';
import { CameraView, scanFromURLAsync, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useRef, useState } from 'react';
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
 * Handles the permission lifecycle with plain-language fallbacks, and lets
 * anyone whose camera is unavailable (denied, broken, or absent) upload a
 * photo of the QR instead — the code is decoded on-device either way.
 */
export function QrScanner({ onScanned, active = true }: QrScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);
  const [decoding, setDecoding] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleScan = useCallback(
    (data: string) => {
      if (handled.current) return;
      handled.current = true;
      onScanned(data);
    },
    [onScanned],
  );

  const pickFromLibrary = useCallback(async () => {
    setUploadError(null);
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
      });
      const uri = picked.assets?.[0]?.uri;
      if (picked.canceled || !uri) return;
      setDecoding(true);
      const found = await scanFromURLAsync(uri, ['qr']);
      const data = found?.[0]?.data;
      if (!data) {
        setUploadError('No QR code found in that photo. Make sure the QR is sharp and fills the frame.');
        return;
      }
      handleScan(data);
    } catch {
      setUploadError('Could not read that image. Please try another photo.');
    } finally {
      setDecoding(false);
    }
  }, [handleScan]);

  const uploadButton = (
    <Button
      label={decoding ? 'Reading photo…' : 'Upload a photo instead'}
      variant="ghost"
      onPress={() => void pickFromLibrary()}
      loading={decoding}
      fullWidth={false}
      icon={<Ionicons name="image-outline" size={20} color={colors.primary} />}
      accessibilityHint="Choose a photo of the QR code from your gallery"
    />
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
          To scan a QR code, please allow AgapAI to use the camera — or upload a photo of the QR
          instead.
        </AppText>
        <Button label="Allow camera" onPress={requestPermission} fullWidth={false} />
        {uploadButton}
        {uploadError ? (
          <AppText variant="caption" color="danger" center>
            {uploadError}
          </AppText>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.cameraWrap}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={active && !decoding ? ({ data }) => handleScan(data) : undefined}
        />
        <View style={styles.reticle} pointerEvents="none" />
      </View>
      <View style={styles.uploadRow}>
        {uploadButton}
        {uploadError ? (
          <AppText variant="caption" color="danger" center>
            {uploadError}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.lg },
  message: { marginBottom: spacing.sm },
  root: { flex: 1 },
  uploadRow: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
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
