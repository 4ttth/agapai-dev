import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/hooks/useAuth';
import { colors, radii, spacing } from '@/theme';

interface Item {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sub?: string;
  route?: string;
  danger?: boolean;
  onPress?: () => void;
}

/** More: personal info, verification, legal, help, and app information. */
export default function MoreScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const user = session?.user;

  const items: Item[] = [
    {
      icon: 'person-circle',
      label: 'Edit personal information',
      sub: user?.everified
        ? 'Identity verified via eVerify ✓'
        : 'Requires one-time eVerify (National ID)',
      route: user?.everified ? '/edit-profile' : '/verify-identity',
    },
    { icon: 'qr-code', label: 'My Health ID', sub: 'Show your QR to clinic staff', route: '/health-id' },
    {
      icon: 'chatbubbles',
      label: 'Doctor follow-ups',
      sub: 'Chat or call your most recent doctor',
      route: '/follow-up',
    },
    {
      icon: 'notifications',
      label: 'Notifications',
      sub: 'Consultations, dispensing, mood & medication reminders',
      route: '/notifications',
    },
    { icon: 'book', label: 'How to use AgapAI', route: '/guide' },
    { icon: 'lock-closed', label: 'Privacy Policy', route: '/privacy' },
    { icon: 'document-text', label: 'Terms & Conditions', route: '/terms' },
    { icon: 'information-circle', label: 'About this app', route: '/about' },
    { icon: 'log-out', label: 'Sign out', danger: true, onPress: () => void signOut() },
  ];

  return (
    <Screen background="muted">
      {user ? (
        <Card style={styles.profileCard}>
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <AppText variant="title" color="inverse">
                {user.firstName[0]?.toUpperCase()}
              </AppText>
            </View>
            <View style={styles.flex}>
              <AppText variant="section">
                {user.firstName} {user.lastName} {user.suffix ?? ''}
              </AppText>
              <AppText variant="caption" color="secondary">
                Health ID: {user.id.slice(0, 12)}…
              </AppText>
              <View style={styles.badges}>
                <Badge label="eGovPH linked" tone="primary" />
                {user.everified ? <Badge label="eVerified" tone="success" /> : null}
              </View>
            </View>
          </View>
        </Card>
      ) : null}

      <View style={styles.list}>
        {items.map((item) => (
          <Pressable
            key={item.label}
            onPress={item.onPress ?? (() => item.route && router.push(item.route as never))}
            style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            accessibilityHint={item.sub}
          >
            <View style={[styles.itemIcon, item.danger && { backgroundColor: colors.dangerLight }]}>
              <Ionicons
                name={item.icon}
                size={22}
                color={item.danger ? colors.danger : colors.primary}
              />
            </View>
            <View style={styles.flex}>
              <AppText variant="label" color={item.danger ? 'danger' : 'primary'}>
                {item.label}
              </AppText>
              {item.sub ? (
                <AppText variant="caption" color="secondary">
                  {item.sub}
                </AppText>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileCard: { marginBottom: spacing.lg },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badges: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  flex: { flex: 1 },
  list: { gap: spacing.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.lg,
    minHeight: 64,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pressed: { opacity: 0.85 },
  itemIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
