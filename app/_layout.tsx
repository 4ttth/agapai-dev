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
 * signed-out users → login; first-timers → registration; signed-in → tabs.
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
    } else if (status === 'registering' && !inAuthGroup) {
      router.replace('/(auth)/register');
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
      <Stack.Screen name="(auth)/scan-id" options={{ title: 'Verify with National ID', presentation: 'modal' }} />
      <Stack.Screen name="(auth)/register" options={{ title: 'Registration', headerBackVisible: true }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="medication/add" options={{ title: 'Add medicine', presentation: 'modal' }} />
      <Stack.Screen name="medication/[id]" options={{ title: 'Medicine details' }} />
      <Stack.Screen name="scan" options={{ title: 'Scan Health ID', presentation: 'modal' }} />
      <Stack.Screen name="health-id" options={{ title: 'My Health ID', presentation: 'modal' }} />
      <Stack.Screen name="assistant" options={{ title: 'AI Health Assistant' }} />
      <Stack.Screen name="consultation/[id]" options={{ title: 'Consultation record' }} />
      <Stack.Screen name="scan-document" options={{ title: 'Scan document', presentation: 'modal' }} />
      <Stack.Screen name="verify-identity" options={{ title: 'Verify your identity', presentation: 'modal' }} />
      <Stack.Screen name="edit-profile" options={{ title: 'Edit personal info' }} />
      <Stack.Screen name="directory" options={{ title: 'Verified professionals' }} />
      <Stack.Screen name="guide" options={{ title: 'How to use AgapAI' }} />
      <Stack.Screen name="privacy" options={{ title: 'Privacy Policy' }} />
      <Stack.Screen name="terms" options={{ title: 'Terms & Conditions' }} />
      <Stack.Screen name="about" options={{ title: 'About AgapAI' }} />
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
