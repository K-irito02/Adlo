import React from "react";

/**
 * Lucide-flavored SVG icons rendered as React components.
 *
 * Rules mirrored from `design-system/icons`:
 *   - viewBox 0 0 24 24, `currentColor`, stroke-width 2, rounded caps
 *   - Never use emoji as UI icon
 *   - Sizes are constrained to tokens (12/16/20/24/32/48px)
 */

export type IconSize = 12 | 14 | 16 | 18 | 20 | 24 | 28 | 32 | 48;

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, "children"> {
  size?: IconSize;
  title?: string;
  decorative?: boolean;
}

export type IconComponent = (props: IconProps) => React.JSX.Element;

function iconProps(size: IconSize, rest: IconProps): React.SVGProps<SVGSVGElement> {
  const { title, decorative, className, ...other } = rest;
  const a11y = decorative || !title
    ? { "aria-hidden": true as const, focusable: "false" as const }
    : { role: "img" as const, "aria-label": title };
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    className: ["adl-icon", className].filter(Boolean).join(" "),
    ...a11y,
    ...other
  };
}

const make = (path: React.ReactNode): IconComponent =>
  function IconFn({ size = 16, ...rest }: IconProps) {
    return <svg {...iconProps(size, rest)}>{path}</svg>;
  };

// ---------------- Brand / Shell ----------------
export const IconLogo = make(
  <>
    <path d="M12 2 4 6v6c0 5 3.4 9 8 10 4.6-1 8-5 8-10V6l-8-4z" />
    <path d="M9 12l2 2 4-4" />
  </>
);

export const IconMenu = make(
  <>
    <path d="M3 6h18" />
    <path d="M3 12h18" />
    <path d="M3 18h18" />
  </>
);

// ---------------- Window Controls ----------------
export const IconMinus = make(<path d="M5 12h14" />);
export const IconSquare = make(<rect x="4" y="4" width="16" height="16" rx="2" />);
export const IconCopy = make(
  <>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
  </>
);
export const IconClose = make(
  <>
    <path d="M18 6 6 18" />
    <path d="M6 6l12 12" />
  </>
);

// ---------------- Panel Controls ----------------
export const IconPanelLeft = make(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18" />
  </>
);
export const IconPanelRight = make(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M15 3v18" />
  </>
);
export const IconPanelLeftClose = make(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18" />
    <path d="m16 15-3-3 3-3" />
  </>
);
export const IconPanelRightClose = make(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M15 3v18" />
    <path d="m8 9 3 3-3 3" />
  </>
);
export const IconEye = make(
  <>
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </>
);

export const IconColumns = make(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M12 3v18" />
  </>
);

export const IconExpandRows = make(
  <>
    <path d="m6 9 6-6 6 6" />
    <path d="m6 15 6 6 6-6" />
  </>
);

export const IconCollapseRows = make(
  <>
    <path d="m6 4.5 6 5 6-5" />
    <path d="m6 19.5 6-5 6 5" />
  </>
);

