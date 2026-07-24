import { WebSocketServer } from 'ws';

import { bus } from './bus.js';
import { prisma } from './db.js';
import { verifyToken } from './token.js';

/**
 * Follow-up realtime relay (`/ws/follow-up`).
 *
 * This socket carries two things for a doctor ⇄ patient follow-up thread, and
 * NEVER any plaintext the server could read:
 *
 *  1. Live chat delivery. Messages are persisted over REST (end-to-end
 *     encrypted); on success `routes.js` emits `followup:message` on the bus and
 *     we push the ciphertext row to the other participant so it lands instantly.
 *  2. WebRTC call signaling. Offer/answer/ICE candidates and call-control frames
 *     are relayed verbatim between the two participants. The media itself never
 *     touches the server — it flows peer-to-peer over UDP (DTLS-SRTP); only the
 *     tiny JSON signaling passes through here.
 *
 * A client authenticates with its bearer token in the query string, then sends
 * `{ type: 'join', threadId }`. We verify it is a participant of that thread
 * before joining it to the room.
 */

// threadId -> Set<{ ws, userId, role }>
const rooms = new Map();

function join(threadId, member) {
  let set = rooms.get(threadId);
  if (!set) rooms.set(threadId, (set = new Set()));
  set.add(member);
}

function leave(threadId, member) {
  const set = rooms.get(threadId);
  if (!set) return;
  set.delete(member);
  if (set.size === 0) rooms.delete(threadId);
}

/** Send `payload` to everyone in the thread room except `origin` (if given). */
function relay(threadId, payload, origin) {
  const set = rooms.get(threadId);
  if (!set) return;
  const data = JSON.stringify(payload);
  for (const m of set) {
    if (m === origin) continue;
    if (m.ws.readyState === m.ws.OPEN) {
      try {
        m.ws.send(data);
      } catch {
        /* ignore a single failed send */
      }
    }
  }
}

export function attachFollowUpRelay(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return; // let other upgrade handlers (e.g. /ws/live) deal with it
    }
    if (url.pathname !== '/ws/follow-up') return;
    const auth = verifyToken(url.searchParams.get('token'));
    if (!auth) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => handle(ws, auth));
  });

  // Live fan-out of persisted messages. `routes.js` emits after a successful
  // REST insert so both sides render from the same authoritative row.
  bus.on('followup:message', ({ threadId, message }) => {
    relay(threadId, { type: 'message', threadId, message });
  });

  console.log('[follow-up] relay ready at /ws/follow-up');
  return wss;
}

async function handle(ws, auth) {
  const joined = new Set(); // threadIds this socket has joined
  const member = { ws, userId: auth.id, role: auth.role };

  ws.on('message', async (raw) => {
    let msg;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
    } catch {
      return;
    }
    const threadId = typeof msg.threadId === 'string' ? msg.threadId : null;
    if (!threadId) return;

    if (msg.type === 'join') {
      if (joined.has(threadId)) return;
      const thread = await prisma.followUpThread
        .findUnique({ where: { id: threadId }, select: { patientId: true, doctorId: true } })
        .catch(() => null);
      if (!thread || (thread.patientId !== auth.id && thread.doctorId !== auth.id)) {
        return ws.send(JSON.stringify({ type: 'error', threadId, error: 'Not a participant.' }));
      }
      joined.add(threadId);
      join(threadId, member);
      // Tell the peer someone is present (for "online"/call-readiness hints).
      relay(threadId, { type: 'presence', threadId, userId: auth.id, role: auth.role, state: 'join' }, member);
      return;
    }

    // Every other frame requires a joined thread the caller belongs to.
    if (!joined.has(threadId)) return;

    switch (msg.type) {
      // WebRTC signaling + call control — relayed verbatim to the peer.
      case 'signal':
      case 'call-invite':
      case 'call-accept':
      case 'call-decline':
      case 'call-end':
      case 'typing':
        relay(threadId, { ...msg, fromUserId: auth.id, fromRole: auth.role }, member);
        break;
      default:
        break;
    }
  });

  const cleanup = () => {
    for (const threadId of joined) {
      relay(threadId, { type: 'presence', threadId, userId: auth.id, role: auth.role, state: 'leave' }, member);
      leave(threadId, member);
    }
    joined.clear();
  };
  ws.on('close', cleanup);
  ws.on('error', cleanup);
}
