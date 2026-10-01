import { describe, expect, it, afterEach } from 'vitest';
import { createRef } from 'react';
import { cleanup, render } from '@testing-library/react';
import { TCopyProvider } from '@i18n/TCopyContext';
import type { CopyDict } from '@i18n/types';
import type { TerminalTabState } from '@stores/slices/terminalSlice';
import { MultiWorkspaceTerminal } from './MultiWorkspaceTerminal';

afterEach(cleanup);

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

function makeTab(id: string, title: string, location?: 'panel' | 'center'): TerminalTabState {
  return {
    id,
    workspaceId: '',
    title,
    profile: 'powershell',
    status: 'idle',
    isPinned: false,
    sortOrder: 0,
    location,
  };
}

function renderTerminal(tabs: TerminalTabState[]) {
  return render(
    <TCopyProvider t={mockT} locale="en-US">
      <MultiWorkspaceTerminal
        workspaces={[]}
        expandedStates={{ __independent__: true }}
        terminalTabs={tabs}
        activeTabId="panel-term"
        editingTabId={null}
        editValue=""
        editInputRef={createRef<HTMLInputElement | null>()}
        onToggleExpand={() => {}}
        onCreateTab={() => {}}
        onSelectTab={() => {}}
        onCloseTab={() => {}}
        onTogglePin={() => {}}
        onHideFromRightPanels={() => {}}
        onCloseAllTabs={() => {}}
        onDoubleClick={() => {}}
        onEditChange={() => {}}
        onEditSubmit={() => {}}
        onEditKeyDown={() => {}}
      />
    </TCopyProvider>,
  );
}

describe('MultiWorkspaceTerminal 面板终端列表排除中心标签', () => {
  it('转入中心的终端标签不在面板树中显示，计数只含面板标签', () => {
    const { container, queryByText } = renderTerminal([
      makeTab('panel-term', 'Panel shell', 'panel'),
      makeTab('center-term', 'Center shell', 'center'),
    ]);

    expect(queryByText('Panel shell')).toBeTruthy();
    expect(queryByText('Center shell')).toBeNull();
    expect(container.querySelector('.adl-multitree-entry__count')?.textContent).toBe('1');
  });
});
