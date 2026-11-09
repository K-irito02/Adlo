/**
 * 导出选择树：把 store 里的工作区书签 / 自建目录 / 书签条目摊成可勾选的树，
 * 并把勾选结果收敛成导出用的 TransferNode 树。
 *
 * 纯函数：不读 store、不做 IO。
 */
import type { BookmarkEntry, BookmarkFolder } from '@stores/slices/browserSlice';
import type { RecentWorkspaceEntry } from '@shared/ipc';
import type { TransferNode } from './bookmarkTransferTypes';

export interface BookmarkSelectionNode {
  /** `ws:<id>` / `folder:<id>` / `entry:<id>` */
  id: string;
  kind: 'workspace' | 'folder' | 'bookmark';
  name: string;
  url?: string;
  addedAt?: number;
  lastModifiedAt?: number;
  iconUri?: string;
  children: BookmarkSelectionNode[];
  /** 该子树下的书签条数（叶子恒为 1） */
  bookmarkCount: number;
}

function entryToNode(entry: BookmarkEntry): BookmarkSelectionNode {
  return {
    id: `entry:${entry.id}`,
    kind: 'bookmark',
    name: entry.title,
    url: entry.url,
    addedAt: entry.addedAt,
    lastModifiedAt: entry.lastModifiedAt,
    iconUri: entry.iconUri,
    children: [],
    bookmarkCount: 1,
  };
}

/**
 * 移除没有任何书签的目录（递归）：空目录、其下所有书签都为空的目录、以及空分类根。
 * 树里只剩有书签的路径，"不显示 + 不勾选 + 不导出"口径由这里统一。
 */
export function pruneEmptySelection(nodes: BookmarkSelectionNode[]): BookmarkSelectionNode[] {
  const out: BookmarkSelectionNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'bookmark') {
      out.push(node);
      continue;
    }
    const children = pruneEmptySelection(node.children);
    if (children.length === 0) {
      continue;
    }
    out.push({ ...node, children });
  }
  return out;
}

function buildFolderNode(folder: BookmarkFolder, folders: BookmarkFolder[]): BookmarkSelectionNode {
  const children: BookmarkSelectionNode[] = [
    ...(folder.entries ?? []).map(entryToNode),
    ...folders
      .filter((f) => f.parentId === folder.id && (!f.parentType || f.parentType === 'folder'))
      .map((child) => buildFolderNode(child, folders)),
  ];
  return {
    id: `folder:${folder.id}`,
    kind: 'folder',
    name: folder.name,
    children,
    bookmarkCount: children.reduce((sum, child) => sum + child.bookmarkCount, 0),
  };
}

/**
 * 两个分类根：工作区目录 / 自建目录，顺序与右侧导航器一致。
 */
export function buildBookmarkSelectionTree(input: {
  workspaces: RecentWorkspaceEntry[];
  folders: BookmarkFolder[];
  workspaceBookmarks: Record<string, BookmarkEntry[]>;
}): { workspaceRoot: BookmarkSelectionNode; folderRoot: BookmarkSelectionNode } {
  const workspaceChildren = input.workspaces.map((ws) => {
    const children: BookmarkSelectionNode[] = [
      ...(input.workspaceBookmarks[ws.id] ?? []).map(entryToNode),
      ...input.folders
        .filter((f) => f.parentType === 'workspace' && f.parentId === ws.id)
        .map((folder) => buildFolderNode(folder, input.folders)),
    ];
    return {
      id: `ws:${ws.id}`,
      kind: 'workspace' as const,
      name: ws.name || ws.path,
      children,
      bookmarkCount: children.reduce((sum, child) => sum + child.bookmarkCount, 0),
    };
  });

  const folderChildren = input.folders
    .filter((f) => !f.parentId)
    .map((folder) => buildFolderNode(folder, input.folders));

  return {
    workspaceRoot: {
      id: 'category:workspace',
      kind: 'folder',
      name: '',
      children: workspaceChildren,
      bookmarkCount: workspaceChildren.reduce((sum, child) => sum + child.bookmarkCount, 0),
    },
    folderRoot: {
      id: 'category:folder',
      kind: 'folder',
      name: '',
      children: folderChildren,
      bookmarkCount: folderChildren.reduce((sum, child) => sum + child.bookmarkCount, 0),
    },
  };
}

/** 勾选状态：全选 / 部分（后代有勾选）/ 未选。空子树恒为 `none`。 */
export function selectionStateOf(
  node: BookmarkSelectionNode,
  selected: ReadonlySet<string>,
): 'checked' | 'partial' | 'none' {
  if (node.kind === 'bookmark') {
    return selected.has(node.id) ? 'checked' : 'none';
  }
  const total = node.bookmarkCount;
  if (total === 0) {
    return 'none';
  }
  const picked = countSelected(node, selected);
  if (picked === 0) {
    return 'none';
  }
  return picked === total ? 'checked' : 'partial';
}

function countSelected(node: BookmarkSelectionNode, selected: ReadonlySet<string>): number {
  if (node.kind === 'bookmark') {
    return selected.has(node.id) ? 1 : 0;
  }
  let count = 0;
  for (const child of node.children) {
    count += countSelected(child, selected);
  }
  return count;
}

/** 收集子树里的全部书签叶子 id（用于"勾选整个目录"）。 */
export function collectLeafIds(node: BookmarkSelectionNode, out: string[] = []): string[] {
  if (node.kind === 'bookmark') {
    out.push(node.id);
    return out;
  }
  for (const child of node.children) {
    collectLeafIds(child, out);
  }
  return out;
}

/**
 * 导出时只接受真实网页：`about:` / `file:` / `javascript:` / 空值都跳过。
 * （导入侧有同一口径的白名单，见 `bookmarkHtml.ts`。）
 */
export function isExportableUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 把勾选结果收敛成导出树：
 * - 只保留含勾选项的目录，且保留完整祖先链
 * - 工作区节点导出为同名目录
 * - 空目录不产生节点
 */
export function buildExportNodes(
  node: BookmarkSelectionNode,
  selected: ReadonlySet<string>,
): TransferNode[] {
  const out: TransferNode[] = [];
  for (const child of node.children) {
    const childNodes = buildExportNodes(child, selected);
    if (child.kind === 'bookmark') {
      // 只导出真实可打开的网页：about:blank / 空 URL / 非 http(s) 一律跳过
      if (selected.has(child.id) && child.url && isExportableUrl(child.url)) {
        out.push({
          kind: 'bookmark',
          url: child.url,
          title: child.name,
          addedAt: child.addedAt ?? Date.now(),
          lastModifiedAt: child.lastModifiedAt ?? child.addedAt ?? Date.now(),
          ...(child.iconUri ? { icon: child.iconUri } : {}),
        });
      }
      continue;
    }
    if (childNodes.length === 0) {
      continue;
    }
    out.push({
      kind: 'folder',
      folder: { name: child.name, children: childNodes },
    });
  }
  return out;
}
