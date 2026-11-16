/**
 * PROTOTYPE ONLY — 浏览器面板拖拽交互原型。
 *
 * 4 套放置区/反馈方案，同一份 mock 数据、同一套规则：
 *   A 行三分区 · B 行间缝隙 · C 意图延迟 · D A + 幽灵占位
 *
 * 这是用来做设计决策的临时代码，不是生产实现；选定方案后删除/重写。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import {
  IconBookmarkStar,
  IconChevronDown,
  IconChevronRight,
  IconClose,
  IconFolder,
  IconFolderOpen,
  IconHistory,
  IconList,
  IconPin,
} from '@icons';
import {
  applyMove,
  CUSTOM_ROOT,
  containerLabel,
  createInitialState,
  findEntry,
  folderContainer,
  getContainerChildren,
  sortTabs,
  validateMove,
  validateTabMove,
  workspaceContainer,
} from './model';
import type {
  BookmarkEntry,
  BookmarkFolder,
  BrowserTab,
  DragPayload,
  DropTarget,
  TreeState,
  Workspace,
} from './model';
import './prototype.css';

const VARIANTS = ['A', 'B', 'C', 'D'] as const;
type Variant = (typeof VARIANTS)[number];

/** 用户已选定：A 的行三分区 + D 的幽灵占位（即方案 D）。 */
const SELECTED_VARIANT: Variant = 'D';

interface VariantMeta {
  name: string;
  description: string;
  hint: string;
}

const VARIANT_META: Record<Variant, VariantMeta> = {
  A: {
    name: '行三分区',
    description: '目录行上/下 20% 是排序插入，中间 60% 是放入。',
    hint: '最宽容：不用瞄准缝隙，行内就能同时完成排序与放入。',
  },
  B: {
    name: '行间缝隙',
    description: '目录行整行是放入，行与行之间 8px 缝隙是排序插入，末端有“放到末尾”带。',
    hint: '最接近资源管理器：误放少，但排序要瞄准行间缝隙。',
  },
  C: {
    name: '意图延迟',
    description: '快速划过只显示插入线；在目录行停留 500ms 才升级为放入高亮。',
    hint: '防手抖：第一次用会感觉“放入”慢半拍。',
  },
  D: {
    name: '幽灵占位',
    description: '采用 A 的分区，但排序时显示半透明占位行，放入时显示虚线幽灵子行。',
    hint: '最直观：松手前就能看到最终落点。',
  },
};

const MIME = 'application/x-adl-prototype';
const TOAST_MS = 2600;
const AUTO_EXPAND_MS = 600;
const INTENT_MS = 500;

const INITIAL_EXPANDED: Record<string, boolean> = {
  'workspace:ws-adlo': true,
  'workspace:ws-scratch': true,
  'folder:f-frontend': true,
  'folder:f-design': true,
  'folder:f-reading': false,
};

type DropView =
  | { kind: 'into'; container: string; rowKey: string; label: string }
  | { kind: 'insert'; container: string; index: number; rowKey: string; label: string }
  | { kind: 'new-root'; rowKey: string; label: string }
  | { kind: 'tab'; index: number; rowKey: string; label: string }
  | { kind: 'invalid'; reason: string; rowKey: string; label: string };

type Row =
  | {
      type: 'category';
      key: string;
      category: 'workspace' | 'custom' | 'history';
      label: string;
      count: number;
    }
  | {
      type: 'workspace';
      key: string;
      workspace: Workspace;
      expanded: boolean;
      count: number;
      depth: 0;
    }
  | {
      type: 'folder';
      key: string;
      folder: BookmarkFolder;
      container: string;
      index: number;
      depth: number;
      topLevel: boolean;
      expanded: boolean;
      count: number;
    }
  | {
      type: 'entry';
      key: string;
      entry: BookmarkEntry;
      container: string;
      index: number;
      depth: number;
    }
  | { type: 'end'; key: string; container: string; index: number; depth: number }
  | { type: 'empty'; key: string; text: string; container: string; depth: number }
  | { type: 'custom-dropzone'; key: string; depth: number }
  | { type: 'history'; key: string; label: string; depth: number };

function readVariant(): Variant {
  if (typeof window === 'undefined') {
    return SELECTED_VARIANT;
  }
  const raw = new URLSearchParams(window.location.search).get('variant')?.toUpperCase();
  return raw && (VARIANTS as readonly string[]).includes(raw) ? (raw as Variant) : SELECTED_VARIANT;
}

function toDropView(state: TreeState, target: DropTarget, rowKey: string): DropView {
  switch (target.kind) {
    case 'into':
      return {
        kind: 'into',
        container: target.container,
        rowKey,
        label: `放入「${containerLabel(state, target.container)}」`,
      };
    case 'insert':
      return {
        kind: 'insert',
        container: target.container,
        index: target.index,
        rowKey,
        label: `插入到「${containerLabel(state, target.container)}」`,
      };
    case 'new-root':
      return { kind: 'new-root', rowKey, label: '变成自建目录的顶级目录' };
    case 'tab':
      return { kind: 'tab', index: target.index, rowKey, label: '调整标签页顺序' };
  }
}

