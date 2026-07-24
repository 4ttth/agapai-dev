import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/states/EmptyState';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Divider } from '@/components/ui/Divider';
import { Screen } from '@/components/ui/Screen';
import {
  PillAvatar,
  doseStatusPresentation,
  useMedications,
} from '@/features/pill-tracker';
import { useSpeech } from '@/hooks/useSpeech';
import { colors, spacing } from '@/theme';
import { formatDateLabel, formatTimeLabel } from '@/utils/datetime';

const frequencyLabel: Record<string, string> = {
  once_daily: 'Once a day',
  twice_daily: 'Twice a day',
  three_times_daily: 'Three times a day',
  custom: 'Custom schedule',
};

export default function MedicationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getMedication, doseLogs, removeMedication } = useMedications();
  const { speaking, toggle } = useSpeech();

  const medication = id ? getMedication(id) : undefined;
  // `srv-` rows are prescribed by a doctor or dispensed by a pharmacy — they are
  // managed on the professional side and cannot be edited by the patient.
  const isPrescribed = !!id && id.startsWith('srv-');

  const history = useMemo(() => {
    if (!medication) return [];
    return doseLogs
      .filter((log) => log.medicationId === medication.id)
      .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
      .slice(0, 10);
  }, [doseLogs, medication]);

  if (!medication) {
    return (
      <Screen>
        <EmptyState
          icon="help-circle-outline"
          title="Medicine not found"
          message="This medicine may have been removed."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const times = medication.schedule.times.map((t) => formatTimeLabel(t)).join(', ');
  const readAloudText = [
    `${medication.name}.`,
    `Take ${medication.dosage} ${medication.unit}, ${frequencyLabel[medication.schedule.frequency]?.toLowerCase()}, at ${times}.`,
    medication.instructions ? `Instructions: ${medication.instructions}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const confirmDelete = () => {
    Alert.alert(
      'Remove this medicine?',
      `This will delete ${medication.name} and its reminders.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void removeMedication(medication.id);
            router.back();
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: medication.name }} />

      <Card>
        <View style={styles.identity}>
          <PillAvatar medication={medication} size={72} />
          <View style={styles.flex}>
            <AppText variant="heading">{medication.name}</AppText>
            <AppText variant="body" color="secondary">
              {medication.appearance.color} · {medication.appearance.shape} · {medication.form}
            </AppText>
          </View>
        </View>
        <Button
          label={speaking ? 'Stop reading' : 'Read aloud'}
          variant="secondary"
          icon={
            <Ionicons
              name={speaking ? 'stop' : 'volume-high'}
              size={20}
              color={colors.primary}
            />
          }
          onPress={() => toggle(readAloudText)}
          accessibilityHint="Reads this medicine's dose and instructions out loud"
        />
      </Card>

      <View style={styles.block}>
        <AppText variant="section">Dosage</AppText>
        <AppText variant="body" color="secondary">
          {medication.dosage} {medication.unit} · {frequencyLabel[medication.schedule.frequency]}
        </AppText>
        <AppText variant="body" color="secondary">
          Reminder times: {times}
        </AppText>
      </View>

      {medication.instructions ? (
        <View style={styles.block}>
          <AppText variant="section">Doctor&apos;s instructions</AppText>
          <AppText variant="body">{medication.instructions}</AppText>
        </View>
      ) : null}

      {medication.prescribingDoctor ? (
        <View style={styles.block}>
          <AppText variant="section">Prescribed by</AppText>
          <AppText variant="body">{medication.prescribingDoctor}</AppText>
        </View>
      ) : null}

      <Divider />

      <AppText variant="section" style={styles.historyTitle}>
        Recent doses
      </AppText>
      {history.length === 0 ? (
        <AppText variant="body" color="secondary">
          No dose history yet. Your taken and missed doses will appear here.
        </AppText>
      ) : (
        <View style={styles.history}>
          {history.map((log) => {
            const presentation = doseStatusPresentation[log.status];
            return (
              <View key={log.id} style={styles.historyRow}>
                <AppText variant="body">
                  {formatDateLabel(log.scheduledAt)} ·{' '}
                  {formatTimeLabel(new Date(log.scheduledAt).toTimeString().slice(0, 5))}
                </AppText>
                <Badge label={presentation.label} tone={presentation.tone} />
              </View>
            );
          })}
        </View>
      )}

      {isPrescribed ? (
        <View style={styles.prescribedNote}>
          <Ionicons name="lock-closed" size={18} color={colors.textSecondary} />
          <AppText variant="caption" color="secondary" style={styles.flex}>
            {medication.prescribingDoctor?.includes('Pharmacy')
              ? 'Dispensed by a pharmacy'
              : 'Prescribed by your doctor'}
            . These details are managed for you and can&apos;t be edited here — they stay in sync
            with your official record and reminders.
          </AppText>
        </View>
      ) : (
        <View style={styles.actions}>
          <Button
            label="Edit medicine"
            variant="secondary"
            icon={<Ionicons name="create-outline" size={20} color={colors.primary} />}
            onPress={() => router.push(`/medication/add?id=${medication.id}`)}
          />
          <Button
            label="Remove medicine"
            variant="danger"
            icon={<Ionicons name="trash-outline" size={20} color={colors.onDanger} />}
            onPress={confirmDelete}
            accessibilityHint={`Deletes ${medication.name}`}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.lg },
  flex: { flex: 1 },
  block: { gap: spacing.xs, marginTop: spacing.xl },
  historyTitle: { marginBottom: spacing.md },
  history: { gap: spacing.md },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actions: { gap: spacing.md, marginTop: spacing.xxl },
  prescribedNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.xxl,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    padding: spacing.lg,
  },
});
