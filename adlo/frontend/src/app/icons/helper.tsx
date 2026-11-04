import React from 'react';

export type IconSize = 12 | 14 | 16 | 18 | 20 | 24 | 28 | 32 | 48;

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'children'> {
  size?: IconSize;
  title?: string;
  decorative?: boolean;
}

export type IconComponent = (props: IconProps) => React.JSX.Element;

export function resolveA11y(title?: string, decorative?: boolean) {
  return decorative || !title
    ? { 'aria-hidden': true as const, focusable: 'false' as const }
    : { role: 'img' as const, 'aria-label': title };
}

export function iconProps(size: IconSize, rest: IconProps): React.SVGProps<SVGSVGElement> {
  const { title, decorative, className, ...other } = rest;
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className: ['adl-icon', className].filter(Boolean).join(' '),
    ...resolveA11y(title, decorative),
    ...other,
  };
}

export const make = (path: React.ReactNode): IconComponent =>
  function IconFn({ size = 16, ...rest }: IconProps) {
    return <svg {...iconProps(size, rest)}>{path}</svg>;
  };

export const makeThin = (path: React.ReactNode, strokeWidthValue: number = 1.5): IconComponent =>
  function IconFn({ size = 16, ...rest }: IconProps) {
    const { strokeWidth: _, ...restWithoutStrokeWidth } = rest;
    return (
      <svg {...iconProps(size, restWithoutStrokeWidth)} strokeWidth={strokeWidthValue}>
        {path}
      </svg>
    );
  };

export const makeFilled = (viewBox: string, path: React.ReactNode): IconComponent =>
  function IconFn({ size = 16, ...rest }: IconProps) {
    const { title, decorative, className, ...other } = rest;
    return (
      <svg
        width={size}
        height={size}
        viewBox={viewBox}
        fill="currentColor"
        className={['adl-icon', className].filter(Boolean).join(' ')}
        {...resolveA11y(title, decorative)}
        {...other}
      >
        {path}
      </svg>
    );
  };

/**
 * 填充 + 同色描边图标：用于「大 viewBox 线框风格」的填充路径图标。
 *
 * 这类路径（多为 Phosphor 风格 outline，viewBox 256）的线宽按 viewBox 单位
 * 换算后在 14–16px 下只有 ~0.4px，比标准 stroke 图标（`make`：viewBox 24 /
 * strokeWidth 2 ≈ 1.17px @14px）明显更细，视觉上发灰、发虚。叠加同色描边把
 * 线宽加粗到与 stroke 图标相近的视觉权重。`strokeWidth` 以 viewBox 单位给出，
 * 随 `size` 等比缩放，行为与 `make` 的 `strokeWidth` 一致。
 */
export const makeFilledStroked = (
  viewBox: string,
  strokeWidth: number,
  path: React.ReactNode,
): IconComponent =>
  function IconFn({ size = 16, ...rest }: IconProps) {
    const { title, decorative, className, ...other } = rest;
    return (
      <svg
        width={size}
        height={size}
        viewBox={viewBox}
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        className={['adl-icon', className].filter(Boolean).join(' ')}
        {...resolveA11y(title, decorative)}
        {...other}
      >
        {path}
      </svg>
    );
  };

/**
 * viewBox 约定说明：
 * - 标准 stroke 图标使用 make()，viewBox 固定为 '0 0 24 24'
 * - 填充图标使用 makeFilled()，viewBox 由 SVG 源文件决定
 *   - 用户提供的 SVG 可能使用不同的 viewBox（如 256x256 或 16x16）
 *   - SVG 会自动缩放到指定的 size，不同 viewBox 不影响最终显示效果
 *   - 保持原始 viewBox 可确保路径精度，避免缩放失真
 * - 填充 + 描边图标使用 makeFilledStroked()，viewBox 由 SVG 源决定，
 *   `strokeWidth` 以 viewBox 单位给出、随 `size` 等比缩放；用于大 viewBox
 *   线框风格填充路径在小尺寸下的加粗
 */
