import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTCopy } from '@i18n/useTCopy';
import { TreeRow } from '../file-tree/TreeRow';
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

  const handleRowActivate = useCallback((path: string) => {
    setSelectedPath(path);
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
        <ul
          className="adl-filetree adl-tree-root"
          role="tree"
          style={{ height: 'auto', position: 'relative' }}
        >
          {flatNodes.map(({ node, depth }) => (
            <TreeRow
              key={node.path}
              name={node.name}
              path={node.path}
              isDir={node.isDir}
              depth={depth + 1}
              isExpanded={expanded.has(node.path)}
              isSelected={selectedPath === node.path}
              onToggle={() => toggleExpand(node.path)}
              onActivate={() => handleRowActivate(node.path)}
            />
          ))}
        </ul>
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
