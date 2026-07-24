import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import nacl from 'tweetnacl';

import { bytesToUtf8, decodeBase64, encodeBase64, utf8ToBytes } from './base64';

/**
 * Doctor side of the follow-up key exchange (mirror of the patient app).
 *
 * The doctor's device holds a long-lived NaCl box keypair whose public half is
 * published to the server. When a patient opens a follow-up they seal the thread
 * key to that public key; here we unwrap it with the matching secret to read and
 * write the end-to-end encrypted messages. The server only ever sees the wrap.
 */

nacl.setPRNG((x, n) => {
  const bytes = Crypto.getRandomBytes(n);
  for (let i = 0; i < n; i++) x[i] = bytes[i];
});

const DEVICE_KEYPAIR = 'agapai-pro/followup-keypair-v1';

export interface DeviceKeyPair {
  publicKey: string;
  secretKey: string;
}

export async function getDeviceKeyPair(): Promise<DeviceKeyPair> {
  try {
    const raw = await AsyncStorage.getItem(DEVICE_KEYPAIR);
    if (raw) {
      const parsed = JSON.parse(raw) as DeviceKeyPair;
      if (parsed.publicKey && parsed.secretKey) return parsed;
    }
  } catch {
    /* fall through and regenerate */
  }
  const kp = nacl.box.keyPair();
  const pair: DeviceKeyPair = {
    publicKey: encodeBase64(kp.publicKey),
    secretKey: encodeBase64(kp.secretKey),
  };
  await AsyncStorage.setItem(DEVICE_KEYPAIR, JSON.stringify(pair));
  return pair;
}

export interface SealedKey {
  wrappedKey: string;
  wrapNonce: string;
  wrapEphemPub: string;
}

/** Open a sealed thread key with this device's secret key; null if not for us. */
export function openSealed(sealed: SealedKey, secretKeyB64: string): string | null {
  try {
    const opened = nacl.box.open(
      decodeBase64(sealed.wrappedKey),
      decodeBase64(sealed.wrapNonce),
      decodeBase64(sealed.wrapEphemPub),
      decodeBase64(secretKeyB64),
    );
    return opened ? bytesToUtf8(opened) : null;
  } catch {
    return null;
  }
}

// The doctor caches each unwrapped thread key locally so re-opening a follow-up
// doesn't re-unwrap every time (and works offline within the 7-day window).
const threadKeyStore = (threadId: string) => `agapai-pro/followup-tkey/${threadId}`;

export async function saveThreadKey(threadId: string, key: string): Promise<void> {
  await AsyncStorage.setItem(threadKeyStore(threadId), key);
}

export async function loadThreadKey(threadId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(threadKeyStore(threadId));
  } catch {
    return null;
  }
}

/** Seal a message to a recipient public key (used if a doctor ever initiates). */
export function sealTo(recipientPublicKeyB64: string, plaintext: string): SealedKey {
  const recipient = decodeBase64(recipientPublicKeyB64);
  const ephem = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const box = nacl.box(utf8ToBytes(plaintext), nonce, recipient, ephem.secretKey);
  return {
    wrappedKey: encodeBase64(box),
    wrapNonce: encodeBase64(nonce),
    wrapEphemPub: encodeBase64(ephem.publicKey),
  };
}
