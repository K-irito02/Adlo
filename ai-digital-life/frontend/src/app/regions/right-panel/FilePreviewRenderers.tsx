import React from 'react';
import { LazyMarkdownPreviewWrapper } from '@features/preview';
import type { FileCategory } from './fileTypeRouter';
import { useTCopy } from '@i18n/useTCopy';

interface FilePreviewRenderersProps {
  editorSurfaceRef: React.RefObject<HTMLDivElement | null>;
  fileCategory: FileCategory;
  fileContent: string | null;
  theme: 'dark' | 'light';
}

const svgDocx = (
  <svg
    className="adl-unsupported-preview__icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6" />
    <path d="M9 15h6" />
  </svg>
);

const svgPdf = (
  <svg
    className="adl-unsupported-preview__icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
    <path d="M14 2v6h6" />
    <path d="M9 13h6" />
    <path d="M9 17h4" />
  </svg>
);

const svgBinary = (
  <svg
    className="adl-unsupported-preview__icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <path d="M6 12h.01" />
    <path d="M10 12h.01" />
    <path d="M14 12h4" />
  </svg>
);

function UnsupportedPreview({
  editorSurfaceRef,
  icon,
  text,
  hint,
}: {
  editorSurfaceRef: React.RefObject<HTMLDivElement | null>;
  icon: React.ReactNode;
  text: string;
  hint: string;
}) {
  return (
    <div
      ref={editorSurfaceRef}
      className="adl-tool-editor__surface adl-tool-editor__surface--preview"
    >
      <div className="adl-unsupported-preview">
        {icon}
        <span className="adl-unsupported-preview__text">{text}</span>
        <span className="adl-unsupported-preview__hint">{hint}</span>
      </div>
    </div>
  );
}

const FilePreviewRenderers = React.memo(function FilePreviewRenderers({
  editorSurfaceRef,
  fileCategory,
  fileContent,
  theme,
}: FilePreviewRenderersProps) {
  const { t } = useTCopy();

  if (fileCategory === 'markdown') {
    return (
      <div
        ref={editorSurfaceRef}
        className="adl-tool-editor__surface adl-tool-editor__surface--preview"
      >
        <LazyMarkdownPreviewWrapper content={fileContent ?? ''} theme={theme} />
      </div>
    );
  }

  if (fileCategory === 'docx') {
    return (
      <UnsupportedPreview
        editorSurfaceRef={editorSurfaceRef}
        icon={svgDocx}
        text={t.changesPreviewDocx as string}
        hint={t.changesPreviewNotSupported as string}
      />
    );
  }

  if (fileCategory === 'pdf') {
    return (
      <UnsupportedPreview
        editorSurfaceRef={editorSurfaceRef}
        icon={svgPdf}
        text={t.changesPreviewPdf as string}
        hint={t.changesPreviewNotSupported as string}
      />
    );
  }

  if (fileCategory === 'binary') {
    return (
      <UnsupportedPreview
        editorSurfaceRef={editorSurfaceRef}
        icon={svgBinary}
        text={t.changesPreviewBinary as string}
        hint={t.changesPreviewNotSupported as string}
      />
    );
  }

  // 'code' and 'text' are handled by the editor surface, not the preview
  // renderer.  The caller (EditorSurfaceShell) already filters them out,
  // so returning null here is safe.
  if (fileCategory === 'code' || fileCategory === 'text') {
    return null;
  }

  // TypeScript exhaustiveness check: if a new FileCategory is added to
  // the union and the caller forgets to filter it, this will be a
  // compile-time error.  The fallback below provides a visible UI rather
  // than a blank area.
  const _exhaustive: never = fileCategory;
  void _exhaustive;

  return (
    <UnsupportedPreview
      editorSurfaceRef={editorSurfaceRef}
      icon={svgBinary}
      text={t.changesPreviewUnknown as string}
      hint={t.changesPreviewNotSupported as string}
    />
  );
});

export { FilePreviewRenderers };
export type { FilePreviewRenderersProps };
