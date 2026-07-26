import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useTCopy } from '@i18n/useTCopy';
import type { ModuleTreeNode } from './moduleTreeUtils';
import '@/styles/components/module-tree-card.css';

interface ModuleTreeCardProps {
  subtree: ModuleTreeNode[];
  position: { x: number; y: number };
  onSelect: (path: string) => void;
  onClose: () => void;
}

interface FlatNode {
  node: ModuleTreeNode;
  depth: number;
}

function flattenVisible(root: ModuleTreeNode[], expanded: Set<string>, depth = 0): FlatNode[] {
  const result: FlatNode[] = [];
  for (const child of root) {
    result.push({ node: child, depth });
    if (child.isDir && expanded.has(child.path)) {
      result.push(...flattenVisible(child.children, expanded, depth + 1));
    }
  }
  return result;
}

export const ModuleTreeCard = React.memo(function ModuleTreeCard({
  subtree,
  position,
  onSelect,
  onClose,
}: ModuleTreeCardProps) {
  const { t } = useTCopy();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const toggleExpand = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const flatNodes = flattenVisible(subtree, expanded);

  const cardStyle: React.CSSProperties = {
    position: 'fixed',
    left: Math.min(position.x, window.innerWidth - 360),
    top: Math.min(position.y, window.innerHeight - 400),
  };

  return createPortal(
    <div className="adl-module-tree-card" ref={cardRef} style={cardStyle}>
      <div className="adl-module-tree-card__tree">
        {flatNodes.map(({ node, depth }) => (
          <div
            key={node.path}
            className={cn(
              'adl-module-tree-card__row',
              selectedPath === node.path && 'adl-module-tree-card__row--selected',
            )}
            style={{ paddingLeft: 12 + depth * 16 }}
            onClick={() => setSelectedPath(node.path)}
          >
            {node.isDir ? (
              <button
                className="adl-module-tree-card__toggle"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleExpand(node.path);
                }}
              >
                <span
                  className={cn(
                    'adl-module-tree-card__chevron',
                    expanded.has(node.path) && 'adl-module-tree-card__chevron--open',
                  )}
                >
                  ▶
                </span>
              </button>
            ) : (
              <span className="adl-module-tree-card__spacer" />
            )}
            <span className="adl-module-tree-card__icon">{node.isDir ? '📁' : '📄'}</span>
            <span className="adl-module-tree-card__name">{node.name}</span>
            {selectedPath === node.path && <span className="adl-module-tree-card__check">✓</span>}
          </div>
        ))}
      </div>
      <div className="adl-module-tree-card__actions">
        <button
          className="adl-module-tree-card__btn adl-module-tree-card__btn--cancel"
          onClick={onClose}
        >
          {t.gitVisModuleCancel}
        </button>
        <button
          className="adl-module-tree-card__btn adl-module-tree-card__btn--confirm"
          disabled={selectedPath === null}
          onClick={() => {
            if (selectedPath) {
              onSelect(selectedPath);
            }
          }}
        >
          {t.gitVisModuleConfirm}
        </button>
      </div>
    </div>,
    document.body,
  );
});
