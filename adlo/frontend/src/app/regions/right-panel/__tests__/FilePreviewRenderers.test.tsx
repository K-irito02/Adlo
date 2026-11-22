// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceMediaSource } from '@adlo/kernel';
import { FilePreviewRenderers } from '../FilePreviewRenderers';
import { createStickyContextModel } from '../editor-support/stickyContext';

/**
 * 办公分支的签名/兜底回归（P4 R1 补测）：
 * - PDF 头允许出现在前 1024 字节内（BOM/前导字节）；
 * - ZIP（OOXML）必须偏移 0；
 * - 旧版 OLE 占位（url=''）与 odp 走明确指引，不拉解析库；
 * - 取字节失败走「文档数据加载失败」。
 */

const noopRef = { current: null };

vi.mock('@i18n/useTCopy', () => ({
  useTCopy: () => ({
    t: new Proxy({}, { get: (_target, key) => String(key) }),
    formatT: () => 'officeLegacyFormat',
  }),
}));

vi.mock('@features/preview', () => ({
  LazyPdfPreviewWrapper: ({ data }: { data: ArrayBuffer }) => (
    <div data-testid="pdf-viewer" data-bytes={data.byteLength} />
  ),
  LazyDocxPreviewWrapper: () => <div data-testid="docx-viewer" />,
  LazyXlsxPreviewWrapper: () => <div data-testid="xlsx-viewer" />,
  LazyPptxPreviewWrapper: () => <div data-testid="pptx-viewer" />,
  LazyMarkdownPreviewWrapper: ({ content }: { content: string }) => (
    <div data-testid="markdown-viewer">{content}</div>
  ),
  LazyMediaPreviewWrapper: () => null,
  PreviewLoadingGate: () => <div data-testid="loading-gate" />,
  UnsupportedPreviewCard: ({ title }: { title: string }) => (
    <div data-testid="unsupported">{title}</div>
  ),
  buildPreviewCacheKey: () => 'preview-key',
}));

vi.mock('@features/preview/openByMethod', () => ({
  openMarkdownFileLink: vi.fn(),
  openUrlByMethod: vi.fn(),
}));

vi.mock('@components/RevealHighlight', () => ({ RevealHighlightLayers: () => null }));

vi.mock('../HeavyPreviewGate', () => ({ HeavyPreviewGate: () => null }));

function media(path: string, url = `http://127.0.0.1/media/${path}`): WorkspaceMediaSource {
  return {
    url,
    path,
    mime: 'application/octet-stream',
    size: 1024,
    lastModifiedAt: 1_700_000_000_000,
  };
}

function bytesOf(source: number[]): ArrayBuffer {
  return new Uint8Array(source).buffer;
}

function renderOffice(
  category: 'pdf' | 'docx' | 'spreadsheet' | 'presentation',
  fileMedia: WorkspaceMediaSource,
) {
  return render(
    <FilePreviewRenderers
      editorSurfaceRef={noopRef}
      fileCategory={category}
      fileContent={null}
      fileMedia={fileMedia}
      filePath={fileMedia.path}
      workspaceId="ws"
      fileMediaLoading={false}
      theme="dark"
    />,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('FilePreviewRenderers 办公分支', () => {
  it('PDF 头在前导字节之后仍可预览', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () =>
          bytesOf([0xef, 0xbb, 0xbf, ...'%PDF-1.7\n'.split('').map((c) => c.charCodeAt(0))]),
      })),
    );

    renderOffice('pdf', media('docs/a.pdf'));

    expect(await screen.findByTestId('pdf-viewer')).toBeTruthy();
  });

  it('PDF 没有文件头时给出解析失败出口', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => bytesOf([0x50, 0x4b, 0x03, 0x04]),
      })),
    );

    renderOffice('pdf', media('docs/broken.pdf'));

    expect((await screen.findByTestId('unsupported')).textContent).toContain('officeDecodeFailed');
  });

  it('docx 的 ZIP 签名不符时报损坏', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => bytesOf([0x25, 0x50, 0x44, 0x46, 0x2d]),
      })),
    );

    renderOffice('docx', media('docs/broken.docx'));

    expect((await screen.findByTestId('unsupported')).textContent).toContain('docxUnreadable');
  });

  it('docx 的 ZIP 签名正确时进入解析分支', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => bytesOf([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]),
      })),
    );

    renderOffice('docx', media('docs/a.docx'));

    expect(await screen.findByTestId('docx-viewer')).toBeTruthy();
  });

  it('BIFF .xls（OLE/CFB 容器）仍走表格解析，不被当成损坏', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () =>
          bytesOf([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00]),
      })),
    );

    renderOffice('spreadsheet', media('docs/a.xls'));

    expect(await screen.findByTestId('xlsx-viewer')).toBeTruthy();
  });

  it('docx 使用 OLE/CFB 头时仍判损坏（只有表格接受 BIFF）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => bytesOf([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      })),
    );

    renderOffice('docx', media('docs/fake.docx'));

    expect((await screen.findByTestId('unsupported')).textContent).toContain('docxUnreadable');
  });

  it('旧版 .ppt 占位不取字节，直接给转存指引', () => {
    vi.stubGlobal('fetch', vi.fn());

    renderOffice('presentation', media('docs/legacy.ppt', ''));

    expect(screen.getByTestId('unsupported').textContent).toContain('officeLegacyFormat');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('odp 明确提示不支持', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => bytesOf([0x50, 0x4b, 0x03, 0x04]),
      })),
    );

    renderOffice('presentation', media('docs/a.odp'));

    expect((await screen.findByTestId('unsupported')).textContent).toContain(
      'changesPreviewNotSupported',
    );
  });

  it('取字节失败时给解析失败出口', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404 })),
    );

    renderOffice('pdf', media('docs/missing.pdf'));

    expect((await screen.findByTestId('unsupported')).textContent).toContain('officeDecodeFailed');
  });

  it('markdown 预览渲染「文件顶部」模型（接线不是纯字符串断言）', () => {
    const model = createStickyContextModel({
      modelId: 'preview',
      canScrollToTop: true,
      onNavigateLine: () => undefined,
      topLabel: '文件顶部',
    });
    render(
      <FilePreviewRenderers
        editorSurfaceRef={noopRef}
        fileCategory="markdown"
        fileContent={'---\nname: x\n---\n# T\n'}
        fileMedia={null}
        filePath="note.md"
        workspaceId="ws"
        fileMediaLoading={false}
        theme="dark"
        stickyContextModel={model}
      />,
    );

    expect(screen.getByTestId('markdown-viewer')).toBeTruthy();
    expect(screen.getByTestId('files-preview-sticky-context')).toBeTruthy();
  });
});
