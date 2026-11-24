import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { CopyDict } from '@i18n/types';
import { TCopyProvider } from '@i18n/TCopyContext';
import { useAppStore } from '@stores/slicedStore';
import type { BrowserTabState } from '@stores/slices/browserSlice';
import { BrowserOpenTabFlatList } from '../BrowserOpenTabFlatList';

const t = {
  browserOpenTabsEmpty: 'No open tabs',
  browserPinnedGroupLabel: 'Pinned',
  browserClose: 'Close',
  newTabPage: 'New tab',
  browserRefreshMeta: 'Refresh',
  browserRefreshMetaHint: 'Refresh metadata',
  browserContextCopyLink: 'Copy link',
  centerTabShowInCenter: 'Show in center',
} as unknown as CopyDict;

function tab(id: string, isPinned: boolean): BrowserTabState {
  return {
    id,
    title: id,
    url: `https://${id}.test`,
    workspaceId: '',
    titleResolved: true,
    isPinned,
    sortOrder: 0,
    isPlayingAudio: false,
    isAudioMuted: false,
    isDownloading: false,
    location: 'panel',
  };
}

function setRect(element: HTMLElement): void {
  element.getBoundingClientRect = () =>
    ({
      top: 0,
      left: 0,
      right: 200,
      bottom: 30,
      width: 200,
      height: 30,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
}

describe('BrowserOpenTabFlatList reorder', () => {
  it('renders a pinned group divider and reorders normal tabs', () => {
    const onReorderTabs = vi.fn();
    const tabs = [tab('pinned', true), tab('normal-a', false), tab('normal-b', false)];

    render(
      <TCopyProvider t={t} locale="en-US">
        <BrowserOpenTabFlatList
          browserTabs={tabs}
          activeTabId="pinned"
          onSelectTab={vi.fn()}
          onCloseTab={vi.fn()}
          onReorderTabs={onReorderTabs}
        />
      </TCopyProvider>,
    );

    expect(screen.getByText('Pinned')).toBeInTheDocument();

    const source = screen.getByText('normal-b').closest('[data-path]') as HTMLElement;
    const target = screen.getByText('normal-a').closest('[data-path]') as HTMLElement;
    setRect(source);
    setRect(target);
    const doc = document as Document & {
      elementFromPoint?: (x: number, y: number) => Element | null;
    };
    const originalElementFromPoint = doc.elementFromPoint;
    doc.elementFromPoint = () => target;
    try {
      fireEvent.pointerDown(source, { button: 0, clientX: 0, clientY: 0, pointerId: 1 });
      fireEvent.pointerMove(window, { clientX: 0, clientY: 6, pointerId: 1 });
      fireEvent.pointerUp(window, { clientX: 0, clientY: 6, pointerId: 1 });
    } finally {
      doc.elementFromPoint = originalElementFromPoint;
    }

    expect(onReorderTabs).toHaveBeenCalledTimes(1);
    expect(onReorderTabs.mock.calls[0][0].map((item: BrowserTabState) => item.id)).toEqual([
      'pinned',
      'normal-b',
      'normal-a',
    ]);
  });

  it('portals the insertion line to body without adding a flex child', () => {
    const tabs = [tab('normal-a', false), tab('normal-b', false)];

    const { container } = render(
      <TCopyProvider t={t} locale="en-US">
        <BrowserOpenTabFlatList
          browserTabs={tabs}
          activeTabId="normal-a"
          onSelectTab={vi.fn()}
          onCloseTab={vi.fn()}
        />
      </TCopyProvider>,
    );

    const list = container.querySelector('.adl-filetree') as HTMLElement;
    const source = screen.getByText('normal-b').closest('[data-path]') as HTMLElement;
    const target = screen.getByText('normal-a').closest('[data-path]') as HTMLElement;
    setRect(source);
    setRect(target);
    const listChildrenBefore = list.children.length;

    const doc = document as Document & {
      elementFromPoint?: (x: number, y: number) => Element | null;
    };
    const originalElementFromPoint = doc.elementFromPoint;
    doc.elementFromPoint = () => target;
    try {
      fireEvent.pointerDown(source, { button: 0, clientX: 0, clientY: 0, pointerId: 1 });
      fireEvent.pointerMove(window, { clientX: 0, clientY: 6, pointerId: 1 });

      const overlay = document.querySelector('.adl-browser-tab-drop-line-overlay') as HTMLElement;
      expect(overlay).not.toBeNull();
      // portal 到 body，才能用高于副本的 z-index 绘制，且不参与列表布局。
      expect(overlay.parentElement).toBe(document.body);
      expect(overlay.style.left).toBe('8px');
      expect(overlay.style.width).toBe('184px');
      expect(document.querySelector('.adl-browser-tab-drop-line')).toBeNull();
      // 插入线不再作为 <li> 进入布局，列表子元素数量保持不变。
      expect(list.children.length).toBe(listChildrenBefore);
    } finally {
      fireEvent.pointerUp(window, { clientX: 0, clientY: 6, pointerId: 1 });
      doc.elementFromPoint = originalElementFromPoint;
    }
  });

  it('inserts after the target row when the pointer is in its lower half', () => {
    const onReorderTabs = vi.fn();
    const tabs = [tab('normal-a', false), tab('normal-b', false)];
    render(
      <TCopyProvider t={t} locale="en-US">
        <BrowserOpenTabFlatList
          browserTabs={tabs}
          activeTabId="normal-a"
          onSelectTab={vi.fn()}
          onCloseTab={vi.fn()}
          onReorderTabs={onReorderTabs}
        />
      </TCopyProvider>,
    );

    const source = screen.getByText('normal-a').closest('[data-path]') as HTMLElement;
    const target = screen.getByText('normal-b').closest('[data-path]') as HTMLElement;
    setRect(source);
    setRect(target);

    const doc = document as Document & {
      elementFromPoint?: (x: number, y: number) => Element | null;
    };
    const originalElementFromPoint = doc.elementFromPoint;
    doc.elementFromPoint = () => target;
    try {
      fireEvent.pointerDown(source, { button: 0, clientX: 0, clientY: 0, pointerId: 1 });
      fireEvent.pointerMove(window, { clientX: 0, clientY: 20, pointerId: 1 });
      fireEvent.pointerUp(window, { clientX: 0, clientY: 20, pointerId: 1 });
    } finally {
      doc.elementFromPoint = originalElementFromPoint;
    }

    expect(onReorderTabs).toHaveBeenCalledTimes(1);
    expect(onReorderTabs.mock.calls[0][0].map((item: BrowserTabState) => item.id)).toEqual([
      'normal-b',
      'normal-a',
    ]);
  });

  it('does not start a reorder before the 4px drag threshold', () => {
    const onReorderTabs = vi.fn();
    const tabs = [tab('normal-a', false), tab('normal-b', false)];
    render(
      <TCopyProvider t={t} locale="en-US">
        <BrowserOpenTabFlatList
          browserTabs={tabs}
          activeTabId="normal-a"
          onSelectTab={vi.fn()}
          onCloseTab={vi.fn()}
          onReorderTabs={onReorderTabs}
        />
      </TCopyProvider>,
    );

    const source = screen.getByText('normal-a').closest('[data-path]') as HTMLElement;
    const target = screen.getByText('normal-b').closest('[data-path]') as HTMLElement;
    setRect(source);
    setRect(target);

    const doc = document as Document & {
      elementFromPoint?: (x: number, y: number) => Element | null;
    };
    const originalElementFromPoint = doc.elementFromPoint;
    doc.elementFromPoint = () => target;
    try {
      fireEvent.pointerDown(source, { button: 0, clientX: 0, clientY: 0, pointerId: 1 });
      fireEvent.pointerMove(window, { clientX: 0, clientY: 2, pointerId: 1 });
      fireEvent.pointerUp(window, { clientX: 0, clientY: 2, pointerId: 1 });
    } finally {
      doc.elementFromPoint = originalElementFromPoint;
    }

    expect(onReorderTabs).not.toHaveBeenCalled();
  });

  it('cleans up the ghost/body state and suppresses the post-drag click', () => {
    const onSelectTab = vi.fn();
    const tabs = [tab('normal-a', false), tab('normal-b', false)];
    render(
      <TCopyProvider t={t} locale="en-US">
        <BrowserOpenTabFlatList
          browserTabs={tabs}
          activeTabId="normal-a"
          onSelectTab={onSelectTab}
          onCloseTab={vi.fn()}
        />
      </TCopyProvider>,
    );

    const source = screen.getByText('normal-a').closest('[data-path]') as HTMLElement;
    const target = screen.getByText('normal-b').closest('[data-path]') as HTMLElement;
    setRect(source);
    setRect(target);

    const doc = document as Document & {
      elementFromPoint?: (x: number, y: number) => Element | null;
    };
    const originalElementFromPoint = doc.elementFromPoint;
    doc.elementFromPoint = () => target;
    try {
      fireEvent.pointerDown(source, { button: 0, clientX: 0, clientY: 0, pointerId: 1 });
      fireEvent.pointerMove(window, { clientX: 0, clientY: 6, pointerId: 1 });
      expect(document.querySelector('.adl-browser-dnd-lift')).not.toBeNull();
      expect(document.body.classList.contains('adl-browser-tab-dragging')).toBe(true);

      fireEvent.pointerUp(window, { clientX: 0, clientY: 6, pointerId: 1 });
      expect(document.querySelector('.adl-browser-dnd-lift')).toBeNull();
      expect(document.body.classList.contains('adl-browser-tab-dragging')).toBe(false);

      // 拖拽结束后紧跟的 click 必须被抑制，不能顺带切换标签。
      fireEvent.click(screen.getByText('normal-a'));
      expect(onSelectTab).not.toHaveBeenCalled();
    } finally {
      doc.elementFromPoint = originalElementFromPoint;
    }
  });

  it('hover actions include "Show in center" to the left of Close', () => {
    const original = useAppStore.getState().centerShowBrowserTab;
    const moveToCenter = vi.fn();
    useAppStore.setState({ centerShowBrowserTab: moveToCenter as never });
    const onSelectTab = vi.fn();
    try {
      render(
        <TCopyProvider t={t} locale="en-US">
          <BrowserOpenTabFlatList
            browserTabs={[tab('normal-a', false)]}
            activeTabId="normal-a"
            onSelectTab={onSelectTab}
            onCloseTab={vi.fn()}
          />
        </TCopyProvider>,
      );

      const showInCenter = screen.getByRole('button', { name: 'Show in center' });
      const close = screen.getByRole('button', { name: 'Close' });
      const actions = showInCenter.closest('.adl-browser-node__actions');
      expect(actions).not.toBeNull();
      expect(actions?.contains(close)).toBe(true);
      // DOM 顺序：在中心显示 → 关闭
      expect(
        showInCenter.compareDocumentPosition(close) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

      fireEvent.click(showInCenter);
      expect(moveToCenter).toHaveBeenCalledWith('normal-a');
      // 点击动作按钮不应顺带选中标签。
      expect(onSelectTab).not.toHaveBeenCalled();
    } finally {
      useAppStore.setState({ centerShowBrowserTab: original });
    }
  });
});
