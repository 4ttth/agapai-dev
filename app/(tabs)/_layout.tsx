import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { colors, spacing } from '@/theme';

/** Bottom tab navigation with large, clearly-labelled icons. */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontFamily: 'Lexend_600SemiBold', fontSize: 20 },
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
        tabBarStyle: { height: 68, paddingBottom: spacing.sm, paddingTop: spacing.sm },
        tabBarActiveBackgroundColor: colors.surfaceAlt,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarLabel: 'Today',
          tabBarIcon: ({ color, size }) => <Ionicons name="today" size={size} color={color} />,
          tabBarAccessibilityLabel: 'Today, your medication reminders',
        }}
      />
      <Tabs.Screen
        name="medications"
        options={{
          title: 'My Medicines',
          tabBarLabel: 'Medicines',
          tabBarIcon: ({ color, size }) => <Ionicons name="medkit" size={size} color={color} />,
          tabBarAccessibilityLabel: 'My medicines list',
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Health ID',
          tabBarLabel: 'Health ID',
          tabBarIcon: ({ color, size }) => <Ionicons name="qr-code" size={size} color={color} />,
          tabBarAccessibilityLabel: 'Your health profile and QR code',
        }}
      />
    </Tabs>
  );
}
