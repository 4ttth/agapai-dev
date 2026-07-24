import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioManager } from 'react-native-audio-api';

import { appConfig } from '@/constants';
import { getAuthToken } from '@/services/api/http';
import { serverApi } from '@/services/api/server';

/**
 * Peer-to-peer follow-up voice call over WebRTC.
 *
 * WebRTC gives us exactly what a "faster UDP connection over a secure port"
 * asks for, without hand-rolling raw UDP: media flows phone→phone over UDP
 * (ICE), encrypted end-to-end with DTLS-SRTP, and only falls back through a TURN
 * relay when a network blocks direct UDP. Our server never sees the audio — it
 * only relays the tiny JSON signaling (offer/answer/ICE) over the follow-up
 * WebSocket.
 *
 * `react-native-webrtc` is a native module, so this only runs in a custom dev
 * build — not Expo Go. We load it lazily and surface a clear message when the
 * native side is unavailable rather than crashing.
 */

// Static require so Metro bundles it, wrapped so a missing native module (Expo
// Go) degrades to a friendly error instead of a redbox.
function loadWebRtc(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-webrtc');
  } catch {
    return null;
  }
}

export type CallState = 'idle' | 'connecting' | 'ringing' | 'connected' | 'ended' | 'error';

interface Options {
  threadId: string;
  /** true = we place the call (send the offer); false = we answer. */
  initiator: boolean;
}

export function useWebRtcCall({ threadId, initiator }: Options) {
  const [state, setState] = useState<CallState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<any>(null);
  const localStreamRef = useRef<any>(null);
  const startedRef = useRef(false);
  const offeredRef = useRef(false);

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
      t.enabled = muted; // if currently muted, re-enable; else disable
      nowMuted = !t.enabled;
    }
    setMuted(nowMuted);
  }, [muted]);

  /**
   * Route call audio to the loudspeaker or back to the earpiece. iOS shares one
   * AVAudioSession across the whole app, so flipping `defaultToSpeaker` here
   * moves the live WebRTC audio too. Wrapped in try/catch because the native
   * audio module isn't present in Expo Go (where calls can't run anyway) — a
   * missing route control should never crash an in-progress call.
   */
  const applyAudioRoute = useCallback((toSpeaker: boolean) => {
    try {
      AudioManager.setAudioSessionOptions({
        iosCategory: 'playAndRecord',
        iosMode: 'voiceChat',
        iosOptions: toSpeaker
          ? ['defaultToSpeaker', 'allowBluetoothHFP']
          : ['allowBluetoothHFP'],
      });
    } catch {
      /* audio routing control unavailable — non-fatal */
    }
  }, []);

  const toggleSpeaker = useCallback(() => {
    setSpeakerOn((prev) => {
      const next = !prev;
      applyAudioRoute(next);
      return next;
    });
  }, [applyAudioRoute]);

  const start = useCallback(async () => {
    if (startedRef.current) return;
    startedRef.current = true;
    setError(null);
    setState('connecting');

    const webrtc = loadWebRtc();
    if (!webrtc?.RTCPeerConnection) {
      setError(
        'Calls need the AgapAI dev build (WebRTC is a native module and is not available in Expo Go).',
      );
      setState('error');
      return;
    }
    const { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, mediaDevices } = webrtc;

    const token = getAuthToken();
    if (!token) {
      setError('Please sign in again to place a call.');
      setState('error');
      return;
    }

    try {
      const { iceServers } = await serverApi.followUpIce();
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

      const base = appConfig.serverUrl.replace(/^http/, 'ws');
      const ws = new WebSocket(`${base}/ws/follow-up?token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      pc.addEventListener('icecandidate', (e: any) => {
        if (e.candidate)
          ws.send(JSON.stringify({ type: 'signal', threadId, kind: 'ice', candidate: e.candidate }));
      });

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'join', threadId }));
        setState('ringing');
        if (initiator) {
          // Ring the peer over the socket (instant, if they're connected) AND
          // via push (so it rings when their app is backgrounded or closed).
          ws.send(JSON.stringify({ type: 'call-invite', threadId }));
          void serverApi.ringFollowUpCall(threadId).catch(() => {});
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

        if (msg.type === 'presence' && msg.state === 'join' && initiator) {
          ws.send(JSON.stringify({ type: 'call-invite', threadId }));
        } else if (msg.type === 'call-invite' && !initiator) {
          setState('ringing');
        } else if (msg.type === 'call-decline' || msg.type === 'call-end') {
          hangUp();
        } else if (msg.type === 'call-accept' && initiator) {
          if (offeredRef.current) return; // one offer per call, even if accepted twice
          offeredRef.current = true;
          setState('connecting');
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
              /* a late/duplicate candidate is non-fatal */
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

  /** Callee accepts: tell the caller to send its offer. */
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

  return { state, error, muted, speakerOn, start, accept, decline, hangUp, toggleMute, toggleSpeaker };
}
