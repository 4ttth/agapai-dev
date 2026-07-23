/** Namespaced AsyncStorage keys. Bump the version suffix on breaking schema changes. */
const NS = 'agapai';
const V = 'v1';

export const storageKeys = {
  session: `${NS}:${V}:session`,
  medications: `${NS}:${V}:medications`,
  doseLogs: `${NS}:${V}:doseLogs`,
  healthProfile: `${NS}:${V}:healthProfile`,
  notificationPrefs: `${NS}:${V}:notificationPrefs`,
} as const;

export type StorageKey = (typeof storageKeys)[keyof typeof storageKeys];
