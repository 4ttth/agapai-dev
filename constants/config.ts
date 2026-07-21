import Constants from 'expo-constants';

/**
 * Resolve the AgapAI server URL:
 * 1. EXPO_PUBLIC_API_URL env (set this to the VPS URL for the deployed demo),
 * 2. otherwise the machine running the Expo dev server, port 4000 (local dev).
 */
function resolveServerUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const hostUri: string | undefined =
    Constants.expoConfig?.hostUri ??
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;
  const host = hostUri?.split(':')[0];
  return host ? `http://${host}:4000` : 'http://localhost:4000';
}

/** App-wide configuration and mock toggles. */
export const appConfig = {
  appName: 'AgapAI',
  tagline: 'Your health, made simple',
  serverUrl: resolveServerUrl(),
  /** Simulated latency (ms) for mock services so loading states are realistic. */
  mockLatencyMs: 600,
  /**
   * Flip to true to make mock services reject, exercising error states in the UI.
   * Handy for manual QA and screenshots.
   */
  simulateServiceError: false,
} as const;
