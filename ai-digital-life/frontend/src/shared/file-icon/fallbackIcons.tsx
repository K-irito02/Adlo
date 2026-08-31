import React from 'react';
import { make, type IconComponent } from '@icons/helper';

/**
 * Fallback SVG icons for file extensions not covered by
 * react-symbols or react-file-icon.
 *
 * These are cold/niche extensions that rarely appear.
 * Uses the project's existing SVG icon convention (currentColor, 24x24 viewBox).
 */

/* Generic file with question mark — unknown extension fallback */
export const IconFallbackUnknown = make(
  <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
    <path d="M14 3v6h6" />
    <path d="M12 13v1" />
    <path d="M12 16v.01" />
  </>,
);

/* Script/batch file — for hta, pif, scr, wsf, com */
export const IconFallbackScript = make(
  <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
    <path d="M14 3v6h6" />
    <path d="M9 15l2 2 3-4" />
  </>,
);

/* Config file — for conf, jsonc */
export const IconFallbackConfig = make(
  <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
    <path d="M14 3v6h6" />
    <circle cx="12" cy="15" r="2" />
    <path d="M12 11.5v1" />
    <path d="M12 17.5v1" />
  </>,
);

/** Map of cold/niche extensions to fallback icon components */
// eslint-disable-next-line react-refresh/only-export-components
export const FALLBACK_EXTENSION_MAP: Record<string, IconComponent> = {
  hta: IconFallbackScript,
  pif: IconFallbackScript,
  scr: IconFallbackScript,
  wsf: IconFallbackScript,
  com: IconFallbackScript,
  conf: IconFallbackConfig,
  jsonc: IconFallbackConfig,
};
