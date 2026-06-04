import React from 'react';

export type IconSize = 12 | 14 | 16 | 18 | 20 | 24 | 28 | 32 | 48;

export interface IconProps extends Omit<React.SVGProps<SVGSVGElement>, 'children'> {
  size?: IconSize;
  title?: string;
  decorative?: boolean;
}

export type IconComponent = (props: IconProps) => React.JSX.Element;

export function iconProps(size: IconSize, rest: IconProps): React.SVGProps<SVGSVGElement> {
  const { title, decorative, className, ...other } = rest;
  const a11y =
    decorative || !title
      ? { 'aria-hidden': true as const, focusable: 'false' as const }
      : { role: 'img' as const, 'aria-label': title };
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
    ...a11y,
    ...other,
  };
}

export const make = (path: React.ReactNode): IconComponent =>
  function IconFn({ size = 16, ...rest }: IconProps) {
    return <svg {...iconProps(size, rest)}>{path}</svg>;
  };
