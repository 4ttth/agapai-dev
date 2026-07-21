import AsyncStorage from '@react-native-async-storage/async-storage';

/** Typed, JSON-serialized wrappers around AsyncStorage with safe fallbacks. */

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson<T>(key: string, value: T): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function removeKeys(keys: string[]): Promise<void> {
  await AsyncStorage.multiRemove(keys);
}
