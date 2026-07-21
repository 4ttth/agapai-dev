import { useMemo, useState } from 'react';

import type {
  FrequencyKind,
  Medication,
  MedicationForm as MedForm,
  NewMedicationInput,
  PillAppearance,
} from '@/types';
import { defaultTimesForFrequency, parseTimeOfDay, todayString } from '@/utils/datetime';
import { validateMedicationForm, type ValidationErrors } from '@/utils/validation';
import { colorOptions } from './options';

export interface MedicationFormState {
  name: string;
  dosage: string;
  unit: string;
  form: MedForm;
  frequency: FrequencyKind;
  times: string[];
  colorName: string;
  colorHex: string;
  shape: PillAppearance['shape'];
  instructions: string;
  doctor: string;
}

type FormErrors = ValidationErrors<{ name: string; dosage: string; unit: string; times: string[] }>;

function initialState(medication?: Medication): MedicationFormState {
  if (medication) {
    return {
      name: medication.name,
      dosage: medication.dosage,
      unit: medication.unit,
      form: medication.form,
      frequency: medication.schedule.frequency,
      times: medication.schedule.times,
      colorName: medication.appearance.color,
      colorHex: medication.appearance.colorHex,
      shape: medication.appearance.shape,
      instructions: medication.instructions ?? '',
      doctor: medication.prescribingDoctor ?? '',
    };
  }
  return {
    name: '',
    dosage: '',
    unit: 'mg',
    form: 'tablet',
    frequency: 'once_daily',
    times: [...defaultTimesForFrequency.once_daily],
    colorName: colorOptions[0].name,
    colorHex: colorOptions[0].hex,
    shape: 'round',
    instructions: '',
    doctor: '',
  };
}

/** Clamp minutes into 0..1439 and format back to "HH:mm". */
function shiftTime(time: string, deltaMinutes: number): string {
  const tod = parseTimeOfDay(time) ?? { hours: 8, minutes: 0 };
  let total = (tod.hours * 60 + tod.minutes + deltaMinutes) % 1440;
  if (total < 0) total += 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Encapsulates all add/edit form state, validation, and the mapping to a
 * `NewMedicationInput`. Keeps the screen component declarative.
 */
export function useMedicationForm(medication?: Medication) {
  const [state, setState] = useState<MedicationFormState>(() => initialState(medication));
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const set = <K extends keyof MedicationFormState>(key: K, value: MedicationFormState[K]) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const selectFrequency = (frequency: FrequencyKind) => {
    if (frequency === 'custom') {
      set('frequency', 'custom');
      return;
    }
    setState((prev) => ({
      ...prev,
      frequency,
      times: [...defaultTimesForFrequency[frequency]],
    }));
  };

  const adjustTime = (index: number, deltaMinutes: number) => {
    setState((prev) => {
      const times = prev.times.map((t, i) => (i === index ? shiftTime(t, deltaMinutes) : t));
      return { ...prev, times, frequency: 'custom' };
    });
  };

  const addTime = () => setState((prev) => ({ ...prev, times: [...prev.times, '12:00'], frequency: 'custom' }));

  const removeTime = (index: number) =>
    setState((prev) => ({
      ...prev,
      times: prev.times.filter((_, i) => i !== index),
      frequency: 'custom',
    }));

  const setColor = (name: string, hex: string) => setState((prev) => ({ ...prev, colorName: name, colorHex: hex }));

  const currentErrors = useMemo(
    () =>
      validateMedicationForm({
        name: state.name,
        dosage: state.dosage,
        unit: state.unit,
        times: state.times,
        instructions: state.instructions,
      }),
    [state],
  );

  const isValid = Object.keys(currentErrors).length === 0;

  const buildInput = (): NewMedicationInput => ({
    name: state.name.trim(),
    dosage: state.dosage.trim(),
    unit: state.unit,
    form: state.form,
    appearance: { color: state.colorName, colorHex: state.colorHex, shape: state.shape },
    schedule: {
      frequency: state.frequency,
      times: [...state.times].sort(),
      startDate: medication?.schedule.startDate ?? todayString(),
      endDate: medication?.schedule.endDate,
    },
    instructions: state.instructions.trim() || undefined,
    prescribingDoctor: state.doctor.trim() || undefined,
  });

  /** Validate; returns the built input when valid, otherwise null and surfaces errors. */
  const validate = (): NewMedicationInput | null => {
    setSubmitAttempted(true);
    setErrors(currentErrors);
    return isValid ? buildInput() : null;
  };

  // Only show errors after a submit attempt to avoid nagging as the user types.
  const visibleErrors = submitAttempted ? currentErrors : errors;

  return {
    state,
    set,
    errors: visibleErrors,
    isValid,
    selectFrequency,
    adjustTime,
    addTime,
    removeTime,
    setColor,
    validate,
  };
}
