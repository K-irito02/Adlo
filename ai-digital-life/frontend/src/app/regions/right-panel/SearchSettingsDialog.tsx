import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
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

type SearchSettingsTab = 'ignore' | 'limits';

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

  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | undefined>(undefined);
  // 草稿态：弹窗内一切修改只写草稿，点"保存"才落盘（关闭/取消即丢弃）。
  const [draftIgnored, setDraftIgnored] = useState<Record<string, string[]>>({});
  const [draftGitignore, setDraftGitignore] = useState<Record<string, boolean>>({});
  const [pageSizeDraft, setPageSizeDraft] = useState('200');
  const [maxResultsDraft, setMaxResultsDraft] = useState('5000');
  // 保存反馈：idle（保存）→ saving（loading 动画）→ saved（打勾）→ 回到 idle。
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const saveTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (open) {
      setTab('ignore');
      const store = useAppStore.getState();
      setSelectedWorkspaceId(activeWorkspaceId ?? visibleWorkspaces[0]?.id);
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

  const currentWorkspaceId = useMemo(() => {
    if (selectedWorkspaceId && visibleWorkspaces.some((w) => w.id === selectedWorkspaceId)) {
      return selectedWorkspaceId;
    }
    return activeWorkspaceId ?? visibleWorkspaces[0]?.id;
  }, [selectedWorkspaceId, activeWorkspaceId, visibleWorkspaces]);
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

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    },
    [onClose],
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
    if (saveState !== 'idle') {
      return;
    }
    setSaveState('saving');
    const startedAt = Date.now();
    const store = useAppStore.getState();
    const isLimits = tab !== 'ignore';
    if (!isLimits) {
      for (const [wsId, paths] of Object.entries(draftIgnored)) {
        store.setSearchIgnoredPaths(wsId, paths);
      }
      for (const [wsId, value] of Object.entries(draftGitignore)) {
        store.setSearchUseGitignore(wsId, value);
      }
    } else {
      const parsedPage = Math.floor(Number(pageSizeDraft));
      if (Number.isFinite(parsedPage)) {
        store.setSearchPageSize(parsedPage);
      }
      // 不变量 page ≤ max（与旧即时保存同语义）：步长调大时上限同步跟上，
      // 上限调小时步长同步收敛，避免"还有更多"却无处可点。
      if (store.searchPageSize > store.searchMaxResults) {
        store.setSearchMaxResults(store.searchPageSize);
      }
      const parsedMax = Math.floor(Number(maxResultsDraft));
      if (Number.isFinite(parsedMax)) {
        store.setSearchMaxResults(parsedMax);
      }
      if (store.searchMaxResults < store.searchPageSize) {
        store.setSearchPageSize(store.searchMaxResults);
      }
      setPageSizeDraft(String(useAppStore.getState().searchPageSize));
      setMaxResultsDraft(String(useAppStore.getState().searchMaxResults));
    }
    if (store.searchQuery.trim()) {
      try {
        if (isLimits) {
          // 新检索语义：窗口重置为新步长（`searchFiles` 内部取最新 store 值），
          // 结果区直接按新设置显示，无需再点加载更多。
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
  }, [saveState, tab, draftIgnored, draftGitignore, pageSizeDraft, maxResultsDraft]);

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
    <div className="adl-prompt-modal" onKeyDown={handleKeyDown} onClick={handleBackdrop}>
      <div
        className="adl-prompt-modal__panel adl-prompt-modal__panel--wide"
        role="dialog"
        aria-modal="true"
        aria-label={t.searchSettingsTitle as string}
      >
        <div className="adl-prompt-modal__header">
          <span className="adl-search-settings__title">
            {t.searchSettingsTitle as string}
            {/* 说明图标搬到标题右侧；内容仍按当前 tab 切换 */}
            <HintCardTrigger
              content={tab === 'ignore' ? <SearchIgnoreHelpCard /> : <SearchLimitsHelpCard />}
            >
              <button
                type="button"
                className="adl-icon-button adl-icon-button--info"
                tabIndex={-1}
                aria-label={
                  (tab === 'ignore'
                    ? t.searchSettingsIgnoreHintTitle
                    : t.searchSettingsLimitsHintTitle) as string
                }
              >
                <IconCircleHelp size={14} decorative />
              </button>
            </HintCardTrigger>
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
                workspaceId={currentWorkspaceId}
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
        ) : (
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
                {t.searchSettingsOverLimitWarn as string}
              </p>
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
            disabled={saveState !== 'idle'}
            aria-live="polite"
          >
            {saveState === 'saving' ? (
              <Spinner size="sm" speed="normal" />
            ) : saveState === 'saved' ? (
              <IconCheck size={14} decorative />
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
