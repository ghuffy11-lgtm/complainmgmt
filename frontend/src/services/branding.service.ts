import { api } from './api-client';

export type Branding = {
  organizationName: string;
  systemName: string;
  systemShortName: string;
  loginSubtitle: string;
  loginTagline: string;
  footerText: string;
  /** Hex like #2563eb — frontend derives the rest of the primary palette. */
  primaryColor: string;
  /** null = no logo uploaded; render the fallback shield icon. */
  logoUrl: string | null;
  logoUpdatedAt: string | null;
};

export const BrandingService = {
  /** Public — no auth required. Used by the login page before sign-in. */
  get() {
    return api.get<Branding>('/branding').then((r) => r.data);
  },
  /** Admin — replace text settings (any subset). */
  updateText(patch: Partial<Omit<Branding, 'logoUrl' | 'logoUpdatedAt'>>) {
    return api.post('/admin/branding', patch).then(() => undefined);
  },
  /** Admin — upload a new logo. Backend caps at 1 MB. */
  uploadLogo(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    return api
      .post('/admin/branding/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then(() => undefined);
  },
  /** Admin — clear the logo (frontend will fall back to the shield icon). */
  deleteLogo() {
    return api.delete('/admin/branding/logo').then(() => undefined);
  },
};
