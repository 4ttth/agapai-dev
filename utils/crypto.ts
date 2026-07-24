import CryptoJS from 'crypto-js';
import * as Crypto from 'expo-crypto';

import type { DecryptedConsultation } from '@/types';

/**
 * End-to-end consultation encryption.
 *
 * The patient's device generates a random 32-byte `patientKey` at registration.
 * It travels ONLY inside the Health ID QR (patient shows it in person). Each
 * consultation is encrypted with AES-256-CBC using a key derived from
 * SHA-256(patientKey + salt), so the server, eGov, and even the doctor after
 * upload can never read the record — only whoever the patient physically shows
 * their Health ID (or National ID-recovered key) to.
 */

export async function makePatientKey(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface EncryptedRecord {
  ciphertext: string;
  iv: string;
  salt: string;
}

export async function encryptRecord(
  payload: DecryptedConsultation,
  patientKey: string,
): Promise<EncryptedRecord> {
  // crypto-js's WordArray.random needs crypto.getRandomValues (absent in RN),
  // so salt + IV come from expo-crypto's native CSPRNG instead.
  const toHex = (arr: Uint8Array) =>
    Array.from(arr)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  const salt = toHex(await Crypto.getRandomBytesAsync(16));
  const ivHex = toHex(await Crypto.getRandomBytesAsync(16));
  const iv = CryptoJS.enc.Hex.parse(ivHex);
  const key = CryptoJS.SHA256(patientKey + salt);
  const ciphertext = CryptoJS.AES.encrypt(JSON.stringify(payload), key, { iv }).toString();
  return { ciphertext, iv: ivHex, salt };
}

export function decryptRecord(
  record: EncryptedRecord,
  patientKey: string,
): DecryptedConsultation | null {
  try {
    const key = CryptoJS.SHA256(patientKey + record.salt);
    const bytes = CryptoJS.AES.decrypt(record.ciphertext, key, {
      iv: CryptoJS.enc.Hex.parse(record.iv),
    });
    const text = bytes.toString(CryptoJS.enc.Utf8);
    if (!text) return null;
    return JSON.parse(text) as DecryptedConsultation;
  } catch {
    return null;
  }
}

/**
 * Generic AES-256-CBC encrypt/decrypt of an arbitrary JSON payload with a raw
 * key string. Used for follow-up messages and shared attachments, which are
 * encrypted with a per-thread key rather than the patient's master key but
 * follow the same SHA-256(key + salt) derivation.
 */
export async function encryptJson(payload: unknown, key: string): Promise<EncryptedRecord> {
  const toHex = (arr: Uint8Array) =>
    Array.from(arr)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  const salt = toHex(await Crypto.getRandomBytesAsync(16));
  const ivHex = toHex(await Crypto.getRandomBytesAsync(16));
  const iv = CryptoJS.enc.Hex.parse(ivHex);
  const derived = CryptoJS.SHA256(key + salt);
  const ciphertext = CryptoJS.AES.encrypt(JSON.stringify(payload), derived, { iv }).toString();
  return { ciphertext, iv: ivHex, salt };
}

export function decryptJson<T>(record: EncryptedRecord, key: string): T | null {
  try {
    const derived = CryptoJS.SHA256(key + record.salt);
    const bytes = CryptoJS.AES.decrypt(record.ciphertext, derived, {
      iv: CryptoJS.enc.Hex.parse(record.iv),
    });
    const text = bytes.toString(CryptoJS.enc.Utf8);
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}
