import { useCallback, useEffect, useRef, useState } from 'react';

import { followUpApi, getCurrentToken, SERVER_URL } from './api';

/**
 * Doctor's side of a peer-to-peer follow-up call (WebRTC). Media flows directly
 * phone→phone over UDP, encrypted with DTLS-SRTP; the server only relays the
 * JSON signaling over the follow-up WebSocket. Requires the AgapAI Pro dev build
 * (react-native-webrtc is native, not available in Expo Go).
 */

function loadWebRtc(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-webrtc');
  } catch {
    return null;
  }
}

export type CallState = 'idle' | 'connecting' | 'ringing' | 'connected' | 'ended' | 'error';

export function useWebRtcCall({ threadId, initiator }: { threadId: string; initiator: boolean }) {
  const [state, setState] = useState<CallState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<any>(null);
  const localStreamRef = useRef<any>(null);
  const startedRef = useRef(false);

  const cleanup = useCallback(() => {
    try {
      localStreamRef.current?.getTracks?.().forEach((t: any) => t.stop());
    } catch {
      /* ignore */
    }
    localStreamRef.current = null;
    try {
      pcRef.current?.close?.();
    } catch {
      /* ignore */
    }
    pcRef.current = null;
    try {
      wsRef.current?.close?.();
    } catch {
      /* ignore */
    }
    wsRef.current = null;
  }, []);

  const hangUp = useCallback(() => {
    try {
      wsRef.current?.send(JSON.stringify({ type: 'call-end', threadId }));
    } catch {
      /* ignore */
    }
    cleanup();
    setState('ended');
  }, [threadId, cleanup]);

  const toggleMute = useCallback(() => {
    const tracks = localStreamRef.current?.getAudioTracks?.() ?? [];
    let nowMuted = muted;
    for (const t of tracks) {
      t.enabled = muted;
      nowMuted = !t.enabled;
    }
    setMuted(nowMuted);
  }, [muted]);

  const start = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setError(null);
    setState('connecting');

    const webrtc = loadWebRtc();
    if (!webrtc?.RTCPeerConnection) {
      setError('Calls need the AgapAI Pro dev build (WebRTC is native and unavailable in Expo Go).');
      setState('error');
      return;
    }
    const { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, mediaDevices } = webrtc;

    const token = getCurrentToken();
    if (!token) {
      setError('Please sign in again to place a call.');
      setState('error');
      return;
    }

    try {
      const { iceServers } = await followUpApi.ice();
      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;

      const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      stream.getTracks().forEach((track: any) => pc.addTrack(track, stream));

      pc.addEventListener('connectionstatechange', () => {
        const s = pc.connectionState;
        if (s === 'connected') setState('connected');
        else if (s === 'failed' || s === 'disconnected') {
          setError('The call connection dropped.');
          setState('error');
        } else if (s === 'closed') setState('ended');
      });

      const base = SERVER_URL.replace(/^http/, 'ws');
      const ws = new WebSocket(`${base}/ws/follow-up?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      pc.addEventListener('icecandidate', (e: any) => {
        if (e.candidate)
          ws.send(JSON.stringify({ type: 'signal', threadId, kind: 'ice', candidate: e.candidate }));
      });

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'join', threadId }));
        if (initiator) {
          setState('ringing');
          ws.send(JSON.stringify({ type: 'call-invite', threadId }));
        }
      };

      ws.onmessage = async (event) => {
        let msg: any;
        try {
          msg = JSON.parse(typeof event.data === 'string' ? event.data : '');
        } catch {
          return;
        }
        if (!msg || msg.threadId !== threadId) return;

        if (msg.type === 'call-invite' && !initiator) {
          setState('ringing');
        } else if (msg.type === 'call-decline' || msg.type === 'call-end') {
          hangUp();
        } else if (msg.type === 'call-accept' && initiator) {
          const offer = await pc.createOffer({});
          await pc.setLocalDescription(offer);
          ws.send(JSON.stringify({ type: 'signal', threadId, kind: 'offer', sdp: pc.localDescription }));
        } else if (msg.type === 'signal') {
          if (msg.kind === 'offer' && !initiator) {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            ws.send(JSON.stringify({ type: 'signal', threadId, kind: 'answer', sdp: pc.localDescription }));
          } else if (msg.kind === 'answer' && initiator) {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          } else if (msg.kind === 'ice' && msg.candidate) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
            } catch {
              /* late/duplicate candidate is non-fatal */
            }
          }
        }
      };
      ws.onerror = () => {
        setError('Lost the signaling connection.');
        setState('error');
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the call.');
      setState('error');
      cleanup();
    }
  }, [threadId, initiator, hangUp, cleanup]);

  const accept = useCallback(() => {
    try {
      wsRef.current?.send(JSON.stringify({ type: 'call-accept', threadId }));
      setState('connecting');
    } catch {
      /* ignore */
    }
  }, [threadId]);

  const decline = useCallback(() => {
    try {
      wsRef.current?.send(JSON.stringify({ type: 'call-decline', threadId }));
    } catch {
      /* ignore */
    }
    cleanup();
    setState('ended');
  }, [threadId, cleanup]);

  useEffect(() => () => cleanup(), [cleanup]);

  return { state, error, muted, start, accept, decline, hangUp, toggleMute };
}
