import { useCallback, useEffect, useRef, useState } from 'react';

import { appConfig } from '@/constants';
import { getAuthToken } from '@/services/api/http';
import { serverApi } from '@/services/api/server';
import type {
  FollowUpMessageBody,
  FollowUpMessageRow,
  FollowUpShareRow,
  FollowUpThread,
  ServerRole,
} from '@/types';
import { decryptJson, encryptJson } from '@/utils/crypto';

export interface ChatMessage {
  id: string;
  who: 'me' | 'them';
  text: string;
  at: string;
}

type Status = 'loading' | 'ready' | 'error' | 'locked';

/**
 * Drives one follow-up conversation: loads + decrypts history, keeps a live
 * WebSocket for instant delivery (with a polling fallback), and sends
 * end-to-end-encrypted messages. `threadKey` is resolved by the caller — from
 * local storage on the patient, from the sealed wrap on the doctor.
 */
export function useFollowUpThread(threadId: string, threadKey: string | null, myRole: ServerRole) {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [thread, setThread] = useState<FollowUpThread | null>(null);
  const [shares, setShares] = useState<FollowUpShareRow[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [live, setLive] = useState(false);

  const seen = useRef<Set<string>>(new Set());
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const decodeRow = useCallback(
    (row: FollowUpMessageRow): ChatMessage | null => {
      if (!threadKey) return null;
      const body = decryptJson<FollowUpMessageBody>(
        { ciphertext: row.ciphertext, iv: row.iv, salt: row.salt },
        threadKey,
      );
      if (!body) return null;
      return {
        id: row.id,
        who: row.senderRole === myRole ? 'me' : 'them',
        text: body.text,
        at: row.createdAt,
      };
    },
    [threadKey, myRole],
  );

  const ingest = useCallback(
    (rows: FollowUpMessageRow[]) => {
      const fresh: ChatMessage[] = [];
      for (const row of rows) {
        if (seen.current.has(row.id)) continue;
        const msg = decodeRow(row);
        if (!msg) continue;
        seen.current.add(row.id);
        fresh.push(msg);
      }
      if (fresh.length === 0) return;
      setMessages((prev) =>
        [...prev, ...fresh].sort((a, b) => a.at.localeCompare(b.at)),
      );
    },
    [decodeRow],
  );

  const refresh = useCallback(async () => {
    try {
      const { messages: rows } = await serverApi.followUpMessages(threadId);
      ingest(rows);
    } catch {
      /* keep whatever we have */
    }
  }, [threadId, ingest]);

  // Initial load: thread meta, shares, and history.
  useEffect(() => {
    let active = true;
    if (!threadKey) {
      setStatus('locked');
      return;
    }
    (async () => {
      try {
        const [detail, history] = await Promise.all([
          serverApi.getFollowUp(threadId),
          serverApi.followUpMessages(threadId),
        ]);
        if (!active) return;
        setThread(detail.thread);
        setShares(detail.shares);
        ingest(history.messages);
        setStatus('ready');
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Could not open this follow-up.');
        setStatus('error');
      }
    })();
    return () => {
      active = false;
    };
  }, [threadId, threadKey, ingest]);

  // Live socket for instant delivery; poll every 8s as a fallback.
  useEffect(() => {
    if (status !== 'ready') return;
    const token = getAuthToken();
    if (!token) return;

    const base = appConfig.serverUrl.replace(/^http/, 'ws');
    const ws = new WebSocket(`${base}/ws/follow-up?token=${encodeURIComponent(token)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setLive(true);
      ws.send(JSON.stringify({ type: 'join', threadId }));
    };
    ws.onmessage = (event) => {
      try {
        const raw = typeof event.data === 'string' ? event.data : '';
        if (!raw) return;
        const msg = JSON.parse(raw);
        if (msg.type === 'message' && msg.threadId === threadId && msg.message) {
          ingest([msg.message as FollowUpMessageRow]);
        }
      } catch {
        /* ignore malformed frame */
      }
    };
    ws.onclose = () => setLive(false);
    ws.onerror = () => setLive(false);

    pollRef.current = setInterval(() => void refresh(), 8000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      wsRef.current = null;
    };
  }, [status, threadId, ingest, refresh]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !threadKey) return;
      const blob = await encryptJson({ text: trimmed } satisfies FollowUpMessageBody, threadKey);
      const { message } = await serverApi.sendFollowUpMessage(threadId, blob);
      ingest([message]); // render from the authoritative row (dedup by id)
    },
    [threadId, threadKey, ingest],
  );

  const close = useCallback(async () => {
    const { thread: updated } = await serverApi.closeFollowUp(threadId);
    setThread(updated);
  }, [threadId]);

  return { status, error, thread, shares, messages, live, send, close, refresh };
}
