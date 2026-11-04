import React from 'react';
import { act, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PdfPreview } from '../PdfPreview';

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      changesPreviewFailedPdf: 'PDF preview failed: {error}',
      changesPdfPrevPage: 'Previous page',
      changesPdfNextPage: 'Next page',
      changesPdfPageNumber: 'Page number',
      changesPdfPageStatus: 'Page {current} / {total}',
      changesPdfPageJumpHint: 'Double-click to edit page',
      fileMediaLoading: 'Loading file...',
    },
    locale: 'en-US',
    formatT: (dict: Record<string, string>, key: string, params?: Record<string, unknown>) => {
      let out = dict[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          out = out.replace(`{${k}}`, String(v));
        }
      }
      return out;
    },
  }),
}));

vi.mock('pdfjs-dist', () => {
  const render = vi.fn().mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() });
  const getPage = vi.fn().mockResolvedValue({
    getViewport: () => ({ width: 100, height: 200 }),
    render,
  });
  const getDocument = vi.fn().mockReturnValue({
    promise: Promise.resolve({ numPages: 3, getPage }),
  });
  return {
    GlobalWorkerOptions: {},
    getDocument,
  };
});

/** 双击页码 → 输入框 → 回车 的公共流程。 */
function typePage(page: string) {
  fireEvent.doubleClick(screen.getByRole('button', { name: /^\d+ \/ \d+$/ }));
  const input = screen.getByRole('textbox', { name: 'Page number' });
  fireEvent.change(input, { target: { value: page } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

describe('PdfPreview navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders prev/next page buttons with accessible chevron icons', async () => {
    render(<PdfPreview data={new ArrayBuffer(8)} />);
    await waitFor(() => {
      expect(screen.getByText('1 / 3')).toBeTruthy();
    });

    const prevBtn = screen.getByRole('button', { name: 'Previous page' });
    const nextBtn = screen.getByRole('button', { name: 'Next page' });
    expect(prevBtn.querySelector('svg')).toBeTruthy();
    expect(nextBtn.querySelector('svg')).toBeTruthy();
    expect(prevBtn.querySelector('path')?.getAttribute('d')).toBe('M14 7L9 12L14 17');
    expect(nextBtn.querySelector('path')?.getAttribute('d')).toBe('M10 17L15 12L10 7');
  });

  it('floats the dock above the scrollable canvas (content full-height)', async () => {
    const { container } = render(<PdfPreview data={new ArrayBuffer(8)} />);
    await waitFor(() => {
      expect(screen.getByText('1 / 3')).toBeTruthy();
    });
    const root = container.querySelector('.adl-pdf-preview');
    const nav = container.querySelector('.adl-pdf-preview-nav');
    const scroll = container.querySelector('.adl-pdf-scroll');
    const canvas = container.querySelector('canvas');
    expect(root).toBeTruthy();
    expect(nav).toBeTruthy();
    expect(scroll).toBeTruthy();
    expect(canvas).toBeTruthy();
    // 悬浮胶囊是滚动区的兄弟（绝对定位覆盖在内容上），画布在滚动区内。
    expect(nav?.compareDocumentPosition(scroll as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(scroll?.contains(canvas)).toBe(true);
  });

  it('jumps to the typed page after double-click + Enter, clamping out-of-range input', async () => {
    render(<PdfPreview data={new ArrayBuffer(8)} />);
    await waitFor(() => {
      expect(screen.getByText('1 / 3')).toBeTruthy();
    });

    typePage('2');
    await waitFor(() => {
      expect(screen.getByText('2 / 3')).toBeTruthy();
    });

    typePage('99');
    await waitFor(() => {
      expect(screen.getByText('3 / 3')).toBeTruthy();
    });

    typePage('');
    await waitFor(() => {
      expect(screen.getByText('3 / 3')).toBeTruthy();
    });
  });

  it('cancels page editing on Escape without jumping', async () => {
    render(<PdfPreview data={new ArrayBuffer(8)} />);
    await waitFor(() => {
      expect(screen.getByText('1 / 3')).toBeTruthy();
    });
    fireEvent.doubleClick(screen.getByRole('button', { name: /^\d+ \/ \d+$/ }));
    const input = screen.getByRole('textbox', { name: 'Page number' });
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.getByText('1 / 3')).toBeTruthy();
    });
  });

  it('commits the page on blur', async () => {
    render(<PdfPreview data={new ArrayBuffer(8)} />);
    await waitFor(() => {
      expect(screen.getByText('1 / 3')).toBeTruthy();
    });
    fireEvent.doubleClick(screen.getByRole('button', { name: /^\d+ \/ \d+$/ }));
    const input = screen.getByRole('textbox', { name: 'Page number' });
    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.blur(input);
    await waitFor(() => {
      expect(screen.getByText('2 / 3')).toBeTruthy();
    });
  });

  it('hides the toolbar for single-page documents', async () => {
    const pdfjs = await import('pdfjs-dist');
    vi.mocked(pdfjs.getDocument).mockReturnValueOnce({
      promise: Promise.resolve({
        numPages: 1,
        getPage: vi.fn().mockResolvedValue({
          getViewport: () => ({ width: 100, height: 200 }),
          render: vi.fn().mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() }),
        }),
      }),
    } as never);
    const { container } = render(<PdfPreview data={new ArrayBuffer(8)} />);
    await waitFor(() => {
      expect(container.querySelector('canvas')).toBeTruthy();
    });
    expect(container.querySelector('.adl-pdf-preview-nav')).toBeNull();
  });

  it('resets page state when switching documents', async () => {
    const pdfjs = await import('pdfjs-dist');
    const { rerender } = render(<PdfPreview data={new ArrayBuffer(8)} />);
    await waitFor(() => {
      expect(screen.getByText('1 / 3')).toBeTruthy();
    });
    typePage('3');
    await waitFor(() => {
      expect(screen.getByText('3 / 3')).toBeTruthy();
    });
    vi.mocked(pdfjs.getDocument).mockReturnValueOnce({
      promise: Promise.resolve({
        numPages: 2,
        getPage: vi.fn().mockResolvedValue({
          getViewport: () => ({ width: 100, height: 200 }),
          render: vi.fn().mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() }),
        }),
      }),
    } as never);
    rerender(<PdfPreview data={new ArrayBuffer(16)} />);
    await waitFor(() => {
      expect(screen.getByText('1 / 2')).toBeTruthy();
    });
  });

  it('shows an error when document parsing fails', async () => {
    const pdfjs = await import('pdfjs-dist');
    vi.mocked(pdfjs.getDocument).mockRejectedValueOnce(new Error('boom'));
    render(<PdfPreview data={new ArrayBuffer(8)} />);
    await waitFor(() => {
      expect(screen.getByText(/PDF preview failed/u)).toBeTruthy();
    });
  });

  it('shows the sweep skeleton (no loading copy) before the document resolves', async () => {
    const pdfjs = await import('pdfjs-dist');
    let resolveDoc!: (doc: unknown) => void;
    vi.mocked(pdfjs.getDocument).mockReturnValueOnce({
      promise: new Promise((resolve) => {
        resolveDoc = resolve;
      }),
    } as never);
    const { container } = render(<PdfPreview data={new ArrayBuffer(8)} />);
    await waitFor(() => {
      expect(container.querySelector('.adl-preview-loading')).toBeTruthy();
    });
    const placeholder = container.querySelector('.adl-preview-loading');
    // 与变更面板一致：单层 .skeleton 整面扫光（不画多行骨架条）
    expect(placeholder?.classList.contains('skeleton')).toBe(true);
    expect(placeholder?.textContent).toBe('');
    // 铺满整个预览根（不被 .adl-pdf-scroll 的 padding 裁掉）
    expect(placeholder?.classList.contains('adl-preview-loading--overlay')).toBe(true);
    expect(container.querySelector('.adl-pdf-scroll .adl-preview-loading')).toBeNull();
    expect(screen.queryByText('Loading file...')).toBeNull();
    resolveDoc({
      numPages: 1,
      getPage: vi.fn().mockResolvedValue({
        getViewport: () => ({ width: 100, height: 200 }),
        render: vi.fn().mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() }),
      }),
    });
    await waitFor(() => {
      expect(container.querySelector('.adl-preview-loading')).toBeNull();
    });
  });

  it('paints the first page after parsing (no blank first frame)', async () => {
    const { container } = render(<PdfPreview data={new ArrayBuffer(8)} />);
    await waitFor(() => {
      expect(screen.getByText('1 / 3')).toBeTruthy();
    });
    const canvas = container.querySelector('canvas') as HTMLCanvasElement | null;
    // 首屏绘制真实发生（收尾 R34-H1 回归锁）：画布尺寸被设为视口尺寸，
    // 而非默认 300x150 空白。
    await waitFor(() => {
      expect(canvas?.width).toBe(100);
      expect(canvas?.height).toBe(200);
    });
  });

  it('enters page edit with Enter/Space on the counter (keyboard path)', async () => {
    render(<PdfPreview data={new ArrayBuffer(8)} />);
    await waitFor(() => {
      expect(screen.getByText('1 / 3')).toBeTruthy();
    });
    const counter = screen.getByRole('button', { name: '1 / 3' });
    fireEvent.keyDown(counter, { key: 'Enter' });
    expect(screen.getByRole('textbox', { name: 'Page number' })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Page number' }), {
      key: 'Escape',
    });
    expect(screen.getByRole('button', { name: '1 / 3' })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('button', { name: '1 / 3' }), { key: ' ' });
    expect(screen.getByRole('textbox', { name: 'Page number' })).toBeTruthy();
  });

  it('exposes the page count as name/description and restores focus after commit', async () => {
    render(<PdfPreview data={new ArrayBuffer(8)} />);
    await waitFor(() => {
      expect(screen.getByText('1 / 3')).toBeTruthy();
    });
    fireEvent.doubleClick(screen.getByRole('button', { name: '1 / 3' }));
    const input = screen.getByRole('textbox', { name: 'Page number' });
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const description = document.getElementById(describedBy as string)?.textContent ?? '';
    expect(description).toContain('1');
    expect(description).toContain('3');

    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('button', { name: '2 / 3' }));
    });
  });

  it('rejects non-integer input instead of parseInt-style leniency', async () => {
    render(<PdfPreview data={new ArrayBuffer(8)} />);
    await waitFor(() => {
      expect(screen.getByText('1 / 3')).toBeTruthy();
    });
    typePage('2abc');
    await waitFor(() => {
      expect(screen.getByText('1 / 3')).toBeTruthy();
    });
    typePage('2.9');
    await waitFor(() => {
      expect(screen.getByText('1 / 3')).toBeTruthy();
    });
    // 低于范围照样钳制到第一页（不是报错/空白）
    typePage('0');
    await waitFor(() => {
      expect(screen.getByText('1 / 3')).toBeTruthy();
    });
  });

  it('leaves edit mode when the document changes mid-edit', async () => {
    const pdfjs = await import('pdfjs-dist');
    const { rerender } = render(<PdfPreview data={new ArrayBuffer(8)} />);
    await waitFor(() => {
      expect(screen.getByText('1 / 3')).toBeTruthy();
    });
    fireEvent.doubleClick(screen.getByRole('button', { name: '1 / 3' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Page number' }), {
      target: { value: '3' },
    });
    vi.mocked(pdfjs.getDocument).mockReturnValueOnce({
      promise: Promise.resolve({
        numPages: 2,
        getPage: vi.fn().mockResolvedValue({
          getViewport: () => ({ width: 100, height: 200 }),
          render: vi.fn().mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() }),
        }),
      }),
    } as never);
    rerender(<PdfPreview data={new ArrayBuffer(16)} />);
    await waitFor(() => {
      expect(screen.getByText('1 / 2')).toBeTruthy();
    });
    expect(screen.queryByRole('textbox', { name: 'Page number' })).toBeNull();
  });

  it('destroys a document that finishes parsing after unmount', async () => {
    const pdfjs = await import('pdfjs-dist');
    let resolveDoc!: (doc: unknown) => void;
    const destroy = vi.fn().mockResolvedValue(undefined);
    vi.mocked(pdfjs.getDocument).mockReturnValueOnce({
      promise: new Promise((resolve) => {
        resolveDoc = resolve;
      }),
    } as never);
    const { unmount } = render(<PdfPreview data={new ArrayBuffer(8)} />);
    unmount();
    resolveDoc({ numPages: 2, destroy, getPage: vi.fn() });
    await waitFor(() => {
      expect(destroy).toHaveBeenCalled();
    });
  });

  it('enters page edit on a double tap (touch pointer)', async () => {
    render(<PdfPreview data={new ArrayBuffer(8)} />);
    await waitFor(() => {
      expect(screen.getByText('1 / 3')).toBeTruthy();
    });
    const counter = screen.getByRole('button', { name: '1 / 3' });
    // jsdom 的 pointerUp 不携带 pointerType，手动补上再由 React 委托处理。
    const tap = () => {
      const event = new Event('pointerup', { bubbles: true });
      Object.defineProperty(event, 'pointerType', { value: 'touch' });
      counter.dispatchEvent(event);
    };
    act(() => {
      tap();
      tap();
    });
    expect(screen.getByRole('textbox', { name: 'Page number' })).toBeTruthy();
  });

  it('reuses the parsed document for the same cacheKey (no re-parse)', async () => {
    const pdfjs = await import('pdfjs-dist');
    const first = render(<PdfPreview data={new ArrayBuffer(8)} cacheKey="pdf-cache-test" />);
    await waitFor(() => {
      expect(screen.getByText('1 / 3')).toBeTruthy();
    });
    first.unmount();
    vi.mocked(pdfjs.getDocument).mockClear();

    const second = render(<PdfPreview data={new ArrayBuffer(16)} cacheKey="pdf-cache-test" />);
    await waitFor(() => {
      expect(second.container.querySelector('canvas')).toBeTruthy();
    });
    expect(pdfjs.getDocument).not.toHaveBeenCalled();
  });
});
