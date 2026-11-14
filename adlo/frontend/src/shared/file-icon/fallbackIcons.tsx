import React from 'react';
import { make, type IconComponent } from '@icons/helper';

/**
 * Fallback SVG icons for file names not covered by react-symbols or
 * react-file-icon: dotfiles / config files without a real extension, cold
 * extensions, and the generic document.
 *
 * Uses the project's existing SVG icon convention (currentColor, 24x24 viewBox,
 * strokeWidth 2). All three share the same document skeleton, so the file tree
 * reads as one family: the script and config variants add an inner glyph, while
 * the generic document keeps the bare skeleton.
 */

/* Generic document — unknown / extension-less files */
export const IconFallbackUnknown = make(
  <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
    <path d="M14 3v6h6" />
  </>,
);

/* Script / executable — hta, wsf, scr, com, pif (no dedicated library icon) */
export const IconFallbackScript = make(
  <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
    <path d="M14 3v6h6" />
    <path d="M9 15l2 2 3-4" />
  </>,
);

/* Config file — dotfiles the library has no icon for, plus conf, jsonc */
export const IconFallbackConfig = make(
  <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
    <path d="M14 3v6h6" />
    <path d="M9 13h6" />
    <path d="M9 17h4" />
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
