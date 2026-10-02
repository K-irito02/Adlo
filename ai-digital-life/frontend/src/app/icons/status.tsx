import { make, makeFilled } from './helper';

export const IconCheckCircle = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12 3 3 5-6" />
  </>,
);

export const IconXCircle = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m9 9 6 6" />
    <path d="m15 9-6 6" />
  </>,
);

export const IconAlertTriangle = make(
  <>
    <path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </>,
);

export const IconCircleHelp = make(
  <>
    <path d="M12 16v.01" />
    <path d="M12 13a2 2 0 0 0 .914 -3.782a1.98 1.98 0 0 0 -2.414 .483" />
    <path d="M10 20.777a8.942 8.942 0 0 1 -2.48 -.969" />
    <path d="M14 3.223a9.003 9.003 0 0 1 0 17.554" />
    <path d="M4.579 17.093a8.961 8.961 0 0 1 -1.227 -2.592" />
    <path d="M3.124 10.5c.16 -.95 .468 -1.85 .9 -2.675l.169 -.305" />
    <path d="M6.907 4.579a8.954 8.954 0 0 1 3.093 -1.356" />
  </>,
);

export const IconFileText = make(
  <>
    <path d="M3 4V18C3 19.1046 3.89543 20 5 20H17H19C20.1046 20 21 19.1046 21 18V8H17" />
    <path d="M3 4H17V18C17 19.1046 17.8954 20 19 20V20" />
    <path d="M13 8L7 8" />
    <path d="M13 12L9 12" />
  </>,
);

export const IconStopCircle = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <rect x="9" y="9" width="6" height="6" rx="1" />
  </>,
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
  </>,
);

export const IconDot = make(<circle cx="12" cy="12" r="3" />);
export const IconCircle = make(<circle cx="12" cy="12" r="9" />);

export const IconStar = make(
  <path d="M12 2 15 9l7 .6-5.3 4.6 1.7 7-6.4-3.8L6.6 21l1.7-7L3 9.6 10 9z" />,
);

export const IconStarFilled = make(
  <path d="M12 2 15 9l7 .6-5.3 4.6 1.7 7-6.4-3.8L6.6 21l1.7-7L3 9.6 10 9z" fill="currentColor" />,
);

export const IconLightbulb = make(
  <>
    <path d="M9 18h6" />
    <path d="M10 22h4" />
    <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2V18h6v-1.3c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z" />
  </>,
);

export const IconShield = make(
  <>
    <path d="M12 2 4 6v6c0 5 3.4 9 8 10 4.6-1 8-5 8-10V6l-8-4z" />
  </>,
);

export const IconClock = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 6v6l4 2" />
  </>,
);

export const IconTarget = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" />
  </>,
);

export const IconHash = make(
  <>
    <path d="M4 9h16" />
    <path d="M4 15h16" />
    <path d="M10 3 8 21" />
    <path d="M16 3 14 21" />
  </>,
);

export const IconHistory = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 6v6l3 3" />
    <path d="M3 12a9 9 0 0 1 9-9" />
    <path d="M6 3l-3 3 3 3" />
  </>,
);

export const IconWand = make(
  <>
    <path d="m15 4-1.5 1.5L18 10l1.5-1.5L15 4z" />
    <path d="m13.5 5.5-10 10L2 22l6.5-1.5 10-10z" />
  </>,
);

export const IconTestTube = make(
  <>
    <path d="M9 2v10l-4 8h14l-4-8V2" />
    <path d="M7 2h10" />
    <path d="M5 20h14" />
  </>,
);

export const IconEyeOff = make(
  <>
    <path d="M2 2l20 20" />
    <path d="M6.7 6.7C4.1 8.4 2 12 2 12s3 7 10 7c1.8 0 3.3-.5 4.6-1.2" />
    <path d="M17.9 17.4C20.2 15.7 22 12 22 12s-3-7-10-7c-.8 0-1.6.1-2.3.3" />
  </>,
);

