import React from 'react';
import { iconProps, make, type IconProps } from './helper';

export const IconTerminalDirectory = make(
  <>
    <path d="M10 10.5 8 13l2 2.5" />
    <path d="m14 10.5 2 2.5-2 2.5" />
    <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" />
  </>,
);

export const IconTerminalCommandHistory = make(
  <>
    <path d="M16.77 13.89a.37.37 0 0 1 0 .53l-2.25 2.25a.37.37 0 0 1-.53-.53L15.94 14.2l-1.98-1.98a.37.37 0 1 1 .53-.53Zm-6.75-2.25a.37.37 0 0 0-.53 0l-2.25 2.25a.37.37 0 0 0 0 .53l2.25 2.25a.37.37 0 1 0 .53-.53L8.03 14.2l1.98-1.98a.37.37 0 0 0 0-.53ZM19.88 8.19v12a1.12 1.12 0 0 1-1.12 1.12H5.25a1.12 1.12 0 0 1-1.12-1.12V3.75a1.12 1.12 0 0 1 1.12-1.12h9a.38.38 0 0 1 .27.11l5.25 5.25a.38.38 0 0 1 .11.27Zm-5.25-.38h3.97L14.6 3.91Zm4.5 12.38V8.63H14.25a.38.38 0 0 1-.38-.38V3.38H5.25a.38.38 0 0 0-.38.38v12a.38.38 0 0 0 .38.38H18.75a.38.38 0 0 0 .38-.38Z" />
  </>,
);

export type AreaSwapOrientation = 'vertical' | 'horizontal';

export interface IconAreaSwapProps extends IconProps {
  /** vertical = 上下三角（单列视图）；horizontal = 左右三角（双列视图） */
  orientation: AreaSwapOrientation;
  /** 主轴起点侧（单列 = 上，双列 = 左）是否为实心；实心标记「只读历史区」所在的一侧 */
  firstSolid: boolean;
}

const AREA_SWAP_PATHS: Record<AreaSwapOrientation, [string, string]> = {
  // 形状与 Tabler arrows 系列一致：两个 12x6 的三角形，分别贴在主轴两端
  vertical: ['M6 10L12 4L18 10Z', 'M6 14L12 20L18 14Z'],
  horizontal: ['M10 6L4 12L10 18Z', 'M14 6L20 12L14 18Z'],
};

export function IconAreaSwap({
  orientation,
  firstSolid,
  size = 16,
  ...rest
}: IconAreaSwapProps): React.JSX.Element {
  const [first, second] = AREA_SWAP_PATHS[orientation];
  return (
    <svg {...iconProps(size, rest)}>
      <path d={first} fill={firstSolid ? 'currentColor' : 'none'} />
      <path d={second} fill={firstSolid ? 'none' : 'currentColor'} />
    </svg>
  );
}
