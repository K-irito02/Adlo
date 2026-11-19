/**
 * 文件导航树拖拽的纯判定规则（无 DOM / 无 React，便于单测覆盖所有非法分支）。
 *
 * 三区语义：目录行 上/中/下 = 插入前 / 放入 / 插入后；文件行只有 上/下（无「放入文件」）。
 */

type DndZone = 'before' | 'middle' | 'after';
export type DndNodeKind = 'file' | 'directory';

export interface DndPayloadNode {
  workspaceId: string;
  path: string;
  kind: DndNodeKind;
}

export interface DndTargetNode {
  workspaceId: string;
  path: string;
  name: string;
  kind: DndNodeKind;
  parentPath: string;
  available: boolean;
}

export type NodeDropDecision =
  | { kind: 'invalid' }
  | {
      kind: 'move';
      toDir: string;
      insertPosition?: { targetName: string; position: 'before' | 'after' };
    };

/** 节点投放判定：自身 / 同工作区子孙 / 不可用工作区 → invalid。 */
export function decideNodeDrop(
  payload: DndPayloadNode,
  target: DndTargetNode,
  zone: DndZone,
): NodeDropDecision {
  if (payload.workspaceId === target.workspaceId && payload.path === target.path) {
    return { kind: 'invalid' };
  }
  if (
    payload.kind === 'directory' &&
    payload.workspaceId === target.workspaceId &&
    target.path.startsWith(`${payload.path}/`)
  ) {
    return { kind: 'invalid' };
  }
  if (!target.available) {
    return { kind: 'invalid' };
  }

  if (target.kind === 'directory') {
    if (zone === 'middle') {
      return { kind: 'move', toDir: target.path };
    }
    return {
      kind: 'move',
      toDir: target.parentPath,
      insertPosition: { targetName: target.name, position: zone },
    };
  }

  // 文件行只支持插入前后；中区（若上层误传）按非法处理，避免出现「放进文件」。
  if (zone === 'middle') {
    return { kind: 'invalid' };
  }
  return {
    kind: 'move',
    toDir: target.parentPath,
    insertPosition: { targetName: target.name, position: zone },
  };
}

/** 工作区标题重排判定：置顶区固定、自身不重排。 */
export function isInvalidWorkspaceReorder(input: {
  draggedId: string;
  draggedPinned: boolean;
  targetId: string;
  targetPinned: boolean;
}): boolean {
  return input.draggedPinned || input.targetPinned || input.draggedId === input.targetId;
}
