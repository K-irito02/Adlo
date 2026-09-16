import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TCopyProvider } from '@i18n/TCopyContext';
import type { ClipboardItem } from '@shared/ipc/clipboard';
import { ClipboardHistoryHeader } from '../ClipboardHistoryHeader';
import { buildClipboardFilterInput, filterClipboardItems } from '../clipboardFilter';
import { useAppStore } from '@stores/slicedStore';

vi.mock('@stores/slicedStore', () => ({
  useAppStore: vi.fn(),
}));

const dict: Record<string, string> = {
  clipboardHistory: '剪贴板历史',
  clipboardText: '文本',
  clipboardImage: '图片',
  clipboardFilter: '筛选类型',
  clipboardFilterAll: '全部',
  clipboardSearchPlaceholder: '搜索剪贴板',
  browserBack: '后退',
  clipboardClearAll: '清空全部剪贴板历史',
  clipboardClearFiltered: '清空当前搜索和筛选后的剪贴板历史',
  clipboardClearConfirmAll: '确定清空全部剪贴板历史？此操作不可恢复',
  clipboardClearConfirmScoped: '确定清空{scope}的剪贴板历史？此操作不可恢复',
  clipboardClearScopeSearch: '搜索"{query}"',
  clipboardClearScopeFilter: '筛选类型为"{kind}"',
  clipboardClearScopeJoin: '{a}和{b}',
  clipboardClearScopeOptions: '{scope}（{options}）',
  clipboardListSeparator: '、',
  searchPanelMatchCase: '区分大小写',
  searchPanelMatchWholeWord: '全字匹配',
  searchPanelUseRegex: '使用正则表达式',
  close: '关闭',
  cancel: '取消',
  confirm: '确定',
};
const mockT = new Proxy(dict, { get: (target, key) => target[String(key)] ?? String(key) });

function makeItem(id: string, kind = 'text', content = `content ${id}`): ClipboardItem {
  return { id, kind, content, createdAt: Date.now() } as unknown as ClipboardItem;
}

const ITEMS = [makeItem('1'), makeItem('2'), makeItem('3', 'image', undefined)];
const clearAllClipboard = vi.fn().mockResolvedValue(undefined);
const removeClipboardItem = vi.fn().mockResolvedValue(undefined);
const setClipboardKindFilter = vi.fn();

function renderHeader(overrides: Record<string, unknown> = {}) {
  const state: Record<string, unknown> = {
    clipboardHistory: ITEMS,
    clipboardSearch: '',
    clipboardSearchOpen: false,
    clipboardMatchCase: false,
    clipboardMatchWholeWord: false,
    clipboardUseRegex: false,
    clipboardKindFilter: 'all',
    setClipboardSearch: vi.fn(),
    setClipboardSearchOpen: vi.fn(),
    setClipboardMatchCase: vi.fn(),
    setClipboardMatchWholeWord: vi.fn(),
    setClipboardUseRegex: vi.fn(),
    setClipboardKindFilter,
    clearAllClipboard,
    removeClipboardItem,
    ...overrides,
  };
  vi.mocked(useAppStore).mockImplementation((selector: (s: any) => any) => selector(state));
  const visibleItems = filterClipboardItems(
    state.clipboardHistory as ClipboardItem[],
    buildClipboardFilterInput({
      kindFilter: state.clipboardKindFilter as string,
      searchOpen: state.clipboardSearchOpen as boolean,
      query: state.clipboardSearch as string,
      matchCase: state.clipboardMatchCase as boolean,
      matchWholeWord: state.clipboardMatchWholeWord as boolean,
      useRegex: state.clipboardUseRegex as boolean,
    }),
  );
  render(
    <TCopyProvider t={mockT as never} locale="zh-CN">
      <ClipboardHistoryHeader visibleItems={visibleItems} />
    </TCopyProvider>,
  );
}

function openConfirm(label = '清空全部剪贴板历史') {
  fireEvent.click(screen.getByRole('button', { name: label }));
}

