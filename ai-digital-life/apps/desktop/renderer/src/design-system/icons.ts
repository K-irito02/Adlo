/**
 * SVG icon registry.
 *
 * Rules (mirrors design-system/icons spec):
 *   - SVG only, never emoji.
 *   - All icons share viewBox 0 0 24 24 and use `currentColor`.
 *   - Stroke width 2, line caps round.
 *   - Each icon is a small string the renderer can interpolate via `raw()`.
 *
 * Add new icons by extending the `ICON_PATHS` table. Tree-shake friendly:
 * unused icons remain string literals on the registry, but the
 * `renderIcon()` helper only emits the requested one.
 */

import { raw, type RawHtml } from "./html";

export type IconName =
  | "home"
  | "folder"
  | "search"
  | "tasks"
  | "logs"
  | "settings"
  | "bell"
  | "info"
  | "check"
  | "close"
  | "alert-triangle"
  | "alert-octagon"
  | "shield"
  | "refresh"
  | "play"
  | "pause"
  | "git-branch"
  | "moon"
  | "sun"
  | "monitor"
  | "palette"
  | "keyboard"
  | "external-link"
  | "chevron-right"
  | "chevron-down";

export type IconSize = "xs" | "sm" | "md" | "lg" | "xl";

const ICON_PATHS: Record<IconName, string> = {
  home: '<path d="M3 12 12 4l9 8" /><path d="M5 10v10h14V10" />',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />',
  search: '<circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />',
  tasks:
    '<path d="M9 6h11" /><path d="M9 12h11" /><path d="M9 18h11" /><path d="m4 6 1.5 1.5L8 5" /><path d="m4 12 1.5 1.5L8 11" /><path d="m4 18 1.5 1.5L8 17" />',
  logs:
    '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /><path d="M8 13h8" /><path d="M8 17h6" />',
  settings:
    '<circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />',
  info: '<circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />',
  check: '<path d="m5 12 5 5L20 7" />',
  close: '<path d="M6 6 18 18" /><path d="M18 6 6 18" />',
  "alert-triangle":
    '<path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" />',
  "alert-octagon":
    '<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" /><path d="M12 8v4" /><path d="M12 16h.01" />',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" />',
  play: '<polygon points="5 3 19 12 5 21 5 3" />',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" />',
  "git-branch":
    '<line x1="6" x2="6" y1="3" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />',
  moon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />',
  sun:
    '<circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m4.93 19.07 1.41-1.41" /><path d="m17.66 6.34 1.41-1.41" />',
  monitor:
    '<rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" x2="16" y1="21" y2="21" /><line x1="12" x2="12" y1="17" y2="21" />',
  palette:
    '<circle cx="13.5" cy="6.5" r=".5" /><circle cx="17.5" cy="10.5" r=".5" /><circle cx="8.5" cy="7.5" r=".5" /><circle cx="6.5" cy="12.5" r=".5" /><path d="M12 2a10 10 0 0 0 0 20 4 4 0 0 0 4-4v-1.5a2.5 2.5 0 0 1 2.5-2.5H21a1 1 0 0 0 1-1A10 10 0 0 0 12 2Z" />',
  keyboard:
    '<rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01" /><path d="M10 10h.01" /><path d="M14 10h.01" /><path d="M18 10h.01" /><path d="M6 14h.01" /><path d="M18 14h.01" /><path d="M8 14h8" />',
  "external-link":
    '<path d="M15 3h6v6" /><path d="M10 14 21 3" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />',
  "chevron-right": '<path d="m9 18 6-6-6-6" />',
  "chevron-down": '<path d="m6 9 6 6 6-6" />'
};

export interface RenderIconOptions {
  size?: IconSize;
  className?: string;
  title?: string;
  decorative?: boolean;
}

const SIZE_CLASS: Record<IconSize, string> = {
  xs: "icon--xs",
  sm: "icon--sm",
  md: "icon--md",
  lg: "icon--lg",
  xl: "icon--xl"
};

/**
 * Render a registered icon as a `RawHtml` SVG. The SVG inherits the
 * surrounding text color via `currentColor`.
 *
 * Always provide either `title` (announced by screen readers) or
 * `decorative: true` (hidden from the a11y tree).
 */
export function renderIcon(name: IconName, options: RenderIconOptions = {}): RawHtml {
  const { size = "md", className, title, decorative = false } = options;
  const path = ICON_PATHS[name];

  if (!path) {
    return raw("");
  }

  const a11yAttrs = decorative
    ? 'aria-hidden="true" focusable="false"'
    : title
      ? `role="img" aria-label="${title.replace(/"/g, "&quot;")}"`
      : 'aria-hidden="true" focusable="false"';

  const cssClasses = ["icon", SIZE_CLASS[size], className].filter(Boolean).join(" ");

  return raw(
    `<svg class="${cssClasses}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${a11yAttrs}>${path}</svg>`
  );
}

export function listIcons(): IconName[] {
  return Object.keys(ICON_PATHS) as IconName[];
}
