import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import { IconChevronLeft, IconChevronRight } from '@icons';
import { PreviewLoadingGate } from './PreviewLoadingGate';
import { createLruCache } from './previewCache';
// eslint-disable-next-line no-restricted-syntax
import type * as PdfJsType from 'pdfjs-dist';

export interface PdfPreviewProps {
  data: ArrayBuffer;
  theme?: 'light' | 'dark';
  /** 预览缓存键（工作区+路径+体积+mtime）：同键回看复用已解析文档 */
  cacheKey?: string;
}

/** 已解析文档缓存（LRU 4）：跳过 getDocument 解析（首屏绘制仍逐页进行）。 */
const pdfDocCache = createLruCache<PdfJsType.PDFDocumentProxy>(4);

/**
 * pdf.js 单例加载器：动态 import 只执行一次（懒加载保留），后续复用同一模块。
 * 既避免每次翻页重复求值模块，也规避测试环境重复动态导入的 mock 解析不稳定。
 */
let pdfjsPromise: Promise<typeof PdfJsType> | null = null;

function loadPdfJs(): Promise<typeof PdfJsType> {
  if (!pdfjsPromise) {
    // 加载失败不清零会永久粘滞拒绝（收尾 G5-M1）：catch 中置空，下次挂载可重试。
    pdfjsPromise = import('pdfjs-dist')
      .then((pdfjs) => {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url,
        ).toString();
        return pdfjs;
      })
      .catch((err: unknown) => {
        pdfjsPromise = null;
        throw err;
      });
  }
  return pdfjsPromise;
}

export function PdfPreview({ data, theme = 'dark', cacheKey }: PdfPreviewProps) {
  const { t, formatT } = useTCopy();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const docRef = useRef<{ source: ArrayBuffer; pdf: PdfJsType.PDFDocumentProxy } | null>(null);
  // 在途绘制任务（收尾 G5-L6）：cleanup 中 cancel，保证快速翻页只保留末写者。
  const activeRenderRef = useRef<{ cancel: () => void } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState('1');
  // 双击页码进入直接输入态（用户要求：双击 → 输入页码 → 回车跳转）。
  const [editingPage, setEditingPage] = useState(false);
  const pageInputRef = useRef<HTMLInputElement | null>(null);
  // 多实例并存时 aria 引用不能撞 id（收尾 G5-M2）。
  const pageCountId = useId();

  // 按钮翻页后输入框同步；输入非法时回滚显示当前页。
  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  // 进入输入态即聚焦并全选，回车/失焦提交、Esc 取消。
  useEffect(() => {
    if (!editingPage) {
      return;
    }
    pageInputRef.current?.focus();
    pageInputRef.current?.select();
  }, [editingPage]);

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
      const renderTask = page.render({ canvas, canvasContext: ctx, viewport });
      // 快速连续翻页取消在途绘制（收尾 G5-L6）：旧 render 继续向同一 canvas 绘制会闪现旧页；
      // 取消异常（CancellationException）在 cleanup 吞掉，只保留末写者。
      activeRenderRef.current = renderTask;
      try {
        await renderTask.promise;
      } catch (err) {
        if (err instanceof Error && err.name !== 'RenderingCancelledException') {
          throw err;
        }
      } finally {
        if (activeRenderRef.current === renderTask) {
          activeRenderRef.current = null;
        }
      }
    },
    [],
  );

  // 切文档：只做重置 + 解析 + 存档，不直接绘制。
  // 首屏绘制统一走翻页 effect（其依赖含 numPages）：canvas 只在 numPages>0 才挂载，
  // 若加载 effect 内 setNumPages 后同 tick 直接 paint，读到的仍是旧 DOM（null），
  // 首屏即被丢弃且无人补画（收尾 R34-H1 的真竞态）。
  useEffect(() => {
    docRef.current = null;
    setCurrentPage(1);
    setPageInput('1');
    setEditingPage(false);
    setError(null);
    setNumPages(0);

    // 回看命中：复用已解析文档（跳过 getDocument 的解析开销与扫光）。
    const cached = cacheKey ? pdfDocCache.get(cacheKey) : undefined;
    if (cached) {
      docRef.current = { source: data, pdf: cached };
      setNumPages(cached.numPages);
      return () => {
        activeRenderRef.current?.cancel();
      };
    }

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
        if (cacheKey) {
          pdfDocCache.set(cacheKey, pdf);
        }
        docRef.current = { source: data, pdf };
        setNumPages(pdf.numPages);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
      activeRenderRef.current?.cancel();
    };
  }, [data, cacheKey]);

  // 绘制（含首屏补画）：文档就绪且 canvas 已挂载才画。
  // numPages 在依赖中——解析完成 setNumPages 后重跑，正好补上首屏第一帧。
  useEffect(() => {
    const entry = docRef.current;
    if (!entry || entry.source !== data || numPages === 0) {
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
      activeRenderRef.current?.cancel();
    };
  }, [data, currentPage, numPages, paintPage]);

  const beginPageEdit = () => {
    if (numPages <= 0) {
      return;
    }
    setPageInput(String(currentPage));
    setEditingPage(true);
  };

  /** 退出输入态：非法输入回滚当前页，合法输入钳制后跳转（Enter / 失焦共用）。 */
  const commitPageInput = () => {
    setEditingPage(false);
    if (numPages <= 0) {
      return;
    }
    // 严格整数语义（复审 #3）：拒绝 "2abc"/"2.9" 等 parseInt 宽容解析；
    // 目标等于当前页即 no-op，避免多余渲染。
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

  const cancelPageEdit = () => {
    setPageInput(String(currentPage));
    setEditingPage(false);
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
      {/* 极简悬浮胶囊（用户选定原型 A）：常驻 DOM、悬浮文档区时显现；
          页码双击进入直接输入，回车跳转。 */}
      {numPages > 1 && (
        <div className="adl-pdf-preview-nav" data-editing={editingPage} id={pageCountId}>
          <button
            type="button"
            className="adl-pdf-preview-nav__step"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            aria-label={t.changesPdfPrevPage}
          >
            <IconChevronLeft size={14} decorative />
          </button>
          {editingPage ? (
            <input
              ref={pageInputRef}
              type="text"
              className="adl-pdf-preview-nav__input"
              value={pageInput}
              inputMode="numeric"
              autoComplete="off"
              aria-describedby={pageCountId}
              aria-label={t.changesPdfPageNumber}
              onChange={(event) => setPageInput(event.target.value)}
              onBlur={commitPageInput}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitPageInput();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelPageEdit();
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="adl-pdf-preview-nav__count"
              // 原生 title 与 aria-label 同义：双击可输入是隐藏交互，需要可发现的提示。
              title={t.changesPdfPageJumpHint as string}
              aria-label={t.changesPdfPageJumpHint as string}
              onDoubleClick={beginPageEdit}
            >
              {currentPage} / {numPages}
            </button>
          )}
          <button
            type="button"
            className="adl-pdf-preview-nav__step"
            disabled={currentPage >= numPages}
            onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
            aria-label={t.changesPdfNextPage}
          >
            <IconChevronRight size={14} decorative />
          </button>
        </div>
      )}
      <div className="adl-pdf-scroll">{numPages === 0 ? null : <canvas ref={canvasRef} />}</div>
      {/* 扫光占位放在滚动容器之外（绝对定位铺满整个预览根），否则会被
          `.adl-pdf-scroll` 的 padding 裁出一圈空白。 */}
      <PreviewLoadingGate active={numPages === 0} variant="plain" overlay />
    </div>
  );
}
