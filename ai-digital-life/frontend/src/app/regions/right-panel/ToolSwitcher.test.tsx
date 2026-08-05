import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TCopyProvider } from '../../i18n/TCopyContext';
import type { CopyDict } from '../../i18n';
import type { ToolId } from '../../stores/types';
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
  audit: 0,
  settings: 0,
  ci: 0,
  communicate: 0,
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
    const labels = [
      'toolFiles',
      'toolChanges',
      'toolBrowser',
      'toolTerminal',
      'toolAudit',
      'toolSettings',
      'toolCommunicate',
    ];
    for (const label of labels) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }
  });
});
