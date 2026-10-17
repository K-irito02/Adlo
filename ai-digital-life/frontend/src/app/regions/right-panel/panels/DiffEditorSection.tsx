import React, { lazy, Suspense, useCallback, useMemo, useRef, useState } from 'react';
import type { ChangesPanelProps } from '../types';
import type { DiffEditorRef, EditorRef } from '@stores/types';

import { detectEditorLanguage } from '@utils/workspacePaths';
import { categorizeFile, isMediaFileCategory } from '../fileTypeRouter';
import {
  TEXT_HEAVY_PREVIEW_CHARS,
  confirmHeavyPreview,
  getHeavyPreviewPanes,
  heavyChangePreviewLength,
  isHeavyDiffContent,
  isHeavyPreviewConfirmed,
} from '../heavyPreviewLimits';
import { HeavyPreviewGate } from '../HeavyPreviewGate';
import { formatBytes } from '@root/design-system/html';
import { computePreviewDiffVisualRanges } from '@features/diff-viewer';
import type { PreviewDiffCollapsedRange } from '@features/diff-viewer';
import { LazyMarkdownPreviewWrapper } from '@features/preview';
import { StickyContext } from '../editor-support/stickyContextView';
import { useStickyContext } from '../hooks';
import { outlineForChangePreview } from '@features/outline';
import { ChunkLoadingFallback } from '@components/LazyComponents';
import { useAppStore } from '@stores/slicedStore';
import { useTCopy } from '@i18n/useTCopy';
import { resolveAppLanguage } from '@i18n/resolveLanguage';
import { useResolvedTheme } from '@hooks/useResolvedTheme';

const CodeEditor = lazy(() =>
  import('../../../features/editor').then((m) => ({ default: m.CodeEditor })),
);
const DiffViewer = lazy(() =>
  import('../../../features/diff-viewer').then((m) => ({ default: m.DiffViewer })),
);

interface DiffEditorSectionProps extends Pick<
  ChangesPanelProps,
  | 'changePreview'
  | 'changePreviewLoading'
  | 'diffSideBySide'
  | 'latestPatchApplication'
  | 'appInfo'
  | 'onDiffMount'
  | 'onOpenFile'
  | 'selectedChangePreviewWorkspaceId'
> {
  totalChangeCount: number;
  visibleWorkspacesLength: number;
  previewEnabled: boolean;
  lineNumbersEnabled: boolean;
  wordWrapEnabled: boolean;
  previewContainerRef?: React.RefObject<HTMLDivElement | null>;
}

