# AgapAI — VPS Deployment (hackathon)

One VPS runs everything: Postgres + API server + admin console. The two Expo
apps run via Expo Go and point at the VPS.

## 1. Prereqs on the VPS (Ubuntu)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo ufw allow 22/tcp && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 4000/tcp && sudo ufw --force enable
```

## 2. Get the code + secrets

```bash
git clone <YOUR_REPO_URL> agapai && cd agapai/server
cp .env.example .env
nano .env   # paste the eGov credentials (Appendix A of egovdocumentation.md),
            # set ADMIN_KEY + TOKEN_SECRET to strong random strings,
            # paste GEMINI_API_KEY (free at https://aistudio.google.com/apikey)
            #   — the AI assistant uses Gemini first and falls back to the
            #   curated health engine + eGov AI if the key is missing.
            # DATABASE_URL is ignored by compose (it wires the db container itself).
```

Optionally set `DB_PASSWORD` in `.env` (defaults to `agapai`).

## 3. Launch

```bash
sudo docker compose up -d --build
```

That starts `db` (Postgres 16, persistent volume) and `api` (Node 22, runs
`prisma db push` then serves on **:4000**, SMS cron included).

Check:

```bash
curl http://localhost:4000/api/health
```

- Admin console: `http://<VPS_IP>:4000/admin` → enter your `ADMIN_KEY`.
- Logs: `sudo docker compose logs -f api`

## 4. Point the mobile apps at the VPS

On the dev machine, start each app with the env override:

```bash
# patient app (repo root)
EXPO_PUBLIC_API_URL=http://<VPS_IP>:4000 npx expo start --port 8085
```

```bash
# pro app
cd pro-app && EXPO_PUBLIC_API_URL=http://<VPS_IP>:4000 npx expo start --port 8082
```

(PowerShell: `$env:EXPO_PUBLIC_API_URL='http://<VPS_IP>:4000'; npx expo start --port 8085`)

Without the override, both apps default to `http://<expo-dev-machine>:4000`
(local development against the local server).

## 5. Standalone builds (APK / unsigned IPA)

GitHub Actions → run **"Build Android APKs (Patient + Pro)"** or **"Build
Unsigned iOS Apps (Patient + Pro)"** (both are manual `workflow_dispatch`).

- Set the repo **variable** `AGAPAI_API_URL` (Settings → Secrets and variables →
  Actions → Variables) to `http://<VPS_IP>:4000`, or type it into the run
  prompt — it is baked into the JS bundle, since standalone apps can't
  auto-discover a dev server.
- Artifacts: `AgapAI-Patient-android` / `AgapAI-Pro-android` (`.apk`,
  debug-keystore-signed → installs directly with "unknown sources" enabled) and
  `AgapAI-Patient-ios` / `AgapAI-Pro-ios` (`-unsigned.ipa`).
- **iOS caveat:** unsigned IPAs cannot be installed on a stock iPhone as-is —
  sideload them with Sideloadly/AltStore (free Apple ID re-signing) or
  TrollStore. For judging, Expo Go or the Android APK is the frictionless path.

## 6. After the demo

- Close 5432 if you exposed it: `sudo ufw delete allow 5432/tcp`
- Rotate the eGov credentials if the repo was ever public.
- For HTTPS later: put Caddy in front (`caddy reverse-proxy --from your.domain --to :4000`).
