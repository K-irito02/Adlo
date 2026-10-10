import React, { useMemo, useState } from 'react';
import {
  LazyMarkdownPreviewWrapper,
  LazyDocxPreviewWrapper,
  LazyPdfPreviewWrapper,
  LazyMediaPreviewWrapper,
  LazyXlsxPreviewWrapper,
  LazyPptxPreviewWrapper,
} from '@features/preview';
import { base64ToArrayBuffer } from '@features/preview/mediaBlob';
import { RevealHighlightLayers } from '@components/RevealHighlight';
import { formatBytes } from '@root/design-system/html';
import type { FileCategory } from './fileTypeRouter';
import { HEAVY_PREVIEW_BYTES } from './heavyPreviewLimits';
import { isOfficeTempFile } from './fileTypeRouter';
import type { WorkspaceMediaDocument } from '@ai-digital-life/kernel';
import { useTCopy } from '@i18n/useTCopy';

interface FilePreviewRenderersProps {
  editorSurfaceRef: React.RefObject<HTMLDivElement | null>;
  fileCategory: FileCategory;
  fileContent: string | null;
  /** 二进制媒体文档（图片/音视频/办公）：image/audio/video/docx/pdf/spreadsheet/presentation 分支使用 */
  fileMedia: WorkspaceMediaDocument | null;
  theme: 'dark' | 'light';
}

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

function PreviewSurface({
  editorSurfaceRef,
  children,
}: {
  editorSurfaceRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  return (
    <div
      ref={editorSurfaceRef}
      className="adl-tool-editor__surface adl-tool-editor__surface--preview"
    >
      {children}
    </div>
  );
}

/**
 * 大文件直接渲染阈值见 ./heavyPreviewLimits（媒体/办公分支与文本分支同源）。
 */

const FilePreviewRenderers = React.memo(function FilePreviewRenderers({
  editorSurfaceRef,
  fileCategory,
  fileContent,
  fileMedia,
  theme,
}: FilePreviewRenderersProps) {
  const { t, formatT } = useTCopy();

  const mediaBytes = useMemo(() => {
    if (!fileMedia) {
      return null;
    }
    try {
      return base64ToArrayBuffer(fileMedia.base64);
    } catch {
      return null;
    }
  }, [fileMedia]);

  // 大文件确认门：超过分类阈值时先显示友好提示，用户点"仍然打开"才渲染。
  // 确认态按路径记忆（切走再回来仍有效，同一文件不重复打扰）。
  const [heavyConfirmedPath, setHeavyConfirmedPath] = useState<string | null>(null);
  const heavyThreshold = HEAVY_PREVIEW_BYTES[fileCategory];
  if (
    fileMedia &&
    heavyThreshold !== undefined &&
    fileMedia.size > heavyThreshold &&
    heavyConfirmedPath !== fileMedia.path
  ) {
    return (
      <PreviewSurface editorSurfaceRef={editorSurfaceRef}>
        <div className="adl-unsupported-preview">
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
            <path d="M12 11v6" />
            <path d="M9 14h6" />
          </svg>
          <span className="adl-unsupported-preview__text">{t.heavyPreviewTitle as string}</span>
          <span className="adl-unsupported-preview__hint">
            {formatT(t, 'heavyPreviewHint', {
              name: fileMedia.path,
              size: formatBytes(fileMedia.size),
            })}
          </span>
          <button
            type="button"
            className="adl-unsupported-preview__action"
            onClick={() => setHeavyConfirmedPath(fileMedia.path)}
          >
            {t.heavyPreviewOpen as string}
          </button>
        </div>
      </PreviewSurface>
    );
  }

  // Office 临时锁定文件（~$）：不是文档本身，任何解析库都会报 not-a-zip，
  // 直接给转存指引而不调库（docx/xlsx/pptx/pdf 共用）。
  if (
    fileMedia &&
    (fileCategory === 'docx' ||
      fileCategory === 'pdf' ||
      fileCategory === 'spreadsheet' ||
      fileCategory === 'presentation') &&
    isOfficeTempFile(fileMedia.path)
  ) {
    return (
      <UnsupportedPreview
        editorSurfaceRef={editorSurfaceRef}
        icon={svgBinary}
        text={t.officeTempFileTitle as string}
        hint={t.officeTempFileHint as string}
      />
    );
  }

  if (fileCategory === 'markdown') {
    return (
      <div
        ref={editorSurfaceRef}
        className="adl-tool-editor__surface adl-tool-editor__surface--preview"
      >
        <LazyMarkdownPreviewWrapper content={fileContent ?? ''} theme={theme} />
        {/* 检索跳转落点高亮：视口夹层裁剪溢出，高亮条铺满预览面并与左右边缘贴合 */}
        <RevealHighlightLayers />
      </div>
    );
  }

  if (fileCategory === 'image' || fileCategory === 'audio' || fileCategory === 'video') {
    if (!fileMedia) {
      return null;
    }
    return (
      <PreviewSurface editorSurfaceRef={editorSurfaceRef}>
        {/* key 绑定路径：切换文件即全新挂载，杜绝错误态/旧容器残留串扰 */}
        <LazyMediaPreviewWrapper key={fileMedia.path} media={fileMedia} kind={fileCategory} />
      </PreviewSurface>
    );
  }

  if (fileCategory === 'docx') {
    if (!mediaBytes || !fileMedia) {
      return null;
    }
    return (
      <PreviewSurface editorSurfaceRef={editorSurfaceRef}>
        <LazyDocxPreviewWrapper
          key={fileMedia.path}
          data={mediaBytes}
          theme={theme}
          fileName={fileMedia.path}
        />
      </PreviewSurface>
    );
  }

  if (fileCategory === 'pdf') {
    if (!mediaBytes || !fileMedia) {
      return null;
    }
    return (
      <PreviewSurface editorSurfaceRef={editorSurfaceRef}>
        <LazyPdfPreviewWrapper key={fileMedia.path} data={mediaBytes} theme={theme} />
      </PreviewSurface>
    );
  }

  if (fileCategory === 'spreadsheet') {
    if (!mediaBytes || !fileMedia) {
      return null;
    }
    return (
      <PreviewSurface editorSurfaceRef={editorSurfaceRef}>
        <LazyXlsxPreviewWrapper
          key={fileMedia.path}
          data={mediaBytes}
          theme={theme}
          fileName={fileMedia.path}
        />
      </PreviewSurface>
    );
  }

  if (fileCategory === 'presentation') {
    if (!mediaBytes || !fileMedia) {
      return null;
    }
    return (
      <PreviewSurface editorSurfaceRef={editorSurfaceRef}>
        <LazyPptxPreviewWrapper
          key={fileMedia.path}
          data={mediaBytes}
          theme={theme}
          fileName={fileMedia.path}
        />
      </PreviewSurface>
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
