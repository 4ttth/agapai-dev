import type {
  DoseLog,
  EgovSession,
  HealthProfile,
  Medication,
  NewMedicationInput,
} from '@/types';

/**
 * Service interfaces = the seam between UI and data. The mock implementations
 * in `services/mock` satisfy these today; real eGovPH / government healthcare
 * clients drop in later with zero UI changes.
 */

export interface AuthService {
  /** Restore a persisted session on app launch, or null if signed out. */
  restore(): Promise<EgovSession | null>;
  /** Simulated eGovPH SSO / Digital ID exchange. */
  signInWithEgov(): Promise<EgovSession>;
  signOut(): Promise<void>;
}

export interface MedicationService {
  list(): Promise<Medication[]>;
  get(id: string): Promise<Medication | null>;
  add(input: NewMedicationInput): Promise<Medication>;
  update(id: string, input: NewMedicationInput): Promise<Medication>;
  remove(id: string): Promise<void>;

  /** Dose logs are how we track taken/missed intakes over time. */
  listDoseLogs(): Promise<DoseLog[]>;
  /** Insert-or-update a dose log by its (deterministic) id. */
  saveDoseLog(dose: DoseLog): Promise<void>;
}

export interface HealthProfileService {
  get(): Promise<HealthProfile>;
}
