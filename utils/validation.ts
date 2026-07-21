import type { NewMedicationInput } from '@/types';
import { parseTimeOfDay } from './datetime';

export type ValidationErrors<T> = Partial<Record<keyof T, string>>;

export interface MedicationFormValues {
  name: string;
  dosage: string;
  unit: string;
  times: string[];
  instructions?: string;
}

/**
 * Validate the add/edit medication form. Messages are plain-language and
 * specific so older users know exactly what to fix.
 */
export function validateMedicationForm(
  values: MedicationFormValues,
): ValidationErrors<MedicationFormValues> {
  const errors: ValidationErrors<MedicationFormValues> = {};

  if (!values.name.trim()) {
    errors.name = 'Please enter the medicine name.';
  } else if (values.name.trim().length < 2) {
    errors.name = 'The medicine name looks too short.';
  }

  if (!values.dosage.trim()) {
    errors.dosage = 'Please enter the dose amount (for example, 500).';
  } else if (!/^\d+(\.\d+)?$/.test(values.dosage.trim())) {
    errors.dosage = 'Please enter numbers only for the dose amount.';
  }

  if (!values.unit.trim()) {
    errors.unit = 'Please choose a unit (for example, mg).';
  }

  if (values.times.length === 0) {
    errors.times = 'Please add at least one reminder time.';
  } else if (values.times.some((t) => parseTimeOfDay(t) === null)) {
    errors.times = 'One of the reminder times is not valid.';
  }

  return errors;
}

export function isFormValid<T>(errors: ValidationErrors<T>): boolean {
  return Object.keys(errors).length === 0;
}

/** Very light phone check for the emergency-contact field. */
export function isLikelyPhone(value: string): boolean {
  return /^\+?[0-9\s-]{7,15}$/.test(value.trim());
}

export type { NewMedicationInput };
