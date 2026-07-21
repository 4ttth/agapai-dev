import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { useSession } from '@/lib/SessionContext';
import { colors, radii, spacing } from '@/lib/theme';
import { Banner, Card, T } from '@/lib/ui';

/** Pharmacist dashboard: scan a Health ID to fetch + decrypt the latest prescription. */
export default function PharmacistHome() {
  const router = useRouter();
  const { session, refresh, signOut } = useSession();
  const [refreshing, setRefreshing] = useState(false);

  const user = session?.user;
  const verified = user?.verified ?? false;

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) return null;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} />}
    >
      <Card style={styles.profile}>
        <View style={styles.row}>
          <View style={styles.avatar}>
            <Ionicons name="flask" size={26} color={colors.onPrimary} />
          </View>
          <View style={styles.flex}>
            <T size={19} weight="700">
              {user.firstName} {user.lastName}, RPh
            </T>
            <T size={13} color={colors.textSecondary}>
              {verified ? `PRC License No. ${user.prcLicense ?? '—'} · verified ✓` : 'Pharmacist'}
            </T>
          </View>
          <Pressable onPress={() => void signOut()} accessibilityLabel="Sign out" hitSlop={12}>
            <Ionicons name="log-out-outline" size={24} color={colors.textMuted} />
          </Pressable>
        </View>
      </Card>

      {!verified ? (
        <Banner
          text="Awaiting admin verification of your PRC license. Pull down to refresh."
          tone="warning"
        />
      ) : null}

      <Pressable
        onPress={() => router.push({ pathname: '/scan-patient', params: { next: 'dispense' } })}
        style={styles.scanCta}
        accessibilityRole="button"
        accessibilityLabel="Scan patient Health ID"
      >
        <Ionicons name="qr-code" size={44} color={colors.onPrimary} />
        <T size={20} weight="800" color={colors.onPrimary}>
          Scan patient Health ID
        </T>
        <T size={14} color="#DCF0EF" center>
          Fetches their latest prescription and decrypts it with the key inside their QR.
        </T>
      </Pressable>

      <Card>
        <T size={15} weight="700">
          How dispensing works
        </T>
        <View style={styles.steps}>
          {[
            'Patient shows their AgapAI Health ID QR.',
            'The latest encrypted prescription is fetched from the server.',
            'It decrypts locally using the key in the QR — the server never sees it.',
            'Check off what you dispense; it syncs to the patient’s app instantly.',
          ].map((s, i) => (
            <View key={i} style={styles.step}>
              <View style={styles.stepNum}>
                <T size={12} weight="700" color={colors.onPrimary}>
                  {i + 1}
                </T>
              </View>
              <T size={14} color={colors.textSecondary} style={styles.flex}>
                {s}
              </T>
            </View>
          ))}
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceMuted },
  scroll: { padding: spacing.xl, gap: spacing.lg },
  profile: { padding: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flex: { flex: 1 },
  scanCta: {
    backgroundColor: colors.primary,
    borderRadius: radii.xl,
    padding: spacing.xxl,
    alignItems: 'center',
    gap: spacing.md,
  },
  steps: { gap: spacing.md, marginTop: spacing.md },
  step: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
});
