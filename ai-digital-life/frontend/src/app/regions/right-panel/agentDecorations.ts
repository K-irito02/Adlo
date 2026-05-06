import { StateField, StateEffect, type Extension, RangeSet } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, GutterMarker, gutter } from "@codemirror/view";
import type { Range } from "@codemirror/state";
import {
  AGENT_DECO_INSERT_CLASS,
  AGENT_DECO_MODIFY_CLASS,
  AGENT_DECO_DELETE_CLASS,
  AGENT_GUTTER_INSERT_CLASS,
  AGENT_GUTTER_MODIFY_CLASS,
  AGENT_GUTTER_DELETE_CLASS,
} from "./cmTheme";

export type AgentHunkDecoration = {
  startLine: number;
  endLine: number;
  changeKind: "added" | "modified" | "deleted";
  decision: "pending" | "accepted" | "rejected";
  isSelected?: boolean;
  hunkId: string;
};

export const setAgentDecorations = StateEffect.define<AgentHunkDecoration[]>();
export const toggleAgentDecorations = StateEffect.define<boolean>();

class AgentGutterMarker extends GutterMarker {
  constructor(readonly className: string) {
    super();
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = `adl-agent-gutter-marker ${this.className}`;
    return span;
  }
}

const gutterMarkers = {
  added: new AgentGutterMarker(AGENT_GUTTER_INSERT_CLASS),
  modified: new AgentGutterMarker(AGENT_GUTTER_MODIFY_CLASS),
  deleted: new AgentGutterMarker(AGENT_GUTTER_DELETE_CLASS),
};

function getDecoClass(hunk: AgentHunkDecoration): string {
  const kindClass =
    hunk.changeKind === "added"
      ? AGENT_DECO_INSERT_CLASS
      : hunk.changeKind === "deleted"
        ? AGENT_DECO_DELETE_CLASS
        : AGENT_DECO_MODIFY_CLASS;
  const decisionClass = `adl-agent-deco--${hunk.decision}`;
  const selectedClass = hunk.isSelected ? "adl-agent-deco--selected" : "";
  return `${kindClass} ${decisionClass} ${selectedClass}`.trim();
}

function buildLineDecorations(state: { doc: { line(n: number): { from: number }; lines: number } }, hunks: AgentHunkDecoration[]): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  if (state.doc.lines === 0) return Decoration.none;
  for (const hunk of hunks) {
    const fromLine = Math.max(1, hunk.startLine);
    const toLine = Math.max(fromLine, hunk.endLine);
    if (fromLine > state.doc.lines) continue;
    const from = state.doc.line(fromLine).from;
    const deco = Decoration.line({
      class: getDecoClass(hunk),
    });
    decorations.push(deco.range(from));
  }
  return Decoration.set(decorations, true);
}

function buildGutterMarkerSet(state: { doc: { line(n: number): { from: number }; lines: number } }, hunks: AgentHunkDecoration[]): RangeSet<GutterMarker> {
  if (state.doc.lines === 0) return RangeSet.empty;
  const ranges: Range<GutterMarker>[] = [];
  for (const hunk of hunks) {
    const fromLine = Math.max(1, hunk.startLine);
    const toLine = Math.max(fromLine, hunk.endLine);
    const marker =
      hunk.changeKind === "added"
        ? gutterMarkers.added
        : hunk.changeKind === "deleted"
          ? gutterMarkers.deleted
          : gutterMarkers.modified;
    for (let line = fromLine; line <= toLine; line++) {
      if (line > state.doc.lines) break;
      const pos = state.doc.line(line).from;
      ranges.push(marker.range(pos));
    }
  }
  return RangeSet.of(ranges, true);
}

type AgentDecorationState = {
  hunks: AgentHunkDecoration[];
  enabled: boolean;
};

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

const agentLineDecorations = EditorView.decorations.compute(
  [agentDecorationField],
  (state) => {
    const { hunks, enabled } = state.field(agentDecorationField);
    if (!enabled || hunks.length === 0) return Decoration.none;
    return buildLineDecorations(state, hunks);
  },
);

const agentGutterField = StateField.define<RangeSet<GutterMarker>>({
  create() { return RangeSet.empty; },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setAgentDecorations)) {
        return buildGutterMarkerSet(tr.state, effect.value);
      }
      if (effect.is(toggleAgentDecorations)) {
        if (!effect.value) return RangeSet.empty;
        const { hunks } = tr.state.field(agentDecorationField);
        return buildGutterMarkerSet(tr.state, hunks);
      }
    }
    if (tr.docChanged) {
      const { hunks, enabled } = tr.state.field(agentDecorationField);
      if (!enabled || hunks.length === 0) return RangeSet.empty;
      return buildGutterMarkerSet(tr.state, hunks);
    }
    return value;
  },
});

const agentGutter = gutter({
  class: "adl-agent-gutter",
  markers: (view: EditorView) => view.state.field(agentGutterField),
});

export function getAgentDecorationExtensions(): Extension[] {
  return [agentDecorationField, agentLineDecorations, agentGutterField, agentGutter];
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
