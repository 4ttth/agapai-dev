import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { colors, spacing } from '@/theme';
import type { DoseStatus, DoseWithMedication } from '@/types';
import { formatTimeLabel } from '@/utils/datetime';
import { doseStatusPresentation } from './doseStatus';
import { PillAvatar } from './PillAvatar';

interface DoseRowProps {
  item: DoseWithMedication;
  status: DoseStatus;
  onMarkTaken: (item: DoseWithMedication) => void;
  onUndo: (item: DoseWithMedication) => void;
  onOpen: (medicationId: string) => void;
}

const accentByStatus: Record<DoseStatus, string> = {
  taken: colors.success,
  missed: colors.danger,
  pending: colors.primary,
};

/** One scheduled dose with a large, unmistakable "I Took This" action. */
export function DoseRow({ item, status, onMarkTaken, onUndo, onOpen }: DoseRowProps) {
  const { medication, dose } = item;
  const presentation = doseStatusPresentation[status];
  const time = formatTimeLabel(new Date(dose.scheduledAt).toTimeString().slice(0, 5));

  return (
    <Card
      accent={accentByStatus[status]}
      onPress={() => onOpen(medication.id)}
      accessibilityLabel={`${medication.name}, ${medication.dosage} ${medication.unit}, at ${time}. Status: ${presentation.label}.`}
      accessibilityHint="Opens medicine details"
    >
      <View style={styles.header}>
        <PillAvatar appearance={medication.appearance} />
        <View style={styles.info}>
          <AppText variant="bodyStrong">{medication.name}</AppText>
          <AppText variant="body" color="secondary">
            {medication.dosage} {medication.unit} · {time}
          </AppText>
        </View>
        <Badge
          label={presentation.label}
          tone={presentation.tone}
          icon={<Ionicons name={presentation.icon} size={14} color={accentByStatus[status]} />}
        />
      </View>

      <View style={styles.action}>
        {status === 'taken' ? (
          <Button
            label="Undo"
            variant="ghost"
            onPress={() => onUndo(item)}
            fullWidth={false}
            accessibilityHint={`Mark ${medication.name} as not taken`}
          />
        ) : (
          <Button
            label="I Took This"
            variant="success"
            icon={<Ionicons name="checkmark" size={20} color={colors.onSuccess} />}
            onPress={() => onMarkTaken(item)}
            accessibilityHint={`Confirm you took ${medication.name}`}
          />
        )}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  info: { flex: 1 },
  action: { marginTop: spacing.lg },
});
