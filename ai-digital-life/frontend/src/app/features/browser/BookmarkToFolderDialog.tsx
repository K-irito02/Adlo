import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  IconChevronDown,
  IconChevronRight,
  IconFolderPlus,
  IconFolder,
  IconFolderOpen,
  IconClose,
  IconUnfoldVertical,
} from '../../icons';
import { CustomScrollArea } from '../file-tree/CustomScrollArea';
import type { FileTreeRenderableNode } from '../file-tree/fileTree.utils';

interface BookmarkToFolderDialogProps {
  open: boolean;
  t: Record<string, string>;
  workspaceNodes: FileTreeRenderableNode[];
  userFolderNodes: FileTreeRenderableNode[];
  onAddToFolder: (path: string | null) => void;
  onCreateDir: (parentPath: string | null) => void;
  onCancel: () => void;
}

function DirTreeEntry({
  node,
  depth,
  selectedPath,
  expandedSet,
  onSelect,
  onToggle,
}: {
  node: FileTreeRenderableNode;
  depth: number;
  selectedPath: string | null;
  expandedSet: Set<string>;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
}) {
  const isExpanded = expandedSet.has(node.path);
  const isSelected = selectedPath === node.path;
  const hasChildren = node.children.length > 0;

  return (
    <>
      <div
        className={`adl-bookmark-dir-row${isSelected ? ' is-selected' : ''}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        data-path={node.path}
        onClick={() => {
          onSelect(node.path);
          if (hasChildren) {
            onToggle(node.path);
          }
        }}
      >
        {hasChildren ? (
          <span
            className="adl-bookmark-dir-row__toggle"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.path);
            }}
          >
            {isExpanded ? (
              <IconChevronDown size={12} decorative />
            ) : (
              <IconChevronRight size={12} decorative />
            )}
          </span>
        ) : (
          <span className="adl-bookmark-dir-row__toggle-spacer" />
        )}
        {isExpanded && hasChildren ? (
          <IconFolderOpen size={14} decorative className="adl-bookmark-dir-row__icon" />
        ) : (
          <IconFolder size={14} decorative className="adl-bookmark-dir-row__icon" />
        )}
        <span className="adl-bookmark-dir-row__label">{node.name}</span>
      </div>
      {hasChildren && isExpanded && (
        <div className="adl-bookmark-dir-children">
          {node.children.map((child) => (
            <DirTreeEntry
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              expandedSet={expandedSet}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </>
  );
}

function DirCategorySection({
  label,
  nodes,
  selectedPath,
  expandedSet,
  onSelect,
  onToggle,
}: {
  label: string;
  nodes: FileTreeRenderableNode[];
  selectedPath: string | null;
  expandedSet: Set<string>;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
}) {
  if (nodes.length === 0) {
    return null;
  }
  return (
    <div className="adl-bookmark-dir-category">
      <div className="adl-bookmark-dir-category__label">{label}</div>
      {nodes.map((node) => (
        <DirTreeEntry
          key={node.path}
          node={node}
          depth={0}
          selectedPath={selectedPath}
          expandedSet={expandedSet}
          onSelect={onSelect}
          onToggle={onToggle}
        />
      ))}
    </div>
  );
}

const SCROLL_SHELL = 'adl-bookmark-dir-scroll-shell';
const SCROLL_CLASS = 'adl-bookmark-dir-scroll';
const SCROLLBAR_CLASS = 'adl-bookmark-dir-scrollbar';
const THUMB_CLASS = 'adl-bookmark-dir-scrollbar__thumb';

export function BookmarkToFolderDialog({
  open,
  t,
  workspaceNodes,
  userFolderNodes,
  onAddToFolder,
  onCreateDir,
  onCancel,
}: BookmarkToFolderDialogProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [expandedSet, setExpandedSet] = useState<Set<string>>(() => {
    return new Set<string>();
  });
  const allPaths = useMemo(() => {
    const paths: string[] = [];
    const collect = (nodes: FileTreeRenderableNode[]) => {
      for (const n of nodes) {
        paths.push(n.path);
        collect(n.children);
      }
    };
    collect(workspaceNodes);
    collect(userFolderNodes);
    return paths;
  }, [workspaceNodes, userFolderNodes]);

  const isAllExpanded = allPaths.length > 0 && expandedSet.size >= allPaths.length;

  const hintRef = useRef<HTMLSpanElement>(null);
  const subCardsRef = useRef<HTMLDivElement[]>([]);

  useEffect(() => {
    return () => {
      subCardsRef.current.forEach((el) => el.remove());
      subCardsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (open) {
      const all: string[] = [];
      const collect = (nodes: FileTreeRenderableNode[]) => {
        for (const n of nodes) {
          all.push(n.path);
          collect(n.children);
        }
      };
      collect(workspaceNodes);
      collect(userFolderNodes);
      setExpandedSet(new Set(all));
      setSelectedPath(null);
    }
  }, [open, workspaceNodes, userFolderNodes]);

  const handleDeselect = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.adl-bookmark-dir-tree-shell')) {
      setSelectedPath(null);
    }
  }, []);

  const handleSelect = useCallback((path: string) => {
    setSelectedPath(path);
  }, []);

  const handleToggle = useCallback((path: string) => {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    if (isAllExpanded) {
      setExpandedSet(new Set());
    } else {
      setExpandedSet(new Set(allPaths));
    }
  }, [isAllExpanded, allPaths]);

  const handleCreateDir = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.adl-bookmark-dir-toolbar__btn-hint')) {
        return;
      }
      onCreateDir(selectedPath);
    },
    [selectedPath, onCreateDir]
  );

  const handleAddToFolder = useCallback(() => {
    onAddToFolder(selectedPath);
  }, [selectedPath, onAddToFolder]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    },
    [onCancel]
  );

  const handleBackdrop = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onCancel();
      }
    },
    [onCancel]
  );

  const handleHintEnter = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const btn = (e.target as HTMLElement).closest('.adl-bookmark-dir-toolbar__btn-hint');
      if (!btn) {
        return;
      }
      subCardsRef.current.forEach((el) => el.remove());
      subCardsRef.current = [];

      const btnRect = btn.getBoundingClientRect();
      const centerY = btnRect.top + btnRect.height / 2;

      const lines = ((t.browserCreateDirHint ?? '') as string).split('\n');
      const card = document.createElement('div');
      card.className = 'adl-sub-hint-card';
      for (const line of lines) {
        const item = document.createElement('div');
        item.textContent = line;
        card.appendChild(item);
      }
      card.style.left = `${btnRect.right + 4}px`;
      card.style.top = `${centerY}px`;
      card.style.transform = 'translateY(-50%)';

      const arrow = document.createElement('div');
      arrow.className = 'adl-sub-hint-card__arrow';
      arrow.style.left = `${btnRect.right - 4}px`;
      arrow.style.top = `${centerY - 4}px`;

      const arrowBorder = document.createElement('div');
      arrowBorder.className = 'adl-sub-hint-card__arrow-border';
      arrowBorder.style.left = `${btnRect.right - 5}px`;
      arrowBorder.style.top = `${centerY - 5}px`;

      document.body.appendChild(card);
      document.body.appendChild(arrow);
      document.body.appendChild(arrowBorder);

      subCardsRef.current = [card, arrow, arrowBorder];
    },
    [t]
  );

  const handleHintLeave = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    subCardsRef.current.forEach((el) => el.remove());
    subCardsRef.current = [];
  }, []);

  const hasContent = workspaceNodes.length > 0 || userFolderNodes.length > 0;

  if (!open) {
    return null;
  }

  return createPortal(
    <div className="adl-prompt-modal" onKeyDown={handleKeyDown} onClick={handleBackdrop}>
      <div
        className="adl-prompt-modal__panel adl-prompt-modal__panel--bookmark"
        role="dialog"
        aria-modal="true"
        aria-label={t.browserBookmarkToFolderTitle}
        onClick={handleDeselect}
      >
        <div className="adl-prompt-modal__header">
          {t.browserBookmarkToFolderTitle as string}
          <button
            type="button"
            className="adl-prompt-modal__header-close"
            onClick={onCancel}
            aria-label={t.browserClose}
          >
            <IconClose size={14} decorative />
          </button>
        </div>

        <div className="adl-bookmark-dir-toolbar">
          <button type="button" className="adl-bookmark-dir-toolbar__btn" onClick={handleToggleAll}>
            <span className="adl-bookmark-dir-toolbar__btn-label">
              <IconUnfoldVertical size={14} decorative />
            </span>
          </button>
          <button
            type="button"
            className="adl-bookmark-dir-toolbar__btn adl-bookmark-dir-toolbar__btn--with-hint"
            onClick={handleCreateDir}
          >
            <span className="adl-bookmark-dir-toolbar__btn-label">
              <IconFolderPlus size={14} decorative />
              <span>{t.browserCreateDir as string}</span>
            </span>
            <span
              ref={hintRef}
              className="adl-bookmark-dir-toolbar__btn-hint"
              onMouseEnter={handleHintEnter}
              onMouseLeave={handleHintLeave}
            >
              !
            </span>
          </button>
        </div>

        {hasContent ? (
          <div className="adl-bookmark-dir-tree-shell">
            <CustomScrollArea
              shellClassName={SCROLL_SHELL}
              scrollClassName={SCROLL_CLASS}
              scrollbarClassName={SCROLLBAR_CLASS}
              thumbClassName={THUMB_CLASS}
            >
              <div>
                <DirCategorySection
                  label={t.browserCategoryWorkspace as string}
                  nodes={workspaceNodes}
                  selectedPath={selectedPath}
                  expandedSet={expandedSet}
                  onSelect={handleSelect}
                  onToggle={handleToggle}
                />
                <DirCategorySection
                  label={t.browserCategoryUserFolder as string}
                  nodes={userFolderNodes}
                  selectedPath={selectedPath}
                  expandedSet={expandedSet}
                  onSelect={handleSelect}
                  onToggle={handleToggle}
                />
              </div>
            </CustomScrollArea>
          </div>
        ) : (
          <div className="adl-bookmark-dir-empty">{t.browserNoContent as string}</div>
        )}

        <div className="adl-prompt-modal__actions adl-prompt-modal__actions--fill">
          <button
            type="button"
            className="adl-btn adl-btn--ghost adl-btn--square"
            onClick={onCancel}
          >
            {t.browserCancel as string}
          </button>
          <button
            type="button"
            className="adl-btn adl-btn--primary adl-btn--square"
            onClick={handleAddToFolder}
          >
            {t.browserAddToFolder as string}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
