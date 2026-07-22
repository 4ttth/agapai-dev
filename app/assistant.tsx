import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
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

interface Msg {
  id: string;
  who: 'user' | 'ai';
  text: string;
  source?: string;
}

const SUGGESTIONS = [
  'I feel dizzy and nauseous',
  'What are my medications today?',
  'Home remedies for cough',
  'When was my last consultation?',
];

/**
 * AI Health Assistant. Symptom questions → AgapAI's home-remedy engine;
 * government/general questions → live eGov AI; questions about your own
 * medications/consultations are answered on-device only.
 */
export default function AssistantScreen() {
  const { session } = useAuth();
  const { medications, todaysDoses } = useMedications();
  const { speaking, toggle, speak, stop } = useSpeech();
  const live = useGeminiLive();
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: 'hello',
      who: 'ai',
      text: `Kumusta${session?.user ? `, ${session.user.firstName}` : ''}! I'm your AgapAI assistant. Tell me how you're feeling (like "masakit ang ulo ko"), or ask about your medicines and past consultations.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  /** Text pulled out of a document the patient photographed, sent as context. */
  const [docText, setDocText] = useState<string | null>(null);
  const [docName, setDocName] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const consultRef = useRef<ConsultationRow[] | null>(null);
  const scrollRef = useRef<ScrollView>(null);

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
        if (voiceOn) speak(reply.reply.replace(/[•⚠]/g, ''));
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
    [input, busy, localAnswer, session, voiceOn, speak, docText],
  );

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        showsVerticalScrollIndicator={false}
      >
        {messages.map((m) => (
          <View
            key={m.id}
            style={[styles.bubble, m.who === 'user' ? styles.userBubble : styles.aiBubble]}
          >
            <AppText variant="body" color={m.who === 'user' ? 'inverse' : 'primary'}>
              {m.text}
            </AppText>
            {m.source ? (
              <AppText variant="caption" color={m.who === 'user' ? 'inverse' : 'muted'} style={styles.source}>
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

      {live.state !== 'idle' ? (
        <View style={[styles.liveBar, live.state === 'error' && styles.liveBarError]}>
          <Ionicons
            name={
              live.state === 'live' ? (live.speaking ? 'volume-high' : 'mic') : live.state === 'error' ? 'warning' : 'ellipsis-horizontal'
            }
            size={18}
            color={colors.onPrimary}
          />
          <AppText variant="caption" color="inverse" style={styles.flex}>
            {live.state === 'connecting'
              ? 'Connecting to the voice assistant…'
              : live.state === 'error'
                ? (live.error ?? 'Voice assistant unavailable.')
                : live.speaking
                  ? 'Assistant is speaking — you can interrupt anytime'
                  : 'Listening… just speak naturally'}
          </AppText>
          <Pressable onPress={live.stop} accessibilityRole="button" accessibilityLabel="End voice call">
            <Ionicons name="close-circle" size={22} color={colors.onPrimary} />
          </Pressable>
        </View>
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
      ) : null}
      <View style={styles.inputRow}>
        <Pressable
          onPress={() => {
            if (speaking) stop();
            setVoiceOn((v) => !v);
          }}
          style={[styles.voiceBtn, voiceOn && styles.voiceOn]}
          accessibilityRole="button"
          accessibilityLabel={voiceOn ? 'Voice replies on' : 'Voice replies off'}
          accessibilityHint="Toggles whether replies are spoken aloud"
        >
          <Ionicons
            name={voiceOn ? 'volume-high' : 'volume-mute'}
            size={22}
            color={voiceOn ? colors.onPrimary : colors.textSecondary}
          />
        </Pressable>
        <Pressable
          onPress={() => {
            if (live.state === 'live' || live.state === 'connecting') {
              live.stop();
            } else {
              stop(); // silence text-to-speech before opening the mic
              void live.start(docText ?? undefined);
            }
          }}
          style={[styles.attachBtn, live.state === 'live' && styles.talkActive]}
          accessibilityRole="button"
          accessibilityLabel={live.state === 'live' ? 'End voice conversation' : 'Talk to the assistant'}
          accessibilityHint="Starts a live voice conversation with the AgapAI assistant"
        >
          <Ionicons
            name={live.state === 'live' ? 'stop-circle' : 'call'}
            size={22}
            color={live.state === 'live' ? colors.onPrimary : colors.textSecondary}
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: layout.screenPadding, gap: spacing.md, paddingBottom: spacing.xl },
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
  talkActive: { backgroundColor: colors.danger, borderRadius: radii.pill },
  liveBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
    backgroundColor: colors.primary,
  },
  liveBarError: { backgroundColor: colors.danger },
  docChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceMuted,
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
  voiceBtn: {
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
