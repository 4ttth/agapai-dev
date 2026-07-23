import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

import type { Medication } from '@/types';
import {
  DEFAULT_NOTIFICATION_PREFS,
  readNotificationPrefs,
  updateNotificationPrefs,
} from '@/utils/notificationPrefs';
import { reconcileNotifications } from '@/utils/notifications';

const med = (times: string[]): Medication => ({
  id: `med_${times.join('_')}`,
  name: 'Losartan',
  dosage: '50',
  unit: 'mg',
  form: 'tablet',
  appearance: { color: 'White', colorHex: '#fff', shape: 'round' },
  schedule: { frequency: 'custom', times, startDate: '2026-07-22' },
  createdAt: new Date().toISOString(),
});

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe('notification preferences', () => {
  it('returns the documented defaults when nothing is saved', async () => {
    const prefs = await readNotificationPrefs();
    expect(prefs).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(prefs.postConsult).toBe(true);
    expect(prefs.postDispense).toBe(true);
    expect(prefs.moodReminder).toBe(true);
    expect(prefs.moodReminderTime).toBe('08:00');
    expect(prefs.medications).toBe(true);
  });

  it('merges partial updates and persists them', async () => {
    await updateNotificationPrefs({ moodReminder: false, moodReminderTime: '21:30' });
    const prefs = await readNotificationPrefs();
    expect(prefs.moodReminder).toBe(false);
    expect(prefs.moodReminderTime).toBe('21:30');
    // Untouched fields keep their defaults.
    expect(prefs.medications).toBe(true);
  });
});

describe('reconcileNotifications', () => {
  it('always clears existing schedules first', async () => {
    await reconcileNotifications([], DEFAULT_NOTIFICATION_PREFS);
    expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
  });

  it('schedules a medication reminder per dose time only when medications are on', async () => {
    await reconcileNotifications([med(['08:00', '20:00'])], {
      ...DEFAULT_NOTIFICATION_PREFS,
      medications: true,
      moodReminder: false,
    });
    // Two dose times → two reminders, no mood reminder.
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
  });

  it('skips medication reminders when the toggle is off', async () => {
    await reconcileNotifications([med(['08:00'])], {
      ...DEFAULT_NOTIFICATION_PREFS,
      medications: false,
      moodReminder: false,
    });
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('schedules the daily mood reminder when enabled', async () => {
    await reconcileNotifications([], {
      ...DEFAULT_NOTIFICATION_PREFS,
      medications: false,
      moodReminder: true,
      moodReminderTime: '08:00',
    });
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const arg = (Notifications.scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(arg.trigger).toMatchObject({ hour: 8, minute: 0 });
    expect(arg.content.data.kind).toBe('mood-reminder');
  });
});
