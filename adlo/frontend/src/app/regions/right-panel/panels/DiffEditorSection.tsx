import React, { lazy, Suspense, useCallback, useMemo, useRef, useState } from 'react';
import type { ChangesPanelProps } from '../types';
import type { DiffEditorRef, EditorRef } from '@stores/types';

import { detectEditorLanguage } from '@utils/workspacePaths';
import { categorizeFile, usesBinaryMediaChannel } from '../fileTypeRouter';
import {
  classifyDiffTier,
  confirmHeavyPreview,
  getHeavyPreviewPanes,
  heavyChangePreviewLength,
  isHeavyPreviewConfirmed,
} from '../heavyPreviewLimits';
import { profileDiffCost } from '../diffCost';
import { HeavyPreviewGate } from '../HeavyPreviewGate';
import { formatBytes } from '@root/design-system/html';
import { computePreviewDiffVisualRanges } from '@features/diff-viewer';
import type { PreviewDiffCollapsedRange } from '@features/diff-viewer';
import { LazyMarkdownPreviewWrapper } from '@features/preview';
import { resolvePreviewOwner } from '@features/preview/previewExternal';
import { FilePreviewRenderers } from '../FilePreviewRenderers';
import { openMarkdownFileLink, openUrlByMethod } from '@features/preview/openByMethod';
import { StickyContext } from '../editor-support/stickyContextView';
import { usePreviewStickyContext, useStickyContext } from '../hooks';
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
  | 'changePreviewMedia'
  | 'changePreviewMediaLoading'
  | 'changePreviewMediaError'
  | 'diffSideBySide'
  | 'latestPatchApplication'
  | 'appInfo'
  | 'onDiffMount'
  | 'onOpenChangePreview'
  | 'selectedChangePreviewPath'
  | 'selectedChangePreviewWorkspaceId'
> {
  previewEnabled: boolean;
  lineNumbersEnabled: boolean;
  wordWrapEnabled: boolean;
  previewContainerRef?: React.RefObject<HTMLDivElement | null>;
}

