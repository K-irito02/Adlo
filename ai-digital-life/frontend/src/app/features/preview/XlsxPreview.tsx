import { useEffect, useMemo, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { useTCopy } from '@i18n/useTCopy';
import { FidelityWatermark } from './FidelityWatermark';
import { isZipUnpackError } from './officeErrors';

export interface XlsxPreviewProps {
  data: ArrayBuffer;
  theme?: 'light' | 'dark';
  /** 工作区相对路径：切换文件时重播水印淡出动画 */
  fileName?: string;
}

/**
 * 表格预览（第三方：SheetJS Community Edition `xlsx`，Apache-2.0，
 * https://sheetjs.com ，懒加载）。
 * 取工作簿全部工作表并转 HTML 表格；HTML 字符串经 DOMPurify 消毒后渲染。
 * 注意：旧版 .xls 是 BIFF 格式但 SheetJS 可读，有意不做 legacy 拦截。
 */
export function XlsxPreview({ data, theme = 'dark', fileName }: XlsxPreviewProps) {
  const { t, formatT } = useTCopy();
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [html, setHtml] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [unreadable, setUnreadable] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // 工作簿缓存（Phase 4 审查 D-03）：切表是高频操作，解析一次，
  // 切表只转单表 HTML，不再全量 XLSX.read。
  const workbookRef = useRef<{ SheetNames: string[]; Sheets: Record<string, unknown> } | null>(
    null,
  );

  useEffect(() => {
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
        if (cancelled) {
          return;
        }
        const workbook = XLSX.read(data.slice(0), { type: 'array' });
        if (cancelled) {
          return;
        }
        workbookRef.current = workbook as unknown as {
          SheetNames: string[];
          Sheets: Record<string, unknown>;
        };
        setSheetNames(workbook.SheetNames);
        const first = workbook.Sheets[workbook.SheetNames[0]];
        setHtml(first ? XLSX.utils.sheet_to_html(first) : '');
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
  }, [data]);

  const switchSheet = async (index: number) => {
    try {
      const cached = workbookRef.current;
      const sheet = cached?.Sheets[cached.SheetNames[index] ?? ''];
      if (sheet !== undefined) {
        const XLSX = await import('xlsx');
        setHtml(XLSX.utils.sheet_to_html(sheet as never));
        // 解析成功才移动选中态（rev2 复审 N-03）：失败时 select 保持旧值，
        // 与已渲染表格一致，不出现"选中 B 表、显示报错"的错位。
        setActiveSheet(index);
        return;
      }
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(data.slice(0), { type: 'array' });
      const fallback = workbook.Sheets[workbook.SheetNames[index]];
      setHtml(fallback ? XLSX.utils.sheet_to_html(fallback) : '');
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

  if (unreadable) {
    return (
      <div className={`adl-xlsx-preview adl-xlsx-preview--${theme} adl-xlsx-preview--error`}>
        <p>{t.spreadsheetUnreadable as string}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`adl-xlsx-preview adl-xlsx-preview--${theme} adl-xlsx-preview--error`}>
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
        {loaded && sheetNames.length === 0 ? (
          <p className="adl-xlsx-preview__empty">{t.spreadsheetEmpty as string}</p>
        ) : (
          <div
            className="adl-xlsx-preview__table"
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />
        )}
      </div>
    </div>
  );
}
