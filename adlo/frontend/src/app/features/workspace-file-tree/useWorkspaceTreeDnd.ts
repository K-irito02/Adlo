import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { RecentWorkspaceEntry, WorkspaceTreeNode } from '@shared/ipc';
import { useAppStore } from '@stores/slicedStore';
import { createDragGhost, type DragGhostHandle } from '@features/dnd/dragGhost';
import type { DndIndicator } from '@features/dnd/DndOverlay';
import { closestElement, fileRowZone, rowZone } from '@features/dnd/rowZone';
import { insertChildName } from '@features/file-tree/childOrder';
import { decideNodeDrop, isInvalidWorkspaceReorder } from './treeDndRules';
import type { DndNodeKind } from './treeDndRules';

const DRAG_THRESHOLD = 4;
const AUTO_SCROLL_EDGE = 28;
const AUTO_SCROLL_STEP = 14;
const INDICATOR_INSET = 8;

interface NodeInfo {
  workspace: RecentWorkspaceEntry;
  path: string;
  name: string;
  kind: DndNodeKind;
  parentPath: string;
}

type DragPayload = { type: 'node'; info: NodeInfo } | { type: 'workspace'; workspaceId: string };

type DropPlan =
  | { kind: 'reorder-workspace'; orderedIds: string[]; indicator: DndIndicator }
  | {
      kind: 'move';
      from: NodeInfo;
      toWorkspace: RecentWorkspaceEntry;
      toDir: string;
      insertPosition?: { targetName: string; position: 'before' | 'after' };
      indicator: DndIndicator;
    }
  | { kind: 'invalid'; indicator: DndIndicator };

interface DragSession {
  payload: DragPayload;
  row: HTMLElement;
  pointerId: number;
  startX: number;
  startY: number;
  active: boolean;
  ghost?: DragGhostHandle;
}

export interface WorkspaceTreeDndHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onClickCapture: (event: ReactMouseEvent<HTMLElement>) => void;
}

interface WorkspaceTreeDndResult {
  indicator: DndIndicator | null;
  handlers: WorkspaceTreeDndHandlers;
}

/** 计算落点路径与是否真的需要移动（跨工作区即使相对路径相同也必须移动）。 */
export function resolveMoveTarget(input: {
  fromWorkspaceId: string;
  fromPath: string;
  fromName: string;
  toWorkspaceId: string;
  toDir: string;
}): { targetPath: string; workspaceChanged: boolean; needsMove: boolean } {
  const targetPath = input.toDir ? `${input.toDir}/${input.fromName}` : input.fromName;
  const workspaceChanged = input.fromWorkspaceId !== input.toWorkspaceId;
  return {
    targetPath,
    workspaceChanged,
    needsMove: workspaceChanged || input.fromPath !== targetPath,
  };
}

function buildNodeMap(
  workspaces: RecentWorkspaceEntry[],
  treeData: Record<string, WorkspaceTreeNode[]>,
): Map<string, NodeInfo> {
  const map = new Map<string, NodeInfo>();
  const walk = (
    workspace: RecentWorkspaceEntry,
    nodes: WorkspaceTreeNode[],
    parentPath: string,
  ): void => {
    for (const node of nodes) {
      map.set(`${workspace.id}\u0000${node.path}`, {
        workspace,
        path: node.path,
        name: node.name,
        kind: node.kind,
        parentPath,
      });
      if (node.kind === 'directory' && node.children.length > 0) {
        walk(workspace, node.children as WorkspaceTreeNode[], node.path);
      }
    }
  };
  for (const workspace of workspaces) {
    walk(workspace, treeData[workspace.id] ?? [], '');
  }
  return map;
}

function findDirectoryNodes(
  workspace: RecentWorkspaceEntry,
  treeData: Record<string, WorkspaceTreeNode[]>,
  dirPath: string,
): WorkspaceTreeNode[] {
  if (dirPath === '') {
    return treeData[workspace.id] ?? [];
  }
  const visit = (nodes: WorkspaceTreeNode[]): WorkspaceTreeNode[] | undefined => {
    for (const node of nodes) {
      if (node.path === dirPath) {
        return node.kind === 'directory' ? (node.children as WorkspaceTreeNode[]) : undefined;
      }
      if (node.kind === 'directory') {
        const hit = visit(node.children as WorkspaceTreeNode[]);
        if (hit) {
          return hit;
        }
      }
    }
    return undefined;
  };
  return visit(treeData[workspace.id] ?? []) ?? [];
}

