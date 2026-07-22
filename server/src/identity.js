import crypto from 'node:crypto';

/**
 * Normalization + fuzzy matching for eVerify (PhilSys) identities.
 * Registration identities come only from eVerify; profile editing requires the
 * scanned National ID to match the stored Health ID at >= 70%.
 */

const clean = (s) =>
  String(s ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Map an eVerify qr/check payload (field names vary slightly) to our shape. */
export function normalizeIdentity(data) {
  const d = data ?? {};
  const pick = (...keys) => {
    for (const k of keys) if (d[k] != null && String(d[k]).trim() !== '') return String(d[k]).trim();
    return null;
  };
  const firstName = pick('first_name', 'firstName', 'given_name');
  const lastName = pick('last_name', 'lastName', 'family_name', 'surname');
  const middleName = pick('middle_name', 'middleName');
  const suffix = pick('suffix', 'name_suffix');
  const birthDate = pick('birth_date', 'birthDate', 'date_of_birth', 'dob');
  const stable =
    pick('reference', 'pcn', 'token', 'code') ??
    crypto
      .createHash('sha256')
      .update(`${clean(firstName)}|${clean(lastName)}|${clean(birthDate)}`)
      .digest('hex')
      .slice(0, 24);
  if (!firstName || !lastName) return null;
  return {
    uniqid: `EVERIFY-${stable}`,
    firstName,
    middleName,
    lastName,
    suffix,
    birthDate,
    mobile: pick('mobile_number', 'mobile', 'phone'),
    bloodType: pick('blood_type', 'bloodType'),
    gender: pick('gender', 'sex'),
  };
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

const similarity = (a, b) => {
  const ca = clean(a);
  const cb = clean(b);
  if (!ca && !cb) return 1;
  if (!ca || !cb) return 0;
  return 1 - levenshtein(ca, cb) / Math.max(ca.length, cb.length);
};

/**
 * Weighted match between a stored user and an eVerify identity, 0–100.
 * Weights: first + last name carry most, then birth date, then middle name.
 * Fields the stored record lacks are excluded so they can't drag the score.
 */
export function matchScore(user, identity) {
  const parts = [
    [user.firstName, identity.firstName, 3],
    [user.lastName, identity.lastName, 3],
    [user.middleName, identity.middleName, 1.5],
    [user.birthDate, identity.birthDate, 2.5],
  ];
  let total = 0;
  let weight = 0;
  for (const [ours, theirs, w] of parts) {
    if (!clean(ours)) continue;
    total += similarity(ours, theirs) * w;
    weight += w;
  }
  if (weight === 0) return 0;
  return Math.round((total / weight) * 100);
}
