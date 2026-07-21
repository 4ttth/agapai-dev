import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MoodGrid } from '@/components/MoodGrid';
import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { DoseRow, NextDoseCard, useMedications } from '@/features/pill-tracker';
import { useAuth } from '@/hooks/useAuth';
import { serverApi } from '@/services/api/server';
import { colors, layout, palette, radii, spacing } from '@/theme';
import type { ConsultationRow, DoseWithMedication, MoodLevel, MoodMap } from '@/types';
import { formatDateLabel } from '@/utils/datetime';
import { MOODS, readMoods, setMood, todayKey } from '@/utils/mood';

/** Staggered fade-up wrapper for a friendly, modern entrance. */
function Rise({ index, children }: { index: number; children: ReactNode }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      damping: 14,
      stiffness: 120,
      delay: 90 * index,
    }).start();
  }, [anim, index]);
  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const {
    medications,
    todaysDoses,
    summary,
    nextDose,
    markTaken,
    displayStatusOf,
    now,
    remindersEnabled,
  } = useMedications();

  const [moods, setMoods] = useState<MoodMap>({});
  const [consultations, setConsultations] = useState<ConsultationRow[]>([]);
  const [dispensed, setDispensed] = useState<Array<{ id: string; name: string; quantity?: number | null; createdAt: string }>>([]);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  useEffect(() => {
    void readMoods().then(setMoods);
    serverApi
      .listConsultations()
      .then(({ consultations: list }) => setConsultations(list.slice(0, 2)))
      .catch(() => {});
    serverApi
      .serverMedications()
      .then(({ medications: list }) =>
        setDispensed(list.filter((m) => m.source === 'PHARMACIST').slice(0, 3)),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!confirmation) return;
    AccessibilityInfo.announceForAccessibility(confirmation);
    const t = setTimeout(() => setConfirmation(null), 2500);
    return () => clearTimeout(t);
  }, [confirmation]);

  const pickMood = useCallback(async (level: MoodLevel) => {
    const next = await setMood(todayKey(), level);
    setMoods(next);
  }, []);

  const handleMarkTaken = useCallback(
    (item: DoseWithMedication) => {
      void markTaken(item.dose);
      setConfirmation(`${item.medication.name} marked as taken. Well done!`);
    },
    [markTaken],
  );

  const user = session?.user;
  const firstName = user?.firstName ?? 'there';
  const todayMood = moods[todayKey()];
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Magandang umaga' : hour < 18 ? 'Magandang hapon' : 'Magandang gabi';

  return (
    <View style={styles.root}>
      <Animated.ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <LinearGradient
          colors={[palette.blue900, palette.blue700]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1.2, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + spacing.lg }]}
        >
          <View style={styles.heroRow}>
            <View style={styles.flex}>
              <AppText variant="caption" color="inverse" style={styles.heroDate}>
                {formatDateLabel(now.toISOString())}
              </AppText>
              <AppText variant="title" color="inverse">
                {greeting}, {firstName}!
              </AppText>
            </View>
            <Pressable
              onPress={() => router.push('/health-id')}
              accessibilityRole="button"
              accessibilityLabel="Open my Health ID"
              style={styles.avatar}
            >
              <AppText variant="section" color="inverse">
                {firstName[0]?.toUpperCase() ?? 'A'}
              </AppText>
            </Pressable>
          </View>
          <Pressable
            onPress={() => router.push('/health-id')}
            style={styles.idChip}
            accessibilityRole="button"
            accessibilityLabel="Show Health ID QR"
          >
            <Ionicons name="qr-code" size={16} color={palette.blue100} />
            <AppText variant="caption" color="inverse">
              Health ID · tap to show QR
            </AppText>
          </Pressable>
        </LinearGradient>

        <View style={styles.body}>
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
                Reminders are off. Turn on notifications so AgapAI can remind you.
              </AppText>
            </View>
          ) : null}

          <Rise index={0}>
            <Card>
              <View style={styles.sectionHead}>
                <AppText variant="section">Medicines to take</AppText>
                <AppText variant="caption" color="secondary">
                  {summary.taken}/{summary.total} today
                </AppText>
              </View>
              {medications.length === 0 ? (
                <Pressable onPress={() => router.push('/medication/add')} style={styles.emptyRow}>
                  <Ionicons name="add-circle" size={26} color={colors.primary} />
                  <AppText variant="body" color="secondary" style={styles.flex}>
                    No medicines yet — add your first one to get reminders.
                  </AppText>
                </Pressable>
              ) : nextDose ? (
                <NextDoseCard
                  item={nextDose}
                  overdue={displayStatusOf(nextDose.dose) === 'missed'}
                  onMarkTaken={handleMarkTaken}
                />
              ) : (
                <View style={styles.allDone}>
                  <Ionicons name="checkmark-done-circle" size={26} color={colors.success} />
                  <AppText variant="body" color="success">
                    All done for today!
                  </AppText>
                </View>
              )}
              {todaysDoses.length > 0 ? (
                <View style={styles.doseList}>
                  {todaysDoses.slice(0, 3).map((item) => (
                    <DoseRow
                      key={item.dose.id}
                      item={item}
                      status={displayStatusOf(item.dose)}
                      onMarkTaken={handleMarkTaken}
                      onUndo={() => {}}
                      onOpen={(id) => router.push(`/medication/${id}`)}
                    />
                  ))}
                  <Pressable onPress={() => router.push('/(tabs)/medications')} style={styles.seeAll}>
                    <AppText variant="label" color="accent">
                      See all medicines →
                    </AppText>
                  </Pressable>
                </View>
              ) : null}
            </Card>
          </Rise>

          <Rise index={1}>
            <Card>
              <AppText variant="section">How do you feel today?</AppText>
              <View style={styles.moodRow}>
                {MOODS.map((m) => (
                  <Pressable
                    key={m.level}
                    onPress={() => void pickMood(m.level)}
                    accessibilityRole="button"
                    accessibilityLabel={`Mood: ${m.label}`}
                    accessibilityState={{ selected: todayMood === m.level }}
                    style={[styles.moodBtn, todayMood === m.level && { backgroundColor: m.color + '33', borderColor: m.color }]}
                  >
                    <AppText style={styles.moodEmoji}>{m.emoji}</AppText>
                  </Pressable>
                ))}
              </View>
              <MoodGrid moods={moods} />
            </Card>
          </Rise>

          <Rise index={2}>
            <Card>
              <View style={styles.sectionHead}>
                <AppText variant="section">Past consultations</AppText>
                <Pressable onPress={() => router.push('/(tabs)/records')}>
                  <AppText variant="label" color="accent">
                    See all →
                  </AppText>
                </Pressable>
              </View>
              {consultations.length === 0 ? (
                <AppText variant="body" color="secondary">
                  No consultations yet. Your doctor uploads them securely after each visit.
                </AppText>
              ) : (
                consultations.map((c) => (
                  <Pressable
                    key={c.id}
                    onPress={() => router.push(`/consultation/${c.id}`)}
                    style={styles.consultRow}
                    accessibilityRole="button"
                  >
                    <View style={styles.consultIcon}>
                      <Ionicons name="document-lock" size={20} color={colors.primary} />
                    </View>
                    <View style={styles.flex}>
                      <AppText variant="label">{c.type}</AppText>
                      <AppText variant="caption" color="secondary">
                        Dr. {c.doctor?.firstName} {c.doctor?.lastName} ·{' '}
                        {new Date(c.date).toLocaleDateString()}
                      </AppText>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                  </Pressable>
                ))
              )}
            </Card>
          </Rise>

          <Rise index={3}>
            <Card>
              <View style={styles.sectionHead}>
                <AppText variant="section">From the pharmacy</AppText>
              </View>
              {dispensed.length === 0 ? (
                <AppText variant="body" color="secondary">
                  Medicines dispensed by your pharmacist will appear here automatically.
                </AppText>
              ) : (
                dispensed.map((m) => (
                  <View key={m.id} style={styles.consultRow}>
                    <View style={[styles.consultIcon, { backgroundColor: colors.accentLight }]}>
                      <Ionicons name="bag-check" size={20} color={colors.accent} />
                    </View>
                    <View style={styles.flex}>
                      <AppText variant="label">
                        {m.quantity ? `${m.quantity}× ` : ''}
                        {m.name}
                      </AppText>
                      <AppText variant="caption" color="secondary">
                        Received {new Date(m.createdAt).toLocaleDateString()}
                      </AppText>
                    </View>
                  </View>
                ))
              )}
            </Card>
          </Rise>
        </View>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceMuted },
  scroll: { paddingBottom: spacing.xxl },
  hero: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.xxl + spacing.lg,
    borderBottomLeftRadius: radii.xl,
    borderBottomRightRadius: radii.xl,
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  heroDate: { opacity: 0.85, marginBottom: spacing.xs },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  idChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    marginTop: spacing.lg,
  },
  body: { paddingHorizontal: layout.screenPadding, marginTop: -spacing.xl, gap: spacing.lg },
  flex: { flex: 1 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.success,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.warningLight,
    borderRadius: radii.md,
    padding: spacing.lg,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  allDone: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  doseList: { marginTop: spacing.lg, gap: spacing.md },
  seeAll: { alignSelf: 'flex-end', paddingVertical: spacing.xs, minHeight: 32 },
  moodRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: spacing.lg },
  moodBtn: {
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  moodEmoji: { fontSize: 26 },
  consultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    minHeight: 48,
  },
  consultIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
