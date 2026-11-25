import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import { TerminalTabBar } from '../TerminalTabBar';
import { useAppStore } from '@stores/slicedStore';
import type { CopyDict } from '@i18n/types';

const t = {
  close: '关闭',
  centerTabShowInCenter: '在「中间区」显示', // glossary-allow: 用户指定文案
} as unknown as CopyDict;

function renderBar(tabId: string) {
  const tabs = useAppStore.getState().terminalTabs;
  return render(
    <TerminalTabBar
      tabs={tabs}
      activeTabId={tabId}
      editingTabId={null}
      editValue=""
      editInputRef={createRef<HTMLInputElement>()}
      isDragging={false}
      dragOverTabId={null}
      onSelectTab={() => {}}
      onCloseTab={() => {}}
      onDragStart={() => {}}
      onDragEnd={() => {}}
      onDragOver={() => {}}
      onDrop={() => {}}
      onContextMenu={() => {}}
      onDoubleClick={() => {}}
      onEditChange={() => {}}
      onEditSubmit={() => {}}
      onEditKeyDown={() => {}}
      t={t}
    />,
  );
}

describe('TerminalTabBar 悬停操作', () => {
  beforeEach(() => {
    useAppStore.setState({ centerTabs: [], centerActiveTabId: '' });
    useAppStore.setState({ terminalTabs: [], terminalTabsById: {}, terminalActiveTabId: '' });
    useAppStore.getState().terminalCreateTab('powershell', '');
  });

  it('关闭按钮左侧提供「移入中心」按钮，点击后把标签移入中心', () => {
    const tabId = useAppStore.getState().terminalTabs[0].id;
    const { getByRole } = renderBar(tabId);

    const actions = document.querySelector('.adl-tool-list__item-actions');
    expect(actions).not.toBeNull();
    const buttons = actions!.querySelectorAll('button');
    expect(buttons).toHaveLength(2);
    // 顺序固定：中间区按钮在左，关闭在右。 glossary-allow: 用户指定文案
    expect(buttons[0].getAttribute('aria-label')).toBe('在「中间区」显示'); // glossary-allow: 用户指定文案
    expect(buttons[1].getAttribute('aria-label')).toBe('关闭');

    fireEvent.click(getByRole('button', { name: '在「中间区」显示' })); // glossary-allow: 用户指定文案
    const state = useAppStore.getState();
    expect(state.centerTabs.some((tab) => tab.refId === tabId)).toBe(true);
    expect(state.terminalTabsById[tabId]?.location).toBe('center');
  });
});
