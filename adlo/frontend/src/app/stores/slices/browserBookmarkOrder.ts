import type { BookmarkEntry, BookmarkFolder } from './browserTypes';

/**
 * 书签树顺序模型。
 *
 * 书签文件夹与书签条目仍由 `browserBookmarkFolders` / `browserWorkspaceBookmarks`
 * 持有；这里只负责「容器 → 子项 key 顺序」与移动/排序的纯函数变换。
 * UI 与未来的智能体 mutation 共用这一层。
 */

export const CUSTOM_ROOT = 'custom:root';

export function folderContainerKey(folderId: string): string {
  return `folder:${folderId}`;
}

export function workspaceContainerKey(workspaceId: string): string {
  return `workspace:${workspaceId}`;
}

export function folderItemKey(folderId: string): string {
  return `folder:${folderId}`;
}

export function entryItemKey(entryId: string): string {
  return `entry:${entryId}`;
}

export interface BookmarkMoveState {
  browserBookmarkFolders: BookmarkFolder[];
  browserWorkspaceBookmarks: Record<string, BookmarkEntry[]>;
  browserBookmarkChildOrder: Record<string, string[]>;
  /** 已知工作区 id；提供时用于校验 `workspace:<id>` 目标是否存在。 */
  workspaceIds?: readonly string[];
}

export type BookmarkMove =
  | {
      kind: 'folder';
      id: string;
      target:
        | { kind: 'into'; container: string }
        | { kind: 'insert'; container: string; index: number }
        | { kind: 'new-root' };
    }
  | {
      kind: 'bookmark';
      id: string;
      target:
        | { kind: 'into'; container: string }
        | { kind: 'insert'; container: string; index: number };
    };

export type BookmarkMoveError =
  | 'folder-not-found'
  | 'bookmark-not-found'
  | 'target-missing'
  | 'folder-into-self'
  | 'folder-into-descendant'
  | 'bookmark-to-custom-root'
  | 'bookmark-duplicate';

export type BookmarkChildRef =
  | { kind: 'folder'; id: string; key: string; name: string }
  | { kind: 'entry'; id: string; key: string; name: string; url: string };

export type BookmarkMoveResult =
  | { ok: true; state: BookmarkMoveState }
  | { ok: false; error: BookmarkMoveError };

function parseContainer(
  container: string,
): { kind: 'custom' } | { kind: 'folder'; id: string } | { kind: 'workspace'; id: string } | null {
  if (container === CUSTOM_ROOT) {
    return { kind: 'custom' };
  }
  if (container.startsWith('folder:')) {
    return { kind: 'folder', id: container.slice('folder:'.length) };
  }
  if (container.startsWith('workspace:')) {
    return { kind: 'workspace', id: container.slice('workspace:'.length) };
  }
  return null;
}

function folderChildren(folders: BookmarkFolder[], container: string): BookmarkFolder[] {
  const parsed = parseContainer(container);
  if (!parsed) {
    return [];
  }
  if (parsed.kind === 'custom') {
    return folders.filter((folder) => !folder.parentId);
  }
  if (parsed.kind === 'folder') {
    return folders.filter(
      (folder) =>
        folder.parentId === parsed.id && (!folder.parentType || folder.parentType === 'folder'),
    );
  }
  return folders.filter(
    (folder) => folder.parentId === parsed.id && folder.parentType === 'workspace',
  );
}

function entryChildren(
  folders: BookmarkFolder[],
  workspaceBookmarks: Record<string, BookmarkEntry[]>,
  container: string,
): BookmarkEntry[] {
  const parsed = parseContainer(container);
  if (!parsed) {
    return [];
  }
  if (parsed.kind === 'folder') {
    return folders.find((folder) => folder.id === parsed.id)?.entries ?? [];
  }
  if (parsed.kind === 'workspace') {
    return workspaceBookmarks[parsed.id] ?? [];
  }
  return [];
}

/**
 * 容器的显示顺序：没有顺序表时目录在前、书签在后；有顺序表时按表，
 * 未列出的子项按默认顺序追加到末尾。
 */
