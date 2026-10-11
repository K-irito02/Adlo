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
import { HeavyPreviewGate } from './HeavyPreviewGate';
import { formatBytes } from '@root/design-system/html';
import { type FileCategory, isMediaFileCategory, isOfficeTempFile } from './fileTypeRouter';
import {
  HEAVY_PREVIEW_BYTES,
  confirmHeavyPreview,
  isHeavyPreviewConfirmed,
} from './heavyPreviewLimits';
import type { WorkspaceMediaDocument } from '@ai-digital-life/kernel';
import { useTCopy } from '@i18n/useTCopy';

interface FilePreviewRenderersProps {
  editorSurfaceRef: React.RefObject<HTMLDivElement | null>;
  fileCategory: FileCategory;
  fileContent: string | null;
  /** 二进制媒体文档（图片/音视频/办公）：image/audio/video/docx/pdf/spreadsheet/presentation 分支使用 */
  fileMedia: WorkspaceMediaDocument | null;
  /** 当前文件路径：markdown 预览 key 挂载用（切换文件重置滚动/状态，防串扰） */
  filePath?: string;
  /** 当前文件所属工作区：与 filePath 共同组成重型门确认 key（跨工作区同路径隔离） */
  workspaceId?: string;
  /** 媒体读取中：fileMedia 为空时区分加载骨架与真空（见 editorSlice.fileMediaLoading） */
  fileMediaLoading?: boolean;
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

/**
 * 办公分支壳（Phase 4 审查 F3/S-01）：base64 解码只在分支挂载后执行——
 * 即重型门确认之后，确认前零解码、零 ArrayBuffer 分配。
 */
function useOfficeBytes(fileMedia: WorkspaceMediaDocument | null): ArrayBuffer | null {
  return useMemo(() => {
    if (!fileMedia) {
      return null;
    }
    try {
      return base64ToArrayBuffer(fileMedia.base64);
    } catch {
      return null;
    }
  }, [fileMedia]);
}

type OfficeBranchKind = 'docx' | 'pdf' | 'spreadsheet' | 'presentation';

/** 四个办公分支的通用壳：解码 + 按品类渲染，消除四份重复分支（B34 优化项）。 */
function OfficeBranch({
  fileMedia,
  kind,
  theme,
}: {
  fileMedia: WorkspaceMediaDocument;
  kind: OfficeBranchKind;
  theme: 'dark' | 'light';
}) {
  const { t } = useTCopy();
  const data = useOfficeBytes(fileMedia);
  // 解码失败不再静默 blank（收尾 F-06/H1）：base64 来自可信后端，
  // 触发率极低，但空白面无任何反馈；此处给友好错误 + alert。
  if (!data) {
    return (
      <div className="adl-unsupported-preview" role="alert">
        <span className="adl-unsupported-preview__text">{t.officeDecodeFailed as string}</span>
      </div>
    );
  }
  switch (kind) {
    case 'docx':
      return <LazyDocxPreviewWrapper data={data} theme={theme} fileName={fileMedia.path} />;
    case 'pdf':
      return <LazyPdfPreviewWrapper data={data} theme={theme} />;
    case 'spreadsheet':
      return <LazyXlsxPreviewWrapper data={data} theme={theme} fileName={fileMedia.path} />;
    case 'presentation':
      return <LazyPptxPreviewWrapper data={data} theme={theme} fileName={fileMedia.path} />;
  }
}

const FilePreviewRenderers = React.memo(function FilePreviewRenderers({
  editorSurfaceRef,
  fileCategory,
  fileContent,
  fileMedia,
  fileMediaLoading,
  filePath,
  workspaceId,
  theme,
}: FilePreviewRenderersProps) {
  const { t } = useTCopy();

  // 大文件确认门：超过分类阈值时先显示友好提示，用户点"仍然打开"才渲染。
  // 确认态模块级 Set 记忆（多文件往返不重复打扰），tick 仅触发重渲染。
  const [, setHeavyConfirmTick] = useState(0);
  const heavyThreshold = HEAVY_PREVIEW_BYTES[fileCategory];
  if (
    fileMedia &&
    heavyThreshold !== undefined &&
    fileMedia.size > heavyThreshold &&
    !isHeavyPreviewConfirmed(workspaceId, fileMedia.path)
  ) {
    return (
      <PreviewSurface editorSurfaceRef={editorSurfaceRef}>
        <HeavyPreviewGate
          name={fileMedia.path}
          sizeText={formatBytes(fileMedia.size)}
          onConfirm={() => {
            confirmHeavyPreview(workspaceId, fileMedia.path);
            setHeavyConfirmTick((tick) => tick + 1);
          }}
        />
      </PreviewSurface>
    );
  }

  // Office 临时锁定文件（~$）：不是文档本身，任何解析库都会报 not-a-zip，
  // 直接给转存指引而不调库（docx/pdf/xlsx/pptx 共用）。
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

  // 媒体加载骨架（Phase 4 审查 F4）：fileMedia 为空时区分"读取中"与"真空"，
  // 前者给骨架占位，后者（失败/未发起）保持 null 由错误视图接管。
  if (!fileMedia && fileMediaLoading && isMediaFileCategory(fileCategory)) {
    return (
      <PreviewSurface editorSurfaceRef={editorSurfaceRef}>
        <div className="adl-unsupported-preview" role="status">
          <span className="adl-unsupported-preview__text">{t.fileMediaLoading as string}</span>
        </div>
      </PreviewSurface>
    );
  }

  if (fileCategory === 'markdown') {
    return (
      // key 挂外层滚动容器（收尾 M4）：切换文件重置滚动与高亮，避免复用残留；
      // '__none__' 避免无路径态空串碰撞。
      <div
        key={filePath ?? '__none__'}
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

  if (
    fileCategory === 'docx' ||
    fileCategory === 'pdf' ||
    fileCategory === 'spreadsheet' ||
    fileCategory === 'presentation'
  ) {
    if (!fileMedia) {
      return null;
    }
    return (
      <PreviewSurface editorSurfaceRef={editorSurfaceRef}>
        <OfficeBranch
          key={fileMedia.path}
          fileMedia={fileMedia}
          kind={fileCategory}
          theme={theme}
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
