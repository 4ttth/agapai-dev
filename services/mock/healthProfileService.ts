import { storageKeys } from '@/constants';
import type { HealthProfileService } from '@/services/api';
import type { HealthProfile } from '@/types';
import { readJson, writeJson } from '@/utils/storage';
import { delay } from './helpers';
import { seedHealthProfile } from './seed';

/** Mock Universal Health Profile source. Seeds on first read. */
export const healthProfileService: HealthProfileService = {
  async get() {
    await delay(300);
    const existing = await readJson<HealthProfile | null>(storageKeys.healthProfile, null);
    if (existing) return existing;
    const seeded = seedHealthProfile();
    await writeJson(storageKeys.healthProfile, seeded);
    return seeded;
  },
};
