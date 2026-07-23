import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useMedications } from '@/features/pill-tracker';
import { useAuth } from '@/hooks/useAuth';
import { useGeminiLive } from '@/hooks/useGeminiLive';
import { useSpeech } from '@/hooks/useSpeech';
import { serverApi } from '@/services/api/server';
import { colors, layout, palette, radii, spacing, typography } from '@/theme';
import type { ConsultationRow } from '@/types';
import { saveConversation } from '@/utils/conversationHistory';
import { createId } from '@/utils/id';

interface Msg {
  id: string;
  who: 'user' | 'ai';
  text: string;
  source?: string;
}

type Mode = 'voice' | 'text';

const SUGGESTIONS = [
  'I feel dizzy and nauseous',
  'What are my medications today?',
  'Home remedies for cough',
  'When was my last consultation?',
];

/**
 * AI Health Assistant. Voice-first: the main screen is a live voice
 * conversation, and patients who can't (or would rather not) speak can switch
 * to text chat at any time.
 *
 * Symptom questions → AgapAI's home-remedy engine; government/general questions
 * → live eGov AI; questions about your own medications/consultations are
 * answered on-device only.
 */
export default function AssistantScreen() {
  const { session } = useAuth();
  const { medications, todaysDoses } = useMedications();
  const { speaking, speak, stop } = useSpeech();
  const live = useGeminiLive();
  const [mode, setMode] = useState<Mode>('voice');
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: 'hello',
      who: 'ai',
      text: `Kumusta${session?.user ? `, ${session.user.firstName}` : ''}! I'm your AgapAI assistant. Tell me how you're feeling (like "masakit ang ulo ko"), or ask about your medicines and past consultations.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [voiceReplies, setVoiceReplies] = useState(true);
  /** Text pulled out of a document the patient photographed, sent as context. */
  const [docText, setDocText] = useState<string | null>(null);
  const [docName, setDocName] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const consultRef = useRef<ConsultationRow[] | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const router = useRouter();

  // Local conversation history (this device only).
  const textConvId = useRef(createId('conv'));
  const textStartedAt = useRef(new Date().toISOString());
  const prevLiveState = useRef(live.state);
  const voiceStartedAt = useRef<string | null>(null);

  // Persist the typed conversation as it grows (only once there's a real message).
  useEffect(() => {
    if (!messages.some((m) => m.who === 'user')) return;
    void saveConversation({
      id: textConvId.current,
      mode: 'text',
      startedAt: textStartedAt.current,
      updatedAt: new Date().toISOString(),
      messages: messages.map((m) => ({ who: m.who, text: m.text, source: m.source })),
    });
  }, [messages]);

  // Save the voice-call transcript when a call ends.
  useEffect(() => {
    const prev = prevLiveState.current;
    prevLiveState.current = live.state;
    if (live.state === 'connecting') voiceStartedAt.current = new Date().toISOString();
    const callEnded =
      (prev === 'live' || prev === 'connecting') && (live.state === 'idle' || live.state === 'error');
    if (callEnded && live.transcript.length > 0) {
      const now = new Date().toISOString();
      void saveConversation({
        id: createId('conv'),
        mode: 'voice',
        startedAt: voiceStartedAt.current ?? now,
        updatedAt: now,
        messages: live.transcript.map((t) => ({ who: t.who, text: t.text })),
      });
    }
  }, [live.state, live.transcript]);

  const firstName = session?.user?.firstName;
  const greeting = useMemo(
    () => `Kumusta${firstName ? `, ${firstName}` : ''}! Tap the mic and tell me how you're feeling.`,
    [firstName],
  );

  /** Gentle pulse behind the mic orb while a call is live. */
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (live.state === 'live') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 1200, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
    pulse.setValue(0);
  }, [live.state, pulse]);

  /** Photograph or pick a lab result / prescription → eGov AI extracts the text. */
  const attachDocument = useCallback(async () => {
    try {
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        base64: true,
      });
      const asset = picked.assets?.[0];
      if (picked.canceled || !asset?.base64) return;
      setReading(true);
      const { text } = await serverApi.extractDocument(
        asset.base64,
        asset.fileName ?? 'document.jpg',
        asset.mimeType ?? 'image/jpeg',
      );
      setDocText(text);
      setDocName(asset.fileName ?? 'Document');
      setMessages((m) => [
        ...m,
        {
          id: `d${Date.now()}`,
          who: 'ai',
          text: `I've read your document. Ask me anything about it — for example "ano ibig sabihin nito?"`,
          source: 'egov-document-extractor',
        },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          id: `de${Date.now()}`,
          who: 'ai',
          text:
            err instanceof Error && err.message
              ? err.message
              : 'I could not read that document. Try a clearer, well-lit photo.',
        },
      ]);
    } finally {
      setReading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    }
  }, []);

  useEffect(() => {
    serverApi
      .listConsultations()
      .then(({ consultations }) => {
        consultRef.current = consultations;
      })
      .catch(() => {
        consultRef.current = [];
      });
  }, []);

  /** Personal-data questions answered on-device — this data never leaves the phone. */
  const localAnswer = useCallback(
    (q: string): string | null => {
      const p = q.toLowerCase();
      const asksMeds = /\b(medication|medications|medicine|medicines|meds|gamot|reseta|pill)\b/.test(p);
      const asksConsult = /\b(consultation|check-?up|doctor visit|last visit|nakaraang konsulta|konsulta)\b/.test(p);

      if (asksMeds) {
        if (medications.length === 0)
          return 'You have no medicines saved yet. Add one from the Meds tab and I can remind you about it!';
        const today = todaysDoses
          .map(
            (d) =>
              `• ${d.medication.name} (${d.medication.dosage}${d.medication.unit ? ` ${d.medication.unit}` : ''}) at ${new Date(d.dose.scheduledAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
          )
          .join('\n');
        return `Here are your medicines for today (from this phone only):\n\n${today || '• Nothing scheduled today'}\n\nYou have ${medications.length} medicine${medications.length === 1 ? '' : 's'} saved in total.`;
      }

      if (asksConsult) {
        const list = consultRef.current ?? [];
        if (list.length === 0) return "I don't see any consultations on record yet. After your next visit, your doctor will upload one securely.";
        const last = list[0];
        return `Your most recent consultation was a "${last.type}" with Dr. ${last.doctor?.firstName ?? ''} ${last.doctor?.lastName ?? ''} on ${new Date(last.date).toLocaleDateString()}. Open Records → Consultations to read the full encrypted record. You have ${list.length} consultation${list.length === 1 ? '' : 's'} in total.`;
      }

      return null;
    },
    [medications, todaysDoses],
  );

  const send = useCallback(
    async (raw?: string) => {
      const text = (raw ?? input).trim();
      if (!text || busy) return;
      setInput('');
      setMessages((m) => [...m, { id: `u${Date.now()}`, who: 'user', text }]);
      setBusy(true);
      try {
        const local = localAnswer(text);
        const reply = local
          ? { reply: local, source: 'on-device' }
          : await serverApi.askAssistant(text, session?.user.firstName, docText ?? undefined);
        setMessages((m) => [
          ...m,
          { id: `a${Date.now()}`, who: 'ai', text: reply.reply, source: reply.source },
        ]);
        if (voiceReplies) speak(reply.reply.replace(/[•⚠]/g, ''));
      } catch (err) {
        setMessages((m) => [
          ...m,
          {
            id: `e${Date.now()}`,
            who: 'ai',
            text:
              err instanceof Error && err.message.includes('server')
                ? err.message
                : 'Sorry, I had trouble answering. Please check your connection and try again.',
          },
        ]);
      } finally {
        setBusy(false);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
      }
    },
    [input, busy, localAnswer, session, voiceReplies, speak, docText],
  );

  /** Tapping the mic orb starts a call (or ends it if one is running). */
  const toggleCall = useCallback(() => {
    if (live.state === 'live' || live.state === 'connecting') {
      live.stop();
    } else {
      stop(); // silence any text-to-speech before opening the mic
      void live.start(docText ?? undefined);
    }
  }, [live, stop, docText]);

  const goToText = useCallback(() => {
    if (live.state === 'live' || live.state === 'connecting') live.stop();
    setMode('text');
  }, [live]);

  const goToVoice = useCallback(() => {
    stop(); // silence text-to-speech when returning to the voice screen
    setMode('voice');
  }, [stop]);

  const isConnecting = live.state === 'connecting';
  const isLive = live.state === 'live';
  const isError = live.state === 'error';

  const orbIcon = isConnecting
    ? 'ellipsis-horizontal'
    : isError
      ? 'refresh'
      : isLive && live.speaking
        ? 'volume-high'
        : 'mic';

  const statusTitle = isConnecting
    ? 'Connecting…'
    : isError
      ? "Couldn't start voice"
      : isLive
        ? live.speaking
          ? 'Assistant is speaking'
          : 'Listening…'
        : 'Tap to talk';

  const statusHint = isConnecting
    ? 'Getting the voice assistant ready.'
    : isError
      ? (live.error ?? 'Tap the mic to try again.')
      : isLive
        ? live.speaking
          ? 'Just talk to interrupt anytime.'
          : 'Speak naturally — I’m listening.'
        : 'I’ll listen and reply out loud. No typing needed.';

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <View style={styles.header}>
        <AppText variant="heading">Health Assistant</AppText>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => router.push('/assistant-history')}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel="Conversation history"
            accessibilityHint="Opens your saved chats and voice transcripts"
          >
            <Ionicons name="time-outline" size={20} color={colors.primary} />
          </Pressable>
          <Pressable
            onPress={mode === 'voice' ? goToText : goToVoice}
            style={styles.modeSwitch}
            accessibilityRole="button"
            accessibilityLabel={mode === 'voice' ? 'Switch to text chat' : 'Switch to voice'}
          >
            <Ionicons
              name={mode === 'voice' ? 'chatbubble-ellipses-outline' : 'mic-outline'}
              size={18}
              color={colors.primary}
            />
            <AppText variant="label" color="accent">
              {mode === 'voice' ? 'Type' : 'Talk'}
            </AppText>
          </Pressable>
        </View>
      </View>

      {mode === 'voice' ? (
        <ScrollView
          contentContainerStyle={styles.voiceScroll}
          showsVerticalScrollIndicator={false}
        >
          <AppText variant="body" color="secondary" center style={styles.greeting}>
            {greeting}
          </AppText>

          <View style={styles.orbWrap}>
            {isLive ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.pulseRing,
                  { transform: [{ scale: ringScale }], opacity: ringOpacity },
                ]}
              />
            ) : null}
            <Pressable
              onPress={toggleCall}
              disabled={isConnecting}
              style={[
                styles.orb,
                isLive && styles.orbLive,
                isLive && live.speaking && styles.orbSpeaking,
                isError && styles.orbError,
                isConnecting && styles.orbConnecting,
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                isLive ? 'End voice conversation' : 'Start talking to the assistant'
              }
              accessibilityHint="Starts a live voice conversation with the AgapAI assistant"
            >
              <Ionicons name={orbIcon as any} size={68} color={colors.onPrimary} />
            </Pressable>
          </View>

          <AppText variant="title" center style={styles.statusTitle}>
            {statusTitle}
          </AppText>
          <AppText variant="body" color="secondary" center style={styles.statusHint}>
            {statusHint}
          </AppText>

          {isLive ? (
            <Pressable
              onPress={live.stop}
              style={styles.endBtn}
              accessibilityRole="button"
              accessibilityLabel="End voice conversation"
            >
              <Ionicons name="stop-circle" size={20} color={colors.onDanger} />
              <AppText variant="label" color="inverse">
                End conversation
              </AppText>
            </Pressable>
          ) : null}

          {docText ? (
            <View style={styles.docChip}>
              <Ionicons name="document-text" size={18} color={colors.success} />
              <AppText variant="caption" color="secondary" style={styles.flex} numberOfLines={1}>
                Reading “{docName}” — ask me about it
              </AppText>
              <Pressable
                onPress={() => {
                  setDocText(null);
                  setDocName(null);
                }}
                accessibilityRole="button"
                accessibilityLabel="Remove the attached document"
              >
                <Ionicons name="close-circle" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => void attachDocument()}
              disabled={reading}
              style={styles.secondaryAction}
              accessibilityRole="button"
              accessibilityLabel="Attach a document for the assistant to read"
              accessibilityHint="Choose a photo of a lab result or prescription"
            >
              <Ionicons
                name={reading ? 'hourglass-outline' : 'document-attach-outline'}
                size={20}
                color={colors.primary}
              />
              <AppText variant="label" color="accent">
                {reading ? 'Reading document…' : 'Attach a document'}
              </AppText>
            </Pressable>
          )}

          <Pressable
            onPress={goToText}
            style={styles.typeInstead}
            accessibilityRole="button"
            accessibilityLabel="Type a message instead"
            accessibilityHint="Opens a text chat if you would rather not speak"
          >
            <Ionicons name="keypad-outline" size={20} color={colors.textSecondary} />
            <AppText variant="label" color="secondary">
              Can’t talk right now? Type instead
            </AppText>
          </Pressable>
        </ScrollView>
      ) : (
        <>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scroll}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            showsVerticalScrollIndicator={false}
          >
            <Pressable
              onPress={goToVoice}
              style={styles.talkBanner}
              accessibilityRole="button"
              accessibilityLabel="Switch to voice conversation"
            >
              <Ionicons name="mic" size={18} color={colors.onPrimary} />
              <AppText variant="label" color="inverse" style={styles.flex}>
                Prefer to talk? Start a voice conversation
              </AppText>
              <Ionicons name="chevron-forward" size={18} color={colors.onPrimary} />
            </Pressable>

            {messages.map((m) => (
              <View
                key={m.id}
                style={[styles.bubble, m.who === 'user' ? styles.userBubble : styles.aiBubble]}
              >
                <AppText variant="body" color={m.who === 'user' ? 'inverse' : 'primary'}>
                  {m.text}
                </AppText>
                {m.source ? (
                  <AppText
                    variant="caption"
                    color={m.who === 'user' ? 'inverse' : 'muted'}
                    style={styles.source}
                  >
                    {m.source === 'gemini'
                      ? 'via Gemini AI'
                      : m.source === 'egov-ai'
                        ? 'via eGov AI'
                        : m.source === 'on-device'
                          ? 'answered on your phone only'
                          : 'AgapAI health guide'}
                  </AppText>
                ) : null}
              </View>
            ))}
            {busy ? (
              <View style={[styles.bubble, styles.aiBubble]}>
                <AppText variant="body" color="secondary">
                  Thinking…
                </AppText>
              </View>
            ) : null}

            <View style={styles.suggestions}>
              {SUGGESTIONS.map((s) => (
                <Pressable key={s} onPress={() => void send(s)} style={styles.suggestion}>
                  <AppText variant="caption" color="accent">
                    {s}
                  </AppText>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          {docText ? (
            <View style={styles.docChip}>
              <Ionicons name="document-text" size={18} color={colors.success} />
              <AppText variant="caption" color="secondary" style={styles.flex} numberOfLines={1}>
                Reading “{docName}” — ask me about it
              </AppText>
              <Pressable
                onPress={() => {
                  setDocText(null);
                  setDocName(null);
                }}
                accessibilityRole="button"
                accessibilityLabel="Remove the attached document"
              >
                <Ionicons name="close-circle" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
          ) : null}

          <View style={styles.inputRow}>
            <Pressable
              onPress={() => {
                if (speaking) stop();
                setVoiceReplies((v) => !v);
              }}
              style={[styles.roundBtn, voiceReplies && styles.voiceOn]}
              accessibilityRole="button"
              accessibilityLabel={voiceReplies ? 'Spoken replies on' : 'Spoken replies off'}
              accessibilityHint="Toggles whether replies are read aloud"
            >
              <Ionicons
                name={voiceReplies ? 'volume-high' : 'volume-mute'}
                size={22}
                color={voiceReplies ? colors.onPrimary : colors.textSecondary}
              />
            </Pressable>
            <Pressable
              onPress={() => void attachDocument()}
              disabled={reading}
              style={styles.attachBtn}
              accessibilityRole="button"
              accessibilityLabel="Attach a document for the assistant to read"
              accessibilityHint="Choose a photo of a lab result or prescription"
            >
              <Ionicons
                name={reading ? 'hourglass-outline' : 'document-attach-outline'}
                size={22}
                color={docText ? colors.success : colors.textSecondary}
              />
            </Pressable>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="How are you feeling?"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              multiline
              accessibilityLabel="Message the assistant"
              onSubmitEditing={() => void send()}
            />
            <Pressable
              onPress={() => void send()}
              disabled={busy || !input.trim()}
              style={[styles.sendBtn, (busy || !input.trim()) && styles.sendDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              <Ionicons name="arrow-up" size={22} color={colors.onPrimary} />
            </Pressable>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const ORB_SIZE = 168;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: palette.blue100,
    backgroundColor: palette.blue50,
  },
  modeSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: palette.blue100,
    backgroundColor: palette.blue50,
  },

  // --- Voice-first hero ---
  voiceScroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.xl,
    gap: spacing.lg,
  },
  greeting: { maxWidth: 320 },
  orbWrap: {
    width: ORB_SIZE + 60,
    height: ORB_SIZE + 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.md,
  },
  pulseRing: {
    position: 'absolute',
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    backgroundColor: colors.accent,
  },
  orb: {
    width: ORB_SIZE,
    height: ORB_SIZE,
    borderRadius: ORB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    shadowColor: colors.primaryDark,
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  orbLive: { backgroundColor: colors.accent },
  orbSpeaking: { backgroundColor: colors.primary },
  orbError: { backgroundColor: colors.danger },
  orbConnecting: { opacity: 0.7 },
  statusTitle: { marginTop: spacing.xs },
  statusHint: { maxWidth: 300 },
  endBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.danger,
  },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: palette.blue100,
    backgroundColor: palette.blue50,
  },
  typeInstead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },

  // --- Text chat ---
  scroll: { padding: layout.screenPadding, gap: spacing.md, paddingBottom: spacing.xl },
  talkBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
    marginBottom: spacing.xs,
  },
  bubble: { maxWidth: '86%', borderRadius: radii.lg, padding: spacing.lg, gap: spacing.xs },
  userBubble: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: radii.sm },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceMuted,
    borderBottomLeftRadius: radii.sm,
  },
  source: { marginTop: spacing.xs, opacity: 0.8 },
  flex: { flex: 1 },
  attachBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  docChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    marginHorizontal: layout.screenPadding,
    alignSelf: 'stretch',
  },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  suggestion: {
    borderWidth: 1.5,
    borderColor: palette.blue100,
    backgroundColor: palette.blue50,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 40,
    justifyContent: 'center',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  roundBtn: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  voiceOn: { backgroundColor: colors.accent },
  input: {
    ...typography.body,
    flex: 1,
    maxHeight: 120,
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    color: colors.textPrimary,
    backgroundColor: colors.background,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  sendDisabled: { opacity: 0.4 },
});
