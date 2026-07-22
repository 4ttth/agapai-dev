import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { SessionProvider } from '@/lib/SessionContext';
import { colors } from '@/lib/theme';

export default function RootLayout() {
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
      </Stack>
    </SessionProvider>
  );
}
