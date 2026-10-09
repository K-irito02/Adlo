import { describe, expect, it } from 'vitest';
import { createUndoStack } from '../clipboardUndoStack';

describe('createUndoStack', () => {
  it('undoes and redoes snapshots', () => {
    const s = createUndoStack('a');
    s.push('ab');
    s.push('abc');
    expect(s.current()).toBe('abc');
    expect(s.undo()).toBe('ab');
    expect(s.undo()).toBe('a');
    expect(s.canUndo()).toBe(false);
    expect(s.redo()).toBe('ab');
    expect(s.current()).toBe('ab');
  });

  it('drops the redo tail after a new push', () => {
    const s = createUndoStack('a');
    s.push('ab');
    s.undo();
    s.push('ax');
    expect(s.canRedo()).toBe(false);
  });

  it('ignores a push equal to the current value', () => {
    const s = createUndoStack('a');
    s.push('a');
    expect(s.canUndo()).toBe(false);
    s.undo();
    expect(s.current()).toBe('a');
  });

  it('does not move past either end of the stack', () => {
    const s = createUndoStack('a');
    expect(s.canUndo()).toBe(false);
    expect(s.undo()).toBe('a');
    expect(s.current()).toBe('a');

    s.push('ab');
    expect(s.canRedo()).toBe(false);
    expect(s.redo()).toBe('ab');
    expect(s.current()).toBe('ab');
  });
});