function pushChildren(
  rows: Row[],
  state: TreeState,
  children: ReturnType<typeof getContainerChildren>,
  container: string,
  depth: number,
  expanded: Record<string, boolean>,
  topLevel: boolean,
): void {
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    if (child.kind === 'folder') {
      const folder = state.folders.find((item) => item.id === child.id);
      if (!folder) {
        continue;
      }
      const childContainer = folderContainer(folder.id);
      const grandChildren = getContainerChildren(state, childContainer);
      const isExpanded = expanded[childContainer] ?? false;
      rows.push({
        type: 'folder',
        key: child.key,
        folder,
        container,
        index,
        depth,
        topLevel,
        expanded: isExpanded,
        count: grandChildren.length,
      });
      if (isExpanded) {
        if (grandChildren.length === 0) {
          rows.push({
            type: 'empty',
            key: `${child.key}:empty`,
            text: '空目录',
            container: childContainer,
            depth: depth + 1,
          });
          rows.push({
            type: 'end',
            key: `${child.key}:end`,
            container: childContainer,
            index: 0,
            depth: depth + 1,
          });
        } else {
          pushChildren(rows, state, grandChildren, childContainer, depth + 1, expanded, false);
        }
      }
      continue;
    }

    const entry = findEntry(state, child.id);
    if (!entry) {
      continue;
    }
    rows.push({
      type: 'entry',
      key: child.key,
      entry,
      container,
      index,
      depth,
    });
  }

  rows.push({
    type: 'end',
    key: `${container}:end`,
    container,
    index: children.length,
    depth,
  });
}

function buildRows(state: TreeState, expanded: Record<string, boolean>): Row[] {
  const rows: Row[] = [];

  rows.push({
    type: 'category',
    key: 'category:workspace',
    category: 'workspace',
    label: '工作区目录',
    count: state.workspaces.length,
  });

  for (const workspace of state.workspaces) {
    const container = workspaceContainer(workspace.id);
    const children = getContainerChildren(state, container);
    const isExpanded = expanded[`workspace:${workspace.id}`] ?? true;
    rows.push({
      type: 'workspace',
      key: `workspace:${workspace.id}`,
      workspace,
      expanded: isExpanded,
      count: children.length,
      depth: 0,
    });
    if (!isExpanded) {
      continue;
    }
    if (children.length === 0) {
      rows.push({
        type: 'empty',
        key: `workspace:${workspace.id}:empty`,
        text: '该工作区还没有书签',
        container,
        depth: 1,
      });
      continue;
    }
    pushChildren(rows, state, children, container, 1, expanded, false);
  }

  const customChildren = getContainerChildren(state, CUSTOM_ROOT);
  rows.push({
    type: 'category',
    key: 'category:custom',
    category: 'custom',
    label: '自建目录',
    count: customChildren.length,
  });
  if (customChildren.length === 0) {
    rows.push({
      type: 'empty',
      key: 'custom:empty',
      text: '还没有自建目录',
      container: CUSTOM_ROOT,
      depth: 0,
    });
  } else {
    pushChildren(rows, state, customChildren, CUSTOM_ROOT, 0, expanded, true);
  }
  rows.push({ type: 'custom-dropzone', key: 'custom:dropzone', depth: 0 });

  rows.push({
    type: 'category',
    key: 'category:history',
    category: 'history',
    label: '历史目录',
    count: 3,
  });
  rows.push({ type: 'history', key: 'history:year', label: '2026 年', depth: 0 });
  rows.push({ type: 'history', key: 'history:month', label: '11 月', depth: 1 });
  rows.push({ type: 'history', key: 'history:day', label: '16 日 · 3 条记录', depth: 2 });

  return rows;
}

