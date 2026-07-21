import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  Lexend_400Regular,
  Lexend_600SemiBold,
  Lexend_700Bold,
} from '@expo-google-fonts/lexend';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';

import { useAuth } from '@/hooks/useAuth';
import { AppProviders } from '@/providers/AppProviders';
import { colors } from '@/theme';
import { configureNotificationHandler } from '@/utils/notifications';

SplashScreen.preventAutoHideAsync().catch(() => undefined);
configureNotificationHandler();

/**
 * Watches auth status and keeps the user in the right route group:
 * signed-out users are sent to (auth); signed-in users to the tabs.
 */
function useProtectedRoute() {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === 'initializing') return;
    const inAuthGroup = segments[0] === '(auth)';
    if (status === 'signedOut' && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (status === 'signedIn' && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [status, segments, router]);
}

function RootNavigator() {
  useProtectedRoute();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontFamily: 'Lexend_600SemiBold' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(auth)/login" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="medication/add" options={{ title: 'Add medicine', presentation: 'modal' }} />
      <Stack.Screen name="medication/[id]" options={{ title: 'Medicine details' }} />
      <Stack.Screen name="scan" options={{ title: 'Scan Health ID', presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Lexend_400Regular,
    Lexend_600SemiBold,
    Lexend_700Bold,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null; // Splash stays visible until fonts resolve.
  }

  return (
    <AppProviders>
      <StatusBar style="dark" />
      <RootNavigator />
    </AppProviders>
  );
}
