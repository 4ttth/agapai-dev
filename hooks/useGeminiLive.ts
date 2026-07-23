import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioBufferQueueSourceNode,
  AudioContext,
  AudioManager,
  AudioRecorder,
  decodePCMInBase64,
} from 'react-native-audio-api';

import { appConfig } from '@/constants';
import { getAuthToken } from '@/services/api/http';

/**
 * Real-time voice conversation with the AgapAI assistant over Gemini Live.
 *
 * The phone never holds the Gemini key: it opens a WebSocket to our own
 * server, which authenticates the bearer token, injects the patient's name and
 * pronouns, and relays audio to Gemini.
 *
 * Gemini Live is fixed at 16 kHz PCM in / 24 kHz PCM out, so the mic is
 * requested at 16 kHz and replies are decoded at 24 kHz and pushed through a
 * queue source for gapless playback.
 */
const INPUT_RATE = 16000;
const OUTPUT_RATE = 24000;
const BUFFER_LENGTH = 2048;

export type LiveState = 'idle' | 'connecting' | 'live' | 'error';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** RN has no reliable btoa/Buffer, so encode the PCM frames by hand. */
function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1] ?? 0;
    const b2 = bytes[i + 2] ?? 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[b2 & 63] : '=';
  }
  return out;
}

/** Float samples (-1..1) → little-endian signed 16-bit PCM, as Gemini expects. */
function floatToPcm16(f32: Float32Array): Uint8Array {
  const bytes = new Uint8Array(f32.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}

export function useGeminiLive() {
  const [state, setState] = useState<LiveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const queueRef = useRef<AudioBufferQueueSourceNode | null>(null);
  const readyRef = useRef(false);
  const stoppingRef = useRef(false);

  const teardown = useCallback(() => {
    readyRef.current = false;
    try {
      recorderRef.current?.clearOnAudioReady();
      void recorderRef.current?.stop();
    } catch {}
    recorderRef.current = null;
    try {
      queueRef.current?.clearBuffers();
      queueRef.current?.stop();
    } catch {}
    queueRef.current = null;
    try {
      void ctxRef.current?.close();
    } catch {}
    ctxRef.current = null;
    try {
      wsRef.current?.close();
    } catch {}
    wsRef.current = null;
    setSpeaking(false);
  }, []);

  const stop = useCallback(() => {
    stoppingRef.current = true;
    teardown();
    setState('idle');
  }, [teardown]);

  const start = useCallback(
    async (documentText?: string) => {
      if (state === 'connecting' || state === 'live') return;
      stoppingRef.current = false;
      setError(null);
      setState('connecting');

      try {
        const permission = await AudioManager.requestRecordingPermissions();
        if (permission !== 'Granted') {
          setError('Microphone access is needed to talk with the assistant.');
          setState('error');
          return;
        }
        // Play and record at the same time so the assistant can be interrupted.
        AudioManager.setAudioSessionOptions({
          iosCategory: 'playAndRecord',
          iosMode: 'voiceChat',
          iosOptions: ['defaultToSpeaker', 'allowBluetoothHFP'],
        });

        const token = getAuthToken();
        if (!token) {
          setError('Please sign in again to use the voice assistant.');
          setState('error');
          return;
        }

        const ctx = new AudioContext({ sampleRate: OUTPUT_RATE });
        const queue = ctx.createBufferQueueSource();
        queue.connect(ctx.destination);
        // Pass an explicit (when, offset) of 0. The library's start() defaults
        // offset to -1 as a "no offset" sentinel, but its own guard then throws
        // "offset must be a finite non-negative number: -1", so we must start at 0.
        queue.start(0, 0);
        ctxRef.current = ctx;
        queueRef.current = queue;

        const base = appConfig.serverUrl.replace(/^http/, 'ws');
        const params = new URLSearchParams({ token });
        if (documentText) params.set('documentText', documentText.slice(0, 4000));
        const ws = new WebSocket(`${base}/ws/live?${params.toString()}`);
        wsRef.current = ws;

        ws.onmessage = async (event: WebSocketMessageEvent) => {
          let msg: Record<string, any>;
          try {
            // Frames are JSON text, but a binary frame (ArrayBuffer) can still
            // arrive depending on the platform — decode it rather than dropping
            // it, or setupComplete could be missed and the call stalls.
            const raw =
              typeof event.data === 'string'
                ? event.data
                : event.data instanceof ArrayBuffer
                  ? new TextDecoder().decode(event.data)
                  : '';
            if (!raw) return;
            msg = JSON.parse(raw);
          } catch {
            return;
          }

          if (msg.setupComplete) {
            readyRef.current = true;
            setState('live');
            await beginCapture(ws);
            return;
          }

          // Barge-in: drop anything still queued so the reply stops promptly.
          if (msg.serverContent?.interrupted) {
            queueRef.current?.clearBuffers();
            setSpeaking(false);
            return;
          }

          const parts = msg.serverContent?.modelTurn?.parts ?? [];
          for (const part of parts) {
            const data = part?.inlineData?.data;
            if (!data) continue;
            try {
              // Gemini declares the rate on the part (audio/pcm;rate=24000);
              // trust it rather than assuming, so a format change can't
              // silently play everything back at the wrong pitch.
              const declared = Number(/rate=(\d+)/.exec(part?.inlineData?.mimeType ?? '')?.[1]);
              const buffer = await decodePCMInBase64(
                data,
                Number.isFinite(declared) && declared > 0 ? declared : OUTPUT_RATE,
                1,
              );
              queueRef.current?.enqueueBuffer(buffer);
              setSpeaking(true);
            } catch {
              // A single corrupt chunk shouldn't end the call.
            }
          }
          if (msg.serverContent?.turnComplete) setSpeaking(false);
        };

        ws.onerror = () => {
          if (stoppingRef.current) return;
          setError('Lost connection to the assistant.');
          setState('error');
          teardown();
        };

        ws.onclose = () => {
          if (stoppingRef.current) return;
          teardown();
          setState((s) => (s === 'error' ? s : 'idle'));
        };
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not start the voice assistant.');
        setState('error');
        teardown();
      }
    },
    [state, teardown],
  );

  /** Stream mic frames upstream once Gemini has acknowledged setup. */
  const beginCapture = async (ws: WebSocket) => {
    const recorder = new AudioRecorder();
    recorderRef.current = recorder;
    recorder.onAudioReady(
      { sampleRate: INPUT_RATE, bufferLength: BUFFER_LENGTH, channelCount: 1 },
      ({ buffer }) => {
        if (!readyRef.current || ws.readyState !== WebSocket.OPEN) return;
        try {
          const pcm = floatToPcm16(buffer.getChannelData(0));
          // The recorder may hand back a different rate than requested
          // depending on the hardware, so declare what we actually captured —
          // hardcoding 16000 would make Gemini mishear on such devices.
          const rate = Math.round(buffer.sampleRate) || INPUT_RATE;
          ws.send(
            JSON.stringify({
              realtimeInput: {
                audio: { data: toBase64(pcm), mimeType: `audio/pcm;rate=${rate}` },
              },
            }),
          );
        } catch {
          // Dropping a frame is better than tearing down the call.
        }
      },
    );
    recorder.onError(() => {
      setError('The microphone stopped unexpectedly.');
      setState('error');
      teardown();
    });
    await recorder.start();
  };

  // Never leave the mic hot if the screen goes away mid-call.
  useEffect(() => () => teardown(), [teardown]);

  return { state, error, speaking, start, stop };
}
