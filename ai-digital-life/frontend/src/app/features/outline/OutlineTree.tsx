import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { FileOutlineItem } from '@ai-digital-life/kernel';
import { buildOutlineTree, type OutlineNode, getDefaultExpandedOutlineIds } from './outlineModel';
import { CustomScrollArea } from '../../features/file-tree/CustomScrollArea';
import { TreeNodeRow } from '../../features/file-tree/TreeNodeRow';

export interface OutlineTreeProps {
  items: FileOutlineItem[];
  onNavigate: (line: number, item: FileOutlineItem) => void;
  expandLabel: string;
  collapseLabel: string;
  expandedIds?: ReadonlySet<string>;
  onExpandedIdsChange?: (expandedIds: Set<string>) => void;
}

export function OutlineTree({
  items,
  onNavigate,
  expandLabel,
  collapseLabel,
  expandedIds: controlledExpandedIds,
  onExpandedIdsChange,
}: OutlineTreeProps) {
  const tree = useMemo(() => buildOutlineTree(items), [items]);
  const [uncontrolledExpandedIds, setUncontrolledExpandedIds] = useState<Set<string>>(() =>
    getDefaultExpandedOutlineIds(items)
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const expandedIds = controlledExpandedIds ?? uncontrolledExpandedIds;

  const prevItemsKeyRef = useRef('');
  useEffect(() => {
    if (!controlledExpandedIds) {
      const key = items.map((i) => i.id).join(',');
      if (prevItemsKeyRef.current !== key) {
        prevItemsKeyRef.current = key;
        setUncontrolledExpandedIds(getDefaultExpandedOutlineIds(items));
      }
    }
  }, [controlledExpandedIds, items]);

  useEffect(() => {
    if (!activeId) {
      return;
    }
    if (!items.some((item) => item.id === activeId)) {
      setActiveId(null);
    }
  }, [activeId, items]);

  const setExpandedIds = (updater: Set<string> | ((current: Set<string>) => Set<string>)) => {
    const next = typeof updater === 'function' ? updater(new Set(expandedIds)) : updater;
    if (controlledExpandedIds && onExpandedIdsChange) {
      onExpandedIdsChange(next);
      return;
    }
    setUncontrolledExpandedIds(next);
  };

  const toggleNode = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const renderNodes = (nodes: OutlineNode[], depth: number) => (
    <ul
      className={
        depth === 1
          ? 'adl-outline-tree adl-tree-root'
          : 'adl-outline-tree__children adl-tree-node__children'
      }
      role={depth === 1 ? 'tree' : 'group'}
    >
      {nodes.map((item) => {
        const hasChildren = item.children.length > 0;
        const isExpanded = expandedIds.has(item.id);
        return (
          <TreeNodeRow
            key={item.id}
            depth={depth}
            rowOffset={(depth - 1) * 14 + 4}
            hasChildren={hasChildren}
            isExpanded={isExpanded}
            isActive={activeId === item.id}
            isHovered={hoveredId === item.id}
            expandLabel={expandLabel}
            collapseLabel={collapseLabel}
            onToggle={hasChildren ? () => toggleNode(item.id) : undefined}
            onActivate={() => {
              setActiveId(item.id);
              onNavigate(item.line, item);
            }}
            onLabelMouseEnter={() => setHoveredId(item.id)}
            onLabelMouseLeave={() =>
              setHoveredId((current) => (current === item.id ? null : current))
            }
            onLabelFocus={() => setHoveredId(item.id)}
            onLabelBlur={() => setHoveredId((current) => (current === item.id ? null : current))}
            itemClassName={`adl-outline-tree__item adl-outline-tree__item--${item.kind}`}
            rowClassName="adl-outline-tree__row"
            labelClassName="adl-outline-tree__label"
            toggleClassName="adl-outline-tree__toggle"
            indentClassName="adl-outline-tree__indent"
            metaClassName="adl-outline-tree__meta"
            label={item.label}
            meta={
              item.kind !== 'heading' ? (
                <>
                  <span>{item.kind}</span>
                  <span className="adl-outline-tree__meta-dot">·</span>
                  <span>{item.line}</span>
                </>
              ) : undefined
            }
          >
            {hasChildren && isExpanded ? renderNodes(item.children, depth + 1) : null}
          </TreeNodeRow>
        );
      })}
    </ul>
  );

  return (
    <CustomScrollArea
      shellClassName="adl-outline-tree-shell"
      scrollClassName="adl-outline-tree__scroll"
      scrollbarClassName="adl-outline-tree__scrollbar"
      thumbClassName="adl-outline-tree__scrollbar-thumb"
    >
      {renderNodes(tree, 1)}
    </CustomScrollArea>
  );
}
