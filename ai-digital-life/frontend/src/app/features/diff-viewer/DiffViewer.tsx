import type { Extension } from "@codemirror/state";
import type { DiffEditorRef, EditorRef } from "../../stores/types";
import type { PreviewDiffCollapsedRange } from "./changePreviewDiffRanges";
import { SideBySideDiffViewer } from "./SideBySideDiffViewer";
import { InlineDiffViewer } from "./InlineDiffViewer";

export type DiffViewerProps = {
  original: string;
  modified: string;
  language?: string;
  theme?: "light" | "dark";
  locale?: string;
  sideBySide?: boolean;
  collapseUnchanged?: boolean;
  readOnly?: boolean;
  lineNumbers?: boolean;
  wordWrap?: boolean;
  fileKey?: string;
  onMount?: (editor: DiffEditorRef | EditorRef) => void;
  extensions?: Extension[];
  onCollapsedUnchangedRangesChange?: (ranges: PreviewDiffCollapsedRange[]) => void;
};

export function DiffViewer({
  original,
  modified,
  language = "plaintext",
  theme = "dark",
  locale = "en-US",
  sideBySide = false,
  collapseUnchanged = true,
  readOnly = true,
  lineNumbers: lineNumbersEnabled = true,
  wordWrap = false,
  fileKey,
  onMount,
  extensions: extraExtensions = [],
  onCollapsedUnchangedRangesChange,
}: DiffViewerProps) {
  const resolvedLocale = locale || "en-US";
  const child = sideBySide ? (
    <SideBySideDiffViewer
      original={original}
      modified={modified}
      language={language}
      theme={theme}
      locale={resolvedLocale}
      readOnly={readOnly}
      lineNumbersEnabled={lineNumbersEnabled}
      wordWrap={wordWrap}
      fileKey={fileKey}
      collapseUnchanged={collapseUnchanged}
      onMount={onMount}
      extraExtensions={extraExtensions}
      onCollapsedUnchangedRangesChange={onCollapsedUnchangedRangesChange}
    />
  ) : (
    <InlineDiffViewer
      original={original}
      modified={modified}
      language={language}
      theme={theme}
      locale={resolvedLocale}
      readOnly={readOnly}
      lineNumbersEnabled={lineNumbersEnabled}
      wordWrap={wordWrap}
      fileKey={fileKey}
      collapseUnchanged={collapseUnchanged}
      onMount={onMount}
      extraExtensions={extraExtensions}
      onCollapsedUnchangedRangesChange={onCollapsedUnchangedRangesChange}
    />
  );

  return child;
}
