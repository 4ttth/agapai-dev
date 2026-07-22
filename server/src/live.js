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
const LIVE_MODEL = () => process.env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash-native-audio-preview-09-2025';
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

  console.log(`[live] Gemini Live relay ready at /ws/live (model ${LIVE_MODEL()})`);
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

async function bridge(client, auth, documentText) {
  const user = await prisma.user.findUnique({ where: { id: auth.id } }).catch(() => null);
  const persona = personaLines({
    firstName: user?.firstName,
    pronouns: user?.pronouns,
    gender: user?.gender,
  });

  const upstream = new WebSocket(LIVE_URL());
  const queue = [];
  let ready = false;

  const closeBoth = (code, reason) => {
    try {
      client.close(code, reason);
    } catch {}
    try {
      upstream.close();
    } catch {}
  };

  upstream.onopen = () => {
    upstream.send(
      JSON.stringify({
        setup: {
          model: `models/${LIVE_MODEL()}`,
          generationConfig: { responseModalities: ['AUDIO'] },
          systemInstruction: {
            parts: [{ text: VOICE_PROMPT + persona + documentLines(documentText) }],
          },
        },
      }),
    );
    ready = true;
    for (const m of queue.splice(0)) upstream.send(m);
  };

  upstream.onmessage = async (ev) => {
    if (client.readyState !== client.OPEN) return;
    // Upstream frames may be Blob (native WebSocket) or string.
    const data = typeof ev.data === 'string' ? ev.data : Buffer.from(await ev.data.arrayBuffer());
    client.send(stripThoughts(data));
  };

  upstream.onerror = () => closeBoth(1011, 'upstream error');
  upstream.onclose = (e) => closeBoth(e.code === 1000 ? 1000 : 1011, String(e.reason || 'upstream closed').slice(0, 120));

  client.on('message', (data, isBinary) => {
    const payload = isBinary ? data : data.toString();
    if (!ready) {
      if (queue.length < 200) queue.push(payload);
      return;
    }
    try {
      upstream.send(payload);
    } catch {
      closeBoth(1011, 'relay failed');
    }
  });

  client.on('close', () => {
    try {
      upstream.close();
    } catch {}
  });
  client.on('error', () => closeBoth(1011, 'client error'));
}
