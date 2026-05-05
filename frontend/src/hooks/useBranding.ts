import { useQuery } from '@tanstack/react-query';
import { BrandingService, type Branding } from '../services/branding.service';

const FALLBACK: Branding = {
  organizationName: 'Hadi Clinic',
  systemName: 'Complaint Tracking System',
  systemShortName: 'CTS',
  loginSubtitle: 'Quality & Patient Safety',
  loginTagline: 'Sign in to continue to the portal',
  footerText: 'Internal use only · Access logged',
  logoUrl: null,
  logoUpdatedAt: null,
};

/**
 * Reads branding from the public endpoint. Cached for 5 min — admin
 * Settings invalidates the `['branding']` query on save so a freshly
 * edited string lands without a hard refresh.
 *
 * Falls back to a sensible default while the request is in flight, so
 * the login page renders something the moment it mounts.
 */
export function useBranding(): Branding {
  const q = useQuery({
    queryKey: ['branding'],
    queryFn: () => BrandingService.get(),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  return q.data ?? FALLBACK;
}

export const BRANDING_QUERY_KEY = ['branding'] as const;
