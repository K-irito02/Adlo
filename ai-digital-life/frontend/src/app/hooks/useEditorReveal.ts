import { useCallback, useEffect, useRef } from 'react';
import type { DiagnosticSummary } from '@ai-digital-life/kernel';
import type { Locale } from '../i18n';
import { copy } from '../i18n';
import { buildSelectionPrompt } from '../utils/selectionPrompt';
import type { EditorRef, DiffEditorRef } from '../stores/types';

export function useEditorReveal(
  selectedFilePath: string | undefined,
  activeDiagnostic: DiagnosticSummary | undefined,
  fileLastModifiedAt: number | undefined,
  actions: {
    sendMessage: (content: string) => Promise<void>;
    openFile: (relativePath: string) => Promise<void>;
  },
  locale: Locale,
  setEditorHint: (hint: string | undefined) => void,
  pendingRevealRef: React.MutableRefObject<{ path: string; line: number } | null>,
  setPendingReveal: (path: string, line: number) => void
) {
  const standardEditorRef = useRef<EditorRef | null>(null);
  const diffEditorRef = useRef<EditorRef | DiffEditorRef | null>(null);

  const t = copy[locale];

  useEffect(() => {
    if (!activeDiagnostic?.line) return;
    const raw = diffEditorRef.current ?? standardEditorRef.current;
    const editor =
      raw && 'getModifiedEditor' in raw ? (raw as DiffEditorRef).getModifiedEditor() : raw;
    if (!editor) return;
    editor.revealLineInCenter(activeDiagnostic.line);
    editor.setPosition({ lineNumber: activeDiagnostic.line, column: 1 });
    editor.focus();
  }, [activeDiagnostic]);

  useEffect(() => {
    const pending = pendingRevealRef.current;
    if (!pending) return;
    if (!selectedFilePath || selectedFilePath !== pending.path) return;
    const raw = diffEditorRef.current ?? standardEditorRef.current;
    const editor =
      raw && 'getModifiedEditor' in raw ? (raw as DiffEditorRef).getModifiedEditor() : raw;
    if (!editor) return;
    editor.revealLineInCenter(pending.line);
    editor.setPosition({ lineNumber: pending.line, column: 1 });
    editor.focus();
    pendingRevealRef.current = null;
  }, [fileLastModifiedAt, selectedFilePath, pendingRevealRef]);

  const handleSendSelection = useCallback(async () => {
    const raw = diffEditorRef.current ?? standardEditorRef.current;
    const editor =
      raw && 'getModifiedEditor' in raw ? (raw as DiffEditorRef).getModifiedEditor() : raw;
    const selection = editor?.getSelection();
    const model = editor?.getModel();
    if (!selection || !model || !selectedFilePath) {
      setEditorHint(t.noSelection);
      return;
    }
    const selectedText = model.getValueInRange(selection).trim();
    if (!selectedText) {
      setEditorHint(t.noSelection);
      return;
    }
    setEditorHint(undefined);
    await actions.sendMessage(buildSelectionPrompt(locale, selectedFilePath, selectedText));
  }, [locale, selectedFilePath, actions.sendMessage, t.noSelection, setEditorHint]);

  const handleOpenFileAtLine = useCallback(
    (relativePath: string, line: number) => {
      setPendingReveal(relativePath, line);
      void actions.openFile(relativePath);
    },
    [actions.openFile, setPendingReveal]
  );

  const handleDiffMount = useCallback((editor: EditorRef | DiffEditorRef) => {
    diffEditorRef.current = editor;
  }, []);

  return {
    standardEditorRef,
    diffEditorRef,
    handleOpenFileAtLine,
    handleSendSelection,
    handleDiffMount,
  };
}
