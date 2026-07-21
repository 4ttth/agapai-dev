# AgapAI Health

Healthcare access for every Filipino, built on **eGovPH**. React Native + Expo +
TypeScript, with a Node.js/Postgres backend that proxies the live eGov APIs.

**The ecosystem (this repo):**

| Piece | Where | What it does |
| --- | --- | --- |
| **Patient app** | repo root | eGov SSO sign-in, one-time Health ID registration, medication tracker + SMS reminders, end-to-end-encrypted consultation records, offline document scanner, mood calendar, AI health assistant (voice replies) |
| **AgapAI Pro** | `pro-app/` | Doctors: scan Health ID → upload client-side-encrypted consultations (text/voice notes, typed or scanned prescriptions). Pharmacists: scan Health ID → decrypt latest prescription → dispense checklist that syncs to the patient |
| **Server** | `server/` | Express + Prisma/Postgres. Proxies eGov SSO / eVerify / eMessage / eGov AI (secrets never ship in apps), stores encrypted records, runs the SMS reminder cron, serves the admin console |
| **Admin console** | `http://<server>:4000/admin` | Service health (live pings of all 4 eGov APIs + DB), usage metrics, manual PRC license verification of doctors/pharmacists, user registry |

## The encryption story (why judges should care)

1. At registration the **patient's device** generates a random 256-bit key. It
   lives only on the phone and inside the **Health ID QR**.
2. A doctor scans the QR, writes the consultation, and taps *Finalize* — the
   record is **AES-256 encrypted on the doctor's device** with a key derived
   from the patient's key + a random salt.
3. The server stores **only ciphertext**. Doctor (after upload), server, and
   eGov can never read it again.
4. The patient's app decrypts locally. A pharmacist decrypts only when the
   patient physically presents their QR. **The patient owns the data.**

## eGov integrations (live, via the server)

- **eGov SSO** — sign-in identity + registry check (demo mode mirrors the same
  response shape; live exchange endpoint is wired at `POST /api/auth/sso/exchange`).
- **eVerify** — National ID QR check gates editing of personal information.
- **eMessage** — cron texts each patient 1 hour before their first dose: first
  two medicines of the day + "open AgapAI for the rest".
- **AI assistant** — **Gemini** (`GEMINI_API_KEY`) is the primary engine with a
  safety-framed health prompt; if unset or failing, a curated AgapAI home-remedy
  engine answers symptom questions and **eGov AI** answers government/general
  questions (it declines medical topics). Questions about *your* meds and
  consultations are answered **on-device only**.

## Run it

```bash
# server (needs Postgres; see server/.env.example)
cd server && npm install && npx prisma db push && npm start

# patient app
npm install && npx expo start --port 8085

# pro app
cd pro-app && npm install && npx expo start --port 8082
```

Open in **Expo Go**. Apps auto-discover the server on the Expo dev machine at
port 4000, or set `EXPO_PUBLIC_API_URL=http://<vps>:4000`. Full VPS deployment:
see [DEPLOY.md](DEPLOY.md).

`npm test` (32 tests) and `npm run typecheck` pass in the patient app;
`npm run typecheck` passes in `pro-app/`.

## Demo walkthrough

1. **Patient phone:** sign in with eGovPH (any demo identity) → complete the
   Health ID registration (blood type, allergies, conditions, emergency
   contact, consent) → land on the redesigned Home (mood calendar, meds due,
   center quick-action button).
2. **Doctor phone (Pro app):** sign in → register as Doctor → *pending*.
3. **Admin:** `http://<server>:4000/admin` → verify the doctor with a PRC No.
   (cross-check at verification.prc.gov.ph).
4. **Doctor:** scan the patient's Health ID QR → allergies pop up → write
   notes or record a voice note → type prescriptions (or scan paper, flagged
   as not recommended) → **Finalize & upload encrypted**.
5. **Patient:** Records → consultation decrypts on-device → *Add all to My
   Medicines* → reminders scheduled, schedule synced for SMS.
6. **Pharmacist (Pro app):** register → admin verifies → scan the same QR →
   latest prescription decrypts → dispense 30× Losartan → it appears in the
   patient's Home under "From the pharmacy".
7. **Assistant:** "Nahihilo ako at naduduwal" → spoken home-remedy guidance;
   "What are my medications today?" → answered from the phone only.

## Architecture notes

- `services/` registry pattern: screens depend on interfaces; the medication
  service is **local-first** (AsyncStorage, works offline) with background sync
  to the server for the SMS cron and pharmacist dispensing.
- Design system: Lexend/Inter, WCAG-AA palette, 48pt+ touch targets, animated
  (spring) entrances, gradient heroes, center FAB quick actions — modern but
  elderly-first.
- Scanned documents are resized + recompressed and stored **offline only**.
