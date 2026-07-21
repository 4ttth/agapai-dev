import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/states/EmptyState';
import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { serverApi } from '@/services/api/server';
import { deleteDocument, formatBytes, listDocuments } from '@/services/documents';
import { colors, layout, radii, spacing } from '@/theme';
import type { ConsultationRow, ScannedDoc } from '@/types';

type Tab = 'consultations' | 'documents';

/** Health records: encrypted consultation logs + offline scanned documents. */
export default function RecordsScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('consultations');
  const [consultations, setConsultations] = useState<ConsultationRow[]>([]);
  const [docs, setDocs] = useState<ScannedDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setServerError(null);
    try {
      const [{ consultations: list }, documents] = await Promise.all([
        serverApi.listConsultations().catch((e) => {
          setServerError(e instanceof Error ? e.message : 'Could not load consultations.');
          return { consultations: [] as ConsultationRow[] };
        }),
        listDocuments(),
      ]);
      setConsultations(list);
      setDocs(documents);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.root}>
      <View style={styles.tabs}>
        {(
          [
            ['consultations', 'Consultations', 'document-lock'],
            ['documents', 'My documents', 'images'],
          ] as Array<[Tab, string, keyof typeof Ionicons.glyphMap]>
        ).map(([key, label, icon]) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            style={[styles.tab, tab === key && styles.tabActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === key }}
          >
            <Ionicons name={icon} size={18} color={tab === key ? colors.onPrimary : colors.textSecondary} />
            <AppText variant="label" color={tab === key ? 'inverse' : 'secondary'}>
              {label}
            </AppText>
          </Pressable>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        showsVerticalScrollIndicator={false}
      >
        {tab === 'consultations' ? (
          <>
            <AppText variant="caption" color="secondary" style={styles.hint}>
              Records are end-to-end encrypted. Only you can open them — not the server, your
              doctor, or eGov.
            </AppText>
            {serverError ? (
              <Card>
                <AppText variant="body" color="danger">
                  {serverError}
                </AppText>
              </Card>
            ) : consultations.length === 0 ? (
              <EmptyState
                icon="document-lock-outline"
                title="No consultations yet"
                message="After a visit, your doctor scans your Health ID and uploads the record here, encrypted."
              />
            ) : (
              consultations.map((c) => (
                <Pressable key={c.id} onPress={() => router.push(`/consultation/${c.id}`)}>
                  <Card style={styles.consultCard}>
                    <View style={styles.rowBetween}>
                      <Badge label={c.type} tone="primary" />
                      {c.dispensedAt ? <Badge label="Dispensed" tone="success" /> : null}
                    </View>
                    <AppText variant="section" style={styles.consultTitle}>
                      Dr. {c.doctor?.firstName} {c.doctor?.lastName}
                    </AppText>
                    <AppText variant="caption" color="secondary">
                      {new Date(c.date).toLocaleString()} · PRC {c.doctor?.prcLicense ?? 'pending'}
                      {c.hasVoice ? ' · 🎙 voice note' : ''}
                    </AppText>
                  </Card>
                </Pressable>
              ))
            )}
          </>
        ) : (
          <>
            <Button
              label="Scan a document"
              icon={<Ionicons name="scan" size={22} color={colors.onPrimary} />}
              onPress={() => router.push('/scan-document')}
              accessibilityHint="Opens the camera to scan a medical document"
            />
            <AppText variant="caption" color="secondary" style={styles.hint}>
              Saved only on this phone, compressed to save space. Nothing is uploaded.
            </AppText>
            {docs.length === 0 ? (
              <EmptyState
                icon="images-outline"
                title="No documents yet"
                message="Scan lab results, prescriptions, or medical certificates to keep them handy."
              />
            ) : (
              <View style={styles.grid}>
                {docs.map((d) => (
                  <View key={d.id} style={styles.docCard}>
                    <Image source={{ uri: d.uri }} style={styles.docImage} accessibilityLabel={d.name} />
                    <View style={styles.docMeta}>
                      <AppText variant="label" numberOfLines={1}>
                        {d.name}
                      </AppText>
                      <AppText variant="caption" color="muted">
                        {new Date(d.createdAt).toLocaleDateString()} · {formatBytes(d.sizeBytes)}
                      </AppText>
                    </View>
                    <Pressable
                      onPress={() => void deleteDocument(d.id).then(setDocs)}
                      style={styles.docDelete}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${d.name}`}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.danger} />
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  tabs: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.md,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 48,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceMuted,
  },
  tabActive: { backgroundColor: colors.primary },
  scroll: { padding: layout.screenPadding, paddingTop: spacing.sm, gap: spacing.lg },
  hint: { paddingHorizontal: spacing.xs },
  consultCard: { gap: spacing.sm },
  consultTitle: { marginTop: spacing.xs },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  grid: { gap: spacing.lg },
  docCard: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  docImage: { width: '100%', height: 180, backgroundColor: colors.surfaceMuted },
  docMeta: { padding: spacing.lg, gap: spacing.xs },
  docDelete: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
