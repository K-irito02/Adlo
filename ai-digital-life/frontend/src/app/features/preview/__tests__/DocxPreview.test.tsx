import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DocxPreview } from '../DocxPreview';

vi.mock('docx-preview', () => ({
  renderAsync: vi.fn(async (_data: unknown, container: HTMLElement) => {
    const paragraph = document.createElement('p');
    paragraph.textContent = 'hello docx';
    container.appendChild(paragraph);
  }),
}));

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: {
      changesPreviewFailedDocx: 'DOCX preview failed: {error}',
      officeLegacyFormat: 'Legacy format, re-save as {suggest}',
      docxFidelityHint: 'docx fidelity hint',
      docxUnreadable: 'not a valid DOCX',
      fileMediaLoading: 'Loading file...',
    },
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

describe('DocxPreview (docx-preview)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders document content into the container', async () => {
    render(<DocxPreview data={new ArrayBuffer(8)} />);
    await waitFor(() => {
      expect(screen.getByText('hello docx')).toBeTruthy();
    });
  });

  it('shows the fidelity hint as a floating watermark', async () => {
    render(<DocxPreview data={new ArrayBuffer(8)} />);
    await waitFor(() => {
      expect(screen.getByText('docx fidelity hint').className).toContain('adl-fidelity-watermark');
    });
  });

  it('renders without the library gray wrapper (single paper)', async () => {
    const docx = await import('docx-preview');
    render(<DocxPreview data={new ArrayBuffer(8)} />);
    await waitFor(() => {
      expect(docx.renderAsync).toHaveBeenCalled();
    });
    expect(docx.renderAsync).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      undefined,
      expect.objectContaining({ inWrapper: false }),
    );
  });

  it('maps zip unpack failures to a friendly message', async () => {
    const docx = await import('docx-preview');
    vi.mocked(docx.renderAsync).mockRejectedValueOnce(
      new Error("Can't find end of central directory : is this a zip file ?"),
    );
    render(<DocxPreview data={new ArrayBuffer(8)} fileName="docs/report.docx" />);
    await waitFor(() => {
      expect(screen.getByText('not a valid DOCX')).toBeTruthy();
    });
  });

  it('shows a friendly error when rendering fails', async () => {
    const docx = await import('docx-preview');
    vi.mocked(docx.renderAsync).mockRejectedValueOnce(new Error('broken zip'));
    render(<DocxPreview data={new ArrayBuffer(8)} />);
    await waitFor(() => {
      expect(screen.getByText(/DOCX preview failed/u)).toBeTruthy();
    });
  });

  it('shows the sweep skeleton (no loading copy) while rendering', async () => {
    const docx = await import('docx-preview');
    let resolveRender!: () => void;
    vi.mocked(docx.renderAsync).mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveRender = resolve;
      }) as never,
    );
    const { container } = render(<DocxPreview data={new ArrayBuffer(8)} />);

    // 延迟 150ms 才显现（避免秒开时的闪烁），故用 waitFor 等待。
    await waitFor(() => {
      expect(container.querySelector('.adl-preview-loading')).toBeTruthy();
    });
    const placeholder = container.querySelector('.adl-preview-loading');
    // 与变更面板一致：单层 .skeleton 整面扫光（不画多行骨架条）
    expect(placeholder?.classList.contains('skeleton')).toBe(true);
    expect(placeholder?.querySelectorAll('.skeleton').length).toBe(0);
    // 铺满整个预览根（不被 .adl-docx-scroll 的 padding 裁掉）
    expect(placeholder?.classList.contains('adl-preview-loading--overlay')).toBe(true);
    expect(container.querySelector('.adl-docx-scroll .adl-preview-loading')).toBeNull();
    // 用户要求：内容区不再出现“加载中…”文字，只保留 aria 语义
    expect(placeholder?.textContent).toBe('');
    expect(placeholder?.getAttribute('aria-label')).toBe('Loading file...');

    resolveRender();
    await waitFor(() => {
      expect(container.querySelector('.adl-preview-loading')).toBeNull();
    });
  });

  it('reuses cached render output for the same cacheKey (no re-render, no sweep)', async () => {
    const docx = await import('docx-preview');
    const first = render(<DocxPreview data={new ArrayBuffer(8)} cacheKey="docx-cache-test" />);
    await waitFor(() => {
      expect(screen.getByText('hello docx')).toBeTruthy();
    });
    first.unmount();
    vi.clearAllMocks();

    const second = render(<DocxPreview data={new ArrayBuffer(16)} cacheKey="docx-cache-test" />);
    await waitFor(() => {
      expect(second.container.querySelector('.adl-docx-preview__body')?.textContent).toContain(
        'hello docx',
      );
    });
    expect(docx.renderAsync).not.toHaveBeenCalled();
    expect(second.container.querySelector('.adl-preview-loading')).toBeNull();
    // 越过 150ms 延迟窗口后再断言一次：命中缓存确实不会冒出扫光。
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(second.container.querySelector('.adl-preview-loading')).toBeNull();
  });

  it('re-renders when the cache key changes (file edited on disk)', async () => {
    const docx = await import('docx-preview');
    const first = render(<DocxPreview data={new ArrayBuffer(8)} cacheKey="docx-mtime-1" />);
    await waitFor(() => {
      expect(screen.getByText('hello docx')).toBeTruthy();
    });
    first.unmount();
    vi.clearAllMocks();

    render(<DocxPreview data={new ArrayBuffer(16)} cacheKey="docx-mtime-2" />);
    await waitFor(() => {
      expect(docx.renderAsync).toHaveBeenCalledTimes(1);
    });
  });

  it('shows a re-save hint for legacy .doc without calling the renderer', async () => {
    render(<DocxPreview data={new ArrayBuffer(8)} fileName="docs/old.doc" />);
    await waitFor(() => {
      expect(screen.getByText(/Legacy format, re-save as/u)).toBeTruthy();
    });
    const docx = await import('docx-preview');
    expect(docx.renderAsync).not.toHaveBeenCalled();
  });
});
