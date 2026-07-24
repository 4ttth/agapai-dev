import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import {
  followUpApi,
  type FollowUpShareRow,
  type SharedAiHistoryPayload,
  type SharedConsultationPayload,
} from '@/lib/api';
import { decryptJson } from '@/lib/crypto';
import { getDeviceKeyPair, loadThreadKey, openSealed, saveThreadKey } from '@/lib/followupKeys';
import { colors, radii, spacing } from '@/lib/theme';
import { Card, T } from '@/lib/ui';
import { useFollowUpThread } from '@/lib/useFollowUpThread';
import { useSession } from '@/lib/SessionContext';

/** Doctor's end-to-end encrypted follow-up conversation with a patient. */
export default function ProFollowUpChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const [threadKey, setThreadKey] = useState<string | null>(null);
  const [keyResolved, setKeyResolved] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [showShares, setShowShares] = useState(true);
  const scrollRef = useRef<ScrollView>(null);

  // Resolve the thread key: cached, else unwrap the sealed wrap with our secret.
  useEffect(() => {
    let active = true;
    (async () => {
      let key = await loadThreadKey(id);
      if (!key) {
        try {
          const detail = await followUpApi.get(id);
          if (detail.wrap) {
            const { secretKey } = await getDeviceKeyPair();
            key = openSealed(detail.wrap, secretKey);
            if (key) await saveThreadKey(id, key);
          }
        } catch {
          /* leave key null → locked */
        }
      }
      if (!active) return;
      setThreadKey(key);
      setKeyResolved(true);
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const { status, error, thread, shares, messages, live, incomingCall, send, close, declineIncomingCall } =
    useFollowUpThread(id, threadKey);

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [messages.length]);

  const callEnabled = session?.user.followUpCall ?? false;
  const closed = thread?.status === 'CLOSED';

  const onSend = async () => {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    setDraft('');
    try {
      await send(text);
    } catch {
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  if (!keyResolved || status === 'loading')
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  if (keyResolved && !threadKey)
    return (
      <View style={styles.centered}>
        <T size={16} weight="600" center>
          This follow-up is locked
        </T>
        <T size={14} color={colors.textSecondary} center style={styles.centeredText}>
          Its key was sealed to a different device of yours. Open it on the device you registered on.
        </T>
      </View>
    );
  if (status === 'error')
    return (
      <View style={styles.centered}>
        <T size={16} weight="600" center>
          {error ?? 'Could not open this follow-up.'}
        </T>
      </View>
    );

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={styles.header}>
        <View style={styles.flex}>
          <T size={17} weight="700">
            {thread?.counterpart?.firstName} {thread?.counterpart?.lastName}
          </T>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: live ? colors.success : colors.textMuted }]} />
            <T size={12} color={colors.textSecondary}>
              {live ? 'Connected' : 'Reconnecting…'} · end-to-end encrypted
            </T>
          </View>
        </View>
        {callEnabled && !closed ? (
          <Pressable
            onPress={() =>
              router.push(`/follow-up/call/${id}?mode=${incomingCall ? 'callee' : 'caller'}`)
            }
            hitSlop={12}
            style={[styles.iconBtn, incomingCall && styles.incomingIconBtn]}
            accessibilityRole="button"
            accessibilityLabel="Call patient"
          >
            <Ionicons name="call" size={22} color={incomingCall ? colors.onPrimary : colors.primary} />
          </Pressable>
        ) : null}
        {!closed ? (
          <Pressable
            onPress={() => void close()}
            hitSlop={12}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel="Close follow-up"
          >
            <Ionicons name="checkmark-done" size={22} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {incomingCall ? (
        <View style={styles.callBanner}>
          <Ionicons name="call" size={20} color={colors.onPrimary} />
          <T size={14} color={colors.onPrimary} style={styles.callBannerText}>
            Incoming call from patient {thread?.counterpart?.firstName}…
          </T>
          <Pressable
            onPress={declineIncomingCall}
            style={[styles.callBannerBtn, styles.declineBtn]}
            accessibilityRole="button"
            accessibilityLabel="Decline call"
          >
            <T size={12} color={colors.onPrimary} weight="600">
              Decline
            </T>
          </Pressable>
          <Pressable
            onPress={() => router.push(`/follow-up/call/${id}?mode=callee`)}
            style={[styles.callBannerBtn, styles.answerBtn]}
            accessibilityRole="button"
            accessibilityLabel="Answer call"
          >
            <T size={12} color={colors.onPrimary} weight="600">
              Answer
            </T>
          </Pressable>
        </View>
      ) : null}

      {shares.length > 0 ? (
        <View style={styles.sharesWrap}>
          <Pressable style={styles.sharesToggle} onPress={() => setShowShares((v) => !v)}>
            <Ionicons name="attach" size={16} color={colors.textSecondary} />
            <T size={13} weight="600" color={colors.textSecondary}>
              {shares.length} shared item{shares.length === 1 ? '' : 's'} from the patient
            </T>
            <Ionicons name={showShares ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
          </Pressable>
          {showShares
            ? shares.map((s) => <ShareCard key={s.id} share={s} threadKey={threadKey!} />)
            : null}
        </View>
      ) : null}

      <ScrollView ref={scrollRef} contentContainerStyle={styles.messages} showsVerticalScrollIndicator={false}>
        {messages.length === 0 ? (
          <T size={13} color={colors.textMuted} center style={styles.emptyHint}>
            No messages yet.
          </T>
        ) : (
          messages.map((m) => (
            <View key={m.id} style={[styles.bubble, m.who === 'me' ? styles.mine : styles.theirs]}>
              <T size={15} color={m.who === 'me' ? colors.onPrimary : colors.text}>
                {m.text}
              </T>
              <T size={11} color={m.who === 'me' ? '#DCF0EF' : colors.textMuted} style={styles.time}>
                {new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </T>
            </View>
          ))
        )}
      </ScrollView>

      {closed ? (
        <View style={styles.closedBar}>
          <T size={13} color={colors.textSecondary} center>
            This follow-up is closed.
          </T>
        </View>
      ) : (
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Type a reply…"
            placeholderTextColor={colors.textMuted}
            value={draft}
            onChangeText={setDraft}
            multiline
            accessibilityLabel="Message"
          />
          <Pressable
            onPress={() => void onSend()}
            disabled={sending || !draft.trim()}
            style={[styles.send, (sending || !draft.trim()) && styles.sendDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Send"
          >
            <Ionicons name="send" size={20} color={colors.onPrimary} />
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

/** Decrypts and renders one shared attachment (consultation or AI history). */
function ShareCard({ share, threadKey }: { share: FollowUpShareRow; threadKey: string }) {
  const blob = { ciphertext: share.ciphertext, iv: share.iv, salt: share.salt };
  if (share.kind === 'CONSULTATION') {
    const p = decryptJson<SharedConsultationPayload>(blob, threadKey);
    if (!p) return null;
    return (
      <Card style={styles.shareCard}>
        <View style={styles.shareHead}>
          <Ionicons name="document-lock" size={18} color={colors.primary} />
          <T size={14} weight="700">
            {p.type ?? 'Past consultation'}
          </T>
        </View>
        {p.date ? (
          <T size={12} color={colors.textMuted}>
            {new Date(p.date).toLocaleDateString()} {p.doctorName ? `· ${p.doctorName}` : ''}
          </T>
        ) : null}
        {p.description ? (
          <T size={14} color={colors.textSecondary} style={styles.shareBody}>
            {p.description}
          </T>
        ) : null}
        {p.prescriptions?.length ? (
          <T size={13} color={colors.text}>
            Rx: {p.prescriptions.map((r) => `${r.name}${r.dosage ? ` (${r.dosage})` : ''}`).join(', ')}
          </T>
        ) : null}
        {p.hasVoice ? (
          <T size={12} color={colors.textMuted}>
            🎙 Includes a voice note
          </T>
        ) : null}
      </Card>
    );
  }
  const p = decryptJson<SharedAiHistoryPayload>(blob, threadKey);
  if (!p) return null;
  return (
    <Card style={styles.shareCard}>
      <View style={styles.shareHead}>
        <Ionicons name="sparkles" size={18} color={colors.primary} />
        <T size={14} weight="700">
          AI assistant history
        </T>
      </View>
      {p.conversations.slice(0, 3).map((c, i) => (
        <View key={i} style={styles.aiConvo}>
          <T size={12} color={colors.textMuted}>
            {new Date(c.startedAt).toLocaleDateString()} · {c.mode}
          </T>
          {c.messages.slice(0, 4).map((m, j) => (
            <T key={j} size={13} color={m.who === 'user' ? colors.text : colors.textSecondary}>
              {m.who === 'user' ? 'Patient: ' : 'AI: '}
              {m.text}
            </T>
          ))}
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.sm },
  centeredText: { maxWidth: 300 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  flex: { flex: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sharesWrap: { backgroundColor: colors.surfaceMuted, padding: spacing.md, gap: spacing.sm },
  sharesToggle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  shareCard: { padding: spacing.md, gap: spacing.xs },
  shareHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  shareBody: { marginTop: spacing.xs },
  aiConvo: { marginTop: spacing.xs, gap: 2 },
  messages: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  emptyHint: { marginTop: spacing.xxl },
  bubble: { maxWidth: '82%', borderRadius: radii.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primary },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surfaceMuted },
  time: { marginTop: 2 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    color: colors.text,
  },
  send: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.4 },
  closedBar: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
  incomingIconBtn: { backgroundColor: colors.success },
  callBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  callBannerText: { flex: 1 },
  callBannerBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
  },
  declineBtn: { backgroundColor: colors.danger },
  answerBtn: { backgroundColor: colors.success },
});
