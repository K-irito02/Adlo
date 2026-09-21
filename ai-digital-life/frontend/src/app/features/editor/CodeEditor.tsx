import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import {
  EditorView,
  lineNumbers,
  highlightActiveLineGutter,
  highlightActiveLine,
  keymap,
} from '@codemirror/view';
import { gutterHoverSync } from './gutterHoverSync';
import type { Extension } from '@codemirror/state';
import { EditorState, Compartment } from '@codemirror/state';
import { history } from '@codemirror/commands';
import { indentOnInput, bracketMatching, codeFolding } from '@codemirror/language';
import { search } from '@codemirror/search';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import type { EditorRef } from '@stores/types';
import type { PersistedViewport } from '@stores/persisted/viewport';
import {
  applyEditorViewport,
  shouldApplyViewport,
  viewportSessionKey,
} from '@stores/persisted/viewport';
import { createEditorRef } from './editorAdapters';
import { getThemeExtension, getPhrasesExtension } from './cmTheme';
import { getLanguageExtension } from './cmLanguages';
import { createFoldGutterExtension } from './cmFoldGutter';
import { FoldTooltipOverlay } from './FoldTooltipOverlay';
import { scrollLeftSyncExtension } from './cmScrollSync';
import { useFoldMarkerAutoHide } from './useFoldMarkerAutoHide';
import { useTCopy } from '@app/i18n/useTCopy';
import { cn } from '@/lib/utils';

export interface CodeEditorProps {
  value: string;
  language?: string;
  theme?: 'light' | 'dark';
  readOnly?: boolean;
  lineNumbers?: boolean;
  wordWrap?: boolean;
  fileKey?: string;
  /** 文件所属工作区 id（与 fileKey 配套，用于匹配持久化视口，Task 27） */
  workspaceId?: string;
  /** 跨重启恢复的视口（`adl:session.editorViewport`，Task 27） */
  viewport?: PersistedViewport | null;
  onChange?: (value: string) => void;
  onMount?: (editor: EditorRef) => void;
  extensions?: Extension[];
}

const lineNumbersCompartment = new Compartment();
const wordWrapCompartment = new Compartment();
const foldGutterCompartment = new Compartment();

export function CodeEditor({
  value,
  language = 'plaintext',
  theme = 'dark',
  readOnly = false,
  lineNumbers: lineNumbersEnabled = true,
  wordWrap = false,
  fileKey,
  workspaceId,
  viewport,
  onChange,
  onMount,
  extensions: extraExtensions = [],
}: CodeEditorProps) {
  const { t } = useTCopy();
  const viewRef = useRef<EditorView | null>(null);
  const mountedRef = useRef(false);
  const viewportAppliedRef = useRef<string | null>(null);
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const [langExtensions, setLangExtensions] = useState<Extension[]>([]);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLanguageExtension(language)
      .then((exts) => {
        if (!cancelled) {
          setLangExtensions(exts);
        }
      })
      .catch((_err) => {
        /* language extension load failed */
      });
    return () => {
      cancelled = true;
    };
  }, [language]);

  const foldMarkerState = useFoldMarkerAutoHide(wrapperRef, fileKey ?? value, editorView);

  const cmPhrases = useMemo(
    () => ({
      unchangedLines: t.cmFoldNoChanges,
      restoreBlock: t.cmFoldRestore,
      accept: t.cmFoldAccept,
      reject: t.cmFoldReject,
    }),
    [t],
  );

  const baseExtensions = useMemo<Extension[]>(() => {
    const gutterEnabled = lineNumbersEnabled;
    const exts: Extension[] = [
      history(),
      lineNumbersCompartment.of(gutterEnabled ? lineNumbers() : []),
      highlightActiveLineGutter(),
      highlightActiveLine(),
      bracketMatching(),
      indentOnInput(),
      search(),
      closeBrackets(),
      keymap.of(closeBracketsKeymap),
      codeFolding(),
      foldGutterCompartment.of(gutterEnabled ? createFoldGutterExtension() : []),
      wordWrapCompartment.of(wordWrap ? EditorView.lineWrapping : []),
      scrollLeftSyncExtension,
      gutterHoverSync(),
      EditorState.readOnly.of(readOnly),
      ...langExtensions,
      getPhrasesExtension(cmPhrases),
    ];
    return exts;
  }, [langExtensions, readOnly, lineNumbersEnabled, wordWrap, cmPhrases]);

  const allExtensions = useMemo<Extension[]>(() => {
    const exts: Extension[] = [...baseExtensions, ...extraExtensions];
    exts.push(...(getThemeExtension(theme) as Extension[]));
    return exts;
  }, [theme, baseExtensions, extraExtensions]);

  const handleCreateEditorView = useCallback(
    (view: EditorView) => {
      viewRef.current = view;
      setEditorView(view);
      if (onMount) {
        onMount(createEditorRef(view));
      }
      mountedRef.current = true;
    },
    [onMount],
  );

  const handleChange = useCallback(
    (val: string) => {
      if (onChange) {
        onChange(val);
      }
    },
    [onChange],
  );

  useEffect(() => {
    const view = viewRef.current;
    if (!view) {
      return;
    }
    view.dispatch({
      effects: [
        lineNumbersCompartment.reconfigure(lineNumbersEnabled ? lineNumbers() : []),
        foldGutterCompartment.reconfigure(lineNumbersEnabled ? createFoldGutterExtension() : []),
        wordWrapCompartment.reconfigure(wordWrap ? EditorView.lineWrapping : []),
      ],
    });
  }, [lineNumbersEnabled, wordWrap]);

  // 会话恢复（Task 27）：挂载并拿到文档行数后，用 clampScrollTop 得到目标偏移
  // 并精确恢复滚动，再按行号重建折叠区间。每个"工作区 + 文件"只应用一次（applied
  // 哨兵按二者联合键入；fix round 1 #1：单绑 fileKey 会漏恢复跨工作区同路径文件）。
  // 后续键入触发的 value 变化不再重放；工作区/路径任一不匹配即跳过。
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !fileKey || !viewport) {
      return;
    }
    if (!shouldApplyViewport(viewportAppliedRef.current, fileKey, workspaceId, viewport)) {
      return;
    }
    applyEditorViewport(view, viewport);
    viewportAppliedRef.current = viewportSessionKey(workspaceId, fileKey);
  }, [fileKey, value, workspaceId, viewport, editorView]);

  return (
    <div
      ref={wrapperRef}
      className={cn(
        'adl-cm-editor-wrapper',
        wordWrap ? 'adl-cm-word-wrap' : 'adl-cm-no-word-wrap',
        !lineNumbersEnabled && 'adl-cm-no-gutters',
      )}
      data-fold-marker-state={foldMarkerState}
      style={{ position: 'relative', width: '100%', height: '100%' }}
    >
      <CodeMirror
        value={value}
        extensions={allExtensions}
        theme="dark"
        onChange={handleChange}
        onCreateEditor={handleCreateEditorView}
        className="adl-cm-editor"
        basicSetup={false}
      />
      <FoldTooltipOverlay view={editorView} />
    </div>
  );
}
