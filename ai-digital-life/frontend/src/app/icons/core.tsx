import { make, makeFilled, makeThin } from './helper';

export const IconLogo = make(
  <>
    <path d="M12 2 4 6v6c0 5 3.4 9 8 10 4.6-1 8-5 8-10V6l-8-4z" />
    <path d="M9 12l2 2 4-4" />
  </>,
);

export const IconMenu = make(
  <>
    <path d="M3 6h18" />
    <path d="M3 12h18" />
    <path d="M3 18h18" />
  </>,
);

export const IconMinus = make(<path d="M5 12h14" />);

/**
 * 新标签页图标（browser/page/website/web/interface 语义）：圆角窗口 + 标题栏两点。
 * 用于"新建标签页"标签的 favicon 占位（BrowserFavicon 空 URL 分支）。
 */
export const IconNewTabPage = make(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M6 8h.01" />
    <path d="M9 8h.01" />
  </>,
);

export const IconClose = make(
  <>
    <path d="M18 6 6 18" />
    <path d="M6 6l12 12" />
  </>,
);

export const IconPanelLeft = make(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18" />
  </>,
);

export const IconPanelRight = make(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M15 3v18" />
  </>,
);

export const IconPanelLeftClose = make(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18" />
    <path d="m16 15-3-3 3-3" />
  </>,
);

export const IconPanelRightClose = make(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M15 3v18" />
    <path d="m8 9 3 3-3 3" />
  </>,
);

export const IconEye = make(
  <>
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </>,
);

export const IconColumns = make(
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M12 3v18" />
  </>,
);

export const IconExpandRows = make(
  <>
    <path d="m6 9 6-6 6 6" />
    <path d="m6 15 6 6 6-6" />
  </>,
);

export const IconCollapseRows = make(
  <>
    <path d="m6 4.5 6 5 6-5" />
    <path d="m6 19.5 6-5 6 5" />
  </>,
);

/**
 * 四角展开括号（"放大查看"语义）。
 * 源 SVG 的 fill="#ffffff" 已移除，由 makeFilled 的 fill="currentColor" 统一继承主题色。
 */
export const IconExpandCorners = makeFilled(
  '0 0 25 24',
  <>
    <path d="M3.5625 5.5C3.5625 4.25736 4.56986 3.25 5.8125 3.25H8.31213C8.72635 3.25 9.06213 3.58579 9.06213 4C9.06213 4.41421 8.72635 4.75 8.31213 4.75H5.8125C5.39829 4.75 5.0625 5.08579 5.0625 5.5V8C5.0625 8.41421 4.72671 8.75 4.3125 8.75C3.89829 8.75 3.5625 8.41421 3.5625 8V5.5Z" />
    <path d="M15.5614 4C15.5614 3.58579 15.8972 3.25 16.3114 3.25H18.811C20.0537 3.25 21.061 4.25736 21.061 5.5L21.061 8C21.061 8.41421 20.7253 8.75 20.311 8.75C19.8968 8.75 19.561 8.41421 19.561 8L19.561 5.5C19.561 5.08579 19.2253 4.75 18.811 4.75H16.3114C15.8972 4.75 15.5614 4.41421 15.5614 4Z" />
    <path d="M4.3125 15.25C4.72671 15.25 5.0625 15.5858 5.0625 16V18.5C5.0625 18.9142 5.39829 19.25 5.8125 19.25H8.31214C8.72635 19.25 9.06214 19.5858 9.06214 20C9.06214 20.4142 8.72635 20.75 8.31214 20.75H5.8125C4.56986 20.75 3.5625 19.7426 3.5625 18.5V16C3.5625 15.5858 3.89829 15.25 4.3125 15.25Z" />
    <path d="M20.3111 15.25C20.7253 15.25 21.0611 15.5858 21.0611 16L21.0611 18.5C21.0611 19.7426 20.0537 20.75 18.8111 20.75H16.3114C15.8972 20.75 15.5614 20.4142 15.5614 20C15.5614 19.5858 15.8972 19.25 16.3114 19.25H18.8111C19.2253 19.25 19.5611 18.9142 19.5611 18.5L19.5611 16C19.5611 15.5858 19.8968 15.25 20.3111 15.25Z" />
  </>,
);

export const IconChevronLeft = make(<path d="M14 7L9 12L14 17" />);
export const IconChevronRight = make(<path d="M10 17L15 12L10 7" />);
export const IconChevronsLeft = make(
  <>
    <path d="M10 17L5 12L10 7" />
    <path d="M18 17L13 12L18 7" />
  </>,
);
export const IconChevronsRight = make(
  <>
    <path d="M14 17L19 12L14 7" />
    <path d="M6 17L11 12L6 7" />
  </>,
);
export const IconChevronDown = make(<path d="M7 10L12 15L17 10" />);
export const IconChevronUp = make(<path d="M17 14L12 9L7 14" />);

export const IconArrowLeft = make(
  <>
    <path d="M19 12H5" />
    <path d="m12 19-7-7 7-7" />
  </>,
);

export const IconArrowRight = make(
  <>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </>,
);

export const IconReturn = make(
  <>
    <path d="M10 6 5 11l5 5" />
    <path d="M6 11h8a5 5 0 1 1 0 10H8" />
  </>,
);

export const IconArrowUp = make(
  <>
    <path d="M12 19V5" />
    <path d="m5 12 7-7 7 7" />
  </>,
);

export const IconHome = make(<path d="M3 12 12 4l9 8" />);

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
  </>,
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
  </>,
);

export const IconList = make(
  <>
    <path d="M8 6h13" />
    <path d="M8 12h13" />
    <path d="M8 18h13" />
    <path d="M3 6h.01" />
    <path d="M3 12h.01" />
    <path d="M3 18h.01" />
  </>,
);

export const IconHierarchy = make(
  <>
    <path d="M9 6h11" />
    <path d="M12 12h8" />
    <path d="M15 18h5" />
    <path d="M5 6v.01" />
    <path d="M8 12v.01" />
    <path d="M11 18v.01" />
  </>,
);

// Windows 原生风格窗口控制图标（全部使用 rect 元素保证清晰度）
export const IconWindowMinimize = make(<rect x="6" y="11" width="12" height="2" />);

export const IconWindowMaximize = make(<rect x="6" y="6" width="12" height="12" />);

export const IconWindowRestore = make(
  <>
    <rect x="4" y="8" width="10" height="10" />
    <path d="M6 4h10a2 2 0 0 1 2 2v10" fill="none" />
  </>,
);

export const IconWindowClose = make(<path d="M7 7l10 10M17 7L7 17" />);

export const IconAddWorkspace = makeThin(
  <>
    <path opacity="0.4" d="M6 12H18" />
    <path d="M12 18V6" />
  </>,
  1.5,
);
