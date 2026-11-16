/**
 * PROTOTYPE ONLY — 浏览器面板拖拽交互原型的数据模型。
 *
 * 目标：在不碰生产 store 的前提下，验证「混合排序 + 默认目录在前 + 跨分类移动」
 * 的规则是否顺手。顺序用「容器 → 子项 key 数组」表达（与正式方案的候选模型一致），
 * 方便后续由智能体通过 mutation 批量整理。
 *
 * 不要把这个文件当成生产实现；选定方案后会重写。
 */

export interface BookmarkEntry {
  id: string;
  title: string;
  url: string;
}

export interface BookmarkFolder {
  id: string;
  name: string;
  parentId?: string;
  parentType?: 'workspace' | 'folder';
  entries: BookmarkEntry[];
}

export interface Workspace {
  id: string;
  name: string;
}

export interface BrowserTab {
  id: string;
  title: string;
  url: string;
  pinned: boolean;
}

export interface OrderState {
  version: 1;
  containers: Record<string, string[]>;
}

export interface TreeState {
  workspaces: Workspace[];
  folders: BookmarkFolder[];
  workspaceBookmarks: Record<string, BookmarkEntry[]>;
  order: OrderState;
  tabs: BrowserTab[];
}

export interface ChildRef {
  kind: 'folder' | 'entry';
  id: string;
  key: string;
  name: string;
  url?: string;
}

export type DragPayload =
  | { kind: 'folder'; id: string; label: string }
  | { kind: 'entry'; id: string; label: string }
  | { kind: 'tab'; id: string; label: string; pinned: boolean };

export type DropTarget =
  | { kind: 'into'; container: string }
  | { kind: 'insert'; container: string; index: number }
  | { kind: 'new-root' }
  | { kind: 'tab'; index: number };

export type MoveResult =
  | { ok: true; state: TreeState; message: string }
  | { ok: false; reason: string };

export const CUSTOM_ROOT = 'custom:root';

export function folderContainer(folderId: string): string {
  return `folder:${folderId}`;
}

export function workspaceContainer(workspaceId: string): string {
  return `workspace:${workspaceId}`;
}

export function folderKey(folderId: string): string {
  return `folder:${folderId}`;
}

export function entryKey(entryId: string): string {
  return `entry:${entryId}`;
}

export function createInitialState(): TreeState {
  const react = { id: 'e-react', title: 'React 官方文档', url: 'react.dev' };
  const mdn = { id: 'e-mdn', title: 'MDN Web Docs', url: 'developer.mozilla.org' };
  const storybook = { id: 'e-storybook', title: 'Storybook', url: 'storybook.js.org' };
  const rustBook = { id: 'e-rustbook', title: 'Rust Book', url: 'doc.rust-lang.org/book' };
  const crates = { id: 'e-crates', title: 'crates.io', url: 'crates.io' };
  const dribbble = { id: 'e-dribbble', title: 'Dribbble', url: 'dribbble.com' };
  const lucide = { id: 'e-lucide', title: 'Lucide Icons', url: 'lucide.dev' };
  const hn = { id: 'e-hn', title: 'Hacker News', url: 'news.ycombinator.com' };
  const lobsters = { id: 'e-lobsters', title: 'Lobsters', url: 'lobste.rs' };
  const arxiv = { id: 'e-arxiv', title: 'arXiv · AI', url: 'arxiv.org/list/cs.AI' };
  const github = { id: 'e-github', title: 'GitHub', url: 'github.com' };
  const linear = { id: 'e-linear', title: 'Linear', url: 'linear.app' };

  return {
    workspaces: [
      { id: 'ws-adlo', name: 'Adlo' },
      { id: 'ws-scratch', name: 'scratch' },
    ],
    folders: [
      {
        id: 'f-frontend',
        name: '前端',
        parentType: 'workspace',
        parentId: 'ws-adlo',
        entries: [react, mdn],
      },
      {
        id: 'f-components',
        name: '组件库',
        parentType: 'folder',
        parentId: 'f-frontend',
        entries: [storybook],
      },
      {
        id: 'f-rust',
        name: 'Rust 资料',
        parentType: 'workspace',
        parentId: 'ws-scratch',
        entries: [rustBook],
      },
      { id: 'f-design', name: '设计参考', entries: [dribbble] },
      {
        id: 'f-icons',
        name: '图标库',
        parentType: 'folder',
        parentId: 'f-design',
        entries: [lucide],
      },
      { id: 'f-reading', name: '阅读清单', entries: [hn, lobsters] },
      {
        id: 'f-reading-ai',
        name: 'AI 阅读',
        parentType: 'folder',
        parentId: 'f-reading',
        entries: [arxiv],
      },
      { id: 'f-empty', name: '待整理', entries: [] },
    ],
    workspaceBookmarks: {
      'ws-adlo': [github, linear],
      'ws-scratch': [crates],
    },
    order: {
      version: 1,
      containers: {
        // 预置一个「手动混合顺序」，用来对比默认的目录在前。
        [folderContainer('f-frontend')]: [
          entryKey('e-react'),
          folderKey('f-components'),
          entryKey('e-mdn'),
        ],
        [CUSTOM_ROOT]: [folderKey('f-design'), folderKey('f-reading'), folderKey('f-empty')],
      },
    },
    tabs: [
      { id: 't-gmail', title: 'Gmail', url: 'mail.google.com', pinned: true },
      { id: 't-github', title: 'GitHub · Adlo', url: 'github.com', pinned: true },
      { id: 't-mdn', title: 'MDN Web Docs', url: 'developer.mozilla.org', pinned: false },
      { id: 't-figma', title: 'Figma', url: 'figma.com', pinned: false },
      { id: 't-hn', title: 'Hacker News', url: 'news.ycombinator.com', pinned: false },
      {
        id: 't-rust',
        title: 'The Rust Programming Language',
        url: 'doc.rust-lang.org',
        pinned: false,
      },
    ],
  };
}

