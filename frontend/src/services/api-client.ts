import axios, { AxiosError, AxiosInstance, AxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/auth-store';

const baseURL = (import.meta.env.VITE_API_BASE_URL as string) ?? '/api';

export const api: AxiosInstance = axios.create({ baseURL });

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = useAuthStore.getState().refreshToken;
  if (!refreshToken) return null;
  try {
    const resp = await axios.post<{ accessToken: string; refreshToken: string }>(
      `${baseURL}/auth/refresh`,
      { refreshToken },
    );
    useAuthStore.getState().setTokens(resp.data.accessToken, resp.data.refreshToken);
    return resp.data.accessToken;
  } catch {
    useAuthStore.getState().clear();
    return null;
  }
}

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as AxiosRequestConfig & { __retried?: boolean };
    if (error.response?.status === 401 && !original.__retried) {
      original.__retried = true;
      refreshing ??= refreshAccessToken().finally(() => (refreshing = null));
      const newToken = await refreshing;
      if (newToken) {
        original.headers = { ...(original.headers ?? {}), Authorization: `Bearer ${newToken}` };
        return api.request(original);
      }
      // Hard logout: bounce to /login
      if (typeof window !== 'undefined') window.location.href = '/login';
    }
    // 412 MUST_ENROLL_2FA → admin needs to finish 2FA enrollment before
    // any non-allow-list request will succeed. Surface a single client-side
    // event so AppLayout can pop the enrollment dialog. Don't redirect
    // hard — the user is already authenticated; we just need them to do
    // one more thing.
    if (
      error.response?.status === 412 &&
      typeof window !== 'undefined' &&
      (error.response.data as { code?: string } | null)?.code === 'MUST_ENROLL_2FA'
    ) {
      window.dispatchEvent(new CustomEvent('cts:must-enroll-2fa'));
    }
    return Promise.reject(error);
  },
);
