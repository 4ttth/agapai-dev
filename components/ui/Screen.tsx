import type { ReactElement, ReactNode } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  type RefreshControlProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, layout } from '@/theme';

interface ScreenProps {
  children: ReactNode;
  /** When true, content scrolls. Disable for screens that manage their own list. */
  scroll?: boolean;
  /** Remove default horizontal gutter (e.g. for full-bleed lists). */
  edgeToEdge?: boolean;
  contentContainerStyle?: ViewStyle;
  background?: 'default' | 'muted' | 'primary';
  /** Optional pull-to-refresh control, forwarded to the scroll view. */
  refreshControl?: ReactElement<RefreshControlProps>;
  testID?: string;
}

/**
 * Consistent safe-area + padding wrapper for every screen. Keeps horizontal
 * gutters and max content width identical app-wide.
 */
export function Screen({
  children,
  scroll = true,
  edgeToEdge = false,
  contentContainerStyle,
  background = 'default',
  refreshControl,
  testID,
}: ScreenProps) {
  const insets = useSafeAreaInsets();

  const backgroundColor =
    background === 'primary'
      ? colors.primary
      : background === 'muted'
        ? colors.surfaceMuted
        : colors.background;

  const padding: ViewStyle = {
    paddingTop: insets.top + layout.gap,
    paddingBottom: insets.bottom + layout.gap,
    paddingHorizontal: edgeToEdge ? 0 : layout.screenPadding,
  };

  if (scroll) {
    return (
      <ScrollView
        testID={testID}
        style={[styles.flex, { backgroundColor }]}
        contentContainerStyle={[styles.grow, padding, contentContainerStyle]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View testID={testID} style={[styles.flex, { backgroundColor }, padding, contentContainerStyle]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grow: { flexGrow: 1 },
});
