import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useWebRtcCall, type CallState } from '@/hooks/useWebRtcCall';
import { colors, radii, spacing } from '@/theme';

const LABEL: Record<CallState, string> = {
  idle: 'Preparing…',
  connecting: 'Connecting…',
  ringing: 'Ringing…',
  connected: 'Connected',
  ended: 'Call ended',
  error: 'Call unavailable',
};

/** Follow-up voice call (WebRTC, peer-to-peer over UDP). Caller or callee. */
export default function FollowUpCallScreen() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const router = useRouter();
  const isCaller = mode !== 'callee';
  const { state, error, muted, start, accept, decline, hangUp, toggleMute } = useWebRtcCall({
    threadId: id,
    initiator: isCaller,
  });

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
        <AppText variant="title" color="inverse" center style={styles.state}>
          {!isCaller && state === 'ringing' ? 'Incoming call…' : LABEL[state]}
        </AppText>
        {error ? (
          <AppText variant="body" color="inverse" center style={styles.error}>
            {error}
          </AppText>
        ) : (
          <AppText variant="caption" color="inverse" center style={styles.sub}>
            Voice is peer-to-peer and end-to-end encrypted (DTLS-SRTP).
          </AppText>
        )}
      </View>

      <View style={styles.controls}>
        {!isCaller && state === 'ringing' ? (
          <>
            <Pressable
              onPress={() => {
                decline();
                router.back();
              }}
              style={[styles.control, styles.hangup]}
              accessibilityRole="button"
              accessibilityLabel="Decline call"
            >
              <Ionicons name="call" size={26} color={colors.onPrimary} style={styles.hangIcon} />
            </Pressable>
            <Pressable
              onPress={accept}
              style={[styles.control, styles.answer]}
              accessibilityRole="button"
              accessibilityLabel="Answer call"
            >
              <Ionicons name="call" size={26} color={colors.onPrimary} />
            </Pressable>
          </>
        ) : (
          <>
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
          </>
        )}
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
  answer: { backgroundColor: colors.success },
  hangIcon: { transform: [{ rotate: '135deg' }] },
});
