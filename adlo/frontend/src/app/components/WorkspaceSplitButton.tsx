import { useEffect, useRef, useState } from 'react';
import { useTCopy } from '../i18n/useTCopy';
import { IconChevronRight, IconFolder, IconFolderOpen } from '../icons';

export type WorkspaceActionMode = 'pick' | 'open' | 'create';

interface WorkspaceSplitButtonProps {
  onPickWorkspaceDirectory: () => Promise<string | undefined>;
  onOpenWorkspace: (
    path: string,
    options?: { create?: boolean },
  ) => Promise<{ ok: boolean; error?: string }>;
  onClose?: () => void;
  initialMode?: WorkspaceActionMode;
  persistMode?: boolean;
  /** 模式变化回调：供宿主（如创建对话框）在页脚按当前模式展示对应引导文案。 */
  onModeChange?: (mode: WorkspaceActionMode) => void;
}

export function WorkspaceSplitButton({
  onPickWorkspaceDirectory,
  onOpenWorkspace,
  onClose,
  initialMode,
  persistMode = true,
  onModeChange,
}: WorkspaceSplitButtonProps) {
  const { t } = useTCopy();
  const [actionMode, setActionMode] = useState<WorkspaceActionMode>(() => {
    if (initialMode) {
      return initialMode;
    }
    const saved =
      typeof localStorage !== 'undefined' ? localStorage.getItem('adl_workspace_menu_mode') : null;
    return saved === 'pick' || saved === 'open' || saved === 'create' ? saved : 'pick';
  });
  const [actionDraft, setActionDraft] = useState('');
  const [actionError, setActionError] = useState('');
  const [defaultCreateDir, setDefaultCreateDir] = useState(() => {
    if (typeof localStorage === 'undefined') {
      return '';
    }
    return localStorage.getItem('adl_workspace_default_create_dir') || '';
  });
  const [createDirDraft, setCreateDirDraft] = useState('');
  const [splitMenuOpen, setSplitMenuOpen] = useState(false);
  const [settingPanelOpen, setSettingPanelOpen] = useState(false);
  const [processing, setProcessing] = useState(false);
  const splitHoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const settingsHoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (splitHoverTimer.current) {
        clearTimeout(splitHoverTimer.current);
      }
      if (settingsHoverTimer.current) {
        clearTimeout(settingsHoverTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    onModeChange?.(actionMode);
  }, [actionMode, onModeChange]);

  const handlePickDirectory = async () => {
    setProcessing(true);
    try {
      const selectedPath = await onPickWorkspaceDirectory();
      if (!selectedPath) {
        return;
      }
      await onOpenWorkspace(selectedPath);
      onClose?.();
    } finally {
      setProcessing(false);
    }
  };

  const handleOpenWorkspaceByPath = async (path: string) => {
    const normalized = path.trim();
    if (!normalized) {
      return;
    }
    setProcessing(true);
    setActionError('');
    try {
      const result = await onOpenWorkspace(normalized);
      if (!result.ok) {
        setActionError(t.workspacePathNotFound);
      } else {
        onClose?.();
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleCreateWorkspace = async (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) {
      return;
    }
    setProcessing(true);
    setActionError('');
    try {
      const isSimpleName = !/[\\/]/.test(trimmed);
      if (isSimpleName && (trimmed === '.' || trimmed === '..')) {
        setActionError(t.workspaceInvalidFolderName);
        return;
      }
      let resolvedPath: string;
      if (isSimpleName && defaultCreateDir) {
        resolvedPath = `${defaultCreateDir.replace(/\\/g, '/').replace(/\/+$/, '')}/${trimmed}`;
      } else {
        resolvedPath = trimmed;
      }
      const result = await onOpenWorkspace(resolvedPath, { create: true });
      if (!result.ok) {
        setActionError(result.error || t.workspacePathNotFound);
      } else {
        onClose?.();
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleSplitMainAction = () => {
    if (processing) {
      return;
    }
    if (actionMode === 'pick') {
      void handlePickDirectory();
    } else if (actionMode === 'open') {
      void handleOpenWorkspaceByPath(actionDraft);
    } else if (actionMode === 'create') {
      void handleCreateWorkspace(actionDraft);
    }
  };

  const handleActionModeChange = (mode: WorkspaceActionMode) => {
    if (splitHoverTimer.current) {
      clearTimeout(splitHoverTimer.current);
      splitHoverTimer.current = undefined;
    }
    if (settingsHoverTimer.current) {
      clearTimeout(settingsHoverTimer.current);
      settingsHoverTimer.current = undefined;
    }
    setActionMode(mode);
    setActionError('');
    setSettingPanelOpen(false);
    setSplitMenuOpen(false);
    if (persistMode) {
      try {
        localStorage.setItem('adl_workspace_menu_mode', mode);
      } catch {
        console.warn('[WorkspaceSplitButton] failed to persist menu mode');
      }
    }
  };

  const handleSplitDropEnter = () => {
    if (splitHoverTimer.current) {
      clearTimeout(splitHoverTimer.current);
      splitHoverTimer.current = undefined;
    }
    if (settingsHoverTimer.current) {
      clearTimeout(settingsHoverTimer.current);
      settingsHoverTimer.current = undefined;
    }
    setActionError('');
    setSettingPanelOpen(false);
    setSplitMenuOpen(true);
  };

  const handleSplitDropLeave = () => {
    if (splitHoverTimer.current) {
      clearTimeout(splitHoverTimer.current);
      splitHoverTimer.current = undefined;
    }
    if (settingsHoverTimer.current) {
      clearTimeout(settingsHoverTimer.current);
      settingsHoverTimer.current = undefined;
    }
    splitHoverTimer.current = setTimeout(() => setSplitMenuOpen(false), 300);
  };

  const handleSplitMenuEnter = () => {
    if (splitHoverTimer.current) {
      clearTimeout(splitHoverTimer.current);
    }
  };

  const handleSplitMenuLeave = () => {
    if (splitHoverTimer.current) {
      clearTimeout(splitHoverTimer.current);
    }
    splitHoverTimer.current = setTimeout(() => setSplitMenuOpen(false), 300);
  };

  const handleSettingsEnter = () => {
    if (settingsHoverTimer.current) {
      clearTimeout(settingsHoverTimer.current);
      settingsHoverTimer.current = undefined;
    }
    if (splitHoverTimer.current) {
      clearTimeout(splitHoverTimer.current);
      splitHoverTimer.current = undefined;
    }
    setCreateDirDraft(defaultCreateDir);
    setSplitMenuOpen(false);
    setSettingPanelOpen(true);
  };

  const handleSettingsLeave = () => {
    if (settingsHoverTimer.current) {
      clearTimeout(settingsHoverTimer.current);
      settingsHoverTimer.current = undefined;
    }
    if (splitHoverTimer.current) {
      clearTimeout(splitHoverTimer.current);
      splitHoverTimer.current = undefined;
    }
    settingsHoverTimer.current = setTimeout(() => setSettingPanelOpen(false), 300);
  };

  const handleSettingsPanelEnter = () => {
    if (settingsHoverTimer.current) {
      clearTimeout(settingsHoverTimer.current);
    }
  };

  const handleSettingsPanelLeave = () => {
    if (settingsHoverTimer.current) {
      clearTimeout(settingsHoverTimer.current);
    }
    settingsHoverTimer.current = setTimeout(() => setSettingPanelOpen(false), 300);
  };

  return (
    <>
      <div className="adl-split-btn" style={{ position: 'relative' }}>
        <button
          type="button"
          className="adl-split-btn__main"
          onClick={handleSplitMainAction}
          disabled={processing}
        >
          {actionMode === 'create' ? <IconFolder size={14} /> : <IconFolderOpen size={14} />}
          {actionMode === 'pick' && t.workspacePickDirectory}
          {actionMode === 'open' && t.workspaceOpenFolder}
          {actionMode === 'create' && t.workspaceCreateFolder}
        </button>
        <button
          type="button"
          className="adl-split-btn__drop"
          onMouseEnter={handleSplitDropEnter}
          onMouseLeave={handleSplitDropLeave}
          aria-haspopup="menu"
          aria-label={t.workspaceSwitchActionMode}
        >
          <IconChevronRight size={12} />
        </button>
        {splitMenuOpen ? (
          <div
            className="adl-split-btn__menu"
            onMouseEnter={handleSplitMenuEnter}
            onMouseLeave={handleSplitMenuLeave}
          >
            <button
              type="button"
              className={`adl-split-btn__option${actionMode === 'pick' ? ' is-active' : ''}`}
              onClick={() => {
                handleActionModeChange('pick');
                setSplitMenuOpen(false);
              }}
            >
              <IconFolderOpen size={14} />
              <span>{t.workspacePickDirectory}</span>
            </button>
            <button
              type="button"
              className={`adl-split-btn__option${actionMode === 'open' ? ' is-active' : ''}`}
              onClick={() => {
                handleActionModeChange('open');
                setSplitMenuOpen(false);
              }}
            >
              <IconFolderOpen size={14} />
              <span>{t.workspaceOpenFolder}</span>
            </button>
            <button
              type="button"
              className={`adl-split-btn__option${actionMode === 'create' ? ' is-active' : ''}`}
              onClick={() => {
                handleActionModeChange('create');
                setSplitMenuOpen(false);
              }}
            >
              <IconFolder size={14} />
              <span>{t.workspaceCreateFolder}</span>
            </button>
          </div>
        ) : null}
      </div>

      {actionMode === 'open' ? (
        <div className="adl-split-btn__input-area">
          <div className="adl-split-btn__input-row">
            <input
              className={`adl-split-btn__input${actionError ? ' adl-split-btn__input--error' : ''}`}
              value={actionDraft}
              onChange={(e) => {
                setActionDraft(e.currentTarget.value);
                if (actionError) {
                  setActionError('');
                }
              }}
              placeholder={t.workspaceOpenInputPlaceholder}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleOpenWorkspaceByPath(actionDraft);
                }
              }}
            />
          </div>
          {actionError ? <p className="adl-split-btn__error">{actionError}</p> : null}
        </div>
      ) : null}

      {actionMode === 'create' ? (
        <div className="adl-split-btn__input-area" style={{ position: 'relative' }}>
          <div className="adl-split-btn__input-row">
            <input
              className={`adl-split-btn__input${actionError ? ' adl-split-btn__input--error' : ''}`}
              value={actionDraft}
              onChange={(e) => {
                setActionDraft(e.currentTarget.value);
                if (actionError) {
                  setActionError('');
                }
              }}
              placeholder={t.workspaceCreateInputPlaceholder}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateWorkspace(actionDraft);
                }
              }}
            />
            <button
              type="button"
              className="adl-split-btn__dots"
              onMouseEnter={handleSettingsEnter}
              onMouseLeave={handleSettingsLeave}
              title={t.workspaceCreateDefaultDirTooltip}
            >
              <span>⋮</span>
            </button>
          </div>
          {actionError ? <p className="adl-split-btn__error">{actionError}</p> : null}

          {settingPanelOpen ? (
            <div
              className="adl-split-btn__settings"
              onMouseEnter={handleSettingsPanelEnter}
              onMouseLeave={handleSettingsPanelLeave}
            >
              <strong className="adl-split-btn__settings-title">
                {t.workspaceCreateDefaultDir}
              </strong>
              <div className="adl-split-btn__input-row">
                <input
                  className="adl-split-btn__input"
                  value={createDirDraft}
                  onChange={(e) => {
                    const val = e.currentTarget.value;
                    setCreateDirDraft(val);
                    setDefaultCreateDir(val);
                    try {
                      localStorage.setItem('adl_workspace_default_create_dir', val);
                    } catch {
                      console.warn('[WorkspaceSplitButton] failed to persist create dir default');
                    }
                  }}
                  placeholder={t.workspaceCreateDefaultDirPlaceholder}
                />
                <button
                  type="button"
                  className="adl-split-btn__dots"
                  aria-label={t.workspacePickDefaultDir}
                  onClick={() => {
                    void onPickWorkspaceDirectory().then((path) => {
                      if (path) {
                        setCreateDirDraft(path);
                        setDefaultCreateDir(path);
                        try {
                          localStorage.setItem('adl_workspace_default_create_dir', path);
                        } catch {
                          console.warn('[WorkspaceSplitButton] failed to persist create dir path');
                        }
                      }
                    });
                  }}
                >
                  <IconFolderOpen size={14} />
                </button>
              </div>
              <p className="adl-split-btn__settings-empty">
                {t.workspaceCreateDefaultDirEmptyHint}
              </p>
              <div className="adl-split-btn__settings-desc">
                <p>
                  <strong>{t.workspaceCreateDirDescName}</strong>
                  <span>{t.workspaceCreateDirDescNameDetail.replace('{name}', 'my-project')}</span>
                </p>
                <p>
                  <strong>{t.workspaceCreateDirDescFull}</strong>
                  <span>{t.workspaceCreateDirDescFullDetail}</span>
                </p>
                <p>
                  <strong>{t.workspaceCreateDirDescExists}</strong>
                  <span>{t.workspaceCreateDirDescExistsDetail}</span>
                </p>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
