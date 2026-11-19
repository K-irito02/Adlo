import { describe, expect, it } from 'vitest';
import { decideNodeDrop, isInvalidWorkspaceReorder } from '../treeDndRules';
import type { DndPayloadNode, DndTargetNode } from '../treeDndRules';

const payload = (overrides: Partial<DndPayloadNode> = {}): DndPayloadNode => ({
  workspaceId: 'ws-a',
  path: 'src',
  kind: 'directory',
  ...overrides,
});

const target = (overrides: Partial<DndTargetNode> = {}): DndTargetNode => ({
  workspaceId: 'ws-a',
  path: 'docs',
  name: 'docs',
  kind: 'directory',
  parentPath: '',
  available: true,
  ...overrides,
});

describe('decideNodeDrop', () => {
  it('拖到自身 → 非法', () => {
    expect(decideNodeDrop(payload(), target({ path: 'src', name: 'src' }), 'middle')).toEqual({
      kind: 'invalid',
    });
  });

  it('同工作区拖进自己的子孙 → 非法', () => {
    expect(
      decideNodeDrop(payload(), target({ path: 'src/components', name: 'components' }), 'before'),
    ).toEqual({ kind: 'invalid' });
  });

  it('跨工作区同名前缀不受子孙判定影响（允许投放）', () => {
    expect(
      decideNodeDrop(
        payload(),
        target({ workspaceId: 'ws-b', path: 'src/components', name: 'components' }),
        'middle',
      ),
    ).toEqual({ kind: 'move', toDir: 'src/components' });
  });

  it('目标工作区不可用 → 非法', () => {
    expect(decideNodeDrop(payload(), target({ available: false }), 'middle')).toEqual({
      kind: 'invalid',
    });
  });

  it('目录行中区 → 放入该目录', () => {
    expect(decideNodeDrop(payload(), target(), 'middle')).toEqual({
      kind: 'move',
      toDir: 'docs',
    });
  });

  it('目录行上下区 → 插入父目录的前/后', () => {
    expect(
      decideNodeDrop(payload(), target({ parentPath: 'pkg', name: 'docs' }), 'before'),
    ).toEqual({
      kind: 'move',
      toDir: 'pkg',
      insertPosition: { targetName: 'docs', position: 'before' },
    });
    expect(decideNodeDrop(payload(), target({ parentPath: 'pkg', name: 'docs' }), 'after')).toEqual(
      { kind: 'move', toDir: 'pkg', insertPosition: { targetName: 'docs', position: 'after' } },
    );
  });

  it('文件行中区 → 非法（不允许放进文件）', () => {
    expect(
      decideNodeDrop(
        payload({ kind: 'file', path: 'a.ts' }),
        target({ kind: 'file', path: 'b.ts', name: 'b.ts' }),
        'middle',
      ),
    ).toEqual({ kind: 'invalid' });
  });

  it('文件行上下区 → 插入父目录的前/后', () => {
    expect(
      decideNodeDrop(
        payload({ path: 'docs' }),
        target({ kind: 'file', path: 'src/b.ts', name: 'b.ts', parentPath: 'src' }),
        'after',
      ),
    ).toEqual({
      kind: 'move',
      toDir: 'src',
      insertPosition: { targetName: 'b.ts', position: 'after' },
    });
  });
});

describe('isInvalidWorkspaceReorder', () => {
  it('置顶项参与重排 → 非法', () => {
    expect(
      isInvalidWorkspaceReorder({
        draggedId: 'a',
        draggedPinned: true,
        targetId: 'b',
        targetPinned: false,
      }),
    ).toBe(true);
    expect(
      isInvalidWorkspaceReorder({
        draggedId: 'a',
        draggedPinned: false,
        targetId: 'b',
        targetPinned: true,
      }),
    ).toBe(true);
  });

  it('拖到自身 → 非法', () => {
    expect(
      isInvalidWorkspaceReorder({
        draggedId: 'a',
        draggedPinned: false,
        targetId: 'a',
        targetPinned: false,
      }),
    ).toBe(true);
  });

  it('非置顶项之间重排 → 合法', () => {
    expect(
      isInvalidWorkspaceReorder({
        draggedId: 'a',
        draggedPinned: false,
        targetId: 'b',
        targetPinned: false,
      }),
    ).toBe(false);
  });
});
