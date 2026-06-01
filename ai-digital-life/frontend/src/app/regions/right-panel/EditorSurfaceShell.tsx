import React, { useCallback, useMemo, useRef } from "react";
import { EditorView } from "@codemirror/view";
import { CodeEditor, saveEditorState } from "../../features/editor";
import { DiffViewer } from "../../features/diff-viewer";
import {
  getAgentDecorationExtensions,
  type AgentHunkDecoration,
} from "./editor-support/agentDecorations";
import { categorizeFile, type FileCategory } from "./fileTypeRouter";
import { LazyMarkdownPreviewWrapper } from "../../features/preview";
import type { EditorRef, DiffEditorRef } from "../../stores/types";
import { useUiStore } from "../../stores/ui-store";
import { StickyContext } from "./editor-support/stickyContextView";
import { DiffToolbar } from "./DiffToolbar";
import {
  derivePatchHunkChangeKind,
  getPatchHunkTargetLine,
  summarizePatchFile,
  type PatchHunkSummary,
} from "../../features/patch-review";
import {
  useStickyContext,
  useWrapColumn,
  useAgentDecorations,
  useEditorStateCache,
} from "./hooks";
import type { UseEditorOptionsResult } from "./hooks";
import type { PreviewDiffVisualRange } from "../../features/diff-viewer";
import {
  IconChevronDown,
  IconChevronRight,
} from "../../icons";
import type { RightPanelViewProps } from "./types";

interface EditorSurfaceShellProps extends Pick<RightPanelViewProps,
  | "selectedFilePath"
  | "fileContent"
  | "filePatch"
  | "editorLanguage"
  | "diagnostics"
  | "editorHint"
  | "outline"
  | "activePatchSet"
  | "selectedPatchFilePath"
  | "selectedPatchHunkId"
  | "collapsedPatchHunkIds"
  | "onEditorChange"
  | "onEditorMount"
  | "onDiffMount"
  | "onSetDiffLayout"
  | "onJumpPatchHunk"
  | "onSelectPatchHunk"
  | "onTogglePatchHunkCollapse"
  | "onSetAllPatchHunksCollapsed"
  | "onOpenFileAtLine"
  | "t"
> {
  resolvedTheme: "dark" | "light";
  resolvedLocale: string;
  diffSideBySide: boolean;
  getStickySourceEditor: () => EditorRef | null;
  cmViewRef: React.MutableRefObject<EditorView | null>;
  localDiffEditorRef: React.MutableRefObject<DiffEditorRef | EditorRef | null>;
  editorSurfaceRef: React.RefObject<HTMLDivElement | null>;
  standardEditorRef: React.MutableRefObject<EditorRef | null>;
  editorOptions: UseEditorOptionsResult;
}

function buildStickyDiffRangesFromHunks(
  hunks: NonNullable<ReturnType<typeof summarizePatchFile>>["hunks"]
): PreviewDiffVisualRange[] {
  return hunks.flatMap((hunk) => {
    const anchorLine = Math.max(1, hunk.newStart || hunk.oldStart || 1);
    const lineSpan = Math.max(1, hunk.newLines || hunk.oldLines || 1);
    if (hunk.changeKind === "added") {
      return [{
        startLine: anchorLine,
        endLine: anchorLine + lineSpan - 1,
        type: "insert" as const,
        tone: "strong" as const,
        contentColumns: 1
      }];
    }
    if (hunk.changeKind === "deleted") {
      return [{
        startLine: anchorLine,
        endLine: anchorLine,
        type: "delete" as const,
        tone: "base" as const,
        contentColumns: 1
      }];
    }
    return [
      {
        startLine: anchorLine,
        endLine: anchorLine + lineSpan - 1,
        type: "insert" as const,
        tone: "strong" as const,
        contentColumns: 1
      },
      {
        startLine: anchorLine,
        endLine: anchorLine + lineSpan - 1,
        type: "delete" as const,
        tone: "base" as const,
        contentColumns: 1
      }
    ];
  });
}