export const IconMail = make(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </>,
);

export const IconMessageSquare = make(
  <path d="M21 12a8 8 0 0 1-8 8H7l-4 3V5a2 2 0 0 1 2-2h12a4 4 0 0 1 4 4v5z" />,
);

export const IconMessageQuestion = make(
  <>
    <path d="M21 12a8 8 0 0 1-8 8H7l-4 3V5a2 2 0 0 1 2-2h12a4 4 0 0 1 4 4v5z" />
    <path d="M10 9a2 2 0 1 1 3 1.7c-.7.5-1 .8-1 1.8" />
    <path d="M12 16h.01" />
  </>,
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
  </>,
);

export const IconClipboardList = make(
  <>
    <rect x="7" y="4" width="10" height="4" rx="1" />
    <path d="M17 6h2a1 1 0 0 1 1 1v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a1 1 0 0 1 1-1h2" />
    <path d="M9 14h6" />
    <path d="M9 18h6" />
  </>,
);

export const IconMap = make(
  <>
    <path d="m3 7 6-3 6 3 6-3v13l-6 3-6-3-6 3V7z" />
    <path d="M9 4v13" />
    <path d="M15 7v13" />
  </>,
);

export const IconKey = make(
  <>
    <circle cx="7.5" cy="15.5" r="5.5" />
    <path d="m11.5 11.5 5-5" />
    <path d="M16 7h4" />
    <path d="M20 7v4" />
  </>,
);

export const IconToggleLeft = make(
  <>
    <rect x="1" y="5" width="22" height="14" rx="7" />
    <circle cx="8" cy="12" r="3" />
  </>,
);

export const IconToggleRight = make(
  <>
    <rect x="1" y="5" width="22" height="14" rx="7" />
    <circle cx="16" cy="12" r="3" />
  </>,
);

export const IconMic = make(
  <>
    <rect x="9" y="3" width="6" height="12" rx="3" />
    <path d="M5 12a7 7 0 0 0 14 0" />
    <path d="M12 19v3" />
  </>,
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
  </>,
);

export const IconMoon = make(<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />);

export const IconMonitor = make(
  <>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8" />
    <path d="M12 16v4" />
  </>,
);

// Browser/Globe
export const IconGlobe = make(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a14 14 0 0 1 0 18" />
    <path d="M12 3a14 14 0 0 0 0 18" />
  </>,
);

// Browser/World - used as fallback for website favicons
export const IconWorld = make(
  <path
    d="M12 2C6.45161 2 2 6.48387 2 12C2 17.5161 6.45161 22 12 22C17.5484 22 22 17.4839 22 12C22 6.51613 17.4839 2 12 2ZM20.871 12C20.871 15.3548 19 18.2581 16.2903 19.7419L18.871 13.0968C19 12.7419 19.9032 10.5484 20.2258 8.67742C20.6452 9.74194 20.871 10.871 20.871 12ZM13.9032 7.64516H12.8065H9.35484C9.16129 7.64516 9.03226 7.77419 9.03226 7.96774C9.03226 8.16129 9.16129 8.29032 9.35484 8.29032H10L11.129 11.1935L9.77419 14.6774L7.32258 8.25806H8.09677C8.29032 8.25806 8.41935 8.12903 8.41935 7.93548C8.41935 7.74194 8.29032 7.6129 8.09677 7.6129H6.77419L4.64516 7.58064C6.09677 5.03226 8.90323 3.35484 12 3.35484C14.2581 3.35484 16.3548 4.25806 17.9032 5.70968C17.0968 5.83871 16.4516 6.48387 16.2581 7.25806C16.0645 8.16129 16.3871 8.90323 16.7419 9.58064C17.0968 10.3226 17.4839 11 17.1935 11.8065L16 14.9032L13.4516 8.25806H13.9355C14.129 8.25806 14.2581 8.12903 14.2581 7.93548C14.2581 7.77419 14.0323 7.64516 13.9032 7.64516ZM3.12903 12C3.12903 10.871 3.35484 9.77419 3.77419 8.77419L8.12903 19.9677C5.12903 18.5484 3.12903 15.5161 3.12903 12ZM12.0968 13.9032L14.6774 20.4516C13.8065 20.7097 12.9355 20.871 12 20.871C11.129 20.871 10.3226 20.7742 9.54839 20.5161L12.0968 13.9032Z"
    fill="currentColor"
    stroke="none"
  />,
);

