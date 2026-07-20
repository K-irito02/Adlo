import React from 'react';
import { make, type IconProps } from './helper';
import { IconFileBadge } from './file';

export type FileBadgeVariant =
  | 'typescript'
  | 'javascript'
  | 'python'
  | 'systems'
  | 'markup'
  | 'style'
  | 'data'
  | 'script'
  | 'config'
  | 'doc'
  | 'text'
  | 'sheet'
  | 'slide'
  | 'image'
  | 'audio'
  | 'video'
  | 'archive'
  | 'database'
  | 'font'
  | 'badge';

/* ── Programming Languages ────────────────────────────── */

/* TypeScript — Shield: suggests type safety / protection */
export const IconBadgeTypescript = make(<path d="M8 3 h8 l4 4 v5 Q20 18 12 22 Q4 18 4 12 V7 Z" />);

/* JavaScript — Diamond: suggests dynamic / versatile / precious */
export const IconBadgeJavascript = make(<path d="M12 4 L20 12 L12 20 L4 12 Z" />);

/* Python — Double wave: symbolic snake/helix pattern */
export const IconBadgePython = make(
  <>
    <path d="M4 9 Q9 2 12 9 T20 7" />
    <path d="M4 15 Q9 22 12 15 T20 17" />
  </>,
);

/* Systems — Concentric circles: suggests core / fundamental */
export const IconBadgeSystems = make(
  <>
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="2.5" />
  </>,
);

/* ── Web & Data ───────────────────────────────────────── */

/* Markup — Angle brackets < > : HTML / XML / template syntax */
export const IconBadgeMarkup = make(
  <>
    <path d="M8 5 L3 12 8 19" />
    <path d="M16 5 L21 12 16 19" />
  </>,
);

/* Style — Hash # : CSS selector / stylesheet */
export const IconBadgeStyle = make(
  <>
    <path d="M8 7 h8" />
    <path d="M7 12 h10" />
    <path d="M9.5 4 v14" />
    <path d="M14.5 4 v14" />
  </>,
);

/* Data — Curly braces { } : JSON / data serialization */
export const IconBadgeData = make(
  <>
    <path d="M10 6 Q6 6 6 12 Q6 18 10 18" />
    <path d="M6 12 h3" />
    <path d="M14 6 Q18 6 18 12 Q18 18 14 18" />
    <path d="M15 12 h3" />
  </>,
);

/* Script — Prompt > : shell / terminal script */
export const IconBadgeScript = make(<path d="M8 7 L4 12 8 17" />);

/* ── Config & Documents ───────────────────────────────── */

/* Config — Slider control */
export const IconBadgeConfig = make(
  <>
    <path d="M4 12 h16" />
    <circle cx="12" cy="12" r="3" />
  </>,
);

/* Doc — Page with folded corner */
export const IconBadgeDoc = make(
  <>
    <path d="M6 4 a2 2 0 0 1 2-2 h8 l4 4 v14 a2 2 0 0 1-2 2 H8 a2 2 0 0 1-2-2 Z" />
    <path d="M16 4 v4 h4" />
  </>,
);

/* Text — Page with stacked content lines */
export const IconBadgeText = make(
  <>
    <path d="M6 4 a2 2 0 0 1 2-2 h8 l4 4 v14 a2 2 0 0 1-2 2 H8 a2 2 0 0 1-2-2 Z" />
    <path d="M16 4 v4 h4" />
    <path d="M8 11 h8" />
    <path d="M8 15 h6" />
  </>,
);

/* ── Office & Media ───────────────────────────────────── */

/* Sheet — Grid / table for spreadsheets */
export const IconBadgeSheet = make(
  <>
    <path d="M7 6 h10 v12 H7 Z" />
    <path d="M7 12 h10" />
    <path d="M12 6 v12" />
  </>,
);

/* Slide — Presentation screen with stand */
export const IconBadgeSlide = make(
  <>
    <rect x="6" y="5" width="12" height="9" rx="1" />
    <path d="M12 14 v4" />
    <path d="M8 18 h8" />
  </>,
);

/* Image — Mountain landscape with sun */
export const IconBadgeImage = make(
  <>
    <path d="M4 17 l6-10 4 6 3-4 6 8" />
    <circle cx="8" cy="5.5" r="2" />
  </>,
);

/* Audio — Single eighth note */
export const IconBadgeAudio = make(
  <>
    <circle cx="8" cy="16" r="3" />
    <path d="M11 16 V5" />
    <path d="M11 5 L20 7" />
  </>,
);

/* Video — Play triangle */
export const IconBadgeVideo = make(<path d="M7 5 L7 19 L20 12 Z" />);

/* Archive — Box with layered dividers */
export const IconBadgeArchive = make(
  <>
    <rect x="5" y="6" width="14" height="12" rx="2" />
    <path d="M8 10 h8" />
    <path d="M8 14 h5" />
  </>,
);

/* Database — Cylinder (ellipse + body) */
export const IconBadgeDatabase = make(
  <>
    <ellipse cx="12" cy="7" rx="7" ry="3" />
    <path d="M5 7 v10 a7 3 0 0 0 14 0 V7" />
  </>,
);

/* Font — Letter A */
export const IconBadgeFont = make(
  <>
    <path d="M8 18 L12 4 L16 18" />
    <path d="M10 13 h4" />
  </>,
);

/* ── Resolver ─────────────────────────────────────────── */

const ICON_MAP: Record<FileBadgeVariant, React.ComponentType<IconProps>> = {
  typescript: IconBadgeTypescript,
  javascript: IconBadgeJavascript,
  python: IconBadgePython,
  systems: IconBadgeSystems,
  markup: IconBadgeMarkup,
  style: IconBadgeStyle,
  data: IconBadgeData,
  script: IconBadgeScript,
  config: IconBadgeConfig,
  doc: IconBadgeDoc,
  text: IconBadgeText,
  sheet: IconBadgeSheet,
  slide: IconBadgeSlide,
  image: IconBadgeImage,
  audio: IconBadgeAudio,
  video: IconBadgeVideo,
  archive: IconBadgeArchive,
  database: IconBadgeDatabase,
  font: IconBadgeFont,
  badge: IconFileBadge,
};

export function FileBadgeIcon({ variant, ...props }: { variant: FileBadgeVariant } & IconProps) {
  const Icon = ICON_MAP[variant];
  return <Icon {...props} />;
}
