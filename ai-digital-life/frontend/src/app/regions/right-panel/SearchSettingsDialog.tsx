import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useShallow } from 'zustand/react/shallow';
import { useTCopy } from '@i18n/useTCopy';
import { useAppStore } from '@stores/slicedStore';
import { IconCheck, IconClose, IconCircleHelp } from '@app/icons';
import { HintCardTrigger } from '@components/HintCard';
import { Spinner } from '@components/Spinner';
import { UnderlineTabs } from '@components/UnderlineTabs';
import { SearchIgnoreHelpCard } from './SearchIgnoreHelpCard';
import { SearchLimitsHelpCard } from './SearchLimitsHelpCard';
import { SearchIgnoreTree } from './SearchIgnoreTree';
import {
  SEARCH_HARD_MAX_RESULTS,
  SEARCH_MAX_RESULTS,
  SEARCH_PAGE_SIZE,
  SEARCH_PAGE_SIZE_MAX,
  SEARCH_PAGE_SIZE_MIN,
} from '../../../shared/ipc/searchWindow';

type SearchSettingsTab = 'ignore' | 'limits' | 'workspace';

interface SearchSettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

function SearchSettingsDialog({ open, onClose }: SearchSettingsDialogProps) {
  const { t, formatT } = useTCopy();
  const [tab, setTab] = useState<SearchSettingsTab>('ignore');

  const visibleWorkspaces = useAppStore(
    useShallow((s) => s.recentWorkspaces.filter((w) => !w.removedFromSidebar && w.available)),
  );
  const workspaceTrees = useAppStore(useShallow((s) => s.workspaceTrees));
  const activeWorkspaceId = useAppStore((s) => s.fileNavigatorActiveWorkspaceId);
  // 陈旧 id 派生回退（复审 M2）：该字段事项1 起跨重启持久化，被移除/隐藏的
  // 工作区 id 会一直留在盘上，直接当初始选中会指向不可见工作区。
  const validActiveWorkspaceId =
    activeWorkspaceId && visibleWorkspaces.some((w) => w.id === activeWorkspaceId)
      ? activeWorkspaceId
      : undefined;

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | undefined>(undefined);
  // 绑定草稿（绑定 tab；点"保存"才落盘并重搜）：跟随/固定模式 + 固定目标。
  const [draftFollow, setDraftFollow] = useState(true);
  const [draftPinnedId, setDraftPinnedId] = useState<string | undefined>(undefined);
  // 草稿态：弹窗内一切修改只写草稿，点"保存"才落盘（关闭/取消即丢弃）。
  const [draftIgnored, setDraftIgnored] = useState<Record<string, string[]>>({});
  const [draftGitignore, setDraftGitignore] = useState<Record<string, boolean>>({});
  const [pageSizeDraft, setPageSizeDraft] = useState('200');
  const [maxResultsDraft, setMaxResultsDraft] = useState('5000');
  // 保存反馈：idle（保存）→ saving（loading 动画）→ saved（打勾）→ 回到 idle。
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimerRef = useRef<number | undefined>(undefined);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // 打开前聚焦的元素：关闭时归还焦点（事项 F5 收尾）。
  const prevFocusRef = useRef<Element | null>(null);

  useEffect(() => {
    if (open) {
      setTab('ignore');
      const store = useAppStore.getState();
      setSelectedWorkspaceId(validActiveWorkspaceId ?? visibleWorkspaces[0]?.id);
      setDraftFollow(store.searchFollowWorkspace);
      const pinnedValid =
        store.searchPinnedWorkspaceId &&
        visibleWorkspaces.some((w) => w.id === store.searchPinnedWorkspaceId)
          ? store.searchPinnedWorkspaceId
          : undefined;
      setDraftPinnedId(pinnedValid ?? validActiveWorkspaceId ?? visibleWorkspaces[0]?.id);
      const ignored: Record<string, string[]> = {};
      const gitignore: Record<string, boolean> = {};
      for (const ws of visibleWorkspaces) {
        ignored[ws.id] = [...(store.searchIgnoredPaths[ws.id] ?? [])];
        gitignore[ws.id] = store.searchUseGitignore[ws.id] ?? true;
      }
      setDraftIgnored(ignored);
      setDraftGitignore(gitignore);
      setPageSizeDraft(String(store.searchPageSize));
      setMaxResultsDraft(String(store.searchMaxResults));
      setSaveState('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => () => window.clearTimeout(saveTimerRef.current), []);

  // 焦点管理：打开即聚焦面板（键盘可达），Escape 走 window 监听
  //（焦点在面板外也生效；容器 onKeyDown 冒泡不可靠，已移除）。
  // 关闭/卸载时把焦点还给打开前的元素（齿轮按钮）。
  useEffect(() => {
    if (!open) {
      return;
    }
    prevFocusRef.current = document.activeElement;
    panelRef.current?.focus();
    const handleWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        // 礼让内层已消费的 Escape（事项 L-3(a)）；模态下 stopPropagation 防背景误关。
        if (event.defaultPrevented) {
          return;
        }
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleWindowKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown, true);
      (prevFocusRef.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  const currentWorkspaceId = useMemo(() => {
    if (selectedWorkspaceId && visibleWorkspaces.some((w) => w.id === selectedWorkspaceId)) {
      return selectedWorkspaceId;
    }
    return validActiveWorkspaceId ?? visibleWorkspaces[0]?.id;
  }, [selectedWorkspaceId, validActiveWorkspaceId, visibleWorkspaces]);
  const currentNodes = useMemo(
    () => (currentWorkspaceId ? (workspaceTrees[currentWorkspaceId] ?? []) : []),
    [workspaceTrees, currentWorkspaceId],
  );
  const currentIgnored = useMemo(
    () => (currentWorkspaceId ? (draftIgnored[currentWorkspaceId] ?? []) : []),
    [draftIgnored, currentWorkspaceId],
  );
  const currentUseGitignore = useMemo(
    () => (currentWorkspaceId ? (draftGitignore[currentWorkspaceId] ?? true) : true),
    [draftGitignore, currentWorkspaceId],
  );

  const handleBackdrop = useCallback(
    (event: MouseEvent) => {
      if (event.target === event.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  const handleIgnoreChange = useCallback(
    (next: string[]) => {
      if (currentWorkspaceId) {
        const wsId = currentWorkspaceId;
        setDraftIgnored((prev) => ({ ...prev, [wsId]: next }));
      }
    },
    [currentWorkspaceId],
  );

  const handleGitignoreToggle = useCallback(() => {
    if (currentWorkspaceId) {
      const wsId = currentWorkspaceId;
      setDraftGitignore((prev) => ({ ...prev, [wsId]: !(prev[wsId] ?? true) }));
    }
  }, [currentWorkspaceId]);

  /**
   * 保存当前 tab 的草稿：落盘后若用户当前有检索内容，立即重跑使其生效
   * （不再等下次检索）。反馈序列：保存 → loading 动画 → 打勾 → 恢复。
   *
   * 重跑语义按 tab 区分：限制 tab 改的是窗口本身，必须按"新检索"重跑
   * （窗口重置为新步长，结果区直接变为新值）；忽略 tab 改的是过滤条件，
   * 原位重跑当前窗口即可（旧实现误用原位重跑导致新步长不生效，事项 26）。
   */
  const handleSave = useCallback(async () => {
    if (saveState === 'saving') {
      return;
    }
    setSaveState('saving');
    const startedAt = Date.now();
    const store = useAppStore.getState();
    const isLimits = tab === 'limits';
    const isWorkspace = tab === 'workspace';
    if (isWorkspace) {
      // 绑定设置：模式与固定目标均持久化；会话目标同步为本次选择后重搜。
      // （P4-R1-F3：只在固定模式写 pinned，跟随模式不动它；陈旧 pinned 保留不置 null。
      //  P4-R1-F8：跟随无有效高亮时回退首个可见工作区，与打开初始化同口径。）
      store.setSearchFollowWorkspace(draftFollow);
      let pinned: string | null = null;
      if (!draftFollow) {
        pinned =
          draftPinnedId && visibleWorkspaces.some((w) => w.id === draftPinnedId)
            ? draftPinnedId
            : store.searchPinnedWorkspaceId;
        store.setSearchPinnedWorkspaceId(pinned);
      }
      // 跟随→当前高亮（无则首个可见；仍无则由入口/回退承接）；
      // 固定→pinned（陈旧则回退高亮）。
      const nextTarget = draftFollow
        ? (validActiveWorkspaceId ?? visibleWorkspaces[0]?.id)
        : (pinned ?? validActiveWorkspaceId ?? visibleWorkspaces[0]?.id);
      store.setSearchTargetWorkspaceId(nextTarget);
    } else if (!isLimits) {
      // 弹窗打开期间新增的工作区不在 draft 快照里：保存时按 id 补齐，
      // 默认读 store 现值（而非空），避免覆盖弹窗期已到达的持久化名单（事项 N2）。
      const wsIds = new Set([
        ...visibleWorkspaces.map((w) => w.id),
        ...Object.keys(draftIgnored),
        ...Object.keys(draftGitignore),
      ]);
      for (const wsId of wsIds) {
        store.setSearchIgnoredPaths(
          wsId,
          draftIgnored[wsId] ?? store.searchIgnoredPaths[wsId] ?? [],
        );
        store.setSearchUseGitignore(
          wsId,
          draftGitignore[wsId] ?? store.searchUseGitignore[wsId] ?? true,
        );
      }
    } else {
      // 本地先算好钳制 + 收敛再一次性落盘：zustand set 同步产生新对象，
      // 旧 getState 快照读到的是修改前的值，不能拿它做不变量检查（事项 F1）。
      // 空串/纯空白视为无效输入，恢复原值（与帮助文案一致，事项 F6）。
      const clampPage = (v: number) =>
        Math.min(SEARCH_PAGE_SIZE_MAX, Math.max(SEARCH_PAGE_SIZE_MIN, Math.floor(v)));
      const clampMax = (v: number) =>
        Math.min(SEARCH_HARD_MAX_RESULTS, Math.max(SEARCH_PAGE_SIZE, Math.floor(v)));
      const rawPage = pageSizeDraft.trim() === '' ? NaN : Number(pageSizeDraft);
      const rawMax = maxResultsDraft.trim() === '' ? NaN : Number(maxResultsDraft);
      let nextPage = Number.isFinite(rawPage) ? clampPage(rawPage) : store.searchPageSize;
      let nextMax = Number.isFinite(rawMax) ? clampMax(rawMax) : store.searchMaxResults;
      // 不变量 page ≤ max：max 被调小则 page 收敛，否则 max 跟随 page。
      if (nextPage > nextMax) {
        if (Number.isFinite(rawMax) && nextMax !== store.searchMaxResults) {
          nextPage = nextMax;
        } else {
          nextMax = nextPage;
        }
      }
      store.setSearchPageSize(nextPage);
      store.setSearchMaxResults(nextMax);
      setPageSizeDraft(String(useAppStore.getState().searchPageSize));
      setMaxResultsDraft(String(useAppStore.getState().searchMaxResults));
    }
    if (store.searchQuery.trim()) {
      try {
        if (isLimits || isWorkspace) {
          // 新检索语义：窗口重置、或按新目标工作区重跑。
          await store.searchFiles(store.searchQuery);
        } else {
          await store.refreshSearchResults();
        }
      } catch {
        // 刷新失败不影响已落盘的设置：保持 saved 反馈，错误走 store 内建 toast 链路。
      }
    }
    // 保底 300ms：无在途检索时 loading 一闪而过看不清。
    const elapsed = Date.now() - startedAt;
    if (elapsed < 300) {
      await new Promise((resolve) => setTimeout(resolve, 300 - elapsed));
    }
    setSaveState('saved');
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => setSaveState('idle'), 1200);
  }, [
    saveState,
    tab,
    draftIgnored,
    draftGitignore,
    draftFollow,
    draftPinnedId,
    pageSizeDraft,
    maxResultsDraft,
    visibleWorkspaces,
    validActiveWorkspaceId,
  ]);

  const checkLabel = useCallback(
    (name: string) => formatT(t, 'searchSettingsCheckItem', { name }),
    [formatT, t],
  );

  // tab 导航与 Git 可视化热力聚合图共用共享 `UnderlineTabs`
  //（下划线动效 + 键盘导航一模一样）。
  const settingsTabs = useMemo(
    () => [
      { id: 'ignore' as SearchSettingsTab, label: t.searchSettingsIgnoreTab as string },
      { id: 'limits' as SearchSettingsTab, label: t.searchSettingsLimitsTab as string },
      { id: 'workspace' as SearchSettingsTab, label: t.searchSettingsWorkspaceTab as string },
    ],
    [t],
  );

  // 工具栏右侧扩展：只放 gitignore 开关（说明图标已搬到标题右侧，此处不再重复）。
  const settingsToolbarExtra = useMemo(
    () => (
      <label className="adl-search-settings__switch">
        <input
          type="checkbox"
          checked={currentUseGitignore}
          onChange={handleGitignoreToggle}
          disabled={!currentWorkspaceId}
        />
        {t.searchSettingsUseGitignore as string}
      </label>
    ),
    [currentUseGitignore, currentWorkspaceId, handleGitignoreToggle, t],
  );

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="adl-prompt-modal" onClick={handleBackdrop}>
      <div
        ref={panelRef}
        className="adl-prompt-modal__panel adl-prompt-modal__panel--wide"
        role="dialog"
        aria-modal="true"
        aria-label={t.searchSettingsTitle as string}
        tabIndex={-1}
      >
        <div className="adl-prompt-modal__header">
          <span className="adl-search-settings__title">
            {t.searchSettingsTitle as string}
            {/* 说明图标搬到标题右侧；绑定 tab 正文已有说明行，此处不重复
               （P4-R1-F7：此前误弹限制卡）。 */}
            {tab === 'workspace' ? null : (
              <HintCardTrigger
                content={tab === 'ignore' ? <SearchIgnoreHelpCard /> : <SearchLimitsHelpCard />}
              >
                <button
                  type="button"
                  className="adl-icon-button adl-icon-button--info"
                  aria-label={
                    (tab === 'ignore'
                      ? t.searchSettingsIgnoreHintTitle
                      : t.searchSettingsLimitsHintTitle) as string
                  }
                >
                  <IconCircleHelp size={14} decorative />
                </button>
              </HintCardTrigger>
            )}
          </span>
          <button
            type="button"
            className="adl-prompt-modal__header-close"
            onClick={onClose}
            aria-label={t.searchSettingsClose as string}
          >
            <IconClose size={14} decorative />
          </button>
        </div>

        <div className="adl-search-settings__tablist">
          <UnderlineTabs
            tabs={settingsTabs}
            activeId={tab}
            onChange={setTab}
            ariaLabel={t.searchSettingsTitle as string}
            idPrefix="search-settings-tab"
            navClassName="adl-underline-tabs__nav"
            tabClassName="adl-underline-tabs__tab"
            activeTabClassName="adl-underline-tabs__tab--active"
          />
        </div>

        {tab === 'ignore' ? (
          <div className="adl-search-settings__body">
            {visibleWorkspaces.length > 1 ? (
              <div className="adl-search-settings__workspaces" role="group">
                {visibleWorkspaces.map((ws) => (
                  <button
                    key={ws.id}
                    type="button"
                    className={`adl-tool-context__toggle-btn${ws.id === currentWorkspaceId ? ' is-active' : ''}`}
                    aria-pressed={ws.id === currentWorkspaceId ? 'true' : 'false'}
                    onClick={() => setSelectedWorkspaceId(ws.id)}
                    title={ws.path}
                  >
                    {ws.name || ws.path}
                  </button>
                ))}
              </div>
            ) : null}
            {currentWorkspaceId ? (
              <SearchIgnoreTree
                key={currentWorkspaceId}
                nodes={currentNodes}
                ignoredPaths={currentIgnored}
                onChange={handleIgnoreChange}
                expandLabel={t.fileExpandAll as string}
                collapseLabel={t.fileCollapseAll as string}
                checkLabel={checkLabel}
                emptyHint={t.searchSettingsEmptyTree as string}
                toolbarExtra={settingsToolbarExtra}
              />
            ) : (
              <p className="adl-empty-hint">{t.searchNoWorkspace as string}</p>
            )}
          </div>
        ) : tab === 'limits' ? (
          <div className="adl-search-settings__body">
            <div className="adl-search-settings__field">
              <label htmlFor="adl-search-settings-pagesize">
                {t.searchSettingsPageSize as string}
              </label>
              <input
                id="adl-search-settings-pagesize"
                type="number"
                className="adl-search-settings__input"
                min={SEARCH_PAGE_SIZE_MIN}
                max={SEARCH_PAGE_SIZE_MAX}
                value={pageSizeDraft}
                onChange={(event) => setPageSizeDraft(event.target.value)}
              />
            </div>
            <div className="adl-search-settings__field">
              <label htmlFor="adl-search-settings-maxresults">
                {t.searchSettingsMaxResults as string}
              </label>
              <input
                id="adl-search-settings-maxresults"
                type="number"
                className="adl-search-settings__input"
                // 下限与 store 钳制区间对齐（200）：之前误写成 5000，
                // 输入框提示"≥5000"而实际 200 也合法，前后矛盾。
                min={SEARCH_PAGE_SIZE}
                max={SEARCH_HARD_MAX_RESULTS}
                value={maxResultsDraft}
                onChange={(event) => setMaxResultsDraft(event.target.value)}
              />
            </div>
            {Number(maxResultsDraft) > SEARCH_MAX_RESULTS ? (
              <p className="adl-search-settings__warn" role="status">
                {formatT(t, 'searchSettingsOverLimitWarn', { warnAt: SEARCH_MAX_RESULTS })}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="adl-search-settings__body">
            <p className="adl-search-settings__tip">{t.searchSettingsWorkspaceHint as string}</p>
            <div
              className="adl-search-settings__workspaces adl-search-settings__workspaces--center"
              role="group"
            >
              <button
                type="button"
                className={`adl-tool-context__toggle-btn${draftFollow ? ' is-active' : ''}`}
                aria-pressed={draftFollow ? 'true' : 'false'}
                onClick={() => setDraftFollow(true)}
              >
                {t.searchSettingsBindFollow as string}
              </button>
              <button
                type="button"
                className={`adl-tool-context__toggle-btn${!draftFollow ? ' is-active' : ''}`}
                aria-pressed={!draftFollow ? 'true' : 'false'}
                onClick={() => setDraftFollow(false)}
              >
                {t.searchSettingsBindPinned as string}
              </button>
            </div>
            {!draftFollow ? (
              visibleWorkspaces.length > 0 ? (
                <div className="adl-search-settings__workspaces" role="group">
                  {visibleWorkspaces.map((ws) => (
                    <button
                      key={ws.id}
                      type="button"
                      className={`adl-tool-context__toggle-btn${ws.id === draftPinnedId ? ' is-active' : ''}`}
                      aria-pressed={ws.id === draftPinnedId ? 'true' : 'false'}
                      onClick={() => setDraftPinnedId(ws.id)}
                      title={ws.path}
                    >
                      {ws.name || ws.path}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="adl-empty-hint">{t.searchNoWorkspace as string}</p>
              )
            ) : null}
          </div>
        )}

        <div className="adl-prompt-modal__actions adl-prompt-modal__actions--fill">
          <button
            type="button"
            className="adl-btn adl-btn--secondary adl-btn--square"
            onClick={onClose}
          >
            {t.searchSettingsClose as string}
          </button>
          <button
            type="button"
            className="adl-btn adl-btn--primary adl-btn--square"
            onClick={() => void handleSave()}
            // saved 态仍可点（用户改完输入可立即再存）；仅保存中禁用防重入。
            disabled={saveState === 'saving'}
            aria-live="polite"
          >
            {saveState === 'saving' ? (
              <Spinner size="sm" speed="normal" />
            ) : saveState === 'saved' ? (
              <>
                <IconCheck size={14} decorative />
                <span className="sr-only">{t.searchSettingsSaved as string}</span>
              </>
            ) : (
              (t.searchSettingsSave as string)
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export { SearchSettingsDialog };
export type { SearchSettingsDialogProps };
