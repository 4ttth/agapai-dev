import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/states/EmptyState';
import { LoadingState } from '@/components/states/LoadingState';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { serverApi } from '@/services/api/server';
import { colors, radii, spacing } from '@/theme';
import type { Professional } from '@/types';

/**
 * Public registry of admin-verified doctors and pharmacists with their PRC
 * license numbers — for verification and accountability. Licenses can be
 * cross-checked at verification.prc.gov.ph.
 */
export default function DirectoryScreen() {
  const [pros, setPros] = useState<Professional[] | null>(null);

  useEffect(() => {
    serverApi
      .directory()
      .then(({ professionals }) => setPros(professionals))
      .catch(() => setPros([]));
  }, []);

  if (!pros) return <LoadingState message="Loading verified professionals…" />;

  return (
    <Screen>
      <AppText variant="body" color="secondary" style={styles.intro}>
        Every doctor and pharmacist on AgapAI is manually verified by an administrator against the
        PRC registry (verification.prc.gov.ph). Their license numbers are public for your safety.
      </AppText>
      {pros.length === 0 ? (
        <EmptyState
          icon="shield-outline"
          title="No verified professionals yet"
          message="Professionals appear here after admin verification."
        />
      ) : (
        <View style={styles.list}>
          {pros.map((p) => (
            <Card key={p.id} style={styles.card}>
              <View style={styles.row}>
                <View style={styles.icon}>
                  <Ionicons
                    name={p.role === 'DOCTOR' ? 'medical' : 'flask'}
                    size={22}
                    color={colors.primary}
                  />
                </View>
                <View style={styles.flex}>
                  <AppText variant="label">
                    {p.role === 'DOCTOR' ? 'Dr. ' : ''}
                    {p.firstName} {p.lastName}
                  </AppText>
                  <AppText variant="caption" color="secondary">
                    PRC License No. {p.prcLicense ?? '—'}
                  </AppText>
                </View>
                <Badge label={p.role === 'DOCTOR' ? 'Doctor' : 'Pharmacist'} tone="primary" />
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { marginBottom: spacing.lg },
  list: { gap: spacing.md },
  card: { paddingVertical: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
});
