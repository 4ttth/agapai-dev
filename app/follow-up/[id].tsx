import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { ErrorState } from '@/components/states/ErrorState';
import { LoadingState } from '@/components/states/LoadingState';
import { AppText } from '@/components/ui/AppText';
import { useFollowUpThread } from '@/hooks/useFollowUpThread';
import { serverApi } from '@/services/api/server';
import { colors, radii, spacing } from '@/theme';
import { loadThreadKey } from '@/utils/followupKeys';

/** Patient's end-to-end encrypted follow-up conversation with their doctor. */
export default function FollowUpChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [threadKey, setThreadKey] = useState<string | null>(null);
  const [keyResolved, setKeyResolved] = useState(false);
  const [callEnabled, setCallEnabled] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    loadThreadKey(id).then((k) => {
      setThreadKey(k);
      setKeyResolved(true);
    });
    serverApi
      .followUpEligibility()
      .then((e) => setCallEnabled(!!e.callEnabled))
      .catch(() => {});
  }, [id]);

  const { status, error, thread, shares, messages, live, send, close } = useFollowUpThread(
    id,
    threadKey,
    'PATIENT',
  );

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(t);
  }, [messages.length]);

  const onSend = async () => {
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    setDraft('');
    try {
      await send(text);
    } catch {
      setDraft(text); // restore on failure
    } finally {
      setSending(false);
    }
  };

  if (keyResolved && !threadKey)
    return (
      <ErrorState
        message="This follow-up was started on another device, so its key isn't on this phone. Open it from the phone you started it on."
        onRetry={() => router.back()}
        retryLabel="Go back"
      />
    );
  if (status === 'loading' || !keyResolved) return <LoadingState message="Opening secure chat…" />;
  if (status === 'error') return <ErrorState message={error ?? 'Could not open this follow-up.'} onRetry={() => router.back()} />;

  const closed = thread?.status === 'CLOSED';

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={styles.header}>
        <View style={styles.flex}>
          <AppText variant="section" numberOfLines={1}>
            Dr. {thread?.counterpart?.firstName} {thread?.counterpart?.lastName}
          </AppText>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: live ? colors.success : colors.textMuted }]} />
            <AppText variant="caption" color="secondary">
              {live ? 'Connected' : 'Reconnecting…'} · end-to-end encrypted
            </AppText>
          </View>
        </View>
        {callEnabled && !closed ? (
          <Pressable
            onPress={() => router.push(`/follow-up/call/${id}` as never)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Call doctor"
            style={styles.iconBtn}
          >
            <Ionicons name="call" size={22} color={colors.primary} />
          </Pressable>
        ) : null}
        {!closed ? (
          <Pressable
            onPress={() => void close()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close follow-up"
            style={styles.iconBtn}
          >
            <Ionicons name="checkmark-done" size={22} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {shares.length > 0 ? (
        <View style={styles.sharesBar}>
          <Ionicons name="attach" size={14} color={colors.textSecondary} />
          <AppText variant="caption" color="secondary">
            Shared: {shares.map((s) => (s.kind === 'CONSULTATION' ? s.label || 'consultation' : 'AI history')).join(', ')}
          </AppText>
        </View>
      ) : null}

      <ScrollView ref={scrollRef} contentContainerStyle={styles.messages} showsVerticalScrollIndicator={false}>
        {messages.length === 0 ? (
          <AppText variant="caption" color="muted" center style={styles.emptyHint}>
            No messages yet. Say hello and describe how you&apos;re feeling.
          </AppText>
        ) : (
          messages.map((m) => (
            <View key={m.id} style={[styles.bubble, m.who === 'me' ? styles.mine : styles.theirs]}>
              <AppText variant="body" color={m.who === 'me' ? 'inverse' : 'primary'}>
                {m.text}
              </AppText>
              <AppText variant="caption" color={m.who === 'me' ? 'inverse' : 'muted'} style={styles.time}>
                {new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </AppText>
            </View>
          ))
        )}
      </ScrollView>

      {closed ? (
        <View style={styles.closedBar}>
          <AppText variant="caption" color="secondary" center>
            This follow-up is closed.
          </AppText>
        </View>
      ) : (
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Type a message…"
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
            accessibilityLabel="Send message"
          >
            <Ionicons name="send" size={20} color={colors.onPrimary} />
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
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
  sharesBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceMuted,
  },
  messages: { padding: spacing.lg, gap: spacing.sm, flexGrow: 1 },
  emptyHint: { marginTop: spacing.xxl },
  bubble: { maxWidth: '82%', borderRadius: radii.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primary },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surfaceMuted },
  time: { marginTop: 2, opacity: 0.8 },
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
    color: colors.textPrimary,
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
});
