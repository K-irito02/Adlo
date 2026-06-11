/**
 * Reusable HTML rendering helpers for the design system.
 *
 * Components return `RawHtml` (escaped + composable) so they can be
 * combined with other `html` template literals safely.
 */

import { html, raw, classNames, type Renderable, type RawHtml } from './html';
import { renderIcon, type IconName, type IconSize } from './icons';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonOptions {
  label: Renderable;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconSize?: IconSize;
  iconOnly?: boolean;
  type?: 'button' | 'submit';
  disabled?: boolean;
  loading?: boolean;
  block?: boolean;
  ariaLabel?: string;
  ariaPressed?: boolean;
  /** Extra `data-*` attributes (escaped). */
  data?: Record<string, string>;
  /** Extra HTML attributes (escaped key=value pairs). */
  extraAttributes?: string;
  className?: string;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: '',
  secondary: 'btn--secondary',
  ghost: 'btn--ghost',
  danger: 'btn--danger',
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'btn--sm',
  md: '',
  lg: 'btn--lg',
};

function dataAttrs(map?: Record<string, string>): string {
  if (!map) {
    return '';
  }
  return Object.entries(map)
    .map(([key, value]) => ` data-${key}="${escapeAttr(value)}"`)
    .join('');
}

function escapeAttr(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function renderButton(options: ButtonOptions): RawHtml {
  const {
    label,
    variant = 'primary',
    size = 'md',
    icon,
    iconSize,
    iconOnly = false,
    type = 'button',
    disabled = false,
    loading = false,
    block = false,
    ariaLabel,
    ariaPressed,
    data,
    extraAttributes = '',
    className,
  } = options;

  const classes = classNames(
    'btn',
    VARIANT_CLASS[variant],
    SIZE_CLASS[size],
    iconOnly && 'btn--icon',
    block && 'btn--block',
    className
  );

  const ariaPressedAttr =
    ariaPressed === undefined ? '' : ` aria-pressed="${ariaPressed ? 'true' : 'false'}"`;
  const ariaLabelAttr = ariaLabel ? ` aria-label="${escapeAttr(ariaLabel)}"` : '';
  const ariaBusy = loading ? ' aria-busy="true"' : '';
  const disabledAttr = disabled ? ' disabled' : '';

  const iconMarkup = icon
    ? renderIcon(icon, { size: iconSize ?? (size === 'sm' ? 'sm' : 'md'), decorative: true })
    : raw('');
  const labelMarkup = iconOnly ? raw('') : html`<span class="btn__label">${label}</span>`;

  return raw(
    `<button class="${classes}" type="${type}"${disabledAttr}${ariaBusy}${ariaPressedAttr}${ariaLabelAttr}${dataAttrs(data)}${extraAttributes}>${(iconMarkup as RawHtml).value}${(labelMarkup as RawHtml).value}</button>`
  );
}

export type PillTone =
  | 'neutral'
  | 'healthy'
  | 'success'
  | 'degraded'
  | 'pending'
  | 'warning'
  | 'unavailable'
  | 'danger'
  | 'info'
  | 'accent';

export interface PillOptions {
  label: Renderable;
  tone?: PillTone;
  icon?: IconName;
  className?: string;
}

const TONE_CLASS: Record<PillTone, string> = {
  neutral: '',
  healthy: 'pill--healthy',
  success: 'pill--success',
  degraded: 'pill--degraded',
  pending: 'pill--pending',
  warning: 'pill--warning',
  unavailable: 'pill--unavailable',
  danger: 'pill--danger',
  info: 'pill--info',
  accent: 'pill--accent',
};

export function renderPill(options: PillOptions): RawHtml {
  const { label, tone = 'neutral', icon, className } = options;
  const classes = classNames('pill', TONE_CLASS[tone], className);
  const iconMarkup = icon ? renderIcon(icon, { size: 'xs', decorative: true }) : raw('');
  return html`<span class="${classes}">${iconMarkup}${label}</span>`;
}

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: Renderable;
  ariaLabel?: string;
}

export interface SegmentedControlOptions<T extends string> {
  name: string;
  ariaLabel?: string;
  value: T;
  options: SegmentedControlOption<T>[];
  /** Extra `data-*` keys forwarded onto each button. */
  buttonData?: (option: SegmentedControlOption<T>) => Record<string, string> | undefined;
}

export function renderSegmentedControl<T extends string>(
  input: SegmentedControlOptions<T>
): RawHtml {
  const { name, ariaLabel, value, options, buttonData } = input;

  const buttons = options
    .map((option) => {
      const isActive = option.value === value;
      const classes = classNames('segmented__btn', isActive && 'segmented__btn--active');
      const ariaLabelAttr = option.ariaLabel ? ` aria-label="${escapeAttr(option.ariaLabel)}"` : '';
      const data = buttonData?.(option);
      return `<button class="${classes}" type="button" data-segmented-name="${escapeAttr(name)}" data-segmented-value="${escapeAttr(option.value)}" aria-pressed="${isActive ? 'true' : 'false'}"${ariaLabelAttr}${dataAttrs(data)}>${typeof option.label === 'string' ? option.label : ((option.label as RawHtml).value ?? String(option.label ?? ''))}</button>`;
    })
    .join('');

  const labelAttr = ariaLabel ? ` aria-label="${escapeAttr(ariaLabel)}"` : '';
  return raw(`<div class="segmented" role="group"${labelAttr}>${buttons}</div>`);
}