/**
 * DeepSeek 官方品牌图标（宿主第三方 harness 标识）。
 * 源 SVG 的硬编码蓝色 `#4D6BFE` 已改为 `currentColor` 继承主题色（中性灰），
 * 不使用内联组件；原始 `0 0 600 600` viewBox 与 clipPath（整幅画布裁剪，无实际
 * 裁剪效果）已省略，仅保留主体路径。
 */
export const IconDeepSeek = makeFilled(
  '0 0 600 600',
  <path d="M593.7 112c-6.3-3-9.1 2.9-12.8 5.9q-1.9 1.6-3.4 3.4c-9.3 10-20.2 16.4-34.3 15.6a67 67 0 0 0-54.1 21.3 49 49 0 0 0-31.2-38.7c-8.8-4-17.7-7.8-23.9-16.3-4.3-6-5.4-12.8-7.6-19.4-1.4-4-2.7-8-7.3-8.7-5-.8-7 3.4-9 6.9a91 91 0 0 0-10.5 46 99 99 0 0 0 46 84.8c3.4 2.3 4.3 4.7 3.2 8.1-2 7-4.5 13.8-6.6 20.8-1.4 4.5-3.5 5.5-8.3 3.5-16.2-7-31-17-43.4-29.5-21.4-20.7-40.7-43.5-64.9-61.4q-8.4-6.2-17.2-11.8c-24.6-24 3.2-43.6 9.7-45.9 6.7-2.5 2.3-10.8-19.5-10.7s-41.7 7.4-67.2 17.1a76 76 0 0 1-11.6 3.4q-35.8-6.7-72-2.5a155 155 0 0 0-112.5 65.5c-33.2 45.8-41 97.7-31.5 151.9a232 232 0 0 0 84 141.3 224 224 0 0 0 161 53.5c37-2.1 78.3-7.1 124.8-46.5 11.8 5.8 24 8.1 44.5 9.9 15.8 1.5 30.9-.7 42.6-3.2 18.4-3.9 17.1-21 10.5-24-53.9-25.1-42-14.9-52.8-23.2 27.4-32.4 68.6-66 84.8-175 1.2-8.7.2-14.2 0-21.2-.1-4.2.9-5.9 5.7-6.4q20.6-2.2 38.7-11.8c34.9-19.1 49-50.4 52.3-88 .5-5.7-.1-11.6-6.2-14.7M289.5 450c-52.2-41-77.5-54.6-88-54-9.8.6-8 11.8-5.8 19a70 70 0 0 0 9.2 18.6c2.9 4.1 4.8 10.3-2.8 15-16.8 10.4-46-3.5-47.4-4.2-34-20-62.5-46.4-82.5-82.6a253 253 0 0 1-32.5-112c-.5-9.7 2.3-13.1 12-14.9q18.9-3.6 38.2-1a240 240 0 0 1 136.7 69.4c21.7 21.5 38 47.2 55 72.3 18 26.6 37.4 52 62 72.8a195 195 0 0 0 22.3 17c-20 2.2-53.5 2.7-76.4-15.4m25-161a7.6 7.6 0 0 1 10.4-7.2 7.5 7.5 0 0 1 5 7.2 7.7 7.7 0 0 1-10.7 7.1 8 8 0 0 1-4.7-7.1m77.8 39.9c-5 2-10 3.8-14.8 4-7.2.3-14.2-2-20-6.3-6.8-5.8-11.7-9-13.7-19q-1-7.4.4-14.7c1.7-8.2-.2-13.4-6-18.2-4.7-3.9-10.6-5-17.2-5a14 14 0 0 1-6.3-1.9 6.3 6.3 0 0 1-2.9-9c.7-1.3 4-4.6 4.8-5.2 8.9-5 19.2-3.4 28.7.4 8.8 3.6 15.4 10.2 25 19.6 9.8 11.2 11.5 14.3 17.1 22.8a95 95 0 0 1 11.1 21.2q2.5 7.4-6.2 11.3" />,
);

