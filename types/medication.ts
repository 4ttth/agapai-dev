import type { ISODateString, ISODateTimeString } from './common';

/**
 * The strict, closed set of visual medicine categories — small on purpose so
 * each maps to exactly one icon. Mirrors the server's MEDICATION_CATEGORIES.
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

/** Visual attributes that help patients identify a physical pill. */
export interface PillAppearance {
  /** Human-readable color, e.g. "White". */
  color: string;
  /** Hex swatch shown in the UI for quick recognition. */
  colorHex: string;
  shape: 'round' | 'oval' | 'capsule' | 'oblong' | 'other';
  /** Optional photo of the actual pill/packaging. */
  imageUri?: string;
  /** Icon category (AI-classified or keyword-derived) for the medicine glyph. */
  category?: MedicationCategory;
}

export type MedicationForm = 'tablet' | 'capsule' | 'liquid' | 'injection' | 'drops' | 'other';

/** How often the medication is taken. Drives reminder scheduling. */
export type FrequencyKind = 'once_daily' | 'twice_daily' | 'three_times_daily' | 'custom';

export interface Schedule {
  frequency: FrequencyKind;
  /** Local times of day in 24h "HH:mm" format, e.g. ["08:00", "20:00"]. */
  times: string[];
  startDate: ISODateString;
  /** Optional end date; undefined means ongoing. */
  endDate?: ISODateString;
}

export interface Medication {
  id: string;
  name: string;
  /** Amount per dose, e.g. "500". */
  dosage: string;
  /** Unit for the dosage, e.g. "mg", "ml", "tablet". */
  unit: string;
  form: MedicationForm;
  appearance: PillAppearance;
  schedule: Schedule;
  /** Free-text instructions from the doctor, e.g. "Take after meals." */
  instructions?: string;
  prescribingDoctor?: string;
  createdAt: ISODateTimeString;
}

export type DoseStatus = 'pending' | 'taken' | 'missed';

/** A single scheduled intake of a medication on a specific day/time. */
export interface DoseLog {
  id: string;
  medicationId: string;
  /** The scheduled datetime for this dose. */
  scheduledAt: ISODateTimeString;
  status: DoseStatus;
  /** When the user confirmed intake (only for status "taken"). */
  takenAt?: ISODateTimeString;
}

/** A dose joined with its medication for rendering in lists. */
export interface DoseWithMedication {
  dose: DoseLog;
  medication: Medication;
}

/** Input shape for creating a medication (id/createdAt assigned by the service). */
export type NewMedicationInput = Omit<Medication, 'id' | 'createdAt'>;
