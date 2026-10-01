import { describe, expect, it } from 'vitest';
import { selectTerminalTabsToClose } from '../terminalPtyRuntime';

interface Tab {
  id: string;
  workspaceId?: string;
  location?: 'panel' | 'center';
}

const tabs: Tab[] = [
  { id: 'ws1-panel' },
  { id: 'ws1-panel-loc', location: 'panel' },
  { id: 'ws1-center', location: 'center' },
  { id: 'ws2-panel', workspaceId: 'ws-2' },
  { id: 'ws2-center', workspaceId: 'ws-2', location: 'center' },
];

describe('selectTerminalTabsToClose 批量关闭跳过中心标签', () => {
  it('不带 workspaceId 时选中所有面板标签，排除中心标签', () => {
    const ids = selectTerminalTabsToClose(tabs).map((t) => t.id);
    expect(ids).toEqual(['ws1-panel', 'ws1-panel-loc', 'ws2-panel']);
  });

  it('带 workspaceId 时只选该工作区的面板标签，排除其中心标签', () => {
    const ids = selectTerminalTabsToClose(tabs, 'ws-2').map((t) => t.id);
    expect(ids).toEqual(['ws2-panel']);
  });

  it('工作区只有中心标签时返回空（不清理）', () => {
    expect(selectTerminalTabsToClose(tabs, 'ws-empty')).toEqual([]);
  });
});
