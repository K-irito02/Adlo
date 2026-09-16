import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach } from 'vitest';
import { TCopyProvider } from '@i18n/TCopyContext';
import { ClipboardItemRow } from './ClipboardItemRow';
import type { ClipboardItem } from '@shared/ipc/clipboard';
import { useAppStore } from '@stores/slicedStore';

vi.mock('@stores/slicedStore', () => ({
  useAppStore: vi.fn(),
}));

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => {
    const name = String(key);
    const map: Record<string, string> = {
      clipboardText: '文本',
      clipboardImage: '图片',
      clipboardCopy: '复制',
      clipboardZoomView: '放大查看',
      clipboardDeleteOne: '删除本条',
      copySuccessClipboard: '已复制到剪贴板',
      relativeTimeJustNow: '刚刚',
      relativeTimeMinutesAgo: '{n} 分钟前',
      relativeTimeHoursAgo: '{n} 小时前',
      relativeTimeDaysAgo: '{n} 天前',
    };
    return map[name] ?? name;
  },
});

function makeItem(overrides: Partial<ClipboardItem> = {}): ClipboardItem {
  return {
    id: 'c1',
    kind: 'text',
    content: 'hello clipboard',
    digest: null,
    imagePath: undefined,
    thumbPath: undefined,
    imageWidth: undefined,
    imageHeight: undefined,
    sourceApp: undefined,
    createdAt: Date.now() - 120_000,
    ...overrides,
  } as unknown as ClipboardItem;
}

const removeClipboardItem = vi.fn();
const writeClipboardItem = vi.fn().mockResolvedValue(true);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAppStore).mockImplementation((selector: (state: any) => any) =>
    selector({ removeClipboardItem, writeClipboardItem }),
  );
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  (window as unknown as { digitalLife: unknown }).digitalLife = {
    clipboard: {
      getThumbUrl: () => 'thumb://a.png',
      getImageUrl: () => 'image://a.png',
    },
  };
});

afterEach(cleanup);

function renderRow(item: ClipboardItem, onZoom = vi.fn()) {
  render(
    <TCopyProvider t={mockT as never} locale="zh-CN">
      <ul>
        <ClipboardItemRow item={item} onZoom={onZoom} />
      </ul>
    </TCopyProvider>,
  );
  return onZoom;
}

describe('ClipboardItemRow', () => {
  it('renders the kind badge and relative timestamp', () => {
    renderRow(makeItem());
    expect(screen.getByText('文本')).toBeTruthy();
    expect(screen.getByText('2 分钟前')).toBeTruthy();
  });

  it('opens the zoom viewer on row click without copying to the clipboard', () => {
    const onZoom = renderRow(makeItem());
    fireEvent.click(screen.getByRole('button', { name: /hello clipboard|文本/ }));
    expect(onZoom).toHaveBeenCalledTimes(1);
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
  });

  it('copies text from the copy button without opening the zoom viewer', () => {
    const onZoom = renderRow(makeItem());
    fireEvent.click(screen.getByRole('button', { name: '复制' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello clipboard');
    expect(onZoom).not.toHaveBeenCalled();
  });

  it('deletes the item from the close button without opening the zoom viewer', () => {
    const onZoom = renderRow(makeItem());
    fireEvent.click(screen.getByRole('button', { name: '删除本条' }));
    expect(removeClipboardItem).toHaveBeenCalledWith('c1');
    expect(onZoom).not.toHaveBeenCalled();
  });

  it('writes an image item back to the system clipboard via the copy button', () => {
    renderRow(makeItem({ kind: 'image', content: undefined, imagePath: 'C:/clip/a.png' }));
    fireEvent.click(screen.getByRole('button', { name: '复制' }));
    expect(writeClipboardItem).toHaveBeenCalledWith('c1');
  });
});
