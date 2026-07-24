import * as Crypto from 'expo-crypto';
import nacl from 'tweetnacl';

import { bytesToUtf8, decodeBase64, encodeBase64, utf8ToBytes } from './base64';
import { readJson, writeJson } from './storage';

/**
 * End-to-end key exchange for doctor ⇄ patient follow-ups.
 *
 * Each device holds a long-lived NaCl box keypair. To start a follow-up the
 * patient mints a random per-thread key and SEALS it to the doctor's published
 * public key (an anonymous "sealed box": an ephemeral keypair + nonce, so no
 * sender identity is needed). Only the doctor's device — which alone holds the
 * matching secret — can unwrap it, so the server stores a wrap it can never
 * open. Messages are then AES-encrypted with the thread key exactly like
 * consultation records.
 */

// tweetnacl's default PRNG needs crypto.getRandomValues, which React Native
// lacks; route it through expo-crypto's native CSPRNG instead.
nacl.setPRNG((x, n) => {
  const bytes = Crypto.getRandomBytes(n);
  for (let i = 0; i < n; i++) x[i] = bytes[i];
});

const DEVICE_KEYPAIR = 'agapai/followup-keypair-v1';

export interface DeviceKeyPair {
  publicKey: string; // base64
  secretKey: string; // base64
}

/** Load (or lazily create + persist) this device's follow-up keypair. */
export async function getDeviceKeyPair(): Promise<DeviceKeyPair> {
  const existing = await readJson<DeviceKeyPair | null>(DEVICE_KEYPAIR, null);
  if (existing?.publicKey && existing?.secretKey) return existing;
  const kp = nacl.box.keyPair();
  const pair: DeviceKeyPair = {
    publicKey: encodeBase64(kp.publicKey),
    secretKey: encodeBase64(kp.secretKey),
  };
  await writeJson(DEVICE_KEYPAIR, pair);
  return pair;
}

/** A fresh 256-bit thread key as hex (fed to SHA-256(key+salt) per message). */
export async function makeThreadKey(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// The patient keeps their own copy of each thread key locally (the sealed copy
// on the server is for the doctor). Namespaced per thread id.
const threadKeyStore = (threadId: string) => `agapai/followup-tkey/${threadId}`;

export async function saveThreadKey(threadId: string, key: string): Promise<void> {
  await writeJson(threadKeyStore(threadId), key);
}

export async function loadThreadKey(threadId: string): Promise<string | null> {
  return readJson<string | null>(threadKeyStore(threadId), null);
}

export interface SealedKey {
  wrappedKey: string;
  wrapNonce: string;
  wrapEphemPub: string;
}

/** Seal `plaintext` to a recipient's base64 public key (anonymous sealed box). */
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

/** Open a sealed box with this device's secret key; null if it isn't for us. */
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
