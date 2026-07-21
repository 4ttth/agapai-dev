import type { HealthIdPayload, ProUser } from './api';

/** In-memory handoff of the scanned patient between screens (never persisted). */
let current: { payload: HealthIdPayload; user: ProUser | null } | null = null;

export function setScannedPatient(payload: HealthIdPayload, user: ProUser | null) {
  current = { payload, user };
}

export function getScannedPatient() {
  return current;
}

export function clearScannedPatient() {
  current = null;
}
