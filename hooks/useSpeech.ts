import * as Speech from 'expo-speech';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioContext, AudioManager, decodePCMInBase64 } from 'react-native-audio-api';

import { serverApi } from '@/services/api/server';

/**
 * "Read aloud" for the assistant and consultation records.
 *
 * Primary voice is Gemini's neural TTS (relayed by our server), which sounds
 * far more human than the device's built-in speech synthesizer. Gemini returns
 * 24 kHz signed-16-bit PCM, decoded and played through react-native-audio-api
 * (the same pipeline the live voice assistant already uses).
 *
 * If Gemini TTS is unavailable (not configured, offline, or the request fails),
 * we fall back to expo-speech so the feature always works.
 */
export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<ReturnType<AudioContext['createBufferSource']> | null>(null);
  // Bumped on every stop()/new speak() so an in-flight request whose playback
  // has been superseded (or cancelled) resolves into a no-op.
  const genRef = useRef(0);
  // Safety timer that clears `speaking` if the audio node's onEnded never fires.
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Best-effort: route audio to the loudspeaker (and keep sound on with the
   *  ringer muted). A prior voice call may have left the session in record mode,
   *  which can silence playback — so we reset it before speaking either way. */
  const routeToSpeaker = useCallback(() => {
    try {
      AudioManager.setAudioSessionOptions({ iosCategory: 'playback', iosOptions: ['defaultToSpeaker'] });
    } catch {
      /* native audio module unavailable (e.g. Expo Go) — non-fatal */
    }
  }, []);

  const teardownAudio = useCallback(() => {
    if (endTimerRef.current) {
      clearTimeout(endTimerRef.current);
      endTimerRef.current = null;
    }
    try {
      sourceRef.current?.stop();
    } catch {}
    sourceRef.current = null;
    try {
      void ctxRef.current?.close();
    } catch {}
    ctxRef.current = null;
  }, []);

  const stop = useCallback(() => {
    genRef.current += 1;
    Speech.stop();
    teardownAudio();
    setSpeaking(false);
  }, [teardownAudio]);

  // Never leave audio playing if the screen using this hook goes away.
  useEffect(
    () => () => {
      genRef.current += 1;
      Speech.stop();
      teardownAudio();
    },
    [teardownAudio],
  );

  /** Device fallback voice (expo-speech). */
  const speakOnDevice = useCallback(
    (text: string) => {
      Speech.stop();
      routeToSpeaker(); // ensure playback routing so the device voice is audible
      setSpeaking(true);
      Speech.speak(text, {
        rate: 0.95,
        onDone: () => setSpeaking(false),
        onStopped: () => setSpeaking(false),
        onError: () => setSpeaking(false),
      });
    },
    [routeToSpeaker],
  );

  const speak = useCallback(
    async (text: string) => {
      const clean = text?.trim();
      if (!clean) return;

      // Supersede any current playback/request.
      genRef.current += 1;
      const gen = genRef.current;
      Speech.stop();
      teardownAudio();
      setSpeaking(true);

      // Route to the loudspeaker up front so BOTH the neural voice and the
      // device fallback are audible, even right after a voice call.
      routeToSpeaker();

      try {
        const { audio, rate } = await serverApi.synthesizeSpeech(clean);
        if (gen !== genRef.current) return; // stopped or superseded while awaiting

        const sampleRate = rate || 24000;
        const ctx = new AudioContext({ sampleRate });
        const buffer = await decodePCMInBase64(audio, sampleRate, 1);
        if (gen !== genRef.current) {
          void ctx.close();
          return;
        }
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.onEnded = () => {
          if (gen === genRef.current) setSpeaking(false);
        };
        ctxRef.current = ctx;
        sourceRef.current = source;
        source.start(0);

        // Safety net: some devices don't fire onEnded reliably. Clear the
        // speaking flag after the clip's known duration so the "Read aloud"
        // button can't get stuck on "Stop reading".
        const holdMs = Number.isFinite(buffer.duration) ? buffer.duration * 1000 + 500 : 0;
        if (holdMs > 0) {
          if (endTimerRef.current) clearTimeout(endTimerRef.current);
          endTimerRef.current = setTimeout(() => {
            if (gen === genRef.current) setSpeaking(false);
          }, holdMs);
        }
      } catch (err) {
        if (gen !== genRef.current) return;
        console.warn('[useSpeech] Gemini TTS failed, falling back to device voice:', err);
        // Gemini TTS unavailable — fall back to the built-in device voice.
        speakOnDevice(clean);
      }
    },
    [teardownAudio, speakOnDevice, routeToSpeaker],
  );

  const toggle = useCallback(
    (text: string) => {
      if (speaking) {
        stop();
      } else {
        void speak(text);
      }
    },
    [speaking, speak, stop],
  );

  return { speaking, speak, stop, toggle };
}
