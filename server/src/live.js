import { WebSocketServer } from 'ws';

import { prisma } from './db.js';
import { documentLines, personaLines } from './gemini.js';
import { verifyToken } from './token.js';

/**
 * Gemini Live relay for the voice assistant.
 *
 * The app never holds the Gemini key: it opens a WebSocket to this server,
 * which authenticates the bearer token, loads the patient's persona (name and
 * the pronouns they chose at registration), and opens the upstream Live socket
 * with that baked into the system instruction. Audio frames are then relayed
 * verbatim in both directions.
 *
 * Only the native-audio model answers bidiGenerateContent on our key — the
 * *-live-* ids 404 — so it is the default.
 */
const DEFAULT_LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-09-2025';

/**
 * Native-audio Live models to try, in order. The primary (env override or the
 * current default) is always attempted first; the rest are best-effort
 * fallbacks so a rotated or retired preview id degrades to a working model
 * instead of a dead "Couldn't start voice". Only the native-audio ids answer
 * bidiGenerateContent on our key — the plain *-live-* ids 404 — so the list is
 * kept to native-audio variants.
 */
function liveModels() {
  const primary = process.env.GEMINI_LIVE_MODEL || DEFAULT_LIVE_MODEL;
  return Array.from(
    new Set([
      primary,
      'gemini-2.5-flash-native-audio-preview-09-2025',
      'gemini-2.5-flash-preview-native-audio-dialog',
    ]),
  );
}

const LIVE_URL = () =>
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=' +
  (process.env.GEMINI_API_KEY || '');

const VOICE_PROMPT = `You are AgapAI, a warm Filipino home-health assistant speaking out loud with an elderly Filipino patient.
Rules:
- You are in a VOICE conversation: keep turns short (2-4 sentences), plain, and easy to follow by ear. No lists, no markdown, no emoji.
- Give safe home guidance for minor symptoms (fever, cough, colds, headache, nausea, LBM), hydration and rest, and OTC medicine per label directions.
- Mention the red flags that mean they should see a doctor or go to the health center.
- Never diagnose, never prescribe prescription drugs, never change the dose of medicine they already take.
- For emergencies (chest pain, stroke signs, trouble breathing, severe bleeding), tell them to call 911 or go to the ER right away.
- Speak the language they speak (English, Tagalog, or Taglish). Use simple words and a calm, respectful tone.
- Remind them once, briefly, that this is general guidance and not a diagnosis.`;

export function attachLiveRelay(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return socket.destroy();
    }
    if (url.pathname !== '/ws/live') return; // leave other upgrades alone
    const auth = verifyToken(url.searchParams.get('token'));
    if (!auth) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }
    if (!process.env.GEMINI_API_KEY) {
      socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => bridge(ws, auth, url.searchParams.get('documentText') || ''));
  });

  console.log(`[live] Gemini Live relay ready at /ws/live (models: ${liveModels().join(', ')})`);
  return wss;
}

/**
 * Drop the model's private reasoning before it reaches the phone.
 *
 * The session is audio-only, so any `text` part coming back is thinking, not
 * the spoken reply — and that reasoning has been observed misgendering a
 * they/them patient regardless of how firmly the system prompt states their
 * pronouns. Surfacing it would show the patient a misgendered transcript, so
 * text and explicitly-flagged thought parts are stripped; audio passes through
 * untouched. Non-JSON or unexpected frames are forwarded verbatim.
 */
function stripThoughts(data) {
  const raw = typeof data === 'string' ? data : data.toString('utf8');
  let msg;
  try {
    msg = JSON.parse(raw);
  } catch {
    return data;
  }
  const parts = msg?.serverContent?.modelTurn?.parts;
  if (!Array.isArray(parts)) return data;
  const kept = parts.filter((p) => p?.thought !== true && typeof p?.text !== 'string');
  if (kept.length === parts.length) return data;
  msg.serverContent.modelTurn.parts = kept;
  return JSON.stringify(msg);
}

/** Build the Gemini Live setup frame for a given model + patient persona. */
function setupMessage(model, persona, documentText) {
  return JSON.stringify({
    setup: {
      model: `models/${model}`,
      generationConfig: { responseModalities: ['AUDIO'] },
      systemInstruction: {
        parts: [{ text: VOICE_PROMPT + persona + documentLines(documentText) }],
      },
      // Voice-activity detection: BALANCED sensitivity allows ordinary speech
      // to be recognized promptly while letting natural pauses end the turn
      // cleanly (around 500ms), eliminating the 30s delay.
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          startOfSpeechSensitivity: 'START_SENSITIVITY_BALANCED',
          endOfSpeechSensitivity: 'END_SENSITIVITY_BALANCED',
          prefixPaddingMs: 300,
          silenceDurationMs: 500,
        },
      },
      // Live transcription of both sides, so the phone can keep a local text
      // transcript of the voice conversation.
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    },
  });
}

