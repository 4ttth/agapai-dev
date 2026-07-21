import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { colors, spacing } from '@/theme';

interface EmptyStateProps {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}

/** Friendly, plain-language empty state with an optional primary action. */
export function EmptyState({
  icon = 'documents-outline',
  title,
  message,
  actionLabel,
  onAction,
  testID,
}: EmptyStateProps) {
  return (
    <View testID={testID} style={styles.container} accessible accessibilityLabel={`${title}. ${message ?? ''}`}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={44} color={colors.primary} />
      </View>
      <AppText variant="section" center>
        {title}
      </AppText>
      {message ? (
        <AppText variant="body" color="secondary" center style={styles.message}>
          {message}
        </AppText>
      ) : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <Button label={actionLabel} onPress={onAction} fullWidth={false} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  message: { marginTop: spacing.sm },
  action: { marginTop: spacing.xl },
});
