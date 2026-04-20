import React, { useCallback, useEffect, useRef, useState } from "react";
import { renderIcon, type IconName } from "../../design-system/icons";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface TitleBarProps {
  /** Phase label displayed inside the badge pill (e.g. "Phase 1"). */
  phaseLabel: string;
  /** Application name shown next to the badge (e.g. "AI Digital Life"). */
  appName: string;
  /** Whether the window is currently maximized. */
  isMaximized: boolean;
  /** Whether the left sidebar is currently visible (drives icon swap). */
  leftSidebarVisible: boolean;
  /** Whether the right panel is currently visible (drives icon swap). */
  rightPanelVisible: boolean;
  /** Callback when the settings gear button is clicked. */
  onSettingsClick: () => void;
  /** Callback for the minimize button. */
  onMinimize: () => void;
  /** Callback for the maximize / restore button. */
  onMaximize: () => void;
  /** Callback for the close button. */
  onClose: () => void;
  /** Callback for the toggle-left-sidebar button. */
  onToggleLeftSidebar: () => void;
  /** Callback for the toggle-right-panel button. */
  onToggleRightSidebar: () => void;
  /** Callback for the toggle-all-panels button. */
  onToggleAllPanels: () => void;
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

/** Thin React wrapper around `renderIcon()` so every consumer stays consistent. */
function TbIcon({
  name,
  size = "sm",
  className,
  title,
  decorative = true,
}: {
  name: IconName;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
  title?: string;
  decorative?: boolean;
}) {
  return (
    <span
      dangerouslySetInnerHTML={{
        __html: renderIcon(name, { size, className, title, decorative }).value,
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Menu dropdown primitive                                            */
/* ------------------------------------------------------------------ */

interface MenuDropdownProps {
  id: string;
  label: string;
  icon?: IconName;
  children: React.ReactNode;
}

/**
 * A minimal state-managed dropdown: button toggles an absolutely-positioned
 * menu panel. Clicking outside or pressing Escape closes it.
 */
function MenuDropdown({ id, label, icon, children }: MenuDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => setOpen((prev) => !prev), []);
  const close = useCallback(() => setOpen(false), []);

  /* Close on outside click / Escape */
  useEffect(() => {
    if (!open) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }

    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        close();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open, close]);

  return (
    <div className="adl-titlebar-menu" ref={ref} data-testid={`titlebar-menu-${id}`}>
      <button
        type="button"
        className="adl-titlebar-menu__trigger"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={toggle}
      >
        {icon ? <TbIcon name={icon} size="xs" /> : null}
        <span>{label}</span>
        <TbIcon name="chevron-down" size="xs" className="adl-titlebar-menu__chevron" />
      </button>

      {open && (
        <div className="adl-titlebar-menu__panel" role="menu" aria-label={`${label} menu`}>
          {children}
        </div>
      )}
    </div>
  );
}

/** A single item inside a menu dropdown panel. */
interface MenuItemProps {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
}

function MenuItem({ label, shortcut, disabled = false, danger = false, onClick }: MenuItemProps) {
  return (
    <button
      type="button"
      className={`adl-titlebar-menu__item${danger ? " adl-titlebar-menu__item--danger" : ""}`}
      role="menuitem"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <span className="adl-titlebar-menu__item-label">{label}</span>
      {shortcut ? (
        <span className="adl-titlebar-menu__item-shortcut">{shortcut}</span>
      ) : null}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Separator inside a menu                                            */
/* ------------------------------------------------------------------ */

function MenuSeparator() {
  return <hr className="adl-titlebar-menu__separator" />;
}

/* ------------------------------------------------------------------ */
/*  TitleBar component                                                */
/* ------------------------------------------------------------------ */

/**
 * Application title bar combining four regions:
 *
 * | Region 1 (App Menu) | Region 2 (Settings) | Region 3 (Panels) | Region 4 (Window) |
 *
 * - **Region 1** -- Brand area with phase-badge pill + app name, followed by File /
 *   View / Help dropdown menus.
 * - **Region 2** -- Settings gear icon button.
 * - **Region 3** -- Panel toggle buttons (left sidebar, right panel, all panels).
 * - **Region 4** -- Window management buttons (minimize, maximize/restore, close).
 *
 * The entire bar uses `-webkit-app-region: drag`; interactive children are
 * explicitly set to `no-drag`.
 */
export function TitleBar({
  phaseLabel,
  appName,
  isMaximized,
  leftSidebarVisible,
  rightPanelVisible,
  onSettingsClick,
  onMinimize,
  onMaximize,
  onClose,
  onToggleLeftSidebar,
  onToggleRightSidebar,
  onToggleAllPanels,
}: TitleBarProps): React.ReactElement {
  /* ----------------------------------------------------------------
   *  Resolve icons that change based on visibility state.
   * ---------------------------------------------------------------- */
  const leftIcon: IconName = leftSidebarVisible ? "panel-left-close" : "panel-left";
  const rightIcon: IconName = rightPanelVisible ? "panel-right-close" : "panel-right";

  /* ---------------------------------------------------------------
   *  Render
   * --------------------------------------------------------------- */
  return (
    <header className="adl-titlebar" role="banner" aria-label="Application title bar">
      {/* ======== Region 1: App Menu (left) ======== */}
      <div className="adl-titlebar__region adl-titlebar__region--menu">
        {/* Brand area */}
        <div className="adl-titlebar__brand">
          <span className="pill pill--accent adl-titlebar__phase-badge">
            {phaseLabel}
          </span>
          <span className="adl-titlebar__app-name">{appName}</span>
        </div>

        {/* Menu bar: File / View / Help */}
        <nav className="adl-titlebar__menus" aria-label="Application menus">
          <MenuDropdown id="file" label="File">
            <MenuItem label="New Workspace" shortcut="Ctrl+N" onClick={() => {}} />
            <MenuItem label="Open Workspace..." shortcut="Ctrl+O" onClick={() => {}} />
            <MenuSeparator />
            <MenuItem label="Settings" shortcut="Ctrl+," onClick={onSettingsClick} />
            <MenuSeparator />
            <MenuItem label="Exit" danger onClick={onClose} />
          </MenuDropdown>

          <MenuDropdown id="view" label="View">
            <MenuItem
              label={leftSidebarVisible ? "Hide Left Sidebar" : "Show Left Sidebar"}
              shortcut="Ctrl+B"
              onClick={onToggleLeftSidebar}
            />
            <MenuItem
              label={rightPanelVisible ? "Hide Right Panel" : "Show Right Panel"}
              shortcut="Ctrl+J"
              onClick={onToggleRightSidebar}
            />
            <MenuSeparator />
            <MenuItem label="Toggle All Panels" shortcut="Ctrl+0" onClick={onToggleAllPanels} />
          </MenuDropdown>

          <MenuDropdown id="help" label="Help">
            <MenuItem label="About AI Digital Life" onClick={() => {}} />
            <MenuSeparator />
            <MenuItem label="Documentation" onClick={() => {}} />
            <MenuItem label="Report Issue" onClick={() => {}} />
          </MenuDropdown>
        </nav>
      </div>

      {/* ======== Spacer pushes Regions 2-4 to the right ======== */}
      <div className="adl-titlebar__spacer" />

      {/* ======== Region 2: Settings ======== */}
      <div className="adl-titlebar__region adl-titlebar__region--settings">
        <button
          type="button"
          className="adl-titlebar-control-btn"
          aria-label="Settings"
          title="Settings"
          onClick={onSettingsClick}
        >
          <TbIcon name="settings" size="lg" decorative />
        </button>
      </div>

      {/* ======== Region 3: Panel Controls ======== */}
      <div className="adl-titlebar__region adl-titlebar__region--panels">
        <button
          type="button"
          className="adl-titlebar-control-btn"
          aria-label={leftSidebarVisible ? "Hide left sidebar" : "Show left sidebar"}
          title={leftSidebarVisible ? "Hide left sidebar" : "Show left sidebar"}
          onClick={onToggleLeftSidebar}
        >
          <TbIcon name={leftIcon} size="sm" decorative />
        </button>

        <button
          type="button"
          className="adl-titlebar-control-btn"
          aria-label={rightPanelVisible ? "Hide right panel" : "Show right panel"}
          title={rightPanelVisible ? "Hide right panel" : "Show right panel"}
          onClick={onToggleRightSidebar}
        >
          <TbIcon name={rightIcon} size="sm" decorative />
        </button>

        <button
          type="button"
          className="adl-titlebar-control-btn"
          aria-label="Toggle all panels"
          title="Toggle all panels"
          onClick={onToggleAllPanels}
        >
          <TbIcon name="columns" size="sm" decorative />
        </button>
      </div>

      {/* ======== Region 4: Window Management ======== */}
      <div className="adl-titlebar__region adl-titlebar__region--window">
        <button
          type="button"
          className="adl-titlebar-control-btn"
          aria-label="Minimize"
          title="Minimize"
          onClick={onMinimize}
        >
          <TbIcon name="minus" size="sm" decorative />
        </button>

        <button
          type="button"
          className="adl-titlebar-control-btn"
          aria-label={isMaximized ? "Restore" : "Maximize"}
          title={isMaximized ? "Restore" : "Maximize"}
          onClick={onMaximize}
        >
          {isMaximized ? (
            <TbIcon name="minimize-2" size="sm" decorative />
          ) : (
            <TbIcon name="square" size="sm" decorative />
          )}
        </button>

        <button
          type="button"
          className="adl-titlebar-control-btn adl-titlebar-control-btn--close"
          aria-label="Close"
          title="Close"
          onClick={onClose}
        >
          <TbIcon name="close" size="sm" decorative />
        </button>
      </div>
    </header>
  );
}

export default TitleBar;
