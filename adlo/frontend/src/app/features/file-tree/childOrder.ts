/**
 * 目录自定义顺序（文件 / 变更导航树共用）。
 *
 * 文件系统没有顺序，后端固定「目录优先 + 名字升序」；用户拖拽排序后把顺序写进
 * 前端偏好 `adl:files.childOrder`。结构压平为 `记录键 → 子项名数组`，键由
 * 「工作区路径 + 目录相对路径」组成——用工作区路径而不是工作区 id，工作区被
 * 移除后再加回仍能命中旧顺序。
 */
import type { FileTreeRenderableNode } from './fileTree.utils';

export type FileChildOrder = Record<string, string[]>;

const KEY_SEPARATOR = '\u0000';

export function childOrderKey(workspacePath: string, dirPath: string): string {
  return `${workspacePath}${KEY_SEPARATOR}${dirPath}`;
}

function sortSiblings<T extends FileTreeRenderableNode>(
  nodes: T[],
  names: readonly string[] | undefined,
): T[] {
  if (!names || names.length === 0) {
    return nodes;
  }
  const rank = new Map<string, number>();
  names.forEach((name, index) => {
    if (!rank.has(name)) {
      rank.set(name, index);
    }
  });
  if (!nodes.some((node) => rank.has(node.name))) {
    return nodes;
  }
  const ordered: T[] = [];
  const rest: T[] = [];
  for (const node of nodes) {
    if (rank.has(node.name)) {
      ordered.push(node);
    } else {
      rest.push(node);
    }
  }
  ordered.sort((left, right) => (rank.get(left.name) ?? 0) - (rank.get(right.name) ?? 0));
  // 未列出的节点保持后端默认顺序（目录优先 + 名字）排在后面。
  return [...ordered, ...rest];
}

/**
 * 递归应用某工作区的自定义顺序。`dirPath` 传 `''` 表示工作区根目录。
 * 只重排同一父目录下的兄弟节点，不改变父子关系。
 */
export function applyChildOrder<T extends FileTreeRenderableNode>(
  nodes: T[],
  workspacePath: string,
  dirPath: string,
  order: FileChildOrder,
): T[] {
  const withSortedChildren = nodes.map((node) => {
    if (node.kind !== 'directory' || node.children.length === 0) {
      return node;
    }
    return {
      ...node,
      children: applyChildOrder(node.children as T[], workspacePath, node.path, order),
    } as T;
  });
  return sortSiblings(withSortedChildren, order[childOrderKey(workspacePath, dirPath)]);
}

/** 同目录内把 `movedName` 插到 `targetName` 之前/之后，返回新的名字序列。 */
export function insertChildName(
  names: readonly string[],
  movedName: string,
  targetName: string,
  position: 'before' | 'after',
): string[] {
  const withoutMoved = names.filter((name) => name !== movedName);
  const targetIndex = withoutMoved.indexOf(targetName);
  const insertAt =
    targetIndex === -1 ? withoutMoved.length : targetIndex + (position === 'after' ? 1 : 0);
  const next = [...withoutMoved];
  next.splice(insertAt, 0, movedName);
  return next;
}
