import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { CopyDict } from '@i18n/types';
import { TCopyProvider } from '@i18n/TCopyContext';
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
      fireEvent.pointerMove(window, { clientX: 0, clientY: 2, pointerId: 1 });
      fireEvent.pointerUp(window, { clientX: 0, clientY: 2, pointerId: 1 });
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

  it('portals the insertion line above the ghost without inserting a flex child', () => {
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
      fireEvent.pointerMove(window, { clientX: 0, clientY: 2, pointerId: 1 });

      const overlay = document.querySelector('.adl-browser-tab-drop-line-overlay') as HTMLElement;
      expect(overlay).not.toBeNull();
      // portal 到 body，才能用 10000 的 z-index 盖在抬起副本之上。
      expect(overlay.parentElement).toBe(document.body);
      expect(overlay.style.left).toBe('8px');
      expect(overlay.style.width).toBe('184px');
      expect(document.querySelector('.adl-browser-tab-drop-line')).toBeNull();
      // 插入线不再作为 <li> 进入布局，列表子元素数量保持不变。
      expect(list.children.length).toBe(listChildrenBefore);
    } finally {
      fireEvent.pointerUp(window, { clientX: 0, clientY: 2, pointerId: 1 });
      doc.elementFromPoint = originalElementFromPoint;
    }
  });
});
