import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { colors, spacing } from '@/theme';
import type { HealthProfile } from '@/types';

interface ProfileSummaryProps {
  profile: HealthProfile;
  /** When true, hides the emergency contact (e.g. a limited clinic view). */
  compact?: boolean;
}

function Section({
  icon,
  title,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={20} color={colors.primary} />
        <AppText variant="label" color="secondary">
          {title}
        </AppText>
      </View>
      {children}
    </View>
  );
}

/** Read-only, scannable summary of the essential health data. */
export function ProfileSummary({ profile, compact = false }: ProfileSummaryProps) {
  return (
    <View style={styles.container}>
      <Card>
        <AppText variant="heading">{profile.fullName}</AppText>
        <View style={styles.bloodRow}>
          <Ionicons name="water" size={20} color={colors.danger} />
          <AppText variant="bodyStrong">Blood type: {profile.bloodType}</AppText>
        </View>
      </Card>

      <Section icon="alert-circle-outline" title="Allergies">
        <View style={styles.tags}>
          {profile.allergies.length === 0 ? (
            <AppText variant="body" color="secondary">
              None recorded
            </AppText>
          ) : (
            profile.allergies.map((a) => <Badge key={a} label={a} tone="danger" />)
          )}
        </View>
      </Section>

      <Section icon="medkit-outline" title="Existing conditions">
        <View style={styles.tags}>
          {profile.conditions.length === 0 ? (
            <AppText variant="body" color="secondary">
              None recorded
            </AppText>
          ) : (
            profile.conditions.map((c) => <Badge key={c} label={c} tone="warning" />)
          )}
        </View>
      </Section>

      {!compact ? (
        <Section icon="call-outline" title="Emergency contact">
          <AppText variant="body">
            {profile.emergencyContact.name} ({profile.emergencyContact.relationship})
          </AppText>
          <AppText variant="body" color="secondary">
            {profile.emergencyContact.phone}
          </AppText>
        </Section>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.xl },
  section: { gap: spacing.md },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bloodRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
