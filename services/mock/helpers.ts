import { appConfig } from '@/constants';

/** Resolve after the configured mock latency to make loading states realistic. */
export function delay(ms: number = appConfig.mockLatencyMs): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Throw when the error-simulation toggle is on, to exercise UI error states. */
export function maybeFail(context: string): void {
  if (appConfig.simulateServiceError) {
    throw new Error(`Mock service error while ${context}.`);
  }
}
