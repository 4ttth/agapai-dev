import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { colors, radii, spacing } from '@/theme';
import type { DoseWithMedication } from '@/types';
import { formatTimeLabel } from '@/utils/datetime';
import { PillAvatar } from './PillAvatar';

interface NextDoseCardProps {
  item: DoseWithMedication;
  overdue: boolean;
  onMarkTaken: (item: DoseWithMedication) => void;
}

/**
 * Prominent hero for the soonest outstanding dose — the primary thing a user
 * sees on opening the app. Large text, one clear action.
 */
export function NextDoseCard({ item, overdue, onMarkTaken }: NextDoseCardProps) {
  const { medication, dose } = item;
  const time = formatTimeLabel(new Date(dose.scheduledAt).toTimeString().slice(0, 5));

  return (
    <View style={styles.card} accessible accessibilityLabel={`Next medicine: ${medication.name}, ${medication.dosage} ${medication.unit}, at ${time}.`}>
      <View style={styles.badgeRow}>
        <Ionicons
          name={overdue ? 'alert-circle' : 'time'}
          size={18}
          color={colors.onPrimary}
        />
        <AppText variant="label" color="inverse">
          {overdue ? 'Overdue dose' : 'Next dose'}
        </AppText>
      </View>

      <View style={styles.body}>
        <PillAvatar appearance={medication.appearance} size={64} />
        <View style={styles.info}>
          <AppText variant="heading" color="inverse">
            {medication.name}
          </AppText>
          <AppText variant="body" color="inverse">
            {medication.dosage} {medication.unit} · {time}
          </AppText>
        </View>
      </View>

      <Button
        label="I Took This"
        variant="success"
        icon={<Ionicons name="checkmark" size={22} color={colors.onSuccess} />}
        onPress={() => onMarkTaken(item)}
        accessibilityHint={`Confirm you took ${medication.name}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.primary,
    borderRadius: radii.xl,
    padding: spacing.xl,
    gap: spacing.xl,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  body: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  info: { flex: 1, gap: spacing.xs },
});
