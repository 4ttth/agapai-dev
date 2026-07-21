import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs } from 'expo-router';
import { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { QuickActions } from '@/components/QuickActions';
import { colors, palette, radii, spacing } from '@/theme';

/** Center floating action button that opens the quick-actions sheet. */
function CenterButton({ onPress }: { onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;

  const animate = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, damping: 10 }).start();

  return (
    <View style={styles.centerWrap} pointerEvents="box-none">
      <Pressable
        onPress={onPress}
        onPressIn={() => animate(0.9)}
        onPressOut={() => animate(1)}
        accessibilityRole="button"
        accessibilityLabel="Quick actions"
        accessibilityHint="Opens shortcuts: scan document, health ID, consultations, medications, AI assistant"
      >
        <Animated.View style={{ transform: [{ scale }] }}>
          <LinearGradient
            colors={[palette.blue500, palette.blue900]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fab}
          >
            <Ionicons name="apps" size={28} color={colors.onPrimary} />
          </LinearGradient>
        </Animated.View>
      </Pressable>
    </View>
  );
}

/** Bottom navigation: Home · Meds · [Quick actions] · Records · More. */
export default function TabsLayout() {
  const [quickOpen, setQuickOpen] = useState(false);

  return (
    <>
      <Tabs
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: { fontFamily: 'Lexend_600SemiBold', fontSize: 20 },
          headerShadowVisible: false,
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabelStyle: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
          tabBarStyle: {
            height: 72,
            paddingBottom: spacing.sm,
            paddingTop: spacing.sm,
            borderTopWidth: 0,
            elevation: 16,
            shadowColor: '#000',
            shadowOpacity: 0.08,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: -4 },
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            headerShown: false,
            tabBarLabel: 'Home',
            tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
            tabBarAccessibilityLabel: 'Home, your health summary',
          }}
        />
        <Tabs.Screen
          name="medications"
          options={{
            title: 'My Medicines',
            tabBarLabel: 'Meds',
            tabBarIcon: ({ color, size }) => <Ionicons name="medkit" size={size} color={color} />,
            tabBarAccessibilityLabel: 'My medicines and daily checklist',
          }}
        />
        <Tabs.Screen
          name="action"
          options={{
            title: '',
            tabBarButton: () => <CenterButton onPress={() => setQuickOpen(true)} />,
          }}
          listeners={{ tabPress: (e) => e.preventDefault() }}
        />
        <Tabs.Screen
          name="records"
          options={{
            title: 'Health Records',
            tabBarLabel: 'Records',
            tabBarIcon: ({ color, size }) => <Ionicons name="folder-open" size={size} color={color} />,
            tabBarAccessibilityLabel: 'Consultations and scanned documents',
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: 'More',
            tabBarLabel: 'More',
            tabBarIcon: ({ color, size }) => <Ionicons name="menu" size={size} color={color} />,
            tabBarAccessibilityLabel: 'Profile, settings, and information',
          }}
        />
      </Tabs>
      <QuickActions visible={quickOpen} onClose={() => setQuickOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fab: {
    width: 60,
    height: 60,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -26,
    shadowColor: palette.blue900,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
    borderWidth: 4,
    borderColor: colors.background,
  },
});
