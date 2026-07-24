import { Stack, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { SessionProvider } from '@/lib/SessionContext';
import { configureNotificationHandler } from '@/lib/notifications';
import { colors } from '@/lib/theme';

configureNotificationHandler();

/** Route a tapped follow-up notification to the call or chat screen. */
function useNotificationRouting() {
  const router = useRouter();
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data ?? {};
      if (data.kind === 'follow-up-call' && data.threadId)
        router.push(`/follow-up/call/${data.threadId}?mode=callee`);
      else if (data.kind === 'follow-up-message' && data.threadId)
        router.push(`/follow-up/${data.threadId}`);
    });
    return () => sub.remove();
  }, [router]);
}

export default function RootLayout() {
  useNotificationRouting();
  return (
    <SessionProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="scan-login" options={{ title: 'Verify with National ID', presentation: 'modal' }} />
        <Stack.Screen name="doctor" options={{ title: 'AgapAI Pro — Doctor', headerBackVisible: false }} />
        <Stack.Screen name="pharmacist" options={{ title: 'AgapAI Pro — Pharmacist', headerBackVisible: false }} />
        <Stack.Screen name="scan-patient" options={{ title: 'Scan Health ID', presentation: 'modal' }} />
        <Stack.Screen name="new-consultation" options={{ title: 'New consultation record' }} />
        <Stack.Screen name="dispense" options={{ title: 'Dispense prescription' }} />
        <Stack.Screen name="follow-ups" options={{ title: 'Follow-ups' }} />
        <Stack.Screen name="follow-up/[id]" options={{ title: 'Follow-up' }} />
        <Stack.Screen
          name="follow-up/call/[id]"
          options={{ title: 'Call', headerShown: false, presentation: 'fullScreenModal' }}
        />
      </Stack>
    </SessionProvider>
  );
}
