import React from 'react';

export type IconSize = 12 | 14 | 16 | 18 | 20 | 24 | 28 | 32 | 48;

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'children'> {
  size?: IconSize;
  title?: string;
  decorative?: boolean;
}

export type IconComponent = (props: IconProps) => React.JSX.Element;

function resolveA11y(title?: string, decorative?: boolean) {
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
 * viewBox 约定说明：
 * - 标准 stroke 图标使用 make()，viewBox 固定为 '0 0 24 24'
 * - 填充图标使用 makeFilled()，viewBox 由 SVG 源文件决定
 *   - 用户提供的 SVG 可能使用不同的 viewBox（如 256x256 或 16x16）
 *   - SVG 会自动缩放到指定的 size，不同 viewBox 不影响最终显示效果
 *   - 保持原始 viewBox 可确保路径精度，避免缩放失真
 */
