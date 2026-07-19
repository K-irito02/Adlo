import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../stores/slicedStore';
import { useTCopy } from '../../i18n/useTCopy';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import { TooltipSimple } from '../../components/Tooltip';
import { IconAlertTriangle } from '../../icons/status';
import { DndContext, DragOverlay, closestCorners } from '@dnd-kit/core';
import { useWorkspaceDnd } from './useWorkspaceDnd';
import { SortableWorkspaceList } from './SortableWorkspaceList';
import type { ContainerId, DraggableWorkspace } from './WorkspaceSettingsTypes';

export function WorkspaceSettings() {
  const { t } = useTCopy();
  const { appInfo, recentWorkspaces, updatePreferences } = useAppStore(
    useShallow((state) => ({
      appInfo: state.appInfo,
      recentWorkspaces: state.recentWorkspaces,
      updatePreferences: state.updatePreferences,
    }))
  );

  const config = appInfo?.config;

  const [maxConcurrent, setMaxConcurrent] = useState<number>(config?.maxConcurrentWorkspaces ?? 6);
  const [priorityIds, setPriorityIds] = useState<string[]>(config?.workspacePriorityIds ?? []);
  const [deferredIds, setDeferredIds] = useState<string[]>(config?.workspaceDeferredIds ?? []);
  const [naturalOrder, setNaturalOrder] = useState<string[]>(config?.workspaceNaturalOrder ?? []);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const persistChanges = useCallback(
    (p: number, pri: string[], def: string[], nat: string[]) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        updatePreferences({
          maxConcurrentWorkspaces: p,
          workspacePriorityIds: pri,
          workspaceDeferredIds: def,
          workspaceNaturalOrder: nat,
        });
      }, 200);
    },
    [updatePreferences]
  );

  const visibleWorkspaces = useMemo<DraggableWorkspace[]>(
    () =>
      recentWorkspaces
        .filter((w) => !w.removedFromSidebar && !w.hiddenFromRightPanels)
        .map((w) => ({ id: w.id, name: w.name })),
    [recentWorkspaces]
  );

  const priorityWorkspaces = useMemo<DraggableWorkspace[]>(
    () =>
      priorityIds
        .map((id) => visibleWorkspaces.find((w) => w.id === id))
        .filter((w): w is DraggableWorkspace => w !== undefined),
    [priorityIds, visibleWorkspaces]
  );

  const deferredWorkspaces = useMemo<DraggableWorkspace[]>(
    () =>
      deferredIds
        .map((id) => visibleWorkspaces.find((w) => w.id === id))
        .filter((w): w is DraggableWorkspace => w !== undefined),
    [deferredIds, visibleWorkspaces]
  );

  const naturalWorkspaces = useMemo<DraggableWorkspace[]>(
    () =>
      naturalOrder
        .map((id) => visibleWorkspaces.find((w) => w.id === id))
        .filter((w): w is DraggableWorkspace => w !== undefined),
    [naturalOrder, visibleWorkspaces]
  );

  const handleDndChange = useCallback(
    (next: { priority: string[]; deferred: string[]; natural: string[] }) => {
      setPriorityIds(next.priority);
      setDeferredIds(next.deferred);
      setNaturalOrder(next.natural);
      persistChanges(maxConcurrent, next.priority, next.deferred, next.natural);
    },
    [maxConcurrent, persistChanges]
  );

  const dnd = useWorkspaceDnd({
    priorityIds,
    deferredIds,
    naturalOrder,
    visibleWorkspaces,
    onChange: handleDndChange,
  });

  const handleConcurrentChange = useCallback(
    (value: number) => {
      const clamped = Math.min(20, Math.max(1, value));
      setMaxConcurrent(clamped);
      persistChanges(clamped, priorityIds, deferredIds, naturalOrder);
    },
    [priorityIds, deferredIds, naturalOrder, persistChanges]
  );

  const handleRemove = useCallback(
    (id: string, fromList: ContainerId) => {
      // Removing from priority/deferred moves back to natural (head)
      if (fromList === 'priority') {
        const nextPri = priorityIds.filter((i) => i !== id);
        const nextNat = [id, ...naturalOrder];
        setPriorityIds(nextPri);
        setNaturalOrder(nextNat);
        persistChanges(maxConcurrent, nextPri, deferredIds, nextNat);
      } else if (fromList === 'deferred') {
        const nextDef = deferredIds.filter((i) => i !== id);
        const nextNat = [id, ...naturalOrder];
        setDeferredIds(nextDef);
        setNaturalOrder(nextNat);
        persistChanges(maxConcurrent, priorityIds, nextDef, nextNat);
      }
    },
    [priorityIds, deferredIds, naturalOrder, maxConcurrent, persistChanges]
  );

  const handleMoveUp = useCallback(
    (id: string, list: 'priority' | 'deferred') => {
      const ids = list === 'priority' ? [...priorityIds] : [...deferredIds];
      const idx = ids.indexOf(id);
      if (idx > 0) {
        [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
        if (list === 'priority') {
          setPriorityIds(ids);
          persistChanges(maxConcurrent, ids, deferredIds, naturalOrder);
        } else {
          setDeferredIds(ids);
          persistChanges(maxConcurrent, priorityIds, ids, naturalOrder);
        }
      }
    },
    [priorityIds, deferredIds, naturalOrder, maxConcurrent, persistChanges]
  );

  const handleMoveDown = useCallback(
    (id: string, list: 'priority' | 'deferred') => {
      const ids = list === 'priority' ? [...priorityIds] : [...deferredIds];
      const idx = ids.indexOf(id);
      if (idx < ids.length - 1) {
        [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
        if (list === 'priority') {
          setPriorityIds(ids);
          persistChanges(maxConcurrent, ids, deferredIds, naturalOrder);
        } else {
          setDeferredIds(ids);
          persistChanges(maxConcurrent, priorityIds, ids, naturalOrder);
        }
      }
    },
    [priorityIds, deferredIds, naturalOrder, maxConcurrent, persistChanges]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <div className="adl-settings-section">
      <SettingsHeader title={t.settingsWorkspaceLoad} />

      <div className="adl-settings-row">
        <div className="adl-settings-row__label">
          <div className="adl-settings-row__label-text">
            <span>{t.maxConcurrentWorkspaces}</span>
            <TooltipSimple
              content={t.maxConcurrentWorkspacesDesc}
              sideOffset={4}
              dismissible
              maxWidth={280}
            >
              <button
                type="button"
                className="adl-icon-button adl-icon-button--info"
                tabIndex={-1}
                aria-label=""
              >
                <IconAlertTriangle size={16} />
              </button>
            </TooltipSimple>
          </div>
        </div>
        <div className="adl-settings-row__control">
          <input
            type="number"
            value={maxConcurrent}
            min={1}
            max={20}
            onChange={(e) => handleConcurrentChange(parseInt(e.target.value, 10) || 1)}
            className="adl-settings-input adl-settings-input--number"
          />
        </div>
      </div>

      <hr className="adl-settings-divider" />

      <DndContext
        sensors={dnd.sensors}
        collisionDetection={closestCorners}
        onDragStart={dnd.handleDragStart}
        onDragEnd={dnd.handleDragEnd}
      >
        <SortableWorkspaceList
          kind="priority"
          title={t.priorityList}
          desc={t.priorityListDesc}
          tooltipContent={t.priorityListTooltip}
          items={priorityWorkspaces}
          emptyText={t.priorityListEmpty}
          onRemove={(id) => handleRemove(id, 'priority')}
          onMoveUp={(id) => handleMoveUp(id, 'priority')}
          onMoveDown={(id) => handleMoveDown(id, 'priority')}
          moveUpLabel={t.moveUp}
          moveDownLabel={t.moveDown}
          removeLabel={t.removeWorkspace}
        />

        <SortableWorkspaceList
          kind="deferred"
          title={t.deferredList}
          desc={t.deferredListDesc}
          tooltipContent={t.deferredListTooltip}
          items={deferredWorkspaces}
          emptyText={t.deferredListEmpty}
          onRemove={(id) => handleRemove(id, 'deferred')}
          onMoveUp={(id) => handleMoveUp(id, 'deferred')}
          onMoveDown={(id) => handleMoveDown(id, 'deferred')}
          moveUpLabel={t.moveUp}
          moveDownLabel={t.moveDown}
          removeLabel={t.removeWorkspace}
        />

        <SortableWorkspaceList
          kind="natural"
          title={t.workspaceTagList}
          desc={t.workspaceTagListDesc}
          tooltipContent={t.workspaceTagListTooltip}
          items={naturalWorkspaces}
          emptyText={t.workspaceTagListEmpty}
          moveUpLabel={t.moveUp}
          moveDownLabel={t.moveDown}
          removeLabel={t.removeWorkspace}
        />

        <DragOverlay>
          {dnd.activeItem ? <div className="adl-drag-overlay">{dnd.activeItem.name}</div> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