export function resolveContainerChildren(
  state: Pick<
    BookmarkMoveState,
    'browserBookmarkFolders' | 'browserWorkspaceBookmarks' | 'browserBookmarkChildOrder'
  >,
  container: string,
): BookmarkChildRef[] {
  const folders = folderChildren(state.browserBookmarkFolders, container);
  const entries = entryChildren(
    state.browserBookmarkFolders,
    state.browserWorkspaceBookmarks,
    container,
  );

  const all: BookmarkChildRef[] = [
    ...folders.map((folder) => ({
      kind: 'folder' as const,
      id: folder.id,
      key: folderItemKey(folder.id),
      name: folder.name,
    })),
    ...entries.map((entry) => ({
      kind: 'entry' as const,
      id: entry.id,
      key: entryItemKey(entry.id),
      name: entry.title,
      url: entry.url,
    })),
  ];

  const order = state.browserBookmarkChildOrder[container];
  if (!order || order.length === 0) {
    return all;
  }

  const remaining = new Map(all.map((child) => [child.key, child]));
  const ordered: BookmarkChildRef[] = [];
  for (const key of order) {
    const child = remaining.get(key);
    if (child) {
      ordered.push(child);
      remaining.delete(key);
    }
  }
  for (const child of all) {
    if (remaining.has(child.key)) {
      ordered.push(child);
    }
  }
  return ordered;
}

function isDescendantFolder(
  folders: BookmarkFolder[],
  ancestorId: string,
  candidateId: string,
): boolean {
  let current = folders.find((folder) => folder.id === candidateId);
  const visited = new Set<string>();
  while (current?.parentId) {
    if (visited.has(current.id)) {
      return false;
    }
    visited.add(current.id);
    if (current.parentId === ancestorId) {
      return true;
    }
    current = folders.find((folder) => folder.id === current?.parentId);
  }
  return false;
}

function sourceContainerOf(state: BookmarkMoveState, move: BookmarkMove): string | null {
  if (move.kind === 'folder') {
    const folder = state.browserBookmarkFolders.find((item) => item.id === move.id);
    if (!folder) {
      return null;
    }
    if (folder.parentType === 'workspace' && folder.parentId) {
      return workspaceContainerKey(folder.parentId);
    }
    if (folder.parentId) {
      return folderContainerKey(folder.parentId);
    }
    return CUSTOM_ROOT;
  }
  for (const folder of state.browserBookmarkFolders) {
    if (folder.entries?.some((entry) => entry.id === move.id)) {
      return folderContainerKey(folder.id);
    }
  }
  for (const [workspaceId, entries] of Object.entries(state.browserWorkspaceBookmarks)) {
    if (entries.some((entry) => entry.id === move.id)) {
      return workspaceContainerKey(workspaceId);
    }
  }
  return null;
}

function removeKeyFromOrder(
  order: Record<string, string[]>,
  key: string,
): Record<string, string[]> {
  const next: Record<string, string[]> = {};
  for (const [container, keys] of Object.entries(order)) {
    const filtered = keys.filter((item) => item !== key);
    if (filtered.length > 0) {
      next[container] = filtered;
    }
  }
  return next;
}

function setContainerOrder(
  order: Record<string, string[]>,
  container: string,
  keys: string[],
): Record<string, string[]> {
  const next = { ...order };
  if (keys.length > 0) {
    next[container] = keys;
  } else {
    delete next[container];
  }
  return next;
}

function setFolderParent(folder: BookmarkFolder, targetContainer: string): void {
  const parsed = parseContainer(targetContainer);
  if (!parsed || parsed.kind === 'custom') {
    folder.parentId = undefined;
    folder.parentType = undefined;
    return;
  }
  folder.parentId = parsed.id;
  folder.parentType = parsed.kind;
}

function detachEntry(
  folders: BookmarkFolder[],
  workspaceBookmarks: Record<string, BookmarkEntry[]>,
  entryId: string,
): {
  entry: BookmarkEntry;
  folders: BookmarkFolder[];
  workspaceBookmarks: Record<string, BookmarkEntry[]>;
} | null {
  for (let index = 0; index < folders.length; index += 1) {
    const folder = folders[index];
    const entryIndex = folder.entries?.findIndex((entry) => entry.id === entryId) ?? -1;
    if (entryIndex >= 0) {
      const entries = [...(folder.entries ?? [])];
      const [entry] = entries.splice(entryIndex, 1);
      const nextFolders = folders.map((item, itemIndex) =>
        itemIndex === index ? { ...item, entries } : item,
      );
      return { entry, folders: nextFolders, workspaceBookmarks };
    }
  }

  for (const [workspaceId, entries] of Object.entries(workspaceBookmarks)) {
    const entryIndex = entries.findIndex((entry) => entry.id === entryId);
    if (entryIndex >= 0) {
      const nextEntries = [...entries];
      const [entry] = nextEntries.splice(entryIndex, 1);
      const nextWorkspaceBookmarks = { ...workspaceBookmarks };
      if (nextEntries.length > 0) {
        nextWorkspaceBookmarks[workspaceId] = nextEntries;
      } else {
        delete nextWorkspaceBookmarks[workspaceId];
      }
      return { entry, folders, workspaceBookmarks: nextWorkspaceBookmarks };
    }
  }
  return null;
}

