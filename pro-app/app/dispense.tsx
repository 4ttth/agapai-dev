import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { api, type ConsultationRow } from '@/lib/api';
import { decryptRecord, type DecryptedConsultation } from '@/lib/crypto';
import { clearScannedPatient, getScannedPatient } from '@/lib/scanStore';
import { colors, radii, spacing } from '@/lib/theme';
import { Banner, Btn, Card, T } from '@/lib/ui';

interface DispenseRow {
  name: string;
  dosage: string;
  times: string[];
  quantity: string;
  checked: boolean;
}

/** Pharmacist: fetch latest prescription, decrypt with the QR key, dispense + sync. */
export default function DispenseScreen() {
  const router = useRouter();
  const scanned = getScannedPatient();
  const [row, setRow] = useState<ConsultationRow | null>(null);
  const [record, setRecord] = useState<DecryptedConsultation | null>(null);
  const [items, setItems] = useState<DispenseRow[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'done'>('loading');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!scanned) return;
    api<{ consultation: ConsultationRow }>(`/consultations/latest/${scanned.payload.healthId}`)
      .then(({ consultation }) => {
        setRow(consultation);
        const dec = decryptRecord(consultation, scanned.payload.key);
        if (!dec) {
          setMessage('Could not decrypt — the QR key does not match this record.');
          setState('error');
          return;
        }
        setRecord(dec);
        setItems(
          dec.prescriptions.map((p) => ({
            name: p.name,
            dosage: p.dosage,
            times: p.times,
            quantity: String(p.quantity ?? 1),
            checked: true,
          })),
        );
        setState('ready');
      })
      .catch((err) => {
        setMessage(err instanceof Error ? err.message : 'No consultation found.');
        setState('error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!scanned) {
    return (
      <View style={styles.center}>
        <Banner text="No scanned patient. Scan a Health ID first." tone="danger" />
        <Btn label="Back" onPress={() => router.back()} />
      </View>
    );
  }

  const dispense = async () => {
    const chosen = items.filter((i) => i.checked && i.name.trim());
    if (chosen.length === 0) return;
    setBusy(true);
    try {
      await api('/dispense', {
        body: {
          patientId: scanned.payload.healthId,
          consultationId: row?.id,
          items: chosen.map((i) => ({
            name: i.name,
            dosage: i.dosage,
            times: i.times,
            quantity: Number(i.quantity) || 1,
            instructions: 'Dispensed at pharmacy',
          })),
        },
      });
      clearScannedPatient();
      setState('done');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Dispense failed.');
    } finally {
      setBusy(false);
    }
  };

  if (state === 'done') {
    return (
      <View style={styles.center}>
        <Ionicons name="bag-check" size={72} color={colors.success} />
        <T size={22} weight="800" center>
          Dispensed & synced
        </T>
        <T size={15} color={colors.textSecondary} center>
          The medicines now appear in {scanned.payload.preview.fullName}&apos;s AgapAI app, with
          reminders and low-stock tracking.
        </T>
        <Btn label="Done" onPress={() => router.replace('/pharmacist')} />
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={styles.center}>
        <Banner text={message} tone="danger" />
        <Btn label="Back" onPress={() => router.replace('/pharmacist')} />
      </View>
    );
  }

  if (state === 'loading' || !record) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-open" size={44} color={colors.primary} />
        <T size={16} color={colors.textSecondary}>
          Fetching & decrypting latest prescription…
        </T>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <Card style={styles.patientCard}>
        <T size={18} weight="700">
          {scanned.payload.preview.fullName}
        </T>
        <T size={13} color={colors.textSecondary}>
          {row?.type} · Dr. {row?.doctor?.firstName} {row?.doctor?.lastName} (PRC{' '}
          {row?.doctor?.prcLicense ?? '—'}) · {row ? new Date(row.date).toLocaleDateString() : ''}
        </T>
        {scanned.user && scanned.user.allergies.length > 0 ? (
          <View style={styles.allergyBox}>
            <T size={13} weight="700" color={colors.danger}>
              ⚠ Allergies: {scanned.user.allergies.join(', ')}
            </T>
          </View>
        ) : null}
        {row?.dispensedAt ? (
          <Banner text={`Already dispensed on ${new Date(row.dispensedAt).toLocaleString()} — double-check before dispensing again.`} tone="warning" />
        ) : null}
      </Card>

      <View style={styles.lockRow}>
        <Ionicons name="lock-open" size={16} color={colors.success} />
        <T size={13} color={colors.success}>
          Decrypted locally with the patient&apos;s QR key
        </T>
      </View>

      {record.description ? (
        <Card>
          <T size={13} weight="600" color={colors.textSecondary}>
            DOCTOR&apos;S NOTES
          </T>
          <T size={15}>{record.description}</T>
        </Card>
      ) : null}

      <T size={16} weight="700">
        Dispense checklist
      </T>
      {items.length === 0 ? (
        <Card>
          <T size={15} color={colors.textSecondary}>
            This record has no typed prescriptions{record.rxImageB64 ? ' (paper scan only — ask the doctor to type next time)' : ''}.
          </T>
        </Card>
      ) : (
        items.map((it, i) => (
          <Card key={i} style={styles.itemCard}>
            <Pressable
              onPress={() => setItems((rows) => rows.map((x, j) => (j === i ? { ...x, checked: !x.checked } : x)))}
              style={styles.itemRow}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: it.checked }}
            >
              <Ionicons
                name={it.checked ? 'checkbox' : 'square-outline'}
                size={28}
                color={it.checked ? colors.primary : colors.textMuted}
              />
              <View style={styles.flex}>
                <T size={16} weight="700">
                  {it.name} {it.dosage ? `— ${it.dosage}` : ''}
                </T>
                <T size={13} color={colors.textSecondary}>
                  {it.times.length > 0 ? `Schedule: ${it.times.join(', ')}` : 'As directed'}
                </T>
              </View>
              <View style={styles.qtyBox}>
                <T size={12} color={colors.textSecondary}>
                  Qty
                </T>
                <TextInput
                  value={it.quantity}
                  onChangeText={(v) =>
                    setItems((rows) => rows.map((x, j) => (j === i ? { ...x, quantity: v } : x)))
                  }
                  keyboardType="number-pad"
                  style={styles.qtyInput}
                />
              </View>
            </Pressable>
          </Card>
        ))
      )}

      {message ? <Banner text={message} tone="danger" /> : null}

      <Btn
        label={`Dispense ${items.filter((i) => i.checked).length} item(s) & sync to patient`}
        onPress={() => void dispense()}
        loading={busy}
        disabled={items.filter((i) => i.checked).length === 0}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceMuted },
  scroll: { padding: spacing.xl, gap: spacing.lg, paddingBottom: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.lg },
  patientCard: { gap: spacing.sm },
  allergyBox: { backgroundColor: colors.dangerLight, borderRadius: radii.md, padding: spacing.md },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemCard: { padding: spacing.lg },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  qtyBox: { alignItems: 'center', gap: 2 },
  qtyInput: {
    fontSize: 16,
    color: colors.text,
    minWidth: 56,
    minHeight: 44,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    textAlign: 'center',
    backgroundColor: colors.surface,
  },
});
