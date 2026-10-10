import React, { Suspense } from 'react';

const LazyMarkdownPreview = React.lazy(() =>
  import('./MarkdownPreview').then((m) => ({ default: m.MarkdownPreview })),
);
const LazyDocxPreview = React.lazy(() =>
  import('./DocxPreview').then((m) => ({ default: m.DocxPreview })),
);
const LazyPdfPreview = React.lazy(() =>
  import('./PdfPreview').then((m) => ({ default: m.PdfPreview })),
);
const LazyMediaPreview = React.lazy(() =>
  import('./MediaPreview').then((m) => ({ default: m.MediaPreview })),
);
const LazyXlsxPreview = React.lazy(() =>
  import('./XlsxPreview').then((m) => ({ default: m.XlsxPreview })),
);
const LazyPptxPreview = React.lazy(() =>
  import('./PptxPreview').then((m) => ({ default: m.PptxPreview })),
);

export type { MarkdownPreviewProps } from './markdownPreviewUtils';
export type { DocxPreviewProps } from './DocxPreview';
export type { PdfPreviewProps } from './PdfPreview';
export type { MediaPreviewProps, MediaKind } from './MediaPreview';
export type { XlsxPreviewProps } from './XlsxPreview';
export type { PptxPreviewProps } from './PptxPreview';

export function LazyMarkdownPreviewWrapper(
  props: React.ComponentProps<typeof LazyMarkdownPreview>,
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

export function LazyMediaPreviewWrapper(props: React.ComponentProps<typeof LazyMediaPreview>) {
  return (
    <Suspense fallback={null}>
      <LazyMediaPreview {...props} />
    </Suspense>
  );
}

export function LazyXlsxPreviewWrapper(props: React.ComponentProps<typeof LazyXlsxPreview>) {
  return (
    <Suspense fallback={null}>
      <LazyXlsxPreview {...props} />
    </Suspense>
  );
}

export function LazyPptxPreviewWrapper(props: React.ComponentProps<typeof LazyPptxPreview>) {
  return (
    <Suspense fallback={null}>
      <LazyPptxPreview {...props} />
    </Suspense>
  );
}
