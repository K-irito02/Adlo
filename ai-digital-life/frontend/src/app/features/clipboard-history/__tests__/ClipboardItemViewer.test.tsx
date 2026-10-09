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
  clipboardCopy: '复制',
  clipboardImageDimensions: '尺寸 {width}×{height}',
  clipboardImageFormat: '格式 {format}',
  clipboardImageByteSize: '体积 {size}',
  clipboardImageMetaSeparator: ' · ',
  clipboardImageZoomIn: '放大图片',
  clipboardImageZoomOut: '缩小图片',
  clipboardImageFitWindow: '适应窗口',
  clipboardSaveFailedTitle: '更改尚未保存',
  clipboardSaveFailedMessage: '保存失败，更改尚未保存。放弃更改并关闭弹窗？',
  clipboardDiscardChanges: '放弃更改',
  clipboardKeepEditing: '继续编辑',
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
  mockStore({
    updateClipboardItem: vi.fn().mockResolvedValue(true),
    writeClipboardItem: vi.fn().mockResolvedValue(true),
  });
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

  it('keeps Tab focus cycling inside the panel and restores focus on unmount', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    renderViewer(makeItem());
    const closeButton = screen.getByRole('button', { name: '关闭' });
    expect(document.activeElement).toBe(closeButton);

    const panel = screen.getByRole('dialog');
    const focusables = Array.from(
      panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    expect(focusables.length).toBeGreaterThan(1);

    // Tab 前进到面板内的下一个可聚焦控件（不再永远停在关闭按钮）
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(panel.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(closeButton);

    // 最后一个 → Tab 环绕回第一个
    focusables[focusables.length - 1].focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(focusables[0]);

    // 第一个 → Shift+Tab 环绕到最后一个
    focusables[0].focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(focusables[focusables.length - 1]);

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

  it('persists the newest draft typed during an in-flight save before closing', async () => {
    const resolvers: Array<(value: boolean) => void> = [];
    const updateClipboardItem = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    mockStore({ updateClipboardItem });
    const onClose = renderViewer(makeItem({ id: 'c1', content: 'hello' }));

    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    const box = screen.getByRole('textbox');
    await userEvent.clear(box);
    await userEvent.type(box, 'first');
    // 触发首轮保存（在途）
    await userEvent.keyboard('{Control>}s{/Control}');
    expect(updateClipboardItem).toHaveBeenNthCalledWith(1, 'c1', 'first');

    // 保存仍在途时继续输入，然后关闭：关闭需等待在途保存并补写最新草稿
    await userEvent.type(box, 'X');
    await userEvent.click(screen.getByRole('button', { name: '关闭' }));

    resolvers[0](true);
    await waitFor(() => expect(updateClipboardItem).toHaveBeenCalledTimes(2));
    expect(updateClipboardItem).toHaveBeenNthCalledWith(2, 'c1', 'firstX');

    resolvers[1](true);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('shows image dimensions, format and byte size, omitting unknown parts', () => {
    renderViewer(
      makeItem({
        kind: 'image',
        content: undefined,
        imagePath: 'C:/a.png',
        imageWidth: 1920,
        imageHeight: 1080,
        imageBytes: 2048,
      }),
    );
    expect(screen.getByText('尺寸 1920×1080 · 格式 PNG · 体积 2.0 KB')).toBeTruthy();

    cleanup();
    // 尺寸与体积未知 → 只保留恒定的格式读数，不打印占位符
    renderViewer(makeItem({ kind: 'image', content: undefined, imagePath: 'C:/a.png' }));
    expect(screen.getByText('格式 PNG')).toBeTruthy();
  });

  it('zooms the image between 25% and 400% and resets fit-to-window to 100%', async () => {
    renderViewer(
      makeItem({
        kind: 'image',
        content: undefined,
        imagePath: 'C:/a.png',
        imageWidth: 1000,
        imageHeight: 500,
      }),
    );
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.style.width).toBe('1000px');
    expect(img.style.maxWidth).toBe('100%');

    await userEvent.click(screen.getByRole('button', { name: '放大图片' }));
    expect(img.style.width).toBe('1100px');
    expect(img.style.maxWidth).toBe('none');

    await userEvent.click(screen.getByRole('button', { name: '适应窗口' }));
    expect(img.style.width).toBe('1000px');
    expect(img.style.maxWidth).toBe('100%');

    // 缩小到 25% 下限后不再继续变小
    for (let i = 0; i < 10; i += 1) {
      await userEvent.click(screen.getByRole('button', { name: '缩小图片' }));
    }
    expect(img.style.width).toBe('250px');
  });

  it('offers a copy control for every kind wired to writeClipboardItem', async () => {
    const writeClipboardItem = vi.fn().mockResolvedValue(true);
    mockStore({ updateClipboardItem: vi.fn().mockResolvedValue(true), writeClipboardItem });

    renderViewer(makeItem());
    await userEvent.click(screen.getByRole('button', { name: '复制' }));
    expect(writeClipboardItem).toHaveBeenCalledWith('c1');

    cleanup();
    renderViewer(makeItem({ kind: 'image', content: undefined, imagePath: 'C:/a.png' }));
    await userEvent.click(screen.getByRole('button', { name: '复制' }));
    expect(writeClipboardItem).toHaveBeenCalledTimes(2);
    expect(writeClipboardItem).toHaveBeenLastCalledWith('c1');
  });

  it('keeps edit mode and does not advance the baseline when a save fails', async () => {
    const updateClipboardItem = vi.fn().mockResolvedValue(false);
    mockStore({ updateClipboardItem });
    const onClose = renderViewer(makeItem({ id: 'c1', content: 'hello' }));

    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    const box = screen.getByRole('textbox');
    await userEvent.clear(box);
    await userEvent.type(box, 'willfail');
    await userEvent.keyboard('{Control>}s{/Control}');

    await waitFor(() => expect(updateClipboardItem).toHaveBeenCalledWith('c1', 'willfail'));
    // 保存失败：保持编辑态（可重试）、草稿不丢，且不关闭弹窗
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('willfail');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the viewer open with a discard/keep confirm when closing after a failed save', async () => {
    const updateClipboardItem = vi.fn().mockResolvedValue(false);
    mockStore({ updateClipboardItem });
    const onClose = renderViewer(makeItem({ id: 'c1', content: 'hello' }));

    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    const box = screen.getByRole('textbox');
    await userEvent.clear(box);
    await userEvent.type(box, 'unsaved');
    await userEvent.click(screen.getByRole('button', { name: '关闭' }));

    // 保存失败：弹窗不关闭，弹出「放弃更改 / 继续编辑」确认框
    await waitFor(() => expect(updateClipboardItem).toHaveBeenCalledWith('c1', 'unsaved'));
    expect(onClose).not.toHaveBeenCalled();
    const confirm = screen.getByRole('dialog', { name: '更改尚未保存' });
    expect(confirm).toBeTruthy();

    // 「继续编辑」：确认框关闭，仍在编辑态，草稿原样保留可重试
    await userEvent.click(screen.getByRole('button', { name: '继续编辑' }));
    expect(screen.queryByRole('dialog', { name: '更改尚未保存' })).toBeNull();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('unsaved');
    expect(onClose).not.toHaveBeenCalled();

    // 再次关闭 → 再次确认 → 「放弃更改」：不再重试保存，直接关闭
    await userEvent.click(screen.getByRole('button', { name: '关闭' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: '更改尚未保存' })).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: '放弃更改' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(updateClipboardItem).toHaveBeenCalledTimes(2);
  });

  it('skips the best-effort save on unmount after discarding changes', async () => {
    const updateClipboardItem = vi.fn().mockResolvedValue(false);
    mockStore({ updateClipboardItem });
    renderViewer(makeItem({ id: 'c1', content: 'hello' }));

    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    const box = screen.getByRole('textbox');
    await userEvent.clear(box);
    await userEvent.type(box, 'gone');
    await userEvent.click(screen.getByRole('button', { name: '关闭' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: '更改尚未保存' })).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: '放弃更改' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '更改尚未保存' })).toBeNull());

    // 父组件随后卸载查看器：已确认放弃更改 → 卸载兜底保存必须跳过
    cleanup();
    expect(updateClipboardItem).toHaveBeenCalledTimes(1);
  });

  it('still saves later edits after a no-op Ctrl+S (no stale in-flight lock)', async () => {
    const updateClipboardItem = vi.fn().mockResolvedValue(true);
    mockStore({ updateClipboardItem });
    renderViewer(makeItem({ id: 'c1', content: 'hello' }));

    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    // 未做任何修改就 Ctrl+S：不得把单飞锁（savingRef）永久占住。
    await userEvent.keyboard('{Control>}s{/Control}');
    expect(updateClipboardItem).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).toBeNull();

    // 再次编辑并关闭：本次修改必须真正落盘（回归保护）。
    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    const box = screen.getByRole('textbox');
    await userEvent.type(box, 'X');
    await userEvent.click(screen.getByRole('button', { name: '关闭' }));
    await waitFor(() => expect(updateClipboardItem).toHaveBeenCalledWith('c1', 'helloX'));
  });

  it('does not expose a navigable export link when the export URL is empty (mock fallback)', () => {
    (window as unknown as { digitalLife: unknown }).digitalLife = {
      clipboard: {
        exportUrl: () => '',
        getImageUrl: () => '',
        getThumbUrl: () => '',
        getHtmlUrl: () => '',
        getRtfUrl: () => '',
      },
    };
    renderViewer(makeItem());
    const anchor = document.querySelector(
      '.adl-clipboard-viewer__header a',
    ) as HTMLAnchorElement | null;
    expect(anchor).not.toBeNull();
    expect(anchor?.hasAttribute('href')).toBe(false);
  });
});
