import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View } from 'react-native';

import { colors, palette, radii, spacing } from '@/theme';
import { AppText } from './ui/AppText';

interface QuickActionsProps {
  visible: boolean;
  onClose: () => void;
}

const ACTIONS: Array<{ icon: keyof typeof Ionicons.glyphMap; label: string; route: string; color: string }> = [
  { icon: 'scan', label: 'Scan document', route: '/scan-document', color: palette.teal700 },
  { icon: 'qr-code', label: 'My Health ID', route: '/health-id', color: palette.blue700 },
  { icon: 'folder-open', label: 'Consultations', route: '/(tabs)/records', color: palette.blue500 },
  { icon: 'medkit', label: 'Medications', route: '/(tabs)/medications', color: palette.green700 },
  { icon: 'mic', label: 'AI Assistant', route: '/assistant', color: palette.warning700 },
];

/** Floating quick-actions sheet opened by the center tab button. */
export function QuickActions({ visible, onClose }: QuickActionsProps) {
  const router = useRouter();
  const anims = useRef(ACTIONS.map(() => new Animated.Value(0))).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(backdrop, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      Animated.stagger(
        45,
        anims.map((a) =>
          Animated.spring(a, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 160 }),
        ),
      ).start();
    } else {
      backdrop.setValue(0);
      anims.forEach((a) => a.setValue(0));
    }
  }, [visible, anims, backdrop]);

  const go = (route: string) => {
    onClose();
    // Small delay so the modal fully closes before navigation.
    setTimeout(() => router.push(route as never), 80);
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.backdropPress} onPress={onClose} accessibilityLabel="Close quick actions">
        <Animated.View style={[styles.backdrop, { opacity: backdrop }]} />
      </Pressable>
      <View style={styles.sheetWrap} pointerEvents="box-none">
        <View style={styles.grid}>
          {ACTIONS.map((action, i) => (
            <Animated.View
              key={action.route}
              style={{
                opacity: anims[i],
                transform: [
                  { translateY: anims[i].interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
                  { scale: anims[i].interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
                ],
              }}
            >
              <Pressable
                onPress={() => go(action.route)}
                style={styles.action}
                accessibilityRole="button"
                accessibilityLabel={action.label}
              >
                <View style={[styles.iconCircle, { backgroundColor: action.color }]}>
                  <Ionicons name={action.icon} size={26} color={colors.onPrimary} />
                </View>
                <AppText variant="label" color="inverse" center>
                  {action.label}
                </AppText>
              </Pressable>
            </Animated.View>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdropPress: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  backdrop: { flex: 1, backgroundColor: 'rgba(6, 22, 44, 0.82)' },
  sheetWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 140,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.xl,
    paddingHorizontal: spacing.xl,
    maxWidth: 420,
  },
  action: { alignItems: 'center', gap: spacing.sm, width: 96 },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
});
