# AgapAI Health

A mobile healthcare app that simplifies healthcare access for Filipinos —
designed for **elderly users** and caregivers, and built to feel like a natural
extension of the **eGovPH SuperApp**. React Native + Expo + TypeScript.

> **Phase 1 scope:** complete app architecture + one deep, end-to-end feature
> (the **Visual Pill Tracker**), plus a mocked eGovPH SSO login and a QR
> **Health ID** share/scan flow. The four remaining modules (e-Document Scanner,
> full Universal Health Profile editing, Smart Consultation Logs, AI Voice
> Assistant) are scaffolded to follow the same proven pattern.

---

## Getting started

```bash
npm install
npx expo start
```

Then open the project in **Expo Go** (scan the QR) or an Android/iOS simulator.

> This repo uses `.npmrc` with `legacy-peer-deps=true` because Expo Router's web
> dependencies declare a stricter React peer than the pinned React version.
> Installs go through `npx expo install` to keep native module versions aligned
> with the Expo SDK.

### Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Start the Expo dev server |
| `npm run android` / `ios` / `web` | Start on a specific platform |
| `npm test` | Run the Jest unit + component suite |
| `npm run typecheck` | `tsc --noEmit` (strict mode) |

---

## Architecture

```
app/          Expo Router routes (thin screens only)
components/    Reusable UI — ui/ (design system), states/, qr/
features/     Feature modules: pill-tracker/, health-profile/
              (each owns its components, hooks, and domain logic)
hooks/        Cross-cutting hooks (useAuth, useSpeech)
providers/    App-wide React Context providers
services/     Data layer — api/ (interfaces) + mock/ (implementations)
types/        Shared TypeScript types
utils/        Pure helpers (datetime, validation, notifications, storage)
constants/    Config + storage keys
theme/        Design tokens (colors, spacing, radii, typography)
```

**Separation of concerns:** screens render; feature hooks hold state; services
own data; `utils` are pure and unit-tested. UI never imports a concrete service
— only the `services` registry, so implementations can be swapped freely.

### Design system

- **Typography** — Lexend for titles/headings, Inter for body/labels/buttons,
  routed through `components/ui/AppText` (`variant` prop). Font scaling stays on
  so OS text-size settings are respected.
- **Color** — calm, government-grade palette with documented **WCAG AA** contrast
  (`theme/colors.ts`). No neon, no gradients.
- **Touch targets** — 48pt minimum; primary buttons are 56pt.
- Every screen renders **Loading / Empty / Error / Content** states, and every
  interactive element has an accessibility label/role/hint.

---

## eGovPH integration (mocked)

Government integration is mocked behind clean interfaces so the UX looks real
today and swaps to live APIs later with **no UI changes**:

- **SSO / Digital ID** — `services/mock/authService.ts` returns an
  `EgovSession`; the login screen calls `signIn()`.
- **QR Health ID** — the profile screen renders a QR encoding a
  `HealthSharePayload`; `app/scan.tsx` represents the clinic-side scan.

---

## Replacing a mock with a real API

1. Implement the interface in `services/api/types.ts` (e.g. `MedicationService`)
   against the real endpoint — put it in `services/api/`.
2. Swap the one line in `services/index.ts`:

   ```ts
   // Before
   import { medicationService } from './mock/medicationService';
   // After
   import { medicationService } from './api/medicationService';
   ```

3. Done. Screens, hooks, and components are untouched because they depend only
   on the `services` registry and the shared types.

Mock behavior is tunable in `constants/config.ts`:
`mockLatencyMs` (loading realism) and `simulateServiceError` (exercise error
states during QA).

---

## Testing

`npm test` runs Jest (`jest-expo` preset) with `@testing-library/react-native`.

- **Unit** — pill-tracker domain logic (`logic.test.ts`), form validation, and
  datetime helpers. These are pure functions and cover the core behavior:
  dose materialization, taken/missed derivation, next-dose selection.
- **Service** — `medicationService.test.ts` verifies seeding, add/remove, and
  idempotent dose-log upserts against the AsyncStorage mock.
- **Component** — `Button` and `DoseRow` cover rendering, interaction, and
  disabled/loading states.

### Recommended additions as the app grows

- **Integration** — render a screen inside `AppProviders` and drive the
  add-medication → reminder → “I Took This” flow.
- **Accessibility** — assert labels/roles on new components; manually verify
  with VoiceOver/TalkBack and at 200% OS font scale.
- **Edge cases** — timezone boundaries for schedules, empty/large medication
  lists, denied camera/notification permissions.

---

## Manual verification checklist

1. Launch → **eGovPH SSO** login → Home.
2. **Add a medicine** → it appears on Home; a local reminder is scheduled.
3. Tap **“I Took This”** → dose logs as taken and **persists across app restart**.
4. Open a medicine → **Read aloud** speaks the dose and instructions.
5. **Health ID** tab → show the QR; open **Scan a Health ID** → scan it back to a
   profile summary.
6. Set `simulateServiceError: true` in `constants/config.ts` → confirm error
   states render.

---

## Not included in Phase 1

Backend/auth servers, databases, and real government API wiring. e-Document
Scanner (AI extraction), full health-profile editing, consultation timeline, and
the conversational AI Voice Assistant are planned for later phases and follow the
same `features/` + `services/` pattern established here.
