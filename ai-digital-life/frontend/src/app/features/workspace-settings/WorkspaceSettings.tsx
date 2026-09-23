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
import { HintCardTrigger, HINT_TITLE_PREFIX } from '../../components/HintCard';
import type { ContainerId, DraggableWorkspace } from './WorkspaceSettingsTypes';
import { GROUP_RESET_PATCHES } from '../../components/settings/settingsGroups';
import { DEFAULT_MAX_CONCURRENT_WORKSPACES } from '../../../shared/defaultPreferences';

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

  const [maxConcurrent, setMaxConcurrent] = useState<number>(
    config?.maxConcurrentWorkspaces ?? DEFAULT_MAX_CONCURRENT_WORKSPACES,
  );
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
      const timerP = p;
      const timerPri = pri;
      const timerDef = def;
      const timerNat = nat;
      debounceRef.current = setTimeout(() => {
        void (async () => {
          try {
            const ok = await updatePreferences({
              maxConcurrentWorkspaces: timerP,
              workspacePriorityIds: timerPri,
              workspaceDeferredIds: timerDef,
              workspaceNaturalOrder: timerNat,
            });
            if (!ok) {
              throw new Error('updatePreferences returned false');
            }
            // 只有在 timer 未被 effect 清掉时才更新 lastPersistedRef，
            // 避免外部重置先落盘后被过期写入覆盖。
            if (debounceRef.current === undefined) {
              lastPersistedRef.current = {
                max: timerP,
                pri: timerPri,
                def: timerDef,
                nat: timerNat,
              };
            }
          } catch {
            lastPersistedRef.current = null;
          }
        })();
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
    // 与 computeLoadPhases 同语义：已配置 ID 按 naturalOrder 在前，未入任何列表的可见工作区追加末尾。
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
      // 从优先/延迟移除的工作区移回常规列表头部。
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

  // 本地最新值镜像（ref，不进 effect 依赖）：用于判断"本地已与外部一致"。
  // 注意：不能把本地 state 直接加入下面 effect 的依赖，否则每次击键都会触发 effect 并清掉刚调度的 debounce。
  const localRef = useRef({
    max: maxConcurrent,
    pri: priorityIds,
    def: deferredIds,
    nat: naturalOrder,
  });
  localRef.current = { max: maxConcurrent, pri: priorityIds, def: deferredIds, nat: naturalOrder };

  useEffect(() => {
    if (!hasConfig) {
      return;
    }
    // 本地已与外部一致（如新数组身份的内容相等更新）则直接返回：
    // 不得清掉在途 debounce，否则用户 200ms 内的编辑会静默丢失。
    // 内容确实不同时沿用"外部赢"语义（外部写入方已有 toast，本地静默跟随）。
    const local = localRef.current;
    if (
      local.max === (cfgMax ?? DEFAULT_MAX_CONCURRENT_WORKSPACES) &&
      sameIdList(local.pri, cfgPri ?? []) &&
      sameIdList(local.def, cfgDef ?? []) &&
      sameIdList(local.nat, cfgNat ?? [])
    ) {
      return;
    }
    const persisted = lastPersistedRef.current;
    const isOwnEcho =
      persisted !== null &&
      persisted.max === cfgMax &&
      sameIdList(persisted.pri, cfgPri ?? []) &&
      sameIdList(persisted.def, cfgDef ?? []) &&
      sameIdList(persisted.nat, cfgNat ?? []);
    // 第二守卫：persist 回显已到但用户在回显延迟内又做了新编辑时，
    // local≠cfg 走向"外部赢"分支——此处拦住，保护在途编辑不被覆盖。
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
    const patch = GROUP_RESET_PATCHES.workspace!();
    const nextMax = patch.maxConcurrentWorkspaces ?? DEFAULT_MAX_CONCURRENT_WORKSPACES;
    const nextPri = [...(patch.workspacePriorityIds ?? [])];
    const nextDef = [...(patch.workspaceDeferredIds ?? [])];
    const nextNat = [...(patch.workspaceNaturalOrder ?? [])];
    lastPersistedRef.current = { max: nextMax, pri: nextPri, def: nextDef, nat: nextNat };
    setMaxConcurrent(nextMax);
    setPriorityIds(nextPri);
    setDeferredIds(nextDef);
    setNaturalOrder(nextNat);
    void (async () => {
      try {
        const ok = await updatePreferences(patch);
        if (ok) {
          showToast(t.settingsResetComplete, 'success');
          return;
        }
        throw new Error('updatePreferences returned false');
      } catch {
        lastPersistedRef.current = null;
        const cfg = useAppStore.getState().appInfo?.config;
        setMaxConcurrent(cfg?.maxConcurrentWorkspaces ?? DEFAULT_MAX_CONCURRENT_WORKSPACES);
        setPriorityIds([...(cfg?.workspacePriorityIds ?? [])]);
        setDeferredIds([...(cfg?.workspaceDeferredIds ?? [])]);
        setNaturalOrder([...(cfg?.workspaceNaturalOrder ?? [])]);
        showToast(t.settingsUpdateFailed, 'error');
      }
    })();
  }, [updatePreferences, showToast, t]);

  // 优先命中可排序条目而非容器 droppable 做精确行内插入；空列表等无条目场景回退到容器追加。
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const pointerCollisions = pointerWithin(args);
    const itemCollisions = pointerCollisions.filter((c) => !String(c.id).startsWith('list-'));
    return itemCollisions.length > 0 ? itemCollisions : pointerCollisions;
  }, []);

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
          <div className="adl-settings-row adl-settings-row--flush">
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
                tooltipContent={`${HINT_TITLE_PREFIX}${t.listHintIntroTitle}\n${t.priorityListDesc}\n${t.priorityListTooltip}`}
                badgeLabel={t.optional}
                items={priorityWorkspaces}
                emptyText={t.priorityListEmpty}
                onRemove={(id) => handleRemove(id, 'priority')}
                removeLabel={t.removeWorkspace}
              />

              <SortableWorkspaceList
                kind="deferred"
                title={t.deferredList}
                tooltipContent={`${HINT_TITLE_PREFIX}${t.listHintIntroTitle}\n${t.deferredListDesc}\n${t.deferredListTooltip}`}
                badgeLabel={t.optional}
                items={deferredWorkspaces}
                emptyText={t.deferredListEmpty}
                onRemove={(id) => handleRemove(id, 'deferred')}
                removeLabel={t.removeWorkspace}
              />

              <SortableWorkspaceList
                kind="natural"
                title={t.workspaceTagList}
                tooltipContent={`${HINT_TITLE_PREFIX}${t.listHintIntroTitle}\n${t.workspaceTagListDesc}\n${t.workspaceTagListTooltip}`}
                items={naturalWorkspaces}
                emptyText={t.workspaceTagListEmpty}
                removeLabel={t.removeWorkspace}
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
