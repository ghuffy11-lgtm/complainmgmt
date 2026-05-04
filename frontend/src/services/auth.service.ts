import { api } from './api-client';
import type { LoginResponse, Me } from '../types/api';

export const AuthService = {
  login(username: string, password: string) {
    return api.post<LoginResponse>('/auth/login', { username, password }).then((r) => r.data);
  },
  me() {
    return api.get<Me>('/auth/me').then((r) => r.data);
  },
  logout(refreshToken: string) {
    return api.post('/auth/logout', { refreshToken }).then(() => undefined);
  },
  changePassword(currentPassword: string, newPassword: string) {
    return api
      .post('/auth/change-password', { currentPassword, newPassword })
      .then(() => undefined);
  },
};
