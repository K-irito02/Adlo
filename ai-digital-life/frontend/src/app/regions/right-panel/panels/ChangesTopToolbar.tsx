import { useEffect, useRef, useState } from 'react';
import { IconCheck, IconEye, IconMoreVertical, IconPanelLeft, IconPanelLeftClose } from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import { useTCopy } from '@i18n/useTCopy';
import { MarkdownThemeSelector } from '../MarkdownThemeSelector';

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
  hasActivePatchSet: boolean;
  diffSideBySide: boolean;
  onSetDiffLayout: (sideBySide: boolean) => void;
  hasChangePreview: boolean;
  previewEnabled: boolean;
  onTogglePreview: () => void;
  changesMenuItems: ChangesMenuItem[];
  /** 变更文件为 markdown 时展示主题切换（文件面板同款位置：预览按钮左侧分隔线之左）。 */
  showMarkdownTheme?: boolean;
}

export function ChangesTopToolbar({
  navigatorCollapsed,
  onToggleNavigator,
  hasActivePatchSet,
  diffSideBySide,
  onSetDiffLayout,
  hasChangePreview,
  previewEnabled,
  onTogglePreview,
  changesMenuItems,
  showMarkdownTheme = false,
}: ChangesTopToolbarProps) {
  const { t } = useTCopy();
  const [changesMenuOpen, setChangesMenuOpen] = useState(false);
  const changesMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!changesMenuOpen) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (changesMenuRef.current?.contains(target)) {
        return;
      }
      setChangesMenuOpen(false);
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
        {!hasActivePatchSet ? (
          <>
            <span className="adl-tool-context__separator" aria-hidden="true" />
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
          </>
        ) : null}
      </div>
      <div className="adl-tool-context__group adl-tool-context__group--files-actions">
        {showMarkdownTheme ? (
          <>
            <MarkdownThemeSelector />
            <div className="adl-tool-context__divider" aria-hidden="true" />
          </>
        ) : null}
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
                    {item.checked ? (
                      <span className="adl-menu__check">
                        <IconCheck size={14} decorative />
                      </span>
                    ) : null}
                  </button>
                ),
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
