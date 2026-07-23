import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Switch, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { useMedications } from '@/features/pill-tracker';
import { useAuth } from '@/hooks/useAuth';
import { serverApi } from '@/services/api/server';
import { colors, radii, spacing } from '@/theme';
import { formatTimeLabel, parseTimeOfDay } from '@/utils/datetime';
import {
  DEFAULT_NOTIFICATION_PREFS,
  readNotificationPrefs,
  updateNotificationPrefs,
  type NotificationPrefs,
} from '@/utils/notificationPrefs';
import { reconcileNotifications, requestNotificationPermission } from '@/utils/notifications';

/** Round a "HH:MM" time by a signed number of minutes, wrapping within a day. */
function shiftTime(time: string, deltaMinutes: number): string {
  const tod = parseTimeOfDay(time) ?? { hours: 8, minutes: 0 };
  let total = (tod.hours * 60 + tod.minutes + deltaMinutes + 24 * 60) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

interface ToggleRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}

function ToggleRow({ icon, title, subtitle, value, onValueChange }: ToggleRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>
      <View style={styles.flex}>
        <AppText variant="label">{title}</AppText>
        <AppText variant="caption" color="secondary">
          {subtitle}
        </AppText>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: colors.primary, false: colors.border }}
        thumbColor={Platform.OS === 'android' ? (value ? colors.surface : colors.surfaceMuted) : undefined}
        accessibilityLabel={title}
      />
    </View>
  );
}

/**
 * Notification settings. Post-consultation and post-dispense alerts are sent by
 * the server (so they arrive even when the app is closed) and are mirrored to
 * the account; the mood reminder and medication reminders are scheduled on this
 * device. All four are on by default.
 */
export default function NotificationsScreen() {
  const { session, updateUser } = useAuth();
  const { medications } = useMedications();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);

  useEffect(() => {
    void readNotificationPrefs().then((saved) => {
      // The server is the source of truth for the two server-sent toggles.
      const user = session?.user;
      setPrefs({
        ...saved,
        postConsult: user?.notifyPostConsult ?? saved.postConsult,
        postDispense: user?.notifyPostDispense ?? saved.postDispense,
      });
    });
  }, [session?.user]);

  /** Persist a change, reschedule local notifications, and sync server toggles. */
  const apply = async (patch: Partial<NotificationPrefs>) => {
    const next = await updateNotificationPrefs(patch);
    setPrefs(next);

    // Ask for permission the first time a local reminder is switched on.
    if ((patch.moodReminder === true || patch.medications === true) && Platform.OS !== 'web') {
      await requestNotificationPermission();
    }
    // Reschedule on-device reminders whenever any local option changes.
    if (
      patch.medications !== undefined ||
      patch.moodReminder !== undefined ||
      patch.moodReminderTime !== undefined
    ) {
      await reconcileNotifications(medications, next);
    }
    // Mirror the two server-sent toggles to the account.
    if (patch.postConsult !== undefined || patch.postDispense !== undefined) {
      try {
        const { user } = await serverApi.updateMe({
          notifyPostConsult: next.postConsult,
          notifyPostDispense: next.postDispense,
        });
        await updateUser(user);
      } catch {
        // Non-fatal: the local preference still saved; it re-syncs next change.
      }
    }
  };

  return (
    <Screen background="muted">
      <AppText variant="body" color="secondary" style={styles.intro}>
        Choose what AgapAI reminds you about. You can change these anytime.
      </AppText>

      <Card style={styles.card}>
        <ToggleRow
          icon="medical"
          title="Doctor consultations"
          subtitle="When your doctor saves a new consultation"
          value={prefs.postConsult}
          onValueChange={(v) => void apply({ postConsult: v })}
        />
        <View style={styles.divider} />
        <ToggleRow
          icon="flask"
          title="Pharmacy dispensing"
          subtitle="When a pharmacist dispenses your medicine"
          value={prefs.postDispense}
          onValueChange={(v) => void apply({ postDispense: v })}
        />
        <View style={styles.divider} />
        <ToggleRow
          icon="medkit"
          title="Medication reminders"
          subtitle="Before each medication time on this phone"
          value={prefs.medications}
          onValueChange={(v) => void apply({ medications: v })}
        />
        <View style={styles.divider} />
        <ToggleRow
          icon="happy"
          title="Daily mood reminder"
          subtitle={
            prefs.moodReminder
              ? `Every day at ${formatTimeLabel(prefs.moodReminderTime)}`
              : 'A gentle daily nudge to log how you feel'
          }
          value={prefs.moodReminder}
          onValueChange={(v) => void apply({ moodReminder: v })}
        />

        {prefs.moodReminder ? (
          <View style={styles.timeRow}>
            <AppText variant="caption" color="secondary">
              Reminder time
            </AppText>
            <View style={styles.stepper}>
              <Pressable
                onPress={() => void apply({ moodReminderTime: shiftTime(prefs.moodReminderTime, -30) })}
                style={styles.stepBtn}
                accessibilityRole="button"
                accessibilityLabel="Earlier by 30 minutes"
                hitSlop={8}
              >
                <Ionicons name="remove" size={20} color={colors.primary} />
              </Pressable>
              <AppText variant="label" style={styles.timeLabel}>
                {formatTimeLabel(prefs.moodReminderTime)}
              </AppText>
              <Pressable
                onPress={() => void apply({ moodReminderTime: shiftTime(prefs.moodReminderTime, 30) })}
                style={styles.stepBtn}
                accessibilityRole="button"
                accessibilityLabel="Later by 30 minutes"
                hitSlop={8}
              >
                <Ionicons name="add" size={20} color={colors.primary} />
              </Pressable>
            </View>
          </View>
        ) : null}
      </Card>

      <View style={styles.note}>
        <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
        <AppText variant="caption" color="muted" style={styles.flex}>
          Consultation and dispensing alerts are sent by SMS so they reach you even when the app is
          closed. Mood and medication reminders come from this phone.
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { marginBottom: spacing.lg },
  card: { gap: 0, paddingVertical: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  divider: { height: 1, backgroundColor: colors.border },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeLabel: { minWidth: 92, textAlign: 'center' },
  note: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg, paddingHorizontal: spacing.xs },
});
