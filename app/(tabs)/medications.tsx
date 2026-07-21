import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { LoadingState } from '@/components/states/LoadingState';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { PillCard, useMedications } from '@/features/pill-tracker';
import { colors, spacing } from '@/theme';

export default function MedicationsScreen() {
  const router = useRouter();
  const { status, error, refresh, medications } = useMedications();

  const openMedication = useCallback((id: string) => router.push(`/medication/${id}`), [router]);

  if (status === 'loading' || status === 'idle') {
    return <LoadingState message="Loading your medicines…" />;
  }

  if (status === 'error') {
    return <ErrorState message={error ?? undefined} onRetry={refresh} />;
  }

  if (medications.length === 0) {
    return (
      <Screen contentContainerStyle={styles.emptyContainer}>
        <EmptyState
          icon="medkit-outline"
          title="No medicines yet"
          message="Add a medicine to keep all your prescriptions and reminders in one place."
          actionLabel="Add a medicine"
          onAction={() => router.push('/medication/add')}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.list}>
        {medications.map((medication) => (
          <PillCard key={medication.id} medication={medication} onPress={openMedication} />
        ))}
      </View>
      <Button
        label="Add a medicine"
        icon={<Ionicons name="add" size={22} color={colors.onPrimary} />}
        onPress={() => router.push('/medication/add')}
        accessibilityHint="Opens the add medicine form"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  emptyContainer: { flexGrow: 1 },
  list: { gap: spacing.lg, marginBottom: spacing.xl },
});
