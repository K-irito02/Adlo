import React, { Suspense } from 'react';

const LazyMarkdownPreview = React.lazy(() =>
  import('./MarkdownPreview').then((m) => ({ default: m.MarkdownPreview }))
);
const LazyDocxPreview = React.lazy(() =>
  import('./DocxPreview').then((m) => ({ default: m.DocxPreview }))
);
const LazyPdfPreview = React.lazy(() =>
  import('./PdfPreview').then((m) => ({ default: m.PdfPreview }))
);

export type { MarkdownPreviewProps } from './markdownPreviewUtils';
export type { DocxPreviewProps } from './DocxPreview';
export type { PdfPreviewProps } from './PdfPreview';

export function LazyMarkdownPreviewWrapper(
  props: React.ComponentProps<typeof LazyMarkdownPreview>
) {
  return (
    <Suspense fallback={null}>
      <LazyMarkdownPreview {...props} />
    </Suspense>
  );
}

export function LazyDocxPreviewWrapper(props: React.ComponentProps<typeof LazyDocxPreview>) {
  return (
    <Suspense fallback={null}>
      <LazyDocxPreview {...props} />
    </Suspense>
  );
}

export function LazyPdfPreviewWrapper(props: React.ComponentProps<typeof LazyPdfPreview>) {
  return (
    <Suspense fallback={null}>
      <LazyPdfPreview {...props} />
    </Suspense>
  );
}
