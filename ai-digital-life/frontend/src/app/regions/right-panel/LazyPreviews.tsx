import React, { Suspense } from "react";

const LazyMarkdownPreview = React.lazy(() =>
  import("./MarkdownPreview").then((m) => ({ default: m.MarkdownPreview }))
);
const LazyDocxPreview = React.lazy(() =>
  import("./DocxPreview").then((m) => ({ default: m.DocxPreview }))
);
const LazyPdfPreview = React.lazy(() =>
  import("./PdfPreview").then((m) => ({ default: m.PdfPreview }))
);

export type { MarkdownPreviewProps } from "./MarkdownPreview";
export type { DocxPreviewProps } from "./DocxPreview";
export type { PdfPreviewProps } from "./PdfPreview";

function PreviewLoadingFallback() {
  return <div className="adl-preview-loading">加载预览...</div>;
}

export function LazyMarkdownPreviewWrapper(props: React.ComponentProps<typeof LazyMarkdownPreview>) {
  return (
    <Suspense fallback={<PreviewLoadingFallback />}>
      <LazyMarkdownPreview {...props} />
    </Suspense>
  );
}

export function LazyDocxPreviewWrapper(props: React.ComponentProps<typeof LazyDocxPreview>) {
  return (
    <Suspense fallback={<PreviewLoadingFallback />}>
      <LazyDocxPreview {...props} />
    </Suspense>
  );
}

export function LazyPdfPreviewWrapper(props: React.ComponentProps<typeof LazyPdfPreview>) {
  return (
    <Suspense fallback={<PreviewLoadingFallback />}>
      <LazyPdfPreview {...props} />
    </Suspense>
  );
}
