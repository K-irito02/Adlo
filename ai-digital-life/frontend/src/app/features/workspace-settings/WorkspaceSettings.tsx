import { useState, useCallback, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../stores/slicedStore';
import { useTCopy } from '../../i18n/useTCopy';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import { TooltipSimple } from '../../components/Tooltip';
import { IconMenu, IconClose } from '../../icons';
import { IconAlertTriangle } from '../../icons/status';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ContainerId, DraggableWorkspace } from './WorkspaceSettingsTypes';

function SortableItem({
  workspace,
  onRemove,
}: {
  workspace: DraggableWorkspace;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: workspace.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="adl-sortable-item">
      <button type="button" className="adl-sortable-handle" {...attributes} {...listeners}>
        <IconMenu size={14} />
      </button>
      <span className="adl-sortable-label">{workspace.name}</span>
      <button
        type="button"
        className="adl-sortable-remove"
        onClick={() => onRemove(workspace.id)}
        aria-label={`Remove ${workspace.name}`}
      >
        <IconClose size={14} />
      </button>
    </div>
  );
}

function DraggableItem({ workspace }: { workspace: DraggableWorkspace }) {
  return (
    <div className="adl-draggable-item">
      <IconMenu size={14} className="adl-drag-icon" />
      <span>{workspace.name}</span>
    </div>
  );
}

