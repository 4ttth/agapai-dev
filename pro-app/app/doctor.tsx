import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { api, followUpApi, type ConsultationRow } from '@/lib/api';
import { useSession } from '@/lib/SessionContext';
import { colors, radii, spacing } from '@/lib/theme';
import { Banner, Btn, Card, T } from '@/lib/ui';

/** Doctor dashboard: scan a patient, review own uploads, verification status. */
export default function DoctorHome() {
  const router = useRouter();
  const { session, refresh, signOut } = useSession();
  const [uploads, setUploads] = useState<ConsultationRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const user = session?.user;
  const verified = user?.verified ?? false;
  const [savingSetting, setSavingSetting] = useState<null | 'chat' | 'call'>(null);

  const toggleFollowUp = useCallback(
    async (which: 'chat' | 'call', value: boolean) => {
      setSavingSetting(which);
      try {
        await followUpApi.updateSettings(
          which === 'chat' ? { followUpChat: value } : { followUpCall: value },
        );
        await refresh();
      } catch {
        // ignore — the switch snaps back to the server value on refresh
      } finally {
        setSavingSetting(null);
      }
    },
    [refresh],
  );

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
      const { consultations } = await api<{ consultations: ConsultationRow[] }>('/consultations');
      setUploads(consultations);
    } catch {
      // ignore — banner state comes from `verified`
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After signing out the session is cleared; send the user back to login
  // instead of rendering nothing (which left the app stuck on a white screen).
  if (!user) return <Redirect href="/login" />;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} />}
    >
      <Card style={styles.profile}>
        <View style={styles.row}>
          <View style={styles.avatar}>
            <Ionicons name="medical" size={26} color={colors.onPrimary} />
          </View>
          <View style={styles.flex}>
            <T size={19} weight="700">
              Dr. {user.firstName} {user.lastName}
            </T>
            <T size={13} color={colors.textSecondary}>
              {verified ? `PRC License No. ${user.prcLicense ?? '—'} · verified ✓` : 'Doctor'}
            </T>
          </View>
          <Pressable onPress={() => void signOut()} accessibilityLabel="Sign out" hitSlop={12}>
            <Ionicons name="log-out-outline" size={24} color={colors.textMuted} />
          </Pressable>
        </View>
      </Card>

      {!verified ? (
        <Banner
          text="Awaiting admin verification of your PRC license. Pull down to refresh — you can scan patients but not upload records yet."
          tone="warning"
        />
      ) : null}

      <Pressable
        onPress={() => router.push({ pathname: '/scan-patient', params: { next: 'consult' } })}
        style={styles.scanCta}
        accessibilityRole="button"
        accessibilityLabel="Scan patient Health ID"
      >
        <Ionicons name="qr-code" size={44} color={colors.onPrimary} />
        <T size={20} weight="800" color={colors.onPrimary}>
          Scan patient Health ID
        </T>
        <T size={14} color="#DCF0EF" center>
          Decodes their profile and lets you upload an encrypted consultation record.
        </T>
      </Pressable>

      <Card style={styles.followCard}>
        <View style={styles.row}>
          <Ionicons name="chatbubbles" size={22} color={colors.primary} />
          <View style={styles.flex}>
            <T size={16} weight="700">
              Patient follow-ups
            </T>
            <T size={13} color={colors.textSecondary}>
              Let your most recent patient reach you after a visit.
            </T>
          </View>
        </View>

        <View style={styles.settingRow}>
          <View style={styles.flex}>
            <T size={15} weight="600">
              Allow follow-up chat
            </T>
            <T size={12} color={colors.textMuted}>
              End-to-end encrypted, auto-deletes after 7 days
            </T>
          </View>
          <Switch
            value={user.followUpChat ?? false}
            disabled={savingSetting === 'chat'}
            onValueChange={(v) => void toggleFollowUp('chat', v)}
            trackColor={{ true: colors.primary, false: colors.borderStrong }}
          />
        </View>

        <View style={styles.settingRow}>
          <View style={styles.flex}>
            <T size={15} weight="600">
              Allow follow-up calls
            </T>
            <T size={12} color={colors.textMuted}>
              Peer-to-peer voice (off by default)
            </T>
          </View>
          <Switch
            value={user.followUpCall ?? false}
            disabled={savingSetting === 'call'}
            onValueChange={(v) => void toggleFollowUp('call', v)}
            trackColor={{ true: colors.primary, false: colors.borderStrong }}
          />
        </View>

        <Btn
          label="Open follow-ups"
          kind="secondary"
          onPress={() => router.push('/follow-ups')}
          style={styles.followBtn}
        />
      </Card>

      <T size={17} weight="700" style={styles.sectionTitle}>
        My uploaded records
      </T>
      {uploads.length === 0 ? (
        <Card>
          <T size={15} color={colors.textSecondary}>
            No records uploaded yet. Scan a patient to create the first one.
          </T>
        </Card>
      ) : (
        uploads.map((c) => (
          <Card key={c.id} style={styles.uploadCard}>
            <View style={styles.row}>
              <Ionicons name="document-lock" size={22} color={colors.primary} />
              <View style={styles.flex}>
                <T size={15} weight="600">
                  {c.patient?.firstName} {c.patient?.lastName} — {c.type}
                </T>
                <T size={13} color={colors.textSecondary}>
                  {new Date(c.date).toLocaleString()} · encrypted
                  {c.dispensedAt ? ' · dispensed' : ''}
                </T>
              </View>
            </View>
          </Card>
        ))
      )}

      <View style={styles.footerNote}>
        <Ionicons name="lock-closed" size={14} color={colors.textMuted} />
        <T size={12} color={colors.textMuted}>
          Records are encrypted on this device. After upload, only the patient can read them.
        </T>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceMuted },
  scroll: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
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
    backgroundColor: colors.blue,
    borderRadius: radii.xl,
    padding: spacing.xxl,
    alignItems: 'center',
    gap: spacing.md,
  },
  sectionTitle: { marginTop: spacing.md },
  followCard: { gap: spacing.md },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  followBtn: { marginTop: spacing.xs },
  uploadCard: { padding: spacing.lg },
  footerNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, justifyContent: 'center' },
});
