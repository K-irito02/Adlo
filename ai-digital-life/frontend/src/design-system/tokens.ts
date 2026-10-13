export const CSS_TOKEN_PREFIX = '--adl-' as const;

export const SPACING_TOKENS = [
  'space-0',
  'space-px',
  'space-0-5',
  'space-1',
  'space-1-5',
  'space-2',
  'space-2-5',
  'space-3',
  'space-3-5',
  'space-4',
  'space-5',
  'space-6',
  'space-7',
  'space-8',
  'space-10',
  'space-12',
  'space-14',
  'space-16',
  'space-20',
  'space-24',
] as const;

export const FONT_FAMILY_TOKENS = ['font-sans', 'font-mono', 'font-display', 'font-serif'] as const;

export const FONT_SIZE_TOKENS = [
  'text-xs',
  'text-sm',
  'text-base',
  'text-lg',
  'text-xl',
  'text-2xl',
  'text-3xl',
  'text-4xl',
  'text-5xl',
] as const;

export const FONT_WEIGHT_TOKENS = [
  'font-light',
  'font-normal',
  'font-medium',
  'font-semibold',
  'font-bold',
  'font-extrabold',
] as const;

export const RADIUS_TOKENS = [
  'radius-none',
  'radius-sm',
  'radius',
  'radius-md',
  'radius-lg',
  'radius-xl',
  'radius-2xl',
  'radius-3xl',
  'radius-full',
] as const;

export const SHADOW_TOKENS = [
  'shadow-none',
  'shadow-sm',
  'shadow',
  'shadow-md',
  'shadow-lg',
  'shadow-xl',
  'shadow-2xl',
  'shadow-inner',
  'shadow-soft',
  'shadow-inset-highlight',
  'shadow-panel',
  'shadow-panel-sm',
  'shadow-divider',
] as const;

export const RING_TOKENS = ['ring-neutral', 'ring-error'] as const;

export const DURATION_TOKENS = [
  'duration-75',
  'duration-100',
  'duration-150',
  'duration-200',
  'duration-300',
  'duration-350',
  'duration-500',
  'duration-700',
  'duration-1000',
  'duration-editorial',
] as const;

export const ICON_SIZE_TOKENS = [
  'icon-xs',
  'icon-sm',
  'icon-md',
  'icon-lg',
  'icon-xl',
  'icon-2xl',
] as const;

export const LAYOUT_TOKENS = [
  'titlebar-height',
  'statusbar-height',
  'sidebar-width',
  'sidebar-width-collapsed',
  'right-panel-width',
  'right-panel-width-min',
  'right-panel-width-max',
  'content-max-width',
  'activity-bar-width',
  'tool-sidebar-width',
  'tool-sidebar-width-expanded',
] as const;

export const Z_INDEX_TOKENS = [
  'z-base',
  'z-raised',
  'z-dropdown',
  'z-sticky',
  'z-overlay',
  'z-modal-backdrop',
  'z-modal',
  'z-popover',
  'z-toast',
  'z-tooltip',
  'z-max',
  'z-toast-top',
] as const;

export type SpacingToken = (typeof SPACING_TOKENS)[number];
export type FontFamilyToken = (typeof FONT_FAMILY_TOKENS)[number];
export type FontSizeToken = (typeof FONT_SIZE_TOKENS)[number];
export type FontWeightToken = (typeof FONT_WEIGHT_TOKENS)[number];
export type RadiusToken = (typeof RADIUS_TOKENS)[number];
export type ShadowToken = (typeof SHADOW_TOKENS)[number];
export type RingToken = (typeof RING_TOKENS)[number];
export type DurationToken = (typeof DURATION_TOKENS)[number];
export type IconSizeToken = (typeof ICON_SIZE_TOKENS)[number];
export type LayoutToken = (typeof LAYOUT_TOKENS)[number];
export type ZIndexToken = (typeof Z_INDEX_TOKENS)[number];

export type CssToken =
  | SpacingToken
  | FontFamilyToken
  | FontSizeToken
  | FontWeightToken
  | RadiusToken
  | ShadowToken
  | RingToken
  | DurationToken
  | IconSizeToken
  | LayoutToken
  | ZIndexToken;

export function getCssVarName(token: CssToken): string {
  return `var(--${token})`;
}

export function getSpacingVar(token: SpacingToken): string {
  return `var(--${token})`;
}

export function getShadowVar(token: ShadowToken): string {
  return `var(--${token})`;
}

export function getRadiusVar(token: RadiusToken): string {
  return `var(--${token})`;
}

export function getIconSizeVar(token: IconSizeToken): string {
  return `var(--${token})`;
}

export function getZIndexVar(token: ZIndexToken): string {
  return `var(--${token})`;
}