async function confirm() {
  fireEvent.click(screen.getByRole('button', { name: '确定' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('ClipboardHistoryHeader', () => {
  it('shows the visible count and clears everything when nothing narrows the list', async () => {
    renderHeader();
    expect(screen.getByRole('status').textContent).toBe('3');
    openConfirm();
    expect(screen.getByText('确定清空全部剪贴板历史？此操作不可恢复')).toBeTruthy();
    await confirm();
    expect(clearAllClipboard).toHaveBeenCalledTimes(1);
    expect(removeClipboardItem).not.toHaveBeenCalled();
  });

  it('deletes only visible items when a kind filter is active', async () => {
    renderHeader({ clipboardKindFilter: 'image' });
    expect(screen.getByRole('status').textContent).toBe('1');
    openConfirm('清空当前搜索和筛选后的剪贴板历史');
    await confirm();
    expect(removeClipboardItem).toHaveBeenCalledWith('3');
    expect(removeClipboardItem).toHaveBeenCalledTimes(1);
    expect(clearAllClipboard).not.toHaveBeenCalled();
  });

  it('describes the filter scope in the confirmation text', () => {
    renderHeader({ clipboardKindFilter: 'image' });
    openConfirm('清空当前搜索和筛选后的剪贴板历史');
    expect(screen.getByText('确定清空筛选类型为"图片"的剪贴板历史？此操作不可恢复')).toBeTruthy();
  });

  it('includes the query and match options in the confirmation text', () => {
    renderHeader({
      clipboardHistory: [makeItem('9', 'text', 'good stuff')],
      clipboardSearchOpen: true,
      clipboardSearch: 'good',
      clipboardUseRegex: true,
    });
    openConfirm('清空当前搜索和筛选后的剪贴板历史');
    expect(
      screen.getByText('确定清空搜索"good"（使用正则表达式）的剪贴板历史？此操作不可恢复'),
    ).toBeTruthy();
  });

  it('joins the search and filter scopes in the confirmation text', () => {
    renderHeader({
      clipboardHistory: [makeItem('9', 'text', 'good stuff')],
      clipboardSearchOpen: true,
      clipboardSearch: 'good',
      clipboardKindFilter: 'text',
    });
    openConfirm('清空当前搜索和筛选后的剪贴板历史');
    expect(
      screen.getByText('确定清空搜索"good"和筛选类型为"文本"的剪贴板历史？此操作不可恢复'),
    ).toBeTruthy();
  });

  it('closes the confirmation dialog on Escape', () => {
    renderHeader();
    openConfirm();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the confirmation dialog open while clearing is in flight', async () => {
    let resolveRemove: ((value: void) => void) | undefined;
    removeClipboardItem.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveRemove = resolve;
        }),
    );
    renderHeader({ clipboardKindFilter: 'image' });
    openConfirm('清空当前搜索和筛选后的剪贴板历史');
    fireEvent.click(screen.getByRole('button', { name: '确定' }));
    await waitFor(() => expect(removeClipboardItem).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: '确定' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeTruthy();
    resolveRemove?.();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('resets a stale kind filter back to all', async () => {
    renderHeader({ clipboardKindFilter: 'files' });
    await waitFor(() => expect(setClipboardKindFilter).toHaveBeenCalledWith('all'));
  });

  it('disables the clear action when nothing is visible', () => {
    renderHeader({ clipboardHistory: [] });
    expect(screen.getByRole('button', { name: '清空全部剪贴板历史' })).toBeDisabled();
  });

  it('lists every present kind with its count in the filter menu', () => {
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: /筛选类型/ }));
    const items = screen.getAllByRole('menuitemradio');
    expect(items.map((item) => item.textContent)).toEqual(['全部3', '文本2', '图片1']);
  });

  it('focuses the checked item on open, moves with arrows, and returns focus on Escape', () => {
    renderHeader({ clipboardKindFilter: 'image' });
    const trigger = screen.getByRole('button', { name: /筛选类型/ });
    fireEvent.click(trigger);
    const options = screen.getAllByRole('menuitemradio');
    // 菜单项顺序固定为 全部 / 文本 / 图片；当前筛选项为「图片」→ 打开时聚焦最后一项
    expect(document.activeElement).toBe(options[2]);
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(options[0]);
    fireEvent.keyDown(document, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(options[2]);
    fireEvent.keyDown(document, { key: 'Home' });
    expect(document.activeElement).toBe(options[0]);
    fireEvent.keyDown(document, { key: 'End' });
    expect(document.activeElement).toBe(options[2]);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('moves focus with Home/ArrowUp and recovers when focus escaped the items', () => {
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: /筛选类型/ }));
    const options = screen.getAllByRole('menuitemradio');
    fireEvent.keyDown(document, { key: 'Home' });
    expect(document.activeElement).toBe(options[0]);
    fireEvent.keyDown(document, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(options[2]);
    // 焦点被移到菜单外（未关闭菜单）时，方向键应从第一项重新进入
    (document.activeElement as HTMLElement | null)?.blur?.();
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(options[0]);
  });
});
