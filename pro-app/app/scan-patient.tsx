import { CameraView, useCameraPermissions } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { api, parseHealthId, type ProUser } from '@/lib/api';
import { setScannedPatient } from '@/lib/scanStore';
import { colors, radii, spacing } from '@/lib/theme';
import { Banner, Btn, T } from '@/lib/ui';

/** Scan a patient's Health ID QR → decoded values + registry profile. */
export default function ScanPatientScreen() {
  const router = useRouter();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);
  const [state, setState] = useState<'scan' | 'loading' | 'error'>('scan');
  const [message, setMessage] = useState('');

  const onScanned = async (raw: string) => {
    if (handled.current) return;
    handled.current = true;
    const payload = parseHealthId(raw);
    if (!payload) {
      setMessage('That is not an AgapAI Health ID QR. Ask the patient to open Home → Health ID.');
      setState('error');
      return;
    }
    setState('loading');
    let user: ProUser | null = null;
    try {
      const res = await api<{ user: ProUser }>(`/users/${payload.healthId}`);
      user = res.user;
    } catch {
      // Offline fallback: proceed with the QR preview data only.
    }
    setScannedPatient(payload, user);
    router.replace(next === 'dispense' ? '/dispense' : '/new-consultation');
  };

  if (!permission) return null;

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <T size={20} weight="700" center>
          Camera access needed
        </T>
        <T size={15} color={colors.textSecondary} center>
          Allow the camera to scan the patient&apos;s Health ID QR.
        </T>
        <Btn label="Allow camera" onPress={() => void requestPermission()} />
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
          onBarcodeScanned={state === 'scan' ? ({ data }) => void onScanned(data) : undefined}
        />
        <View style={styles.reticle} pointerEvents="none" />
      </View>
      <View style={styles.footer}>
        <T size={15} color={colors.textSecondary} center>
          {state === 'loading'
            ? 'Decoding Health ID…'
            : "Point the camera at the patient's Health ID QR code."}
        </T>
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
  footer: { padding: spacing.xl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.lg },
});
