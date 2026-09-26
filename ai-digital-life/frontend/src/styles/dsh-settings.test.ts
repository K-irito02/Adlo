// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const dshCss = readFileSync(new URL('./regions/dsh.css', import.meta.url), 'utf-8');
const settingsCss = readFileSync(new URL('./components/settings.css', import.meta.url), 'utf-8');

function ruleBody(css: string, selector: string): string | null {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) {
    return null;
  }
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

describe('dsh settings styles (control widths + test button centering)', () => {
  it('fixes the dropdown and the test button to the same width (160px)', () => {
    const dropdown = ruleBody(dshCss, '.adl-dsh-settings .adl-settings-dropdown');
    expect(dropdown).not.toBeNull();
    expect(dropdown).toContain('width: 160px');
    const button = ruleBody(dshCss, '.adl-dsh-settings__test-button');
    expect(button).not.toBeNull();
    expect(button).toContain('width: 160px');
    expect(button).toContain('min-width: 160px');
  });

  it('centers the test button content (label, testing and result states)', () => {
    const body = ruleBody(dshCss, '.adl-dsh-settings__test-button');
    expect(body).not.toBeNull();
    expect(body).toContain('justify-content: center');
  });

  it('centers the inner value text', () => {
    const body = ruleBody(dshCss, '.adl-dsh-settings__test-button .adl-settings-dropdown__value');
    expect(body).not.toBeNull();
    expect(body).toContain('text-align: center');
  });

  it('keeps success/error result colors on the value text', () => {
    const success = ruleBody(
      dshCss,
      '.adl-dsh-settings__test-button .adl-settings-dropdown__value.is-success',
    );
    const error = ruleBody(
      dshCss,
      '.adl-dsh-settings__test-button .adl-settings-dropdown__value.is-error',
    );
    expect(success).not.toBeNull();
    expect(error).not.toBeNull();
    expect(success).toContain('color:');
    expect(error).toContain('color:');
  });

  it('does not left-align the test button', () => {
    const body = ruleBody(dshCss, '.adl-dsh-settings__test-button');
    expect(body).not.toBeNull();
    expect(body).not.toContain('flex-start');
  });

  it('keeps the decorative header icon dim (disabled-like, non-interactive)', () => {
    const body = ruleBody(settingsCss, '.adl-settings-row__reset--static');
    expect(body).not.toBeNull();
    expect(body).toContain('var(--text-muted)');
    expect(body).toContain('opacity: 0.5');
    const hover = ruleBody(settingsCss, '.adl-settings-row__reset--static:hover');
    expect(hover).not.toBeNull();
    expect(hover).toContain('background: transparent');
  });
});
