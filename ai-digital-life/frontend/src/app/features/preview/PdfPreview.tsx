import { useEffect, useRef, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { IconChevronLeft, IconChevronRight } from '@icons';
// eslint-disable-next-line no-restricted-syntax
import type * as PdfJsType from 'pdfjs-dist';

export interface PdfPreviewProps {
  data: ArrayBuffer;
  theme?: 'light' | 'dark';
}

export function PdfPreview({ data, theme = 'dark' }: PdfPreviewProps) {
  const { t, formatT } = useTCopy();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');

  useEffect(() => {
    let cancelled = false;
    let pdfjs: typeof PdfJsType;

    async function initPdfjs() {
      if (!pdfjs) {
        pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();
      }
    }

    async function renderPage() {
      try {
        await initPdfjs();
        // pdf.js 会转移（detach）传入的 ArrayBuffer：每次渲染前复制，
        // 否则翻页时复用同一 buffer 会报 "detached ArrayBuffer"。
        const pdf = await pdfjs!.getDocument({ data: data.slice(0) }).promise;
        if (cancelled) {
          return;
        }
        setNumPages(pdf.numPages);
        const page = await pdf.getPage(currentPage);
        if (cancelled) {
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
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    renderPage();
    return () => {
      cancelled = true;
    };
  }, [data, currentPage]);

  // 按钮翻页后输入框同步；输入非法时回滚显示当前页。
  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  const commitPageInput = () => {
    if (numPages <= 0) {
      return;
    }
    const parsed = Number.parseInt(pageInput, 10);
    const target = Number.isNaN(parsed) ? currentPage : Math.min(Math.max(parsed, 1), numPages);
    setCurrentPage(target);
    setPageInput(String(target));
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
          <span>
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
              onChange={(event) => setPageInput(event.target.value)}
              onBlur={commitPageInput}
              aria-label={t.changesPdfPageNumber as string}
            />
            <button type="submit" aria-label={t.changesPdfGo as string}>
              {t.changesPdfGo as string}
            </button>
          </form>
        </div>
      )}
      <div className="adl-pdf-scroll">
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
