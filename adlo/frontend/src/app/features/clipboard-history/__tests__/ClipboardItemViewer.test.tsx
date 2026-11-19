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
  clipboardExportFailed: '读取剪贴板条目内容失败，未保存',
  clipboardSaveAsFileFailed: '保存为文件失败',
  clipboardWrapOn: '自动换行',
  clipboardWrapOff: '不自动换行',
  clipboardZoomInput: '缩放百分比，直接输入数值',
  clipboardZoomRange: '可用范围 {min}%–{max}%',
  clipboardStatsSummary: '{chars} 字符 · {noSpace} 不含空格 · {lines} 行',
  clipboardImageZoomReset: '重置图片缩放',
  clipboardPreviewRich: '预览富文本',
  clipboardPreviewMarkdown: '预览文本',
  clipboardEdit: '编辑',
  clipboardSave: '保存更改',
  clipboardDiscardEdits: '丢弃更改',
  clipboardCopy: '复制',
  clipboardImageDimensions: '尺寸 {width}×{height}',
  clipboardImageFormat: '格式 {format}',
  clipboardImageByteSize: '体积 {size}',
  clipboardImageMetaSeparator: ' · ',
  clipboardZoomIn: '放大字号',
  clipboardZoomOut: '缩小字号',
  clipboardZoomReset: '重置字号',
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

/** 默认 store 切片（各用例按需覆盖）。 */
const storeSetters = {
  updateClipboardItem: vi.fn().mockResolvedValue(true),
  writeClipboardItem: vi.fn().mockResolvedValue(true),
  reportError: vi.fn(),
};

function setClipboardBridge(overrides: Record<string, unknown> = {}) {
  (window as unknown as { digitalLife: unknown }).digitalLife = {
    clipboard: {
      exportUrl: (id: string) => `http://test/clipboard/export?id=${id}`,
      getImageUrl: () => 'image://original.png',
      getThumbUrl: () => 'thumb://thumb.png',
      getHtmlUrl: () => 'html://a.html',
      getRtfUrl: () => 'rtf://a.rtf',
      ...overrides,
    },
    fileSave: {
      saveToFile: vi.fn().mockResolvedValue({ ok: true, data: {} }),
      ...overrides,
    },
  };
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
  mockStore(storeSetters);
  setClipboardBridge();
});