function insertIndicator(rect: DOMRect, atBottom: boolean): DndIndicator {
  return {
    kind: 'insert',
    top: atBottom ? rect.bottom : rect.top,
    left: rect.left + INDICATOR_INSET,
    width: Math.max(40, rect.width - INDICATOR_INSET * 2),
    height: 2,
  };
}

function intoIndicator(rect: DOMRect): DndIndicator {
  return {
    kind: 'into',
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function invalidIndicator(rect: DOMRect): DndIndicator {
  return {
    kind: 'invalid',
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

/** 把被拖工作区插到目标工作区之前/之后，只重排非置顶项。 */
export function reorderUnpinnedIds(
  workspaces: RecentWorkspaceEntry[],
  draggedId: string,
  targetId: string,
  position: 'before' | 'after',
): string[] {
  const unpinned = workspaces
    .filter((workspace) => !workspace.isPinned)
    .map((workspace) => workspace.id);
  return insertChildName(unpinned, draggedId, targetId, position);
}

export function useWorkspaceTreeDnd(
  workspaces: RecentWorkspaceEntry[],
  treeData: Record<string, WorkspaceTreeNode[]>,
): WorkspaceTreeDndResult {
  const moveWorkspaceFile = useAppStore((state) => state.moveWorkspaceFile);
  const moveWorkspaceFileAcross = useAppStore((state) => state.moveWorkspaceFileAcross);
  const reorderSidebarWorkspaces = useAppStore((state) => state.reorderSidebarWorkspaces);
  const setFileChildOrder = useAppStore((state) => state.setFileChildOrder);

  const nodeMap = useMemo(() => buildNodeMap(workspaces, treeData), [workspaces, treeData]);
  const nodeMapRef = useRef(nodeMap);
  nodeMapRef.current = nodeMap;
  const workspacesRef = useRef(workspaces);
  workspacesRef.current = workspaces;

  const sessionRef = useRef<DragSession | null>(null);
  const suppressClickRef = useRef(false);
  const lastPlanRef = useRef<DropPlan | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);
  const [indicator, setIndicator] = useState<DndIndicator | null>(null);

  const cleanup = useCallback(() => {
    sessionRef.current?.ghost?.remove();
    sessionRef.current = null;
    lastPlanRef.current = null;
    setIndicator(null);
    document.body.classList.remove('adl-tree-dnd-dragging');
    document.body.classList.remove('adl-tree-dnd-not-allowed');
  }, []);

  useEffect(() => () => cleanup(), [cleanup]);

  const computeDrop = useCallback(
    (target: EventTarget | null, clientY: number, payload: DragPayload): DropPlan | null => {
      const header = closestElement(target, '.adl-multitree-entry__header');
      if (header) {
        const entry = header.closest<HTMLElement>('[data-workspace-id]');
        const workspaceId = entry?.dataset.workspaceId;
        const workspace = workspacesRef.current.find((item) => item.id === workspaceId);
        if (!workspace) {
          return null;
        }
        const rect = header.getBoundingClientRect();
        if (payload.type === 'workspace') {
          const dragged = workspacesRef.current.find((item) => item.id === payload.workspaceId);
          if (
            !dragged ||
            isInvalidWorkspaceReorder({
              draggedId: dragged.id,
              draggedPinned: dragged.isPinned,
              targetId: workspace.id,
              targetPinned: workspace.isPinned,
            })
          ) {
            return { kind: 'invalid', indicator: invalidIndicator(rect) };
          }
          const zone = rowZone(clientY, rect);
          return {
            kind: 'reorder-workspace',
            orderedIds: reorderUnpinnedIds(
              workspacesRef.current,
              payload.workspaceId,
              workspace.id,
              zone === 'after' ? 'after' : 'before',
            ),
            indicator: insertIndicator(rect, zone === 'after'),
          };
        }
        if (!workspace.available) {
          return { kind: 'invalid', indicator: invalidIndicator(rect) };
        }
        return {
          kind: 'move',
          from: payload.info,
          toWorkspace: workspace,
          toDir: '',
          indicator: intoIndicator(rect),
        };
      }

      const row = closestElement(target, '[data-path]');
      if (!row) {
        return null;
      }
      const entry = row.closest<HTMLElement>('[data-workspace-id]');
      const workspaceId = entry?.dataset.workspaceId;
      if (!workspaceId) {
        return null;
      }
      const info = nodeMapRef.current.get(`${workspaceId}\u0000${row.dataset.path ?? ''}`);
      if (!info) {
        return null;
      }
      const rect = row.getBoundingClientRect();

      if (payload.type === 'workspace') {
        return { kind: 'invalid', indicator: invalidIndicator(rect) };
      }

      const zone = info.kind === 'directory' ? rowZone(clientY, rect) : fileRowZone(clientY, rect);
      const decision = decideNodeDrop(
        {
          workspaceId: payload.info.workspace.id,
          path: payload.info.path,
          kind: payload.info.kind,
        },
        {
          workspaceId: info.workspace.id,
          path: info.path,
          name: info.name,
          kind: info.kind,
          parentPath: info.parentPath,
          available: info.workspace.available,
        },
        zone,
      );
      if (decision.kind === 'invalid') {
        return { kind: 'invalid', indicator: invalidIndicator(rect) };
      }
      const indicator =
        zone === 'middle' && info.kind === 'directory'
          ? intoIndicator(rect)
          : insertIndicator(rect, zone === 'after');
      return {
        kind: 'move',
        from: payload.info,
        toWorkspace: info.workspace,
        toDir: decision.toDir,
        insertPosition: decision.insertPosition,
        indicator,
      };
    },
    [],
  );

  const applyPlan = useCallback(
    async (plan: DropPlan) => {
      if (plan.kind === 'reorder-workspace') {
        await reorderSidebarWorkspaces(plan.orderedIds);
        return;
      }
      if (plan.kind !== 'move') {
        return;
      }
      const { from, toWorkspace, toDir, insertPosition } = plan;
      const { targetPath, workspaceChanged, needsMove } = resolveMoveTarget({
        fromWorkspaceId: from.workspace.id,
        fromPath: from.path,
        fromName: from.name,
        toWorkspaceId: toWorkspace.id,
        toDir,
      });

      let nextOrder: string[] | undefined;
      if (insertPosition) {
        const targetSiblings = findDirectoryNodes(toWorkspace, treeData, toDir);
        // 目标目录的兄弟顺序以当前渲染顺序为基准，未手动排过序时借此种下完整顺序。
        const baseNames = targetSiblings.map((node) => node.name);
        nextOrder = insertChildName(
          baseNames,
          from.name,
          insertPosition.targetName,
          insertPosition.position,
        );
      }

      if (!needsMove && !nextOrder) {
        return;
      }

      if (needsMove) {
        if (!workspaceChanged) {
          const ok = await moveWorkspaceFile(from.path, targetPath, from.workspace.path);
          if (!ok) {
            return;
          }
        } else {
          const ok = await moveWorkspaceFileAcross({
            sourceWorkspacePath: from.workspace.path,
            sourceRelativePath: from.path,
            targetWorkspacePath: toWorkspace.path,
            targetRelativePath: targetPath,
          });
          if (!ok) {
            return;
          }
        }
      }

      if (nextOrder) {
        setFileChildOrder(toWorkspace.path, toDir, nextOrder);
      }
    },
    [
      moveWorkspaceFile,
      moveWorkspaceFileAcross,
      reorderSidebarWorkspaces,
      setFileChildOrder,
      treeData,
    ],
  );

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button > 0) {
      return;
    }
    containerRef.current = event.currentTarget;
    const header = closestElement(event.target, '.adl-multitree-entry__header');
    if (header) {
      const entry = header.closest<HTMLElement>('[data-workspace-id]');
      const workspaceId = entry?.dataset.workspaceId;
      if (!workspaceId) {
        return;
      }
      lastPlanRef.current = null;
      sessionRef.current = {
        payload: { type: 'workspace', workspaceId },
        row: header,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        active: false,
      };
      return;
    }

    const row = closestElement(event.target, '[data-path]');
    if (!row) {
      return;
    }
    const entry = row.closest<HTMLElement>('[data-workspace-id]');
    const workspaceId = entry?.dataset.workspaceId;
    if (!workspaceId) {
      return;
    }
    const info = nodeMapRef.current.get(`${workspaceId}\u0000${row.dataset.path ?? ''}`);
    if (!info) {
      return;
    }
    lastPlanRef.current = null;
    sessionRef.current = {
      payload: { type: 'node', info },
      row,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    };
  }, []);

  const handleClickCapture = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (!suppressClickRef.current) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  }, []);

  useEffect(() => {
    const autoScroll = (clientY: number) => {
      const container = containerRef.current;
      const scroller = container?.closest<HTMLElement>('.adl-multitree-scroll');
      if (!scroller) {
        return;
      }
      const rect = scroller.getBoundingClientRect();
      if (clientY < rect.top + AUTO_SCROLL_EDGE) {
        scroller.scrollTop = Math.max(0, scroller.scrollTop - AUTO_SCROLL_STEP);
      } else if (clientY > rect.bottom - AUTO_SCROLL_EDGE) {
        scroller.scrollTop = Math.min(
          scroller.scrollHeight - scroller.clientHeight,
          scroller.scrollTop + AUTO_SCROLL_STEP,
        );
      }
    };

    const handleMove = (event: PointerEvent) => {
      const session = sessionRef.current;
      if (!session) {
        return;
      }
      // 只认发起拖拽的那根指针；鼠标拖拽在窗外松开时收不到 pointerup，
      // 未激活阶段看到「按键已松开」的移动事件就收尾，避免无按键拖拽残留。
      if (event.pointerId !== session.pointerId) {
        return;
      }
      if (!session.active && event.pointerType === 'mouse' && event.buttons === 0) {
        cleanup();
        return;
      }
      if (!session.active) {
        if (
          Math.hypot(event.clientX - session.startX, event.clientY - session.startY) <
          DRAG_THRESHOLD
        ) {
          return;
        }
        session.active = true;
        session.ghost = createDragGhost(session.row, event.clientX, event.clientY);
        try {
          session.row.setPointerCapture(session.pointerId);
        } catch {
          // Pointer capture is best-effort; window listeners still handle the drag.
        }
        document.body.classList.add('adl-tree-dnd-dragging');
      }
      event.preventDefault();
      session.ghost?.move(event.clientX, event.clientY);
      autoScroll(event.clientY);
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const plan = computeDrop(target, event.clientY, session.payload);
      lastPlanRef.current = plan;
      setIndicator(plan?.indicator ?? null);
      document.body.classList.toggle('adl-tree-dnd-not-allowed', plan?.kind === 'invalid');
    };

    const handleUp = (event: PointerEvent) => {
      const session = sessionRef.current;
      if (!session) {
        return;
      }
      if (event.pointerId !== session.pointerId) {
        return;
      }
      const wasActive = session.active;
      const plan = lastPlanRef.current;
      if (wasActive) {
        event.preventDefault();
        suppressClickRef.current = true;
        if (plan) {
          void applyPlan(plan);
        }
      }
      cleanup();
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    };

    const handleCancel = () => cleanup();

    const blockClick = (event: MouseEvent) => {
      if (!suppressClickRef.current) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    };

    window.addEventListener('pointermove', handleMove, { passive: false, capture: true });
    window.addEventListener('pointerup', handleUp, true);
    window.addEventListener('pointercancel', handleCancel, true);
    window.addEventListener('blur', cleanup);
    document.addEventListener('click', blockClick, true);
    document.addEventListener('auxclick', blockClick, true);
    return () => {
      window.removeEventListener('pointermove', handleMove, true);
      window.removeEventListener('pointerup', handleUp, true);
      window.removeEventListener('pointercancel', handleCancel, true);
      window.removeEventListener('blur', cleanup);
      document.removeEventListener('click', blockClick, true);
      document.removeEventListener('auxclick', blockClick, true);
    };
  }, [applyPlan, cleanup, computeDrop]);

  return {
    indicator,
    handlers: {
      onPointerDown: handlePointerDown,
      onClickCapture: handleClickCapture,
    },
  };
}
