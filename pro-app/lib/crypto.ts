import CryptoJS from 'crypto-js';

/**
 * Client-side consultation encryption (mirror of the patient app's utils/crypto).
 * AES-256-CBC with a key derived from SHA-256(patientKey + salt). The patient
 * key comes ONLY from the scanned Health ID QR — it is never uploaded, so the
 * server stores ciphertext it can never read.
 */

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

export function encryptRecord(payload: DecryptedConsultation, patientKey: string) {
  const salt = CryptoJS.lib.WordArray.random(16).toString();
  const iv = CryptoJS.lib.WordArray.random(16);
  const key = CryptoJS.SHA256(patientKey + salt);
  const ciphertext = CryptoJS.AES.encrypt(JSON.stringify(payload), key, { iv }).toString();
  return { ciphertext, iv: iv.toString(), salt };
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