export function containerExists(state: TreeState, container: string): boolean {
  if (container === CUSTOM_ROOT) {
    return true;
  }
  if (container.startsWith('folder:')) {
    return state.folders.some((folder) => folderContainer(folder.id) === container);
  }
  if (container.startsWith('workspace:')) {
    return state.workspaces.some((workspace) => workspaceContainer(workspace.id) === container);
  }
  return false;
}

export function containerLabel(state: TreeState, container: string): string {
  if (container === CUSTOM_ROOT) {
    return '自建目录';
  }
  if (container.startsWith('folder:')) {
    const id = container.slice('folder:'.length);
    return state.folders.find((folder) => folder.id === id)?.name ?? '目录';
  }
  if (container.startsWith('workspace:')) {
    const id = container.slice('workspace:'.length);
    return state.workspaces.find((workspace) => workspace.id === id)?.name ?? '工作区';
  }
  return container;
}

export function getContainerChildren(state: TreeState, container: string): ChildRef[] {
  let folders: BookmarkFolder[] = [];
  let entries: BookmarkEntry[] = [];

  if (container === CUSTOM_ROOT) {
    folders = state.folders.filter((folder) => !folder.parentId);
  } else if (container.startsWith('folder:')) {
    const id = container.slice('folder:'.length);
    folders = state.folders.filter(
      (folder) => folder.parentId === id && (!folder.parentType || folder.parentType === 'folder'),
    );
    const folder = state.folders.find((item) => item.id === id);
    entries = folder?.entries ?? [];
  } else if (container.startsWith('workspace:')) {
    const id = container.slice('workspace:'.length);
    folders = state.folders.filter(
      (folder) => folder.parentId === id && folder.parentType === 'workspace',
    );
    entries = state.workspaceBookmarks[id] ?? [];
  }

  // 默认顺序 = 目录在前、书签在后；有手动顺序表时以表为准，未列出的项追加在末尾。
  const all: ChildRef[] = [
    ...folders.map((folder) => ({
      kind: 'folder' as const,
      id: folder.id,
      key: folderKey(folder.id),
      name: folder.name,
    })),
    ...entries.map((entry) => ({
      kind: 'entry' as const,
      id: entry.id,
      key: entryKey(entry.id),
      name: entry.title,
      url: entry.url,
    })),
  ];

  const order = state.order.containers[container];
  if (!order || order.length === 0) {
    return all;
  }

  const remaining = new Map(all.map((child) => [child.key, child]));
  const ordered: ChildRef[] = [];
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

export function isDescendantFolder(
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

export function findFolder(state: TreeState, folderId: string): BookmarkFolder | undefined {
  return state.folders.find((folder) => folder.id === folderId);
}

export function findEntry(state: TreeState, entryId: string): BookmarkEntry | undefined {
  for (const folder of state.folders) {
    const entry = folder.entries.find((item) => item.id === entryId);
    if (entry) {
      return entry;
    }
  }
  for (const entries of Object.values(state.workspaceBookmarks)) {
    const entry = entries.find((item) => item.id === entryId);
    if (entry) {
      return entry;
    }
  }
  return undefined;
}

function sourceContainerOf(state: TreeState, drag: DragPayload): string | null {
  if (drag.kind === 'folder') {
    const folder = findFolder(state, drag.id);
    if (!folder) {
      return null;
    }
    if (folder.parentType === 'workspace' && folder.parentId) {
      return workspaceContainer(folder.parentId);
    }
    if (folder.parentId) {
      return folderContainer(folder.parentId);
    }
    return CUSTOM_ROOT;
  }
  if (drag.kind === 'entry') {
    for (const folder of state.folders) {
      if (folder.entries.some((entry) => entry.id === drag.id)) {
        return folderContainer(folder.id);
      }
    }
    for (const [workspaceId, entries] of Object.entries(state.workspaceBookmarks)) {
      if (entries.some((entry) => entry.id === drag.id)) {
        return workspaceContainer(workspaceId);
      }
    }
  }
  return null;
}

export function validateMove(
  state: TreeState,
  drag: DragPayload,
  target: DropTarget,
): { ok: true } | { ok: false; reason: string } {
  if (drag.kind === 'tab') {
    return { ok: false, reason: '标签页只能在「已打开标签页」列表内排序' };
  }
  if (target.kind === 'tab') {
    return { ok: false, reason: '书签不能拖进标签页列表' };
  }

  if (target.kind === 'new-root') {
    if (drag.kind === 'entry') {
      return { ok: false, reason: '书签不能变成顶级目录' };
    }
    return { ok: true };
  }

  if (!containerExists(state, target.container)) {
    return { ok: false, reason: '目标位置不可用' };
  }
  if (drag.kind === 'entry' && target.container === CUSTOM_ROOT) {
    return { ok: false, reason: '书签不能直接放在分类根下' };
  }

  if (drag.kind === 'folder') {
    const folder = findFolder(state, drag.id);
    if (!folder) {
      return { ok: false, reason: '目录不存在' };
    }
    if (target.container === folderContainer(folder.id)) {
      return { ok: false, reason: '不能把目录放进它自己' };
    }
    if (target.container.startsWith('folder:')) {
      const parentId = target.container.slice('folder:'.length);
      if (isDescendantFolder(state.folders, folder.id, parentId)) {
        return { ok: false, reason: '不能把目录放进它自己的子目录' };
      }
    }
  }

  return { ok: true };
}

function removeKeyFromOrder(state: TreeState, key: string): void {
  for (const [container, keys] of Object.entries(state.order.containers)) {
    state.order.containers[container] = keys.filter((item) => item !== key);
  }
}

function normalizeOrder(state: TreeState, container: string): void {
  const keys = getContainerChildren(state, container).map((child) => child.key);
  if (keys.length === 0) {
    delete state.order.containers[container];
    return;
  }
  state.order.containers[container] = keys;
}

function setFolderParent(folder: BookmarkFolder, targetContainer: string): void {
  if (targetContainer === CUSTOM_ROOT) {
    folder.parentId = undefined;
    folder.parentType = undefined;
    return;
  }
  if (targetContainer.startsWith('folder:')) {
    folder.parentId = targetContainer.slice('folder:'.length);
    folder.parentType = 'folder';
    return;
  }
  if (targetContainer.startsWith('workspace:')) {
    folder.parentId = targetContainer.slice('workspace:'.length);
    folder.parentType = 'workspace';
  }
}

function detachEntry(state: TreeState, entryId: string): BookmarkEntry | null {
  for (const folder of state.folders) {
    const index = folder.entries.findIndex((entry) => entry.id === entryId);
    if (index >= 0) {
      const [entry] = folder.entries.splice(index, 1);
      return entry;
    }
  }
  for (const [workspaceId, entries] of Object.entries(state.workspaceBookmarks)) {
    const index = entries.findIndex((entry) => entry.id === entryId);
    if (index >= 0) {
      const [entry] = entries.splice(index, 1);
      if (entries.length === 0) {
        delete state.workspaceBookmarks[workspaceId];
      }
      return entry;
    }
  }
  return null;
}

function attachEntry(state: TreeState, container: string, entry: BookmarkEntry): void {
  if (container.startsWith('folder:')) {
    const folder = findFolder(state, container.slice('folder:'.length));
    if (folder) {
      folder.entries.push(entry);
    }
    return;
  }
  if (container.startsWith('workspace:')) {
    const workspaceId = container.slice('workspace:'.length);
    state.workspaceBookmarks[workspaceId] = [
      ...(state.workspaceBookmarks[workspaceId] ?? []),
      entry,
    ];
  }
}

export function applyMove(state: TreeState, drag: DragPayload, target: DropTarget): MoveResult {
  if (drag.kind === 'tab') {
    return applyTabMove(state, drag, target);
  }
  if (target.kind === 'tab') {
    return { ok: false, reason: '书签不能拖进标签页列表' };
  }

  const check = validateMove(state, drag, target);
  if (!check.ok) {
    return { ok: false, reason: check.reason };
  }

  const next = structuredClone(state);
  const source = sourceContainerOf(state, drag);
  if (!source) {
    return { ok: false, reason: '找不到被拖拽项' };
  }

  const draggedKey = drag.kind === 'folder' ? folderKey(drag.id) : entryKey(drag.id);

  if (target.kind === 'new-root') {
    if (drag.kind !== 'folder') {
      return { ok: false, reason: '书签不能变成顶级目录' };
    }
    const folder = next.folders.find((item) => item.id === drag.id);
    if (!folder) {
      return { ok: false, reason: '目录不存在' };
    }
    const before = getContainerChildren(state, CUSTOM_ROOT).map((child) => child.key);
    if (folder.parentId || folder.parentType) {
      folder.parentId = undefined;
      folder.parentType = undefined;
    }
    removeKeyFromOrder(next, draggedKey);
    const keys = before.filter((key) => key !== draggedKey);
    keys.push(draggedKey);
    next.order.containers[CUSTOM_ROOT] = keys;
    if (source !== CUSTOM_ROOT) {
      normalizeOrder(next, source);
    }
    return { ok: true, state: next, message: `已将「${folder.name}」变成自建目录的顶级目录` };
  }

  const targetContainer = target.container;
  const preChildren = getContainerChildren(state, targetContainer);
  let insertIndex = target.kind === 'into' ? preChildren.length : target.index;
  const preKeys = preChildren.map((child) => child.key);
  const oldIndex = preKeys.indexOf(draggedKey);
  if (oldIndex >= 0 && oldIndex < insertIndex) {
    insertIndex -= 1;
  }

  let label = '';

  if (drag.kind === 'folder') {
    const folder = next.folders.find((item) => item.id === drag.id);
    if (!folder) {
      return { ok: false, reason: '目录不存在' };
    }
    label = folder.name;
    setFolderParent(folder, targetContainer);
  } else {
    const entry = detachEntry(next, drag.id);
    if (!entry) {
      return { ok: false, reason: '书签不存在' };
    }
    label = entry.title;
    attachEntry(next, targetContainer, entry);
  }

  removeKeyFromOrder(next, draggedKey);
  const keys = preKeys.filter((key) => key !== draggedKey);
  const safeIndex = Math.max(0, Math.min(insertIndex, keys.length));
  keys.splice(safeIndex, 0, draggedKey);
  next.order.containers[targetContainer] = keys;
  if (source !== targetContainer) {
    normalizeOrder(next, source);
  }

  const verb = target.kind === 'into' ? '放入' : '移到';
  return {
    ok: true,
    state: next,
    message: `已将「${label}」${verb}「${containerLabel(next, targetContainer)}」`,
  };
}

export function sortTabs(tabs: BrowserTab[]): BrowserTab[] {
  return [...tabs].sort((a, b) => {
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }
    return 0;
  });
}

export function validateTabMove(
  tabs: BrowserTab[],
  tabId: string,
  index: number,
): { ok: true } | { ok: false; reason: string } {
  const visible = sortTabs(tabs);
  const dragged = visible.find((tab) => tab.id === tabId);
  if (!dragged) {
    return { ok: false, reason: '标签页不存在' };
  }
  const pinnedCount = visible.filter((tab) => tab.pinned).length;
  // 边界（pinnedCount）对两类都合法：固定标签落在固定组末尾，普通标签落在普通组开头。
  if (dragged.pinned && index > pinnedCount) {
    return { ok: false, reason: '固定标签不能拖进普通标签区' };
  }
  if (!dragged.pinned && index < pinnedCount) {
    return { ok: false, reason: '普通标签不能拖进固定标签区' };
  }
  return { ok: true };
}

function applyTabMove(
  state: TreeState,
  drag: Extract<DragPayload, { kind: 'tab' }>,
  target: DropTarget,
): MoveResult {
  if (target.kind !== 'tab') {
    return { ok: false, reason: '标签页只能拖到标签页列表' };
  }
  const check = validateTabMove(state.tabs, drag.id, target.index);
  if (!check.ok) {
    return { ok: false, reason: check.reason };
  }
  const visible = sortTabs(state.tabs);
  const from = visible.findIndex((tab) => tab.id === drag.id);
  if (from < 0) {
    return { ok: false, reason: '标签页不存在' };
  }
  const [moved] = visible.splice(from, 1);
  let insertIndex = target.index;
  if (from < insertIndex) {
    insertIndex -= 1;
  }
  visible.splice(Math.max(0, Math.min(insertIndex, visible.length)), 0, moved);
  return {
    ok: true,
    state: { ...state, tabs: visible },
    message: '已调整标签页顺序',
  };
}
