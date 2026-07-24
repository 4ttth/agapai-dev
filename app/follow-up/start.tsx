import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ErrorState } from '@/components/states/ErrorState';
import { LoadingState } from '@/components/states/LoadingState';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/Field';
import { useAuth } from '@/hooks/useAuth';
import { serverApi, type EncryptedBlob } from '@/services/api/server';
import { colors, radii, spacing } from '@/theme';
import type {
  ConsultationRow,
  FollowUpEligibility,
  SharedAiHistoryPayload,
  SharedConsultationPayload,
} from '@/types';
import { decryptRecord, encryptJson } from '@/utils/crypto';
import { makeThreadKey, saveThreadKey, sealTo } from '@/utils/followupKeys';
import { listConversations } from '@/utils/conversationHistory';

/** Start a follow-up: pick what to share for 7 days, then open the chat. */
export default function StartFollowUpScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const params = useLocalSearchParams<{ consultationId?: string }>();

  const [elig, setElig] = useState<FollowUpEligibility | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [shareConsult, setShareConsult] = useState(true);
  const [shareAi, setShareAi] = useState(false);
  const [firstMessage, setFirstMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    serverApi
      .followUpEligibility()
      .then((e) => {
        if (!active) return;
        if (e.existingThreadId) {
          router.replace(`/follow-up/${e.existingThreadId}` as never);
          return;
        }
        setElig(e);
        setState('ready');
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Could not check follow-up availability.');
        setState('error');
      });
    return () => {
      active = false;
    };
  }, [router]);

  const consultationId = params.consultationId ?? elig?.consultationId ?? null;

  const onStart = useCallback(async () => {
    if (!elig?.doctor) return;
    if (!elig.doctor.publicKey) {
      setError("This doctor hasn't finished setting up secure follow-ups yet. Please try again later.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const threadKey = await makeThreadKey();
      const sealed = sealTo(elig.doctor.publicKey, threadKey);

      const shares: Array<{ kind: 'CONSULTATION' | 'AI_HISTORY'; label?: string } & EncryptedBlob> = [];

      // Re-share the past consultation this follow-up is about (transcript,
      // prescriptions, and the doctor's voice note) — decrypted here with the
      // patient key, then re-encrypted to the thread key for the doctor.
      if (shareConsult && consultationId && session?.patientKey) {
        const { consultations } = await serverApi.listConsultations();
        const row = consultations.find((c) => c.id === consultationId);
        if (row) {
          const dec = decryptRecord({ ciphertext: row.ciphertext, iv: row.iv, salt: row.salt }, session.patientKey);
          if (dec) {
            const payload: SharedConsultationPayload = {
              date: row.date,
              type: row.type,
              doctorName: row.doctor ? `Dr. ${row.doctor.firstName} ${row.doctor.lastName}` : undefined,
              description: dec.description,
              prescriptions: dec.prescriptions,
              hasVoice: !!dec.voiceB64,
              voiceB64: dec.voiceB64,
            };
            const blob = await encryptJson(payload, threadKey);
            shares.push({ kind: 'CONSULTATION', label: row.type, ...blob });
          }
        }
      }

      // Optionally share recent AI-assistant history (kept on-device today).
      if (shareAi) {
        const convos = await listConversations();
        const payload: SharedAiHistoryPayload = {
          conversations: convos.slice(0, 5).map((c) => ({
            startedAt: c.startedAt,
            mode: c.mode,
            messages: c.messages.map((m) => ({ who: m.who, text: m.text })),
          })),
        };
        if (payload.conversations.length > 0) {
          const blob = await encryptJson(payload, threadKey);
          shares.push({ kind: 'AI_HISTORY', label: 'AI assistant history', ...blob });
        }
      }

      const firstBlob: EncryptedBlob | undefined = firstMessage.trim()
        ? await encryptJson({ text: firstMessage.trim() }, threadKey)
        : undefined;

      const { thread } = await serverApi.startFollowUp({
        doctorId: elig.doctor.id,
        consultationId,
        sealed,
        shares,
        firstMessage: firstBlob,
      });
      await saveThreadKey(thread.id, threadKey);
      router.replace(`/follow-up/${thread.id}` as never);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the follow-up.');
      setSubmitting(false);
    }
  }, [elig, consultationId, session?.patientKey, shareConsult, shareAi, firstMessage, router]);

  if (state === 'loading') return <LoadingState message="Checking availability…" />;
  if (state === 'error')
    return <ErrorState message={error ?? 'Something went wrong.'} onRetry={() => router.back()} />;
  if (!elig?.eligible || !elig.doctor)
    return (
      <ErrorState
        message="Follow-ups aren't available. They open only with your most recent doctor, once that doctor turns them on."
        onRetry={() => router.back()}
        retryLabel="Go back"
      />
    );

  const doctor = elig.doctor;

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Card style={styles.card}>
        <View style={styles.row}>
          <View style={styles.avatar}>
            <Ionicons name="medical" size={22} color={colors.onPrimary} />
          </View>
          <View style={styles.flex}>
            <AppText variant="section">
              Dr. {doctor.firstName} {doctor.lastName}
            </AppText>
            <AppText variant="caption" color="secondary">
              PRC {doctor.prcLicense ?? '—'} · your most recent doctor
            </AppText>
          </View>
        </View>
      </Card>

      <AppText variant="label" style={styles.sectionLabel}>
        Share with your doctor (for 7 days)
      </AppText>
      <AppText variant="caption" color="secondary" style={styles.hint}>
        Anything you share is encrypted for this doctor only and deleted automatically after 7 days.
      </AppText>

      <ShareToggle
        icon="document-lock"
        title="This consultation"
        subtitle="Transcript, prescriptions & the doctor's voice note"
        value={shareConsult}
        disabled={!consultationId || !session?.patientKey}
        onToggle={() => setShareConsult((v) => !v)}
      />
      <ShareToggle
        icon="sparkles"
        title="My AI assistant history"
        subtitle="Your recent chats with the AgapAI assistant"
        value={shareAi}
        onToggle={() => setShareAi((v) => !v)}
      />

      <View style={styles.messageField}>
        <TextField
          label="First message (optional)"
          placeholder="e.g. My cough is still there after 5 days…"
          value={firstMessage}
          onChangeText={setFirstMessage}
          multiline
          numberOfLines={3}
        />
      </View>

      {error ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}

      <Button
        label="Start follow-up"
        loading={submitting}
        onPress={() => void onStart()}
        icon={<Ionicons name="lock-closed" size={18} color={colors.onPrimary} />}
      />
    </ScrollView>
  );
}

function ShareToggle({
  icon,
  title,
  subtitle,
  value,
  disabled,
  onToggle,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  value: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onToggle}
      style={[styles.toggle, disabled && styles.toggleDisabled]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value, disabled }}
    >
      <View style={styles.toggleIcon}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <View style={styles.flex}>
        <AppText variant="label">{title}</AppText>
        <AppText variant="caption" color="secondary">
          {disabled ? 'Not available' : subtitle}
        </AppText>
      </View>
      <Ionicons
        name={value ? 'checkbox' : 'square-outline'}
        size={24}
        color={value ? colors.primary : colors.textMuted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.xl, gap: spacing.lg },
  card: { padding: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  sectionLabel: { marginTop: spacing.sm },
  hint: { marginTop: -spacing.sm },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  toggleDisabled: { opacity: 0.5 },
  toggleIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageField: { marginTop: spacing.sm },
});
