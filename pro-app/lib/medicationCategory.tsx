import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { api } from './api';
import { radii } from './theme';

/**
 * Medicine → visual category for AgapAI Pro (doctor prescription entry).
 *
 * As the doctor types a medicine name we classify it into a strict, closed set
 * of categories and show a matching icon. The server does the authoritative
 * classification (Gemini Structured Output) and caches it per name; here we add
 * a debounce (no call on every keystroke) plus an in-memory cache and an
 * instant offline keyword guess so an icon shows immediately.
 */

export type MedicationCategory =
  | 'pill'
  | 'capsule'
  | 'liquid'
  | 'inhaler'
  | 'injection'
  | 'drops'
  | 'cream'
  | 'other';

type MciName = keyof typeof MaterialCommunityIcons.glyphMap;

export const categoryMeta: Record<MedicationCategory, { icon: MciName; color: string; bg: string; label: string }> = {
  pill: { icon: 'pill', color: '#0F6E6E', bg: '#DBF1F1', label: 'Tablet' },
  capsule: { icon: 'pill-multiple', color: '#6D4AA7', bg: '#EBE3F7', label: 'Capsule' },
  liquid: { icon: 'bottle-tonic', color: '#B26A00', bg: '#FBEBD0', label: 'Liquid' },
  inhaler: { icon: 'spray', color: '#0B6BB8', bg: '#DCEBFA', label: 'Inhaler' },
  injection: { icon: 'needle', color: '#C0392B', bg: '#FADBD8', label: 'Injection' },
  drops: { icon: 'eyedropper', color: '#1F8FB8', bg: '#D8EFF7', label: 'Drops' },
  cream: { icon: 'lotion', color: '#3E7D3E', bg: '#E0F0E0', label: 'Cream' },
  other: { icon: 'medical-bag', color: '#5A6472', bg: '#E7EAEF', label: 'Medicine' },
};

const KEYWORD_RULES: Array<[MedicationCategory, RegExp]> = [
  ['inhaler', /\b(inhaler|inhalation|puff|nebule|nebul|respule|evohaler|turbuhaler|hfa|mdi)\b/],
  ['drops', /\b(eye drop|ear drop|nasal drop|drops|ophthalmic|otic|collyrium|gutt)\b/],
  ['injection', /\b(injection|injectable|inject|vial|ampoule|ampule|syringe|insulin|prefilled)\b/],
  ['cream', /\b(cream|ointment|gel|topical|lotion|balm|salve|paste|patch|suppository)\b/],
  ['liquid', /\b(syrup|suspension|solution|elixir|oral liquid|drink|sachet|tonic|liquid)\b/],
  ['capsule', /\b(capsule|caps?|softgel|soft gel|pearl)\b/],
  ['pill', /\b(tablet|tab|caplet|pill|lozenge|chewable|effervescent|sublingual)\b/],
];

export function guessCategory(name: string): MedicationCategory {
  const n = String(name ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  for (const [category, re] of KEYWORD_RULES) {
    if (re.test(n)) return category;
  }
  return 'other';
}

// Shared across rows/screens for this session so a name is only fetched once.
const memCache = new Map<string, MedicationCategory>();

export function useMedicationCategory(name: string): MedicationCategory {
  const trimmed = name.trim();
  const key = trimmed.toLowerCase().replace(/\s+/g, ' ');
  const [category, setCategory] = useState<MedicationCategory>(() =>
    key ? memCache.get(key) ?? guessCategory(trimmed) : 'other',
  );

  useEffect(() => {
    if (!key) {
      setCategory('other');
      return;
    }
    const cached = memCache.get(key);
    if (cached) {
      setCategory(cached);
      return;
    }
    // Show an instant offline guess, then confirm with the server after a
    // debounce so we don't call the API on every keystroke.
    setCategory(guessCategory(trimmed));
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const res = await api<{ category: MedicationCategory }>(
          `/ai/medication-category?name=${encodeURIComponent(trimmed)}`,
        );
        if (active && res?.category) {
          memCache.set(key, res.category);
          setCategory(res.category);
        }
      } catch {
        // Keep the offline guess.
      }
    }, 600);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key, trimmed]);

  return category;
}

/** Category icon badge for a medicine name (classifies as the name changes). */
export function MedicationCategoryIcon({ name, size = 40 }: { name: string; size?: number }) {
  const category = useMedicationCategory(name);
  const meta = categoryMeta[category];
  return (
    <View
      accessible
      accessibilityLabel={`${meta.label} icon`}
      style={[styles.badge, { width: size, height: size, borderRadius: radii.md, backgroundColor: meta.bg }]}
    >
      <MaterialCommunityIcons name={meta.icon} size={size * 0.58} color={meta.color} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
});
