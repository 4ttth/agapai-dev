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

export function encryptRecord(payload: DecryptedConsultation, patientKey: string): EncryptedRecord {
  const salt = CryptoJS.lib.WordArray.random(16).toString();
  const iv = CryptoJS.lib.WordArray.random(16);
  const key = CryptoJS.SHA256(patientKey + salt);
  const ciphertext = CryptoJS.AES.encrypt(JSON.stringify(payload), key, { iv }).toString();
  return { ciphertext, iv: iv.toString(), salt };
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
