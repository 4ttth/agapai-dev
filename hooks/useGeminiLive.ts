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

/** One spoken turn, transcribed by Gemini Live (kept locally for history). */
export interface LiveTurn {
  who: 'user' | 'ai';
  text: string;
}

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
  const [transcript, setTranscript] = useState<LiveTurn[]>([]);

  // Transcription arrives as incremental fragments per side; buffer them and
  // flush a complete turn at each boundary (user→assistant, or turnComplete).
  const userBufRef = useRef('');
  const aiBufRef = useRef('');

  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const queueRef = useRef<AudioBufferQueueSourceNode | null>(null);
  const readyRef = useRef(false);
  const stoppingRef = useRef(false);

  // Mute mic transmission while AI is outputting audio to prevent self-interruption echo loops.
  const aiSpeakingRef = useRef(false);
  const muteMicUntilRef = useRef(0);
  const speakingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const teardown = useCallback(() => {
    readyRef.current = false;
    if (speakingTimeoutRef.current) {
      clearTimeout(speakingTimeoutRef.current);
      speakingTimeoutRef.current = null;
    }
    aiSpeakingRef.current = false;
    muteMicUntilRef.current = 0;
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

  const flushUser = useCallback(() => {
    const t = userBufRef.current.trim();
    userBufRef.current = '';
    if (t) setTranscript((prev) => [...prev, { who: 'user', text: t }]);
  }, []);

  const flushAi = useCallback(() => {
    const t = aiBufRef.current.trim();
    aiBufRef.current = '';
    if (t) setTranscript((prev) => [...prev, { who: 'ai', text: t }]);
  }, []);

  const stop = useCallback(() => {
    stoppingRef.current = true;
    // Persist any half-finished turn before the socket goes away.
    flushUser();
    flushAi();
    teardown();
    setState('idle');
  }, [teardown, flushUser, flushAi]);

  const start = useCallback(
    async (documentText?: string) => {
      if (state === 'connecting' || state === 'live') return;
      stoppingRef.current = false;
      setError(null);
      setState('connecting');
      setTranscript([]);
      userBufRef.current = '';
      aiBufRef.current = '';

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

          // Live transcription of both sides (for the local history transcript).
          const userText = msg.serverContent?.inputTranscription?.text;
          if (typeof userText === 'string' && userText) {
            // A new user utterance means the previous AI turn is complete.
            if (aiBufRef.current.trim()) flushAi();
            userBufRef.current += userText;
          }
          const aiText = msg.serverContent?.outputTranscription?.text;
          if (typeof aiText === 'string' && aiText) {
            // The assistant is answering, so the user's turn is complete.
            if (userBufRef.current.trim()) flushUser();
            aiBufRef.current += aiText;
          }

          // Barge-in: drop anything still queued so the reply stops promptly.
          if (msg.serverContent?.interrupted) {
            queueRef.current?.clearBuffers();
            if (speakingTimeoutRef.current) {
              clearTimeout(speakingTimeoutRef.current);
              speakingTimeoutRef.current = null;
            }
            aiSpeakingRef.current = false;
            muteMicUntilRef.current = 0;
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
              const sampleRate = Number.isFinite(declared) && declared > 0 ? declared : OUTPUT_RATE;
              const buffer = await decodePCMInBase64(data, sampleRate, 1);
              queueRef.current?.enqueueBuffer(buffer);

              // Calculate chunk duration in ms to track queue playback depth.
              const chunkMs = (buffer.length / sampleRate) * 1000;
              const now = Date.now();
              muteMicUntilRef.current = Math.max(now, muteMicUntilRef.current) + chunkMs;
              aiSpeakingRef.current = true;
              setSpeaking(true);
            } catch {
              // A single corrupt chunk shouldn't end the call.
            }
          }
          if (msg.serverContent?.turnComplete) {
            flushAi(); // the assistant's turn is done — commit it to the transcript

            // Keep the mic muted and speaking state active until the queued audio
            // finishes playing, plus a 400ms safety tail for speaker reverb decay.
            const remainingMs = Math.max(0, muteMicUntilRef.current + 400 - Date.now());
            if (speakingTimeoutRef.current) clearTimeout(speakingTimeoutRef.current);
            speakingTimeoutRef.current = setTimeout(() => {
              aiSpeakingRef.current = false;
              setSpeaking(false);
            }, remainingMs);
          }
        };

        ws.onerror = () => {
          if (stoppingRef.current) return;
          // A failure before setup completed means we never reached a live call
          // — usually the relay is unreachable or the voice assistant isn't
          // configured on the server. Say so instead of failing silently, which
          // reads to the patient as "the assistant isn't responding."
          setError(
            readyRef.current
              ? 'Lost connection to the assistant. Tap the mic to reconnect.'
              : "Couldn't reach the voice assistant. It may be unavailable right now — tap Type to chat instead.",
          );
          setState('error');
          teardown();
        };

        ws.onclose = () => {
          if (stoppingRef.current) return;
          // Server/network closed the call — keep whatever was transcribed.
          flushUser();
          flushAi();
          teardown();
          // If the socket closed before the call ever went live, surface it as
          // an error so the UI doesn't just fall back to "Tap to talk" with no
          // explanation (which looks like the assistant ignoring the patient).
          if (!readyRef.current) {
            setError(
              (prev) =>
                prev ??
                "The voice assistant didn't start. It may be unavailable right now — you can tap Type to chat instead.",
            );
            setState('error');
          } else {
            setState((s) => (s === 'error' ? s : 'idle'));
          }
        };
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not start the voice assistant.');
        setState('error');
        teardown();
      }
    },
    [state, teardown, flushUser, flushAi],
  );

  /** Stream mic frames upstream once Gemini has acknowledged setup. */
  const beginCapture = async (ws: WebSocket) => {
    const recorder = new AudioRecorder();
    recorderRef.current = recorder;
    recorder.onAudioReady(
      { sampleRate: INPUT_RATE, bufferLength: BUFFER_LENGTH, channelCount: 1 },
      ({ buffer }) => {
        if (!readyRef.current || ws.readyState !== WebSocket.OPEN) return;
        // Self-heal a stuck mute: normally `turnComplete` schedules the timer
        // that reopens the mic, but if that frame is dropped (flaky network),
        // aiSpeaking would stay true forever and the mic would never reopen —
        // which the patient experiences as the assistant going silent and never
        // taking their next turn. Once the projected playback end is well past
        // (and no fresh audio has pushed it forward), force the mic back on.
        if (aiSpeakingRef.current && Date.now() > muteMicUntilRef.current + 1500) {
          aiSpeakingRef.current = false;
          setSpeaking(false);
        }
        // Suppress sending mic audio while AI is outputting/playing audio to prevent speaker echo
        // from feeding back into the mic and triggering false Gemini self-interruptions.
        if (aiSpeakingRef.current || Date.now() < muteMicUntilRef.current) return;
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

  return { state, error, speaking, transcript, start, stop };
}
