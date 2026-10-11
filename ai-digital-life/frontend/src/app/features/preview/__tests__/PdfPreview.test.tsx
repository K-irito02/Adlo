import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PdfPreview } from '../PdfPreview';

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      changesPreviewFailedPdf: 'PDF preview failed: {error}',
      changesPdfPrevPage: 'Previous page',
      changesPdfNextPage: 'Next page',
      changesPdfPageNumber: 'Page number',
      changesPdfGo: 'Go',
      loading: 'Loading…',
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

  it('keeps the page toolbar above the scrollable canvas', async () => {
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
    // 工具栏在滚动区之前（常驻顶部，无需滚动即可翻页），画布在滚动区内。
    expect(nav?.compareDocumentPosition(scroll as Node)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(scroll?.contains(canvas)).toBe(true);
  });

  it('jumps to the typed page and clamps out-of-range input', async () => {
    const { container } = render(<PdfPreview data={new ArrayBuffer(8)} />);
    await waitFor(() => {
      expect(screen.getByText('1 / 3')).toBeTruthy();
    });
    // 注意：type=number 下 JSDOM 把非数字输入强制为空串，此处 'abc' 实际覆盖
    // "空输入回滚当前页"；严格整数正则由 commitPageInput 单元语义保证。
    const input = screen.getByRole('spinbutton', { name: 'Page number' });
    const form = container.querySelector('.adl-pdf-preview-jump') as HTMLFormElement;
    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByText('2 / 3')).toBeTruthy();
    });
    // 超范围钳制到末页，非法输入回滚当前页。
    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByText('3 / 3')).toBeTruthy();
    });
    // 注意：type=number 下 JSDOM 把非数字输入强制为空串，此断言实际覆盖
    // "空输入回滚当前页"；严格整数语义由 commitPageInput 的 /^\d+$/ 保证。
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByText('3 / 3')).toBeTruthy();
    });
  });

  it('commits the page on blur', async () => {
    render(<PdfPreview data={new ArrayBuffer(8)} />);
    await waitFor(() => {
      expect(screen.getByText('1 / 3')).toBeTruthy();
    });
    const input = screen.getByRole('spinbutton', { name: 'Page number' });
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
    const { rerender, container } = render(<PdfPreview data={new ArrayBuffer(8)} />);
    await waitFor(() => {
      expect(screen.getByText('1 / 3')).toBeTruthy();
    });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Page number' }), {
      target: { value: '3' },
    });
    fireEvent.submit(container.querySelector('.adl-pdf-preview-jump') as HTMLFormElement);
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

  it('shows a loading placeholder before the document resolves', async () => {
    const pdfjs = await import('pdfjs-dist');
    let resolveDoc!: (doc: unknown) => void;
    vi.mocked(pdfjs.getDocument).mockReturnValueOnce({
      promise: new Promise((resolve) => {
        resolveDoc = resolve;
      }),
    } as never);
    render(<PdfPreview data={new ArrayBuffer(8)} />);
    await waitFor(() => {
      expect(screen.getByText('Loading…')).toBeTruthy();
    });
    resolveDoc({
      numPages: 1,
      getPage: vi.fn().mockResolvedValue({
        getViewport: () => ({ width: 100, height: 200 }),
        render: vi.fn().mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() }),
      }),
    });
    await waitFor(() => {
      expect(screen.queryByText('Loading…')).toBeNull();
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
});
