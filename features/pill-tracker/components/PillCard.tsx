import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Card } from '@/components/ui/Card';
import { colors, spacing } from '@/theme';
import type { Medication } from '@/types';
import { formatTimeLabel } from '@/utils/datetime';
import { PillAvatar } from './PillAvatar';

interface PillCardProps {
  medication: Medication;
  onPress: (id: string) => void;
}

const frequencyLabel: Record<Medication['schedule']['frequency'], string> = {
  once_daily: 'Once a day',
  twice_daily: 'Twice a day',
  three_times_daily: 'Three times a day',
  custom: 'Custom schedule',
};

/** Summary card for a medication in the full list. */
export function PillCard({ medication, onPress }: PillCardProps) {
  const times = medication.schedule.times.map((t) => formatTimeLabel(t)).join(', ');

  return (
    <Card
      onPress={() => onPress(medication.id)}
      accessibilityLabel={`${medication.name}, ${medication.dosage} ${medication.unit}. ${frequencyLabel[medication.schedule.frequency]} at ${times}.`}
      accessibilityHint="Opens medicine details"
    >
      <View style={styles.row}>
        <PillAvatar medication={medication} />
        <View style={styles.info}>
          <AppText variant="bodyStrong">{medication.name}</AppText>
          <AppText variant="body" color="secondary">
            {medication.dosage} {medication.unit} · {frequencyLabel[medication.schedule.frequency]}
          </AppText>
          <AppText variant="caption" color="muted">
            {times}
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  info: { flex: 1, gap: 2 },
});
