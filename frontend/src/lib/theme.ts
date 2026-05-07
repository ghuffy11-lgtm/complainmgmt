/**
 * Theme helpers — derive a full primary-colour family (hover, active, bg,
 * border) from a single hex value, plus a curated preset list for the admin
 * dropdown.
 *
 * Why HSL math:
 *   The editorial palette in `:root` uses five tokens for the primary
 *   family. Asking admins to pick five hex values is a UX disaster; asking
 *   them to pick one and computing the rest is reliable enough for our
 *   needs (the variants don't need to be exact — just "darker for hover",
 *   "very pale for bg", etc.).
 */

export type ThemePreset = {
  /** Stable identifier — never user-facing. */
  key: string;
  /** Display label in the admin dropdown. */
  label: string;
  /** The single primary hex; everything else is derived. */
  primary: string;
  /** One-line description for the admin UI. */
  description?: string;
};

/** The shipped presets. Add new ones here; admins also have a `custom` slot. */
export const THEME_PRESETS: ThemePreset[] = [
  {
    key: 'editorial_blue',
    label: 'Editorial Blue',
    primary: '#2563eb',
    description: 'Default — restrained royal blue on slate.',
  },
  {
    key: 'hadi',
    label: 'Hadi',
    primary: '#13a0d5',
    description: 'Hadi brand cyan-blue.',
  },
  {
    key: 'clinical_teal',
    label: 'Clinical Teal',
    primary: '#0d9488',
    description: 'Calm, healthcare-conventional.',
  },
  {
    key: 'forest',
    label: 'Forest',
    primary: '#16a34a',
    description: 'Approachable green — wellness clinics.',
  },
  {
    key: 'slate_professional',
    label: 'Slate Professional',
    primary: '#475569',
    description: 'Monochrome — corporate, neutral.',
  },
  {
    key: 'burgundy',
    label: 'Burgundy',
    primary: '#9f1239',
    description: 'Distinctive — heritage clinics.',
  },
];

/** Look up the preset matching a stored hex (case-insensitive); null if the
 *  admin has typed a custom value. */
export function findPreset(hex: string): ThemePreset | null {
  const norm = hex.trim().toLowerCase();
  return THEME_PRESETS.find((p) => p.primary.toLowerCase() === norm) ?? null;
}

/** The full set of derived tokens written onto :root as CSS variables.
 *  Includes the primary family AND the sidebar tones — sidebar derives
 *  from the primary hue so each theme has a brand-consistent dark anchor
 *  (dark teal for Hadi, dark navy for Editorial Blue, dark forest for
 *  Forest, etc.) instead of a generic slate that doesn't tie to the
 *  brand. Sidebar text colours stay fixed (white + slate-muted) because
 *  they need to be readable on any dark background. */
export type ThemeFamily = {
  primary: string;
  primaryHover: string;
  primaryActive: string;
  primaryBg: string;
  primaryBorder: string;
  /** Sidebar background — very low lightness, modestly tinted by primary. */
  sidebar: string;
  /** Sidebar surface 2 — slightly higher lightness, used for borders/hover. */
  sidebar2: string;
  /** Sidebar accent — full primary, used for active-row highlights. */
  sidebarAccent: string;
};

/** Derive the full theme family from a single primary hex. */
export function deriveThemeFamily(hex: string): ThemeFamily {
  const { h, s, l } = hexToHsl(hex);
  // Sidebar tones: visibly tinted dark colour in the same hue family as
  // the primary, but at low lightness so white text stays legible.
  // Tuned so the sidebar reads as "dark Hadi" / "dark Forest" / etc.
  // rather than a generic slate that doesn't tie to the brand.
  // Saturation capped at 55% so very-saturated primaries don't produce a
  // shouty sidebar; lightness 22% / 28% keeps WCAG AA contrast on white
  // text comfortably (verified for every shipped preset).
  const sidebarSat = Math.min(s * 0.6, 55);
  return {
    primary: hex,
    // Hover: ~8% darker — visible but subtle.
    primaryHover: hslToHex(h, s, clamp(l - 8, 0, 100)),
    // Active: ~14% darker.
    primaryActive: hslToHex(h, s, clamp(l - 14, 0, 100)),
    // Bg: very pale tint of the primary — keeps the hue but pulls L to 96
    // and tames saturation so badge backgrounds aren't shouty.
    primaryBg: hslToHex(h, clamp(s * 0.4, 0, 100), 96),
    // Border: light tint, around L=82, mid saturation.
    primaryBorder: hslToHex(h, clamp(s * 0.6, 0, 100), 82),
    sidebar: hslToHex(h, sidebarSat, 22),
    sidebar2: hslToHex(h, sidebarSat, 28),
    sidebarAccent: hex,
  };
}

/** Apply a full theme family by overriding the CSS variables on :root.
 *  Call from a useEffect — runs whenever the branding query updates. */
export function applyThemeFamilyToRoot(family: ThemeFamily): void {
  const root = document.documentElement;
  root.style.setProperty('--primary', family.primary);
  root.style.setProperty('--primary-hover', family.primaryHover);
  root.style.setProperty('--primary-active', family.primaryActive);
  root.style.setProperty('--primary-bg', family.primaryBg);
  root.style.setProperty('--primary-border', family.primaryBorder);
  // Sidebar background tones are now driven by the static :root values in
  // styles.css (light slate). Only the accent stays brand-tinted so the
  // active-row highlight reflects the admin Branding primary.
  root.style.setProperty('--sidebar-accent', family.sidebarAccent);
}

// Re-export the old names for callers that haven't switched yet.
export const derivePrimaryFamily = deriveThemeFamily;
export const applyPrimaryFamilyToRoot = applyThemeFamilyToRoot;

// ─── colour-space helpers ─────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

/** "#abc" or "#aabbcc" → {r, g, b} 0-255. */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  const h = m[1];
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
    };
  }
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const { r, g, b } = hexToRgb(hex);
  const r1 = r / 255, g1 = g / 255, b1 = b / 255;
  const max = Math.max(r1, g1, b1), min = Math.min(r1, g1, b1);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0, s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r1: h = ((g1 - b1) / d) + (g1 < b1 ? 6 : 0); break;
      case g1: h = ((b1 - r1) / d) + 2; break;
      case b1: h = ((r1 - g1) / d) + 4; break;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100, lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lN - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60) { r1 = c; g1 = x; }
  else if (h < 120) { r1 = x; g1 = c; }
  else if (h < 180) { g1 = c; b1 = x; }
  else if (h < 240) { g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; b1 = c; }
  else { r1 = c; b1 = x; }
  const r = Math.round((r1 + m) * 255);
  const g = Math.round((g1 + m) * 255);
  const b = Math.round((b1 + m) * 255);
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}
