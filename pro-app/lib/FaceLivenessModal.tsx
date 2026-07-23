import { Ionicons } from '@expo/vector-icons';
import { useCameraPermissions } from 'expo-camera';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { api } from './api';
import { colors, spacing } from './theme';
import { Btn, T } from './ui';

/**
 * In-app WebView Face Liveness test for AgapAI Pro. Creates the session on our
 * server, loads the hosted liveness page inline, and returns the token to the
 * caller (which verifies SUCCEEDED >= 95 server-side).
 */

const INJECTED_JS = `(function(){
  function relay(d){ try { window.ReactNativeWebView.postMessage(typeof d === 'string' ? d : JSON.stringify(d)); } catch (e) {} }
  window.addEventListener('message', function(e){ relay(e.data); });
  document.addEventListener('message', function(e){ relay(e.data); });
  true;
})();`;

export function FaceLivenessModal({
  visible,
  purpose = 'pro-register',
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
      if (!permission?.granted) {
        const res = await requestPermission();
        if (!res.granted) {
          if (active) setError('Camera access is needed for the Face Liveness test.');
          return;
        }
      }
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

  const onMessage = useCallback(
    (e: WebViewMessageEvent) => {
      if (/succeed|complete|finish|verified|passed/i.test(e.nativeEvent.data || '')) complete();
    },
    [complete],
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={cancel} presentationStyle="fullScreen">
      <View style={styles.root}>
        <View style={styles.header}>
          <T size={17} weight="700">
            Face Liveness test
          </T>
          <Pressable onPress={cancel} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cancel">
            <Ionicons name="close" size={26} color={colors.text} />
          </Pressable>
        </View>

        {error ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={44} color={colors.danger} />
            <T size={15} color={colors.danger} center>
              {error}
            </T>
            <Btn label="Close" kind="secondary" onPress={cancel} />
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
              <T size={12} color={colors.textSecondary} center>
                Follow the on-screen prompts. When the check is complete, tap below.
              </T>
              <Btn label="I've completed the test" onPress={complete} />
            </View>
          </>
        ) : (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <T size={15} color={colors.textSecondary}>
              Starting the liveness test…
            </T>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
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