// Language
export const IconLangZh = make(
  <>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <text x="12" y="15" textAnchor="middle" fontSize="10" fontWeight="700" fill="currentColor">
      中
    </text>
  </>,
);

export const IconLangEn = make(
  <>
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <text x="12" y="15" textAnchor="middle" fontSize="9" fontWeight="700" fill="currentColor">
      EN
    </text>
  </>,
);

// Terminal
export const IconTerminal = make(
  <>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m6 8 4 4-4 4" />
    <path d="M12 16h6" />
  </>,
);

// Git
export const IconGitBranch = make(
  <>
    <line x1="6" x2="6" y1="3" y2="15" />
    <circle cx="18" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M18 9a9 9 0 0 1-9 9" />
  </>,
);

export const IconGitFork = make(
  <>
    <circle cx="12" cy="18" r="3" />
    <circle cx="6" cy="6" r="3" />
    <circle cx="18" cy="6" r="3" />
    <path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9" />
    <path d="M12 12v3" />
  </>,
);

export const IconBell = make(
  <>
    <path d="M18 8a6 6 0 0 0 -12 0c0 7 -3 9 -3 9h18s-3 -2 -3 -9" />
    <path d="M13.73 21a2 2 0 0 1 -3.46 0" />
  </>,
);

export const IconPendingCommit = make(
  <>
    <path d="M13 13m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" />
    <path d="M13 16v5" />
    <path d="M13 3v7" />
    <path d="M9 7l4 -4l4 4" />
  </>,
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
  </>,
);

export const IconDatabase = make(
  <>
    <ellipse cx="12" cy="5" rx="8" ry="3" />
    <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
    <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
  </>,
);

export const IconMemory = make(
  <>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M6 9v6" />
    <path d="M10 9v6" />
    <path d="M14 9v6" />
    <path d="M18 9v6" />
    <path d="M2 9h2" />
    <path d="M2 13h2" />
    <path d="M20 9h2" />
    <path d="M20 13h2" />
  </>,
);

export const IconBookOpen = make(
  <>
    <path d="M12 7v14" />
    <path d="M3 5h6a3 3 0 0 1 3 3v13H6a3 3 0 0 1-3-3z" />
    <path d="M21 5h-6a3 3 0 0 0-3 3v13h6a3 3 0 0 0 3-3z" />
  </>,
);

export const IconBrain = make(
  <>
    <path d="M9 3a3 3 0 0 0-3 3 3 3 0 0 0-2 3 3 3 0 0 0 1 2 3 3 0 0 0 0 4 3 3 0 0 0 2 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3" />
    <path d="M15 3a3 3 0 0 1 3 3 3 3 0 0 1 2 3 3 3 0 0 1-1 2 3 3 0 0 1 0 4 3 3 0 0 1-2 3 3 3 0 0 1-3 3 3 3 0 0 1-3-3" />
  </>,
);

export const IconVolume2 = make(
  <>
    <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
    <path className="audio-wave" d="M16 9a5 5 0 0 1 0 6" />
    <path className="audio-wave" d="M19.364 18.364a9 9 0 0 0 0-12.728" />
  </>,
);

export const IconVolumeX = make(
  <>
    <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
    <line x1="22" x2="16" y1="9" y2="15" />
    <line x1="16" x2="22" y1="9" y2="15" />
  </>,
);
