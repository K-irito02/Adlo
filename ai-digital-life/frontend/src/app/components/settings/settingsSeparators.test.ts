// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

const SEPARATOR = 'adl-tool-context__separator';

describe('tool-context separators sit right after the navigator toggle', () => {
  it('SettingsPanel renders toggle, separator, then search', () => {
    const source = readSource('./SettingsPanel.tsx');
    const leading = source.indexOf('iconbtn--leading');
    const separator = source.indexOf(SEPARATOR);
    const searchButton = source.indexOf('onClick={() => setSearchOpen(true)}');
    expect(leading).toBeGreaterThanOrEqual(0);
    expect(separator).toBeGreaterThan(leading);
    expect(searchButton).toBeGreaterThan(separator);
  });

  it('FilesPanel renders the separator between toggle and search toggle', () => {
    const source = readSource('../../regions/right-panel/panels/FilesPanel.tsx');
    const leading = source.indexOf('iconbtn--leading');
    const separator = source.indexOf(SEPARATOR);
    const searchToggle = source.indexOf('onClick={() => setNavigatorMode(navigatorMode ===');
    expect(leading).toBeGreaterThanOrEqual(0);
    expect(separator).toBeGreaterThan(leading);
    expect(searchToggle).toBeGreaterThan(separator);
  });

  it('BrowserToolbar renders the separator between toggle and back button', () => {
    const source = readSource('../../features/browser/BrowserToolbar.tsx');
    const leading = source.indexOf('iconbtn--leading');
    const separator = source.indexOf(SEPARATOR);
    const backButton = source.indexOf('content={t.browserBack}');
    expect(leading).toBeGreaterThanOrEqual(0);
    expect(separator).toBeGreaterThan(leading);
    expect(backButton).toBeGreaterThan(separator);
  });

  it('TerminalPanel renders the separator between toggle and shell selector', () => {
    const source = readSource('../../features/terminal/TerminalPanel.tsx');
    const leading = source.indexOf('iconbtn--leading');
    const separator = source.indexOf(SEPARATOR);
    const actions = source.indexOf('adl-tool-context__group--terminal-actions');
    expect(leading).toBeGreaterThanOrEqual(0);
    expect(separator).toBeGreaterThan(leading);
    expect(actions).toBeGreaterThan(separator);
  });

  it('ChangesTopToolbar renders the separator only inside the no-patch-set branch', () => {
    const source = readSource('../../regions/right-panel/panels/ChangesTopToolbar.tsx');
    const occurrences = source.split(SEPARATOR).length - 1;
    expect(occurrences).toBe(1);
    const conditional = source.indexOf('{!hasActivePatchSet ? (');
    const separator = source.indexOf(SEPARATOR);
    expect(conditional).toBeGreaterThanOrEqual(0);
    expect(separator).toBeGreaterThan(conditional);
  });
});
