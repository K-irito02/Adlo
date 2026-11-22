import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LazyMarkdownPreviewWrapper,
  LazyDocxPreviewWrapper,
  LazyPdfPreviewWrapper,
  LazyMediaPreviewWrapper,
  LazyXlsxPreviewWrapper,
  LazyPptxPreviewWrapper,
  PreviewLoadingGate,
  UnsupportedPreviewCard,
  buildPreviewCacheKey,
} from '@features/preview';
import { openMarkdownFileLink, openUrlByMethod } from '@features/preview/openByMethod';
import { RevealHighlightLayers } from '@components/RevealHighlight';
import { HeavyPreviewGate } from './HeavyPreviewGate';
import { formatBytes } from '@root/design-system/html';
import { type FileCategory, isOfficeTempFile, usesBinaryMediaChannel } from './fileTypeRouter';
import {
  HEAVY_PREVIEW_BYTES,
  confirmHeavyPreview,
  isHeavyPreviewConfirmed,
} from './heavyPreviewLimits';
import type { WorkspaceMediaSource } from '@adlo/kernel';
import { useTCopy } from '@i18n/useTCopy';
import { StickyContext } from './editor-support/stickyContextView';
import type { StickyContextModel } from './editor-support/stickyContext';

interface FilePreviewRenderersProps {
  editorSurfaceRef: React.Ref<HTMLDivElement>;
  fileCategory: FileCategory;
  fileContent: string | null;
  /** 二进制媒体文档（图片/音视频/办公）：image/audio/video/docx/pdf/spreadsheet/presentation 分支使用 */
  fileMedia: WorkspaceMediaSource | null;
  /** 当前文件路径：markdown 预览 key 挂载用（切换文件重置滚动/状态，防串扰） */
  filePath?: string;
  /** 当前文件所属工作区：与 filePath 共同组成重型门确认 key（跨工作区同路径隔离） */
  workspaceId?: string;
  /** 媒体读取中：fileMedia 为空时区分加载骨架与真空（见 editorSlice.fileMediaLoading） */
  fileMediaLoading?: boolean;
  theme: 'dark' | 'light';
  /** 预览面「文件顶部」模型（滚动容器由 hook 在 surface 上捕获） */
  stickyContextModel?: StickyContextModel | null;
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
  editorSurfaceRef: React.Ref<HTMLDivElement>;
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
  stickyContextModel,
  children,
}: {
  editorSurfaceRef: React.Ref<HTMLDivElement>;
  stickyContextModel?: StickyContextModel | null;
  children: React.ReactNode;
}) {
  return (
    <div
      ref={editorSurfaceRef}
      className="adl-tool-editor__surface adl-tool-editor__surface--preview"
    >
      {stickyContextModel ? (
        <StickyContext data-testid="files-preview-sticky-context" model={stickyContextModel} />
      ) : null}
      {children}
    </div>
  );
}

/**
 * 大文件直接渲染阈值见 ./heavyPreviewLimits（媒体/办公分支与文本分支同源）。
 */

type OfficeBytesState =
  { status: 'loading' } | { status: 'ready'; data: ArrayBuffer } | { status: 'error' };

/**
 * 办公分支壳（事项 7）：字节在分支挂载后按需 `fetch` —— 即重型门确认之后，
 * 确认前零请求、零 ArrayBuffer 分配；也不再有 base64 体积上限。
 */
function useOfficeBytes(url: string): OfficeBytesState {
  const [state, setState] = useState<OfficeBytesState>({ status: 'loading' });
  useEffect(() => {
    if (!url) {
      setState({ status: 'error' });
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    setState({ status: 'loading' });
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`office fetch failed: ${response.status}`);
        }
        return response.arrayBuffer();
      })
      .then((buffer) => {
        if (active) {
          setState({ status: 'ready', data: buffer });
        }
      })
      .catch(() => {
        if (active) {
          setState({ status: 'error' });
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [url]);
  return state;
}

type OfficeBranchKind = 'docx' | 'pdf' | 'spreadsheet' | 'presentation';

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
/** OLE/CFB 容器头：BIFF `.xls` 等旧二进制格式（SheetJS 可读，不能当损坏拒掉）。 */
const CFB_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
/** `%PDF-`。PDF 规范允许文件头出现在前 1024 字节内（BOM/前导字节很常见）。 */
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d];
const PDF_HEADER_SEARCH_BYTES = 1024;

/** ZIP 容器签名（OOXML 文档）必须在偏移 0。 */
function hasSignature(bytes: ArrayBuffer, magic: number[]): boolean {
  if (bytes.byteLength < magic.length) {
    return false;
  }
  const head = new Uint8Array(bytes, 0, magic.length);
  return magic.every((value, index) => head[index] === value);
}

/** BIFF `.xls` 是 OLE/CFB 容器（SheetJS 可读）；`.xlsb` 仍是 ZIP/OPC。 */
function hasCfbSignature(bytes: ArrayBuffer): boolean {
  return hasSignature(bytes, CFB_MAGIC);
}

