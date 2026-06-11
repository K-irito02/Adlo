import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

export interface PdfPreviewProps {
  data: ArrayBuffer;
  theme?: 'light' | 'dark';
}

export function PdfPreview({ data, theme = 'dark' }: PdfPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    let cancelled = false;

    async function renderPage() {
      try {
        const pdf = await pdfjsLib.getDocument({ data }).promise;
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

  if (error) {
    return (
      <div className={`adl-pdf-preview adl-pdf-preview--${theme} adl-pdf-preview--error`}>
        <p>PDF 预览失败: {error}</p>
      </div>
    );
  }

  return (
    <div className={`adl-pdf-preview adl-pdf-preview--${theme}`}>
      <canvas ref={canvasRef} />
      {numPages > 1 && (
        <div className="adl-pdf-preview-nav">
          <button
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          >
            ‹
          </button>
          <span>
            {currentPage} / {numPages}
          </span>
          <button
            disabled={currentPage >= numPages}
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}
