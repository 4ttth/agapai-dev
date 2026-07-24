import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radii, spacing } from '@/lib/theme';
import { T } from '@/lib/ui';
import { useWebRtcCall, type CallState } from '@/lib/useWebRtcCall';

const LABEL: Record<CallState, string> = {
  idle: 'Preparing…',
  connecting: 'Connecting…',
  ringing: 'Calling patient…',
  connected: 'Connected',
  ended: 'Call ended',
  error: 'Call unavailable',
};

/** Doctor-side follow-up call. The doctor initiates a call to the patient. */
export default function ProFollowUpCallScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { state, error, muted, start, hangUp, toggleMute } = useWebRtcCall({ threadId: id, initiator: true });

  useEffect(() => {
    void start();
  }, [start]);

  useEffect(() => {
    if (state === 'ended') {
      const t = setTimeout(() => router.back(), 900);
      return () => clearTimeout(t);
    }
  }, [state, router]);

  return (
    <View style={styles.root}>
      <View style={styles.center}>
        <View style={styles.avatar}>
          <Ionicons name="call" size={44} color={colors.onPrimary} />
        </View>
        <T size={24} weight="700" color={colors.onPrimary} center style={styles.state}>
          {LABEL[state]}
        </T>
        {error ? (
          <T size={15} color={colors.onPrimary} center style={styles.error}>
            {error}
          </T>
        ) : (
          <T size={13} color={colors.onPrimary} center style={styles.sub}>
            Voice is peer-to-peer and end-to-end encrypted (DTLS-SRTP).
          </T>
        )}
      </View>

      <View style={styles.controls}>
        {state !== 'error' && state !== 'ended' ? (
          <Pressable
            onPress={toggleMute}
            style={[styles.control, muted && styles.controlActive]}
            accessibilityRole="button"
            accessibilityLabel={muted ? 'Unmute' : 'Mute'}
          >
            <Ionicons name={muted ? 'mic-off' : 'mic'} size={26} color={colors.onPrimary} />
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => {
            hangUp();
            router.back();
          }}
          style={[styles.control, styles.hangup]}
          accessibilityRole="button"
          accessibilityLabel="End call"
        >
          <Ionicons name="call" size={26} color={colors.onPrimary} style={styles.hangIcon} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.primaryDark, justifyContent: 'space-between', padding: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: radii.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  state: { marginTop: spacing.lg },
  sub: { opacity: 0.75, maxWidth: 280 },
  error: { opacity: 0.9, maxWidth: 300 },
  controls: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xxl, paddingBottom: spacing.xl },
  control: {
    width: 64,
    height: 64,
    borderRadius: radii.pill,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlActive: { backgroundColor: 'rgba(255,255,255,0.35)' },
  hangup: { backgroundColor: colors.danger },
  hangIcon: { transform: [{ rotate: '135deg' }] },
});