export interface CardOptions {
  title?: Renderable;
  subtitle?: Renderable;
  toolbar?: Renderable;
  children: Renderable;
  className?: string;
  /** Optional landmark role + label for screen readers. */
  ariaLabel?: string;
  variant?: 'default' | 'inset';
  /** Render <section> instead of <article>. */
  as?: 'section' | 'article' | 'div';
  id?: string;
}

export function renderCard(options: CardOptions): RawHtml {
  const {
    title,
    subtitle,
    toolbar,
    children,
    className,
    ariaLabel,
    variant = 'default',
    as = 'section',
    id,
  } = options;
  const classes = classNames('card', variant === 'inset' && 'card--inset', className);
  const idAttr = id ? ` id="${escapeAttr(id)}"` : '';
  const ariaAttr = ariaLabel ? ` aria-label="${escapeAttr(ariaLabel)}"` : '';

  return html`<${raw(as)} class="${classes}"${raw(idAttr)}${raw(ariaAttr)}>
    ${
      title || subtitle || toolbar
        ? html`<header class="card__header">
            <div class="stack stack--sm">
              ${title ? html`<h2 class="card__title">${title}</h2>` : raw('')}
              ${subtitle ? html`<p class="card__subtitle">${subtitle}</p>` : raw('')}
            </div>
            ${toolbar ?? raw('')}
          </header>`
        : raw('')
    }
    <div class="card__body">${children}</div>
  </${raw(as)}>`;
}

export interface BannerOptions {
  text: Renderable;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
  className?: string;
  /** Banner reserves vertical space when empty so layout doesn't shift. */
  empty?: boolean;
  id?: string;
  /** ARIA live region politeness. */
  live?: 'polite' | 'assertive' | 'off';
}

const BANNER_TONE_CLASS: Record<NonNullable<BannerOptions['tone']>, string> = {
  neutral: 'banner--neutral',
  success: 'banner--success',
  warning: 'banner--warning',
  danger: 'banner--error',
};

export function renderBanner(options: BannerOptions): RawHtml {
  const { text, tone = 'neutral', className, empty = false, id, live = 'polite' } = options;
  const classes = classNames(
    'banner',
    BANNER_TONE_CLASS[tone],
    empty && 'banner--empty',
    className
  );
  const idAttr = id ? ` id="${escapeAttr(id)}"` : '';
  return raw(
    `<p class="${classes}" role="status" aria-live="${live}"${idAttr}>${empty ? '' : typeof text === 'string' ? escapeAttr(text) : ((text as RawHtml).value ?? '')}</p>`
  );
}

export interface EmptyStateOptions {
  icon?: IconName;
  title: Renderable;
  description?: Renderable;
  action?: Renderable;
}

export function renderEmptyState(options: EmptyStateOptions): RawHtml {
  const { icon = 'info', title, description, action } = options;
  return html`<div class="empty-state">
    ${renderIcon(icon, { size: 'xl', decorative: true })}
    <p class="empty-state__title">${title}</p>
    ${description ? html`<p class="text-muted text-sm">${description}</p>` : raw('')}
    ${action ?? raw('')}
  </div>`;
}

export interface NavItemOptions {
  href?: string;
  icon: IconName;
  label: Renderable;
  current?: boolean;
  data?: Record<string, string>;
  ariaLabel?: string;
}

export function renderNavItem(options: NavItemOptions): RawHtml {
  const { href = '#', icon, label, current = false, data, ariaLabel } = options;
  const ariaCurrent = current ? ' aria-current="page"' : '';
  const ariaLabelAttr = ariaLabel ? ` aria-label="${escapeAttr(ariaLabel)}"` : '';
  return raw(
    `<a class="nav__item" href="${escapeAttr(href)}"${ariaCurrent}${ariaLabelAttr}${dataAttrs(data)}>${(renderIcon(icon, { size: 'sm', decorative: true }) as RawHtml).value}<span class="nav__item-label">${typeof label === 'string' ? escapeAttr(label) : ((label as RawHtml).value ?? '')}</span></a>`
  );
}

export interface StatTileOptions {
  label: Renderable;
  value: Renderable;
  detail?: Renderable;
  tone?: PillTone;
}

export function renderStatTile(options: StatTileOptions): RawHtml {
  const { label, value, detail, tone } = options;
  return html`<div class="stat">
    <div class="cluster">
      <span class="stat__label">${label}</span>
      ${tone
        ? renderPill({
            label: typeof value === 'string' ? value : '',
            tone,
            className: 'stat__pill',
          })
        : raw('')}
    </div>
    ${tone ? raw('') : html`<div class="stat__value">${value}</div>`}
    ${detail ? html`<div class="stat__detail">${detail}</div>` : raw('')}
  </div>`;
}
