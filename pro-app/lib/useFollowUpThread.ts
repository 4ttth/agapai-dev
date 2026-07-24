import { useCallback, useEffect, useRef, useState } from 'react';

import {
  followUpApi,
  getCurrentToken,
  SERVER_URL,
  type FollowUpMessageBody,
  type FollowUpMessageRow,
  type FollowUpShareRow,
  type FollowUpThread,
} from './api';
import { decryptJson, encryptJson } from './crypto';

export interface ChatMessage {
  id: string;
  who: 'me' | 'them';
  text: string;
  at: string;
}

type Status = 'loading' | 'ready' | 'error' | 'locked';

/**
 * Doctor's side of a follow-up conversation. The thread key has already been
 * unwrapped (from the sealed wrap) and cached by the caller and is passed in
 * here; this hook loads + decrypts history, keeps a live socket, and sends.
 */
export function useFollowUpThread(threadId: string, threadKey: string | null) {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  const [thread, setThread] = useState<FollowUpThread | null>(null);
  const [shares, setShares] = useState<FollowUpShareRow[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [live, setLive] = useState(false);

  const [incomingCall, setIncomingCall] = useState(false);

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
      return { id: row.id, who: row.senderRole === 'DOCTOR' ? 'me' : 'them', text: body.text, at: row.createdAt };
    },
    [threadKey],
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
      setMessages((prev) => [...prev, ...fresh].sort((a, b) => a.at.localeCompare(b.at)));
    },
    [decodeRow],
  );

  const refresh = useCallback(async () => {
    try {
      const { messages: rows } = await followUpApi.messages(threadId);
      ingest(rows);
    } catch {
      /* keep what we have */
    }
  }, [threadId, ingest]);

  useEffect(() => {
    let active = true;
    if (!threadKey) {
      setStatus('locked');
      return;
    }
    (async () => {
      try {
        const [detail, history] = await Promise.all([
          followUpApi.get(threadId),
          followUpApi.messages(threadId),
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

  useEffect(() => {
    if (status !== 'ready') return;
    const token = getCurrentToken();
    if (!token) return;

    const base = SERVER_URL.replace(/^http/, 'ws');
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
        if (msg.threadId !== threadId) return;
        if (msg.type === 'message' && msg.message) {
          ingest([msg.message as FollowUpMessageRow]);
        } else if (msg.type === 'call-invite' && msg.fromRole !== 'DOCTOR') {
          setIncomingCall(true);
        } else if (msg.type === 'call-end' || msg.type === 'call-decline') {
          setIncomingCall(false);
        }
      } catch {
        /* ignore */
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
      const blob = await encryptJson({ text: trimmed }, threadKey);
      const { message } = await followUpApi.send(threadId, blob);
      ingest([message]);
    },
    [threadId, threadKey, ingest],
  );

  const close = useCallback(async () => {
    const { thread: updated } = await followUpApi.close(threadId);
    setThread(updated);
  }, [threadId]);

  const declineIncomingCall = useCallback(() => {
    try {
      wsRef.current?.send(JSON.stringify({ type: 'call-decline', threadId }));
    } catch {
      /* ignore */
    }
    setIncomingCall(false);
  }, [threadId]);

  return { status, error, thread, shares, messages, live, incomingCall, send, close, refresh, declineIncomingCall };
}
