import { storageKeys } from '@/constants';
import type { AuthService } from '@/services/api';
import type { EgovSession } from '@/types';
import { createId } from '@/utils/id';
import { readJson, removeKeys, writeJson } from '@/utils/storage';
import { delay, maybeFail } from './helpers';

/**
 * Mocked eGovPH Single Sign-On. Returns a Digital-ID-shaped session and
 * persists it. Replace with the real SSO/OAuth exchange later — the
 * `EgovSession` contract and this interface stay the same.
 */
export const authService: AuthService = {
  async restore() {
    await delay(250);
    return readJson<EgovSession | null>(storageKeys.session, null);
  },

  async signInWithEgov() {
    await delay();
    maybeFail('signing in with eGovPH');
    const digits = String(Math.floor(1000 + Math.random() * 9000));
    const session: EgovSession = {
      digitalId: createId('egov'),
      fullName: 'Maria Dela Cruz',
      maskedId: `•••• ${digits}`,
      issuedAt: new Date().toISOString(),
      accessToken: createId('tok'),
    };
    await writeJson(storageKeys.session, session);
    return session;
  },

  async signOut() {
    await delay(200);
    await removeKeys([storageKeys.session]);
  },
};
