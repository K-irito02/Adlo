import React, { useEffect, useState } from 'react';
import mammoth from 'mammoth';

export type DocxPreviewProps = {
  data: ArrayBuffer;
  theme?: 'light' | 'dark';
};

export function DocxPreview({ data, theme = 'dark' }: DocxPreviewProps) {
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
        <p>DOCX 预览失败: {error}</p>
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
