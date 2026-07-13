import React, { useEffect, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';

export interface DocxPreviewProps {
  data: ArrayBuffer;
  theme?: 'light' | 'dark';
}

export function DocxPreview({ data, theme = 'dark' }: DocxPreviewProps) {
  const { t, formatT } = useTCopy();
  const [html, setHtml] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function convertDocx() {
      try {
        const mammoth = await import('mammoth');
        if (cancelled) {
          return;
        }
        const result = await mammoth.default.convertToHtml({ arrayBuffer: data });
        if (cancelled) {
          return;
        }
        setHtml(result.value);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    }

    convertDocx();
    return () => {
      cancelled = true;
    };
  }, [data]);

  if (error) {
    return (
      <div className={`adl-docx-preview adl-docx-preview--${theme} adl-docx-preview--error`}>
        <p>{formatT(t, 'changesPreviewFailedDocx', { error: String(error) })}</p>
      </div>
    );
  }

  return (
    <div
      className={`adl-docx-preview adl-docx-preview--${theme}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
