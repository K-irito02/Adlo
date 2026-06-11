import { memo } from 'react';
import type { Extension } from '@codemirror/state';
import type { DiffEditorRef, EditorRef } from '../../stores/types';
import type { PreviewDiffCollapsedRange } from './changePreviewDiffRanges';
import { SideBySideDiffViewer } from './SideBySideDiffViewer';
import { InlineDiffViewer } from './InlineDiffViewer';

export interface DiffViewerProps {
  original: string;
  modified: string;
  language?: string;
  theme?: 'light' | 'dark';
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
}

function areDiffViewerPropsEqual(prev: DiffViewerProps, next: DiffViewerProps) {
  return (
    prev.original === next.original &&
    prev.modified === next.modified &&
    prev.language === next.language &&
    prev.theme === next.theme &&
    prev.locale === next.locale &&
    prev.sideBySide === next.sideBySide &&
    prev.collapseUnchanged === next.collapseUnchanged &&
    prev.readOnly === next.readOnly &&
    prev.lineNumbers === next.lineNumbers &&
    prev.wordWrap === next.wordWrap &&
    prev.fileKey === next.fileKey &&
    prev.onMount === next.onMount &&
    prev.extensions === next.extensions &&
    prev.onCollapsedUnchangedRangesChange === next.onCollapsedUnchangedRangesChange
  );
}

export const DiffViewer = memo(function DiffViewer({
  original,
  modified,
  language = 'plaintext',
  theme = 'dark',
  locale = 'en-US',
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
  const resolvedLocale = locale || 'en-US';
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
}, areDiffViewerPropsEqual);
