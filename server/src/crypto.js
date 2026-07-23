import crypto from 'node:crypto';

/**
 * Symmetric encryption helpers for data the server must store but keep
 * confidential at rest: the patient's full PII record and the escrowed
 * consultation key.
 *
 * AES-256-GCM. A key string is normalised to 32 bytes: a 64-char hex string is
 * used verbatim, otherwise it is SHA-256'd so any passphrase becomes a valid
 * key. The output is a self-describing { ciphertext, iv, tag } triple.
 */

function keyBytes(secret) {
  const s = String(secret ?? '');
  if (/^[0-9a-fA-F]{64}$/.test(s)) return Buffer.from(s, 'hex');
  return crypto.createHash('sha256').update(s).digest();
}

export function encryptWith(secret, plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBytes(secret), iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return {
    ciphertext: enc.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptWith(secret, record) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    keyBytes(secret),
    Buffer.from(record.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return dec.toString('utf8');
}

// The key that decrypts patient PII. Defaults to the project key so a fresh
// deploy works, but override PII_ENCRYPTION_KEY in production.
export const PII_KEY = () => process.env.PII_ENCRYPTION_KEY || 'ZIytXzrLVvowfQUVNCESIjabomRluQPh';

// The key that wraps escrowed patient consultation keys.
export const ESCROW_KEY = () => process.env.KEY_ESCROW_SECRET || process.env.TOKEN_SECRET || 'dev-escrow-secret';

export const encryptPii = (obj) => encryptWith(PII_KEY(), JSON.stringify(obj));
export const decryptPii = (record) => JSON.parse(decryptWith(PII_KEY(), record));

export const wrapKey = (patientKey) => encryptWith(ESCROW_KEY(), patientKey);
export const unwrapKey = (record) => decryptWith(ESCROW_KEY(), record);
