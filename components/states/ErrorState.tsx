import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { colors, spacing } from '@/theme';

interface ErrorStateProps {
  title?: string;
  /** Plain-language, non-technical explanation for the user. */
  message?: string;
  onRetry?: () => void;
  retryLabel?: string;
  testID?: string;
}

/** Clear, calm error surface. Copy avoids jargon and blame. */
export function ErrorState({
  title = 'Something went wrong',
  message = 'We could not load this right now. Please check your connection and try again.',
  onRetry,
  retryLabel = 'Try again',
  testID,
}: ErrorStateProps) {
  return (
    <View
      testID={testID}
      style={styles.container}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={`${title}. ${message}`}
    >
      <View style={styles.iconWrap}>
        <Ionicons name="alert-circle-outline" size={44} color={colors.danger} />
      </View>
      <AppText variant="section" center>
        {title}
      </AppText>
      <AppText variant="body" color="secondary" center style={styles.message}>
        {message}
      </AppText>
      {onRetry ? (
        <View style={styles.action}>
          <Button label={retryLabel} onPress={onRetry} variant="secondary" fullWidth={false} />
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
    backgroundColor: colors.dangerLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  message: { marginTop: spacing.sm },
  action: { marginTop: spacing.xl },
});
