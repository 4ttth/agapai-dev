import type { Ionicons } from '@expo/vector-icons';

import type { DoseStatus } from '@/types';

type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

interface StatusPresentation {
  label: string;
  tone: BadgeTone;
  icon: keyof typeof Ionicons.glyphMap;
}

/** Presentation mapping for a dose status — color always paired with icon + text. */
export const doseStatusPresentation: Record<DoseStatus, StatusPresentation> = {
  taken: { label: 'Taken', tone: 'success', icon: 'checkmark-circle' },
  missed: { label: 'Missed', tone: 'danger', icon: 'alert-circle' },
  pending: { label: 'Due', tone: 'primary', icon: 'time' },
};
