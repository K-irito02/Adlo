import React from "react";
import { IconChevronDown, IconChevronRight } from "../../icons";

type TreeNodeRowProps = {
  depth: number;
  rowOffset: number;
  hasChildren: boolean;
  isExpanded?: boolean;
  isActive?: boolean;
  isHovered?: boolean;
  isContextMenuTarget?: boolean;
  expandLabel: string;
  collapseLabel: string;
  onToggle?: () => void;
  onActivate: () => void;
  onLabelMouseEnter?: () => void;
  onLabelMouseLeave?: () => void;
  onLabelFocus?: () => void;
  onLabelBlur?: () => void;
  onContextMenu?: (event: React.MouseEvent<HTMLDivElement>) => void;
  itemClassName?: string;
  rowClassName?: string;
  labelClassName?: string;
  toggleClassName?: string;
  indentClassName?: string;
  metaClassName?: string;
  labelContentClassName?: string;
  labelLeading?: React.ReactNode;
  label: React.ReactNode;
  meta?: React.ReactNode;
  children?: React.ReactNode;
};

export function TreeNodeRow({
  depth,
  rowOffset,
  hasChildren,
  isExpanded = false,
  isActive = false,
  isHovered = false,
  isContextMenuTarget = false,
  expandLabel,
  collapseLabel,
  onToggle,
  onActivate,
  onLabelMouseEnter,
  onLabelMouseLeave,
  onLabelFocus,
  onLabelBlur,
  onContextMenu,
  itemClassName,
  rowClassName,
  labelClassName,
  toggleClassName,
  indentClassName,
  metaClassName,
  labelContentClassName,
  labelLeading,
  label,
  meta,
  children,
}: TreeNodeRowProps) {
  return (
    <li
      className={`adl-tree-node${isActive ? " is-active" : ""}${isHovered ? " is-hovered" : ""}${isContextMenuTarget ? " is-context-menu-target" : ""}${itemClassName ? ` ${itemClassName}` : ""}`}
      data-depth={depth}
      style={
        {
          "--adl-filetree-hover-offset": `${Math.max(4, rowOffset)}px`,
          "--adl-tree-row-offset": `${Math.max(4, rowOffset)}px`,
          "--adl-outline-row-offset": `${Math.max(4, rowOffset)}px`,
        } as React.CSSProperties
      }
      role="treeitem"
      aria-expanded={hasChildren ? (isExpanded ? "true" : "false") : undefined}
    >
      <div
        className={`adl-tree-node__row${rowClassName ? ` ${rowClassName}` : ""}`}
        onContextMenu={onContextMenu}
      >
        {hasChildren ? (
          <button
            type="button"
            className={`adl-tree-node__toggle${toggleClassName ? ` ${toggleClassName}` : ""}`}
            onClick={onToggle}
            aria-label={isExpanded ? collapseLabel : expandLabel}
            aria-expanded={isExpanded ? "true" : "false"}
          >
            {isExpanded ? <IconChevronDown size={12} decorative /> : <IconChevronRight size={12} decorative />}
          </button>
        ) : (
          <span className={`adl-tree-node__indent${indentClassName ? ` ${indentClassName}` : ""}`} aria-hidden="true" />
        )}
        <button
          type="button"
          className={`adl-tree-node__label${labelClassName ? ` ${labelClassName}` : ""}`}
          onMouseEnter={onLabelMouseEnter}
          onMouseLeave={onLabelMouseLeave}
          onFocus={onLabelFocus}
          onBlur={onLabelBlur}
          onClick={onActivate}
        >
          <span className={`adl-tree-node__label-content${labelContentClassName ? ` ${labelContentClassName}` : ""}`}>
            {labelLeading}
            <span className="adl-tree-node__label-text">{label}</span>
          </span>
        </button>
        {meta ? (
          <span className={`adl-tree-node__meta${metaClassName ? ` ${metaClassName}` : ""}`}>
            {meta}
          </span>
        ) : null}
      </div>
      {children}
    </li>
  );
}