export function DndPrototype() {
  const [state, setState] = useState<TreeState>(createInitialState);
  const [variant, setVariantState] = useState<Variant>(readVariant);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => ({
    ...INITIAL_EXPANDED,
  }));
  const [drag, setDrag] = useState<DragPayload | null>(null);
  const [drop, setDrop] = useState<DropView | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState('等待操作');
  const [toast, setToast] = useState<{ message: string; tone: 'info' | 'error' } | null>(null);
  const [autoExpand, setAutoExpand] = useState(false);
  const [showState, setShowState] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  );

  const dragRef = useRef<DragPayload | null>(null);
  const hoverRef = useRef<{ rowKey: string; since: number } | null>(null);
  const expandTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const rows = useMemo(() => buildRows(state, expanded), [state, expanded]);
  const visibleTabs = useMemo(() => sortTabs(state.tabs), [state.tabs]);

  const showToast = useCallback((message: string, tone: 'info' | 'error' = 'info') => {
    setToast({ message, tone });
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, TOAST_MS);
  }, []);

  const cancelAutoExpand = useCallback(() => {
    if (expandTimerRef.current !== null) {
      window.clearTimeout(expandTimerRef.current);
      expandTimerRef.current = null;
    }
  }, []);

  const clearDrag = useCallback(() => {
    dragRef.current = null;
    setDrag(null);
    setDrop(null);
    hoverRef.current = null;
    cancelAutoExpand();
  }, [cancelAutoExpand]);

  useEffect(() => {
    return () => {
      cancelAutoExpand();
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, [cancelAutoExpand]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const changeVariant = useCallback((next: Variant) => {
    setVariantState(next);
    const url = new URL(window.location.href);
    url.searchParams.set('variant', next);
    window.history.replaceState(null, '', url);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
        return;
      }
      event.preventDefault();
      const index = VARIANTS.indexOf(variant);
      const delta = event.key === 'ArrowRight' ? 1 : -1;
      const next = VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length];
      changeVariant(next);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [changeVariant, variant]);

  const startDrag = useCallback((payload: DragPayload) => {
    return (event: DragEvent<HTMLElement>) => {
      dragRef.current = payload;
      setDrag(payload);
      setLastAction(`开始拖拽「${payload.label}」`);
      event.dataTransfer.setData(MIME, JSON.stringify(payload));
      event.dataTransfer.setData('text/plain', payload.label);
      event.dataTransfer.effectAllowed = 'move';
    };
  }, []);

  const scheduleAutoExpand = useCallback(
    (container: string) => {
      if (!autoExpand || expandTimerRef.current !== null) {
        return;
      }
      expandTimerRef.current = window.setTimeout(() => {
        setExpanded((previous) => ({ ...previous, [container]: true }));
        expandTimerRef.current = null;
      }, AUTO_EXPAND_MS);
    },
    [autoExpand],
  );

  const setDropFromTarget = useCallback(
    (target: DropTarget, rowKey: string, payload: DragPayload) => {
      const check =
        payload.kind === 'tab'
          ? target.kind === 'tab'
            ? { ok: true as const }
            : { ok: false as const, reason: '标签页只能在标签页列表内排序' }
          : validateMove(state, payload, target);
      if (!check.ok) {
        setDrop({ kind: 'invalid', reason: check.reason, rowKey, label: '禁止' });
        return false;
      }
      setDrop(toDropView(state, target, rowKey));
      return true;
    },
    [state],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLElement>, target: DropTarget | null) => {
      event.preventDefault();
      event.stopPropagation();
      const payload = dragRef.current;
      if (!payload) {
        return;
      }
      const currentDrop = drop;
      if (currentDrop?.kind === 'invalid') {
        setLastAction(`已恢复原状：${currentDrop.reason}`);
        showToast(`${currentDrop.reason}，已恢复原状`, 'error');
        clearDrag();
        return;
      }
      if (!target) {
        clearDrag();
        return;
      }
      const result = applyMove(state, payload, target);
      if (result.ok) {
        setState(result.state);
        setLastAction(result.message);
        showToast(result.message, 'info');
      } else {
        setLastAction(`已恢复原状：${result.reason}`);
        showToast(`${result.reason}，已恢复原状`, 'error');
      }
      clearDrag();
    },
    [clearDrag, drop, showToast, state],
  );

  const rowMouseDown = useCallback((key: string) => {
    setSelectedKey(key);
  }, []);

  const resetAll = useCallback(() => {
    setState(createInitialState());
    setExpanded({ ...INITIAL_EXPANDED });
    setSelectedKey(null);
    setLastAction('已重置为初始 mock 数据');
    showToast('已重置为初始 mock 数据', 'info');
    clearDrag();
  }, [clearDrag, showToast]);

  const closeTab = useCallback(
    (tabId: string) => {
      setState((previous) => ({
        ...previous,
        tabs: previous.tabs.filter((tab) => tab.id !== tabId),
      }));
      showToast('已关闭标签页（原型内存态）', 'info');
    },
    [showToast],
  );

  const edgeZone = useCallback(
    (event: DragEvent<HTMLElement>, mode: Variant): 'before' | 'after' | 'middle' => {
      const rect = event.currentTarget.getBoundingClientRect();
      const y = event.clientY - rect.top;
      const edge = mode === 'B' ? Math.min(10, rect.height * 0.34) : rect.height * 0.2;
      if (y <= edge) {
        return 'before';
      }
      if (y >= rect.height - edge) {
        return 'after';
      }
      return 'middle';
    },
    [],
  );

  const trackRow = useCallback(
    (rowKey: string) => {
      if (hoverRef.current?.rowKey === rowKey) {
        return;
      }
      hoverRef.current = { rowKey, since: performance.now() };
      cancelAutoExpand();
    },
    [cancelAutoExpand],
  );

  const allowIntoForRow = useCallback(
    (rowKey: string): boolean => {
      if (variant !== 'C') {
        return true;
      }
      const current = hoverRef.current;
      if (!current || current.rowKey !== rowKey) {
        return false;
      }
      return performance.now() - current.since >= INTENT_MS;
    },
    [variant],
  );

  const handleFolderDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>, row: Extract<Row, { type: 'folder' }>) => {
      event.preventDefault();
      event.stopPropagation();
      const payload = dragRef.current;
      if (!payload) {
        return;
      }
      trackRow(row.key);
      if (payload.kind === 'tab') {
        setDropFromTarget(
          { kind: 'insert', container: row.container, index: row.index },
          row.key,
          payload,
        );
        event.dataTransfer.dropEffect = 'none';
        return;
      }
      const zone = edgeZone(event, variant);
      const into = zone === 'middle' && allowIntoForRow(row.key);
      const target: DropTarget = into
        ? { kind: 'into', container: folderContainer(row.folder.id) }
        : {
            kind: 'insert',
            container: row.container,
            index: zone === 'after' ? row.index + 1 : row.index,
          };
      const ok = setDropFromTarget(target, row.key, payload);
      event.dataTransfer.dropEffect = ok ? 'move' : 'none';
      if (ok && into && !row.expanded) {
        scheduleAutoExpand(folderContainer(row.folder.id));
      }
    },
    [allowIntoForRow, edgeZone, scheduleAutoExpand, setDropFromTarget, trackRow, variant],
  );

  const handleEntryDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>, row: Extract<Row, { type: 'entry' }>) => {
      event.preventDefault();
      event.stopPropagation();
      const payload = dragRef.current;
      if (!payload) {
        return;
      }
      trackRow(row.key);
      if (payload.kind === 'tab') {
        setDropFromTarget(
          { kind: 'insert', container: row.container, index: row.index },
          row.key,
          payload,
        );
        event.dataTransfer.dropEffect = 'none';
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      const after = event.clientY - rect.top > rect.height / 2;
      const target: DropTarget = {
        kind: 'insert',
        container: row.container,
        index: after ? row.index + 1 : row.index,
      };
      const ok = setDropFromTarget(target, row.key, payload);
      event.dataTransfer.dropEffect = ok ? 'move' : 'none';
    },
    [setDropFromTarget, trackRow],
  );

  const handleWorkspaceDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>, row: Extract<Row, { type: 'workspace' }>) => {
      event.preventDefault();
      event.stopPropagation();
      const payload = dragRef.current;
      if (!payload) {
        return;
      }
      trackRow(row.key);
      if (payload.kind === 'tab') {
        setDropFromTarget(
          { kind: 'into', container: workspaceContainer(row.workspace.id) },
          row.key,
          payload,
        );
        event.dataTransfer.dropEffect = 'none';
        return;
      }
      const ok = setDropFromTarget(
        { kind: 'into', container: workspaceContainer(row.workspace.id) },
        row.key,
        payload,
      );
      event.dataTransfer.dropEffect = ok ? 'move' : 'none';
      if (ok && !row.expanded) {
        // 工作区根节点也是可折叠容器：悬停展开开关开启时同样要参与，
        // 否则「工作区目录」分类只有折叠的书签文件夹会展开、根节点不会。
        scheduleAutoExpand(row.key);
      }
    },
    [scheduleAutoExpand, setDropFromTarget, trackRow],
  );

  const handleEndDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>, row: Extract<Row, { type: 'end' }>) => {
      event.preventDefault();
      event.stopPropagation();
      const payload = dragRef.current;
      if (!payload) {
        return;
      }
      trackRow(row.key);
      const ok = setDropFromTarget(
        { kind: 'insert', container: row.container, index: row.index },
        row.key,
        payload,
      );
      event.dataTransfer.dropEffect = ok ? 'move' : 'none';
    },
    [setDropFromTarget, trackRow],
  );

  const handleCategoryDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>, row: Extract<Row, { type: 'category' }>) => {
      event.preventDefault();
      event.stopPropagation();
      const payload = dragRef.current;
      if (!payload) {
        return;
      }
      trackRow(row.key);
      if (row.category !== 'custom') {
        setDrop({
          kind: 'invalid',
          reason:
            row.category === 'history'
              ? '历史目录不参与本次拖拽'
              : '工作区分类不支持变成新的顶级目录',
          rowKey: row.key,
          label: '禁止',
        });
        event.dataTransfer.dropEffect = 'none';
        return;
      }
      if (payload.kind !== 'folder') {
        setDrop({
          kind: 'invalid',
          reason: '书签不能变成顶级目录',
          rowKey: row.key,
          label: '禁止',
        });
        event.dataTransfer.dropEffect = 'none';
        return;
      }
      setDrop({ kind: 'new-root', rowKey: row.key, label: '变成自建目录的顶级目录' });
      event.dataTransfer.dropEffect = 'move';
    },
    [trackRow],
  );

  const handleHistoryDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>, row: Extract<Row, { type: 'history' }>) => {
      event.preventDefault();
      event.stopPropagation();
      trackRow(row.key);
      setDrop({
        kind: 'invalid',
        reason: '历史目录不参与本次拖拽',
        rowKey: row.key,
        label: '禁止',
      });
      event.dataTransfer.dropEffect = 'none';
    },
    [trackRow],
  );

  const handleCustomDropzoneDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const payload = dragRef.current;
      if (!payload) {
        return;
      }
      trackRow('custom:dropzone');
      const target: DropTarget = { kind: 'new-root' };
      const ok = setDropFromTarget(target, 'custom:dropzone', payload);
      event.dataTransfer.dropEffect = ok ? 'move' : 'none';
    },
    [setDropFromTarget, trackRow],
  );

  const handleTabDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>, index: number) => {
      event.preventDefault();
      event.stopPropagation();
      const payload = dragRef.current;
      if (!payload) {
        return;
      }
      trackRow(`tab:${index}`);
      if (payload.kind !== 'tab') {
        setDrop({
          kind: 'invalid',
          reason: '书签不能拖进标签页列表',
          rowKey: `tab:${index}`,
          label: '禁止',
        });
        event.dataTransfer.dropEffect = 'none';
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      const after = event.clientY - rect.top > rect.height / 2;
      const targetIndex = after ? index + 1 : index;
      const check = validateTabMove(state.tabs, payload.id, targetIndex);
      if (!check.ok) {
        setDrop({
          kind: 'invalid',
          reason: check.reason,
          rowKey: `tab:${index}`,
          label: '禁止',
        });
        event.dataTransfer.dropEffect = 'none';
        return;
      }
      setDrop({
        kind: 'tab',
        index: targetIndex,
        rowKey: `tab:${index}`,
        label: '调整标签页顺序',
      });
      event.dataTransfer.dropEffect = 'move';
    },
    [state.tabs, trackRow],
  );

  const handleTabEndDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const payload = dragRef.current;
      if (!payload || payload.kind !== 'tab') {
        event.dataTransfer.dropEffect = 'none';
        return;
      }
      trackRow('tab:end');
      const check = validateTabMove(state.tabs, payload.id, visibleTabs.length);
      if (!check.ok) {
        setDrop({
          kind: 'invalid',
          reason: check.reason,
          rowKey: 'tab:end',
          label: '禁止',
        });
        event.dataTransfer.dropEffect = 'none';
        return;
      }
      setDrop({
        kind: 'tab',
        index: visibleTabs.length,
        rowKey: 'tab:end',
        label: '调整标签页顺序',
      });
      event.dataTransfer.dropEffect = 'move';
    },
    [state.tabs, trackRow, visibleTabs.length],
  );

  const isDropInto = useCallback(
    (container: string): boolean => drop?.kind === 'into' && drop.container === container,
    [drop],
  );

  const renderInsertIndicator = useCallback(
    (depth: number) => {
      if (variant === 'D' && drag) {
        return (
          <div className="proto-ghost-row" style={{ marginLeft: 8 + depth * 14 }}>
            {drag.kind === 'folder' ? (
              <IconFolder size={14} decorative />
            ) : (
              <IconBookmarkStar size={14} decorative />
            )}
            <span>{drag.label}</span>
            <span className="proto-ghost-row__tag">松手落在这里</span>
          </div>
        );
      }
      return <div className="proto-insert-line" style={{ marginLeft: 8 + depth * 14 }} />;
    },
    [drag, variant],
  );

  const renderGhostChild = useCallback(
    (container: string, depth: number) => {
      if (variant !== 'D' || drop?.kind !== 'into' || drop.container !== container || !drag) {
        return null;
      }
      return (
        <div
          className="proto-ghost-row proto-ghost-row--child"
          style={{ marginLeft: 8 + depth * 14 }}
        >
          {drag.kind === 'folder' ? (
            <IconFolder size={14} decorative />
          ) : (
            <IconBookmarkStar size={14} decorative />
          )}
          <span>{drag.label}</span>
          <span className="proto-ghost-row__tag">作为子项放入</span>
        </div>
      );
    },
    [drag, drop, variant],
  );

  const renderRow = (row: Row): ReactNode => {
    if (row.type === 'category') {
      const isCustom = row.category === 'custom';
      const isNewRoot = isCustom && drop?.kind === 'new-root';
      const isInvalid = drop?.kind === 'invalid' && drop.rowKey === row.key;
      return (
        <div
          key={row.key}
          className={`proto-category-header${isCustom ? ' proto-category-header--custom' : ''}${isNewRoot ? ' is-drop-new' : ''}${isInvalid ? ' is-drop-invalid' : ''}`}
          onDragOver={(event) => handleCategoryDragOver(event, row)}
          onDrop={(event) => handleDrop(event, isCustom ? { kind: 'new-root' } : null)}
        >
          <span className="proto-category-header__label">{row.label}</span>
          <span className="proto-category-header__count">{row.count}</span>
          {isNewRoot ? (
            <span className="proto-category-header__hint">松手 → 变成自建目录顶级目录</span>
          ) : null}
        </div>
      );
    }

    if (row.type === 'workspace') {
      const isInto = isDropInto(workspaceContainer(row.workspace.id));
      const isInvalid = drop?.kind === 'invalid' && drop.rowKey === row.key;
      return (
        <div key={row.key}>
          <div
            className={`proto-row proto-row--workspace${isInto ? ' is-drop-into' : ''}${isInvalid ? ' is-drop-invalid' : ''}${selectedKey === row.key ? ' is-selected' : ''}`}
            onMouseDown={() => rowMouseDown(row.key)}
            onClick={() => setExpanded((previous) => ({ ...previous, [row.key]: !row.expanded }))}
            onDragOver={(event) => handleWorkspaceDragOver(event, row)}
            onDrop={(event) =>
              handleDrop(event, { kind: 'into', container: workspaceContainer(row.workspace.id) })
            }
            role="treeitem"
            aria-expanded={row.expanded}
            title="工作区根节点随真实工作区产生，不可拖拽；可作为文件夹/书签的放置目标"
          >
            <button
              type="button"
              className="proto-row__chevron"
              aria-label={row.expanded ? '折叠工作区' : '展开工作区'}
              onClick={(event) => {
                event.stopPropagation();
                setExpanded((previous) => ({ ...previous, [row.key]: !row.expanded }));
              }}
            >
              {row.expanded ? (
                <IconChevronDown size={12} decorative />
              ) : (
                <IconChevronRight size={12} decorative />
              )}
            </button>
            {row.expanded ? (
              <IconFolderOpen size={14} decorative />
            ) : (
              <IconFolder size={14} decorative />
            )}
            <span className="proto-row__label">{row.workspace.name}</span>
            <span className="proto-row__meta">{row.count}</span>
            <span className="proto-row__lock">自动</span>
          </div>
          {renderGhostChild(workspaceContainer(row.workspace.id), 1)}
        </div>
      );
    }

    if (row.type === 'folder') {
      const isInto = isDropInto(folderContainer(row.folder.id));
      const isInvalid = drop?.kind === 'invalid' && drop.rowKey === row.key;
      return (
        <div key={row.key}>
          <div
            className={`proto-row proto-row--folder${row.topLevel ? ' proto-row--top' : ''}${isInto ? ' is-drop-into' : ''}${isInvalid ? ' is-drop-invalid' : ''}${selectedKey === row.key ? ' is-selected' : ''}`}
            style={{ paddingLeft: 8 + row.depth * 14 }}
            draggable
            onDragStart={startDrag({ kind: 'folder', id: row.folder.id, label: row.folder.name })}
            onDragEnd={clearDrag}
            onDragOver={(event) => handleFolderDragOver(event, row)}
            onDrop={(event) => {
              if (drop?.kind === 'into' && drop.container === folderContainer(row.folder.id)) {
                handleDrop(event, { kind: 'into', container: folderContainer(row.folder.id) });
                return;
              }
              handleDrop(event, {
                kind: 'insert',
                container: row.container,
                index: row.index,
              });
            }}
            onMouseDown={() => rowMouseDown(row.key)}
            onClick={() => setExpanded((previous) => ({ ...previous, [row.key]: !row.expanded }))}
            role="treeitem"
            aria-expanded={row.expanded}
          >
            <button
              type="button"
              className="proto-row__chevron"
              aria-label={row.expanded ? '折叠目录' : '展开目录'}
              onClick={(event) => {
                event.stopPropagation();
                setExpanded((previous) => ({ ...previous, [row.key]: !row.expanded }));
              }}
            >
              {row.expanded ? (
                <IconChevronDown size={12} decorative />
              ) : (
                <IconChevronRight size={12} decorative />
              )}
            </button>
            {row.expanded ? (
              <IconFolderOpen size={14} decorative />
            ) : (
              <IconFolder size={14} decorative />
            )}
            <span className="proto-row__label">{row.folder.name}</span>
            <span className="proto-row__meta">{row.count}</span>
            <span className="proto-row__drag">拖</span>
          </div>
          {renderGhostChild(folderContainer(row.folder.id), row.depth + 1)}
        </div>
      );
    }

    if (row.type === 'entry') {
      const isInvalid = drop?.kind === 'invalid' && drop.rowKey === row.key;
      return (
        <div
          key={row.key}
          className={`proto-row proto-row--entry${isInvalid ? ' is-drop-invalid' : ''}${selectedKey === row.key ? ' is-selected' : ''}`}
          style={{ paddingLeft: 8 + row.depth * 14 }}
          draggable
          onDragStart={startDrag({ kind: 'entry', id: row.entry.id, label: row.entry.title })}
          onDragEnd={clearDrag}
          onDragOver={(event) => handleEntryDragOver(event, row)}
          onDrop={(event) =>
            handleDrop(event, {
              kind: 'insert',
              container: row.container,
              index: row.index,
            })
          }
          onMouseDown={() => rowMouseDown(row.key)}
          onClick={() => setSelectedKey(row.key)}
          role="treeitem"
          title={row.entry.url}
        >
          <span className="proto-row__spacer" />
          <IconBookmarkStar size={14} decorative />
          <span className="proto-row__label">{row.entry.title}</span>
          <span className="proto-row__url">{row.entry.url}</span>
          <span className="proto-row__drag">拖</span>
        </div>
      );
    }

    if (row.type === 'history') {
      const isInvalid = drop?.kind === 'invalid' && drop.rowKey === row.key;
      return (
        <div
          key={row.key}
          className={`proto-row proto-row--history${isInvalid ? ' is-drop-invalid' : ''}`}
          style={{ paddingLeft: 8 + row.depth * 14 }}
          onDragOver={(event) => handleHistoryDragOver(event, row)}
          onDrop={(event) => handleDrop(event, null)}
          title="历史目录不参与本次拖拽"
        >
          <span className="proto-row__spacer" />
          <IconHistory size={14} decorative />
          <span className="proto-row__label">{row.label}</span>
        </div>
      );
    }

    if (row.type === 'empty') {
      return (
        <div key={row.key} className="proto-empty" style={{ paddingLeft: 28 + row.depth * 14 }}>
          {row.text}
        </div>
      );
    }

    if (row.type === 'custom-dropzone') {
      const isNewRoot = drop?.kind === 'new-root';
      return (
        <div
          key={row.key}
          className={`proto-custom-dropzone${drag?.kind === 'folder' ? ' is-visible' : ''}${isNewRoot ? ' is-active' : ''}`}
          onDragOver={handleCustomDropzoneDragOver}
          onDrop={(event) => handleDrop(event, { kind: 'new-root' })}
        >
          <span>拖到这里 → 成为自建目录的顶级目录</span>
        </div>
      );
    }

    const isInsert =
      drop?.kind === 'insert' && drop.container === row.container && drop.index === row.index;
    return (
      <div
        key={row.key}
        className={`proto-end-band${isInsert ? ' is-active' : ''}`}
        style={{ marginLeft: 8 + row.depth * 14 }}
        onDragOver={(event) => handleEndDragOver(event, row)}
        onDrop={(event) =>
          handleDrop(event, { kind: 'insert', container: row.container, index: row.index })
        }
      >
        {isInsert ? (
          <>
            <div className="proto-insert-line proto-insert-line--inline" />
            <span>松手放到末尾</span>
          </>
        ) : null}
      </div>
    );
  };

  const renderTabRow = (tab: BrowserTab, index: number): ReactNode => {
    const isInsert = drop?.kind === 'tab' && drop.index === index;
    const isInvalid = drop?.kind === 'invalid' && drop.rowKey === `tab:${index}`;
    return (
      <div key={tab.id}>
        {isInsert ? <div className="proto-insert-line proto-insert-line--tab" /> : null}
        <div
          className={`proto-row proto-row--tab${tab.pinned ? ' is-pinned' : ''}${isInvalid ? ' is-drop-invalid' : ''}`}
          draggable
          onDragStart={startDrag({ kind: 'tab', id: tab.id, label: tab.title, pinned: tab.pinned })}
          onDragEnd={clearDrag}
          onDragOver={(event) => handleTabDragOver(event, index)}
          onDrop={(event) =>
            handleDrop(event, { kind: 'tab', index: drop?.kind === 'tab' ? drop.index : index })
          }
          role="treeitem"
          title={tab.url}
        >
          {tab.pinned ? <IconPin size={12} decorative /> : <span className="proto-row__spacer" />}
          <span className="proto-tab-favicon" aria-hidden="true">
            {tab.title.slice(0, 1).toUpperCase()}
          </span>
          <span className="proto-row__label">{tab.title}</span>
          <button
            type="button"
            className="proto-row__close"
            aria-label="关闭标签页"
            onClick={(event) => {
              event.stopPropagation();
              closeTab(tab.id);
            }}
          >
            <IconClose size={12} decorative />
          </button>
        </div>
      </div>
    );
  };

  const pinnedTabs = visibleTabs.filter((tab) => tab.pinned);
  const normalTabs = visibleTabs.filter((tab) => !tab.pinned);

  return (
    <div className="proto-page">
      <header className="proto-header">
        <div>
          <div className="proto-eyebrow">PROTOTYPE · 不写生产数据</div>
          <h1>浏览器面板拖拽 · 交互方案</h1>
          <p className="proto-subtitle">
            4 套放置区/反馈方案，同一份 mock 数据。书签目录侧已移除活标签；活标签只属于右侧
            「已打开标签页」。当前已选：<strong>D · A 的分区 + 幽灵占位</strong>。
          </p>
        </div>
        <div className="proto-toolbar">
          <button
            type="button"
            className="proto-btn"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? '切到亮色' : '切到暗色'}
          </button>
          <button
            type="button"
            className={`proto-btn${autoExpand ? ' is-on' : ''}`}
            onClick={() => setAutoExpand((value) => !value)}
            title="悬停折叠目录 600ms 后临时展开"
          >
            悬停展开：{autoExpand ? '开' : '关'}
          </button>
          <button type="button" className="proto-btn" onClick={resetAll}>
            重置数据
          </button>
          <button
            type="button"
            className={`proto-btn${showState ? ' is-on' : ''}`}
            onClick={() => setShowState((value) => !value)}
          >
            状态面板：{showState ? '开' : '关'}
          </button>
        </div>
      </header>

      <div className="proto-legend">
        <span className="proto-legend__item">
          <span className="proto-legend__swatch proto-legend__swatch--line" /> 排序插入
        </span>
        <span className="proto-legend__item">
          <span className="proto-legend__swatch proto-legend__swatch--into" /> 放入目录
        </span>
        <span className="proto-legend__item">
          <span className="proto-legend__swatch proto-legend__swatch--invalid" /> 禁止 / 松手恢复
        </span>
        <span className="proto-legend__item">
          <span className="proto-legend__swatch proto-legend__swatch--ghost" /> 幽灵占位（D）
        </span>
      </div>

      <main className="proto-stage">
        <section className="proto-nav" aria-label="书签目录原型">
          <div className="proto-nav__head">
            <div className="proto-nav__title">
              <IconFolder size={14} decorative />
              书签目录
            </div>
            <span className="proto-nav__badge">无活标签</span>
          </div>
          <div className="proto-nav__hint">
            目录默认在前；可跨分类拖拽；工作区根节点不可拖，但可作为放置目标。
          </div>
          <div
            className="proto-nav__scroll"
            role="tree"
            aria-label="书签目录树"
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                cancelAutoExpand();
              }
            }}
          >
            {rows.map((row) => {
              const line =
                drop?.kind === 'insert' &&
                row.type !== 'end' &&
                'container' in row &&
                row.container === drop.container &&
                'index' in row &&
                row.index === drop.index;
              return (
                <div key={row.key} className="proto-row-slot">
                  {line ? renderInsertIndicator('depth' in row ? row.depth : 0) : null}
                  {renderRow(row)}
                </div>
              );
            })}
          </div>
        </section>

        <section className="proto-nav" aria-label="已打开标签页原型">
          <div className="proto-nav__head">
            <div className="proto-nav__title">
              <IconList size={14} decorative />
              已打开标签页
            </div>
            <span className="proto-nav__badge">{visibleTabs.length} 个</span>
          </div>
          <div className="proto-nav__hint">
            pinned 固定在最前，只能在 pinned 组内排序；普通标签同理。
          </div>
          <div
            className="proto-nav__scroll proto-nav__scroll--tabs"
            role="tree"
            aria-label="已打开标签页"
          >
            {visibleTabs.length === 0 ? <div className="proto-empty">没有打开的标签页</div> : null}
            {pinnedTabs.map((tab) => renderTabRow(tab, visibleTabs.indexOf(tab)))}
            {pinnedTabs.length > 0 && normalTabs.length > 0 ? (
              <div className="proto-pin-divider">
                <span>固定标签</span>
              </div>
            ) : null}
            {normalTabs.map((tab) => renderTabRow(tab, visibleTabs.indexOf(tab)))}
            {visibleTabs.length > 0 ? (
              <div
                className={`proto-tab-end${drop?.kind === 'tab' && drop.index === visibleTabs.length ? ' is-active' : ''}`}
                onDragOver={handleTabEndDragOver}
                onDrop={(event) => handleDrop(event, { kind: 'tab', index: visibleTabs.length })}
              >
                {drop?.kind === 'tab' && drop.index === visibleTabs.length ? '松手放到末尾' : ''}
              </div>
            ) : null}
          </div>
        </section>

        {showState ? (
          <aside className="proto-inspector" aria-label="原型状态">
            <div className="proto-inspector__head">
              <span className="proto-inspector__variant">
                {variant} · {VARIANT_META[variant].name}
              </span>
              <span className="proto-inspector__live">
                {drag ? `拖拽中：${drag.label}` : '空闲'}
              </span>
            </div>
            <p className="proto-inspector__desc">{VARIANT_META[variant].description}</p>
            <p className="proto-inspector__hint">{VARIANT_META[variant].hint}</p>

            <h3>最近操作</h3>
            <p className="proto-inspector__last">{lastAction}</p>

            <h3>当前落点</h3>
            <p className="proto-inspector__last">
              {drop
                ? `${drop.kind}${'container' in drop ? ` · ${drop.container}` : ''}${'index' in drop ? ` · #${drop.index}` : ''}${drop.kind === 'invalid' ? ` · ${drop.reason}` : ''}`
                : '—'}
            </p>

            <h3>规则速查</h3>
            <ul className="proto-inspector__list">
              <li>默认：目录在前、书签在后；有手动顺序表时以表为准。</li>
              <li>跨分类：文件夹 ↔ 任意文件夹 / 工作区根节点；书签 → 文件夹 / 工作区根节点。</li>
              <li>自建目录标题行 / 空白区：文件夹松手变成顶级目录；书签禁止。</li>
              <li>工作区根节点：不可拖；可作为放置目标；不能变成新顶级目录。</li>
              <li>历史目录：完全只读。</li>
              <li>放入折叠目录：保持折叠；可用顶部开关启用“悬停 600ms 展开”。</li>
            </ul>

            <h3>顺序表（会写进状态）</h3>
            <pre className="proto-code">{JSON.stringify(state.order.containers, null, 2)}</pre>

            <h3>标签顺序</h3>
            <pre className="proto-code">
              {JSON.stringify(
                state.tabs.map((tab) => ({ title: tab.title, pinned: tab.pinned })),
                null,
                2,
              )}
            </pre>
          </aside>
        ) : null}
      </main>

      <div className="proto-switcher" role="group" aria-label="切换原型方案">
        <button
          type="button"
          className="proto-switcher__arrow"
          aria-label="上一个方案"
          onClick={() => {
            const index = VARIANTS.indexOf(variant);
            changeVariant(VARIANTS[(index - 1 + VARIANTS.length) % VARIANTS.length]);
          }}
        >
          ←
        </button>
        <div className="proto-switcher__label">
          <span className="proto-switcher__key">{variant}</span>
          <span>{VARIANT_META[variant].name}</span>
          {variant === SELECTED_VARIANT ? (
            <span className="proto-switcher__selected">已选</span>
          ) : null}
        </div>
        <div className="proto-switcher__dots">
          {VARIANTS.map((item) => (
            <button
              key={item}
              type="button"
              className={`proto-switcher__dot${item === variant ? ' is-active' : ''}`}
              aria-label={`切换到方案 ${item}`}
              onClick={() => changeVariant(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="proto-switcher__arrow"
          aria-label="下一个方案"
          onClick={() => {
            const index = VARIANTS.indexOf(variant);
            changeVariant(VARIANTS[(index + 1) % VARIANTS.length]);
          }}
        >
          →
        </button>
        <span className="proto-switcher__hint">← → 切换</span>
      </div>

      {toast ? (
        <div className={`proto-toast${toast.tone === 'error' ? ' is-error' : ''}`} role="status">
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}