/** PDF 头允许出现在前 1024 字节内（ISO 32000-1 §7.5.2）；不要求偏移 0。 */
function hasPdfHeader(bytes: ArrayBuffer): boolean {
  const limit = Math.min(bytes.byteLength, PDF_HEADER_SEARCH_BYTES);
  if (limit < PDF_MAGIC.length) {
    return false;
  }
  const head = new Uint8Array(bytes, 0, limit);
  for (let offset = 0; offset <= head.length - PDF_MAGIC.length; offset += 1) {
    if (PDF_MAGIC.every((value, index) => head[offset + index] === value)) {
      return true;
    }
  }
  return false;
}

function legacyExt(filePath: string): string {
  const name = filePath.split(/[\\/]/).pop() ?? filePath;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** 四个办公分支的通用壳：取字节（Range URL）+ 签名预检 + 按品类渲染。 */
function OfficeBranch({
  fileMedia,
  kind,
  theme,
  cacheKey,
  gateStartedAt,
  workspaceId,
}: {
  fileMedia: WorkspaceMediaSource;
  kind: OfficeBranchKind;
  theme: 'dark' | 'light';
  cacheKey?: string;
  gateStartedAt?: number | null;
  workspaceId?: string;
}) {
  const { t, formatT } = useTCopy();
  // Hook 必须在分支前无条件调用（hooks 顺序稳定）：旧版占位 url 为空时，
  // 该 hook 内部直接落 error 态，下面的 legacy 分支不会再使用它。
  const bytes = useOfficeBytes(fileMedia.url);
  // 旧版 OLE（.doc/.dot/.ppt）在 store 里已短路成 url='' 的占位：给转存指引，
  // 不再走"取字节失败"（那是上一版的回归）。
  if (!fileMedia.url) {
    const suggest = kind === 'presentation' ? '.pptx' : '.docx';
    return (
      <UnsupportedPreviewCard
        title={formatT(t, 'officeLegacyFormat', { suggest })}
        filePath={fileMedia.path}
        workspaceId={workspaceId}
      />
    );
  }

  if (bytes.status === 'loading') {
    return <PreviewLoadingGate active variant="plain" minVisibleMs={0} startedAt={gateStartedAt} />;
  }
  if (bytes.status === 'error') {
    return (
      <UnsupportedPreviewCard
        title={t.officeDecodeFailed as string}
        filePath={fileMedia.path}
        workspaceId={workspaceId}
        alert
      />
    );
  }

  const failWith = (title: string) => (
    <UnsupportedPreviewCard
      title={title}
      filePath={fileMedia.path}
      workspaceId={workspaceId}
      alert
    />
  );

  // ODP 是 ODF zip：pptx 解析库读不了，明确告知而不是留空白。
  if (kind === 'presentation' && legacyExt(fileMedia.path) === 'odp') {
    return failWith(t.changesPreviewNotSupported as string);
  }

  const data = bytes.data;
  if (kind === 'pdf') {
    if (!hasPdfHeader(data)) {
      return failWith(t.officeDecodeFailed as string);
    }
    return (
      <LazyPdfPreviewWrapper
        data={data}
        theme={theme}
        cacheKey={cacheKey}
        gateStartedAt={gateStartedAt}
      />
    );
  }
  // OOXML（docx/xlsx/pptx）都是 zip 容器；签名不符即内容损坏。
  // 例外：BIFF `.xls` 是 OLE/CFB 容器，SheetJS 可读（fileTypeRouter 有意不拦截）。
  const containerOk =
    hasSignature(data, ZIP_MAGIC) || (kind === 'spreadsheet' && hasCfbSignature(data));
  if (!containerOk) {
    const unreadable =
      kind === 'docx'
        ? t.docxUnreadable
        : kind === 'spreadsheet'
          ? t.spreadsheetUnreadable
          : t.presentationUnreadable;
    return failWith(unreadable as string);
  }
  switch (kind) {
    case 'docx':
      return (
        <LazyDocxPreviewWrapper
          data={data}
          theme={theme}
          fileName={fileMedia.path}
          cacheKey={cacheKey}
          gateStartedAt={gateStartedAt}
        />
      );
    case 'spreadsheet':
      return (
        <LazyXlsxPreviewWrapper
          data={data}
          theme={theme}
          fileName={fileMedia.path}
          cacheKey={cacheKey}
          gateStartedAt={gateStartedAt}
        />
      );
    case 'presentation':
      // pptx 无渲染结果缓存（库内嵌媒体用 object URL）；仍走延迟+最短扫光。
      return (
        <LazyPptxPreviewWrapper
          data={data}
          theme={theme}
          fileName={fileMedia.path}
          gateStartedAt={gateStartedAt}
        />
      );
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
  stickyContextModel,
}: FilePreviewRenderersProps) {
  const { t } = useTCopy();

  // 加载宽限：读取阶段与 chunk/渲染阶段共享同一个 150ms 宽限窗口，
  // 避免“读取扫光 → 空白 → 渲染扫光”的二次闪烁。
  const openStartedAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (fileMediaLoading) {
      openStartedAtRef.current = Date.now();
    }
  }, [fileMediaLoading, filePath, workspaceId]);
  const gateStartedAt = openStartedAtRef.current;

  // 预览结果缓存键（工作区+路径+体积+mtime）：同键回看复用上次渲染/解析结果。
  const previewCacheKey = fileMedia
    ? buildPreviewCacheKey(workspaceId, {
        path: fileMedia.path,
        size: fileMedia.size,
        lastModifiedAt: fileMedia.lastModifiedAt,
      })
    : undefined;

  // Markdown 正文链接点击：http(s) 走「网址打开方式」，文件链接统一走
  // openMarkdownFileLink（按文件所属工作区解析；目录形链接在文件树定位）。
  const markdownLinkHandlers = useMemo(
    () => ({
      onOpenUrl: openUrlByMethod,
      onOpenFile: (href: string) => {
        openMarkdownFileLink(workspaceId, filePath, href);
      },
    }),
    [filePath, workspaceId],
  );

  // 大文件确认门：超过分类阈值时先显示友好提示，用户点"仍然打开"才渲染。
  // 确认态模块级 Set 记忆（多文件往返不重复打扰），tick 仅触发重渲染。
  const [, setHeavyConfirmTick] = useState(0);
  const heavyThreshold = fileCategory === 'binary' ? undefined : HEAVY_PREVIEW_BYTES[fileCategory];
  if (
    fileMedia &&
    heavyThreshold !== undefined &&
    fileMedia.size > heavyThreshold &&
    !isHeavyPreviewConfirmed(workspaceId, fileMedia.path)
  ) {
    return (
      <PreviewSurface editorSurfaceRef={editorSurfaceRef} stickyContextModel={stickyContextModel}>
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
      <UnsupportedPreviewCard
        title={t.officeTempFileTitle as string}
        hint={t.officeTempFileHint as string}
      />
    );
  }

  // 媒体加载骨架（Phase 4 审查 F4）：fileMedia 为空时区分"读取中"与"真空"，
  // 前者给扫光占位（不再显示“加载中…”文字），后者（失败/未发起）保持 null 由错误视图接管。
  if (!fileMedia && fileMediaLoading && usesBinaryMediaChannel(fileCategory)) {
    return (
      <PreviewSurface editorSurfaceRef={editorSurfaceRef} stickyContextModel={stickyContextModel}>
        {/* 读取阶段的分支会随 fileMedia 到达被整体替换，组件内的最短展示时长无法兑现；
            这里只做 150ms 延迟（秒开不闪），最短时长由常驻的 office 预览占位负责。 */}
        <PreviewLoadingGate active variant="plain" minVisibleMs={0} />
      </PreviewSurface>
    );
  }

  if (fileCategory === 'markdown') {
    return (
      // key 挂外层滚动容器（收尾 M4）：切换文件重置滚动与高亮，避免复用残留；
      // '__none__' 避免无路径态空串碰撞。
      <PreviewSurface
        key={filePath ?? '__none__'}
        editorSurfaceRef={editorSurfaceRef}
        stickyContextModel={stickyContextModel}
      >
        <LazyMarkdownPreviewWrapper
          content={fileContent ?? ''}
          linkHandlers={markdownLinkHandlers}
        />
        {/* 检索跳转落点高亮：视口夹层裁剪溢出，高亮条铺满预览面并与左右边缘贴合 */}
        <RevealHighlightLayers />
      </PreviewSurface>
    );
  }

  if (fileCategory === 'image' || fileCategory === 'audio' || fileCategory === 'video') {
    if (!fileMedia) {
      return null;
    }
    return (
      <PreviewSurface editorSurfaceRef={editorSurfaceRef} stickyContextModel={stickyContextModel}>
        {/* key 绑定路径：切换文件即全新挂载，杜绝错误态/旧容器残留串扰 */}
        <LazyMediaPreviewWrapper
          key={fileMedia.path}
          media={fileMedia}
          kind={fileCategory}
          workspaceId={workspaceId}
        />
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
      <PreviewSurface editorSurfaceRef={editorSurfaceRef} stickyContextModel={stickyContextModel}>
        <OfficeBranch
          key={fileMedia.url}
          fileMedia={fileMedia}
          kind={fileCategory}
          theme={theme}
          cacheKey={previewCacheKey}
          gateStartedAt={gateStartedAt}
          workspaceId={workspaceId}
        />
      </PreviewSurface>
    );
  }

  if (fileCategory === 'binary') {
    return (
      <UnsupportedPreviewCard
        title={t.changesPreviewNotSupported as string}
        hint={t.changesPreviewBinary as string}
        filePath={filePath}
        workspaceId={workspaceId}
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