function EditorSurfaceShell(props: EditorSurfaceShellProps) {
  const {
    selectedFilePath,
    fileContent,
    filePatch,
    editorLanguage,
    editorHint,
    outline,
    resolvedTheme,
    resolvedLocale,
    diffSideBySide,
    getStickySourceEditor,
    cmViewRef,
    localDiffEditorRef,
    editorSurfaceRef,
    standardEditorRef,
    editorOptions,
    t,
  } = props;

  const filePreviewModeByPath = useUiStore((s) => s.filePreviewModeByPath);
  const setFilePreviewModeForPath = useUiStore((s) => s.setFilePreviewModeForPath);

  const fileCategory = useMemo(() => categorizeFile(selectedFilePath), [selectedFilePath]);

  const previewEnabled = selectedFilePath
    ? (filePreviewModeByPath[selectedFilePath] ?? (fileCategory === "markdown"))
    : false;

  const setPreviewEnabled = useCallback(
    (enabled: boolean) => {
      if (!selectedFilePath) return;
      setFilePreviewModeForPath(selectedFilePath, enabled);
    },
    [selectedFilePath, setFilePreviewModeForPath],
  );

  const hasActivePatch = !!(filePatch && filePatch.relativePath === selectedFilePath);

  const activeFilePatch = useMemo(() => {
    if (!props.activePatchSet || !props.selectedPatchFilePath) return undefined;
    return props.activePatchSet.filePatches.find(
      (c) => c.relativePath === props.selectedPatchFilePath,
    );
  }, [props.activePatchSet, props.selectedPatchFilePath]);

  const activeFilePatchSummary = useMemo(
    () => (activeFilePatch ? summarizePatchFile(activeFilePatch, props.collapsedPatchHunkIds) : undefined),
    [activeFilePatch, props.collapsedPatchHunkIds],
  );

  const stickyDiffRanges = useMemo(
    () => (activeFilePatchSummary ? buildStickyDiffRangesFromHunks(activeFilePatchSummary.hunks) : undefined),
    [activeFilePatchSummary],
  );

  const agentHunkDecorations = useMemo<AgentHunkDecoration[]>(() => {
    if (!activeFilePatch || !selectedFilePath) return [];
    return activeFilePatch.hunks.map((hunk) => {
      const changeKind = derivePatchHunkChangeKind(hunk);
      const startLine = Math.max(1, hunk.newStart || hunk.oldStart || 1);
      const lineSpan = Math.max(1, hunk.newLines || hunk.oldLines || 1);
      const endLine = startLine + lineSpan - 1;
      return {
        startLine,
        endLine,
        changeKind,
        decision: (
          hunk.decision === "accepted" ? "accepted" :
          hunk.decision === "rejected" ? "rejected" :
          "pending"
        ) as "accepted" | "rejected" | "pending",
        isSelected: props.selectedPatchHunkId === hunk.id,
        hunkId: hunk.id,
      };
    });
  }, [activeFilePatch, props.selectedPatchHunkId, selectedFilePath]);

  const editorExtensions = useMemo(() => [
    ...getAgentDecorationExtensions(),
  ], []);

  const diffEditorExtensions = useMemo(() => [
    ...getAgentDecorationExtensions(),
  ], []);

  const stickyContextContent = filePatch && filePatch.relativePath === selectedFilePath
    ? (filePatch.afterContent ?? "")
    : (fileContent ?? "");

  const stickyContextModel = useStickyContext({
    selectedFilePath,
    content: stickyContextContent,
    outline,
    getStickySourceEditor,
    wordWrapEnabled: editorOptions.wordWrapEnabled,
    diffSideBySide,
    editorSurfaceRef,
    stickyDiffRanges,
    t,
  });

  useWrapColumn({
    getStickySourceEditor,
    wordWrapEnabled: editorOptions.wordWrapEnabled,
    diffSideBySide,
    selectedFilePath,
  });

  useAgentDecorations({
    cmViewRef,
    agentAnnotationsEnabled: editorOptions.agentAnnotationsEnabled,
    agentHunkDecorations,
    hasActivePatch,
  });

  useEditorStateCache(cmViewRef, selectedFilePath);

  const handleStandardEditorMount = useCallback(
    (editor: EditorRef) => {
      const domNode = editor.getDomNode?.();
      cmViewRef.current = domNode ? (EditorView.findFromDOM(domNode) ?? null) : null;
      standardEditorRef.current = editor;
      props.onEditorMount(editor);
    },
    [props.onEditorMount, cmViewRef, standardEditorRef],
  );

  const handleDiffEditorMount = useCallback(
    (editor: DiffEditorRef | EditorRef) => {
      localDiffEditorRef.current = editor;
      let editorRef: EditorRef;
      if ("getModifiedEditor" in editor) {
        editorRef = (editor as DiffEditorRef).getModifiedEditor() ?? (editor as unknown as EditorRef);
      } else {
        editorRef = editor as unknown as EditorRef;
      }
      props.onDiffMount(editorRef);
    },
    [props.onDiffMount, localDiffEditorRef],
  );

  const hasCollapsedHunks = !!activeFilePatchSummary?.hunks.some((h) => h.isCollapsed);

  const handleRevealPreviewLine = (line: number): boolean => {
    const target = editorSurfaceRef.current?.querySelector<HTMLElement>(
      `[data-source-line="${line}"]`,
    );
    if (!target) return false;
    target.scrollIntoView({ block: "start", behavior: "smooth" });
    return true;
  };

  const handleRevealLine = (line: number) => {
    if (fileCategory === "markdown" && previewEnabled && handleRevealPreviewLine(line)) {
      return;
    }
    const editor = getStickySourceEditor();
    if (editor) {
      editor.revealLineInCenter(line);
      editor.setPosition({ lineNumber: line, column: 1 });
      editor.focus();
    }
  };

  if (!selectedFilePath) {
    return editorHint ? <p className="adl-tool-hint">{editorHint}</p> : null;
  }

  if (hasActivePatch && filePatch) {
    return (
      <>
        <DiffToolbar
          diffSideBySide={diffSideBySide}
          lineNumbersEnabled={editorOptions.lineNumbersEnabled}
          wordWrapEnabled={editorOptions.wordWrapEnabled}
          agentAnnotationsEnabled={editorOptions.agentAnnotationsEnabled}
          hasCollapsedHunks={hasCollapsedHunks}
          activePatchRelativePath={activeFilePatch?.relativePath}
          onSetDiffLayout={props.onSetDiffLayout}
          onToggleLineNumbers={() => editorOptions.setLineNumbersEnabled((v) => !v)}
          onToggleWordWrap={() => editorOptions.setWordWrapEnabled((v) => !v)}
          onToggleAgentAnnotations={() => editorOptions.setAgentAnnotationsEnabled((v) => !v)}
          onJumpPatchHunk={props.onJumpPatchHunk}
          onSetAllPatchHunksCollapsed={props.onSetAllPatchHunksCollapsed}
          t={t}
        />
        {activeFilePatchSummary ? (
          <div className="adl-diff-hunk-strip" aria-label={t.patchReview as string}>
            <div className="adl-diff-hunk-strip__header">
              <div>
                <strong>{activeFilePatchSummary.relativePath}</strong>
                <small>
                  {activeFilePatchSummary.totalHunks}
                  {" · "}
                  {activeFilePatchSummary.acceptedHunks + activeFilePatchSummary.rejectedHunks}
                  {"/"}
                  {activeFilePatchSummary.totalHunks}
                </small>
              </div>
            </div>
            <div className="adl-diff-hunk-strip__list">
              {activeFilePatchSummary.hunks.map(
                (hunk: PatchHunkSummary & { isCollapsed?: boolean }, index: number) => (
                  <div
                    key={hunk.id}
                    className={`adl-diff-hunk-pill adl-diff-hunk-pill--${hunk.changeKind}${
                      props.selectedPatchHunkId === hunk.id ? " is-active" : ""
                    }`}
                  >
                    <button
                      type="button"
                      className="adl-diff-hunk-pill__main"
                      onClick={() =>
                        props.onSelectPatchHunk(
                          activeFilePatch!.relativePath,
                          hunk.id,
                          hunk.targetLine,
                          { activateTool: false },
                        )
                      }
                    >
                      <span className="adl-diff-hunk-pill__index">{index + 1}</span>
                      <span className="adl-diff-hunk-pill__body">
                        <strong>{hunk.preview}</strong>
                        <small>
                          {hunk.newStart || hunk.oldStart}
                          {hunk.isCollapsed ? ` · ${t.expandDetails}` : ""}
                        </small>
                      </span>
                      <span className={`adl-decision-chip adl-decision-chip--${hunk.decision}`}>
                        {hunk.decision === "accepted"
                          ? t.approvalApproved
                          : hunk.decision === "rejected"
                            ? t.approvalRejected
                            : t.approvalPendingCount}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="adl-diff-hunk-pill__toggle"
                      onClick={(event) => {
                        event.stopPropagation();
                        props.onTogglePatchHunkCollapse(hunk.id);
                      }}
                      aria-label={
                        (hunk.isCollapsed ? t.expandDetails : t.collapseDetails) as string
                      }
                    >
                      {hunk.isCollapsed ? (
                        <IconChevronRight size={12} decorative />
                      ) : (
                        <IconChevronDown size={12} decorative />
                      )}
                    </button>
                  </div>
                ),
              )}
            </div>
          </div>
        ) : null}
        <div ref={editorSurfaceRef} className="adl-tool-editor__surface">
          {stickyContextModel ? (
            <StickyContext
              data-testid="files-sticky-context"
              model={stickyContextModel}
              t={t}
            />
          ) : null}
          <DiffViewer
            original={filePatch.beforeContent}
            modified={filePatch.afterContent}
            language={editorLanguage}
            theme={resolvedTheme}
            locale={resolvedLocale}
            sideBySide={diffSideBySide}
            collapseUnchanged={false}
            fileKey={selectedFilePath}
            readOnly={editorOptions.diffOptions.readOnly}
            lineNumbers={editorOptions.diffOptions.lineNumbers}
            wordWrap={editorOptions.diffOptions.wordWrap}
            onMount={handleDiffEditorMount}
            extensions={diffEditorExtensions}
          />
        </div>
      </>
    );
  }

  if (fileCategory === "markdown" && previewEnabled) {
    return (
      <div
        ref={editorSurfaceRef}
        className="adl-tool-editor__surface adl-tool-editor__surface--preview"
      >
        <LazyMarkdownPreviewWrapper content={fileContent ?? ""} theme={resolvedTheme} />
      </div>
    );
  }

  if (fileCategory === "docx") {
    return (
      <div
        ref={editorSurfaceRef}
        className="adl-tool-editor__surface adl-tool-editor__surface--preview"
      >
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
            <path d="M9 15h6" />
          </svg>
          <span className="adl-unsupported-preview__text">DOCX 文档</span>
          <span className="adl-unsupported-preview__hint">此文件类型暂不支持预览</span>
        </div>
      </div>
    );
  }

  if (fileCategory === "pdf") {
    return (
      <div
        ref={editorSurfaceRef}
        className="adl-tool-editor__surface adl-tool-editor__surface--preview"
      >
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
            <path d="M9 13h6" />
            <path d="M9 17h4" />
          </svg>
          <span className="adl-unsupported-preview__text">PDF 文档</span>
          <span className="adl-unsupported-preview__hint">此文件类型暂不支持预览</span>
        </div>
      </div>
    );
  }

  if (fileCategory === "binary") {
    return (
      <div
        ref={editorSurfaceRef}
        className="adl-tool-editor__surface adl-tool-editor__surface--preview"
      >
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
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <path d="M6 12h.01" />
            <path d="M10 12h.01" />
            <path d="M14 12h4" />
          </svg>
          <span className="adl-unsupported-preview__text">二进制文件</span>
          <span className="adl-unsupported-preview__hint">此文件类型暂不支持预览</span>
        </div>
      </div>
    );
  }

  return (
    <div ref={editorSurfaceRef} className="adl-tool-editor__surface">
      {stickyContextModel ? (
        <StickyContext
          data-testid="files-sticky-context"
          model={stickyContextModel}
          t={t}
        />
      ) : null}
      <CodeEditor
        value={fileContent ?? ""}
        language={editorLanguage}
        theme={resolvedTheme}
        locale={resolvedLocale}
        readOnly={previewEnabled || editorOptions.standardOptions.readOnly}
        lineNumbers={editorOptions.standardOptions.lineNumbers}
        wordWrap={editorOptions.standardOptions.wordWrap}
        fileKey={selectedFilePath}
        onChange={props.onEditorChange}
        onMount={handleStandardEditorMount}
        extensions={editorExtensions}
      />
    </div>
  );
}

export { EditorSurfaceShell };
export type { EditorSurfaceShellProps };
