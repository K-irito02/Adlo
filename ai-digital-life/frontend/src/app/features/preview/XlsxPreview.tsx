import { useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { useTCopy } from '@i18n/useTCopy';
import { FidelityWatermark } from './FidelityWatermark';

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
 */
export function XlsxPreview({ data, theme = 'dark', fileName }: XlsxPreviewProps) {
  const { t, formatT } = useTCopy();
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [activeSheet, setActiveSheet] = useState(0);
  const [html, setHtml] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setHtml('');
    setSheetNames([]);
    setActiveSheet(0);

    async function renderWorkbook() {
      try {
        const XLSX = await import('xlsx');
        if (cancelled) {
          return;
        }
        const workbook = XLSX.read(data, { type: 'array' });
        if (cancelled) {
          return;
        }
        setSheetNames(workbook.SheetNames);
        const first = workbook.Sheets[workbook.SheetNames[0]];
        setHtml(first ? XLSX.utils.sheet_to_html(first) : '');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    void renderWorkbook();
    return () => {
      cancelled = true;
    };
  }, [data]);

  const switchSheet = async (index: number) => {
    setActiveSheet(index);
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[index]];
      setHtml(sheet ? XLSX.utils.sheet_to_html(sheet) : '');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const sanitizedHtml = useMemo(() => DOMPurify.sanitize(html), [html]);

  if (error) {
    return (
      <div className={`adl-xlsx-preview adl-xlsx-preview--${theme} adl-xlsx-preview--error`}>
        <p>{formatT(t, 'changesPreviewFailedSpreadsheet', { error: String(error) })}</p>
      </div>
    );
  }

  return (
    <div className={`adl-xlsx-preview adl-xlsx-preview--${theme}`}>
      <FidelityWatermark text={t.spreadsheetFidelityHint as string} fileKey={fileName} />
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
        <div
          className="adl-xlsx-preview__table"
          dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
        />
      </div>
    </div>
  );
}