const DiffEditorSection = React.memo(function DiffEditorSection({
  changePreview,
  changePreviewLoading,
  changePreviewMedia,
  changePreviewMediaLoading,
  changePreviewMediaError,
  diffSideBySide,
  latestPatchApplication,
  appInfo,
  previewEnabled,
  lineNumbersEnabled,
  wordWrapEnabled,
  onDiffMount,
  onOpenChangePreview,
  selectedChangePreviewPath,
  selectedChangePreviewWorkspaceId,
  previewContainerRef,
}: DiffEditorSectionProps) {
  const { t } = useTCopy();
  const localPreviewShellRef = useRef<HTMLDivElement | null>(null);
  const markdownSurfaceRef = useRef<HTMLDivElement | null>(null);
  const localEditorRef = useRef<DiffEditorRef | EditorRef | null>(null);
  const [editorMountVersion, setEditorMountVersion] = useState(0);
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
  // 大变更确认（收尾 R34-H2）：确认态跨面板共享；触发条件见 costTier（字符数或行数）。
  const [, setChangeConfirmTick] = useState(0);

  const validation = latestPatchApplication?.validation;
  const changePreviewContent = changePreview?.currentContent ?? '';

  // 事项1：代价画像与分档先于任何差分/大纲计算（旧实现重型门排在计算之后，
  // 门只挡住渲染、没挡住主线程成本）。
  const costProfile = useMemo(
    () =>
      changePreview
        ? profileDiffCost(changePreview.baseContent, changePreview.currentContent)
        : null,
    [changePreview],
  );
  const costTier = costProfile ? classifyDiffTier(costProfile) : 'light';

  const changePreviewLanguage = useMemo(() => {
    return detectEditorLanguage(changePreview?.path);
  }, [changePreview?.path]);

  const changePreviewTheme = useResolvedTheme();
  const changePreviewLocale = resolveAppLanguage(appInfo?.config.language);

  const changePreviewDiffRanges = useMemo(() => {
    if (!changePreview || costTier === 'heavy') {
      return [];
    }
    return computePreviewDiffVisualRanges(changePreview.baseContent, changePreview.currentContent);
  }, [changePreview, costTier]);

  const outline = useMemo(() => {
    if (!changePreview || costTier === 'heavy') {
      return [];
    }
    return outlineForChangePreview(changePreview, false);
  }, [changePreview, costTier]);

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
      setEditorMountVersion((version) => version + 1);
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
      editorMountVersion,
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
      editorMountVersion,
    ],
  );

  const stickyContextModel = useStickyContext(stickyContextInput);
  const markdownStickyModel = usePreviewStickyContext(
    markdownSurfaceRef,
    `${selectedChangePreviewWorkspaceId ?? ''}:${changePreview?.path ?? ''}:${
      previewEnabled ? 'preview' : 'edit'
    }`,
  );
  const diffExtensions = useMemo(() => [], []);

  // 变更面板 markdown 预览的链接点击：与文件面板同源（changePreview.path 为其
  // 所属工作区相对路径，用变更预览自身的工作区而非当前工作区，见事项 6）。
  // 工作区取 props（调用方已订阅），不 direct getState，保证 memo 依赖完备。
  const markdownLinkHandlers = useMemo(
    () => ({
      onOpenUrl: openUrlByMethod,
      onOpenFile: (href: string) => {
        openMarkdownFileLink(selectedChangePreviewWorkspaceId, changePreview?.path, href);
      },
    }),
    [changePreview?.path, selectedChangePreviewWorkspaceId],
  );

  // 内容区无预览时直接留空（事项1）：不渲染"当前没有检测到文件变更"等空态文字。
  // 加载期给骨架反馈而非纯空白（事项4 感知优化）。
  // 事项4：媒体/办公变更没有 changePreview（来源走 changePreviewMedia），
  // 只有文本变更才要求 changePreview 存在。
  const previewPath = changePreview?.path ?? selectedChangePreviewPath;
  const previewCategory = previewPath ? categorizeFile(previewPath) : undefined;
  const isMediaPreview = previewCategory ? usesBinaryMediaChannel(previewCategory) : false;
  if (!changePreview && !isMediaPreview) {
    if (changePreviewLoading || changePreviewMediaLoading) {
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

  // 事项4：媒体/办公变更复用文件面板的渲染器（同一重型门、错误态、Office/媒体
  // 预览器），不做逐行对比；文本变更仍走下面的 diff 分支。
  const changePreviewCategory = previewCategory ?? 'text';
  if (isMediaPreview && previewPath) {
    const mediaFailed =
      !changePreviewMedia &&
      !changePreviewMediaLoading &&
      changePreviewMediaError?.path === previewPath;
    return (
      <>
        {validationBanner}
        <div
          ref={setPreviewShellRef}
          className="adl-tool-editor adl-tool-editor--changes"
          data-testid="changes-preview-shell"
        >
          {mediaFailed ? (
            <div className="adl-tool-editor__surface adl-tool-editor__surface--preview">
              <div className="adl-unsupported-preview" role="alert">
                <span className="adl-unsupported-preview__text">
                  {t.changesPreviewMediaFailed as string}
                </span>
                <span className="adl-unsupported-preview__hint" title={previewPath}>
                  {changePreviewMediaError?.message ?? previewPath}
                </span>
                <button
                  type="button"
                  className="adl-unsupported-preview__action"
                  onClick={() => {
                    // 重试必须落在预览所属工作区：当前工作区入口会读错目录。
                    const state = useAppStore.getState();
                    const owner = resolvePreviewOwner(selectedChangePreviewWorkspaceId);
                    if (owner) {
                      void state.openChangePreviewForWorkspace(owner.root, previewPath);
                      return;
                    }
                    // 无 workspaceId（mock/未归属）才回退当前工作区入口。
                    if (selectedChangePreviewWorkspaceId === undefined) {
                      onOpenChangePreview(previewPath);
                    }
                  }}
                >
                  {t.fileOpenErrorRetry as string}
                </button>
              </div>
            </div>
          ) : (
            <FilePreviewRenderers
              editorSurfaceRef={localPreviewShellRef}
              fileCategory={changePreviewCategory}
              fileContent={null}
              fileMedia={changePreviewMedia ?? null}
              fileMediaLoading={changePreviewMediaLoading}
              filePath={previewPath}
              workspaceId={selectedChangePreviewWorkspaceId}
              theme={changePreviewTheme}
            />
          )}
        </div>
      </>
    );
  }

  if (!changePreview) {
    return null;
  }

  // 大变更确认门（收尾 R34-H2）：markdown 预览 whole-document 解析与 DiffViewer
  // 全量 diff 计算同样怕巨型内容；重型判定见 costTier（字符数或行数）。
  // 事项3：体积取 base/current 较大者——删除型 current 为空，只看 current 会放行
  // 巨型 base 直渲染（白屏/卡顿源头）；确认后渲染，不强制限制（用户仍可"仍然打开"）。
  const heavyContentLength = heavyChangePreviewLength(
    changePreview.baseContent,
    changePreview.currentContent,
  );
  const isHeavyPreview = costTier === 'heavy';
  if (
    (changePreviewCategory === 'markdown' ||
      changePreviewCategory === 'code' ||
      changePreviewCategory === 'text') &&
    isHeavyPreview &&
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
              titleKey="heavyPreviewTitleDiff"
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
    isHeavyPreview &&
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
          <div
            ref={markdownSurfaceRef}
            className="adl-tool-editor__surface adl-tool-editor__surface--preview"
          >
            {markdownStickyModel ? (
              <StickyContext
                data-testid="changes-preview-sticky-context"
                model={markdownStickyModel}
              />
            ) : null}
            <LazyMarkdownPreviewWrapper
              content={changePreview.currentContent}
              linkHandlers={markdownLinkHandlers}
            />
            {/* 不渲染落点高亮覆盖层：变更面板无检索模式，大纲导航按设计只定位不闪烁 */}
          </div>
        ) : previewEnabled ? (
          <div className="adl-tool-editor__surface">
            {stickyContextModel ? (
              <StickyContext
                data-testid="changes-preview-sticky-context"
                model={stickyContextModel}
              />
            ) : null}
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
