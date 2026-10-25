import { useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { useTCopy } from '@i18n/useTCopy';
import { FidelityWatermark } from './FidelityWatermark';
import { PreviewLoadingGate } from './PreviewLoadingGate';
import { createLruCache } from './previewCache';
import { isZipUnpackError } from './officeErrors';
import type { WorkBook, WorkSheet } from 'xlsx';

export interface XlsxPreviewProps {
  data: ArrayBuffer;
  theme?: 'light' | 'dark';
  /** 工作区相对路径：切换文件时重播水印淡出动画 */
  fileName?: string;
  /** 预览缓存键（工作区+路径+体积+mtime）：同键回看复用已转换表格 */
  cacheKey?: string;
}

interface XlsxCacheEntry {
  sheetNames: string[];
  htmlBySheet: Record<string, string>;
}

/** 表格 HTML 缓存（LRU 8）：回看免解析、免扫光。 */
const xlsxCache = createLruCache<XlsxCacheEntry>({
  limit: 6,
  weigh: (entry) => Object.values(entry.htmlBySheet).join('').length,
  maxWeight: 3_000_000,
});

/**
 * 表格预览（第三方：SheetJS Community Edition `xlsx`，Apache-2.0，
 * https://sheetjs.com ，懒加载）。
 * 取工作簿全部工作表并转 HTML 表格；HTML 字符串经 DOMPurify 消毒后渲染。
 * 注意：旧版 .xls 是 BIFF 格式但 SheetJS 可读，有意不做 legacy 拦截。
 */
export function XlsxPreview({ data, theme = 'dark', fileName, cacheKey }: XlsxPreviewProps) {
  const { t, formatT } = useTCopy();
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [html, setHtml] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [unreadable, setUnreadable] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // 工作簿缓存（收尾 D-03）：切表是高频操作，解析一次，
  // 切表只转单表 HTML，不再全量 XLSX.read。类型与 xlsx 包内 WorkBook 对齐。
  const workbookRef = useRef<WorkBook | null>(null);
  // 文档代次：切文件后丢弃在途的切表结果（防止旧表 HTML 写进新文档）。
  const generationRef = useRef(0);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    // 回看命中：直接复用上次转换结果（跳过解析、无扫光）。
    const cached = cacheKey ? xlsxCache.get(cacheKey) : undefined;
    if (cached) {
      setError(null);
      setUnreadable(false);
      workbookRef.current = null;
      setSheetNames(cached.sheetNames);
      setActiveSheet(0);
      setHtml(cached.htmlBySheet[cached.sheetNames[0] ?? ''] ?? '');
      setLoaded(true);
      return undefined;
    }

    let cancelled = false;
    setError(null);
    setUnreadable(false);
    setLoaded(false);
    setHtml('');
    setSheetNames([]);
    setActiveSheet(0);
    workbookRef.current = null;

    async function renderWorkbook() {
      try {
        const XLSX = await import('xlsx');
        if (cancelled || generation !== generationRef.current) {
          return;
        }
        const workbook = XLSX.read(data.slice(0), { type: 'array' });
        if (cancelled || generation !== generationRef.current) {
          return;
        }
        workbookRef.current = workbook;
        setSheetNames(workbook.SheetNames);
        const first = workbook.Sheets[workbook.SheetNames[0]];
        const firstHtml = first ? XLSX.utils.sheet_to_html(first) : '';
        setHtml(firstHtml);
        if (cacheKey) {
          xlsxCache.set(cacheKey, {
            sheetNames: workbook.SheetNames,
            htmlBySheet: { [workbook.SheetNames[0] ?? '']: firstHtml },
          });
        }
        setLoaded(true);
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          if (isZipUnpackError(message)) {
            setUnreadable(true);
          } else {
            setError(message);
          }
        }
      }
    }

    void renderWorkbook();
    return () => {
      cancelled = true;
    };
  }, [data, cacheKey]);

  /** 记住已生成的单表 HTML（不可变更新，避免就地改写缓存对象）。 */
  const rememberSheetHtml = (name: string | undefined, nextHtml: string) => {
    if (!cacheKey || name === undefined) {
      return;
    }
    const entry = xlsxCache.get(cacheKey);
    if (!entry) {
      return;
    }
    xlsxCache.set(cacheKey, {
      sheetNames: entry.sheetNames,
      htmlBySheet: { ...entry.htmlBySheet, [name]: nextHtml },
    });
  };

  const switchSheet = async (index: number) => {
    const generation = generationRef.current;
    try {
      const sheetName = sheetNames[index];
      const cachedHtml =
        cacheKey && sheetName !== undefined
          ? xlsxCache.get(cacheKey)?.htmlBySheet[sheetName]
          : undefined;
      if (cachedHtml !== undefined) {
        setHtml(cachedHtml);
        setActiveSheet(index);
        return;
      }
      const workbook = workbookRef.current;
      const sheet = workbook?.Sheets[sheetName ?? ''] as WorkSheet | undefined;
      if (sheet !== undefined) {
        const XLSX = await import('xlsx');
        if (generation !== generationRef.current) {
          return;
        }
        const nextHtml = XLSX.utils.sheet_to_html(sheet);
        setHtml(nextHtml);
        rememberSheetHtml(sheetName, nextHtml);
        // 解析成功才移动选中态（rev2 复审 N-03）：失败时 select 保持旧值，
        // 与已渲染表格一致，不出现"选中 B 表、显示报错"的错位。
        setActiveSheet(index);
        return;
      }
      const XLSX = await import('xlsx');
      if (generation !== generationRef.current) {
        return;
      }
      // 回看命中时没有 workbookRef：这里补一次解析并留下缓存，
      // 后续再切表就不用重复吃整本解析的开销。
      const workbookFallback = workbookRef.current ?? XLSX.read(data.slice(0), { type: 'array' });
      workbookRef.current = workbookFallback;
      const fallback = workbookFallback.Sheets[workbookFallback.SheetNames[index]];
      const nextHtml = fallback ? XLSX.utils.sheet_to_html(fallback) : '';
      setHtml(nextHtml);
      rememberSheetHtml(sheetName, nextHtml);
      // 回退路径同样移动选中态（与缓存路径一致，避免选中与内容错位）。
      setActiveSheet(index);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isZipUnpackError(message)) {
        setUnreadable(true);
      } else {
        setError(message);
      }
    }
  };

  const sanitizedHtml = useMemo(() => DOMPurify.sanitize(html), [html]);
  // 包装对象必须按内容 memo：React 对 dangerouslySetInnerHTML 按包装对象恒等比较，
  // 内联字面量每次渲染都是新对象 → 每次重写 innerHTML（即使字符串相同），
  // 在可滚动表格区引发滚动锚定抖动（与 MarkdownPreview 事项 9 同根因）。
  const innerHtml = useMemo(() => ({ __html: sanitizedHtml }), [sanitizedHtml]);

  if (unreadable) {
    return (
      <div
        className={`adl-xlsx-preview adl-xlsx-preview--${theme} adl-xlsx-preview--error`}
        role="alert"
      >
        <p>{t.spreadsheetUnreadable as string}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`adl-xlsx-preview adl-xlsx-preview--${theme} adl-xlsx-preview--error`}
        role="alert"
      >
        <p>{formatT(t, 'changesPreviewFailedSpreadsheet', { error: String(error) })}</p>
      </div>
    );
  }

  return (
    <div className={`adl-xlsx-preview adl-xlsx-preview--${theme}`}>
      <FidelityWatermark
        key={fileName}
        text={t.spreadsheetFidelityHint as string}
        fileKey={fileName}
      />
      <div className="adl-xlsx-scroll">
        {sheetNames.length > 1 ? (
          <label className="adl-xlsx-preview__sheets">
            <span>{t.spreadsheetSheet as string}</span>
            <select
              value={activeSheet}
              onChange={(event) => void switchSheet(Number(event.target.value))}
              aria-label={t.spreadsheetSheet as string}
            >
              {sheetNames.map((name, index) => (
                <option key={`${index}-${name}`} value={index}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {loaded && (sheetNames.length === 0 || html.trim() === '') ? (
          <p className="adl-xlsx-preview__empty">{t.spreadsheetEmpty as string}</p>
        ) : (
          <div className="adl-xlsx-preview__table" dangerouslySetInnerHTML={innerHtml} />
        )}
      </div>
      <PreviewLoadingGate active={!loaded} overlay />
    </div>
  );
}
