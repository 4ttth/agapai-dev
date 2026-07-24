# Doctor / Pharmacist follow-ups — chat & call

A patient can follow up with their **most recent doctor** after a consultation,
either by **end-to-end encrypted chat** or by a **peer-to-peer voice call**. Both
are opt-in on the doctor's side and off by default.

This document explains the design, the 7-day retention model, and — because it
was an explicit question — **why WebRTC is the right answer to "UDP over a secure
port," and what you need to run calls in production**.

---

## Who can follow up with whom

- Eligibility is decided by the patient's **single most recent consultation**.
  Only that one doctor is reachable; older doctors and other consultations are
  never contactable (`GET /api/follow-up/eligibility`).
- The doctor turns follow-ups on per capability, from the AgapAI Pro dashboard:
  - `followUpChat` — allow chat (off by default)
  - `followUpCall` — allow calls (off by default, independent of chat)
- These flags live on the doctor's `User` row and are only settable by a
  professional account (a patient client cannot flip them).

## Where it lives in the apps

| App | Entry point |
| --- | --- |
| Patient | **More → Doctor follow-ups**, and an **"Ask a follow-up"** button on a consultation record. |
| AgapAI Pro (doctor) | A **Follow-ups** screen with **Open chats** / **Previous** tabs, plus the enable toggles on the dashboard. |

---

## End-to-end encryption (chat)

Follow-ups reuse the app's existing principle: **the server only ever stores
ciphertext it cannot read.**

1. **Device keypairs.** Every device generates a long-lived
   [NaCl](https://nacl.cr.yp.to/) `box` keypair (`tweetnacl`). The public half is
   published to the server (`User.publicKey`); the secret never leaves the device.
2. **Per-thread key.** When a patient opens a follow-up, their phone mints a
   random 256-bit **thread key** and **seals** it to the doctor's public key with
   an anonymous sealed box (ephemeral keypair + nonce). Only the doctor's device
   can unwrap it. The server stores just the opaque wrap
   (`wrappedKey`/`wrapNonce`/`wrapEphemPub`).
3. **Messages.** Each message is AES-256-CBC encrypted with the thread key
   (`SHA-256(threadKey + salt)` per message — the same scheme as consultation
   records), so neither the server nor eGov can read a follow-up.
4. **Delivery.** Messages persist over REST and fan out live over the
   `/ws/follow-up` WebSocket; a short poll is the fallback if the socket drops.

The patient keeps their copy of the thread key locally; the doctor unwraps and
caches theirs. (A patient who reinstalls loses local thread keys — the thread is
short-lived by design, so they simply start a new one.)

## The 7-day share ("to lessen server resources")

When starting a follow-up the patient can attach, **for the doctor only**:

- **This consultation** — its transcript, prescriptions, and the doctor's voice
  note, decrypted on the patient's phone and re-encrypted to the thread key.
- **AI assistant history** — their recent on-device assistant chats.

Everything about a follow-up — messages, shares, and the wrapped key — is capped
at **7 days**. `FollowUpThread.expiresAt` is set to `createdAt + 7d`, and an
hourly cron (`purgeExpiredFollowUps`) deletes expired threads, cascading to their
messages and shares. A follow-up therefore never costs more than a week of
storage; the patient re-shares if they need longer.

---

## Calls: WebRTC is "UDP over a secure port"

The ask was a faster, UDP-based, secure call path. **WebRTC delivers exactly
that without hand-rolling raw UDP**, which is why it's the design here:

- **Media is UDP.** WebRTC negotiates the media path with ICE and sends audio
  over **UDP** (falling back to TCP/TLS only when a network forces it). You get
  the low-latency UDP transport you wanted.
- **It's encrypted by default.** Media is **DTLS-SRTP** end-to-end between the
  two phones — the "secure port" property, for free. A bespoke UDP socket would
  be *less* secure, not more.
- **It saves server resources.** Media flows **peer-to-peer**; our server never
  sees the audio. It only relays the tiny JSON **signaling** (offer/answer/ICE)
  over `/ws/follow-up`. That aligns with the same "lessen server load" goal as
  the 7-day retention.
- **We don't reinvent the hard parts.** NAT traversal, jitter buffers,
  packet-loss concealment, and media encryption are all solved by WebRTC. Raw
  UDP would mean re-implementing (and mis-implementing) every one of them.

### What runs today

- **Server** — signaling + call control are relayed at `/ws/follow-up`
  (`server/src/followup.js`). ICE servers are served by
  `GET /api/follow-up/ice`.
- **Clients** — `useWebRtcCall` (both apps) does the full offer/answer/ICE
  exchange and a mute/hang-up call UI, gated behind `followUpCall`.

### What you must provision for calls

1. **A custom dev build.** `react-native-webrtc` is a native module, so calls do
   **not** run in Expo Go. Build a dev client (the `@config-plugins/react-native-webrtc`
   config plugin is already wired into both `app.json` files):

   ```bash
   npx expo run:android      # or run:ios, or an EAS dev build
   ```

2. **STUN (free) + TURN (recommended).** Set these on the server:

   ```env
   STUN_URLS=stun:stun.l.google.com:19302
   TURN_URL=turn:your-coturn-host:3478
   TURN_USERNAME=agapai
   TURN_PASSWORD=change-me
   ```

   STUN alone connects most networks. For the ~10–20% behind symmetric NATs or
   UDP-blocking firewalls, run a **TURN** relay (self-host
   [`coturn`](https://github.com/coturn/coturn), or use a provider such as
   Metered/Twilio). Only TURN-relayed calls route media through a server, and it
   stays DTLS-SRTP encrypted end-to-end even then.

3. **Signaling is already secure** — put the server behind TLS so the WebSocket
   is `wss://` in production.

### Call flow (signaling)

```
patient (initiator)                server (/ws/follow-up)                doctor
  join ───────────────────────────────► room ◄─────────────────────────── join
  call-invite ─────────────────────────────────────────────────────────►  (ring)
                                                             ◄──────── call-accept
  offer (SDP) ─────────────────────────────────────────────────────────►
                                                             ◄──────────── answer
  ICE candidates ◄───────────────── relayed both ways ─────────────────► ICE
  = = = = = = = = =  media: peer-to-peer UDP, DTLS-SRTP  = = = = = = = = = = = =
```

### Future hardening (not built yet)

- **Background incoming calls** need push notifications (CallKit / Connection
  service). Today a call connects when both parties are on the call screen.
- Optional call **audit metadata** (start/end timestamps) if a compliance trail
  is required — kept minimal to preserve the privacy posture.
