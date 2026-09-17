import { useCallback, useEffect, useRef } from 'react';
import type { DiagnosticSummary } from '@ai-digital-life/kernel';
import type { EditorRef, DiffEditorRef } from '../stores/types';

/**
 * 行揭示。越界行会直接抛 RangeError 且上层无错误边界（曾致整应用空白，
 * 见 debug-logs.txt 2026-09-17 Invalid line number 268 in 57-line document）。
 *
 * 检索命中行相对当前内容可能 stale（检索后文件被改/换成别的版本），此时：
 * 不丢弃、不抛错，而是钳制到最近的有效行并告警——保证任何情况下都能落到可见位置。
 */
function revealLineSafely(editor: EditorRef, line: number, scope: string, path?: string): boolean {
  const lineCount = editor.getModel?.()?.getLineCount() ?? Number.POSITIVE_INFINITY;
  if (!Number.isFinite(line)) {
    return false;
  }
  const finiteCount = Number.isFinite(lineCount) ? lineCount : null;
  let target = line;
  if (line < 1) {
    target = 1;
  } else if (finiteCount !== null && line > finiteCount) {
    target = finiteCount;
  }
  if (target !== line) {
    console.warn(
      `[useEditorReveal] stale reveal line clamped in ${scope}: requested=${line}, applied=${target}, lineCount=${finiteCount ?? 'unknown'}, path=${path ?? 'unknown'}`,
    );
  }
  editor.revealLineInCenter(target);
  editor.setPosition({ lineNumber: target, column: 1 });
  editor.focus();
  return true;
}

export function useEditorReveal(
  selectedFilePath: string | undefined,
  activeDiagnostic: DiagnosticSummary | undefined,
  fileLastModifiedAt: number | undefined,
  actions: {
    openFile: (relativePath: string) => Promise<void>;
  },
  pendingRevealRef: React.MutableRefObject<{ path: string; line: number } | null>,
  setPendingReveal: (path: string, line: number) => void,
  fileContent: string | undefined,
) {
  const standardEditorRef = useRef<EditorRef | null>(null);
  const diffEditorRef = useRef<EditorRef | DiffEditorRef | null>(null);

  useEffect(() => {
    if (!activeDiagnostic?.line) {
      return;
    }
    const raw = diffEditorRef.current ?? standardEditorRef.current;
    const editor =
      raw && 'getModifiedEditor' in raw ? (raw as DiffEditorRef).getModifiedEditor() : raw;
    if (!editor) {
      return;
    }
    revealLineSafely(editor, activeDiagnostic.line, 'diagnostic', selectedFilePath);
  }, [activeDiagnostic, selectedFilePath]);

  // 记录 pending 的起始时刻，避免因模型迟迟不匹配而无限重试
  const pendingSinceRef = useRef<number | null>(null);

  useEffect(() => {
    const pending = pendingRevealRef.current;
    if (!pending) {
      pendingSinceRef.current = null;
      return;
    }
    if (!selectedFilePath || selectedFilePath !== pending.path) {
      return;
    }
    const raw = diffEditorRef.current ?? standardEditorRef.current;
    const editor =
      raw && 'getModifiedEditor' in raw ? (raw as DiffEditorRef).getModifiedEditor() : raw;
    if (!editor) {
      return;
    }
    // 切换文件时 editor 可能仍挂着上一个文档的模型（日志实证：
    // 目标行 421 却 lineCount=128），此时不能当作"越界"丢弃，而应等待新模型挂载。
    const model = editor.getModel?.();
    const lineCount = model?.getLineCount();
    const expectedLines = fileContent === undefined ? undefined : fileContent.split('\n').length;
    const modelFresh =
      expectedLines === undefined ||
      lineCount === undefined ||
      Math.abs(lineCount - expectedLines) <= 1;
    if (!modelFresh) {
      const since = pendingSinceRef.current ?? Date.now();
      pendingSinceRef.current = since;
      if (Date.now() - since > 3000) {
        console.warn(
          `[useEditorReveal] give up stale pending reveal: line=${pending.line}, modelLines=${lineCount}, expected=${expectedLines}`,
        );
        pendingRevealRef.current = null;
        pendingSinceRef.current = null;
      }
      return;
    }
    revealLineSafely(editor, pending.line, 'pending', pending.path);
    pendingRevealRef.current = null;
    pendingSinceRef.current = null;
  }, [fileContent, fileLastModifiedAt, selectedFilePath, pendingRevealRef]);

  const handleOpenFileAtLine = useCallback(
    (relativePath: string, line: number) => {
      setPendingReveal(relativePath, line);
      void actions.openFile(relativePath);
    },
    [actions, setPendingReveal],
  );

  const handleDiffMount = useCallback((editor: EditorRef | DiffEditorRef) => {
    diffEditorRef.current = editor;
  }, []);

  return {
    standardEditorRef,
    diffEditorRef,
    handleOpenFileAtLine,
    handleDiffMount,
  };
}
