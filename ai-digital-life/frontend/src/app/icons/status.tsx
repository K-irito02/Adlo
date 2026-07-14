import { make } from './helper';

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

export const IconStopCircle = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <rect x="9" y="9" width="6" height="6" rx="1" />
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

export const IconDot = make(<circle cx="12" cy="12" r="3" />);
export const IconCircle = make(<circle cx="12" cy="12" r="9" />);

export const IconStar = make(
  <path d="M12 2 15 9l7 .6-5.3 4.6 1.7 7-6.4-3.8L6.6 21l1.7-7L3 9.6 10 9z" />
);

export const IconStarFilled = make(
  <path d="M12 2 15 9l7 .6-5.3 4.6 1.7 7-6.4-3.8L6.6 21l1.7-7L3 9.6 10 9z" fill="currentColor" />
);

export const IconLightbulb = make(
  <>
    <path d="M9 18h6" />
    <path d="M10 22h4" />
    <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V18h6v-1.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z" />
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

export const IconMail = make(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </>
);

export const IconMessageSquare = make(
  <path d="M21 12a8 8 0 0 1-8 8H7l-4 3V5a2 2 0 0 1 2-2h12a4 4 0 0 1 4 4v5z" />
);

export const IconMessageQuestion = make(
  <>
    <path d="M21 12a8 8 0 0 1-8 8H7l-4 3V5a2 2 0 0 1 2-2h12a4 4 0 0 1 4 4v5z" />
    <path d="M10 9a2 2 0 1 1 3 1.7c-.7.5-1 .8-1 1.8" />
    <path d="M12 16h.01" />
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

export const IconClipboardList = make(
  <>
    <rect x="7" y="4" width="10" height="4" rx="1" />
    <path d="M17 6h2a1 1 0 0 1 1 1v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a1 1 0 0 1 1-1h2" />
    <path d="M9 14h6" />
    <path d="M9 18h6" />
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

export const IconMic = make(
  <>
    <rect x="9" y="3" width="6" height="12" rx="3" />
    <path d="M5 12a7 7 0 0 0 14 0" />
    <path d="M12 19v3" />
  </>
);

// Theme icons
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

// Browser/Globe
export const IconGlobe = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a14 14 0 0 1 0 18" />
    <path d="M12 3a14 14 0 0 0 0 18" />
  </>
);

// Language
export const IconLangZh = make(
  <>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <text x="12" y="15" textAnchor="middle" fontSize="10" fontWeight="700" fill="currentColor">
      中
    </text>
  </>
);

export const IconLangEn = make(
  <>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <text x="12" y="15" textAnchor="middle" fontSize="9" fontWeight="700" fill="currentColor">
      EN
    </text>
  </>
);

// Terminal
export const IconTerminal = make(
  <>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m6 8 4 4-4 4" />
    <path d="M12 16h6" />
  </>
);

// Git
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

export const IconBell = make(
  <>
    <path d="M18 8a6 6 0 0 0 -12 0c0 7 -3 9 -3 9h18s-3 -2 -3 -9" />
    <path d="M13.73 21a2 2 0 0 1 -3.46 0" />
  </>
);

export const IconPendingCommit = make(
  <>
    <path d="M13 13m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
    <path d="M13 16v5" />
    <path d="M13 3v7" />
    <path d="M9 7l4 -4l4 4" />
  </>
);

// Models/Tech
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

export const IconBrain = make(
  <>
    <path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-2 3 3 3 0 0 0 1 2 3 3 0 0 0 0 4 3 3 0 0 0 2 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3" />
    <path d="M15 3a3 3 0 0 1 3 3 3 3 0 0 1 2 3 3 3 0 0 1-1 2 3 3 0 0 1 0 4 3 3 0 0 1-2 3 3 3 0 0 1-3 3 3 3 0 0 1-3-3" />
  </>
);

export const IconVolume2 = make(
  <>
    <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
    <path className="audio-wave" d="M16 9a5 5 0 0 1 0 6" />
    <path className="audio-wave" d="M19.364 18.364a9 9 0 0 0 0-12.728" />
  </>
);

export const IconVolumeX = make(
  <>
    <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
    <line x1="22" x2="16" y1="9" y2="15" />
    <line x1="16" x2="22" y1="9" y2="15" />
  </>
);
