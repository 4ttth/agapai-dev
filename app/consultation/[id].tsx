import { Ionicons } from '@expo/vector-icons';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { ErrorState } from '@/components/states/ErrorState';
import { LoadingState } from '@/components/states/LoadingState';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/hooks/useAuth';
import { serverApi } from '@/services/api/server';
import { colors, radii, spacing } from '@/theme';
import type { ConsultationRow, DecryptedConsultation } from '@/types';
import { decryptRecord } from '@/utils/crypto';

/** Decrypted consultation record — readable only on the patient's device. */
export default function ConsultationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();

  const [row, setRow] = useState<ConsultationRow | null>(null);
  const [record, setRecord] = useState<DecryptedConsultation | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'locked'>('loading');
  const [playing, setPlaying] = useState(false);
  const soundRef = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    let active = true;
    serverApi
      .listConsultations()
      .then(({ consultations }) => {
        if (!active) return;
        const found = consultations.find((c) => c.id === id) ?? null;
        setRow(found);
        if (!found) return setState('error');
        const key = session?.patientKey;
        if (!key) return setState('locked');
        const dec = decryptRecord(
          { ciphertext: found.ciphertext, iv: found.iv, salt: found.salt },
          key,
        );
        if (!dec) return setState('locked');
        setRecord(dec);
        setState('ready');
      })
      .catch(() => active && setState('error'));
    return () => {
      active = false;
      soundRef.current?.remove();
    };
  }, [id, session?.patientKey]);

  const playVoice = useCallback(async () => {
    if (!record?.voiceB64) return;
    if (playing) {
      soundRef.current?.pause();
      soundRef.current?.remove();
      soundRef.current = null;
      setPlaying(false);
      return;
    }
    try {
      // Materialize the encrypted-then-decrypted note as a cache file — data:
      // URIs aren't reliably playable by the native players.
      const file = `${FileSystem.cacheDirectory}voice-note.m4a`;
      await FileSystem.writeAsStringAsync(file, record.voiceB64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await setAudioModeAsync({ playsInSilentMode: true });
      const player = createAudioPlayer({ uri: file });
      soundRef.current = player;
      player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) setPlaying(false);
      });
      player.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }, [record, playing]);

  if (state === 'loading') return <LoadingState message="Decrypting your record…" />;
  if (state === 'error' || !row)
    return <ErrorState message="We could not load this consultation." onRetry={() => router.back()} />;
  if (state === 'locked')
    return (
      <ErrorState
        message="This record is encrypted with a key this phone doesn't have — it looks like you signed in on a new phone. Pass a quick Face Liveness test to release your records to this device (your old phone will then stop working)."
        retryLabel="Recover with Face Liveness"
        onRetry={() => router.push('/recover-records')}
      />
    );

  return (
    <Screen>
      <View style={styles.head}>
        <Badge label={row.type} tone="primary" />
        {row.dispensedAt ? <Badge label="Dispensed" tone="success" /> : null}
      </View>
      <AppText variant="title">Dr. {row.doctor?.firstName} {row.doctor?.lastName}</AppText>
      <AppText variant="caption" color="secondary" style={styles.meta}>
        {new Date(row.date).toLocaleString()} · PRC License No. {row.doctor?.prcLicense ?? 'pending'}
      </AppText>

      <View style={styles.lockRow}>
        <Ionicons name="lock-open" size={16} color={colors.success} />
        <AppText variant="caption" color="success">
          Decrypted on this device with your Health ID key
        </AppText>
      </View>

      <Card style={styles.section}>
        <AppText variant="section" style={styles.sectionTitle}>
          Doctor&apos;s notes
        </AppText>
        {record?.description ? (
          <AppText variant="body">{record.description}</AppText>
        ) : (
          <AppText variant="body" color="secondary">
            (No written notes)
          </AppText>
        )}
        {record?.voiceB64 ? (
          <Button
            label={playing ? 'Stop voice note' : 'Play voice note'}
            variant="secondary"
            icon={<Ionicons name={playing ? 'stop' : 'play'} size={20} color={colors.primary} />}
            onPress={() => void playVoice()}
          />
        ) : null}
      </Card>

      <Card style={styles.section}>
        <AppText variant="section" style={styles.sectionTitle}>
          Prescriptions
        </AppText>
        {record && record.prescriptions.length > 0 ? (
          <View style={styles.rxList}>
            {record.prescriptions.map((p, i) => (
              <View key={i} style={styles.rxRow}>
                <View style={styles.rxIcon}>
                  <Ionicons name="medkit" size={18} color={colors.primary} />
                </View>
                <View style={styles.flex}>
                  <AppText variant="label">
                    {p.name} {p.dosage ? `— ${p.dosage}` : ''}
                  </AppText>
                  <AppText variant="caption" color="secondary">
                    {p.times.length > 0 ? `Take at ${p.times.join(', ')}` : 'As directed'}
                    {p.quantity ? ` · Qty ${p.quantity}` : ''}
                  </AppText>
                  {p.instructions ? (
                    <AppText variant="caption" color="secondary">
                      {p.instructions}
                    </AppText>
                  ) : null}
                </View>
              </View>
            ))}
            <View style={styles.autoAddedRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.success} />
              <AppText variant="caption" color="success" style={styles.flex}>
                These medicines were added to My Medicines automatically and now power your reminders.
                They&apos;re managed by your doctor, so they can&apos;t be edited here.
              </AppText>
            </View>
          </View>
        ) : (
          <AppText variant="body" color="secondary">
            No prescriptions in this record.
          </AppText>
        )}
        {record?.rxImageB64 ? (
          <Image
            source={{ uri: `data:image/jpeg;base64,${record.rxImageB64}` }}
            style={styles.rxImage}
            accessibilityLabel="Scanned paper prescription"
            resizeMode="contain"
          />
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  meta: { marginTop: spacing.xs },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm },
  section: { marginTop: spacing.lg },
  sectionTitle: { marginBottom: spacing.md },
  rxList: { gap: spacing.lg },
  rxRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  rxIcon: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rxImage: { width: '100%', height: 260, marginTop: spacing.lg, borderRadius: radii.md },
  flex: { flex: 1 },
  autoAddedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.successLight,
    borderRadius: radii.md,
    padding: spacing.md,
  },
});