describe('ClipboardItemViewer', () => {
  it('renders the full text content in a dialog', () => {
    renderViewer(makeItem());
    expect(screen.getByRole('dialog')).toBeTruthy();
    // 浏览面可见、预览面隐藏：两者都挂载，文本断言按面取
    const pre = document.querySelector('.adl-clipboard-viewer__text') as HTMLElement;
    expect(pre.hidden).toBe(false);
    expect(pre.textContent).toBe('hello clipboard');
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
        'a[href]:not([hidden]), button:not([disabled]):not([hidden]), textarea:not([disabled]):not([hidden]), input:not([disabled]):not([hidden]), select:not([disabled]):not([hidden]), [tabindex]:not([tabindex="-1"]):not([hidden])',
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

  it('resets the image fallback stage when switching items', async () => {
    const onClose = vi.fn();
    const broken = makeItem({ id: 'c1', kind: 'image', content: undefined, imagePath: 'C:/a.png' });
    const { rerender } = render(
      <TCopyProvider t={mockT} locale="zh-CN">
        <ClipboardItemViewer item={broken} onClose={onClose} />
      </TCopyProvider>,
    );
    // 原图与缩略图都失败 → 图标占位
    fireEvent.error(screen.getByRole('img'));
    fireEvent.error(screen.getByRole('img'));
    expect(screen.queryByRole('img')).toBeNull();

    // 切到正常条目：不得沿用 none 档位，应重新从原图开始
    rerender(
      <TCopyProvider t={mockT} locale="zh-CN">
        <ClipboardItemViewer
          item={makeItem({ id: 'c2', kind: 'image', content: undefined, imagePath: 'C:/b.png' })}
          onClose={onClose}
        />
      </TCopyProvider>,
    );
    await waitFor(() =>
      expect(screen.getByRole('img').getAttribute('src')).toBe('image://original.png'),
    );
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

  it('moves the wrap and edit controls into the centered header group and the stats row to the bottom', async () => {
    renderViewer(makeItem());
    const panel = screen.getByRole('dialog');
    const groups = panel.querySelectorAll(
      '.adl-clipboard-viewer__header-actions, .adl-clipboard-viewer__tools',
    );
    expect(panel.querySelector('.adl-clipboard-viewer__header')).not.toBeNull();
    // 头部按钮组在工具行之前（工具行即弹窗底部）
    expect(groups[0].className).toBe('adl-clipboard-viewer__header-actions');
    expect(groups[1].className).toBe('adl-clipboard-viewer__tools');
    expect(
      panel.querySelector('.adl-clipboard-viewer__tools .adl-clipboard-viewer__stats'),
    ).not.toBeNull();

    // 居中组顺序：复制 → 换行 → 编辑 → 预览 → 保存为文件
    // （CopyButton 是 `role="button"` 的 span，不是 <button>，需一并取）
    const labelsOf = (group: Element) =>
      Array.from(group.querySelectorAll<HTMLElement>('button, [role="button"]')).map((el) =>
        el.getAttribute('aria-label'),
      );
    expect(labelsOf(groups[0])).toEqual(['复制', '自动换行', '编辑', '预览文本', '保存为文件']);
    // 工具行只保留读数与字号控件（换行 / 编辑 / 预览 已上移）
    expect(Array.from(groups[1].querySelectorAll('button')).map((el) => el.textContent)).toEqual([
      'A-',
      '100%',
      'A+',
    ]);

    // 富文本条目：预览标签换成"预览富文本"，其余位置不变
    cleanup();
    renderViewer(makeItem({ kind: 'html', content: '<p>x</p>', htmlPath: 'a.html' }));
    expect(screen.getByRole('button', { name: '编辑' })).toBeEnabled();
    const htmlGroup = document.querySelector('.adl-clipboard-viewer__header-actions') as Element;
    expect(labelsOf(htmlGroup)).toEqual(['复制', '自动换行', '编辑', '预览富文本', '保存为文件']);

    // 图片条目：既无换行 / 编辑 / 预览，仍保留复制与保存
    cleanup();
    renderViewer(makeItem({ kind: 'image', content: undefined, imagePath: 'C:/a.png' }));
    const imageGroup = document.querySelector('.adl-clipboard-viewer__header-actions') as Element;
    expect(labelsOf(imageGroup)).toEqual(['复制', '保存为文件']);
  });

  it('keeps the close button in the trailing grid cell instead of centering it', () => {
    renderViewer(makeItem());
    // TooltipSimple 会多包一层 .tooltip-trigger —— **那层**才是 header 的 grid 子项，
    // 靠右对齐必须落在显式的 __close-cell 包裹上（写在 button 上对 grid 无效）。
    const cell = document.querySelector('.adl-clipboard-viewer__close-cell') as HTMLElement;
    expect(cell).not.toBeNull();
    const header = document.querySelector('.adl-clipboard-viewer__header') as HTMLElement;
    expect(header.lastElementChild).toBe(cell);
  });

  it('swaps the wrap icon per state and drops word-break when wrap is off', async () => {
    renderViewer(makeItem());
    const onButton = screen.getByRole('button', { name: '自动换行' });
    expect(onButton.getAttribute('aria-pressed')).toBe('true');
    const onPath = onButton.querySelector('svg path')?.getAttribute('d');

    const pre = () => document.querySelector('.adl-clipboard-viewer__text') as HTMLElement;
    expect(pre().style.whiteSpace).toBe('pre-wrap');
    expect(pre().style.wordBreak).toBe('break-word');

    await userEvent.click(onButton);

    const offButton = screen.getByRole('button', { name: '不自动换行' });
    expect(offButton.getAttribute('aria-pressed')).toBe('false');
    // 关闭后换为划除态图标
    expect(offButton.querySelector('svg path')?.getAttribute('d')).not.toBe(onPath);
    // 不换行必须同时解除 word-break/overflow-wrap，否则超长无空格串仍会折行、
    // 内容不横向溢出，横向滚动条也就永远不会出现。
    expect(pre().style.whiteSpace).toBe('pre');
    expect(pre().style.wordBreak).toBe('normal');
    expect(pre().style.overflowWrap).toBe('normal');
  });

  // 两轮 clear+type+Enter 共 10 次逐键输入；`userEvent` 默认在每次按键之间插入真实
  // `setTimeout(0)`，全量跑（432 文件并行）时被 CPU 争抢放大，曾击穿 5s 默认超时
  // （2026-10-31 `check:all`，单跑 3/3 通过）。`delay: null` 去掉逐键等待消除病因，
  // 显式上限只作并行环境的兜底。
  it('edits the zoom percentage on double click, accepting a percent sign and clamping', async () => {
    const user = userEvent.setup({ delay: null });
    renderViewer(makeItem());
    const readout = screen.getByRole('button', { name: '重置字号' });
    fireEvent.doubleClick(readout);

    const input = screen.getByRole('textbox', {
      name: '缩放百分比，直接输入数值',
    }) as HTMLInputElement;
    expect(input.value).toBe('100');
    // `120%` 与 `120` 等价
    await user.clear(input);
    await user.type(input, '120%');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: '重置字号' }).textContent).toBe('120%');

    // 越界值钳制到上界而非丢弃
    fireEvent.doubleClick(screen.getByRole('button', { name: '重置字号' }));
    const clamped = screen.getByRole('textbox', { name: '缩放百分比，直接输入数值' });
    await user.clear(clamped);
    await user.type(clamped, '9999');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: '重置字号' }).textContent).toBe('400%');
  }, 15_000);

  it('cancels the zoom edit on Escape without closing the viewer or reverting the text', async () => {
    const onClose = renderViewer(makeItem());
    fireEvent.doubleClick(screen.getByRole('button', { name: '重置字号' }));
    const input = screen.getByRole('textbox', { name: '缩放百分比，直接输入数值' });
    await userEvent.clear(input);
    await userEvent.type(input, '250');

    // Esc 由内联输入框消费：既不关弹窗，也不触发"编辑中 Esc = 取消更改"
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '重置字号' }).textContent).toBe('100%');
    expect(screen.queryByRole('textbox', { name: '缩放百分比，直接输入数值' })).toBeNull();
  }, 15_000);

  it('ignores a non-numeric zoom entry and keeps the previous value', async () => {
    renderViewer(makeItem());
    fireEvent.doubleClick(screen.getByRole('button', { name: '重置字号' }));
    const input = screen.getByRole('textbox', { name: '缩放百分比，直接输入数值' });
    await userEvent.clear(input);
    await userEvent.type(input, 'abc');
    await userEvent.keyboard('{Enter}');

    expect(screen.getByRole('button', { name: '重置字号' }).textContent).toBe('100%');
  });

  it('saves to a file through the native dialog for every kind', async () => {
    const saveToFile = vi.fn().mockResolvedValue({ ok: true, data: { path: 'E:/out.txt' } });
    setClipboardBridge({ saveToFile });
    renderViewer(makeItem());

    await userEvent.click(screen.getByRole('button', { name: '保存为文件' }));

    await waitFor(() => expect(saveToFile).toHaveBeenCalledTimes(1));
    // 文本条目的字节取自当前草稿（不走网络），文件名预填且与 ad-server 导出一致。
    const request = saveToFile.mock.calls[0][0];
    expect(request.suggestedName).toBe('clipboard-c1.txt');
    expect(
      new TextDecoder().decode(Uint8Array.from(atob(request.dataBase64), (c) => c.charCodeAt(0))),
    ).toBe('hello clipboard');

    cleanup();
    // 图片条目没有文本工具栏，导出入口必须仍在（本轮评审发现 1 的回归保护）：
    // 此时载荷只能来自 `/clipboard/export`，按 kind 预填 .png。
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });
    vi.stubGlobal('fetch', fetchMock);
    renderViewer(makeItem({ kind: 'image', content: undefined, imagePath: 'C:/a.png' }));
    await userEvent.click(screen.getByRole('button', { name: '保存为文件' }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('http://test/clipboard/export?id=c1'),
    );
    expect(saveToFile.mock.calls[1][0].suggestedName).toBe('clipboard-c1.png');
    vi.unstubAllGlobals();
  });

  it('saves the in-edit text (not the stale draft) when exporting mid-edit', async () => {
    const saveToFile = vi.fn().mockResolvedValue({ ok: true, data: {} });
    setClipboardBridge({ saveToFile });
    renderViewer(makeItem({ id: 'c1', content: 'hello' }));

    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    await userEvent.type(screen.getByRole('textbox'), '!');
    // 未保存即存文件：落盘的应是眼前内容，而非旧 draft
    await userEvent.click(screen.getByRole('button', { name: '保存为文件' }));

    await waitFor(() => expect(saveToFile).toHaveBeenCalledTimes(1));
    const request = saveToFile.mock.calls[0][0];
    expect(
      new TextDecoder().decode(Uint8Array.from(atob(request.dataBase64), (c) => c.charCodeAt(0))),
    ).toBe('hello!');
  });

  it('opens only one save dialog on a same-tick double click', async () => {
    const saveToFile = vi.fn().mockResolvedValue({ ok: true, data: {} });
    setClipboardBridge({ saveToFile });
    renderViewer(makeItem({ id: 'c1', content: 'hello' }));

    // 同 tick 两次点击：state 守卫来不及更新，ref 互斥必须拦住第二次
    const saveButton = screen.getByRole('button', { name: '保存为文件' });
    fireEvent.click(saveButton);
    fireEvent.click(saveButton);

    await waitFor(() => expect(saveToFile).toHaveBeenCalledTimes(1));
  });

  it('disables preview while editing a blank draft instead of silently ignoring', async () => {
    renderViewer(makeItem({ id: 'c1', content: 'hello' }));

    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    await userEvent.clear(screen.getByRole('textbox'));

    // 空白不可保存：预览按钮禁用（诚实），而非点击无反应
    expect(screen.getByRole('button', { name: '预览文本' })).toBeDisabled();
  });

  it('reports an error toast when the export fetch is not ok', async () => {
    const reportError = vi.fn();
    const saveToFile = vi.fn().mockResolvedValue({ ok: true, data: {} });
    setClipboardBridge({ saveToFile });
    mockStore({ ...storeSetters, reportError });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    renderViewer(makeItem({ kind: 'image', content: undefined, imagePath: 'C:/a.png' }));

    await userEvent.click(screen.getByRole('button', { name: '保存为文件' }));

    // HTTP 错误不落盘：错误页字节不得存成文件
    await waitFor(() =>
      expect(reportError).toHaveBeenCalledWith(
        'CLIPBOARD_EXPORT_FAILED',
        '读取剪贴板条目内容失败，未保存',
        'clipboard',
      ),
    );
    expect(saveToFile).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('reports an error toast when the save dialog reports failure', async () => {
    const reportError = vi.fn();
    const saveToFile = vi.fn().mockResolvedValue({
      ok: false,
      error: { code: 'IO_ERROR', message: 'disk full' },
    });
    setClipboardBridge({ saveToFile });
    mockStore({ ...storeSetters, reportError });
    renderViewer(makeItem());

    await userEvent.click(screen.getByRole('button', { name: '保存为文件' }));

    await waitFor(() =>
      // 面向用户的文案走 i18n；后端错误码进 toast 条目供排查，不直接展示原文。
      expect(reportError).toHaveBeenCalledWith('IO_ERROR', '保存为文件失败', 'clipboard'),
    );
  });

  it('offers the edit affordance for text items but not for images', () => {
    renderViewer(makeItem());
    expect(screen.getByRole('button', { name: '编辑' })).toBeTruthy();

    cleanup();
    renderViewer(makeItem({ kind: 'image', content: undefined, imagePath: 'C:/a.png' }));
    expect(screen.queryByRole('button', { name: '编辑' })).toBeNull();
  });

  it('marks the edit button as toggled and the content area as active while editing', async () => {
    renderViewer(makeItem());
    const editButton = screen.getByRole('button', { name: '编辑' });
    expect(editButton.className).not.toContain('is-toggled');
    expect(document.querySelector('.adl-clipboard-viewer__scroll-shell--active')).toBeNull();

    await userEvent.click(editButton);

    expect(screen.getByRole('button', { name: '编辑' }).className).toContain('is-toggled');
    expect(document.querySelector('.adl-clipboard-viewer__scroll-shell--active')).not.toBeNull();

    // Esc 退出编辑 → 两处常驻提示同时消失
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '编辑' }).className).not.toContain('is-toggled'),
    );
    expect(document.querySelector('.adl-clipboard-viewer__scroll-shell--active')).toBeNull();
  });

  it('exits edit mode when the edit button is pressed again, persisting the change', async () => {
    const updateClipboardItem = vi.fn().mockResolvedValue(true);
    mockStore({ ...storeSetters, updateClipboardItem });
    renderViewer(makeItem({ content: 'hello' }));

    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    const box = screen.getByRole('textbox') as HTMLTextAreaElement;
    await userEvent.clear(box);
    await userEvent.type(box, 'changed');

    // 再次点击 = 开关：落盘后退出编辑态
    await userEvent.click(screen.getByRole('button', { name: '编辑' }));

    await waitFor(() => expect(updateClipboardItem).toHaveBeenCalledWith('c1', 'changed'));
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    expect(screen.getByRole('button', { name: '编辑' }).className).not.toContain('is-toggled');
  });

  it('edits an html item as plain text through the text channel', async () => {
    const updateClipboardItem = vi.fn().mockResolvedValue(true);
    mockStore({ ...storeSetters, updateClipboardItem });
    // 富文本编辑纯文本侧：所见即普通文本，不出现 HTML 标签
    renderViewer(makeItem({ kind: 'html', content: 'plain', htmlPath: 'a.html' }));

    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    const box = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(box.value).toBe('plain');
    await userEvent.clear(box);
    await userEvent.type(box, 'edited');

    await userEvent.click(screen.getByRole('button', { name: '编辑' }));

    await waitFor(() => expect(updateClipboardItem).toHaveBeenCalledWith('c1', 'edited'));
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    expect(document.querySelector('.adl-clipboard-viewer__text')?.textContent).toBe('edited');
  });

  it('opens html edit entry immediately without waiting for the sidecar', async () => {
    renderViewer(makeItem({ kind: 'html', content: 'plain', htmlPath: 'a.html' }));
    // 纯文本侧编辑不依赖 sidecar：入口直接可用
    expect(screen.getByRole('button', { name: '编辑' })).toBeEnabled();
  });

  it('toggles the preview surface and keeps the active background while previewing', async () => {
    renderViewer(makeItem({ content: '# heading' }));
    const previewButton = screen.getByRole('button', { name: '预览文本' });
    expect(previewButton.getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('.adl-clipboard-viewer__scroll-shell--active')).toBeNull();

    await userEvent.click(previewButton);

    expect(screen.getByRole('button', { name: '预览文本' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: '预览文本' }).className).toContain('is-toggled');
    // 预览与编辑共用同一底色 class
    expect(document.querySelector('.adl-clipboard-viewer__scroll-shell--active')).not.toBeNull();
    // 纯文本预览走 Markdown 渲染器：<pre> 隐藏而非卸载，Markdown 面显现
    const pre = document.querySelector('.adl-clipboard-viewer__text') as HTMLElement;
    expect(pre).not.toBeNull();
    expect(pre.hidden).toBe(true);
    const markdown = document.querySelector('.adl-clipboard-viewer__markdown') as HTMLElement;
    expect(markdown).not.toBeNull();
    expect(markdown.hidden).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: '预览文本' }));
    expect(screen.getByRole('button', { name: '预览文本' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(document.querySelector('.adl-clipboard-viewer__scroll-shell--active')).toBeNull();
  });

  it('keeps preview faces mounted across toggles so switching never rebuilds them', async () => {
    renderViewer(makeItem({ content: '# heading' }));
    // 打开即挂载（隐藏）：懒分包与首绘在后台完成，首切无空白帧
    const markdownBefore = document.querySelector('.adl-clipboard-viewer__markdown') as HTMLElement;
    expect(markdownBefore).not.toBeNull();
    expect(markdownBefore.hidden).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: '预览文本' }));
    const markdownOpen = document.querySelector('.adl-clipboard-viewer__markdown') as HTMLElement;
    // 同一节点翻 hidden，而非卸载重建
    expect(markdownOpen).toBe(markdownBefore);
    expect(markdownOpen.hidden).toBe(false);

    await userEvent.click(screen.getByRole('button', { name: '预览文本' }));
    const markdownClosed = document.querySelector('.adl-clipboard-viewer__markdown') as HTMLElement;
    expect(markdownClosed).toBe(markdownBefore);
    expect(markdownClosed.hidden).toBe(true);
  });

  it('keeps the rich iframe mounted across preview toggles', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: async () => '<p>rich</p>' }),
    );
    renderViewer(makeItem({ kind: 'html', content: 'plain', htmlPath: 'a.html' }));
    const iframeBefore = document.querySelector('.adl-clipboard-viewer__rich') as HTMLIFrameElement;
    expect(iframeBefore).not.toBeNull();
    expect(iframeBefore.hidden).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: '预览富文本' }));
    const iframeOpen = document.querySelector('.adl-clipboard-viewer__rich') as HTMLIFrameElement;
    // 同一 iframe 翻 hidden：文档不重载，切换无重载闪
    expect(iframeOpen).toBe(iframeBefore);
    expect(iframeOpen.hidden).toBe(false);
    vi.unstubAllGlobals();
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
    // 落盘成功即同步浏览视图：父级 prop 是打开时快照（store 更新流不进弹窗），
    // 不在这里同步则默认浏览态仍显示旧内容，直到重开弹窗。
    // 预览面常驻挂载（隐藏）同样含该文本，断言按浏览面取。
    expect((document.querySelector('.adl-clipboard-viewer__text') as HTMLElement).textContent).toBe(
      'saved',
    );
  });

  it('refreshes the plain-text view when the item content prop changes', async () => {
    const onClose = vi.fn();
    const first = makeItem({ id: 'c1', content: 'hello' });
    const { rerender } = render(
      <TCopyProvider t={mockT} locale="zh-CN">
        <ClipboardItemViewer item={first} onClose={onClose} />
      </TCopyProvider>,
    );

    const preText = () =>
      (document.querySelector('.adl-clipboard-viewer__text') as HTMLElement).textContent;
    expect(preText()).toBe('hello');

    rerender(
      <TCopyProvider t={mockT} locale="zh-CN">
        <ClipboardItemViewer item={{ ...first, content: 'updated' }} onClose={onClose} />
      </TCopyProvider>,
    );

    await waitFor(() => expect(preText()).toBe('updated'));
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
    const resolvers: ((value: boolean) => void)[] = [];
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

  it('closes directly after a successful retry without prompting the confirm again', async () => {
    const updateClipboardItem = vi
      .fn<() => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    mockStore({ updateClipboardItem });
    const onClose = renderViewer(makeItem({ id: 'c1', content: 'hello' }));

    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    const box = screen.getByRole('textbox');
    await userEvent.clear(box);
    await userEvent.type(box, 'retry');
    await userEvent.click(screen.getByRole('button', { name: '关闭' }));

    // 首次保存失败 → 确认框弹出 → 继续编辑
    await waitFor(() => expect(screen.getByRole('dialog', { name: '更改尚未保存' })).toBeTruthy());
    await userEvent.click(screen.getByRole('button', { name: '继续编辑' }));

    // Ctrl+S 重试成功 → 自动退出编辑态
    await userEvent.keyboard('{Control>}s{/Control}');
    await waitFor(() => expect(updateClipboardItem).toHaveBeenNthCalledWith(2, 'c1', 'retry'));
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());

    // 此后关闭：草稿已落盘 → 直接关闭，确认框不再出现
    await userEvent.click(screen.getByRole('button', { name: '关闭' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog', { name: '更改尚未保存' })).toBeNull();
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

  it('reports an error toast instead of silently doing nothing when the export URL is empty (mock fallback)', async () => {
    const reportError = vi.fn();
    const saveToFile = vi.fn().mockResolvedValue({ ok: true, data: {} });
    setClipboardBridge({ exportUrl: () => '', saveToFile });
    mockStore({ ...storeSetters, reportError });
    // 非文本条目的字节只在服务端 sidecar 里（必须走 /clipboard/export），
    // 此时 exportUrl 为空即无载荷可存 —— 必须报错，不能静默无反应。
    renderViewer(makeItem({ kind: 'image', content: undefined, imagePath: 'C:/a.png' }));

    await userEvent.click(screen.getByRole('button', { name: '保存为文件' }));

    await waitFor(() =>
      expect(reportError).toHaveBeenCalledWith(
        'CLIPBOARD_EXPORT_UNAVAILABLE',
        '读取剪贴板条目内容失败，未保存',
        'clipboard',
      ),
    );
    expect(saveToFile).not.toHaveBeenCalled();
  });

  it('still saves a text item when the export URL is empty (bytes come from the draft)', async () => {
    const saveToFile = vi.fn().mockResolvedValue({ ok: true, data: {} });
    setClipboardBridge({ exportUrl: () => '', saveToFile });
    renderViewer(makeItem({ content: 'draft text' }));

    await userEvent.click(screen.getByRole('button', { name: '保存为文件' }));

    await waitFor(() => expect(saveToFile).toHaveBeenCalledTimes(1));
    expect(saveToFile.mock.calls[0][0].suggestedName).toBe('clipboard-c1.txt');
  });

  it('saves and switches from edit to preview instead of activating both', async () => {
    const updateClipboardItem = vi.fn().mockResolvedValue(true);
    mockStore({ ...storeSetters, updateClipboardItem });
    renderViewer(makeItem({ id: 'c1', content: 'hello' }));

    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    const box = screen.getByRole('textbox') as HTMLTextAreaElement;
    await userEvent.clear(box);
    await userEvent.type(box, 'changed');

    // 编辑中点击预览 = 自动保存后切换，两者互斥单选
    await userEvent.click(screen.getByRole('button', { name: '预览文本' }));

    await waitFor(() => expect(updateClipboardItem).toHaveBeenCalledWith('c1', 'changed'));
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    // 预览激活、编辑退出：不同时常驻灰底
    expect(screen.getByRole('button', { name: '预览文本' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: '编辑' }).className).not.toContain('is-toggled');
  });

  it('stays in edit mode when switching to preview after a failed save', async () => {
    const updateClipboardItem = vi.fn().mockResolvedValue(false);
    mockStore({ ...storeSetters, updateClipboardItem });
    renderViewer(makeItem({ id: 'c1', content: 'hello' }));

    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    const box = screen.getByRole('textbox');
    await userEvent.clear(box);
    await userEvent.type(box, 'unsaved');

    await userEvent.click(screen.getByRole('button', { name: '预览文本' }));

    await waitFor(() => expect(updateClipboardItem).toHaveBeenCalledWith('c1', 'unsaved'));
    // 保存失败：留在编辑态，不进入预览
    expect(screen.getByRole('textbox')).toBeTruthy();
    expect(screen.getByRole('button', { name: '预览文本' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('switches from preview to edit without keeping both active', async () => {
    renderViewer(makeItem({ content: '# heading' }));

    await userEvent.click(screen.getByRole('button', { name: '预览文本' }));
    expect(screen.getByRole('button', { name: '预览文本' }).getAttribute('aria-pressed')).toBe(
      'true',
    );

    // 预览中点击编辑 = 直接切换，预览即退出
    await userEvent.click(screen.getByRole('button', { name: '编辑' }));

    expect(screen.getByRole('button', { name: '预览文本' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(screen.getByRole('button', { name: '编辑' }).className).toContain('is-toggled');
    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  it('applies the wrap state to the markdown preview container', async () => {
    renderViewer(makeItem({ content: '# heading' }));
    await userEvent.click(screen.getByRole('button', { name: '预览文本' }));

    const previewBox = () =>
      document.querySelector('.adl-clipboard-viewer__markdown') as HTMLElement;
    expect(previewBox()).not.toBeNull();
    // 换行态：不注入，保持原生渲染
    expect(previewBox().style.whiteSpace).toBe('');

    await userEvent.click(screen.getByRole('button', { name: '自动换行' }));
    // 关闭换行：预览容器同样不折行，溢出由外层滚动条承载
    expect(previewBox().style.whiteSpace).toBe('pre');
    expect(previewBox().style.wordBreak).toBe('normal');
    expect(previewBox().style.overflowWrap).toBe('normal');
  });

  it('scales the markdown preview with the zoom controls', async () => {
    renderViewer(makeItem({ content: '# heading' }));
    await userEvent.click(screen.getByRole('button', { name: '预览文本' }));
    const previewBox = () =>
      document.querySelector('.adl-clipboard-viewer__markdown') as HTMLElement;

    // `.adl-markdown-preview` 自设 font-size，包层经 `--text-base` 变量渗透缩放
    expect(previewBox().style.getPropertyValue('--text-base')).toBe('16px');
    await userEvent.click(screen.getByRole('button', { name: '放大字号' }));
    expect(previewBox().style.getPropertyValue('--text-base')).toBe('17.6px');
  });

  it('passes the zoom level into the rich preview document', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: async () => '<p>rich</p>' }),
    );
    renderViewer(makeItem({ kind: 'html', content: 'plain', htmlPath: 'a.html' }));
    await userEvent.click(screen.getByRole('button', { name: '预览富文本' }));

    const srcDoc = () =>
      document.querySelector('.adl-clipboard-viewer__rich')?.getAttribute('srcdoc') ?? '';
    await waitFor(() => expect(srcDoc()).toContain('padding: 12px'));
    // px 定死的源字号经 html{zoom} 跟随宿主缩放
    expect(srcDoc()).not.toContain('zoom:');
    await userEvent.click(screen.getByRole('button', { name: '放大字号' }));
    await waitFor(() => expect(srcDoc()).toContain('zoom: 1.1'));
    vi.unstubAllGlobals();
  });

  it('does not reset on double click before entering zoom edit', async () => {
    renderViewer(makeItem());
    const readout = () => screen.getByRole('button', { name: '重置字号' });
    // 先放大到 140%
    for (let i = 0; i < 4; i += 1) {
      await userEvent.click(screen.getByRole('button', { name: '放大字号' }));
    }
    expect(readout().textContent).toBe('140%');

    // 双击进入编辑：两次 click 不得先把值重置回 100%
    await userEvent.dblClick(readout());
    const input = screen.getByRole('textbox', {
      name: '缩放百分比，直接输入数值',
    }) as HTMLInputElement;
    expect(input.value).toBe('140');
    await userEvent.keyboard('{Escape}');
    // 取消后仍是 140%，重置未被误触发
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '重置字号' }).textContent).toBe('140%'),
    );
  });

  it('resets to 100% on a single click of the readout', async () => {
    renderViewer(makeItem());
    await userEvent.click(screen.getByRole('button', { name: '放大字号' }));
    expect(screen.getByRole('button', { name: '重置字号' }).textContent).toBe('110%');

    // 单击延迟 220ms 防双击误触，此处等待落地
    await userEvent.click(screen.getByRole('button', { name: '重置字号' }));
    await waitFor(
      () => expect(screen.getByRole('button', { name: '重置字号' }).textContent).toBe('100%'),
      { timeout: 2000 },
    );
  });

  it('resets immediately on keyboard activation of the readout', async () => {
    renderViewer(makeItem());
    await userEvent.click(screen.getByRole('button', { name: '放大字号' }));
    await userEvent.click(screen.getByRole('button', { name: '放大字号' }));
    expect(screen.getByRole('button', { name: '重置字号' }).textContent).toBe('120%');

    // 键盘 Enter/Space 的 click detail 为 0：不等消歧窗口，立即重置
    fireEvent.click(screen.getByRole('button', { name: '重置字号' }));
    expect(screen.getByRole('button', { name: '重置字号' }).textContent).toBe('100%');
  });

  it('renders the zoom step buttons with the compact text size', () => {
    renderViewer(makeItem());
    expect(screen.getByRole('button', { name: '缩小字号' }).className).toContain(
      'adl-clipboard-viewer__zoom-step',
    );
    expect(screen.getByRole('button', { name: '放大字号' }).className).toContain(
      'adl-clipboard-viewer__zoom-step',
    );
  });

  it('shows the saved content in browse view without reopening', async () => {
    const updateClipboardItem = vi.fn().mockResolvedValue(true);
    mockStore({ ...storeSetters, updateClipboardItem });
    renderViewer(makeItem({ id: 'c1', content: 'hello' }));

    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    const box = screen.getByRole('textbox') as HTMLTextAreaElement;
    await userEvent.clear(box);
    await userEvent.type(box, 'changed');
    // Ctrl+S 落盘：父级 prop 是打开时快照（store 更新流不进弹窗），浏览视图必须本地同步
    await userEvent.keyboard('{Control>}s{/Control}');

    await waitFor(() => expect(updateClipboardItem).toHaveBeenCalledWith('c1', 'changed'));
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    // 默认浏览态立即显示新内容，不必重开弹窗
    expect(document.querySelector('.adl-clipboard-viewer__text')?.textContent).toBe('changed');
  });

  it('offers text save/discard buttons left of close while editing', async () => {
    const updateClipboardItem = vi.fn().mockResolvedValue(true);
    mockStore({ ...storeSetters, updateClipboardItem });
    renderViewer(makeItem({ id: 'c1', content: 'hello' }));

    // 非编辑态无文字按钮
    expect(screen.queryByRole('button', { name: '保存更改' })).toBeNull();
    expect(screen.queryByRole('button', { name: '丢弃更改' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    // 文字按钮在关闭所在格内、关闭按钮左侧；文字自解释，不挂 title
    const cell = document.querySelector('.adl-clipboard-viewer__close-cell') as HTMLElement;
    const saveButton = screen.getByRole('button', { name: '保存更改' });
    const discardButton = screen.getByRole('button', { name: '丢弃更改' });
    const closeButton = screen.getByRole('button', { name: '关闭' });
    expect(cell.contains(saveButton)).toBe(true);
    expect(cell.contains(discardButton)).toBe(true);
    // 放大一档（sm）+ 常显灰底偏直角（edit-text-btn）
    expect(saveButton.className).toContain('adl-btn--sm');
    expect(saveButton.className).toContain('adl-clipboard-viewer__edit-text-btn');
    expect(
      saveButton.compareDocumentPosition(closeButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(saveButton.getAttribute('title')).toBeNull();
    expect(discardButton.getAttribute('title')).toBeNull();

    await userEvent.type(screen.getByRole('textbox'), '!');
    await userEvent.click(saveButton);
    await waitFor(() => expect(updateClipboardItem).toHaveBeenCalledWith('c1', 'hello!'));
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
    // 退出编辑后文字按钮随之消失，浏览态显示新内容
    expect(screen.queryByRole('button', { name: '保存更改' })).toBeNull();
    expect(document.querySelector('.adl-clipboard-viewer__text')?.textContent).toBe('hello!');
  });

  it('discards all edits back to baseline without leaving edit mode', async () => {
    const updateClipboardItem = vi.fn().mockResolvedValue(true);
    mockStore({ ...storeSetters, updateClipboardItem });
    renderViewer(makeItem({ id: 'c1', content: 'hello' }));

    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    await userEvent.type(screen.getByRole('textbox'), 'XYZ');

    await userEvent.click(screen.getByRole('button', { name: '丢弃更改' }));

    // 恢复基线、仍在编辑态、未落盘
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('hello');
    expect(screen.getByRole('button', { name: '编辑' }).className).toContain('is-toggled');
    expect(updateClipboardItem).not.toHaveBeenCalled();
  });

  it('does not clobber in-flight edits when the item prop refreshes underneath', async () => {
    const onClose = vi.fn();
    const first = makeItem({ id: 'c1', content: 'hello' });
    const view = (
      <TCopyProvider t={mockT} locale="zh-CN">
        <ClipboardItemViewer item={first} onClose={onClose} />
      </TCopyProvider>
    );
    const { rerender } = render(view);
    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    await userEvent.type(screen.getByRole('textbox'), ' typed');

    // 外界重取（轮询/推送）送来新 prop：未落盘的键入不得被覆盖，编辑态保持
    rerender(
      <TCopyProvider t={mockT} locale="zh-CN">
        <ClipboardItemViewer item={{ ...first, content: 'external' }} onClose={onClose} />
      </TCopyProvider>,
    );
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('hello typed');
    expect(screen.getByRole('button', { name: '编辑' }).className).toContain('is-toggled');
  });

  it('stays in edit mode when the item prop refreshes before any typing', async () => {
    const onClose = vi.fn();
    const first = makeItem({ id: 'c1', content: 'hello' });
    const { rerender } = render(
      <TCopyProvider t={mockT} locale="zh-CN">
        <ClipboardItemViewer item={first} onClose={onClose} />
      </TCopyProvider>,
    );
    // 刚进编辑、尚未键入：外界重取也不得把人踢出编辑器
    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    rerender(
      <TCopyProvider t={mockT} locale="zh-CN">
        <ClipboardItemViewer item={{ ...first, content: 'external' }} onClose={onClose} />
      </TCopyProvider>,
    );
    expect(screen.getByRole('textbox')).toBeTruthy();
    expect(screen.getByRole('button', { name: '编辑' }).className).toContain('is-toggled');
  });

  it('abandons the in-flight save baseline when Escape lands mid-save', async () => {
    let resolveSave: (value: boolean) => void = () => {};
    const updateClipboardItem = vi
      .fn()
      .mockImplementation(() => new Promise<boolean>((resolve) => (resolveSave = resolve)));
    mockStore({ ...storeSetters, updateClipboardItem });
    renderViewer(makeItem({ id: 'c1', content: 'hello' }));

    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    await userEvent.type(screen.getByRole('textbox'), 'X');
    // Ctrl+S 起飞但不落地
    const saving = (async () => {
      await userEvent.keyboard('{Control>}s{/Control}');
    })();
    await waitFor(() => expect(updateClipboardItem).toHaveBeenCalledTimes(1));
    // 落地前 Esc：已发出的写入拦不住，但基线不得推进
    fireEvent.keyDown(document, { key: 'Escape' });
    resolveSave(true);
    await saving;
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());

    // 重进编辑应是旧基线，而非已取消的脏值
    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('hello');
  });

  it('keeps hidden preview links out of the Tab cycle', async () => {
    renderViewer(makeItem({ content: 'see [link](http://example.com/x) here' }));
    // 等隐藏 Markdown 面的懒分包落地、链接真实存在后再断言（否则是空断言）
    await waitFor(() =>
      expect(document.querySelector('.adl-clipboard-viewer__markdown a')).not.toBeNull(),
    );
    // 预览关闭时，隐藏面里的链接不得出现在 Tab 序列里
    fireEvent.keyDown(document, { key: 'Tab' });
    expect((document.activeElement as HTMLElement).tagName).not.toBe('A');
  });

  it('updates the stats readout live while editing', async () => {
    renderViewer(makeItem({ id: 'c1', content: 'ab' }));
    const stats = () => document.querySelector('.adl-clipboard-viewer__stats') as HTMLElement;
    expect(stats().textContent).toBe('2 字符 · 2 不含空格 · 1 行');

    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    await userEvent.type(screen.getByRole('textbox'), 'cde');
    // 编辑期统计跟随编辑缓冲，而非冻结在已落盘值
    expect(stats().textContent).toBe('5 字符 · 5 不含空格 · 1 行');
  });

  it('redoes with Ctrl+Shift+Z as well as Ctrl+Y', async () => {
    mockStore(storeSetters);
    renderViewer(makeItem({ id: 'c1', content: 'hello' }));

    await userEvent.click(screen.getByRole('button', { name: '编辑' }));
    const box = screen.getByRole('textbox') as HTMLTextAreaElement;
    await userEvent.type(box, 'X');
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(box.value).toBe('hello');
    // 真实浏览器的 Shift+Ctrl+Z：key 为 'Z' 且 shiftKey 置位
    fireEvent.keyDown(document, { key: 'Z', ctrlKey: true, shiftKey: true });
    expect(box.value).toBe('helloX');
  });
});
