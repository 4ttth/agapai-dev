import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from './AuthProvider';
import { MedicationProvider } from './MedicationProvider';

/** Composes all app-wide context providers in one place. */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <MedicationProvider>{children}</MedicationProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
