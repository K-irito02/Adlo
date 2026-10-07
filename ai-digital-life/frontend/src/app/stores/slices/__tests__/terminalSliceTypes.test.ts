import { describe, it, expect } from 'vitest';
import {
  isTerminalProfile,
  createTerminalPane,
  readTerminalPane,
  readTerminalPanes,
  activePaneOf,
  nextPaneColorIndex,
  clampPaneLabel,
  type TerminalPane,
  type TerminalTabState,
} from '../terminalSliceTypes';

function makePane(overrides: Partial<TerminalPane> = {}): TerminalPane {
  return {
    id: 'pane-1',
    profile: 'powershell',
    status: 'idle',
    colorIndex: 0,
    ...overrides,
  };
}

function makeTab(panes: TerminalPane[], activePaneId?: string): TerminalTabState {
  return {
    id: 'tab-1',
    workspaceId: 'ws-1',
    title: 'PowerShell',
    profile: 'powershell',
    panes,
    activePaneId,
    isPinned: false,
    sortOrder: 1,
  };
}

describe('isTerminalProfile', () => {
  it('accepts the three known profiles', () => {
    expect(isTerminalProfile('powershell')).toBe(true);
    expect(isTerminalProfile('bash')).toBe(true);
    expect(isTerminalProfile('cmd')).toBe(true);
  });

  it('rejects unknown or non-string values', () => {
    expect(isTerminalProfile('zsh')).toBe(false);
    expect(isTerminalProfile('')).toBe(false);
    expect(isTerminalProfile(null)).toBe(false);
    expect(isTerminalProfile(undefined)).toBe(false);
    expect(isTerminalProfile(42)).toBe(false);
  });
});

describe('createTerminalPane', () => {
  it('creates an idle pane with the given profile and color index', () => {
    const pane = createTerminalPane('bash', 2);
    expect(pane.id.startsWith('pane-')).toBe(true);
    expect(pane.profile).toBe('bash');
    expect(pane.status).toBe('idle');
    expect(pane.colorIndex).toBe(2);
    expect(pane.sessionId).toBeUndefined();
    expect(pane.label).toBeUndefined();
  });

  it('assigns unique ids to consecutive panes', () => {
    expect(createTerminalPane('cmd', 0).id).not.toBe(createTerminalPane('cmd', 1).id);
  });
});

describe('readTerminalPane', () => {
  it('accepts a valid pane (with optional sessionId/label)', () => {
    expect(readTerminalPane(makePane())).toEqual(makePane());
    expect(readTerminalPane(makePane({ sessionId: 's1', label: 'x' }))).toEqual(
      makePane({ sessionId: 's1', label: 'x' }),
    );
  });

  it('rejects non-objects and invalid fields', () => {
    expect(readTerminalPane(null)).toBeUndefined();
    expect(readTerminalPane([])).toBeUndefined();
    expect(readTerminalPane('p')).toBeUndefined();
    expect(readTerminalPane(makePane({ id: 1 as never }))).toBeUndefined();
    expect(readTerminalPane(makePane({ profile: 'zsh' as never }))).toBeUndefined();
    expect(readTerminalPane(makePane({ status: 'bogus' as never }))).toBeUndefined();
    expect(readTerminalPane(makePane({ colorIndex: '0' as never }))).toBeUndefined();
    expect(readTerminalPane(makePane({ sessionId: 1 as never }))).toBeUndefined();
    expect(readTerminalPane(makePane({ label: 1 as never }))).toBeUndefined();
  });
});

describe('readTerminalPanes', () => {
  it('returns undefined for non-arrays', () => {
    expect(readTerminalPanes(undefined)).toBeUndefined();
    expect(readTerminalPanes({})).toBeUndefined();
  });

  it('returns the valid panes in order when every item is valid', () => {
    expect(readTerminalPanes([])).toEqual([]);
    expect(readTerminalPanes([makePane(), makePane({ id: 'pane-2', colorIndex: 1 })])).toEqual([
      makePane(),
      makePane({ id: 'pane-2', colorIndex: 1 }),
    ]);
  });

  it('rejects the whole array when any item is invalid (整项拒绝)', () => {
    expect(readTerminalPanes([makePane(), { id: 1 }, 'nope'])).toBeUndefined();
    expect(readTerminalPanes([{ id: 1 }])).toBeUndefined();
    expect(readTerminalPanes([makePane(), makePane({ status: 'bogus' as never })])).toBeUndefined();
  });
});

describe('activePaneOf', () => {
  it('returns the pane matching activePaneId', () => {
    const a = makePane({ id: 'a' });
    const b = makePane({ id: 'b', colorIndex: 1 });
    expect(activePaneOf(makeTab([a, b], 'b'))).toBe(b);
  });

  it('falls back to the first pane when activePaneId is missing or dangling', () => {
    const a = makePane({ id: 'a' });
    const b = makePane({ id: 'b', colorIndex: 1 });
    expect(activePaneOf(makeTab([a, b]))).toBe(a);
    expect(activePaneOf(makeTab([a, b], 'missing'))).toBe(a);
  });

  it('returns undefined for a tab without panes', () => {
    expect(activePaneOf(makeTab([]))).toBeUndefined();
  });
});

describe('nextPaneColorIndex', () => {
  it('returns 0 for no panes', () => {
    expect(nextPaneColorIndex([])).toBe(0);
  });

  it('returns the first unused index', () => {
    expect(nextPaneColorIndex([makePane({ colorIndex: 0 })])).toBe(1);
    expect(
      nextPaneColorIndex([makePane({ colorIndex: 0 }), makePane({ id: 'b', colorIndex: 2 })]),
    ).toBe(1);
  });

  it('returns panes.length when every 0..N-1 index is occupied', () => {
    expect(
      nextPaneColorIndex([
        makePane({ colorIndex: 0 }),
        makePane({ id: 'b', colorIndex: 1 }),
        makePane({ id: 'c', colorIndex: 2 }),
      ]),
    ).toBe(3);
  });
});

describe('clampPaneLabel', () => {
  it('keeps only the first code point', () => {
    expect(clampPaneLabel('中文')).toBe('中');
    expect(clampPaneLabel('abc')).toBe('a');
    expect(clampPaneLabel('')).toBe('');
  });

  it('does not split surrogate pairs (emoji survives intact)', () => {
    expect(clampPaneLabel('😀x')).toBe('😀');
  });
});
