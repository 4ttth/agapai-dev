import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { LoadingState } from '@/components/states/LoadingState';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { DoseRow, NextDoseCard, useMedications } from '@/features/pill-tracker';
import { useAuth } from '@/hooks/useAuth';
import type { DoseWithMedication } from '@/types';
import { colors, radii, spacing } from '@/theme';
import { formatDateLabel } from '@/utils/datetime';

export default function TodayScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const {
    status,
    error,
    refresh,
    medications,
    todaysDoses,
    summary,
    nextDose,
    markTaken,
    undoTaken,
    displayStatusOf,
    now,
    remindersEnabled,
  } = useMedications();
  const [confirmation, setConfirmation] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmation) return;
    AccessibilityInfo.announceForAccessibility(confirmation);
    const timer = setTimeout(() => setConfirmation(null), 2500);
    return () => clearTimeout(timer);
  }, [confirmation]);

  const handleMarkTaken = useCallback(
    (item: DoseWithMedication) => {
      void markTaken(item.dose);
      setConfirmation(`${item.medication.name} marked as taken. Well done!`);
    },
    [markTaken],
  );

  const openMedication = useCallback((id: string) => router.push(`/medication/${id}`), [router]);

  if (status === 'loading' || status === 'idle') {
    return <LoadingState message="Loading your reminders…" />;
  }

  if (status === 'error') {
    return <ErrorState message={error ?? undefined} onRetry={refresh} />;
  }

  const firstName = session?.fullName?.split(' ')[0] ?? 'there';

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="caption" color="muted">
          {formatDateLabel(now.toISOString())}
        </AppText>
        <AppText variant="title">Hello, {firstName}</AppText>
      </View>

      {confirmation ? (
        <View style={styles.toast} accessibilityRole="alert">
          <Ionicons name="checkmark-circle" size={22} color={colors.onSuccess} />
          <AppText variant="label" color="inverse" style={styles.flex}>
            {confirmation}
          </AppText>
        </View>
      ) : null}

      {remindersEnabled === false ? (
        <View style={styles.banner} accessibilityRole="alert">
          <Ionicons name="notifications-off-outline" size={20} color={colors.warning} />
          <AppText variant="caption" style={styles.flex}>
            Reminders are off. Turn on notifications in Settings so AgapAI can remind you.
          </AppText>
        </View>
      ) : null}

      {medications.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="medkit-outline"
            title="No medicines yet"
            message="Add your first medicine to start getting simple, on-time reminders."
            actionLabel="Add a medicine"
            onAction={() => router.push('/medication/add')}
          />
        </View>
      ) : (
        <>
          <View style={styles.summary}>
            <AppText variant="body" color="secondary">
              {summary.taken} of {summary.total} taken today
            </AppText>
            {summary.missed > 0 ? (
              <AppText variant="label" color="danger">
                {summary.missed} missed
              </AppText>
            ) : null}
          </View>

          {nextDose ? (
            <View style={styles.hero}>
              <NextDoseCard
                item={nextDose}
                overdue={displayStatusOf(nextDose.dose) === 'missed'}
                onMarkTaken={handleMarkTaken}
              />
            </View>
          ) : (
            <View style={styles.allDone} accessible accessibilityLabel="All doses taken for today">
              <Ionicons name="checkmark-done-circle" size={28} color={colors.success} />
              <AppText variant="section" color="success">
                All done for today!
              </AppText>
            </View>
          )}

          <AppText variant="section" style={styles.sectionTitle}>
            Today&apos;s schedule
          </AppText>
          <View style={styles.list}>
            {todaysDoses.map((item) => (
              <DoseRow
                key={item.dose.id}
                item={item}
                status={displayStatusOf(item.dose)}
                onMarkTaken={handleMarkTaken}
                onUndo={(x) => void undoTaken(x.dose)}
                onOpen={openMedication}
              />
            ))}
          </View>

          <Button
            label="Add a medicine"
            variant="secondary"
            icon={<Ionicons name="add" size={22} color={colors.primary} />}
            onPress={() => router.push('/medication/add')}
            accessibilityHint="Opens the add medicine form"
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.lg, gap: spacing.xs },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.success,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningLight,
    borderRadius: radii.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  flex: { flex: 1 },
  emptyWrap: { minHeight: 320 },
  summary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  hero: { marginBottom: spacing.xl },
  allDone: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
    marginBottom: spacing.lg,
  },
  sectionTitle: { marginBottom: spacing.md },
  list: { gap: spacing.lg, marginBottom: spacing.xl },
});
