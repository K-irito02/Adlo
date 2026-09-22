import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { CopyDict } from '../../i18n';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { useAppStore } from '../../stores/slicedStore';
import { WorkspaceSettings } from './WorkspaceSettings';

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

describe('WorkspaceSettings editorial cards', () => {
  afterEach(() => {
    cleanup();
    useAppStore.setState({
      appInfo: undefined,
      recentWorkspaces: [],
    });
  });

  it('renders a load-settings card and three list cards', () => {
    useAppStore.setState({
      appInfo: {
        appName: 'test',
        version: '0.0.0',
        config: {
          language: 'en-US',
          themeMode: 'system',
          resolvedTheme: 'light',
          logLevel: 'info',
          terminalLogMode: 'overwrite',
          debugLogMode: 'overwrite',
          maxRecentWorkspaces: 5,
          modelPreferences: { providers: {} },
          keybinds: {},
          fonts: { uiFont: '', codeFont: '', terminalFont: '' },
          maxConcurrentWorkspaces: 6,
          workspacePriorityIds: [],
          workspaceDeferredIds: [],
          workspaceNaturalOrder: [],
          browserInactiveTabSuspendMs: 3_600_000,
          terminalHistoryBudgetBytes: 1 << 30,
        },
        currentWorkspace: undefined,
        recentLogs: [],
      },
      recentWorkspaces: [],
    });

    render(
      <TestProvider>
        <WorkspaceSettings />
      </TestProvider>,
    );

    const loadCard = document.querySelector('[data-testid="workspace-load-card"]');
    expect(loadCard).not.toBeNull();
    expect(loadCard?.classList.contains('adl-settings-card')).toBe(true);
    expect(loadCard?.querySelector('.adl-settings-header')).not.toBeNull();

    const listCards = document.querySelectorAll('.workspace-grid .adl-settings-card');
    expect(listCards).toHaveLength(3);
  });
});
