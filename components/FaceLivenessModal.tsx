import { Ionicons } from '@expo/vector-icons';
import { useCameraPermissions } from 'expo-camera';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { api } from '@/services/api/http';
import { colors, spacing } from '@/theme';

/**
 * Runs the eGov Face Liveness test in an in-app WebView (no external browser).
 *
 * We create the session on our own server (which holds the API key), load the
 * hosted liveness page inline, and hand the session token back to the caller —
 * which verifies the pass/fail (SUCCEEDED >= 95) server-side. Completion is
 * auto-detected from the page's postMessage when possible, with a manual
 * "I've finished" button as a reliable fallback.
 */

const INJECTED_JS = `(function(){
  function relay(d){ try { window.ReactNativeWebView.postMessage(typeof d === 'string' ? d : JSON.stringify(d)); } catch (e) {} }
  window.addEventListener('message', function(e){ relay(e.data); });
  document.addEventListener('message', function(e){ relay(e.data); });
  true;
})();`;

export function FaceLivenessModal({
  visible,
  purpose = 'app',
  onResult,
}: {
  visible: boolean;
  purpose?: string;
  onResult: (token: string | null) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [url, setUrl] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      setUrl(null);
      setToken(null);
      setError(null);
      doneRef.current = false;
      return;
    }
    let active = true;
    (async () => {
      // The liveness page needs the camera; grant it before loading the WebView.
      if (!permission?.granted) {
        const res = await requestPermission();
        if (!res.granted) {
          if (active) setError('Camera access is needed for the Face Liveness test.');
          return;
        }
      }
      setLoading(true);
      try {
        const session = await api<{ url: string; token: string }>('/liveness/session', {
          body: { action: 'post', purpose },
          timeoutMs: 20000,
        });
        if (!active) return;
        setToken(session.token);
        setUrl(session.url);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Could not start Face Liveness.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, purpose]);

  const complete = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onResult(token);
  }, [token, onResult]);

  const cancel = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onResult(null);
  }, [onResult]);

  // Auto-detect a completion signal from the page's postMessage.
  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      const data = e.nativeEvent.data || '';
      if (/succeed|complete|finish|verified|passed/i.test(data)) complete();
    },
    [complete],
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={cancel} presentationStyle="fullScreen">
      <View style={styles.root}>
        <View style={styles.header}>
          <AppText variant="section">Face Liveness test</AppText>
          <Pressable onPress={cancel} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cancel">
            <Ionicons name="close" size={26} color={colors.textPrimary} />
          </Pressable>
        </View>

        {error ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={44} color={colors.danger} />
            <AppText variant="body" color="danger" center>
              {error}
            </AppText>
            <Button label="Close" variant="secondary" onPress={cancel} />
          </View>
        ) : url ? (
          <>
            <WebView
              source={{ uri: url }}
              style={styles.web}
              originWhitelist={['*']}
              injectedJavaScript={INJECTED_JS}
              onMessage={onMessage}
              javaScriptEnabled
              domStorageEnabled
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              mediaCapturePermissionGrantType="grant"
              startInLoadingState
              renderLoading={() => (
                <View style={styles.center}>
                  <ActivityIndicator size="large" color={colors.primary} />
                </View>
              )}
            />
            <View style={styles.footer}>
              <AppText variant="caption" color="secondary" center>
                Follow the on-screen prompts. When it says the check is complete, tap below.
              </AppText>
              <Button label="I&apos;ve completed the test" onPress={complete} />
            </View>
          </>
        ) : (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <AppText variant="body" color="secondary">
              {loading ? 'Starting the liveness test…' : 'Preparing…'}
            </AppText>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  web: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xxl },
  footer: {
    gap: spacing.sm,
    padding: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
});
