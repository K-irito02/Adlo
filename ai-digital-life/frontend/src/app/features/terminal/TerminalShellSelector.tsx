import React from "react";
import { IconChevronDown, IconPlus } from "../../icons";
import { TooltipSimple } from "../../components/Tooltip";
import type { TerminalProfile } from "../../ui-store";
import type { CopyDict } from "../../copy";
import type { TerminalShellMenuItem } from "./useTerminalPanel";

interface TerminalShellSelectorProps {
  currentProfile: TerminalProfile;
  currentProfileLabel: string;
  menuOpen: boolean;
  menuItems: TerminalShellMenuItem[];
  menuRef: React.RefObject<HTMLDivElement | null>;
  onCreateTab: (profile?: TerminalProfile) => void;
  onToggle: () => void;
  onSelect: (profile: TerminalProfile) => void;
  t: CopyDict;
}

export function TerminalShellSelector({
  currentProfile,
  currentProfileLabel,
  menuOpen,
  menuItems,
  menuRef,
  onCreateTab,
  onToggle,
  onSelect,
  t
}: TerminalShellSelectorProps) {
  return (
    <div ref={menuRef} className="adl-menu adl-file-context__menu">
      <div className={`adl-split-pill${menuOpen ? " is-open" : ""}`}>
        <TooltipSimple content={t.menuNewTerminal} placement="top">
          <button
            type="button"
            className="adl-split-pill__main"
            onClick={() => onCreateTab(currentProfile)}
            aria-label={t.menuNewTerminal}
          >
            <IconPlus size={12} decorative />
            <span>{currentProfileLabel}</span>
          </button>
        </TooltipSimple>
        <TooltipSimple content={t.shellTypeSelect} placement="top">
          <button
            type="button"
            className={`adl-split-pill__toggle${menuOpen ? " is-open" : ""}`}
            onClick={onToggle}
            aria-label={t.shellTypeSelect}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <IconChevronDown size={12} decorative />
          </button>
        </TooltipSimple>
      </div>
      {menuOpen ? (
        <div className="adl-menu__dropdown adl-file-context__dropdown adl-terminal-shell-dropdown" role="menu">
          {menuItems.map((item) =>
            "separator" in item ? (
              <div key={item.id} className="adl-menu__sep" role="separator" />
            ) : (
              <button
                key={item.id}
                type="button"
                role="menuitemradio"
                aria-checked={item.profile ? item.profile === currentProfile : false}
                className="adl-menu__item"
                onClick={() => {
                  if (item.profile) {
                    onSelect(item.profile);
                  } else {
                    item.action?.();
                  }
                }}
              >
                <span>{item.label}</span>
              </button>
            )
          )}
        </div>
      ) : null}
    </div>
  );
}
