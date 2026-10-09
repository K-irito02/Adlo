export interface UndoStack {
  current(): string;
  push(next: string): void;
  undo(): string;
  redo(): string;
  canUndo(): boolean;
  canRedo(): boolean;
}

/** 快照式撤销栈：每次编辑压栈；`push` 会丢弃 redo 尾部（标准编辑器语义）。 */
export function createUndoStack(initial: string): UndoStack {
  const stack: string[] = [initial];
  let index = 0;
  return {
    current: () => stack[index],
    push: (next) => {
      if (next === stack[index]) {
        return;
      }
      stack.length = index + 1;
      stack.push(next);
      index = stack.length - 1;
    },
    undo: () => (index > 0 ? (index--, stack[index]) : stack[index]),
    redo: () => (index < stack.length - 1 ? (index++, stack[index]) : stack[index]),
    canUndo: () => index > 0,
    canRedo: () => index < stack.length - 1,
  };
}
