import React, { useEffect, useState } from 'react';
import mammoth from 'mammoth';
import { useTCopy } from '../../i18n/useTCopy';

export interface DocxPreviewProps {
  data: ArrayBuffer;
  theme?: 'light' | 'dark';
}

export function DocxPreview({ data, theme = 'dark' }: DocxPreviewProps) {
  const { t, formatT } = useTCopy();
  const [html, setHtml] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    mammoth
      .convertToHtml({ arrayBuffer: data })
      .then((result) => {
        setHtml(result.value);
        if (result.messages.length > 0) {
          console.warn('DOCX conversion warnings:', result.messages);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
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
