import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/states/EmptyState';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { colors, palette, radii, spacing } from '@/theme';
import {
  clearConversations,
  conversationPreview,
  deleteConversation,
  listConversations,
  type StoredConversation,
} from '@/utils/conversationHistory';

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

/** Local-only history of assistant conversations (typed chats + voice transcripts). */
export default function AssistantHistoryScreen() {
  const [conversations, setConversations] = useState<StoredConversation[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(() => {
    void listConversations().then(setConversations);
  }, []);

  useEffect(load, [load]);

  const removeOne = useCallback(
    (id: string) => {
      Alert.alert('Delete this conversation?', 'This removes it from this phone only.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => void deleteConversation(id).then(load),
        },
      ]);
    },
    [load],
  );

  const clearAll = useCallback(() => {
    Alert.alert('Clear all history?', 'This permanently deletes every saved conversation on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear all', style: 'destructive', onPress: () => void clearConversations().then(load) },
    ]);
  }, [load]);

  if (conversations && conversations.length === 0) {
    return (
      <EmptyState
        icon="chatbubbles-outline"
        title="No conversations yet"
        message="Your chats and voice conversations with the assistant are saved here on this phone."
      />
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <AppText variant="caption" color="secondary" style={styles.flex}>
          Saved on this phone only — {conversations?.length ?? 0} conversation
          {(conversations?.length ?? 0) === 1 ? '' : 's'}.
        </AppText>
        {conversations && conversations.length > 0 ? (
          <Pressable onPress={clearAll} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear all history">
            <AppText variant="label" color="danger">
              Clear all
            </AppText>
          </Pressable>
        ) : null}
      </View>

      {conversations?.map((c) => {
        const isOpen = expanded === c.id;
        return (
          <Card key={c.id} style={styles.card}>
            <Pressable
              onPress={() => setExpanded(isOpen ? null : c.id)}
              style={styles.cardHead}
              accessibilityRole="button"
              accessibilityLabel={`${c.mode === 'voice' ? 'Voice' : 'Text'} conversation from ${dateLabel(c.startedAt)}`}
            >
              <View style={[styles.modeIcon, c.mode === 'voice' ? styles.voiceIcon : styles.textIcon]}>
                <Ionicons
                  name={c.mode === 'voice' ? 'mic' : 'chatbubble-ellipses'}
                  size={16}
                  color={colors.onPrimary}
                />
              </View>
              <View style={styles.flex}>
                <AppText variant="label" numberOfLines={isOpen ? undefined : 1}>
                  {conversationPreview(c)}
                </AppText>
                <AppText variant="caption" color="muted">
                  {c.mode === 'voice' ? 'Voice' : 'Text'} · {dateLabel(c.startedAt)} · {c.messages.length} messages
                </AppText>
              </View>
              <Ionicons name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
            </Pressable>

            {isOpen ? (
              <View style={styles.thread}>
                {c.messages.map((m, i) => (
                  <View
                    key={i}
                    style={[styles.bubble, m.who === 'user' ? styles.userBubble : styles.aiBubble]}
                  >
                    <AppText variant="body" color={m.who === 'user' ? 'inverse' : 'primary'}>
                      {m.text}
                    </AppText>
                  </View>
                ))}
                <Pressable
                  onPress={() => removeOne(c.id)}
                  style={styles.deleteRow}
                  accessibilityRole="button"
                  accessibilityLabel="Delete this conversation"
                >
                  <Ionicons name="trash-outline" size={16} color={colors.danger} />
                  <AppText variant="label" color="danger">
                    Delete conversation
                  </AppText>
                </Pressable>
              </View>
            ) : null}
          </Card>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  card: { padding: spacing.md, gap: spacing.sm },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  modeIcon: { width: 32, height: 32, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  voiceIcon: { backgroundColor: colors.primary },
  textIcon: { backgroundColor: palette.teal700 },
  thread: { gap: spacing.sm, marginTop: spacing.sm },
  bubble: { padding: spacing.md, borderRadius: radii.lg, maxWidth: '92%' },
  userBubble: { backgroundColor: colors.primary, alignSelf: 'flex-end' },
  aiBubble: { backgroundColor: colors.surfaceMuted, alignSelf: 'flex-start' },
  deleteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-end', marginTop: spacing.xs },
});
