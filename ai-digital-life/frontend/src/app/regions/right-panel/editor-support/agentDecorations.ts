import { StateField, StateEffect, type Extension } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';
import type { Range } from '@codemirror/state';
import {
  AGENT_DECO_DELETE_BLOCK_CLASS,
  AGENT_DECO_INSERT_CLASS,
  AGENT_DECO_INSERT_BLOCK_CLASS,
  AGENT_DECO_MODIFY_CLASS,
  AGENT_DECO_MODIFY_BLOCK_CLASS,
  AGENT_DECO_DELETE_CLASS,
} from '../../../features/editor/cmTheme';

export interface AgentHunkDecoration {
  startLine: number;
  endLine: number;
  changeKind: 'added' | 'modified' | 'deleted';
  decision: 'pending' | 'accepted' | 'rejected';
  isSelected?: boolean;
  hunkId: string;
}

export const setAgentDecorations = StateEffect.define<AgentHunkDecoration[]>();
export const toggleAgentDecorations = StateEffect.define<boolean>();

function getLineDecoClass(hunk: AgentHunkDecoration): string {
  const kindClass =
    hunk.changeKind === 'added'
      ? AGENT_DECO_INSERT_BLOCK_CLASS
      : hunk.changeKind === 'deleted'
        ? AGENT_DECO_DELETE_BLOCK_CLASS
        : AGENT_DECO_MODIFY_BLOCK_CLASS;
  const decisionClass = `adl-agent-deco--${hunk.decision}`;
  const selectedClass = hunk.isSelected ? 'adl-agent-deco--selected' : '';
  return `${kindClass} ${decisionClass} ${selectedClass}`.trim();
}

function getContentDecoClass(hunk: AgentHunkDecoration): string {
  return hunk.changeKind === 'added'
    ? AGENT_DECO_INSERT_CLASS
    : hunk.changeKind === 'deleted'
      ? AGENT_DECO_DELETE_CLASS
      : AGENT_DECO_MODIFY_CLASS;
}

function buildLineDecorations(
  state: { doc: { line(n: number): { from: number; to: number }; lines: number } },
  hunks: AgentHunkDecoration[]
): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  if (state.doc.lines === 0) {
    return Decoration.none;
  }
  for (const hunk of hunks) {
    const fromLine = Math.max(1, hunk.startLine);
    const toLine = Math.max(fromLine, hunk.endLine);
    if (fromLine > state.doc.lines) {
      continue;
    }
    const boundedToLine = Math.min(toLine, state.doc.lines);
    for (let line = fromLine; line <= boundedToLine; line += 1) {
      const lineInfo = state.doc.line(line);
      decorations.push(Decoration.line({ class: getLineDecoClass(hunk) }).range(lineInfo.from));
      if (lineInfo.from < lineInfo.to) {
        decorations.push(
          Decoration.mark({ class: getContentDecoClass(hunk) }).range(lineInfo.from, lineInfo.to)
        );
      }
    }
  }
  return Decoration.set(decorations, true);
}

interface AgentDecorationState {
  hunks: AgentHunkDecoration[];
  enabled: boolean;
}

const agentDecorationField = StateField.define<AgentDecorationState>({
  create: () => ({ hunks: [], enabled: true }),
  update: (value, tr) => {
    for (const effect of tr.effects) {
      if (effect.is(setAgentDecorations)) {
        return { ...value, hunks: effect.value };
      }
      if (effect.is(toggleAgentDecorations)) {
        return { ...value, enabled: effect.value };
      }
    }
    return value;
  },
});

const agentLineDecorations = EditorView.decorations.compute([agentDecorationField], (state) => {
  const { hunks, enabled } = state.field(agentDecorationField);
  if (!enabled || hunks.length === 0) {
    return Decoration.none;
  }
  return buildLineDecorations(state, hunks);
});

export function getAgentDecorationExtensions(): Extension[] {
  return [agentDecorationField, agentLineDecorations];
}

export function applyAgentDecorations(view: EditorView, hunks: AgentHunkDecoration[]) {
  view.dispatch({ effects: setAgentDecorations.of(hunks) });
}

export function setAgentDecorationsEnabled(view: EditorView, enabled: boolean) {
  view.dispatch({ effects: toggleAgentDecorations.of(enabled) });
}

export function clearAgentDecorations(view: EditorView) {
  view.dispatch({ effects: setAgentDecorations.of([]) });
}
