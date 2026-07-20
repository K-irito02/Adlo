/**
 * SSR-friendly template helpers for rendering safe HTML strings.
 *
 * The renderer is a vanilla TypeScript project (not React), so we
 * adopt a tiny `html` tagged template literal that auto-escapes
 * interpolated values to prevent XSS.
 *
 * Usage:
 *
 *   html`<button class="${classNames("btn", variant && `btn--${variant}`)}">${label}</button>`
 *
 * Trusted markup (e.g. icon SVG, pre-rendered partials) must be wrapped
 * with `raw(value)` to opt out of escaping.
 */

const RAW_HTML = Symbol.for('ai-digital-life.raw-html');

export interface RawHtml {
  readonly [RAW_HTML]: true;
  readonly value: string;
}

export function raw(value: string): RawHtml {
  return { [RAW_HTML]: true, value };
}

export function isRaw(value: unknown): value is RawHtml {
  return Boolean(value) && typeof value === 'object' && (value as RawHtml)[RAW_HTML] === true;
}

export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined || value === false) {
    return '';
  }

  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export type Renderable = string | number | boolean | null | undefined | RawHtml | Renderable[];

function renderValue(value: Renderable): string {
  if (value === null || value === undefined || value === false) {
    return '';
  }

  if (Array.isArray(value)) {
    return value.map(renderValue).join('');
  }

  if (isRaw(value)) {
    return value.value;
  }

  return escapeHtml(value);
}

/**
 * Tagged template that interpolates values with HTML escaping.
 * Returns a `RawHtml` so nested templates compose cleanly.
 */
export function html(strings: TemplateStringsArray, ...values: Renderable[]): RawHtml {
  let out = '';
  strings.forEach((segment, index) => {
    out += segment;
    if (index < values.length) {
      out += renderValue(values[index] as Renderable);
    }
  });
  return raw(out);
}

/** Render a `RawHtml` (or string) to a plain string. */
export function renderHtml(value: Renderable): string {
  return renderValue(value);
}

/**
 * Lightweight class-name composer. Falsy values are dropped.
 *
 * classNames("btn", primary && "btn--primary", { "btn--disabled": disabled })
 */
export function classNames(
  ...inputs: (string | false | null | undefined | Record<string, boolean | undefined>)[]
): string {
  const out: string[] = [];

  for (const input of inputs) {
    if (!input) {
      continue;
    }

    if (typeof input === 'string') {
      out.push(input);
      continue;
    }

    for (const [key, value] of Object.entries(input)) {
      if (value) {
        out.push(key);
      }
    }
  }

  return out.join(' ');
}

/**
 * Format a numeric byte size into a short human readable string.
 * Used by status bar and storage tiles.
 */
export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(fractionDigits)} ${units[exponent]}`;
}
