import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Medication } from '@/types';
import { parseTimeOfDay } from './datetime';
import { DEFAULT_NOTIFICATION_PREFS, type NotificationPrefs } from './notificationPrefs';

/**
 * Local (offline) medication reminders. Local notifications fire from the
 * device even without a network connection, which matters for the offline
 * reminder requirement.
 */

let handlerConfigured = false;

/**
 * The AgapAI signature. On iOS the custom sound is set per-notification
 * ({@link SIGNATURE_SOUND}, bundled via the expo-notifications `sounds` config).
 * On Android the sound and vibration live on the {@link REMINDER_CHANNEL_ID}
 * channel — its vibration mirrors the in-app "tap-tap-thrum" haptic so the buzz
 * feels unmistakably like AgapAI even on a locked phone.
 */
export const SIGNATURE_SOUND = 'agapai.wav';
export const REMINDER_CHANNEL_ID = 'agapai-reminders';
/** [waitBeforeStart, buzz, pause, buzz, pause, buzz] — the signature rhythm. */
const SIGNATURE_VIBRATION = [0, 70, 90, 70, 150, 230];

let channelsEnsured = false;

/**
 * Create the Android reminder channel that carries the AgapAI signature sound
 * and vibration pattern. No-op on iOS/web and idempotent. iOS carries the sound
 * per-notification instead (Android O+ ignores per-notification sound/vibration
 * once a channel exists, so it must live on the channel).
 */
export async function ensureNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android' || channelsEnsured) return;
  channelsEnsured = true;
  await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: 'AgapAI reminders',
    importance: Notifications.AndroidImportance.HIGH,
    sound: SIGNATURE_SOUND,
    vibrationPattern: SIGNATURE_VIBRATION,
    lightColor: '#0B4F9E',
    bypassDnd: false,
  }).catch(() => undefined);
}

/** Configure how notifications present while the app is foregrounded. Idempotent. */
export function configureNotificationHandler(): void {
  if (handlerConfigured) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  handlerConfigured = true;
  // Fire-and-forget: the channel must exist before the first reminder fires.
  void ensureNotificationChannels();
}

/**
 * Register for an Expo push token so follow-up calls can ring — and new
 * messages can notify — even when the app is backgrounded or closed. Best-effort:
 * returns null on web, without permission, or in an environment that can't mint
 * a token (e.g. Expo Go without a projectId). A dev build is needed for real
 * remote push. Also sets up the high-priority Android "calls" channel.
 */
export async function registerForPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    if (!(await requestNotificationPermission())) return null;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('calls', {
        name: 'Calls',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        bypassDnd: false,
      }).catch(() => undefined);
    }
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (Constants as any).easConfig?.projectId;
    const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return data ?? null;
  } catch {
    return null;
  }
}

/** Ask for notification permission. Returns whether it is granted. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const settings = await Notifications.getPermissionsAsync();
    if (settings.granted) return true;
    const request = await Notifications.requestPermissionsAsync();
    return request.granted;
  } catch {
    return false;
  }
}

/**
 * Schedule one repeating daily reminder per dose time for a medication.
 * Returns the created notification ids so they can be cancelled on edit/delete.
 */
export async function scheduleMedicationReminders(medication: Medication): Promise<string[]> {
  if (Platform.OS === 'web') return [];
  const ids: string[] = [];

  for (const time of medication.schedule.times) {
    const tod = parseTimeOfDay(time);
    if (!tod) continue;
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: `Time for ${medication.name}`,
          body: `Take ${medication.dosage} ${medication.unit}. Tap “I Took This” when done.`,
          data: { medicationId: medication.id, kind: 'medication-reminder' },
          sound: SIGNATURE_SOUND,
        },
        trigger: {
          channelId: REMINDER_CHANNEL_ID,
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: tod.hours,
          minute: tod.minutes,
        },
      });
      ids.push(id);
    } catch {
      // Non-fatal: reminders are best-effort; the in-app schedule still shows.
    }
  }

  return ids;
}

/** Cancel a set of previously scheduled reminders. */
export async function cancelReminders(notificationIds: string[]): Promise<void> {
  if (Platform.OS === 'web') return;
  await Promise.all(
    notificationIds.map((id) =>
      Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined),
    ),
  );
}

/** Schedule the daily "log your mood" reminder at the chosen time of day. */
export async function scheduleMoodReminder(time: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const tod = parseTimeOfDay(time);
  if (!tod) return null;
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title: 'How are you feeling today?',
        body: 'Take a moment to log your mood in AgapAI.',
        data: { kind: 'mood-reminder' },
        sound: SIGNATURE_SOUND,
      },
      trigger: {
        channelId: REMINDER_CHANNEL_ID,
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: tod.hours,
        minute: tod.minutes,
      },
    });
  } catch {
    return null;
  }
}

/**
 * Reconcile every scheduled local notification with the current medication list
 * AND the patient's notification preferences. We cancel everything and
 * reschedule so adds, edits, deletes, and toggles never leave duplicates:
 * medication dose reminders only when `medications` is on, and the daily mood
 * reminder at `moodReminderTime` only when `moodReminder` is on.
 */
export async function reconcileNotifications(
  medications: Medication[],
  prefs: NotificationPrefs = DEFAULT_NOTIFICATION_PREFS,
): Promise<void> {
  if (Platform.OS === 'web') return;
  await ensureNotificationChannels();
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    return;
  }
  if (prefs.medications) {
    for (const med of medications) {
      await scheduleMedicationReminders(med);
    }
  }
  if (prefs.moodReminder) {
    await scheduleMoodReminder(prefs.moodReminderTime);
  }
}

/**
 * Back-compat wrapper: reconcile medication reminders with the default prefs.
 * Prefer {@link reconcileNotifications} where the patient's prefs are known.
 */
export async function syncAllReminders(medications: Medication[]): Promise<void> {
  await reconcileNotifications(medications, DEFAULT_NOTIFICATION_PREFS);
}
