import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../stores/slicedStore';
import { useTCopy } from '../../i18n/useTCopy';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import { IconCircleHelp } from '../../icons/status';
import { IconMenu, IconClose } from '../../icons';
import { DndContext, pointerWithin, type CollisionDetection } from '@dnd-kit/core';
import { useWorkspaceDnd } from './useWorkspaceDnd';
import { SortableWorkspaceList } from './SortableWorkspaceList';
import { DragOverlayPortal } from '../../components/drag/DragOverlayPortal';
import { HintCardTrigger } from '../../components/HintCard';
import type { ContainerId, DraggableWorkspace } from './WorkspaceSettingsTypes';

export function WorkspaceSettings() {
  const { t } = useTCopy();
  const { appInfo, recentWorkspaces, updatePreferences } = useAppStore(
    useShallow((state) => ({
      appInfo: state.appInfo,
      recentWorkspaces: state.recentWorkspaces,
      updatePreferences: state.updatePreferences,
    })),
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
    [updatePreferences],
  );

  const visibleWorkspaces = useMemo<DraggableWorkspace[]>(
    () =>
      recentWorkspaces
        .filter((w) => !w.removedFromSidebar && w.available)
        .map((w) => ({ id: w.id, name: w.name })),
    [recentWorkspaces],
  );

  const priorityWorkspaces = useMemo<DraggableWorkspace[]>(
    () =>
      priorityIds
        .map((id) => visibleWorkspaces.find((w) => w.id === id))
        .filter((w): w is DraggableWorkspace => w !== undefined),
    [priorityIds, visibleWorkspaces],
  );

  const deferredWorkspaces = useMemo<DraggableWorkspace[]>(
    () =>
      deferredIds
        .map((id) => visibleWorkspaces.find((w) => w.id === id))
        .filter((w): w is DraggableWorkspace => w !== undefined),
    [deferredIds, visibleWorkspaces],
  );

  const naturalWorkspaces = useMemo<DraggableWorkspace[]>(() => {
    // Match computeLoadPhases semantics: configured IDs in naturalOrder first,
    // then strays (visible but not in any list) appended at the end. This keeps
    // the settings UI consistent with the actual load order on the current boot.
    const configured = new Set<string>([...priorityIds, ...deferredIds, ...naturalOrder]);
    const ordered = naturalOrder
      .map((id) => visibleWorkspaces.find((w) => w.id === id))
      .filter((w): w is DraggableWorkspace => w !== undefined);
    const strays = visibleWorkspaces.filter((w) => !configured.has(w.id));
    return [...ordered, ...strays];
  }, [naturalOrder, visibleWorkspaces, priorityIds, deferredIds]);

  const handleDndChange = useCallback(
    (next: { priority: string[]; deferred: string[]; natural: string[] }) => {
      setPriorityIds(next.priority);
      setDeferredIds(next.deferred);
      setNaturalOrder(next.natural);
      persistChanges(maxConcurrent, next.priority, next.deferred, next.natural);
    },
    [maxConcurrent, persistChanges],
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
    [priorityIds, deferredIds, naturalOrder, persistChanges],
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
    [priorityIds, deferredIds, naturalOrder, maxConcurrent, persistChanges],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // Prefer sortable items over container droppables for accurate in-list
  // insertion; falls back to container (e.g. empty list → append).
  const collisionDetection: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);
    const itemCollisions = pointerCollisions.filter((c) => !String(c.id).startsWith('list-'));
    return itemCollisions.length > 0 ? itemCollisions : pointerCollisions;
  };

  return (
    <div className="adl-settings-section adl-settings-workspace">
      <DndContext
        sensors={dnd.sensors}
        collisionDetection={collisionDetection}
        onDragStart={dnd.handleDragStart}
        onDragOver={dnd.handleDragOver}
        onDragEnd={dnd.handleDragEnd}
      >
        <div className="adl-settings-card" data-testid="workspace-load-card">
          <SettingsHeader title={t.settingsWorkspaceLoad} />
          <div className="adl-settings-row">
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
                <span>{t.maxConcurrentWorkspaces}</span>
                <HintCardTrigger content={t.maxConcurrentWorkspacesDesc}>
                  <button
                    type="button"
                    className="adl-icon-button adl-icon-button--info"
                    tabIndex={-1}
                    aria-label={t.maxConcurrentWorkspacesDesc}
                  >
                    <IconCircleHelp size={16} />
                  </button>
                </HintCardTrigger>
              </div>
            </div>
            <div className="adl-settings-row__control">
              <input
                type="number"
                value={maxConcurrent}
                min={1}
                max={20}
                onChange={(e) => handleConcurrentChange(parseInt(e.target.value, 10) || 1)}
                className="adl-settings-input"
              />
            </div>
          </div>
        </div>

        <div className="workspace-curtain">
          <div className="workspace-grid workspace-grid--cards">
            <div className="adl-settings-card adl-settings-card--grid">
              <SortableWorkspaceList
                kind="priority"
                title={t.priorityList}
                tooltipContent={`${t.priorityListDesc}\n\n${t.priorityListTooltip}`}
                badgeLabel={t.optional}
                items={priorityWorkspaces}
                emptyText={t.priorityListEmpty}
                onRemove={(id) => handleRemove(id, 'priority')}
                removeLabel={t.removeWorkspace}
                t={t}
              />
            </div>

            <div className="adl-settings-card adl-settings-card--grid">
              <SortableWorkspaceList
                kind="deferred"
                title={t.deferredList}
                tooltipContent={`${t.deferredListDesc}\n\n${t.deferredListTooltip}`}
                badgeLabel={t.optional}
                items={deferredWorkspaces}
                emptyText={t.deferredListEmpty}
                onRemove={(id) => handleRemove(id, 'deferred')}
                removeLabel={t.removeWorkspace}
                t={t}
              />
            </div>

            <div className="adl-settings-card adl-settings-card--grid">
              <SortableWorkspaceList
                kind="natural"
                title={t.workspaceTagList}
                tooltipContent={`${t.workspaceTagListDesc}\n\n${t.workspaceTagListTooltip}`}
                items={naturalWorkspaces}
                emptyText={t.workspaceTagListEmpty}
                removeLabel={t.removeWorkspace}
                t={t}
              />
            </div>
          </div>
        </div>

        <DragOverlayPortal
          visible={!!dnd.activeItem}
          position={{
            x: dnd.cursorPosition.x - dnd.grabOffset.x,
            y: dnd.cursorPosition.y - dnd.grabOffset.y,
          }}
          centered={false}
          width={dnd.sourceRect?.width}
          height={dnd.sourceRect?.height}
        >
          {dnd.activeItem ? (
            <>
              <span className="adl-sortable-handle">
                <IconMenu size={14} />
              </span>
              <span className="adl-sortable-label">{dnd.activeItem.name}</span>
              {dnd.activeContainer !== 'natural' && (
                <div className="adl-sortable-actions" aria-hidden="true">
                  <span className="adl-sortable-remove" style={{ visibility: 'hidden' }}>
                    <IconClose size={14} />
                  </span>
                </div>
              )}
            </>
          ) : null}
        </DragOverlayPortal>
      </DndContext>
    </div>
  );
}
