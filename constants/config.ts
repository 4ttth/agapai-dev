/** App-wide configuration and mock toggles. */
export const appConfig = {
  appName: 'AgapAI',
  tagline: 'Your health, made simple',
  /** Simulated latency (ms) for mock services so loading states are realistic. */
  mockLatencyMs: 600,
  /**
   * Flip to true to make mock services reject, exercising error states in the UI.
   * Handy for manual QA and screenshots.
   */
  simulateServiceError: false,
} as const;
