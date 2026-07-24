import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/states/EmptyState';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { serverApi } from '@/services/api/server';
import { colors, layout, radii, spacing } from '@/theme';
import type { FollowUpEligibility, FollowUpThread } from '@/types';

type Tab = 'open' | 'previous';

/** Patient view of their doctor follow-ups: ongoing chats and past ones. */
export default function FollowUpListScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('open');
  const [threads, setThreads] = useState<FollowUpThread[]>([]);
  const [eligibility, setEligibility] = useState<FollowUpEligibility | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ threads: list }, elig] = await Promise.all([
        serverApi.listFollowUps().catch(() => ({ threads: [] as FollowUpThread[] })),
        serverApi.followUpEligibility().catch(() => null),
      ]);
      setThreads(list);
      setEligibility(elig);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = threads.filter((t) => t.status === 'OPEN');
  const previous = threads.filter((t) => t.status === 'CLOSED');
  const shown = tab === 'open' ? open : previous;

  const canStart =
    eligibility?.eligible && (eligibility.chatEnabled || eligibility.callEnabled) && !!eligibility.doctor;

  return (
    <View style={styles.root}>
      <View style={styles.tabs}>
        {(
          [
            ['open', `Open (${open.length})`],
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
            <AppText variant="label" color={tab === key ? 'inverse' : 'secondary'}>
              {label}
            </AppText>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        showsVerticalScrollIndicator={false}
      >
        {canStart ? (
          <Card style={styles.startCard}>
            <View style={styles.startRow}>
              <Ionicons name="chatbubbles" size={22} color={colors.primary} />
              <View style={styles.flex}>
                <AppText variant="label">
                  Follow up with Dr. {eligibility!.doctor!.firstName} {eligibility!.doctor!.lastName}
                </AppText>
                <AppText variant="caption" color="secondary">
                  Your most recent doctor is available for follow-ups.
                </AppText>
              </View>
            </View>
            <Button
              label="Start a follow-up"
              icon={<Ionicons name="add" size={20} color={colors.onPrimary} />}
              onPress={() => router.push('/follow-up/start' as never)}
              accessibilityHint="Open a secure chat with your most recent doctor"
            />
          </Card>
        ) : null}

        <AppText variant="caption" color="secondary" style={styles.hint}>
          Follow-up chats are end-to-end encrypted and kept for 7 days, then automatically deleted.
        </AppText>

        {shown.length === 0 ? (
          <EmptyState
            icon="chatbubbles-outline"
            title={tab === 'open' ? 'No open follow-ups' : 'No previous follow-ups'}
            message={
              tab === 'open'
                ? 'Start a follow-up with your most recent doctor to ask about your last visit.'
                : 'Closed and expired follow-ups appear here.'
            }
          />
        ) : (
          shown.map((t) => (
            <Pressable key={t.id} onPress={() => router.push(`/follow-up/${t.id}` as never)}>
              <Card style={styles.threadCard}>
                <View style={styles.rowBetween}>
                  <AppText variant="section">
                    Dr. {t.counterpart?.firstName} {t.counterpart?.lastName}
                  </AppText>
                  {t.status === 'OPEN' ? (
                    <Badge label="Open" tone="success" />
                  ) : (
                    <Badge label="Closed" tone="neutral" />
                  )}
                </View>
                <AppText variant="caption" color="secondary">
                  Last activity {new Date(t.lastMessageAt).toLocaleString()}
                </AppText>
                <AppText variant="caption" color="muted">
                  Auto-deletes {new Date(t.expiresAt).toLocaleDateString()}
                </AppText>
              </Card>
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  tabs: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.md,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
  },
  tabActive: { backgroundColor: colors.primary },
  scroll: { padding: layout.screenPadding, paddingTop: spacing.sm, gap: spacing.lg },
  hint: { paddingHorizontal: spacing.xs },
  startCard: { gap: spacing.lg },
  startRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  threadCard: { gap: spacing.xs },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  flex: { flex: 1 },
});
