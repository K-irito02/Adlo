import { useState, useCallback, useEffect } from 'react';
import type { EditorView } from '@codemirror/view';
import { foldable, foldedRanges, foldEffect, unfoldEffect } from '@codemirror/language';
import { useTCopy } from '@app/i18n/useTCopy';
import { formatT } from '@app/i18n/formatT';
import type { ContextMenuItem } from '@components/ContextMenu';
import { useFoldTooltipState } from './useFoldTooltipState';
import { useFoldTooltipPosition } from './useFoldTooltipPosition';
import { FoldTooltipContent } from './FoldTooltipContent';
import { FoldContextMenu } from './FoldContextMenu';

interface FoldTooltipOverlayProps {
  view: EditorView | null;
}

/* ── Helpers ──────────────────────────────────── */

function getLineNumberFromEvent(view: EditorView, event: MouseEvent): number | null {
  const target = event.target as HTMLElement;
  const gutterEl = target.closest('.cm-gutterElement') as HTMLElement | null;
  if (gutterEl) {
    const rect = gutterEl.getBoundingClientRect();
    const pos = view.posAtCoords({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
    if (pos !== null) {
      return view.state.doc.lineAt(pos).number;
    }
  }
  const guttersEl = target.closest('.cm-gutters') as HTMLElement | null;
  if (guttersEl) {
    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos !== null) {
      return view.state.doc.lineAt(pos).number;
    }
  }
  return null;
}

function isLineFolded(view: EditorView, lineNum: number): boolean {
  let result = false;
  foldedRanges(view.state).between(0, view.state.doc.length, (_from, _to) => {
    const startLine = view.state.doc.lineAt(_from).number;
    const endLine = view.state.doc.lineAt(_to).number;
    if (lineNum >= startLine && lineNum <= endLine) {
      result = true;
    }
  });
  return result;
}

function isLineFoldable(view: EditorView, lineNum: number): boolean {
  const doc = view.state.doc;
  if (lineNum > doc.lines) {
    return false;
  }
  const line = doc.line(lineNum);
  if (foldable(view.state, line.from, line.to)) {
    return true;
  }
  let found = false;
  foldedRanges(view.state).between(0, doc.length, (_from, _to) => {
    const startLine = doc.lineAt(_from).number;
    if (lineNum === startLine) {
      found = true;
    }
  });
  return found;
}

function getFoldStartRange(view: EditorView, lineNum: number): { from: number; to: number } | null {
  let result: { from: number; to: number } | null = null;
  foldedRanges(view.state).between(0, view.state.doc.length, (_from, _to) => {
    const startLine = view.state.doc.lineAt(_from).number;
    if (lineNum === startLine) {
      result = { from: _from, to: _to };
    }
  });
  return result;
}

/* ── Component ────────────────────────────────── */

export function FoldTooltipOverlay({ view }: FoldTooltipOverlayProps) {
  const { t } = useTCopy();
  const { tooltip, tooltipRef } = useFoldTooltipState(view);
  const position = useFoldTooltipPosition(tooltip?.rect ?? null, tooltipRef);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: ContextMenuItem[];
  } | null>(null);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    if (!view) {
      return;
    }
    const editorDom = view.dom;

    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      /* Right-click on fold placeholder */
      const placeholder = target.closest('.cm-foldPlaceholder') as HTMLElement | null;
      if (placeholder) {
        const rect = placeholder.getBoundingClientRect();
        const pos = view.posAtCoords({
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        });
        if (pos !== null) {
          let endLine = view.state.doc.lineAt(pos).number;
          let targetRange: { from: number; to: number } | null = null;
          foldedRanges(view.state).between(0, view.state.doc.length, (from, to) => {
            const s = view.state.doc.lineAt(from).number;
            const e = view.state.doc.lineAt(to).number;
            if (endLine >= s && endLine <= e) {
              endLine = e;
            }
            if (pos >= from && pos <= to) {
              targetRange = { from, to };
            }
          });
          setContextMenu({
            x: e.clientX,
            y: e.clientY,
            items: [
              {
                id: 'unfold',
                label: formatT(t, 'changesExpandToLine', { line: endLine }),
                action: () => {
                  if (targetRange) {
                    view.dispatch({ effects: unfoldEffect.of(targetRange) });
                  }
                },
              },
            ],
          });
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      /* Right-click on gutter */
      const gutters = target.closest('.cm-gutters') as HTMLElement | null;
      if (!gutters) {
        return;
      }

      const lineNum = getLineNumberFromEvent(view, e);
      if (lineNum === null) {
        return;
      }

      const isClosed = isLineFolded(view, lineNum);
      const isFoldable = isLineFoldable(view, lineNum);
      if (!isClosed && !isFoldable) {
        return;
      }

      const items: ContextMenuItem[] = [];

      if (isClosed) {
        let endLine = lineNum;
        foldedRanges(view.state).between(0, view.state.doc.length, (_from, _to) => {
          const s = view.state.doc.lineAt(_from).number;
          const e = view.state.doc.lineAt(_to).number;
          if (lineNum >= s && lineNum <= e) {
            endLine = e;
          }
        });
        const range = getFoldStartRange(view, lineNum);
        items.push({
          id: 'unfold',
          label: formatT(t, 'changesExpandToLine', { line: endLine }),
          action: () => {
            if (range) {
              view.dispatch({ effects: unfoldEffect.of(range) });
            }
          },
        });
      }

      if (isFoldable && !isClosed) {
        const docLine = view.state.doc.line(lineNum);
        const range = foldable(view.state, docLine.from, docLine.to);
        if (range) {
          const endLine = view.state.doc.lineAt(range.to).number;
          items.push({
            id: 'fold',
            label: formatT(t, 'changesCollapseToLine', { line: endLine }),
            action: () => {
              view.dispatch({ effects: foldEffect.of(range) });
            },
          });
        }
      }

      if (items.length > 0) {
        setContextMenu({ x: e.clientX, y: e.clientY, items });
        e.preventDefault();
        e.stopPropagation();
      }
    };

    editorDom.addEventListener('contextmenu', handleContextMenu);
    return () => editorDom.removeEventListener('contextmenu', handleContextMenu);
  }, [view, t]);

  return (
    <>
      <FoldTooltipContent
        text={tooltip?.text ?? null}
        position={position}
        tooltipRef={tooltipRef}
      />
      <FoldContextMenu
        visible={contextMenu !== null}
        position={contextMenu ?? { x: 0, y: 0 }}
        menuItems={contextMenu?.items ?? []}
        onClose={closeContextMenu}
      />
    </>
  );
}
