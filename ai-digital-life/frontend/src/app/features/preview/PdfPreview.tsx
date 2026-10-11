import { useCallback, useEffect, useRef, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { IconChevronLeft, IconChevronRight } from '@icons';
// eslint-disable-next-line no-restricted-syntax
import type * as PdfJsType from 'pdfjs-dist';

export interface PdfPreviewProps {
  data: ArrayBuffer;
  theme?: 'light' | 'dark';
}

/**
 * pdf.js 单例加载器：动态 import 只执行一次（懒加载保留），后续复用同一模块。
 * 既避免每次翻页重复求值模块，也规避测试环境重复动态导入的 mock 解析不稳定。
 */
let pdfjsPromise: Promise<typeof PdfJsType> | null = null;

function loadPdfJs(): Promise<typeof PdfJsType> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).toString();
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

export function PdfPreview({ data, theme = 'dark' }: PdfPreviewProps) {
  const { t, formatT } = useTCopy();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const docRef = useRef<{ source: ArrayBuffer; pdf: PdfJsType.PDFDocumentProxy } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');

  // 按钮翻页后输入框同步；输入非法时回滚显示当前页。
  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const paintPage = useCallback(
    async (
      pdf: PdfJsType.PDFDocumentProxy,
      pageNum: number,
      isCancelled: () => boolean,
    ): Promise<void> => {
      const page = await pdf.getPage(pageNum);
      if (isCancelled()) {
        return;
      }
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }
      const viewport = page.getViewport({ scale: 1.5 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return;
      }
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    },
    [],
  );

  // 切文档：重置 + 解析 + 首屏渲染全在一个 effect 内完成，保证每个文档只解析一次。
  // 若与翻页 effect 分开（重置一个 effect、解析一个 effect），切文档瞬间两个 effect
  // 各解析一次形成竞态（后写者胜），虽同数据无害但浪费且测试不可判定。
  useEffect(() => {
    docRef.current = null;
    setCurrentPage(1);
    setPageInput('1');
    setError(null);
    setNumPages(0);
    let cancelled = false;
    void (async () => {
      try {
        const pdfjs = await loadPdfJs();
        // pdf.js 会转移（detach）传入的 ArrayBuffer：解析前复制，
        // 否则复用同一 buffer 会报 "detached ArrayBuffer"。
        const pdf = await pdfjs.getDocument({ data: data.slice(0) }).promise;
        if (cancelled) {
          return;
        }
        docRef.current = { source: data, pdf };
        setNumPages(pdf.numPages);
        await paintPage(pdf, 1, () => cancelled);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data, paintPage]);

  // 翻页：只取页渲染。文档未就绪（切文档解析中）直接返回，由加载 effect 负责首屏。
  useEffect(() => {
    const entry = docRef.current;
    if (!entry || entry.source !== data) {
      return undefined;
    }
    let cancelled = false;
    void paintPage(entry.pdf, currentPage, () => cancelled).catch((err: unknown) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [data, currentPage, paintPage]);

  const commitPageInput = () => {
    if (numPages <= 0) {
      return;
    }
    // 严格整数语义（复审 #3）：拒绝 "2abc"/"2.9" 等 parseInt 宽容解析；
    // 目标等于当前页即 no-op，避免多余渲染（blur+submit 双提交因此零成本）。
    const text = pageInput.trim();
    if (!/^\d+$/.test(text)) {
      setPageInput(String(currentPage));
      return;
    }
    const target = Math.min(Math.max(Number.parseInt(text, 10), 1), numPages);
    setPageInput(String(target));
    if (target !== currentPage) {
      setCurrentPage(target);
    }
  };

  if (error) {
    return (
      <div className={`adl-pdf-preview adl-pdf-preview--${theme} adl-pdf-preview--error`}>
        <p>{formatT(t, 'changesPreviewFailedPdf', { error: String(error) })}</p>
      </div>
    );
  }

  return (
    <div className={`adl-pdf-preview adl-pdf-preview--${theme}`}>
      {numPages > 1 && (
        <div className="adl-pdf-preview-nav">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            aria-label={t.changesPdfPrevPage}
          >
            <IconChevronLeft size={14} decorative />
          </button>
          <span id="adl-pdf-page-count">
            {currentPage} / {numPages}
          </span>
          <button
            type="button"
            disabled={currentPage >= numPages}
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
            aria-label={t.changesPdfNextPage}
          >
            <IconChevronRight size={14} decorative />
          </button>
          <form
            className="adl-pdf-preview-jump"
            onSubmit={(event) => {
              event.preventDefault();
              commitPageInput();
            }}
          >
            <input
              type="number"
              value={pageInput}
              inputMode="numeric"
              min={1}
              max={numPages}
              autoComplete="off"
              aria-describedby="adl-pdf-page-count"
              onChange={(event) => setPageInput(event.target.value)}
              onBlur={commitPageInput}
              aria-label={t.changesPdfPageNumber}
            />
            <button type="submit">{t.changesPdfGo}</button>
          </form>
        </div>
      )}
      <div className="adl-pdf-scroll">
        {numPages === 0 ? (
          <p className="adl-pdf-preview-loading">{t.loading as string}</p>
        ) : (
          <canvas ref={canvasRef} />
        )}
      </div>
    </div>
  );
}