async function bridge(client, auth, documentText) {
  const user = await prisma.user.findUnique({ where: { id: auth.id } }).catch(() => null);
  const persona = personaLines({
    firstName: user?.firstName,
    pronouns: user?.pronouns,
    gender: user?.gender,
  });

  const models = liveModels();
  const clientQueue = [];
  let ready = false; // a model has reached setupComplete
  let active = null; // the upstream socket carrying the live call
  let clientClosed = false;
  let lastReason = '';

  const safeClientSend = (s) => {
    try {
      if (client.readyState === client.OPEN) client.send(s);
    } catch {}
  };

  // Try each candidate model in turn. Only one upstream is ever open at a time:
  // a failed attempt fully closes before the next opens, and once a model
  // reaches setupComplete we stop advancing and relay verbatim.
  function attempt(i) {
    if (clientClosed) return;
    if (i >= models.length) {
      console.error(`[live] all Live models failed (last: ${lastReason || 'unknown'})`);
      // Tell the phone WHY before closing, so it can show a real reason instead
      // of a blank "Couldn't start voice" that reads as the assistant ignoring
      // the patient. A missing Live-API entitlement on the key is the usual
      // cause even when text chat (REST) works.
      safeClientSend(
        JSON.stringify({
          error: 'voice-unavailable',
          detail: lastReason || 'The voice model is unavailable on this server.',
        }),
      );
      try {
        client.close(1011, 'live upstream unavailable');
      } catch {}
      return;
    }

    const model = models[i];
    const upstream = new WebSocket(LIVE_URL());
    let settled = false; // did THIS upstream reach setupComplete?

    upstream.onopen = () => {
      try {
        upstream.send(setupMessage(model, persona, documentText));
      } catch {
        // onerror/onclose will advance to the next model.
      }
    };

    upstream.onmessage = async (ev) => {
      // Upstream frames may be Blob (native WebSocket) or string.
      const data = typeof ev.data === 'string' ? ev.data : Buffer.from(await ev.data.arrayBuffer());
      if (!settled) {
        let m;
        try {
          m = JSON.parse(typeof data === 'string' ? data : data.toString('utf8'));
        } catch {
          m = null;
        }
        if (m?.setupComplete) {
          settled = true;
          ready = true;
          active = upstream;
          if (i > 0) console.log(`[live] using fallback Live model ${model}`);
          for (const q of clientQueue.splice(0)) {
            try {
              upstream.send(q);
            } catch {}
          }
        } else if (m?.error) {
          // Gemini rejected setup (bad model, no Live access, quota). Record the
          // reason and let onclose move to the next candidate — don't relay the
          // raw error frame to the phone.
          lastReason = `model ${model}: ${(m.error && (m.error.message || m.error.status)) || 'setup rejected'}`;
          return;
        }
      }
      if (active !== upstream || client.readyState !== client.OPEN) return;
      // Every Gemini Live frame (setupComplete, audio inlineData, turnComplete)
      // is JSON text. The phone's WebSocket handler only parses STRING frames,
      // so we must forward a string — a Buffer becomes a binary frame the client
      // silently drops, which left it stuck on "Connecting…" forever.
      const out = stripThoughts(data);
      client.send(typeof out === 'string' ? out : out.toString('utf8'));
    };

    upstream.onerror = () => {
      if (settled) {
        try {
          client.close(1011, 'upstream error');
        } catch {}
        try {
          upstream.close();
        } catch {}
        return;
      }
      if (!lastReason) lastReason = `model ${model}: upstream error`;
      try {
        upstream.close(); // onclose advances to the next model
      } catch {}
    };

    upstream.onclose = (e) => {
      if (settled) {
        // Normal end of a live call — mirror the close to the phone.
        try {
          client.close(
            e.code === 1000 ? 1000 : 1011,
            String(e.reason || 'upstream closed').slice(0, 120),
          );
        } catch {}
        return;
      }
      if (!lastReason) {
        lastReason = `model ${model}: closed ${e.code}${e.reason ? ` (${String(e.reason).slice(0, 120)})` : ''}`;
      }
      console.warn(`[live] ${lastReason} — trying next model`);
      attempt(i + 1);
    };
  }

  client.on('message', (data, isBinary) => {
    const payload = isBinary ? data : data.toString();
    if (!ready || !active) {
      if (clientQueue.length < 200) clientQueue.push(payload);
      return;
    }
    try {
      active.send(payload);
    } catch {
      try {
        client.close(1011, 'relay failed');
      } catch {}
      try {
        active.close();
      } catch {}
    }
  });

  client.on('close', () => {
    clientClosed = true;
    try {
      active?.close();
    } catch {}
  });
  client.on('error', () => {
    clientClosed = true;
    try {
      active?.close();
    } catch {}
  });

  attempt(0);
}
