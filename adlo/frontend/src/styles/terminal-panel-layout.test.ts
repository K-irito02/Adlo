// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { findRuleGroups } from './testing/cssRules';

const terminalCss = readFileSync(
  new URL('./regions/rightpanel/terminal-panel.css', import.meta.url),
  'utf-8',
);

describe('.adl-tool-primary__scroll--terminal layout', () => {
  it('stacks the live terminal and the terminated error banner in a single column', () => {
    // The read-only history feature was removed, and with it the is-single/is-dual
    // modifiers that used to always carry flex-direction on this host. Both terminal
    // hosts (TerminalPanel.tsx, CenterTerminalView.tsx) render .adl-terminal-live and
    // .adl-terminal-error-note as direct children; without an explicit column
    // direction the flex row default squeezes the error banner into a vertical strip
    // beside the terminal instead of the full-width banner below it. Guard it here so
    // the placement regression cannot silently return.
    const groups = findRuleGroups(terminalCss, '.adl-tool-primary__scroll--terminal');
    expect(groups.length).toBeGreaterThan(0);
    expect(
      groups.some((body) => /display:\s*flex/.test(body) && /flex-direction:\s*column/.test(body)),
    ).toBe(true);
  });
});
