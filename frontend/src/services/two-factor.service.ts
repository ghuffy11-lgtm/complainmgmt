import { api } from './api-client';
import type { LoginSessionResponse } from '../types/api';

export type SetupResponse = {
  provisionalSecret: string;
  otpauthUrl: string;
  qrSvg: string;
};

export type EnableResponse = {
  enrolled: true;
  backupCodes: string[];
};

export const TwoFactorService = {
  /** Generate a provisional secret + QR. Does not persist. */
  setup() {
    return api.post<SetupResponse>('/auth/2fa/setup', {}).then((r) => r.data);
  },
  /** Confirm enrollment by sending the first code; returns the 10
   *  backup codes (plaintext, ONE-TIME). */
  enable(provisionalSecret: string, code: string) {
    return api
      .post<EnableResponse>('/auth/2fa/enable', { provisionalSecret, code })
      .then((r) => r.data);
  },
  /** Login flow: exchange a challenge token + 6-digit code (or backup
   *  code) for a real session. */
  verify(challengeToken: string, code: string) {
    return api
      .post<LoginSessionResponse>('/auth/2fa/verify', { challengeToken, code })
      .then((r) => r.data);
  },
  /** Self-disable. Requires re-asserting the current password.
   *  Force-logs-out all sessions on success. */
  disable(currentPassword: string) {
    return api.post('/auth/2fa/disable', { currentPassword }).then(() => undefined);
  },
};
