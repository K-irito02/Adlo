import { useCallback, useState } from 'react';
import { useAppStore } from '@stores/slicedStore';
import { useShallow } from 'zustand/react/shallow';
import { invokeIpc } from '../../../../tauri-bridge/tauri-shared';
import { BackgroundLayer } from './BackgroundLayer';
import { ShortcutGrid } from './ShortcutGrid';
import { LocalPortSection } from './LocalPortSection';
import { AddShortcutDialog } from './AddShortcutDialog';
import { AddManualPortDialog } from './AddManualPortDialog';
import { BackgroundSettingsDialog } from './BackgroundSettingsDialog';
import { PortConfigDialog } from './PortConfigDialog';
import type { ShortcutSite, LocalPort } from '@stores/slices/browserSlice';
import { ContextMenu } from '@components/ContextMenu';
import './BrowserLandingPage.css';

interface BrowserLandingPageProps {
  t: Record<string, string>;
  /**
   * 覆盖默认的「打开为新标签」回调：中心浏览器宿主用它把新标签移入中心
   * （`browserOpenTab` 后 `centerShowBrowserTab`）。缺省保持面板行为不变。
   */
  onOpenUrl?: (url: string) => void;
}

export function BrowserLandingPage({ t, onOpenUrl }: BrowserLandingPageProps) {
  const {
    browserBgConfig,
    browserOpenTab,
    browserAddShortcut,
    browserRenameShortcut,
    browserDeleteShortcut,
    browserAddManualPort,
    browserDeleteLocalPort,
    browserUpdateLocalPort,
  } = useAppStore(
    useShallow((state) => ({
      browserBgConfig: state.browserBgConfig,
      browserOpenTab: state.browserOpenTab,
      browserAddShortcut: state.browserAddShortcut,
      browserRenameShortcut: state.browserRenameShortcut,
      browserDeleteShortcut: state.browserDeleteShortcut,
      browserAddManualPort: state.browserAddManualPort,
      browserDeleteLocalPort: state.browserDeleteLocalPort,
      browserUpdateLocalPort: state.browserUpdateLocalPort,
    })),
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<'add' | 'rename'>('add');
  const [renameSite, setRenameSite] = useState<ShortcutSite | null>(null);
  const [manualPortOpen, setManualPortOpen] = useState(false);

  const [shortcutMenu, setShortcutMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    site: ShortcutSite | null;
  }>({ open: false, x: 0, y: 0, site: null });

  const [portMenu, setPortMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    port: LocalPort | null;
  }>({ open: false, x: 0, y: 0, port: null });

  const [renamePortId, setRenamePortId] = useState<string | null>(null);
  const [renamePortValue, setRenamePortValue] = useState('');

  const [bgSettingsOpen, setBgSettingsOpen] = useState(false);
  const [portConfigOpen, setPortConfigOpen] = useState(false);

  const [portDetailsOpen, setPortDetailsOpen] = useState(false);
  const [portDetails, setPortDetails] = useState<{
    port: number;
    isOpen: boolean;
    protocol: string;
    localAddress: string;
    processes: { pid: number; name: string; command: string }[];
    processError: string | null;
  } | null>(null);

  const handleOpenUrl = useCallback(
    (url: string) => {
      if (onOpenUrl) {
        onOpenUrl(url);
        return;
      }
      browserOpenTab(url, undefined, undefined);
    },
    [browserOpenTab, onOpenUrl],
  );

  const handleAddClick = () => {
    setDialogMode('add');
    setRenameSite(null);
    setDialogOpen(true);
  };

  const handleAddConfirm = useCallback(
    (name: string, url: string) => {
      if (dialogMode === 'add') {
        browserAddShortcut({ name, url });
      } else if (renameSite) {
        browserRenameShortcut(renameSite.id, name);
      }
      setDialogOpen(false);
      setRenameSite(null);
    },
    [dialogMode, renameSite, browserAddShortcut, browserRenameShortcut],
  );

  const handleAddCancel = () => {
    setDialogOpen(false);
    setRenameSite(null);
  };

  const handleShortcutContextMenu = (e: React.MouseEvent, site: ShortcutSite) => {
    e.preventDefault();
    setShortcutMenu({ open: true, x: e.clientX, y: e.clientY, site });
  };

  const handlePortContextMenu = (e: React.MouseEvent, port: LocalPort) => {
    e.preventDefault();
    setPortMenu({ open: true, x: e.clientX, y: e.clientY, port });
  };

  const handleContextMenuClose = useCallback(() => {
    setShortcutMenu({ open: false, x: 0, y: 0, site: null });
    setPortMenu({ open: false, x: 0, y: 0, port: null });
  }, []);

  const handleRenameShortcutFromMenu = useCallback(() => {
    if (shortcutMenu.site) {
      setRenameSite(shortcutMenu.site);
      setDialogMode('rename');
      setDialogOpen(true);
    }
    handleContextMenuClose();
  }, [shortcutMenu.site, handleContextMenuClose]);

  const handleDeleteShortcutFromMenu = useCallback(() => {
    if (shortcutMenu.site) {
      browserDeleteShortcut(shortcutMenu.site.id);
    }
    handleContextMenuClose();
  }, [shortcutMenu.site, browserDeleteShortcut, handleContextMenuClose]);

  const handleRenamePortFromMenu = useCallback(() => {
    if (portMenu.port) {
      setRenamePortId(portMenu.port.id);
      setRenamePortValue(portMenu.port.label ?? `localhost:${portMenu.port.port}`);
    }
    handleContextMenuClose();
  }, [portMenu.port, handleContextMenuClose]);

  const handleDeletePortFromMenu = useCallback(() => {
    if (portMenu.port) {
      browserDeleteLocalPort(portMenu.port.id);
    }
    handleContextMenuClose();
  }, [portMenu.port, browserDeleteLocalPort, handleContextMenuClose]);

  const handleViewPortDetailsFromMenu = useCallback(async () => {
    if (!portMenu.port) {
      return;
    }
    const portNum = portMenu.port.port;
    handleContextMenuClose();
    try {
      const result = await invokeIpc<{
        port: number;
        isOpen: boolean;
        protocol: string;
        localAddress: string;
        processes: { pid: number; name: string; command: string }[];
        processError: string | null;
      }>('browser_get_port_details', { port: portNum });
      if (result.ok) {
        setPortDetails(result.data);
        setPortDetailsOpen(true);
      } else {
        setPortDetails({
          port: portNum,
          isOpen: false,
          protocol: 'TCP',
          localAddress: `127.0.0.1:${portNum}`,
          processes: [],
          processError: null,
        });
        setPortDetailsOpen(true);
      }
    } catch {
      setPortDetails({
        port: portNum,
        isOpen: false,
        protocol: 'TCP',
        localAddress: `127.0.0.1:${portNum}`,
        processes: [],
        processError: null,
      });
      setPortDetailsOpen(true);
    }
  }, [portMenu.port, handleContextMenuClose]);

  const handleRenamePortSubmit = useCallback(() => {
    if (renamePortId) {
      browserUpdateLocalPort(renamePortId, { label: renamePortValue.trim() || undefined });
    }
    setRenamePortId(null);
    setRenamePortValue('');
  }, [renamePortId, renamePortValue, browserUpdateLocalPort]);

  const handleRenamePortKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleRenamePortSubmit();
      } else if (e.key === 'Escape') {
        setRenamePortId(null);
        setRenamePortValue('');
      }
    },
    [handleRenamePortSubmit],
  );

  const shortcutContextMenuItems = [
    {
      id: 'rename',
      label: t.browserRename,
      action: handleRenameShortcutFromMenu,
    },
    {
      id: 'delete',
      label: t.browserDelete,
      danger: true as const,
      action: handleDeleteShortcutFromMenu,
    },
  ];

  const portContextMenuItems = [
    {
      id: 'rename',
      label: t.browserLabelPort,
      action: handleRenamePortFromMenu,
    },
    {
      id: 'delete',
      label: t.browserDelete,
      danger: true as const,
      action: handleDeletePortFromMenu,
    },
    {
      id: 'details',
      label: t.browserViewDetails,
      action: handleViewPortDetailsFromMenu,
    },
  ];

  return (
    <div className="adl-browser-landing">
      <BackgroundLayer config={browserBgConfig} />
      <div className="adl-browser-landing__content">
        <ShortcutGrid
          t={t}
          onOpenUrl={handleOpenUrl}
          onAddClick={handleAddClick}
          onContextMenu={handleShortcutContextMenu}
        />
        <LocalPortSection
          t={t}
          onOpenUrl={handleOpenUrl}
          onAddManualPort={() => setManualPortOpen(true)}
          onContextMenu={handlePortContextMenu}
        />
      </div>
      <div className="adl-browser-landing__footer">
        <button
          type="button"
          className="adl-browser-landing__footer-btn"
          onClick={() => setPortConfigOpen(true)}
        >
          {t.browserPortSettings}
        </button>
        <span className="adl-browser-landing__footer-divider" />
        <button
          type="button"
          className="adl-browser-landing__footer-btn"
          onClick={() => setBgSettingsOpen(true)}
        >
          {t.browserCustomBg}
        </button>
      </div>

      <AddShortcutDialog
        open={dialogOpen}
        mode={dialogMode}
        t={t}
        initialName={renameSite?.name ?? ''}
        onConfirm={handleAddConfirm}
        onCancel={handleAddCancel}
      />

      <AddManualPortDialog
        open={manualPortOpen}
        t={t}
        onConfirm={(port, label) => {
          browserAddManualPort(port, label);
          setManualPortOpen(false);
        }}
        onCancel={() => setManualPortOpen(false)}
      />

      <BackgroundSettingsDialog
        open={bgSettingsOpen}
        t={t}
        onClose={() => setBgSettingsOpen(false)}
      />

      <PortConfigDialog open={portConfigOpen} t={t} onClose={() => setPortConfigOpen(false)} />

      {shortcutMenu.open && shortcutMenu.site && (
        <ContextMenu
          items={shortcutContextMenuItems}
          position={{ x: shortcutMenu.x, y: shortcutMenu.y }}
          onClose={handleContextMenuClose}
        />
      )}

      {portMenu.open && portMenu.port && (
        <ContextMenu
          items={portContextMenuItems}
          position={{ x: portMenu.x, y: portMenu.y }}
          onClose={handleContextMenuClose}
        />
      )}

      {portDetailsOpen && portDetails && (
        <div
          className="adl-prompt-modal"
          onClick={() => {
            setPortDetailsOpen(false);
            setPortDetails(null);
          }}
        >
          <div
            className="adl-prompt-modal__panel"
            role="dialog"
            aria-modal="true"
            aria-label={t.browserPortDetailsTitle}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="adl-prompt-modal__header">
              {t.browserPortDetailsTitle}
              <button
                type="button"
                className="adl-prompt-modal__header-close"
                onClick={() => {
                  setPortDetailsOpen(false);
                  setPortDetails(null);
                }}
                aria-label={t.browserClose}
              >
                ✕
              </button>
            </div>
            <div className="adl-prompt-modal__body">
              <div className="adl-browser-landing__port-details">
                <div className="adl-browser-landing__port-details-row">
                  <span className="adl-browser-landing__port-details-label">
                    {t.browserPortDetailsPort}
                  </span>
                  <span className="adl-browser-landing__port-details-value">
                    {portDetails.port}
                  </span>
                </div>
                <div className="adl-browser-landing__port-details-row">
                  <span className="adl-browser-landing__port-details-label">
                    {t.browserPortDetailsStatus}
                  </span>
                  <span
                    className={`adl-browser-landing__port-details-value ${
                      portDetails.isOpen
                        ? 'adl-browser-landing__port-details-value--open'
                        : 'adl-browser-landing__port-details-value--closed'
                    }`}
                  >
                    {portDetails.isOpen
                      ? t.browserPortDetailsStatusOpen
                      : t.browserPortDetailsStatusClosed}
                  </span>
                </div>
                <div className="adl-browser-landing__port-details-row">
                  <span className="adl-browser-landing__port-details-label">
                    {t.browserPortDetailsProtocol}
                  </span>
                  <span className="adl-browser-landing__port-details-value">
                    {portDetails.protocol}
                  </span>
                </div>
                <div className="adl-browser-landing__port-details-row">
                  <span className="adl-browser-landing__port-details-label">
                    {t.browserPortDetailsLocalAddress}
                  </span>
                  <span className="adl-browser-landing__port-details-value">
                    {portDetails.localAddress}
                  </span>
                </div>
                <div className="adl-browser-landing__port-details-section">
                  <span className="adl-browser-landing__port-details-label">
                    {t.browserPortDetailsProcesses}
                  </span>
                  {portDetails.processes.length > 0 ? (
                    <div className="adl-browser-landing__port-details-processes">
                      {portDetails.processes.map((proc) => (
                        <div key={proc.pid} className="adl-browser-landing__port-details-process">
                          <span className="adl-browser-landing__port-details-process-name">
                            {proc.name}
                          </span>
                          <span className="adl-browser-landing__port-details-process-pid">
                            PID: {proc.pid}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="adl-browser-landing__port-details-no-process">
                      {portDetails.processError
                        ? t.browserPortDetailsPermissionError
                        : t.browserPortDetailsNoProcess}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {renamePortId && (
        <div
          className="adl-prompt-modal"
          onClick={() => {
            setRenamePortId(null);
            setRenamePortValue('');
          }}
        >
          <div
            className="adl-prompt-modal__panel"
            role="dialog"
            aria-modal="true"
            aria-label={t.browserLabelPort}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="adl-prompt-modal__header">
              {t.browserLabelPort}
              <button
                type="button"
                className="adl-prompt-modal__header-close"
                onClick={() => {
                  setRenamePortId(null);
                  setRenamePortValue('');
                }}
                aria-label={t.browserClose}
              >
                ✕
              </button>
            </div>
            <div className="adl-prompt-modal__body">
              <input
                className="adl-prompt-modal__input"
                type="text"
                value={renamePortValue}
                onChange={(e) => setRenamePortValue(e.currentTarget.value)}
                onKeyDown={handleRenamePortKeyDown}
                autoFocus
              />
            </div>
            <div className="adl-prompt-modal__actions adl-prompt-modal__actions--fill">
              <button
                type="button"
                className="adl-btn adl-btn--ghost adl-btn--square"
                onClick={() => {
                  setRenamePortId(null);
                  setRenamePortValue('');
                }}
              >
                {t.browserCancel}
              </button>
              <button
                type="button"
                className="adl-btn adl-btn--primary adl-btn--square"
                onClick={handleRenamePortSubmit}
              >
                {t.browserSave}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
