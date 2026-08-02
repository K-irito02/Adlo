import { make } from './helper';

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
export const IconSquare = make(<rect x="4" y="4" width="16" height="16" rx="2" />);

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
