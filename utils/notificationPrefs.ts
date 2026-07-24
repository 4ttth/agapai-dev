import { storageKeys } from '@/constants';
import { readJson, writeJson } from './storage';

/**
 * Per-patient notification preferences (stored on this device).
 *
 * Two of these are delivered by the phone itself as local notifications and so
 * live here: the daily mood-tracker reminder (fired at `moodReminderTime`) and
 * the medication reminders. The post-consultation and post-dispense toggles are
 * mirrored to the server, which is what actually sends those messages when a
 * doctor or pharmacist acts — so they can arrive even when the app is closed.
 */
export interface NotificationPrefs {
  /** Notify when a doctor saves a new consultation. Default on. */
  postConsult: boolean;
  /** Notify when a pharmacist dispenses medicine. Default on. */
  postDispense: boolean;
  /** Daily reminder to log today's mood. Default on. */
  moodReminder: boolean;
  /** Time of day for the mood reminder, "HH:MM" (24h). Default 08:00. */
  moodReminderTime: string;
  /** Reminders before each medication dose. Default on. */
  medications: boolean;
  /** Haptic feedback for interactions and the AgapAI signature buzz. Default on. */
  haptics: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  postConsult: true,
  postDispense: true,
  moodReminder: true,
  moodReminderTime: '08:00',
  medications: true,
  haptics: true,
};

/** Read the saved prefs, filling any missing field from the defaults. */
export async function readNotificationPrefs(): Promise<NotificationPrefs> {
  const saved = await readJson<Partial<NotificationPrefs> | null>(
    storageKeys.notificationPrefs,
    null,
  );
  return { ...DEFAULT_NOTIFICATION_PREFS, ...(saved ?? {}) };
}

/** Merge a partial update into the saved prefs and return the full result. */
export async function updateNotificationPrefs(
  patch: Partial<NotificationPrefs>,
): Promise<NotificationPrefs> {
  const next = { ...(await readNotificationPrefs()), ...patch };
  await writeJson(storageKeys.notificationPrefs, next);
  return next;
}
