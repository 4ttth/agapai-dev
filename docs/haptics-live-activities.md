# Custom haptics & the medication Live Activity (iOS)

Two iOS-focused features that make AgapAI *feel* like AgapAI and make a dose hard
to miss:

1. **Customized vibrations / haptics** — semantic feedback on important
   interactions and a distinctive "signature" buzz + sound so a patient learns to
   recognise an AgapAI notification by feel, even without looking.
2. **Dynamic Island / Live Activities** — a medication pop-up **5 minutes before**
   a dose (with an **"Okay"** button) and again **at the exact dose time** (with an
   **"I already took it"** button that logs the dose in the app).

Haptics work everywhere (including Expo Go). The Live Activity is native iOS and
needs a **custom dev/production build** — it does **not** run in Expo Go.

---

## 1. Haptics & the signature buzz

### What fires, and where

| Moment | Feedback | Where |
| --- | --- | --- |
| Any `Button` press | Medium impact (variant-aware: success → success, danger → error) | `components/ui/Button.tsx` |
| Dose marked **taken** | Success notification haptic | `features/pill-tracker/useMedications.ts` (`markTaken`) |
| A notification arrives **while the app is open** | The **signature** "tap-tap-thrum" | `app/_layout.tsx` (`useNotificationHaptics`) |
| Toggling **haptics on** in settings | The signature buzz (so you feel what it is) | `app/notifications.tsx` |

The engine is `utils/haptics.ts`. It exposes semantic helpers (`tap`, `press`,
`select`, `success`, `warning`, `error`) and `signatureBuzz()`. Every call is
fire-and-forget, a no-op on web, and gated by the patient's preference.

### The signature

`signatureBuzz()` plays **two light taps and a medium confirm** (`SIGNATURE` in
`utils/haptics.ts`) — deliberately unlike the OS default. The Android reminder
channel uses a **matching vibration pattern** (`SIGNATURE_VIBRATION` in
`utils/notifications.ts`) so the buzz feels the same on a locked phone.

### Preference

A new `haptics` field on `NotificationPrefs` (default **on**) drives an in-memory
switch in the engine. It is synced at startup (`MedicationProvider`) and toggled
from **Settings → Notifications → Vibration & haptics**.

---

## 2. The signature notification sound (locked phone)

JS haptics only fire while the app runs. To make a delivered notification feel
like AgapAI on a **locked** phone, a custom sound is bundled:

- **Asset:** `assets/sounds/agapai.wav` — a warm three-note chime (regenerate it
  with `python3 assets/sounds/make_chime.py` if you want a different motif).
- **Config:** the `expo-notifications` plugin `sounds` array in `app.json`.
- **iOS:** the sound is set per-notification (`sound: 'agapai.wav'`).
- **Android:** the sound + signature vibration live on the `agapai-reminders`
  notification channel (Android O+ ignores per-notification sound/vibration once a
  channel exists), created by `ensureNotificationChannels()`.

Both medication and mood reminders use it.

---

## 3. The medication Live Activity

### The flow (as specified)

```
T‑5 min ── "pre" activity (push‑to‑start)
           ┌───────────────────────────────────────────────┐
           │ 💊 Medication in 5 minutes — 4:59 ⏳           │
           │ Get ready to take 500mg Amoxicillin   [ Okay ] │
           └───────────────────────────────────────────────┘
   tap Okay → "Okay, I'll be waiting here in 5 minutes to check on you."

T‑0 (exact dose time) ── "due" activity (push‑to‑start)
           ┌────────────────────────────────────────────────────────┐
           │ ⏰ Time to take Amoxicillin — 5:00 ⏳                    │
           │ You have 5 minutes to confirm   [ I already took it ]   │
           └────────────────────────────────────────────────────────┘
   tap "I already took it" → posts to the API, marks the dose taken
                              in the app, shows ✅, then dismisses.
```

Both pop-ups are **push-to-start** activities, so they appear **even when the app
is fully closed**. (A single activity *updated* from "pre" to "due" would need a
per-activity update token that only a *running* app can report — using two
push-to-start activities sidesteps that and makes the exact-time pop-up reliable.)

### Architecture

