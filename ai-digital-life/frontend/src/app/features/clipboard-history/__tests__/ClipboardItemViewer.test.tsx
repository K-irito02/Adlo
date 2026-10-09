import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TCopyProvider } from '@i18n/TCopyContext';
import type { ClipboardItem } from '@shared/ipc/clipboard';
import { useAppStore } from '@stores/slicedStore';
import { ClipboardItemViewer } from '../ClipboardItemViewer';

vi.mock('@stores/slicedStore', () => ({
  useAppStore: vi.fn(),
}));

const mockT = {
  clipboardText: '文本',
  clipboardImage: '图片',
  clipboardZoomView: '放大查看',
  clipboardExport: '保存为文件',
  clipboardEdit: '编辑',
  close: '关闭',
} as never;

function makeItem(overrides: Partial<ClipboardItem> = {}): ClipboardItem {
  return {
    id: 'c1',
    kind: 'text',
    content: 'hello clipboard',
    createdAt: Date.now(),
    ...overrides,
  } as unknown as ClipboardItem;
}

function mockStore(store: Record<string, unknown>) {
  vi.mocked(useAppStore).mockImplementation((selector: (s: any) => any) => selector(store));
}

function renderViewer(item: ClipboardItem) {
  const onClose = vi.fn();
  render(
    <TCopyProvider t={mockT} locale="zh-CN">
      <ClipboardItemViewer item={item} onClose={onClose} />
    </TCopyProvider>,
  );
  return onClose;
}

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  mockStore({ updateClipboardItem: vi.fn().mockResolvedValue(true) });
  (window as unknown as { digitalLife: unknown }).digitalLife = {
    clipboard: {
      exportUrl: (id: string) => `http://test/clipboard/export?id=${id}`,
      getImageUrl: () => 'image://original.png',
      getThumbUrl: () => 'thumb://thumb.png',
      getHtmlUrl: () => 'html://a.html',
      getRtfUrl: () => 'rtf://a.rtf',
    },
  };
});

