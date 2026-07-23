#!/usr/bin/env node
/**
 * Decrypt the encrypted patient PII store.
 *
 * Usage (from server/):
 *   node scripts/decrypt-pii.js                # every record
 *   node scripts/decrypt-pii.js <userId>       # one record
 *
 * Reads PII_ENCRYPTION_KEY from the environment (falls back to the project
 * default). Output is the plaintext JSON originally captured from eVerify.
 */
import 'dotenv/config';

import { prisma } from '../src/db.js';
import { decryptPii } from '../src/crypto.js';

async function main() {
  const userId = process.argv[2];
  const where = userId ? { userId } : {};
  const rows = await prisma.patientPII.findMany({ where });
  if (rows.length === 0) {
    console.log('No PII records found.');
    return;
  }
  const out = rows.map((r) => {
    try {
      return { userId: r.userId, capturedAt: r.createdAt, data: decryptPii(r) };
    } catch (err) {
      return { userId: r.userId, error: `decrypt failed: ${err.message}` };
    }
  });
  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