| Piece | Path | Role |
| --- | --- | --- |
| Widget extension | `targets/agapai-widget/` | SwiftUI lock-screen + Dynamic Island UI, and the two **App Intents** (`AcknowledgeMedIntent`, `MarkTakenMedIntent`). Added to Xcode by `@bacons/apple-targets`. |
| Control bridge | `modules/agapai-live-activity/` | Local Expo module: start/update/end, push-to-start + update tokens, App Group config sharing, pending-taken queue. Import-safe TS API. |
| Config plugin | `plugins/withAgapaiLiveActivity.js` | `NSSupportsLiveActivities`, the `aps-environment` push entitlement, and the shared App Group on the **main** target. |
| JS orchestration | `utils/liveActivities.ts` | Shares auth config with the widget, registers APNs tokens, reconciles confirmed doses. Wired in `MedicationProvider`. |
| Server push | `server/src/liveActivity.js` + `server/src/cron.js` | APNs client + minute-accurate sweep that starts the "pre" and "due" pop-ups. |
| API | `server/src/routes.js` | `/live-activity/token`, `/live-activity/activity-token`, `/live-activity/taken`. |

The shared shape `AgapAIMedAttributes` is compiled into **both** the app module
and the widget (two identical copies) — **keep them in sync**. The countdown is
an **epoch number** (`deadlineEpoch`), not a Swift `Date`, so it encodes cleanly
over APNs.

### "I already took it" while the app is closed

The `MarkTakenMedIntent` runs in the widget extension and:
1. reads the API base URL + bearer token + deviceId from the **App Group**
   (`group.com.4ttth.agapaihealth`, written by the app via `setSharedConfig`),
2. `POST`s to `/api/live-activity/taken`,
3. queues the dose in the App Group so the app reconciles its **local dose log**
   on next launch (`drainPendingTaken` → `recordDoseTaken` in `MedicationProvider`),
4. flips the activity to ✅ and dismisses it.

---

## Build & release checklist

Live Activities require real native config. None of this runs in Expo Go, and the
Swift/Xcode steps were **not** compiled in the CI environment this was authored
in — build them in a dev client.

### Prerequisites
- **Apple Developer Program** membership ($99/yr).
- iOS **16.2+** for the Live Activity; **17.0+** for the interactive buttons;
  **17.2+** for server push-to-start.

### Steps
1. **Install deps** (already in `package.json`): `expo-haptics`,
   `@bacons/apple-targets` (dev).
2. **Prebuild** to generate the native project + widget target:
   ```bash
   npx expo prebuild -p ios --clean
   ```
   This runs `@bacons/apple-targets` (adds `targets/agapai-widget` as a Widget
   Extension) and `withAgapaiLiveActivity` (Info.plist + entitlements + App Group).
3. **Apple Developer portal**
   - Enable **Push Notifications** on the app **and** widget App IDs.
   - Create an **App Group** `group.com.4ttth.agapaihealth` and add it to both.
   - Create an **APNs Auth Key** (`.p8`) — note the **Key ID** and your **Team ID**.
4. **Server env** (`server/.env`):
   ```bash
   APNS_ENABLED=true
   APNS_KEY="-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----"   # or APNS_KEY_PATH
   APNS_KEY_ID=XXXXXXXXXX
   APNS_TEAM_ID=YYYYYYYYYY
   APNS_BUNDLE_ID=com.4ttth.agapaihealth
   APNS_PRODUCTION=false   # false = sandbox (dev builds); true = TestFlight/App Store
   ```
   Then apply the schema: `cd server && npx prisma db push`.
5. **Build a dev client** and run on a device (Live Activities don't show in the
   simulator's Dynamic Island reliably):
   ```bash
   eas build --profile development --platform ios
   ```
6. In **Xcode**, confirm the `AgapAIWidget` target is signed and has the App Group
   capability (Signing & Capabilities).

### Verifying
- Add a medication with a dose time ~6 minutes out. With `APNS_ENABLED=true` and a
  valid push-to-start token registered, the "pre" pop-up should appear at T‑5 and
  the "due" pop-up at T‑0.
- Tapping **I already took it** should mark the dose taken in the app (immediately
  if open; on next launch if it was closed).

---

## Notes & limitations

- **Timezone.** The server schedules doses in **Asia/Manila** (fixed UTC+8) and
  echoes the dose time as UTC ISO; the app rebuilds the local dose id from it.
  This assumes the phone is in Manila time (consistent with the SMS cron).
- **Update tokens** are best-effort. Ending a stale activity early needs the
  per-activity token, which only a *running* app can report; otherwise the
  activity retires on its own via its stale-date.
- **Auth token freshness.** `setSharedConfig` runs when `MedicationProvider`
  mounts. If you rotate the auth token mid-session, call it again so the widget's
  intent keeps a valid bearer.
- **Android** gets the signature sound + vibration channel; Live Activities are
  iOS-only.