function attachEntry(
  folders: BookmarkFolder[],
  workspaceBookmarks: Record<string, BookmarkEntry[]>,
  container: string,
  entry: BookmarkEntry,
): { folders: BookmarkFolder[]; workspaceBookmarks: Record<string, BookmarkEntry[]> } {
  const parsed = parseContainer(container);
  if (!parsed) {
    return { folders, workspaceBookmarks };
  }
  if (parsed.kind === 'folder') {
    return {
      folders: folders.map((folder) =>
        folder.id === parsed.id
          ? { ...folder, entries: [...(folder.entries ?? []), entry] }
          : folder,
      ),
      workspaceBookmarks,
    };
  }
  if (parsed.kind === 'workspace') {
    return {
      folders,
      workspaceBookmarks: {
        ...workspaceBookmarks,
        [parsed.id]: [...(workspaceBookmarks[parsed.id] ?? []), entry],
      },
    };
  }
  return { folders, workspaceBookmarks };
}

function findEntryById(state: BookmarkMoveState, entryId: string): BookmarkEntry | null {
  for (const folder of state.browserBookmarkFolders) {
    const entry = folder.entries?.find((item) => item.id === entryId);
    if (entry) {
      return entry;
    }
  }
  for (const entries of Object.values(state.browserWorkspaceBookmarks)) {
    const entry = entries.find((item) => item.id === entryId);
    if (entry) {
      return entry;
    }
  }
  return null;
}

function containerEntries(state: BookmarkMoveState, container: string): BookmarkEntry[] {
  const parsed = parseContainer(container);
  if (!parsed) {
    return [];
  }
  if (parsed.kind === 'folder') {
    return state.browserBookmarkFolders.find((folder) => folder.id === parsed.id)?.entries ?? [];
  }
  if (parsed.kind === 'workspace') {
    return state.browserWorkspaceBookmarks[parsed.id] ?? [];
  }
  return [];
}

function validateMove(state: BookmarkMoveState, move: BookmarkMove): BookmarkMoveError | null {
  if (move.kind === 'folder') {
    const folder = state.browserBookmarkFolders.find((item) => item.id === move.id);
    if (!folder) {
      return 'folder-not-found';
    }
    if (move.target.kind === 'new-root') {
      return null;
    }
    const container = move.target.container;
    if (container === CUSTOM_ROOT) {
      return null;
    }
    const parsed = parseContainer(container);
    if (!parsed || parsed.kind === 'custom') {
      return 'target-missing';
    }
    if (parsed.kind === 'folder') {
      if (!state.browserBookmarkFolders.some((item) => item.id === parsed.id)) {
        return 'target-missing';
      }
      if (parsed.id === folder.id) {
        return 'folder-into-self';
      }
      if (isDescendantFolder(state.browserBookmarkFolders, folder.id, parsed.id)) {
        return 'folder-into-descendant';
      }
    }
    if (
      parsed.kind === 'workspace' &&
      state.workspaceIds &&
      !state.workspaceIds.includes(parsed.id)
    ) {
      return 'target-missing';
    }
    return null;
  }

  const exists =
    state.browserBookmarkFolders.some((folder) =>
      folder.entries?.some((entry) => entry.id === move.id),
    ) ||
    Object.values(state.browserWorkspaceBookmarks).some((entries) =>
      entries.some((entry) => entry.id === move.id),
    );
  if (!exists) {
    return 'bookmark-not-found';
  }
  if (move.target.container === CUSTOM_ROOT) {
    return 'bookmark-to-custom-root';
  }
  const parsed = parseContainer(move.target.container);
  if (!parsed || parsed.kind === 'custom') {
    return 'target-missing';
  }
  if (
    parsed.kind === 'folder' &&
    !state.browserBookmarkFolders.some((item) => item.id === parsed.id)
  ) {
    return 'target-missing';
  }
  if (
    parsed.kind === 'workspace' &&
    state.workspaceIds &&
    !state.workspaceIds.includes(parsed.id)
  ) {
    return 'target-missing';
  }
  const entry = findEntryById(state, move.id);
  if (!entry) {
    return 'bookmark-not-found';
  }
  const duplicate = containerEntries(state, move.target.container).some(
    (item) => item.id !== move.id && item.url === entry.url && item.title === entry.title,
  );
  return duplicate ? 'bookmark-duplicate' : null;
}

