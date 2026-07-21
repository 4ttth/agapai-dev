/**
 * Service registry. UI and hooks import from here — never from a concrete
 * implementation — so swapping mocks for real government APIs is a one-line
 * change per service.
 */
import { syncedMedicationService } from './api/syncedMedicationService';
import { authService } from './mock/authService';
import { healthProfileService } from './mock/healthProfileService';

export const services = {
  auth: authService,
  medication: syncedMedicationService,
  healthProfile: healthProfileService,
} as const;

export type { AuthService, HealthProfileService, MedicationService } from './api';
