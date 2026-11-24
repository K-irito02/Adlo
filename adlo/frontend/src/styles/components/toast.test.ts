// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const toastCss = readFileSync(new URL('./toast.css', import.meta.url), 'utf-8');

describe('toast loading shimmer styles', () => {
  it('reuses the project text-shimmer keyframes and masks the text', () => {
    expect(toastCss).toContain('.adl-toast__message--shimmer');
    expect(toastCss).toContain('background-clip: text');
    expect(toastCss).toContain('-webkit-background-clip: text');
    expect(toastCss).toContain('color: transparent');
    expect(toastCss).toContain('animation: adl-text-shimmer 2s ease-in-out infinite;');
  });

  it('disables the animation under prefers-reduced-motion', () => {
    const reduced = toastCss.slice(toastCss.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toContain('animation: none;');
    expect(reduced).toContain('color: var(--text-secondary);');
  });
});
