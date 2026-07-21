import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { ScheduleForm, useMedications } from '@/features/pill-tracker';
import type { NewMedicationInput } from '@/types';

/** Add or edit a medication. Edit mode is triggered by an `id` query param. */
export default function AddMedicationScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { getMedication, addMedication, updateMedication } = useMedications();
  const [submitting, setSubmitting] = useState(false);

  const editing = id ? getMedication(id) : undefined;
  const isEdit = Boolean(editing);

  const handleSubmit = async (input: NewMedicationInput) => {
    setSubmitting(true);
    try {
      if (editing) {
        await updateMedication(editing.id, input);
      } else {
        await addMedication(input);
      }
      router.back();
    } catch {
      Alert.alert(
        'Could not save',
        'Something went wrong while saving this medicine. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: isEdit ? 'Edit medicine' : 'Add medicine' }} />
      <ScheduleForm
        medication={editing}
        submitting={submitting}
        submitLabel={isEdit ? 'Save changes' : 'Save medicine'}
        onSubmit={handleSubmit}
      />
    </Screen>
  );
}