export function validateBookmarkMove(
  state: BookmarkMoveState,
  move: BookmarkMove,
): BookmarkMoveError | null {
  return validateMove(state, move);
}

export function applyBookmarkMove(
  state: BookmarkMoveState,
  move: BookmarkMove,
): BookmarkMoveResult {
  const error = validateMove(state, move);
  if (error) {
    return { ok: false, error };
  }

  const source = sourceContainerOf(state, move);
  if (!source) {
    return { ok: false, error: move.kind === 'folder' ? 'folder-not-found' : 'bookmark-not-found' };
  }

  const draggedKey = move.kind === 'folder' ? folderItemKey(move.id) : entryItemKey(move.id);

  if (move.target.kind === 'new-root') {
    if (move.kind !== 'folder') {
      return { ok: false, error: 'bookmark-to-custom-root' };
    }
    const folder = state.browserBookmarkFolders.find((item) => item.id === move.id);
    if (!folder) {
      return { ok: false, error: 'folder-not-found' };
    }
    const preKeys = resolveContainerChildren(state, CUSTOM_ROOT).map((child) => child.key);
    const nextFolders = state.browserBookmarkFolders.map((item) =>
      item.id === folder.id ? { ...item, parentId: undefined, parentType: undefined } : item,
    );
    const withoutKey = removeKeyFromOrder(state.browserBookmarkChildOrder, draggedKey);
    const keys = preKeys.filter((key) => key !== draggedKey);
    keys.push(draggedKey);
    let nextOrder = setContainerOrder(withoutKey, CUSTOM_ROOT, keys);
    if (source !== CUSTOM_ROOT) {
      const sourceChildren = resolveContainerChildren(
        {
          browserBookmarkFolders: nextFolders,
          browserWorkspaceBookmarks: state.browserWorkspaceBookmarks,
          browserBookmarkChildOrder: nextOrder,
        },
        source,
      ).map((child) => child.key);
      nextOrder = setContainerOrder(nextOrder, source, sourceChildren);
    }
    return {
      ok: true,
      state: {
        browserBookmarkFolders: nextFolders,
        browserWorkspaceBookmarks: state.browserWorkspaceBookmarks,
        browserBookmarkChildOrder: nextOrder,
        workspaceIds: state.workspaceIds,
      },
    };
  }

  const targetContainer = move.target.container;
  const preChildren = resolveContainerChildren(state, targetContainer);
  const preKeys = preChildren.map((child) => child.key);
  let insertIndex = move.target.kind === 'into' ? preKeys.length : move.target.index;
  const oldIndex = preKeys.indexOf(draggedKey);
  if (oldIndex >= 0 && oldIndex < insertIndex) {
    insertIndex -= 1;
  }

  let nextFolders = state.browserBookmarkFolders;
  let nextWorkspaceBookmarks = state.browserWorkspaceBookmarks;

  if (move.kind === 'folder') {
    nextFolders = state.browserBookmarkFolders.map((folder) => {
      if (folder.id !== move.id) {
        return folder;
      }
      const next = { ...folder };
      setFolderParent(next, targetContainer);
      return next;
    });
  } else {
    const detached = detachEntry(
      state.browserBookmarkFolders,
      state.browserWorkspaceBookmarks,
      move.id,
    );
    if (!detached) {
      return { ok: false, error: 'bookmark-not-found' };
    }
    const attached = attachEntry(
      detached.folders,
      detached.workspaceBookmarks,
      targetContainer,
      detached.entry,
    );
    nextFolders = attached.folders;
    nextWorkspaceBookmarks = attached.workspaceBookmarks;
  }

  const withoutKey = removeKeyFromOrder(state.browserBookmarkChildOrder, draggedKey);
  const keys = preKeys.filter((key) => key !== draggedKey);
  const safeIndex = Math.max(0, Math.min(insertIndex, keys.length));
  keys.splice(safeIndex, 0, draggedKey);
  let nextOrder = setContainerOrder(withoutKey, targetContainer, keys);

  if (source !== targetContainer) {
    const sourceChildren = resolveContainerChildren(
      {
        browserBookmarkFolders: nextFolders,
        browserWorkspaceBookmarks: nextWorkspaceBookmarks,
        browserBookmarkChildOrder: nextOrder,
      },
      source,
    ).map((child) => child.key);
    nextOrder = setContainerOrder(nextOrder, source, sourceChildren);
  }

  return {
    ok: true,
    state: {
      browserBookmarkFolders: nextFolders,
      browserWorkspaceBookmarks: nextWorkspaceBookmarks,
      browserBookmarkChildOrder: nextOrder,
      workspaceIds: state.workspaceIds,
    },
  };
}
