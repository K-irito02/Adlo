import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  IconChevronDown,
  IconEye,
  IconGitBranch,
  IconMoreVertical,
  IconPanelLeft,
  IconPanelLeftClose,
  IconUpload,
} from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import { useTCopy } from '@i18n/useTCopy';

export interface ChangesMenuItem {
  id: string;
  label?: string;
  checked?: boolean;
  disabled?: boolean;
  separator?: boolean;
  action?: () => void;
}

export interface ChangesTopToolbarProps {
  navigatorCollapsed: boolean;
  onToggleNavigator: () => void;
  branchOptions: string[];
  selectedBranch: string;
  onSelectBranch: (branch: string) => void;
  hasActivePatchSet: boolean;
  diffSideBySide: boolean;
  onSetDiffLayout: (sideBySide: boolean) => void;
  hasChangePreview: boolean;
  previewEnabled: boolean;
  onTogglePreview: () => void;
  changesMenuItems: ChangesMenuItem[];
}

export function ChangesTopToolbar({
  navigatorCollapsed,
  onToggleNavigator,
  branchOptions,
  selectedBranch,
  onSelectBranch,
  hasActivePatchSet,
  diffSideBySide,
  onSetDiffLayout,
  hasChangePreview,
  previewEnabled,
  onTogglePreview,
  changesMenuItems,
}: ChangesTopToolbarProps) {
  const { t } = useTCopy();
  const [branchMenuPos, setBranchMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [changesMenuOpen, setChangesMenuOpen] = useState(false);
  const branchMenuWrapRef = useRef<HTMLDivElement | null>(null);
  const changesMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!branchMenuPos) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (branchMenuWrapRef.current?.contains(target)) {
        return;
      }
      const portalMenu = document.querySelector('[data-branch-menu="true"]');
      if (portalMenu?.contains(target)) {
        return;
      }
      setBranchMenuPos(null);
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setBranchMenuPos(null);
      }
    };
    const handleScroll = () => setBranchMenuPos(null);

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [branchMenuPos]);

  useEffect(() => {
    if (!changesMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!changesMenuRef.current?.contains(target)) {
        setChangesMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [changesMenuOpen]);

  return (
    <div className="adl-tool-context adl-tool-context--files" aria-label={t.toolChanges}>
      <div className="adl-tool-context__group adl-tool-context__group--grow adl-tool-context__group--files">
        <TooltipSimple content={t.panelNavigatorToggle} placement="top">
          <button
            type="button"
            className="adl-tool-context__iconbtn adl-tool-context__iconbtn--leading"
            onClick={onToggleNavigator}
            aria-pressed={!navigatorCollapsed}
            aria-label={t.panelNavigatorToggle}
          >
            {navigatorCollapsed ? (
              <IconPanelLeftClose size={14} decorative />
            ) : (
              <IconPanelLeft size={14} decorative />
            )}
          </button>
        </TooltipSimple>
        <div ref={branchMenuWrapRef} className="adl-menu adl-file-context__menu">
          <TooltipSimple content={t.changesSummaryBranch} placement="top">
            <button
              type="button"
              className={`adl-branch-pill adl-branch-pill--button${branchMenuPos ? ' is-open' : ''}`}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setBranchMenuPos((prev) => (prev ? null : { top: rect.bottom, left: rect.left }));
              }}
              aria-label={t.changesSummaryBranch}
              aria-haspopup="menu"
              aria-expanded={!!branchMenuPos}
            >
              <IconGitBranch size={12} decorative />
              <span>{selectedBranch}</span>
              <IconChevronDown size={12} decorative />
            </button>
          </TooltipSimple>
          {branchMenuPos
            ? createPortal(
                <div
                  className="adl-branch-menu__dropdown"
                  data-branch-menu="true"
                  role="menu"
                  style={{ top: branchMenuPos.top, left: branchMenuPos.left }}
                >
                  {branchOptions.map((branch) => (
                    <TooltipSimple key={branch} content={branch} placement="right">
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={branch === selectedBranch}
                        className="adl-menu__item"
                        onClick={() => {
                          onSelectBranch(branch);
                          setBranchMenuPos(null);
                        }}
                      >
                        <span className="adl-menu__label adl-menu__label--branch">{branch}</span>
                      </button>
                    </TooltipSimple>
                  ))}
                </div>,
                document.body
              )
            : null}
        </div>
        {!hasActivePatchSet ? (
          <TooltipSimple content={t.diffLayoutLabel} placement="top">
            <div
              className="adl-tool-context__diff-view"
              role="group"
              aria-label={t.diffLayoutLabel}
            >
              <button
                type="button"
                className={`adl-tool-context__toggle-btn${!diffSideBySide ? ' is-active' : ''}`}
                aria-pressed={!diffSideBySide ? 'true' : 'false'}
                disabled={!hasChangePreview}
                onClick={() => onSetDiffLayout(false)}
              >
                {t.diffLayoutInline}
              </button>
              <button
                type="button"
                className={`adl-tool-context__toggle-btn${diffSideBySide ? ' is-active' : ''}`}
                aria-pressed={diffSideBySide ? 'true' : 'false'}
                disabled={!hasChangePreview}
                onClick={() => onSetDiffLayout(true)}
              >
                {t.diffLayoutSideBySide}
              </button>
            </div>
          </TooltipSimple>
        ) : null}
      </div>
      <div className="adl-tool-context__group adl-tool-context__group--files-actions">
        <TooltipSimple content={previewEnabled ? t.filePreview : t.fileEdit} placement="top">
          <button
            type="button"
            className={`adl-tool-context__iconbtn${previewEnabled ? ' is-active' : ''}`}
            onClick={onTogglePreview}
            aria-label={previewEnabled ? t.filePreview : t.fileEdit}
            aria-pressed={previewEnabled ? 'true' : 'false'}
            disabled={!hasChangePreview}
          >
            <IconEye size={14} decorative />
          </button>
        </TooltipSimple>
        <TooltipSimple content={t.changesPush} placement="top">
          <button
            type="button"
            className="adl-tool-context__iconbtn"
            disabled
            aria-label={t.changesPush}
          >
            <IconUpload size={14} decorative />
          </button>
        </TooltipSimple>
        <div ref={changesMenuRef} className="adl-menu adl-file-context__menu">
          <TooltipSimple content={t.changesMoreActions} placement="top">
            <button
              type="button"
              className={`adl-tool-context__iconbtn${changesMenuOpen ? ' is-open' : ''}`}
              onClick={() => setChangesMenuOpen((value) => !value)}
              aria-label={t.changesMoreActions}
              aria-haspopup="menu"
              aria-expanded={changesMenuOpen}
            >
              <IconMoreVertical size={14} decorative />
            </button>
          </TooltipSimple>
          {changesMenuOpen ? (
            <div className="adl-menu__dropdown adl-file-context__dropdown" role="menu">
              {changesMenuItems.map((item) =>
                'separator' in item ? (
                  <div key={item.id} className="adl-menu__sep" role="separator" />
                ) : (
                  <button
                    key={item.id}
                    type="button"
                    role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                    aria-checked={
                      item.checked === undefined ? undefined : item.checked ? 'true' : 'false'
                    }
                    className="adl-menu__item"
                    disabled={item.disabled}
                    onClick={() => {
                      item.action?.();
                      if (!item.action) {
                        setChangesMenuOpen(false);
                      }
                    }}
                  >
                    <span>{item.label}</span>
                    {item.checked ? <span className="adl-menu__check">√</span> : null}
                  </button>
                )
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
