/**
 * Tiny inline-SVG icon set. Hand-rolled so we don't pull a 200KB icon
 * library for the dozen glyphs the app needs. All paths are 24x24,
 * stroke-based, currentColor — sized via `size` prop, coloured via CSS.
 */

import type { CSSProperties } from 'react';

type IconProps = {
  size?: number;
  style?: CSSProperties;
  'aria-label'?: string;
};

const wrap = (path: React.ReactNode) => (props: IconProps) => (
  <svg
    width={props.size ?? 16}
    height={props.size ?? 16}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0, ...props.style }}
    aria-label={props['aria-label']}
    role={props['aria-label'] ? 'img' : 'presentation'}
  >
    {path}
  </svg>
);

export const IconDashboard = wrap(
  <>
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
  </>,
);

export const IconClipboard = wrap(
  <>
    <rect x="8" y="3" width="8" height="4" rx="1" />
    <path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2" />
    <path d="M9 12h6M9 16h4" />
  </>,
);

export const IconShield = wrap(
  <path d="M12 3l8 3v6c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V6l8-3z" />,
);

export const IconChevronRight = wrap(<path d="M9 6l6 6-6 6" />);

export const IconX = wrap(<path d="M18 6L6 18M6 6l12 12" />);

export const IconLock = wrap(
  <>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </>,
);

export const IconUser = wrap(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </>,
);

export const IconLogOut = wrap(
  <>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </>,
);

export const IconKey = wrap(
  <>
    <circle cx="8" cy="15" r="4" />
    <path d="M11 12l8-8 2 2-2 2 2 2-4 4" />
  </>,
);

export const IconCheck = wrap(<path d="M5 12l5 5L20 7" />);

export const IconSearch = wrap(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </>,
);

export const IconPlus = wrap(<path d="M12 5v14M5 12h14" />);

export const IconTrash = wrap(
  <>
    <path d="M3 6h18" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
  </>,
);

export const IconDownload = wrap(
  <>
    <path d="M12 3v12" />
    <path d="M7 10l5 5 5-5" />
    <path d="M5 21h14" />
  </>,
);

export const IconEye = wrap(
  <>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </>,
);

export const IconAlert = wrap(
  <>
    <path d="M12 3l10 18H2L12 3z" />
    <path d="M12 10v5" />
    <circle cx="12" cy="18" r="0.5" fill="currentColor" />
  </>,
);
