import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Push notifications for AgapAI Pro — so a patient's follow-up call rings, and a
 * new message notifies, even when the doctor's app is backgrounded or closed.
 * Best-effort: a real remote push needs a dev build; Expo Go can't always mint a
 * token. The high-priority Android "calls" channel makes a call ring promptly.
 */

let handlerConfigured = false;

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

export async function registerForPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const settings = await Notifications.getPermissionsAsync();
    const granted = settings.granted || (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return null;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('calls', {
        name: 'Calls',
        importance: Notifications.AndroidImportance.MAX,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
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
