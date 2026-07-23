import * as Crypto from 'expo-crypto';

import { readJson, writeJson } from './storage';

const DEVICE_KEY = 'agapai/device-id-v1';

let cached: string | null = null;

/**
 * A stable per-install identifier. It marks which single device currently
 * "owns" the escrowed consultation key: when a new phone recovers the key via
 * Face Liveness, the server records that phone's id as the active device, and
 * the previous phone (whose id no longer matches) is treated as retired.
 */
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  let id = await readJson<string | null>(DEVICE_KEY, null);
  if (!id) {
    id = Crypto.randomUUID();
    await writeJson(DEVICE_KEY, id);
  }
  cached = id;
  return id;
}
