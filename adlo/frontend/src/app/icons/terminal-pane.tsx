import { makeFilledStroked, resolveA11y, type IconProps } from './helper';

/**
 * 「增加终端」图标：256 viewBox 的方形加号（Phosphor 风格 outline）。
 * 用 `makeFilledStroked` 叠加同色描边，避免大 viewBox 线框路径在小尺寸下发虚。
 */
export const IconAddTerminal = makeFilledStroked(
  '0 0 256 256',
  4,
  <path d="M208,36H48A12,12,0,0,0,36,48V208a12,12,0,0,0,12,12H208a12,12,0,0,0,12-12V48A12,12,0,0,0,208,36Zm4,172a4,4,0,0,1-4,4H48a4,4,0,0,1-4-4V48a4,4,0,0,1,4-4H208a4,4,0,0,1,4,4Zm-40-80a4,4,0,0,1-4,4H132v36a4,4,0,0,1-8,0V132H88a4,4,0,0,1,0-8h36V88a4,4,0,0,1,8,0v36h36A4,4,0,0,1,172,128Z" />,
);

/**
 * 「恢复自动布局」图标：用户选定方案 B（虚线外框 + 2×2 四格）。
 *
 * 虚线外框表示「自动/待排布」，内部四格是恢复后的结果；纯描边 24 viewBox，
 * 与工具栏其它 14px 图标同重量。颜色继承 `currentColor`，亮暗自适应。
 */
export function IconAutoLayout({ size = 16, ...rest }: IconProps) {
  const { title, decorative, className, ...other } = rest;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={['adl-icon', className].filter(Boolean).join(' ')}
      {...resolveA11y(title, decorative)}
      {...other}
    >
      <rect x="2.5" y="2.5" width="19" height="19" rx="3" strokeDasharray="3 3" />
      <rect x="6" y="6" width="5" height="5" rx="1" />
      <rect x="13" y="6" width="5" height="5" rx="1" />
      <rect x="6" y="13" width="5" height="5" rx="1" />
      <rect x="13" y="13" width="5" height="5" rx="1" />
    </svg>
  );
}

/**
 * 「交换位置」图标：用户提供的双向箭头 SVG（24 viewBox）。
 *
 * 源 SVG 为白色填充（`#ffffff`）；这里把填充统一替换为 `currentColor`
 * 以继承主题（亮暗自适应），结构逐项对齐源文件：根 `fill="none"`、
 * 各路径 `fill="currentColor"` + `fill-rule/clip-rule="evenodd"`。
 */
export function IconSwapPositions({ size = 16, ...rest }: IconProps) {
  const { title, decorative, className, ...other } = rest;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={['adl-icon', className].filter(Boolean).join(' ')}
      {...resolveA11y(title, decorative)}
      {...other}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10.0068 3.44714C10.3121 3.72703 10.3328 4.20146 10.0529 4.5068L5.70494 9.25H20C20.4142 9.25 20.75 9.58579 20.75 10C20.75 10.4142 20.4142 10.75 20 10.75H4.00002C3.70259 10.75 3.43327 10.5742 3.3135 10.302C3.19374 10.0298 3.24617 9.71246 3.44715 9.49321L8.94715 3.49321C9.22704 3.18787 9.70147 3.16724 10.0068 3.44714Z"
        fill="currentColor"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M20.6865 13.698C20.5668 13.4258 20.2974 13.25 20 13.25L4.00001 13.25C3.5858 13.25 3.25001 13.5858 3.25001 14C3.25001 14.4142 3.5858 14.75 4.00001 14.75L18.2951 14.75L13.9472 19.4932C13.6673 19.7985 13.6879 20.273 13.9932 20.5529C14.2986 20.8328 14.773 20.8121 15.0529 20.5068L20.5529 14.5068C20.7539 14.2876 20.8063 13.9703 20.6865 13.698Z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * 「自定义布局」图标：用户提供的魔棒 SVG（256 viewBox）。
 * 与「增加终端」同为大 viewBox 填充路径，用 `makeFilledStroked` 叠加同色描边加粗。
 */
export const IconCustomLayout = makeFilledStroked(
  '0 0 256 256',
  4,
  <path d="M92,24V16a4,4,0,0,1,8,0v8a4,4,0,0,1-8,0ZM16,100h8a4,4,0,0,0,0-8H16a4,4,0,0,0,0,8ZM126.21,35.58a4,4,0,0,0,5.37-1.79l8-16a4,4,0,0,0-7.16-3.58l-8,16A4,4,0,0,0,126.21,35.58Zm-96,88.84-16,8a4,4,0,0,0,3.58,7.16l16-8a4,4,0,1,0-3.58-7.16Zm186.28,62.41a12,12,0,0,1,0,17L203.8,216.49a12,12,0,0,1-17,0l-51.31-51.31a3.93,3.93,0,0,0-3.58-1.11,4,4,0,0,0-2.89,2.27l-17.78,46.31a.77.77,0,0,1-.07.16A11.85,11.85,0,0,1,100.26,220h-.59a11.88,11.88,0,0,1-10.8-8.23L36.6,51.68A12,12,0,0,1,51.68,36.6L211.76,88.87a12,12,0,0,1,1.05,22.33l-.16.07-46.31,17.78a4,4,0,0,0-1.17,6.47Zm-5.66,5.66-51.31-51.32a12,12,0,0,1,3.7-19.49l.16-.06,46.31-17.79a3.95,3.95,0,0,0-.42-7.35L49.2,44.21a4,4,0,0,0-5,5L96.48,209.27a4,4,0,0,0,7.36.42l17.78-46.31a1.11,1.11,0,0,1,.07-.16,12,12,0,0,1,8.76-7,12.21,12.21,0,0,1,2.24-.21,12,12,0,0,1,8.49,3.52l51.31,51.31a4,4,0,0,0,5.65,0l12.69-12.69A4,4,0,0,0,210.83,192.49Z" />,
);
