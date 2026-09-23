import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '../../stores/slicedStore';
import { useTCopy } from '../../i18n/useTCopy';
import { formatT } from '../../i18n/formatT';
import { SettingsHeader } from '../../components/settings/SettingsHeader';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { IconCircleHelp } from '../../icons/status';
import { IconMenu, IconClose, IconResetDefaults } from '../../icons';
import { DndContext, pointerWithin, type CollisionDetection } from '@dnd-kit/core';
import { useWorkspaceDnd } from './useWorkspaceDnd';
import { SortableWorkspaceList } from './SortableWorkspaceList';
import { DragOverlayPortal } from '../../components/drag/DragOverlayPortal';
import { HintCardTrigger } from '../../components/HintCard';
import type { ContainerId, DraggableWorkspace } from './WorkspaceSettingsTypes';
import {
  DEFAULT_MAX_CONCURRENT_WORKSPACES,
  DEFAULT_WORKSPACE_PRIORITY_IDS,
  DEFAULT_WORKSPACE_DEFERRED_IDS,
  DEFAULT_WORKSPACE_NATURAL_ORDER,
} from '../../../shared/defaultPreferences';

function sameIdList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

interface LastPersistedValues {
  max: number;
  pri: string[];
  def: string[];
  nat: string[];
}

