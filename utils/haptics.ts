import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Centralized haptics for AgapAI.
 *
 * Two jobs:
 * 1. Semantic feedback for important interactions (a dose confirmed, a
 *    destructive action, a toggle) so the app *feels* responsive and reassuring
 *    to elderly hands that may not hear a sound.
 * 2. A distinctive "signature" pattern — {@link signatureBuzz} — played whenever
 *    an AgapAI notification arrives while the app is open, and when a medication
 *    Live Activity nudges the patient. The rhythm is deliberately unlike the
 *    system default so a patient learns to recognise "that's AgapAI" by feel.
 *
 * JS haptics only fire while the app is running. The matching *lock-screen*
 * signature (when the phone is asleep) comes from the custom notification sound
 * bundled in `assets/sounds/` and the Android reminder channel's vibration
 * pattern — see utils/notifications.ts.
 *
 * Every call here is fire-and-forget and never throws: haptics are a nicety,
 * never a correctness requirement, and are unsupported on web.
 */

/**
 * In-memory master switch, mirrored from the patient's saved NotificationPrefs
 * (`haptics`). Kept in a module variable so synchronous interaction handlers
 * (a button press) don't have to await AsyncStorage before buzzing. Defaults on;
 * {@link setHapticsEnabled} syncs it from prefs at startup and on toggle.
 */
let enabled = true;

/** Sync the master switch from the patient's saved preference. */
export function setHapticsEnabled(next: boolean): void {
  enabled = next;
}

/** Whether haptics are currently active (respects the pref and platform). */
export function hapticsEnabled(): boolean {
  return enabled && Platform.OS !== 'web';
}

function guard(): boolean {
  return hapticsEnabled();
}

/** A light tap — for a plain button press or navigation. */
export function tap(): void {
  if (!guard()) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

/** A medium thump — for a more consequential press (submit, confirm sheet). */
export function press(): void {
  if (!guard()) return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
}

/** The crisp selection tick — for pickers, chips, and segmented choices. */
export function select(): void {
  if (!guard()) return;
  void Haptics.selectionAsync().catch(() => undefined);
}

/** Success chirp — a dose marked taken, a record saved. */
export function success(): void {
  if (!guard()) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}

/** Warning buzz — a missed dose, a reversible caution. */
export function warning(): void {
  if (!guard()) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
}

/** Error buzz — a failed action the patient must notice. */
export function error(): void {
  if (!guard()) return;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
}

/** One step of a composed haptic pattern. */
interface Beat {
  /** Impact strength for this beat. */
  style: Haptics.ImpactFeedbackStyle;
  /** Delay in ms *before* this beat plays (0 for the first). */
  after: number;
}

/**
 * The AgapAI signature: two soft taps and a reassuring medium confirm —
 * "tap-tap-thrum". Distinct from the OS default so it reads as *ours*. Kept
 * short (<400ms) so it never feels like a machine.
 */
const SIGNATURE: Beat[] = [
  { style: Haptics.ImpactFeedbackStyle.Light, after: 0 },
  { style: Haptics.ImpactFeedbackStyle.Light, after: 90 },
  { style: Haptics.ImpactFeedbackStyle.Medium, after: 150 },
];

/** Timers for an in-flight pattern, so a new buzz cancels a stale one. */
let patternTimers: ReturnType<typeof setTimeout>[] = [];

function playPattern(beats: Beat[]): void {
  if (!guard()) return;
  // Cancel any pattern still mid-play so overlapping buzzes don't garble.
  patternTimers.forEach(clearTimeout);
  patternTimers = [];
  let elapsed = 0;
  for (const beat of beats) {
    elapsed += beat.after;
    const fire = () => void Haptics.impactAsync(beat.style).catch(() => undefined);
    if (elapsed === 0) fire();
    else patternTimers.push(setTimeout(fire, elapsed));
  }
}

/**
 * Play the AgapAI signature buzz. Use for an in-app notification arrival and the
 * medication Live-Activity nudge so the patient feels "that's AgapAI".
 */
export function signatureBuzz(): void {
  playPattern(SIGNATURE);
}

export const haptics = {
  setEnabled: setHapticsEnabled,
  isEnabled: hapticsEnabled,
  tap,
  press,
  select,
  success,
  warning,
  error,
  signatureBuzz,
} as const;

export default haptics;
