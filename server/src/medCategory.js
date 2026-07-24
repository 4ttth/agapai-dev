/**
 * Medicine → visual category resolver with caching.
 *
 * Categories are a strict, closed set (see MEDICATION_CATEGORIES) so each maps
 * to exactly one icon in the apps. Resolution order:
 *   1. Cache (MedicationCategory table) — keyed by the normalized name. Once a
 *      name has been classified, we never call the AI for it again.
 *   2. Gemini Structured Output (JSON mode) — authoritative classification.
 *   3. Keyword heuristic — offline fallback so icons still work without Gemini.
 * The resolved value is written back to the cache so the next request for the
 * same name (from any user) is a cheap DB read.
 */

import { prisma } from './db.js';
import { MEDICATION_CATEGORIES, classifyMedicationCategory, geminiEnabled } from './gemini.js';

/** Lowercase, collapse whitespace: "  Paracetamol 500mg " → "paracetamol 500mg". */
export function normalizeName(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Keyword hints, checked in priority order. Deliberately conservative — a miss
// returns null so we don't cache a bad guess over the AI's answer.
const KEYWORD_RULES = [
  ['inhaler', /\b(inhaler|inhalation|puff|nebule|nebul|respule|evohaler|turbuhaler|hfa|mdi)\b/],
  ['drops', /\b(eye drop|ear drop|nasal drop|drops|ophthalmic|otic|collyrium|gutt)\b/],
  ['injection', /\b(injection|injectable|inject|vial|ampoule|ampule|im|iv|subcut|sc|syringe|insulin|prefilled)\b/],
  ['cream', /\b(cream|ointment|gel|topical|lotion|balm|salve|paste|patch|suppository)\b/],
  ['liquid', /\b(syrup|suspension|solution|elixir|oral liquid|drink|sachet|tonic|liquid|ml\b)\b/],
  ['capsule', /\b(capsule|caps?|softgel|soft gel|pearl)\b/],
  ['pill', /\b(tablet|tab|caplet|pill|lozenge|chewable|effervescent|sublingual|mg\b)\b/],
];

/** Best-effort category from the name alone; null when nothing matches. */
export function keywordCategory(name) {
  const n = normalizeName(name);
  if (!n) return null;
  for (const [category, re] of KEYWORD_RULES) {
    if (re.test(n)) return category;
  }
  return null;
}

async function readCache(key) {
  try {
    const row = await prisma.medicationCategory.findUnique({ where: { name: key } });
    return row?.category ?? null;
  } catch {
    return null;
  }
}

async function writeCache(key, displayName, category, source) {
  try {
    await prisma.medicationCategory.upsert({
      where: { name: key },
      update: { category, source },
      create: { name: key, displayName, category, source },
    });
  } catch {
    // A cache write failure must never break classification.
  }
}

/**
 * Resolve a medicine name to a category.
 * @param {string} name
 * @param {{ cacheOnly?: boolean }} [opts] cacheOnly skips the Gemini call (used
 *   for the medication list, which must stay fast) — cache + keyword only.
 * @returns {Promise<{ category: string, source: 'cache'|'gemini'|'keyword' }>}
 */
export async function resolveCategory(name, { cacheOnly = false } = {}) {
  const key = normalizeName(name);
  if (!key) return { category: 'other', source: 'keyword' };

  const cached = await readCache(key);
  if (cached && MEDICATION_CATEGORIES.includes(cached)) return { category: cached, source: 'cache' };

  if (!cacheOnly && geminiEnabled()) {
    try {
      const category = await classifyMedicationCategory(key);
      await writeCache(key, name, category, 'gemini');
      return { category, source: 'gemini' };
    } catch (err) {
      console.error('[medcat] Gemini classify failed, using keyword:', err.message);
    }
  }

  const guess = keywordCategory(key);
  if (guess) {
    // Cache keyword hits too — a confident keyword match is stable, and it lets
    // the fast list path serve it later without re-deriving.
    if (!cacheOnly) await writeCache(key, name, guess, 'keyword');
    return { category: guess, source: 'keyword' };
  }
  return { category: 'other', source: 'keyword' };
}

/**
 * Warm the cache for a name in the background (fire-and-forget). Used when a
 * doctor prescribes or a pharmacist dispenses, so the patient's medication list
 * later reads an AI-classified category straight from the cache.
 */
export function warmCategory(name) {
  if (!normalizeName(name)) return;
  void resolveCategory(name).catch(() => {});
}
