import type { MedicationForm, PillAppearance } from '@/types';

/** Common dosage units offered as chips to minimize typing. */
export const unitOptions = ['mg', 'ml', 'tablet', 'capsule', 'IU', 'drops', 'puff'] as const;

export const medicationFormOptions: { value: MedicationForm; label: string }[] = [
  { value: 'tablet', label: 'Tablet' },
  { value: 'capsule', label: 'Capsule' },
  { value: 'liquid', label: 'Liquid' },
  { value: 'drops', label: 'Drops' },
  { value: 'injection', label: 'Injection' },
  { value: 'other', label: 'Other' },
];

export const shapeOptions: { value: PillAppearance['shape']; label: string }[] = [
  { value: 'round', label: 'Round' },
  { value: 'oval', label: 'Oval' },
  { value: 'capsule', label: 'Capsule' },
  { value: 'oblong', label: 'Oblong' },
  { value: 'other', label: 'Other' },
];

export const colorOptions: { name: string; hex: string }[] = [
  { name: 'White', hex: '#F3F4F6' },
  { name: 'Yellow', hex: '#F7E7A6' },
  { name: 'Orange', hex: '#F6C48B' },
  { name: 'Pink', hex: '#F4C2CE' },
  { name: 'Red', hex: '#E9A19B' },
  { name: 'Blue', hex: '#A9C6EC' },
  { name: 'Green', hex: '#AEDAB9' },
  { name: 'Brown', hex: '#CBB39A' },
];
