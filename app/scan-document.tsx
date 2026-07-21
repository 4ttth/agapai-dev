import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Image, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/states/LoadingState';
import { saveDocument } from '@/services/documents';
import { colors, layout, radii, spacing, typography } from '@/theme';

/** Camera capture → compressed, offline-only document record. */
export default function ScanDocumentScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  if (!permission) return <LoadingState message="Preparing camera…" />;

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <AppText variant="section" center>
          Camera access is needed
        </AppText>
        <AppText variant="body" color="secondary" center>
          To scan your medical documents, please allow camera access. Documents stay on this phone
          only.
        </AppText>
        <Button label="Allow camera" onPress={requestPermission} fullWidth={false} />
      </View>
    );
  }

  const capture = async () => {
    const photo = await cameraRef.current?.takePictureAsync({ quality: 0.9 });
    if (photo?.uri) setPhotoUri(photo.uri);
  };

  const save = async () => {
    if (!photoUri) return;
    setSaving(true);
    try {
      await saveDocument(photoUri, name.trim() || 'Medical record');
      router.back();
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      {photoUri ? (
        <>
          <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="contain" />
          <View style={styles.controls}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Name this document (e.g. Lab results)"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              accessibilityLabel="Document name"
            />
            <View style={styles.row}>
              <View style={styles.flex}>
                <Button label="Retake" variant="secondary" onPress={() => setPhotoUri(null)} />
              </View>
              <View style={styles.flex}>
                <Button label="Save offline" loading={saving} onPress={() => void save()} />
              </View>
            </View>
            <AppText variant="caption" color="muted" center>
              Compressed and stored only on this phone.
            </AppText>
          </View>
        </>
      ) : (
        <>
          <CameraView ref={cameraRef} style={styles.camera} facing="back" />
          <View style={styles.controls}>
            <AppText variant="body" color="secondary" center>
              Lay the document flat with good lighting, then capture.
            </AppText>
            <Button
              label="Capture"
              icon={<Ionicons name="camera" size={22} color={colors.onPrimary} />}
              onPress={() => void capture()}
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  camera: { flex: 1 },
  preview: { flex: 1, backgroundColor: colors.textPrimary },
  controls: { padding: layout.screenPadding, gap: spacing.md },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    minHeight: layout.buttonHeight,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
  },
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.lg },
});