describe('ClipboardItemViewer', () => {
  it('renders the full text content in a dialog', () => {
    renderViewer(makeItem());
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('hello clipboard')).toBeTruthy();
    expect(screen.getByText('文本')).toBeTruthy();
  });

  it('closes on Escape', () => {
    const onClose = renderViewer(makeItem());
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on backdrop click and keeps the panel click from closing', () => {
    const onClose = renderViewer(makeItem());
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector('.adl-clipboard-viewer') as Element);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('traps Tab inside the panel and restores focus on unmount', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    renderViewer(makeItem());
    const closeButton = screen.getByRole('button', { name: '关闭' });
    expect(document.activeElement).toBe(closeButton);
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(closeButton);
    cleanup();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('shows the original image for image items', () => {
    renderViewer(makeItem({ kind: 'image', content: undefined, imagePath: 'C:/a.png' }));
    expect(screen.getByRole('img').getAttribute('src')).toBe('image://original.png');
  });

  it('falls back to the thumbnail and then to the icon placeholder', () => {
    const { container } = render(
      <TCopyProvider t={mockT} locale="zh-CN">
        <ClipboardItemViewer
          item={makeItem({ kind: 'image', content: undefined, imagePath: 'C:/a.png' })}
          onClose={vi.fn()}
        />
      </TCopyProvider>,
    );
    const img = screen.getByRole('img');
    fireEvent.error(img);
    expect(screen.getByRole('img').getAttribute('src')).toBe('thumb://thumb.png');
    fireEvent.error(screen.getByRole('img'));
    expect(container.querySelector('.adl-clipboard-viewer__image')).toBeNull();
  });

  it('offers a save-to-file download link for every kind', () => {
    renderViewer(makeItem());
    const link = screen.getByRole('link', { name: '保存为文件' }) as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('http://test/clipboard/export?id=c1');
    expect(link.hasAttribute('download')).toBe(true);

    cleanup();
    // 图片条目没有文本工具栏，导出入口必须仍在（本轮评审发现 1 的回归保护）。
    renderViewer(makeItem({ kind: 'image', content: undefined, imagePath: 'C:/a.png' }));
    expect(
      screen.getByRole('link', { name: '保存为文件' }).getAttribute('href'),
    ).toBe('http://test/clipboard/export?id=c1');
  });

  it('offers the edit affordance for text items only', () => {
    renderViewer(makeItem());
    expect(screen.getByRole('button', { name: '编辑' })).toBeTruthy();

    cleanup();
    renderViewer(makeItem({ kind: 'image', content: undefined, imagePath: 'C:/a.png' }));
    expect(screen.queryByRole('button', { name: '编辑' })).toBeNull();
  });

  it('saves on close while editing', async () => {
    const updateClipboardItem = vi.fn().mockResolvedValue(true);
    mockStore({ updateClipboardItem });
    renderViewer(makeItem({ id: 'c1', content: 'hello' }));

    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    const box = screen.getByRole('textbox');
    await userEvent.clear(box);
    await userEvent.type(box, 'changed');
    await userEvent.click(screen.getByRole('button', { name: '关闭' }));

    await waitFor(() => expect(updateClipboardItem).toHaveBeenCalledWith('c1', 'changed'));
  });

  it('persists pending edits when the viewer unmounts mid-edit', async () => {
    const updateClipboardItem = vi.fn().mockResolvedValue(true);
    mockStore({ updateClipboardItem });
    renderViewer(makeItem({ id: 'c1', content: 'hello' }));

    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    const box = screen.getByRole('textbox');
    await userEvent.clear(box);
    await userEvent.type(box, 'late');

    cleanup();
    await waitFor(() => expect(updateClipboardItem).toHaveBeenCalledWith('c1', 'late'));
  });

  it('Ctrl+Z undoes and Esc cancels back to the original', async () => {
    const updateClipboardItem = vi.fn().mockResolvedValue(true);
    mockStore({ updateClipboardItem });
    renderViewer(makeItem({ id: 'c1', content: 'hello' }));

    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    const box = screen.getByRole('textbox') as HTMLTextAreaElement;
    await userEvent.type(box, 'X');
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(box.value).toBe('hello');

    await userEvent.type(box, 'Y');
    await userEvent.keyboard('{Escape}');
    expect(updateClipboardItem).not.toHaveBeenCalled();
  });

  it('Ctrl+Y redoes after an undo', async () => {
    const updateClipboardItem = vi.fn().mockResolvedValue(true);
    mockStore({ updateClipboardItem });
    renderViewer(makeItem({ id: 'c1', content: 'hello' }));

    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    const box = screen.getByRole('textbox') as HTMLTextAreaElement;
    await userEvent.type(box, 'X');
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(box.value).toBe('hello');
    await userEvent.keyboard('{Control>}y{/Control}');
    expect(box.value).toBe('helloX');
  });

  it('Ctrl+S saves, exits edit mode and keeps the modal open', async () => {
    const updateClipboardItem = vi.fn().mockResolvedValue(true);
    mockStore({ updateClipboardItem });
    renderViewer(makeItem({ id: 'c1', content: 'hello' }));

    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    const box = screen.getByRole('textbox');
    await userEvent.clear(box);
    await userEvent.type(box, 'saved');
    await userEvent.keyboard('{Control>}s{/Control}');

    await waitFor(() => expect(updateClipboardItem).toHaveBeenCalledWith('c1', 'saved'));
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('saved')).toBeTruthy();
  });

  it('issues a single save when Ctrl+S is pressed again while a save is in flight', async () => {
    let resolveSave: (value: boolean) => void = () => {};
    const updateClipboardItem = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSave = resolve;
        }),
    );
    mockStore({ updateClipboardItem });
    renderViewer(makeItem({ id: 'c1', content: 'hello' }));

    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    const box = screen.getByRole('textbox');
    await userEvent.clear(box);
    await userEvent.type(box, 'once');

    await userEvent.keyboard('{Control>}s{/Control}');
    await userEvent.keyboard('{Control>}s{/Control}');
    expect(updateClipboardItem).toHaveBeenCalledTimes(1);

    resolveSave(true);
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
  });
});
