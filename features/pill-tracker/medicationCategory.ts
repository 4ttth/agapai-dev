import type { MaterialCommunityIcons } from '@expo/vector-icons';

import type { MedicationCategory, MedicationForm } from '@/types';

/**
 * Maps a medicine to a visual category and its icon. Categories are a strict,
 * closed set (see MedicationCategory) so every medicine gets a recognizable
 * icon — the fix for medicines showing no image at all.
 *
 * The authoritative category comes from the server (AI-classified via Gemini
 * Structured Output, then cached). This module also provides an instant,
 * offline keyword guess so an icon always shows immediately — even before the
 * server responds, and for self-added medicines.
 */

type MciName = keyof typeof MaterialCommunityIcons.glyphMap;

export const MEDICATION_CATEGORIES: MedicationCategory[] = [
  'pill',
  'capsule',
  'liquid',
  'inhaler',
  'injection',
  'drops',
  'cream',
  'other',
];

interface CategoryMeta {
  icon: MciName;
  /** Icon tint. */
  color: string;
  /** Badge background behind the icon. */
  bg: string;
  label: string;
}

/** Icon + color per category. All glyphs verified to exist in MaterialCommunityIcons. */
export const categoryMeta: Record<MedicationCategory, CategoryMeta> = {
  pill: { icon: 'pill', color: '#0F6E6E', bg: '#DBF1F1', label: 'Tablet' },
  capsule: { icon: 'pill-multiple', color: '#6D4AA7', bg: '#EBE3F7', label: 'Capsule' },
  liquid: { icon: 'bottle-tonic', color: '#B26A00', bg: '#FBEBD0', label: 'Liquid' },
  inhaler: { icon: 'spray', color: '#0B6BB8', bg: '#DCEBFA', label: 'Inhaler' },
  injection: { icon: 'needle', color: '#C0392B', bg: '#FADBD8', label: 'Injection' },
  drops: { icon: 'eyedropper', color: '#1F8FB8', bg: '#D8EFF7', label: 'Drops' },
  cream: { icon: 'lotion', color: '#3E7D3E', bg: '#E0F0E0', label: 'Cream' },
  other: { icon: 'medical-bag', color: '#5A6472', bg: '#E7EAEF', label: 'Medicine' },
};

// Keyword hints in priority order — mirrors the server's rules so the offline
// guess agrees with the AI's classification for common cases.
const KEYWORD_RULES: Array<[MedicationCategory, RegExp]> = [
  ['inhaler', /\b(inhaler|inhalation|puff|nebule|nebul|respule|evohaler|turbuhaler|hfa|mdi)\b/],
  ['drops', /\b(eye drop|ear drop|nasal drop|drops|ophthalmic|otic|collyrium|gutt)\b/],
  ['injection', /\b(injection|injectable|inject|vial|ampoule|ampule|syringe|insulin|prefilled)\b/],
  ['cream', /\b(cream|ointment|gel|topical|lotion|balm|salve|paste|patch|suppository)\b/],
  ['liquid', /\b(syrup|suspension|solution|elixir|oral liquid|drink|sachet|tonic|liquid)\b/],
  ['capsule', /\b(capsule|caps?|softgel|soft gel|pearl)\b/],
  ['pill', /\b(tablet|tab|caplet|pill|lozenge|chewable|effervescent|sublingual)\b/],
];

const FORM_TO_CATEGORY: Record<MedicationForm, MedicationCategory> = {
  tablet: 'pill',
  capsule: 'capsule',
  liquid: 'liquid',
  injection: 'injection',
  drops: 'drops',
  other: 'other',
};

/** Instant, offline best-guess from the name (and the chosen form, if any). */
export function guessCategory(name: string, form?: MedicationForm): MedicationCategory {
  const n = String(name ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  for (const [category, re] of KEYWORD_RULES) {
    if (re.test(n)) return category;
  }
  if (form && FORM_TO_CATEGORY[form]) return FORM_TO_CATEGORY[form];
  return 'other';
}

/** Resolve a medicine to its category: stored (server) value wins, else guess. */
export function resolveCategory(input: {
  name: string;
  form?: MedicationForm;
  category?: MedicationCategory;
}): MedicationCategory {
  if (input.category && MEDICATION_CATEGORIES.includes(input.category)) return input.category;
  return guessCategory(input.name, input.form);
}
