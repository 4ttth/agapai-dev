import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { followUpApi, type FollowUpThread } from '@/lib/api';
import { colors, radii, spacing } from '@/lib/theme';
import { Card, T } from '@/lib/ui';

type Tab = 'open' | 'previous';

/** Doctor's follow-ups: open chats and previous (closed/expiring) chats. */
export default function FollowUpsScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('open');
  const [threads, setThreads] = useState<FollowUpThread[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const { threads: list } = await followUpApi.list();
      setThreads(list);
    } catch {
      /* leave list as-is */
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = threads.filter((t) => t.status === 'OPEN');
  const previous = threads.filter((t) => t.status === 'CLOSED');
  const shown = tab === 'open' ? open : previous;

  return (
    <View style={styles.root}>
      <View style={styles.tabs}>
        {(
          [
            ['open', `Open chats (${open.length})`],
            ['previous', `Previous (${previous.length})`],
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            style={[styles.tab, tab === key && styles.tabActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
          >
            <T size={14} weight="600" color={tab === key ? colors.onPrimary : colors.textSecondary}>
              {label}
            </T>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} />}
      >
        {shown.length === 0 ? (
          <Card>
            <T size={15} color={colors.textSecondary}>
              {tab === 'open'
                ? 'No open follow-ups. When a patient starts one about their last visit, it appears here.'
                : 'No previous follow-ups yet.'}
            </T>
          </Card>
        ) : (
          shown.map((t) => (
            <Pressable key={t.id} onPress={() => router.push(`/follow-up/${t.id}`)}>
              <Card style={styles.threadCard}>
                <View style={styles.row}>
                  <View style={styles.avatar}>
                    <Ionicons name="chatbubbles" size={20} color={colors.onPrimary} />
                  </View>
                  <View style={styles.flex}>
                    <T size={16} weight="700">
                      {t.counterpart?.firstName} {t.counterpart?.lastName}
                    </T>
                    <T size={13} color={colors.textSecondary}>
                      {t.status === 'OPEN' ? 'Open' : 'Closed'} · last activity{' '}
                      {new Date(t.lastMessageAt).toLocaleString()}
                    </T>
                    <T size={12} color={colors.textMuted}>
                      Auto-deletes {new Date(t.expiresAt).toLocaleDateString()}
                    </T>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                </View>
              </Card>
            </Pressable>
          ))
        )}

        <View style={styles.footerNote}>
          <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
          <T size={12} color={colors.textMuted}>
            Follow-up messages are end-to-end encrypted and auto-delete after 7 days.
          </T>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceMuted },
  tabs: { flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  scroll: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.md },
  threadCard: { padding: spacing.lg },
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
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    justifyContent: 'center',
    marginTop: spacing.md,
  },
});
