# AgapAI Admin Console (Next.js + shadcn-ui)

A professional, self-refreshing operations dashboard for the AgapAI server. It
replaces the single-file `server/public/admin.html` with a real
[shadcn-ui](https://ui.shadcn.com) app: charts, live (AJAX-polled) data, a
paginated/searchable users table, and admin actions.

## Features

- **Charted dashboard** — stat cards, API traffic (24h area chart), user-role
  donut, and a 14-day sign-up bar chart (Recharts).
- **Live updates** — SWR polls every 15s; no manual refresh (the "AJAX" ask).
- **eGov service health** — SSO, eVerify, eMessage, eGov AI, Face Liveness, DB.
- **Professional verification** — record the PRC license to approve.
- **Users table** — server-side pagination, search, and role filter.
- **Admin actions** — **delete** and **edit role**, restricted to registered
  **doctors/pharmacists** only (the server enforces this too).

## Requirements on the server

These endpoints were added to the AgapAI server for this console:

- `GET /api/admin/overview` (now returns `charts`)
- `GET /api/admin/users?page&pageSize&q&role` (paginated)
- `DELETE /api/admin/users/:id` (professionals only)
- `PATCH /api/admin/users/:id/role` (professionals only)

## Local dev

```bash
cd admin-web
cp .env.example .env.local     # set NEXT_PUBLIC_API_URL to your API server
npm install
npm run dev                    # http://localhost:3001
```

Sign in with the same `ADMIN_KEY` configured on the server. The key is stored in
the browser's localStorage and sent as the `x-admin-key` header.

> CORS: the API server already sends `cors()` with a permissive origin, so the
> browser console can call it cross-origin.

## Production

```bash
npm run build && npm run start   # serves on :3001
```

Deploy anywhere that runs Node (or a static/edge host like Vercel). Point
`NEXT_PUBLIC_API_URL` at your VPS, e.g. `http://<VPS_IP>:4000`. If you serve the
console over HTTPS, terminate TLS in front of the API too (or the browser will
block mixed content).
