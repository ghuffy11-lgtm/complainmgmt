import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { BrandingService, type Branding } from '../services/branding.service';
import { applyPrimaryFamilyToRoot, derivePrimaryFamily } from '../lib/theme';

const FALLBACK: Branding = {
  organizationName: 'Hadi Clinic',
  systemName: 'Complaint Tracking System',
  systemShortName: 'CTS',
  loginSubtitle: 'Quality & Patient Safety',
  loginTagline: 'Sign in to continue to the portal',
  footerText: 'Internal use only · Access logged',
  primaryColor: '#2563eb',
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
  const branding = q.data ?? FALLBACK;

  // Apply the admin-picked primary family to :root whenever it changes.
  // Does nothing the first render before data lands — the stylesheet's own
  // :root already carries the default editorial palette, so the page paints
  // correctly until the override arrives.
  React.useEffect(() => {
    applyPrimaryFamilyToRoot(derivePrimaryFamily(branding.primaryColor));
  }, [branding.primaryColor]);

  return branding;
}

export const BRANDING_QUERY_KEY = ['branding'] as const;