// ---------------- Actions ----------------
export const IconSettings = make(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </>
);
export const IconPlus = make(
  <>
    <path d="M12 5v14" />
    <path d="M5 12h14" />
  </>
);
export const IconSparkles = make(
  <>
    <path d="M12 3 14 9l6 2-6 2-2 6-2-6-6-2 6-2 2-6z" />
    <path d="M19 14l.9 2.1 2.1.9-2.1.9L19 20l-.9-2.1-2.1-.9 2.1-.9L19 14z" />
  </>
);
export const IconPlug = make(
  <>
    <path d="M9 2v5" />
    <path d="M15 2v5" />
    <path d="M18 8H6v4a6 6 0 0 0 12 0V8z" />
    <path d="M12 18v3" />
  </>
);
export const IconFolderPlus = make(
  <>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    <path d="M12 11v6" />
    <path d="M9 14h6" />
  </>
);
export const IconFolder = make(
  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
);
export const IconFolderOpen = make(
  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v2H3V7zm0 4h18l-2 7a2 2 0 0 1-2 1.5H5A2 2 0 0 1 3 17.5V11z" />
);
export const IconFiles = make(
  <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
    <path d="M14 3v6h6" />
  </>
);
export const IconFilePlus = make(
  <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
    <path d="M14 3v6h6" />
    <path d="M12 13v6" />
    <path d="M9 16h6" />
  </>
);
export const IconFileText = make(
  <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
    <path d="M14 3v6h6" />
    <path d="M8 13h8" />
    <path d="M8 17h6" />
  </>
);
export const IconFileCode = make(
  <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
    <path d="M14 3v6h6" />
    <path d="m10 11-2 2 2 2" />
    <path d="m14 11 2 2-2 2" />
  </>
);
export const IconFileCog = make(
  <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
    <path d="M14 3v6h6" />
    <circle cx="12" cy="15" r="2.25" />
    <path d="M12 11.5v1" />
    <path d="M12 17.5v1" />
    <path d="m9.4 13 0.85 0.5" />
    <path d="m13.75 15.5 0.85 0.5" />
    <path d="m14.6 13-0.85 0.5" />
    <path d="m10.25 15.5-0.85 0.5" />
  </>
);
export const IconFileMarkdown = make(
  <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
    <path d="M14 3v6h6" />
    <path d="M8 17v-5l2 2 2-2v5" />
    <path d="M14 12v5" />
    <path d="m14 17 2.5-2.5" />
    <path d="m16.5 14.5-2.5-2.5" />
  </>
);
export const IconFileSpreadsheet = make(
  <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
    <path d="M14 3v6h6" />
    <rect x="8" y="11" width="8" height="6" rx="1" />
    <path d="M8 14h8" />
    <path d="M12 11v6" />
  </>
);
export const IconFilePresentation = make(
  <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
    <path d="M14 3v6h6" />
    <path d="M8 11h8" />
    <path d="m10 17 2-3 2 3" />
    <path d="M12 14v4" />
  </>
);
export const IconFilePdf = make(
  <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
    <path d="M14 3v6h6" />
    <path d="M8 17v-5h2a1.5 1.5 0 0 1 0 3H8" />
    <path d="M13 17v-5h1.5a2 2 0 0 1 0 4H13" />
    <path d="M18 12h-2v5" />
  </>
);
export const IconFileImage = make(
  <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
    <path d="M14 3v6h6" />
    <circle cx="10" cy="12.5" r="1.2" />
    <path d="m8 17 2.5-2.5 1.8 1.8 2.7-2.7L18 17" />
  </>
);
export const IconFileAudio = make(
  <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
    <path d="M14 3v6h6" />
    <path d="M15 11v4.5a1.75 1.75 0 1 1-1-1.57V12l3-1v3.5a1.75 1.75 0 1 1-1-1.57V10z" />
  </>
);
export const IconFileVideo = make(
  <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
    <path d="M14 3v6h6" />
    <rect x="8" y="11" width="7" height="6" rx="1" />
    <path d="m15 13 3-1.5v5L15 15" />
  </>
);
export const IconFileArchive = make(
  <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
    <path d="M14 3v6h6" />
    <path d="M12 11v6" />
    <path d="M10.5 11h3" />
    <path d="M10.5 14h3" />
    <path d="M10.5 17h3" />
  </>
);
export const IconFileDatabase = make(
  <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
    <path d="M14 3v6h6" />
    <ellipse cx="12" cy="12" rx="3.5" ry="1.5" />
    <path d="M8.5 12v4c0 .8 1.6 1.5 3.5 1.5s3.5-.7 3.5-1.5v-4" />
    <path d="M8.5 14c0 .8 1.6 1.5 3.5 1.5s3.5-.7 3.5-1.5" />
  </>
);
export const IconImagePlus = make(
  <>
    <rect x="3" y="3" width="14" height="14" rx="2" />
    <circle cx="8" cy="8" r="1.5" />
    <path d="m3 15 4-4 4 4 3-3 3 3" />
    <path d="M21 6h-6" />
    <path d="M18 3v6" />
  </>
);
export const IconGlobe = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a14 14 0 0 1 0 18" />
    <path d="M12 3a14 14 0 0 0 0 18" />
  </>
);
export const IconLangZh = make(
  <>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <text
      x="12"
      y="15"
      textAnchor="middle"
      fontSize="10"
      fontWeight="700"
      fill="currentColor"
    >
      中
    </text>
  </>
);
export const IconLangEn = make(
  <>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <text
      x="12"
      y="15"
      textAnchor="middle"
      fontSize="9"
      fontWeight="700"
      fill="currentColor"
    >
      EN
    </text>
  </>
);
export const IconTerminal = make(
  <>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m6 8 4 4-4 4" />
    <path d="M12 16h6" />
  </>
);
export const IconGitBranch = make(
  <>
    <line x1="6" x2="6" y1="3" y2="15" />
    <circle cx="18" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M18 9a9 9 0 0 1-9 9" />
  </>
);
export const IconGitFork = make(
  <>
    <circle cx="12" cy="18" r="3" />
    <circle cx="6" cy="6" r="3" />
    <circle cx="18" cy="6" r="3" />
    <path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9" />
    <path d="M12 12v3" />
  </>
);
export const IconCheck = make(<path d="m5 12 5 5L20 7" />);
export const IconCheckCheck = make(
  <>
    <path d="m3 12 4 4 5-6" />
    <path d="m10 12 4 4 7-9" />
  </>
);
export const IconCheckCircle = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12 3 3 5-6" />
  </>
);
export const IconXCircle = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m9 9 6 6" />
    <path d="m15 9-6 6" />
  </>
);
export const IconAlertTriangle = make(
  <>
    <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </>
);
export const IconPause = make(
  <>
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </>
);
export const IconPlay = make(<polygon points="6 4 20 12 6 20 6 4" />);
export const IconSend = make(
  <>
    <path d="M22 2 11 13" />
    <path d="M22 2 15 22l-4-9-9-4 20-7z" />
  </>
);
export const IconArrowUp = make(
  <>
    <path d="M12 19V5" />
    <path d="m5 12 7-7 7 7" />
  </>
);
export const IconStopCircle = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <rect x="9" y="9" width="6" height="6" rx="1" />
  </>
);
export const IconRefreshCw = make(
  <>
    <path d="M21 12a9 9 0 1 1-3-6.7" />
    <path d="M21 4v5h-5" />
  </>
);
export const IconReplace = make(
  <>
    <path d="M4 7h11" />
    <path d="m12 4 3 3-3 3" />
    <path d="M20 17H9" />
    <path d="m12 14-3 3 3 3" />
  </>
);
export const IconFoldVertical = make(
  <>
    <path d="M4 5h6" />
    <path d="M14 5h6" />
    <path d="M4 12h4" />
    <path d="M16 12h4" />
    <path d="M4 19h6" />
    <path d="M14 19h6" />
    <path d="m10 9 2 3 2-3" />
    <path d="m10 15 2-3 2 3" />
  </>
);
export const IconUnfoldVertical = make(
  <>
    <path d="M4 5h6" />
    <path d="M14 5h6" />
    <path d="M4 12h4" />
    <path d="M16 12h4" />
    <path d="M4 19h6" />
    <path d="M14 19h6" />
    <path d="m10 10 2-3 2 3" />
    <path d="m10 14 2 3 2-3" />
  </>
);
export const IconLoader = make(
  <>
    <path d="M12 3v3" />
    <path d="M12 18v3" />
    <path d="M5 12H2" />
    <path d="M22 12h-3" />
    <path d="m5.6 5.6 2.1 2.1" />
    <path d="m16.3 16.3 2.1 2.1" />
    <path d="m5.6 18.4 2.1-2.1" />
    <path d="m16.3 7.7 2.1-2.1" />
  </>
);
export const IconMic = make(
  <>
    <rect x="9" y="3" width="6" height="12" rx="3" />
    <path d="M5 12a7 7 0 0 0 14 0" />
    <path d="M12 19v3" />
  </>
);
export const IconSearch = make(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>
);
export const IconPin = make(
  <>
    <path d="M12 2v7" />
    <path d="M7 9h10l-1.5 5h-7z" />
    <path d="M12 14v8" />
  </>
);
export const IconPinOff = make(
  <>
    <path d="M3 3l18 18" />
    <path d="M12 2v7" />
    <path d="M7 9h10l-1.5 5h-7z" />
    <path d="M12 14v8" />
  </>
);
export const IconEdit = make(
  <>
    <path d="M12 20h9" />
    <path d="m16.5 3.5 4 4-12 12H4.5v-4l12-12z" />
  </>
);
export const IconArchive = make(
  <>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
    <path d="M10 12h4" />
  </>
);
export const IconMail = make(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </>
);
export const IconDownload = make(
  <>
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 21h14" />
  </>
);
export const IconMoreVertical = make(
  <>
    <circle cx="12" cy="5" r="1.2" />
    <circle cx="12" cy="12" r="1.2" />
    <circle cx="12" cy="19" r="1.2" />
  </>
);
export const IconPencil = make(
  <>
    <path d="M12 20h9" />
    <path d="m16.5 3.5 4 4-12 12H4.5v-4l12-12z" />
  </>
);
export const IconTrash = make(
  <>
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6" />
  </>
);
export const IconSun = make(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m4.93 19.07 1.41-1.41" />
    <path d="m17.66 6.34 1.41-1.41" />
  </>
);
export const IconMoon = make(<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />);
export const IconMonitor = make(
  <>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8" />
    <path d="M12 16v4" />
  </>
);
export const IconMessageSquare = make(
  <path d="M21 12a8 8 0 0 1-8 8H7l-4 3V5a2 2 0 0 1 2-2h12a4 4 0 0 1 4 4v5z" />
);
export const IconClipboardList = make(
  <>
    <rect x="7" y="4" width="10" height="4" rx="1" />
    <path d="M17 6h2a1 1 0 0 1 1 1v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a1 1 0 0 1 1-1h2" />
    <path d="M9 14h6" />
    <path d="M9 18h6" />
  </>
);
export const IconBug = make(
  <>
    <rect x="7" y="9" width="10" height="12" rx="4" />
    <path d="M12 9V5a3 3 0 0 1 3-3" />
    <path d="M4 13h3" />
    <path d="M17 13h3" />
    <path d="M5 19h3" />
    <path d="M16 19h3" />
    <path d="M5 7h3" />
    <path d="M16 7h3" />
  </>
);
export const IconMessageQuestion = make(
  <>
    <path d="M21 12a8 8 0 0 1-8 8H7l-4 3V5a2 2 0 0 1 2-2h12a4 4 0 0 1 4 4v5z" />
    <path d="M10 9a2 2 0 1 1 3 1.7c-.7.5-1 .8-1 1.8" />
    <path d="M12 16h.01" />
  </>
);
export const IconCpu = make(
  <>
    <rect x="5" y="5" width="14" height="14" rx="2" />
    <rect x="9" y="9" width="6" height="6" />
    <path d="M9 2v3" />
    <path d="M15 2v3" />
    <path d="M9 19v3" />
    <path d="M15 19v3" />
    <path d="M2 9h3" />
    <path d="M2 15h3" />
    <path d="M19 9h3" />
    <path d="M19 15h3" />
  </>
);
export const IconLink = make(
  <>
    <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2" />
    <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2" />
  </>
);
export const IconDatabase = make(
  <>
    <ellipse cx="12" cy="5" rx="8" ry="3" />
    <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
    <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
  </>
);
export const IconBookOpen = make(
  <>
    <path d="M12 7v14" />
    <path d="M3 5h6a3 3 0 0 1 3 3v13H6a3 3 0 0 1-3-3z" />
    <path d="M21 5h-6a3 3 0 0 0-3 3v13h6a3 3 0 0 0 3-3z" />
  </>
);
export const IconArrowLeft = make(
  <>
    <path d="M19 12H5" />
    <path d="m12 19-7-7 7-7" />
  </>
);
export const IconArrowRight = make(
  <>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </>
);
export const IconReturn = make(
  <>
    <path d="M10 6 5 11l5 5" />
    <path d="M6 11h8a5 5 0 1 1 0 10H8" />
  </>
);
export const IconHome = make(<path d="M3 12 12 4l9 8" />);
export const IconStar = make(
  <path d="M12 2 15 9l7 .6-5.3 4.6 1.7 7-6.4-3.8L6.6 21l1.7-7L3 9.6 10 9z" />
);
export const IconLightbulb = make(
  <>
    <path d="M9 18h6" />
    <path d="M10 22h4" />
    <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V18h6v-1.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z" />
  </>
);
export const IconChevronRight = make(<path d="m9 18 6-6-6-6" />);
export const IconChevronDown = make(<path d="m6 9 6 6 6-6" />);
export const IconBrain = make(
  <>
    <path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-2 3 3 3 0 0 0 1 2 3 3 0 0 0 0 4 3 3 0 0 0 2 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3" />
    <path d="M15 3a3 3 0 0 1 3 3 3 3 0 0 1 2 3 3 3 0 0 1-1 2 3 3 0 0 1 0 4 3 3 0 0 1-2 3 3 3 0 0 1-3 3 3 3 0 0 1-3-3" />
  </>
);
export const IconDot = make(<circle cx="12" cy="12" r="3" />);
export const IconCircle = make(<circle cx="12" cy="12" r="9" />);
export const IconUpload = make(
  <>
    <path d="M12 3v13" />
    <path d="m5 10 7-7 7 7" />
    <path d="M5 21h14" />
  </>
);
export const IconShield = make(
  <>
    <path d="M12 2 4 6v6c0 5 3.4 9 8 10 4.6-1 8-5 8-10V6l-8-4z" />
  </>
);
export const IconClock = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 6v6l4 2" />
  </>
);
export const IconTarget = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" />
  </>
);
export const IconHash = make(
  <>
    <path d="M4 9h16" />
    <path d="M4 15h16" />
    <path d="M10 3 8 21" />
    <path d="M16 3 14 21" />
  </>
);
export const IconSlash = make(<path d="M22 2 2 22" />);
export const IconFilter = make(
  <>
    <path d="M22 3H2l8 9.5V19l4 2v-8.5L22 3z" />
  </>
);
export const IconMap = make(
  <>
    <path d="m3 7 6-3 6 3 6-3v13l-6 3-6-3-6 3V7z" />
    <path d="M9 4v13" />
    <path d="M15 7v13" />
  </>
);
export const IconKey = make(
  <>
    <circle cx="7.5" cy="15.5" r="5.5" />
    <path d="m11.5 11.5 5-5" />
    <path d="M16 7h4" />
    <path d="M20 7v4" />
  </>
);
export const IconToggleLeft = make(
  <>
    <rect x="1" y="5" width="22" height="14" rx="7" />
    <circle cx="8" cy="12" r="3" />
  </>
);
export const IconToggleRight = make(
  <>
    <rect x="1" y="5" width="22" height="14" rx="7" />
    <circle cx="16" cy="12" r="3" />
  </>
);
export const IconChevronUp = make(<path d="m18 15-6-6-6 6" />);
export const IconHistory = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 6v6l3 3" />
    <path d="M3 12a9 9 0 0 1 9-9" />
    <path d="M6 3l-3 3 3 3" />
  </>
);
export const IconWand = make(
  <>
    <path d="m15 4-1.5 1.5L18 10l1.5-1.5L15 4z" />
    <path d="m13.5 5.5-10 10L2 22l6.5-1.5 10-10z" />
  </>
);
export const IconTestTube = make(
  <>
    <path d="M9 2v10l-4 8h14l-4-8V2" />
    <path d="M7 2h10" />
    <path d="M5 20h14" />
  </>
);
export const IconEyeOff = make(
  <>
    <path d="M2 2l20 20" />
    <path d="M6.7 6.7C4.1 8.4 2 12 2 12s3 7 10 7c1.8 0 3.3-.5 4.6-1.2" />
    <path d="M17.9 17.4C20.2 15.7 22 12 22 12s-3-7-10-7c-.8 0-1.6.1-2.3.3" />
  </>
);
export const IconList = make(
  <>
    <path d="M8 6h13" />
    <path d="M8 12h13" />
    <path d="M8 18h13" />
    <path d="M3 6h.01" />
    <path d="M3 12h.01" />
    <path d="M3 18h.01" />
  </>
);
export const IconAlignLeft = make(
  <>
    <path d="M15 6h-11" />
    <path d="M17 12h-7" />
    <path d="M17 18h-7" />
    <path d="M3 12h.01" />
    <path d="M3 18h.01" />
  </>
);
