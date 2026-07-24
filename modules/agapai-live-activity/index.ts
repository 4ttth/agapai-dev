import { requireOptionalNativeModule, type EventSubscription } from 'expo-modules-core';

/**
 * JS surface for the AgapAI medication Live Activity (iOS 16.2+).
 *
 * The native module only exists in a custom dev/production build — it is absent
 * in Expo Go, on Android, and on web. Every call here is therefore null-safe:
 * {@link isSupported} is the single gate the rest of the app should check.
 */

/** Phase of the medication Live Activity. */
export type MedActivityPhase = 'upcoming' | 'due';

/** A dose confirmed from a Live Activity while the app was closed. */
export interface PendingTaken {
  medicationId: string;
  scheduledAtISO: string;
  /** Epoch seconds when the intent recorded the tap. */
  at?: number;
}

/** Action relayed from a Live Activity button while the app is running. */
export interface LiveActivityAction {
  action: 'acknowledge' | 'taken' | string;
  medicationId: string;
}

interface StartPayload {
  medicationId: string;
  medicationName: string;
  dosage: string;
  scheduledAtISO: string;
  phase: MedActivityPhase;
  /** Countdown target, epoch seconds. */
  deadlineEpoch: number;
}

interface UpdatePayload {
  medicationId: string;
  phase?: MedActivityPhase;
  acknowledged?: boolean;
  taken?: boolean;
  deadlineEpoch?: number;
}

interface NativeModule {
  isSupported(): boolean;
  setSharedConfig(serverUrl: string, authToken: string, deviceId: string): void;
  drainPendingTaken(): PendingTaken[];
  getPushToStartToken(): Promise<string | null>;
  startActivity(payload: StartPayload): Promise<string>;
  updateActivity(payload: UpdatePayload): Promise<void>;
  endActivity(medicationId: string): Promise<void>;
  listActive(): string[];
  addListener<T>(event: string, listener: (payload: T) => void): EventSubscription;
}

const native = requireOptionalNativeModule<NativeModule>('AgapaiLiveActivity');

const NOOP_SUB: EventSubscription = { remove() {} } as EventSubscription;

/** True only in a build where the native Live Activity module is present (iOS). */
export function isSupported(): boolean {
  try {
    return native?.isSupported() ?? false;
  } catch {
    return false;
  }
}

/** Hand the widget's App Intents the credentials to call the API when closed. */
export function setSharedConfig(serverUrl: string, authToken: string, deviceId: string): void {
  try {
    native?.setSharedConfig(serverUrl, authToken, deviceId);
  } catch {
    // best-effort
  }
}

/** Drain doses confirmed from a Live Activity while the app was closed. */
export function drainPendingTaken(): PendingTaken[] {
  try {
    return native?.drainPendingTaken() ?? [];
  } catch {
    return [];
  }
}

/** The ActivityKit push-to-start token (iOS 17.2+), or null. */
export async function getPushToStartToken(): Promise<string | null> {
  try {
    return (await native?.getPushToStartToken()) ?? null;
  } catch {
    return null;
  }
}

/** Start a medication Live Activity from the foreground. Returns id or null. */
export async function startActivity(payload: StartPayload): Promise<string | null> {
  try {
    return (await native?.startActivity(payload)) ?? null;
  } catch {
    return null;
  }
}

/** Update the running activity for a medication. */
export async function updateActivity(payload: UpdatePayload): Promise<void> {
  try {
    await native?.updateActivity(payload);
  } catch {
    // best-effort
  }
}

/** End the running activity for a medication. */
export async function endActivity(medicationId: string): Promise<void> {
  try {
    await native?.endActivity(medicationId);
  } catch {
    // best-effort
  }
}

/** Medication ids with a currently-running activity. */
export function listActive(): string[] {
  try {
    return native?.listActive() ?? [];
  } catch {
    return [];
  }
}

/** Subscribe to in-app Live Activity button taps. No-op when unsupported. */
export function addActionListener(cb: (action: LiveActivityAction) => void): EventSubscription {
  if (!native) return NOOP_SUB;
  return native.addListener<LiveActivityAction>('onAction', cb);
}

/** Subscribe to push-to-start token updates (register these with the server). */
export function addPushToStartTokenListener(cb: (p: { token: string }) => void): EventSubscription {
  if (!native) return NOOP_SUB;
  return native.addListener<{ token: string }>('onPushToStartToken', cb);
}

/** Subscribe to per-activity update-token updates (so the server can target it). */
export function addActivityPushTokenListener(
  cb: (p: { medicationId: string; token: string }) => void,
): EventSubscription {
  if (!native) return NOOP_SUB;
  return native.addListener<{ medicationId: string; token: string }>('onActivityPushToken', cb);
}