const DiffEditorSection = React.memo(function DiffEditorSection({
  changePreview,
  changePreviewLoading,
  diffSideBySide,
  latestPatchApplication,
  appInfo,
  previewEnabled,
  lineNumbersEnabled,
  wordWrapEnabled,
  onDiffMount,
  onOpenFile,
  selectedChangePreviewWorkspaceId,
  previewContainerRef,
}: DiffEditorSectionProps) {
  const { t } = useTCopy();
  const localPreviewShellRef = useRef<HTMLDivElement | null>(null);
  const localEditorRef = useRef<DiffEditorRef | EditorRef | null>(null);
  const setPreviewShellRef = useCallback(
    (el: HTMLDivElement | null) => {
      localPreviewShellRef.current = el;
      if (previewContainerRef) {
        (previewContainerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      }
    },
    [previewContainerRef],
  );
  const [_collapsedUnchangedDiffRanges, setCollapsedUnchangedDiffRanges] = useState<
    PreviewDiffCollapsedRange[]
  >([]);
  // 大变更确认（收尾 R34-H2）：与 Files 面板文本门同阈值同文案，确认态跨面板共享。
  const [, setChangeConfirmTick] = useState(0);

  const validation = latestPatchApplication?.validation;
  const changePreviewContent = changePreview?.currentContent ?? '';

  const changePreviewLanguage = useMemo(() => {
    return detectEditorLanguage(changePreview?.path);
  }, [changePreview?.path]);

  const changePreviewTheme = useResolvedTheme();
  const changePreviewLocale = resolveAppLanguage(appInfo?.config.language);

  const changePreviewDiffRanges = useMemo(
    () =>
      changePreview
        ? computePreviewDiffVisualRanges(changePreview.baseContent, changePreview.currentContent)
        : [],
    [changePreview],
  );

  const outline = useMemo(
    () =>
      // 大纲去重（事项4）：与导航大纲同输入，WeakMap 共享一次 walk。
      changePreview
        ? outlineForChangePreview(
            changePreview,
            isHeavyDiffContent(changePreview.baseContent, changePreview.currentContent),
          )
        : [],
    [changePreview],
  );

  const getStickySourceEditor = useCallback(() => {
    const ref = localEditorRef.current;
    if (!ref) {
      return null;
    }
    if ('getModifiedEditor' in ref) {
      return (ref as DiffEditorRef).getModifiedEditor();
    }
    return ref as EditorRef;
  }, []);

  const handleEditorMount = useCallback(
    (editor: DiffEditorRef | EditorRef) => {
      localEditorRef.current = editor;
      onDiffMount(editor);
    },
    [onDiffMount],
  );

  const stickyContextInput = useMemo(
    () => ({
      selectedFilePath: changePreview?.path,
      content: changePreviewContent,
      outline,
      wordWrapEnabled,
      diffSideBySide,
      editorSurfaceRef: localPreviewShellRef,
      stickyDiffRanges: changePreviewDiffRanges,
      getStickySourceEditor,
    }),
    [
      changePreview?.path,
      changePreviewContent,
      outline,
      wordWrapEnabled,
      diffSideBySide,
      localPreviewShellRef,
      changePreviewDiffRanges,
      getStickySourceEditor,
    ],
  );

  const stickyContextModel = useStickyContext(stickyContextInput);
  const diffExtensions = useMemo(() => [], []);

  // 内容区无预览时直接留空（事项1）：不渲染"当前没有检测到文件变更"等空态文字。
  // 加载期给骨架反馈而非纯空白（事项4 感知优化）。
  if (!changePreview) {
    if (changePreviewLoading) {
      return <ChunkLoadingFallback />;
    }
    return null;
  }

  // 校验横幅（rev2 复审 N3）：媒体占位 early return 会跳过它，
  // 抽为变量使占位路径同样展示 applied/rolledBack 状态。
  // status 为固定枚举走 i18n 映射（收尾 M7），summary 为自由诊断文本保持原文。
  const validationStatusText =
    validation?.status === 'passed'
      ? (t.changesValidationPassed as string)
      : validation?.status === 'failed'
        ? (t.changesValidationFailed as string)
        : validation?.status === 'skipped'
          ? (t.changesValidationSkipped as string)
          : '';
  const validationBanner = validation ? (
    <div className="adl-banner adl-banner--info">
      <strong>{validationStatusText}</strong>
      <span>{validation.summary}</span>
      {latestPatchApplication?.rolledBack ? (
        <span className="adl-chip adl-chip--warning">{t.changesRolledBack}</span>
      ) : null}
      {latestPatchApplication?.patchSet.status === 'applied' ? (
        <span className="adl-chip adl-chip--success">{t.changesApplied}</span>
      ) : null}
    </div>
  ) : null;

  // 媒体、办公与二进制文件不在变更面板做逐行对比：居中友好占位 + 前往文件面板预览。
  // 与文件面板共用 .adl-unsupported-preview 视觉（已居中）。
  // binary 一并占位：二进制变更预览本就失败闭合（changePreview 为空），
  // 避免落入 DiffViewer 面对空内容（Phase 4 审查 F6）。
  const changePreviewCategory = categorizeFile(changePreview.path);
  if (isMediaFileCategory(changePreviewCategory) || changePreviewCategory === 'binary') {
    const previewPath = changePreview.path;
    const isBinary = changePreviewCategory === 'binary';
    return (
      <>
        {validationBanner}
        <div
          ref={setPreviewShellRef}
          className="adl-tool-editor adl-tool-editor--changes"
          data-testid="changes-preview-shell"
        >
          <div className="adl-tool-editor__surface adl-tool-editor__surface--preview">
            <div className="adl-unsupported-preview" role="status">
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
              <span className="adl-unsupported-preview__text">
                {isBinary
                  ? (t.changesPreviewBinary as string)
                  : (t.changesPreviewMediaInChanges as string)}
              </span>
              <span className="adl-unsupported-preview__hint" title={previewPath}>
                {previewPath}
              </span>
              <button
                type="button"
                className="adl-unsupported-preview__action"
                onClick={() => {
                  onOpenFile(previewPath);
                  // 切到文件面板（收尾 M6）：光打开 store 不切面板，用户视觉无变化即断头。
                  useAppStore.getState().setActiveRightTool('files');
                }}
              >
                {t.changesPreviewOpenInFiles as string}
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // 大变更确认门（收尾 R34-H2）：markdown 预览 whole-document 解析与 DiffViewer
  // 全量 diff 计算同样怕巨型内容，与 Files 文本门同阈值（字符数近似即可）。
  // 事项3：体积取 base/current 较大者——删除型 current 为空，只看 current 会放行
  // 巨型 base 直渲染（白屏/卡顿源头）；确认后渲染，不强制限制（用户仍可"仍然打开"）。
  const heavyContentLength = heavyChangePreviewLength(
    changePreview.baseContent,
    changePreview.currentContent,
  );
  if (
    (changePreviewCategory === 'markdown' ||
      changePreviewCategory === 'code' ||
      changePreviewCategory === 'text') &&
    heavyContentLength > TEXT_HEAVY_PREVIEW_CHARS &&
    !isHeavyPreviewConfirmed(selectedChangePreviewWorkspaceId, changePreview.path)
  ) {
    return (
      <>
        {validationBanner}
        <div
          ref={setPreviewShellRef}
          className="adl-tool-editor adl-tool-editor--changes"
          data-testid="changes-preview-shell"
        >
          <div className="adl-tool-editor__surface adl-tool-editor__surface--preview">
            <HeavyPreviewGate
              name={changePreview.path}
              sizeText={formatBytes(heavyContentLength)}
              hintKey="heavyPreviewHintDiff"
              onConfirm={() => {
                confirmHeavyPreview(selectedChangePreviewWorkspaceId, changePreview.path);
                setChangeConfirmTick((tick) => tick + 1);
              }}
            />
          </div>
        </div>
      </>
    );
  }

  // 方案A-2（白屏根治）：重型确认后不走 MergeView。日志实证 new EditorView 即占
  // 1.3~1.5s（11.5k 行非虚拟化 widget DOM）；plain CodeEditor 只挂可视行。
  // 删除型展 base、新增型展 current、双侧重型双 pane 独立滚动；增删语义由门文案承担。
  const heavyConfirmed =
    (changePreviewCategory === 'markdown' ||
      changePreviewCategory === 'code' ||
      changePreviewCategory === 'text') &&
    heavyContentLength > TEXT_HEAVY_PREVIEW_CHARS &&
    isHeavyPreviewConfirmed(selectedChangePreviewWorkspaceId, changePreview.path);
  const heavyPanes = heavyConfirmed
    ? getHeavyPreviewPanes(changePreview.baseContent, changePreview.currentContent)
    : [];
  if (heavyConfirmed && heavyPanes.length > 0) {
    return (
      <>
        {validationBanner}
        <div
          ref={setPreviewShellRef}
          className="adl-tool-editor adl-tool-editor--changes"
          data-testid="changes-preview-shell"
        >
          <div
            className="adl-tool-editor__surface"
            style={
              heavyPanes.length > 1
                ? { display: 'flex', flexDirection: 'row', height: '100%' }
                : undefined
            }
          >
            {heavyPanes.map((pane) => (
              <div
                key={pane}
                style={
                  heavyPanes.length > 1
                    ? { flex: '1 1 0', minWidth: 0, height: '100%' }
                    : { height: '100%' }
                }
              >
                <Suspense fallback={<ChunkLoadingFallback />}>
                  <CodeEditor
                    value={
                      pane === 'base' ? changePreview.baseContent : changePreview.currentContent
                    }
                    language="plaintext"
                    theme={changePreviewTheme}
                    readOnly={true}
                    lineNumbers={lineNumbersEnabled}
                    wordWrap={wordWrapEnabled}
                    onMount={handleEditorMount}
                    fileKey={`${changePreview.path}#${pane}`}
                  />
                </Suspense>
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {validationBanner}
      <div
        ref={setPreviewShellRef}
        className="adl-tool-editor adl-tool-editor--changes"
        data-testid="changes-preview-shell"
      >
        {changePreviewCategory === 'markdown' && previewEnabled ? (
          <div className="adl-tool-editor__surface adl-tool-editor__surface--preview">
            <LazyMarkdownPreviewWrapper
              content={changePreview.currentContent}
              theme={changePreviewTheme}
            />
            {/* 不渲染落点高亮覆盖层：变更面板无检索模式，大纲导航按设计只定位不闪烁 */}
          </div>
        ) : previewEnabled ? (
          <div className="adl-tool-editor__surface">
            <Suspense fallback={<ChunkLoadingFallback />}>
              <CodeEditor
                value={changePreview.currentContent}
                language={changePreviewLanguage}
                theme={changePreviewTheme}
                readOnly={true}
                lineNumbers={lineNumbersEnabled}
                wordWrap={wordWrapEnabled}
                onMount={handleEditorMount}
              />
            </Suspense>
          </div>
        ) : (
          <div className="adl-tool-editor__surface">
            {stickyContextModel ? (
              <StickyContext data-testid="changes-sticky-context" model={stickyContextModel} />
            ) : null}
            <Suspense fallback={<ChunkLoadingFallback />}>
              <DiffViewer
                original={changePreview.baseContent}
                modified={changePreview.currentContent}
                language={changePreviewLanguage}
                theme={changePreviewTheme}
                locale={changePreviewLocale}
                sideBySide={diffSideBySide}
                collapseUnchanged={true}
                readOnly={true}
                lineNumbers={lineNumbersEnabled}
                wordWrap={wordWrapEnabled}
                fileKey={changePreview.path}
                onMount={handleEditorMount}
                extensions={diffExtensions}
                onCollapsedUnchangedRangesChange={setCollapsedUnchangedDiffRanges}
              />
            </Suspense>
          </div>
        )}
      </div>
    </>
  );
});

export { DiffEditorSection };
