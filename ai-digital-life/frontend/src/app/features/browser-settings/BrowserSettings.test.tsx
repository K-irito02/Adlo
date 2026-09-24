import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { CopyDict } from '../../i18n';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { useAppStore } from '../../stores/slicedStore';
import { BrowserPerformanceSettings } from './BrowserPerformanceSettings';
import { BrowserDownloadSettings } from './BrowserDownloadSettings';

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

function TestProvider({ children }: { children: React.ReactNode }) {
  return (
    <TCopyProvider t={mockT} locale="en-US">
      {children}
    </TCopyProvider>
  );
}

describe('Browser settings editorial cards', () => {
  afterEach(() => {
    cleanup();
    useAppStore.setState({
      appInfo: undefined,
      downloadSettings: { mode: 'ask', default_path: '', auto_migrate_on_path_change: false },
      isLoadingSettings: false,
    });
  });

  it('BrowserPerformanceSettings root is an adl-settings-card', () => {
    render(
      <TestProvider>
        <BrowserPerformanceSettings />
      </TestProvider>,
    );
    const root = document.querySelector('.adl-browser-settings');
    expect(root).not.toBeNull();
    expect(root?.classList.contains('adl-settings-card')).toBe(true);
    expect(root?.querySelector('.adl-settings-header')).not.toBeNull();
  });

  it('BrowserDownloadSettings root is an adl-settings-card', () => {
    render(
      <TestProvider>
        <BrowserDownloadSettings />
      </TestProvider>,
    );
    const root = document.querySelector('.adl-browser-settings');
    expect(root).not.toBeNull();
    expect(root?.classList.contains('adl-settings-card')).toBe(true);
    expect(root?.querySelector('.adl-settings-row')).not.toBeNull();
  });
});
