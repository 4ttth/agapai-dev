import type { EventSubscription } from 'expo-modules-core';

import { appConfig } from '@/constants';
import {
  addActionListener,
  addActivityPushTokenListener,
  addPushToStartTokenListener,
  drainPendingTaken,
  getPushToStartToken,
  isSupported,
  setSharedConfig,
  type PendingTaken,
} from '@/modules/agapai-live-activity';
import { getAuthToken } from '@/services/api/http';
import { serverApi } from '@/services/api/server';

/**
 * Client orchestration for the medication Live Activity.
 *
 * The heavy lifting — starting the activity 5 minutes before a dose and pushing
 * it to the "due" state at the exact time, even when the app is closed — is done
 * by the server over APNs (see server/src/liveActivity.js). This module's job is
 * the plumbing that makes that possible and keeps the local dose log honest:
 *
 *  - hand the widget's App Intents the API credentials (App Group),
 *  - register the push-to-start and per-activity update tokens with the server,
 *  - reconcile doses the patient confirmed from a Live Activity (either relayed
 *    live via {@link addActionListener}, or queued while the app was closed and
 *    drained on launch).
 *
 * All no-ops when the native module is absent (Expo Go, Android, web).
 */

/** Called when a dose is confirmed from a Live Activity, to update local state. */
export type OnDoseTaken = (medicationId: string, scheduledAtISO: string) => void;

let subscriptions: EventSubscription[] = [];
let started = false;

/**
 * Wire up Live Activities for the signed-in patient. Idempotent; safe to call on
 * every app load. `deviceId` and the current auth token are shared with the
 * widget so its "I already took it" intent can reach the API when the app is
 * closed. Returns a teardown function.
 */
export async function initLiveActivities(
  deviceId: string,
  onDoseTaken: OnDoseTaken,
): Promise<() => void> {
  if (!isSupported()) return () => undefined;

  // Refresh the App Group config the widget's intents read (token may have
  // changed since last launch).
  setSharedConfig(appConfig.serverUrl, getAuthToken() ?? '', deviceId);

  // Reconcile anything confirmed from a Live Activity while the app was closed.
  reconcilePending(drainPendingTaken(), onDoseTaken);

  if (!started) {
    started = true;

    // Push-to-start token → server (create activities via APNs when closed).
    const initial = await getPushToStartToken();
    if (initial) void serverApi.registerLiveActivityToken(initial).catch(() => undefined);
    subscriptions.push(
      addPushToStartTokenListener(({ token }) => {
        void serverApi.registerLiveActivityToken(token).catch(() => undefined);
      }),
    );

    // Per-activity update token → server (push a specific activity to "due").
    subscriptions.push(
      addActivityPushTokenListener(({ medicationId, token }) => {
        void serverApi
          .registerLiveActivityUpdateToken(medicationId, token)
          .catch(() => undefined);
      }),
    );

    // Live relay of an in-app "I already took it" tap.
    subscriptions.push(
      addActionListener((action) => {
        if (action.action === 'taken') {
          // scheduledAt isn't carried on the relay event; the drain queue holds
          // it, so pull from there to mark the exact dose.
          reconcilePending(drainPendingTaken(), onDoseTaken);
        }
      }),
    );
  }

  return teardownLiveActivities;
}

function reconcilePending(pending: PendingTaken[], onDoseTaken: OnDoseTaken): void {
  for (const p of pending) {
    if (p.medicationId && p.scheduledAtISO) onDoseTaken(p.medicationId, p.scheduledAtISO);
  }
}

/** Remove all listeners. Called on sign-out. */
export function teardownLiveActivities(): void {
  subscriptions.forEach((s) => s.remove());
  subscriptions = [];
  started = false;
}
