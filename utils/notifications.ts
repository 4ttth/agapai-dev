import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Medication } from '@/types';
import { parseTimeOfDay } from './datetime';

/**
 * Local (offline) medication reminders. Local notifications fire from the
 * device even without a network connection, which matters for the offline
 * reminder requirement.
 */

let handlerConfigured = false;

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
        },
        trigger: {
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

/**
 * Reconcile all device reminders with the current medication list. We cancel
 * everything and reschedule so adds, edits, and deletes never leave duplicates.
 */
export async function syncAllReminders(medications: Medication[]): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    return;
  }
  for (const med of medications) {
    await scheduleMedicationReminders(med);
  }
}
