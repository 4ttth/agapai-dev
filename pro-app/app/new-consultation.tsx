import { Ionicons } from '@expo/vector-icons';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { CameraView } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { api, CONSULTATION_TYPES, type PrescriptionItem } from '@/lib/api';
import { encryptRecord } from '@/lib/crypto';
import { clearScannedPatient, getScannedPatient } from '@/lib/scanStore';
import { colors, radii, spacing } from '@/lib/theme';
import { Banner, Btn, Card, T } from '@/lib/ui';

interface RxDraft {
  name: string;
  dosage: string;
  times: string;
  quantity: string;
}

/** Doctor: compose + client-side-encrypt + upload a consultation record. */
export default function NewConsultationScreen() {
  const router = useRouter();
  // Snapshot at mount: clearing the store after upload must not blank this screen.
  const [scanned] = useState(getScannedPatient);

  const [manila, setManila] = useState<string>('');
  const [type, setType] = useState<(typeof CONSULTATION_TYPES)[number]>(CONSULTATION_TYPES[0]);
  const [description, setDescription] = useState('');
  const [voiceB64, setVoiceB64] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [rxRows, setRxRows] = useState<RxDraft[]>([{ name: '', dosage: '', times: '08:00', quantity: '' }]);
  const [rxImageB64, setRxImageB64] = useState<string | null>(null);
  const [showRxCamera, setShowRxCamera] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const camRef = useRef<CameraView>(null);

  useEffect(() => {
    // Official timestamp per spec: gateway.timeapi.world Asia/Manila (server-proxied).
    api<{ datetime?: string }>('/time')
      .then((t) => setManila(t.datetime ?? new Date().toISOString()))
      .catch(() => setManila(new Date().toISOString()));
  }, []);

  if (!scanned) {
    return (
      <View style={styles.center}>
        <Banner text="No scanned patient. Scan a Health ID first." tone="danger" />
        <Btn label="Back" onPress={() => router.back()} />
      </View>
    );
  }
  const { payload, user } = scanned;

  const toggleRecording = async () => {
    try {
      if (recording) {
        setRecording(false);
        await recorder.stop();
        const uri = recorder.uri;
        if (uri) {
          const b64 = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          setVoiceB64(b64);
        }
      } else {
        const perm = await AudioModule.requestRecordingPermissionsAsync();
        if (!perm.granted) return setError('Microphone permission is needed for voice notes.');
        await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
        await recorder.prepareToRecordAsync();
        recorder.record();
        setRecording(true);
      }
    } catch {
      setRecording(false);
      setError('Voice recording failed — you can type the notes instead.');
    }
  };

  const captureRx = async () => {
    const photo = await camRef.current?.takePictureAsync({ quality: 0.7 });
    if (!photo?.uri) return;
    const small = await ImageManipulator.manipulateAsync(photo.uri, [{ resize: { width: 1000 } }], {
      compress: 0.4,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    });
    setRxImageB64(small.base64 ?? null);
    setShowRxCamera(false);
  };

  const finalize = async () => {
    setError(null);
    const prescriptions: PrescriptionItem[] = rxRows
      .filter((r) => r.name.trim())
      .map((r) => ({
        name: r.name.trim(),
        dosage: r.dosage.trim(),
        times: r.times
          .split(',')
          .map((t) => t.trim())
          .filter((t) => /^\d{1,2}:\d{2}$/.test(t)),
        quantity: r.quantity.trim() ? Number(r.quantity) : undefined,
      }));
    if (!description.trim() && !voiceB64 && prescriptions.length === 0) {
      setError('Add notes (text or voice) or at least one prescription.');
      return;
    }
    setBusy(true);
    try {
      // End-to-end encryption with the key from the patient's own QR.
      const enc = await encryptRecord(
        {
          description: description.trim(),
          voiceB64: voiceB64 ?? undefined,
          prescriptions,
          rxImageB64: rxImageB64 ?? undefined,
        },
        payload.key,
      );
      await api('/consultations', {
        body: {
          patientId: payload.healthId,
          type,
          date: manila || new Date().toISOString(),
          ...enc,
          hasVoice: !!voiceB64,
          hasRxImage: !!rxImageB64,
          // Sent in the clear (alongside the encrypted record) so the medicines
          // land in the patient's app automatically and drive SMS reminders.
          prescriptions,
        },
        timeoutMs: 60000,
      });
      clearScannedPatient();
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <View style={styles.center}>
        <Ionicons name="checkmark-circle" size={72} color={colors.success} />
        <T size={22} weight="800" center>
          Record uploaded, encrypted
        </T>
        <T size={15} color={colors.textSecondary} center>
          Only {payload.preview.fullName} can decrypt this record. It is now available in their
          AgapAI app{rxRows.some((r) => r.name.trim()) ? ', and the prescribed medicines were added to their reminders automatically' : ''}.
        </T>
        <Btn label="Done" onPress={() => router.replace('/doctor')} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Card style={styles.patientCard}>
        <View style={styles.row}>
          <View style={styles.avatar}>
            <T size={20} weight="800" color={colors.onPrimary}>
              {payload.preview.fullName[0]}
            </T>
          </View>
          <View style={styles.flex}>
            <T size={18} weight="700">
              {payload.preview.fullName}
            </T>
            <T size={13} color={colors.textSecondary}>
              Blood type {payload.preview.bloodType}
              {user?.birthDate ? ` · born ${user.birthDate}` : ''}
            </T>
          </View>
        </View>
        {user && (user.allergies.length > 0 || user.conditions.length > 0) ? (
          <View style={styles.allergyBox}>
            {user.allergies.length > 0 ? (
              <T size={13} weight="700" color={colors.danger}>
                ⚠ Allergies: {user.allergies.join(', ')}
              </T>
            ) : null}
            {user.conditions.length > 0 ? (
              <T size={13} color={colors.textSecondary}>
                Conditions: {user.conditions.join(', ')}
              </T>
            ) : null}
          </View>
        ) : null}
      </Card>

      <Card style={styles.section}>
        <T size={13} weight="600" color={colors.textSecondary}>
          DATE (Asia/Manila, auto)
        </T>
        <T size={15} weight="600">
          {manila ? new Date(manila).toLocaleString() : 'Fetching official time…'}
        </T>
      </Card>

      <View style={styles.group}>
        <T size={15} weight="700">
          Type of consultation
        </T>
        <View style={styles.chips}>
          {CONSULTATION_TYPES.map((t) => (
            <Pressable
              key={t}
              onPress={() => setType(t)}
              style={[styles.chip, type === t && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: type === t }}
            >
              <T size={13} weight="600" color={type === t ? colors.onPrimary : colors.text}>
                {t}
              </T>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.group}>
        <T size={15} weight="700">
          Description
        </T>
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Findings, advice, follow-up plan…"
          placeholderTextColor={colors.textMuted}
          multiline
          style={styles.textarea}
        />
        <Pressable onPress={() => void toggleRecording()} style={[styles.voiceBtn, recording && styles.voiceRec]}>
          <Ionicons name={recording ? 'stop-circle' : 'mic'} size={22} color={recording ? colors.onPrimary : colors.primary} />
          <T size={14} weight="600" color={recording ? colors.onPrimary : colors.primary}>
            {recording ? 'Recording… tap to stop' : voiceB64 ? 'Re-record voice note' : 'Record a voice note instead'}
          </T>
        </Pressable>
        {voiceB64 ? (
          <View style={styles.rowBetween}>
            <T size={13} color={colors.success}>
              🎙 Voice note attached (sent as base64, encrypted)
            </T>
            <Pressable onPress={() => setVoiceB64(null)} hitSlop={8}>
              <T size={13} color={colors.danger}>
                Remove
              </T>
            </Pressable>
          </View>
        ) : null}
      </View>

      <View style={styles.group}>
        <T size={15} weight="700">
          Prescriptions
        </T>
        {rxRows.map((r, i) => (
          <Card key={i} style={styles.rxCard}>
            <TextInput
              value={r.name}
              onChangeText={(v) => setRxRows((rows) => rows.map((x, j) => (j === i ? { ...x, name: v } : x)))}
              placeholder="Medicine name (e.g. Amoxicillin)"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            <View style={styles.rxRow}>
              <TextInput
                value={r.dosage}
                onChangeText={(v) => setRxRows((rows) => rows.map((x, j) => (j === i ? { ...x, dosage: v } : x)))}
                placeholder="Dosage (500 mg)"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, styles.flex]}
              />
              <TextInput
                value={r.quantity}
                onChangeText={(v) => setRxRows((rows) => rows.map((x, j) => (j === i ? { ...x, quantity: v } : x)))}
                placeholder="Qty"
                keyboardType="number-pad"
                placeholderTextColor={colors.textMuted}
                style={[styles.input, styles.qty]}
              />
            </View>
            <TextInput
              value={r.times}
              onChangeText={(v) => setRxRows((rows) => rows.map((x, j) => (j === i ? { ...x, times: v } : x)))}
              placeholder="Times, 24h — e.g. 08:00, 20:00"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />
            {rxRows.length > 1 ? (
              <Pressable
                onPress={() => setRxRows((rows) => rows.filter((_, j) => j !== i))}
                style={styles.removeRx}
              >
                <T size={13} color={colors.danger}>
                  Remove
                </T>
              </Pressable>
            ) : null}
          </Card>
        ))}
        <Btn
          label="+ Add another medicine"
          kind="secondary"
          onPress={() => setRxRows((rows) => [...rows, { name: '', dosage: '', times: '08:00', quantity: '' }])}
        />

        <Pressable onPress={() => setShowRxCamera((s) => !s)} style={styles.scanRxLink}>
          <Ionicons name="camera-outline" size={18} color={colors.warning} />
          <T size={14} weight="600" color={colors.warning}>
            {showRxCamera ? 'Close camera' : 'Scan a paper prescription (not recommended)'}
          </T>
        </Pressable>
        {showRxCamera ? (
          <View>
            <Banner
              text="Typing the prescription is recommended — scans can't power reminders or dispensing checklists."
              tone="warning"
            />
            <View style={styles.rxCameraWrap}>
              <CameraView ref={camRef} style={StyleSheet.absoluteFill} facing="back" />
            </View>
            <Btn label="Capture prescription" kind="secondary" onPress={() => void captureRx()} />
          </View>
        ) : null}
        {rxImageB64 ? (
          <View style={styles.rowBetween}>
            <T size={13} color={colors.success}>
              📄 Paper prescription attached (base64, encrypted)
            </T>
            <Pressable onPress={() => setRxImageB64(null)} hitSlop={8}>
              <T size={13} color={colors.danger}>
                Remove
              </T>
            </Pressable>
          </View>
        ) : null}
      </View>

      {error ? <Banner text={error} tone="danger" /> : null}

      <View style={styles.finalBox}>
        <View style={styles.lockRow}>
          <Ionicons name="lock-closed" size={16} color={colors.textSecondary} />
          <T size={12} color={colors.textSecondary} style={styles.flex}>
            Finalizing encrypts everything on THIS device with the patient&apos;s key. The server,
            eGov, and even you (after upload) cannot read it.
          </T>
        </View>
        <Btn label="Finalize & upload encrypted record" onPress={() => void finalize()} loading={busy} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceMuted },
  scroll: { padding: spacing.xl, gap: spacing.xl, paddingBottom: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.lg },
  patientCard: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  allergyBox: {
    backgroundColor: colors.dangerLight,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  section: { gap: spacing.xs, padding: spacing.lg },
  group: { gap: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  textarea: {
    fontSize: 16,
    color: colors.text,
    minHeight: 120,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radii.md,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    textAlignVertical: 'top',
  },
  voiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 50,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  voiceRec: { backgroundColor: colors.danger, borderColor: colors.danger },
  rxCard: { gap: spacing.md, padding: spacing.lg },
  rxRow: { flexDirection: 'row', gap: spacing.md },
  qty: { width: 90 },
  input: {
    fontSize: 16,
    color: colors.text,
    minHeight: 50,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceMuted,
  },
  removeRx: { alignSelf: 'flex-end' },
  scanRxLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 44 },
  rxCameraWrap: {
    height: 260,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
    marginVertical: spacing.md,
  },
  finalBox: { gap: spacing.md },
  lockRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
});
