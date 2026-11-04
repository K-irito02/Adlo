// @vitest-environment node
import { readFileSync, existsSync } from 'node:fs';
import { describe, it, expect } from 'vitest';

const rightPanelSource = readFileSync(new URL('./RightPanel.tsx', import.meta.url), 'utf8');
const providerManagerPath = new URL('../components/models/ProviderManager.tsx', import.meta.url);

describe('RightPanel no longer hosts the legacy models tool', () => {
  it('does not lazy-import or render ProviderManager', () => {
    expect(rightPanelSource).not.toContain('ProviderManager');
    expect(rightPanelSource).not.toContain('../components/models/ProviderManager');
  });

  it('has no models region div for the active tool', () => {
    expect(rightPanelSource).not.toContain("activeTool !== 'models'");
  });

  it('keeps the settings tool region', () => {
    expect(rightPanelSource).toContain("activeTool !== 'settings'");
  });

  it('deletes the ProviderManager component file', () => {
    expect(existsSync(providerManagerPath)).toBe(false);
  });
});