export function WorkspaceSettings() {
  const { t } = useTCopy();
  const { appInfo, recentWorkspaces, updatePreferences } = useAppStore(
    useShallow((state) => ({
      appInfo: state.appInfo,
      recentWorkspaces: state.recentWorkspaces,
      updatePreferences: state.updatePreferences,
    }))
  );

  const config = appInfo?.config as Record<string, unknown> | undefined;

  const [maxConcurrent, setMaxConcurrent] = useState<number>(
    (config?.maxConcurrentWorkspaces as number) ?? 6
  );
  const [priorityIds, setPriorityIds] = useState<string[]>(
    (config?.workspacePriorityIds as string[]) ?? []
  );
  const [deferredIds, setDeferredIds] = useState<string[]>(
    (config?.workspaceDeferredIds as string[]) ?? []
  );
  const [activeId, setActiveId] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const persistChanges = useCallback(
    (p: number, pri: string[], def: string[]) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updatePreferences({
          maxConcurrentWorkspaces: p,
          workspacePriorityIds: pri,
          workspaceDeferredIds: def,
        });
      }, 200);
    },
    [updatePreferences]
  );

  const visibleWorkspaces = useMemo(
    () =>
      recentWorkspaces
        .filter((w) => !w.removedFromSidebar && !w.hiddenFromRightPanels)
        .map((w) => ({ id: w.id, name: w.name })),
    [recentWorkspaces]
  );

  const priorityWorkspaces = useMemo(
    () => priorityIds.map((id) => visibleWorkspaces.find((w) => w.id === id)).filter(Boolean) as DraggableWorkspace[],
    [priorityIds, visibleWorkspaces]
  );

  const deferredWorkspaces = useMemo(
    () => deferredIds.map((id) => visibleWorkspaces.find((w) => w.id === id)).filter(Boolean) as DraggableWorkspace[],
    [deferredIds, visibleWorkspaces]
  );

  const naturalWorkspaces = useMemo(
    () =>
      visibleWorkspaces.filter(
        (w) => !priorityIds.includes(w.id) && !deferredIds.includes(w.id)
      ),
    [visibleWorkspaces, priorityIds, deferredIds]
  );

  const isPriorityTarget = (id: string): boolean => priorityIds.includes(id);
  const isDeferredTarget = (id: string): boolean => deferredIds.includes(id);

  const findContainer = (id: string): ContainerId => {
    if (priorityIds.includes(id)) return 'priority';
    if (deferredIds.includes(id)) return 'deferred';
    return 'natural';
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      if (!over || active.id === over.id) return;

      const itemId = active.id as string;
      const fromContainer = findContainer(itemId);
      const overId = over.id as string;
      const toContainer = findContainer(overId);

      if (fromContainer === toContainer) {
        const ids = fromContainer === 'priority'
          ? [...priorityIds]
          : fromContainer === 'deferred'
          ? [...deferredIds]
          : [];
        const oldIndex = ids.indexOf(itemId);
        const newIndex = ids.indexOf(overId);
        if (oldIndex !== -1 && newIndex !== -1) {
          ids.splice(oldIndex, 1);
          ids.splice(newIndex, 0, itemId);
          if (fromContainer === 'priority') {
            setPriorityIds(ids);
            persistChanges(maxConcurrent, ids, deferredIds);
          } else {
            setDeferredIds(ids);
            persistChanges(maxConcurrent, priorityIds, ids);
          }
        }
      } else {
        let newPriority = [...priorityIds];
        let newDeferred = [...deferredIds];
        const sourceList = fromContainer === 'priority' ? newPriority : fromContainer === 'deferred' ? newDeferred : null;
        const targetList = toContainer === 'priority' ? newPriority : toContainer === 'deferred' ? newDeferred : null;

        if (fromContainer !== 'natural' && sourceList) {
          const idx = sourceList.indexOf(itemId);
          if (idx !== -1) sourceList.splice(idx, 1);
        }

        if (toContainer !== 'natural' && targetList) {
          targetList.push(itemId);
        }

        newPriority = [...new Set(newPriority)];
        newDeferred = [...new Set(newDeferred)];

        setPriorityIds(newPriority);
        setDeferredIds(newDeferred);
        persistChanges(maxConcurrent, newPriority, newDeferred);
      }
    },
    [priorityIds, deferredIds, maxConcurrent, persistChanges, findContainer]
  );

  const handleConcurrentChange = useCallback(
    (value: number) => {
      const clamped = Math.min(20, Math.max(1, value));
      setMaxConcurrent(clamped);
      persistChanges(clamped, priorityIds, deferredIds);
    },
    [priorityIds, deferredIds, persistChanges]
  );

  const handleRemove = useCallback(
    (id: string, fromList: ContainerId) => {
      if (fromList === 'priority') {
        const next = priorityIds.filter((i) => i !== id);
        setPriorityIds(next);
        persistChanges(maxConcurrent, next, deferredIds);
      } else if (fromList === 'deferred') {
        const next = deferredIds.filter((i) => i !== id);
        setDeferredIds(next);
        persistChanges(maxConcurrent, priorityIds, next);
      }
    },
    [priorityIds, deferredIds, maxConcurrent, persistChanges]
  );

  const activeItem = activeId ? visibleWorkspaces.find((w) => w.id === activeId) : null;

  const prioritySortableIds = useMemo(() => priorityWorkspaces.map((w) => w.id), [priorityWorkspaces]);
  const deferredSortableIds = useMemo(() => deferredWorkspaces.map((w) => w.id), [deferredWorkspaces]);

  return (
    <div className="adl-settings-section">
      <SettingsHeader title={t.settingsWorkspaceLoad} />

      <div className="adl-settings-row">
        <div className="adl-settings-row__label">
          <span>{t.maxConcurrentWorkspaces}</span>
          <TooltipSimple content={t.maxConcurrentWorkspacesDesc}>
            <button type="button" className="adl-icon-button adl-icon-button--info">
              <IconAlertTriangle size={16} />
            </button>
          </TooltipSimple>
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
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="adl-sortable-section">
          <h4 className="adl-sortable-section-title">
            {t.priorityList}
            <span className="adl-sortable-section-desc">{t.priorityListDesc}</span>
          </h4>
          <SortableContext items={prioritySortableIds} strategy={verticalListSortingStrategy}>
            <div className="adl-sortable-list">
              {priorityWorkspaces.length === 0 ? (
                <div className="adl-sortable-empty">{t.priorityListEmpty}</div>
              ) : (
                priorityWorkspaces.map((w) => (
                  <SortableItem key={w.id} workspace={w} onRemove={(id) => handleRemove(id, 'priority')} />
                ))
              )}
            </div>
          </SortableContext>
        </div>

        <div className="adl-sortable-section">
          <h4 className="adl-sortable-section-title">
            {t.deferredList}
            <span className="adl-sortable-section-desc">{t.deferredListDesc}</span>
          </h4>
          <SortableContext items={deferredSortableIds} strategy={verticalListSortingStrategy}>
            <div className="adl-sortable-list">
              {deferredWorkspaces.length === 0 ? (
                <div className="adl-sortable-empty">{t.deferredListEmpty}</div>
              ) : (
                deferredWorkspaces.map((w) => (
                  <SortableItem key={w.id} workspace={w} onRemove={(id) => handleRemove(id, 'deferred')} />
                ))
              )}
            </div>
          </SortableContext>
        </div>

        <div className="adl-sortable-section adl-sortable-section--natural">
          <h4 className="adl-sortable-section-title">
            {t.defaultOrderHint}
          </h4>
          <div className="adl-sortable-list">
            {naturalWorkspaces.length === 0 ? (
              <div className="adl-sortable-empty">All workspaces configured</div>
            ) : (
              naturalWorkspaces.map((w) => (
                <DraggableItem key={w.id} workspace={w} />
              ))
            )}
          </div>
        </div>

        <DragOverlay>
          {activeItem ? <div className="adl-drag-overlay">{activeItem.name}</div> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
