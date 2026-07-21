/**
 * Service registry. UI and hooks import from here — never from a concrete
 * implementation — so swapping mocks for real government APIs is a one-line
 * change per service.
 */
import { authService } from './mock/authService';
import { healthProfileService } from './mock/healthProfileService';
import { medicationService } from './mock/medicationService';

export const services = {
  auth: authService,
  medication: medicationService,
  healthProfile: healthProfileService,
} as const;

export type { AuthService, HealthProfileService, MedicationService } from './api';
