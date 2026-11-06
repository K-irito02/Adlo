import { make, makeFilled } from './helper';

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

/**
 * 「切换两侧面板」收起态：两侧竖线代表左右面板，向外双箭头表示两侧面板向外收走。
 * 与 IconPanelLeftClose / IconPanelRightClose 同属面板图标族，区别是作用于“两侧”。
 */
export const IconPanelsCollapse = make(
  <>
    <path d="M4 4v16" />
    <path d="M20 4v16" />
    <path d="m9.5 9-3 3 3 3" />
    <path d="m14.5 9 3 3-3 3" />
  </>,
);

/** 「切换两侧面板」展开态：IconPanelsCollapse 的镜像，两侧面板向内收回画面。 */
export const IconPanelsExpand = make(
  <>
    <path d="M4 4v16" />
    <path d="M20 4v16" />
    <path d="m7 9 3 3-3 3" />
    <path d="m17 9-3 3 3 3" />
  </>,
);

export const IconEye = make(
  <>
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </>,
);

/**
 * 自动换行开启（"换行"开关的 ON 态）。填充路径取自用户提供的 24×24 SVG，
 * 源 `fill="#ffffff"` 已移除，由 `makeFilled` 的 `fill="currentColor"` 统一继承主题色
 * （同 `IconExpandCorners` 的处理约定）。
 */
export const IconWrap = makeFilled(
  '0 0 24 24',
  <>
    <path d="M2.75 5C2.33579 5 2 5.33579 2 5.75C2 6.16421 2.33579 6.5 2.75 6.5H21.25C21.6642 6.5 22 6.16421 22 5.75C22 5.33579 21.6642 5 21.25 5H2.75ZM2.75 11.5C2.33579 11.5 2 11.8358 2 12.25C2 12.6642 2.33579 13 2.75 13H19C20.3807 13 21.5 14.1193 21.5 15.5C21.5 16.8807 20.3807 18 19 18H14.5607L15.2803 17.2803C15.5732 16.9874 15.5732 16.5126 15.2803 16.2197C14.9874 15.9268 14.5126 15.9268 14.2197 16.2197L12.2197 18.2197C11.9268 18.5126 11.9268 18.9874 12.2197 19.2803L14.2197 21.2803C14.5126 21.5732 14.9874 21.5732 15.2803 21.2803C15.5732 20.9874 15.5732 20.5126 15.2803 20.2197L14.5607 19.5H19C21.2091 19.5 23 17.7091 23 15.5C23 13.2909 21.2091 11.5 19 11.5H2.75ZM2 18.75C2 18.3358 2.33579 18 2.75 18H9.25C9.66421 18 10 18.3358 10 18.75C10 19.1642 9.66421 19.5 9.25 19.5H2.75C2.33579 19.5 2 19.1642 2 18.75Z" />
  </>,
);

/**
 * 自动换行关闭（"换行"开关的 OFF 态）：换行箭头被斜杠划除，
 * 表达"不再自动折行、内容改为横向滚动"。
 */
export const IconWrapOff = makeFilled(
  '0 0 24 24',
  <>
    <path d="M3.28034 2.21968C2.98745 1.92678 2.51257 1.92677 2.21968 2.21966C1.92678 2.51255 1.92677 2.98743 2.21966 3.28032L3.93931 5H2.75C2.33579 5 2 5.33579 2 5.75C2 6.16421 2.33579 6.5 2.75 6.5H5.43928L10.4392 11.5H2.75C2.33579 11.5 2 11.8358 2 12.25C2 12.6642 2.33579 13 2.75 13H11.9391L14.9728 16.0337C14.7154 15.9539 14.4235 16.0159 14.2197 16.2197L12.2197 18.2197C11.9268 18.5126 11.9268 18.9874 12.2197 19.2803L14.2197 21.2803C14.5126 21.5732 14.9874 21.5732 15.2803 21.2803C15.5732 20.9874 15.5732 20.5126 15.2803 20.2197L14.5607 19.5H18.439L20.7194 21.7805C21.0123 22.0734 21.4872 22.0734 21.7801 21.7805C22.073 21.4876 22.073 21.0127 21.7801 20.7198L3.28034 2.21968ZM16.939 18H14.5607L15.2803 17.2803C15.4841 17.0765 15.5461 16.7846 15.4663 16.5272L16.939 18ZM19 11.5H14.6814L16.1814 13H19C20.3807 13 21.5 14.1193 21.5 15.5C21.5 16.2715 21.1505 16.9614 20.6013 17.42L21.6646 18.4833C22.4841 17.7508 23 16.6857 23 15.5C23 13.2909 21.2091 11.5 19 11.5ZM8.18156 5L9.68153 6.5H21.25C21.6642 6.5 22 6.16421 22 5.75C22 5.33579 21.6642 5 21.25 5H8.18156ZM2 18.75C2 18.3358 2.33579 18 2.75 18H9.25C9.66421 18 10 18.3358 10 18.75C10 19.1642 9.66421 19.5 9.25 19.5H2.75C2.33579 19.5 2 19.1642 2 18.75Z" />
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
