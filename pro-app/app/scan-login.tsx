import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useSession } from '@/lib/SessionContext';
import { colors, radii, spacing } from '@/lib/theme';
import { Banner, Btn, T } from '@/lib/ui';

/** Professional sign-in: scan your own National ID QR → eVerify. */
export default function ScanLoginScreen() {
  const router = useRouter();
  const { signIn } = useSession();
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);
  const [state, setState] = useState<'scan' | 'checking' | 'error'>('scan');
  const [message, setMessage] = useState('');

  const onScanned = async (value: string) => {
    if (handled.current) return;
    handled.current = true;
    setState('checking');
    try {
      await signIn(value);
      router.back(); // login screen now shows either the app or role registration
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Verification failed.');
      setState('error');
    }
  };

  if (!permission) return null;

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <T size={20} weight="700" center>
          Camera access needed
        </T>
        <T size={15} color={colors.textSecondary} center>
          Allow the camera to scan the QR on your National ID.
        </T>
        <Btn label="Allow camera" onPress={() => void requestPermission()} />
      </View>
    );
  }

  if (state === 'checking') {
    return (
      <View style={styles.center}>
        <Ionicons name="shield-half" size={44} color={colors.primary} />
        <T size={17} weight="600">
          Checking with eVerify…
        </T>
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={styles.center}>
        <Banner text={message} tone="danger" />
        <Btn
          label="Scan again"
          onPress={() => {
            handled.current = false;
            setState('scan');
          }}
        />
        <Btn label="Back" kind="ghost" onPress={() => router.back()} />
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
          onBarcodeScanned={({ data }) => void onScanned(data)}
        />
        <View style={styles.reticle} pointerEvents="none" />
      </View>
      <View style={styles.footer}>
        <T size={15} color={colors.textSecondary} center>
          Point the camera at the QR on the back of your Philippine National ID.
        </T>
        <View style={styles.privacyRow}>
          <Ionicons name="lock-closed" size={13} color={colors.textMuted} />
          <T size={12} color={colors.textMuted}>
            Only the QR value is sent to eVerify. Your ID is never stored.
          </T>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  cameraWrap: { flex: 1, overflow: 'hidden', backgroundColor: '#000' },
  reticle: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 220,
    height: 220,
    marginTop: -110,
    marginLeft: -110,
    borderWidth: 3,
    borderColor: '#fff',
    borderRadius: radii.lg,
  },
  footer: { padding: spacing.xl, gap: spacing.sm },
  privacyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.lg },
});
