import * as Speech from 'expo-speech';
import { useCallback, useEffect, useState } from 'react';

/**
 * Thin wrapper around expo-speech for the "Read aloud" affordances. Tracks
 * speaking state so buttons can toggle between play and stop.
 */
export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    // Stop any in-flight speech when the component using this hook unmounts.
    return () => {
      Speech.stop();
    };
  }, []);

  const speak = useCallback((text: string) => {
    Speech.stop();
    setSpeaking(true);
    Speech.speak(text, {
      rate: 0.95,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  }, []);

  const stop = useCallback(() => {
    Speech.stop();
    setSpeaking(false);
  }, []);

  const toggle = useCallback(
    (text: string) => {
      if (speaking) {
        stop();
      } else {
        speak(text);
      }
    },
    [speaking, speak, stop],
  );

  return { speaking, speak, stop, toggle };
}
