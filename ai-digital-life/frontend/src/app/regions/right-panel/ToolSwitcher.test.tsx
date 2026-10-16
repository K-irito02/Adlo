import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { TCopyProvider } from '../../i18n/TCopyContext';
import type { CopyDict } from '../../i18n';
import type { ToolId } from '../../stores/types';
import { useAppStore } from '../../stores/slicedStore';
import { ToolSwitcher } from './ToolSwitcher';

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

const badges: Record<ToolId, number> = {
  files: 0,
  changes: 0,
  browser: 0,
  terminal: 0,
  settings: 0,
};

afterEach(cleanup);

function renderSwitcher() {
  return render(
    <TestProvider>
      <ToolSwitcher
        activeTool="files"
        badges={badges}
        idBase="test"
        onSelect={vi.fn()}
        rightPanelExpanded={false}
        onToggleRightPanelExpanded={vi.fn()}
      />
    </TestProvider>,
  );
}

describe('ToolSwitcher', () => {
  it('does not render a legacy models tab', () => {
    renderSwitcher();
    expect(screen.queryByRole('tab', { name: 'toolModels' })).not.toBeInTheDocument();
  });

  it('renders the remaining tool tabs including settings', () => {
    renderSwitcher();
    const labels = ['toolFiles', 'toolChanges', 'toolBrowser', 'toolTerminal', 'toolSettings'];
    for (const label of labels) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('tab')).toHaveLength(5);
  });

  it('renders five tool tabs and no removed communicate tab', () => {
    renderSwitcher();
    expect(screen.queryByRole('tab', { name: 'toolCommunicate' })).not.toBeInTheDocument();
  });

  it('derives tab shortcut hints from user keybinds', async () => {
    const prevAppInfo = useAppStore.getState().appInfo;
    useAppStore.setState({
      appInfo: {
        ...(prevAppInfo as object),
        config: {
          ...((prevAppInfo as { config?: object } | null)?.config as object),
          keybinds: { 'view.terminal': 'mod+t' },
        },
      } as never,
    });
    try {
      render(
        <TestProvider>
          <ToolSwitcher
            activeTool="files"
            badges={badges}
            idBase="test-ts"
            onSelect={vi.fn()}
            rightPanelExpanded={false}
            onToggleRightPanelExpanded={vi.fn()}
          />
        </TestProvider>,
      );
      // TooltipSimple renders its content only on hover (with showDelay), so a
      // plain render never contains the hint — open the terminal tab tooltip first.
      fireEvent.mouseEnter(screen.getByRole('tab', { name: 'toolTerminal' }));
      // Only the hovered tab's tooltip is mounted, so the negative assertion on
      // its content is deterministic.
      await vi.waitFor(
        () => {
          const tooltip = document.body.querySelector('[data-testid="tooltip-content"]');
          expect(tooltip?.textContent ?? '').toContain('Ctrl+T');
          expect(tooltip?.textContent ?? '').not.toContain('Ctrl+Shift+`');
        },
        { timeout: 2000 },
      );
    } finally {
      useAppStore.setState({ appInfo: prevAppInfo });
    }
  });
});
