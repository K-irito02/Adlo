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

/** 把 `movedName` 插到 `targetName` 之前/之后（同目录顺序重排共用）。 */
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

function splitDirPath(dirPath: string): { parent: string; name: string } {
  const index = dirPath.lastIndexOf('/');
  if (index === -1) {
    return { parent: '', name: dirPath };
  }
  return { parent: dirPath.slice(0, index), name: dirPath.slice(index + 1) };
}

function replaceChildName(names: readonly string[], from: string, to: string): string[] {
  const index = names.indexOf(from);
  if (index === -1) {
    return [...names];
  }
  const next = [...names];
  next[index] = to;
  return next;
}

/**
 * 目录重命名后搬运顺序：目录自身与全部子孙的键前缀重映射，
 * 同时把父目录顺序里的旧名字换成新名字（文件系统「移动」由拖拽写序处理，不走这里）。
 */
export function remapChildOrderForRename(
  order: FileChildOrder,
  workspacePath: string,
  oldPath: string,
  newPath: string,
): FileChildOrder {
  const oldParent = splitDirPath(oldPath);
  const newName = splitDirPath(newPath).name;
  const next: FileChildOrder = {};
  let changed = false;

  for (const [key, names] of Object.entries(order)) {
    const dirPath = siblingKeyDirPath(key, workspacePath);
    if (dirPath === undefined) {
      next[key] = names;
      continue;
    }
    if (dirPath === oldPath || dirPath.startsWith(`${oldPath}/`)) {
      const nextDirPath = `${newPath}${dirPath.slice(oldPath.length)}`;
      next[childOrderKey(workspacePath, nextDirPath)] = names;
      changed = true;
      continue;
    }
    if (dirPath === oldParent.parent) {
      const renamed = replaceChildName(names, oldParent.name, newName);
      next[key] = renamed;
      changed = true;
      continue;
    }
    next[key] = names;
  }

  return changed ? next : order;
}

/** 删除目录后剔除顺序：移除目录自身/子孙的键，并从父目录顺序里去掉该名字。 */
export function dropChildOrderUnder(
  order: FileChildOrder,
  workspacePath: string,
  removedPath: string,
): FileChildOrder {
  const removed = splitDirPath(removedPath);
  const next: FileChildOrder = {};
  let changed = false;

  for (const [key, names] of Object.entries(order)) {
    const dirPath = siblingKeyDirPath(key, workspacePath);
    if (dirPath === undefined) {
      next[key] = names;
      continue;
    }
    if (dirPath === removedPath || dirPath.startsWith(`${removedPath}/`)) {
      changed = true;
      continue;
    }
    if (dirPath === removed.parent) {
      const filtered = names.filter((name) => name !== removed.name);
      next[key] = filtered;
      changed = true;
      continue;
    }
    next[key] = names;
  }

  return changed ? next : order;
}

/** 取出某个工作区的键对应的目录相对路径；不属于该工作区时返回 undefined。 */
function siblingKeyDirPath(key: string, workspacePath: string): string | undefined {
  const prefix = `${workspacePath}${KEY_SEPARATOR}`;
  return key.startsWith(prefix) ? key.slice(prefix.length) : undefined;
}
