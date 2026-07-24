import CryptoJS from 'crypto-js';
import * as Crypto from 'expo-crypto';

/**
 * Client-side consultation encryption (mirror of the patient app's utils/crypto).
 * AES-256-CBC with a key derived from SHA-256(patientKey + salt). The patient
 * key comes ONLY from the scanned Health ID QR — it is never uploaded, so the
 * server stores ciphertext it can never read.
 *
 * Randomness comes from expo-crypto's native CSPRNG: crypto-js's own
 * WordArray.random needs crypto.getRandomValues, which React Native lacks
 * ("Native crypto module could not be used to get secure random number").
 */

async function randomHex(bytes: number): Promise<string> {
  const arr = await Crypto.getRandomBytesAsync(bytes);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface DecryptedConsultation {
  description: string;
  voiceB64?: string;
  prescriptions: Array<{
    name: string;
    dosage: string;
    times: string[];
    quantity?: number;
    instructions?: string;
  }>;
  rxImageB64?: string;
}

export async function encryptRecord(payload: DecryptedConsultation, patientKey: string) {
  const salt = await randomHex(16);
  const ivHex = await randomHex(16);
  const iv = CryptoJS.enc.Hex.parse(ivHex);
  const key = CryptoJS.SHA256(patientKey + salt);
  const ciphertext = CryptoJS.AES.encrypt(JSON.stringify(payload), key, { iv }).toString();
  return { ciphertext, iv: ivHex, salt };
}

export function decryptRecord(
  record: { ciphertext: string; iv: string; salt: string },
  patientKey: string,
): DecryptedConsultation | null {
  try {
    const key = CryptoJS.SHA256(patientKey + record.salt);
    const bytes = CryptoJS.AES.decrypt(record.ciphertext, key, {
      iv: CryptoJS.enc.Hex.parse(record.iv),
    });
    const text = bytes.toString(CryptoJS.enc.Utf8);
    return text ? (JSON.parse(text) as DecryptedConsultation) : null;
  } catch {
    return null;
  }
}

export interface EncryptedRecord {
  ciphertext: string;
  iv: string;
  salt: string;
}

/** Generic JSON encrypt/decrypt with a raw key — used for follow-up messages. */
export async function encryptJson(payload: unknown, key: string): Promise<EncryptedRecord> {
  const salt = await randomHex(16);
  const ivHex = await randomHex(16);
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