export function WorkspaceSettings() {
  const { t } = useTCopy();
  const { appInfo, recentWorkspaces, updatePreferences, showToast } = useAppStore(
    useShallow((state) => ({
      appInfo: state.appInfo,
      recentWorkspaces: state.recentWorkspaces,
      updatePreferences: state.updatePreferences,
      showToast: state.showToast,
    })),
  );

  const config = appInfo?.config;

  const [maxConcurrent, setMaxConcurrent] = useState<number>(config?.maxConcurrentWorkspaces ?? 6);
  const [priorityIds, setPriorityIds] = useState<string[]>(config?.workspacePriorityIds ?? []);
  const [deferredIds, setDeferredIds] = useState<string[]>(config?.workspaceDeferredIds ?? []);
  const [naturalOrder, setNaturalOrder] = useState<string[]>(config?.workspaceNaturalOrder ?? []);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastPersistedRef = useRef<LastPersistedValues | null>(null);

  const persistChanges = useCallback(
    (p: number, pri: string[], def: string[], nat: string[]) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        lastPersistedRef.current = { max: p, pri, def, nat };
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

  const cfgMax = config?.maxConcurrentWorkspaces;
  const cfgPri = config?.workspacePriorityIds;
  const cfgDef = config?.workspaceDeferredIds;
  const cfgNat = config?.workspaceNaturalOrder;
  const hasConfig = config !== undefined;

  useEffect(() => {
    if (!hasConfig) {
      return;
    }
    const persisted = lastPersistedRef.current;
    const isOwnEcho =
      persisted !== null &&
      persisted.max === cfgMax &&
      sameIdList(persisted.pri, cfgPri ?? []) &&
      sameIdList(persisted.def, cfgDef ?? []) &&
      sameIdList(persisted.nat, cfgNat ?? []);
    if (isOwnEcho) {
      return;
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = undefined;
    }
    setMaxConcurrent((prev) => {
      const next = cfgMax ?? DEFAULT_MAX_CONCURRENT_WORKSPACES;
      return prev === next ? prev : next;
    });
    setPriorityIds((prev) => {
      const next = cfgPri ?? [];
      return sameIdList(prev, next) ? prev : [...next];
    });
    setDeferredIds((prev) => {
      const next = cfgDef ?? [];
      return sameIdList(prev, next) ? prev : [...next];
    });
    setNaturalOrder((prev) => {
      const next = cfgNat ?? [];
      return sameIdList(prev, next) ? prev : [...next];
    });
  }, [hasConfig, cfgMax, cfgPri, cfgDef, cfgNat]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const groupLabel = t.settingsWorkspaceLoad;
  const resetLabel = formatT(t, 'settingsResetGroupToDefault', { group: groupLabel });

  const handleCancelReset = useCallback(() => {
    setConfirmResetOpen(false);
  }, []);

  const handleConfirmReset = useCallback(() => {
    setConfirmResetOpen(false);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = undefined;
    }
    const nextMax = DEFAULT_MAX_CONCURRENT_WORKSPACES;
    const nextPri = [...DEFAULT_WORKSPACE_PRIORITY_IDS];
    const nextDef = [...DEFAULT_WORKSPACE_DEFERRED_IDS];
    const nextNat = [...DEFAULT_WORKSPACE_NATURAL_ORDER];
    lastPersistedRef.current = { max: nextMax, pri: nextPri, def: nextDef, nat: nextNat };
    setMaxConcurrent(nextMax);
    setPriorityIds(nextPri);
    setDeferredIds(nextDef);
    setNaturalOrder(nextNat);
    void (async () => {
      const ok = await updatePreferences({
        maxConcurrentWorkspaces: nextMax,
        workspacePriorityIds: nextPri,
        workspaceDeferredIds: nextDef,
        workspaceNaturalOrder: nextNat,
      });
      showToast(ok ? t.settingsResetComplete : t.settingsUpdateFailed, ok ? 'success' : 'error');
    })();
  }, [updatePreferences, showToast, t]);

  const collisionDetection: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);
    const itemCollisions = pointerCollisions.filter((c) => !String(c.id).startsWith('list-'));
    return itemCollisions.length > 0 ? itemCollisions : pointerCollisions;
  };

  return (
    <div className="adl-settings-section adl-settings-workspace">
      <div className="adl-settings-workspace__header">
        <button
          type="button"
          className="adl-settings-row__reset"
          aria-label={resetLabel}
          title={resetLabel}
          onClick={() => setConfirmResetOpen(true)}
        >
          <IconResetDefaults size={14} decorative />
        </button>
        <SettingsHeader title={groupLabel} />
      </div>
      <DndContext
        sensors={dnd.sensors}
        collisionDetection={collisionDetection}
        onDragStart={dnd.handleDragStart}
        onDragOver={dnd.handleDragOver}
        onDragEnd={dnd.handleDragEnd}
      >
        <div className="adl-settings-card" data-testid="workspace-load-card">
          <div className="adl-settings-row">
            <div className="adl-settings-row__label">
              <div className="adl-settings-row__label-text">
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
                <span>{t.maxConcurrentWorkspaces}</span>
              </div>
            </div>
            <div className="adl-settings-row__control">
              <input
                type="number"
                value={maxConcurrent}
                min={1}
                max={20}
                onChange={(e) => handleConcurrentChange(parseInt(e.target.value, 10) || 1)}
                className="adl-settings-input adl-settings-input--narrow"
              />
            </div>
          </div>

          <div className="workspace-curtain">
            <div className="workspace-grid">
              <SortableWorkspaceList
                kind="priority"
                title={t.priorityList}
                tooltipContent={`# ${t.listHintIntroTitle}\n${t.priorityListDesc}\n${t.priorityListTooltip}`}
                badgeLabel={t.optional}
                items={priorityWorkspaces}
                emptyText={t.priorityListEmpty}
                onRemove={(id) => handleRemove(id, 'priority')}
                removeLabel={t.removeWorkspace}
                t={t}
              />

              <SortableWorkspaceList
                kind="deferred"
                title={t.deferredList}
                tooltipContent={`# ${t.listHintIntroTitle}\n${t.deferredListDesc}\n${t.deferredListTooltip}`}
                badgeLabel={t.optional}
                items={deferredWorkspaces}
                emptyText={t.deferredListEmpty}
                onRemove={(id) => handleRemove(id, 'deferred')}
                removeLabel={t.removeWorkspace}
                t={t}
              />

              <SortableWorkspaceList
                kind="natural"
                title={t.workspaceTagList}
                tooltipContent={`# ${t.listHintIntroTitle}\n${t.workspaceTagListDesc}\n${t.workspaceTagListTooltip}`}
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
      <ConfirmDialog
        open={confirmResetOpen}
        title={formatT(t, 'settingsResetGroupConfirmTitle', { group: groupLabel })}
        message={formatT(t, 'settingsResetGroupConfirmMessage', { group: groupLabel })}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        onConfirm={handleConfirmReset}
        onCancel={handleCancelReset}
      />
    </div>
  );
}
