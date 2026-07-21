import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { colors, spacing } from '@/theme';

interface LoadingStateProps {
  message?: string;
  testID?: string;
}

/** Centered spinner with an accessible, announced status message. */
export function LoadingState({ message = 'Loading…', testID }: LoadingStateProps) {
  return (
    <View
      testID={testID}
      style={styles.container}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={message}
      accessibilityLiveRegion="polite"
    >
      <ActivityIndicator size="large" color={colors.primary} />
      <AppText variant="label" color="secondary" center style={styles.text}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  text: { marginTop: spacing.lg },
});
