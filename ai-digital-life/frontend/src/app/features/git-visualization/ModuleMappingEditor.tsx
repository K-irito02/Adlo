import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import type { MappingRule, DirectoryEntry } from '../types/module-mapping';
import './ModuleMappingEditor.css';

interface ModuleMappingEditorProps {
  isOpen: boolean;
  onClose: () => void;
  directoryTree: DirectoryEntry[];
  rules: MappingRule[];
  onSave: (rules: MappingRule[]) => Promise<void>;
  onReset: () => Promise<void>;
}

interface TreeNode {
  path: string;
  depth: number;
  commitCount: number;
  children: TreeNode[];
  mappedModule?: string;
}

function buildTree(entries: DirectoryEntry[], existingRules: MappingRule[]): TreeNode[] {
  const rootMap = new Map<string, TreeNode>();
  for (const entry of entries) {
    const parts = entry.path.split('/');
    let current = rootMap;
    for (let i = 0; i < parts.length; i++) {
      const part = parts.slice(0, i + 1).join('/');
      if (!current.has(part)) {
        current.set(part, {
          path: part,
          depth: i + 1,
          commitCount: 0,
          children: [],
        });
      }
      const node = current.get(part)!;
      node.commitCount += entry.commitCount;
      current = new Map(node.children.map((c) => [c.path, c]));
    }
  }

  const sorted = [...rootMap.values()].sort((a, b) => a.path.localeCompare(b.path));
  for (const node of sorted) {
    const parentPath = node.path.substring(0, node.path.lastIndexOf('/'));
    if (parentPath && rootMap.has(parentPath)) {
      rootMap.get(parentPath)!.children.push(node);
    }
  }

  const findModule = (path: string): string | undefined => {
    for (const rule of existingRules) {
      if (rule.type === 'glob') {
        const pattern = rule.path.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
        if (new RegExp(`^${pattern}$`).test(path)) return rule.module;
      }
    }
    return undefined;
  };
  for (const node of rootMap.values()) {
    const dirPath = node.path.endsWith('/') ? node.path : node.path + '/';
    node.mappedModule = findModule(dirPath + '**') || findModule(node.path);
  }

  return sorted.filter((n) => n.depth === 1);
}

function ChevronRight() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5v14" />
    </svg>
  );
}

function TreeNodeRow({ node, onDragStart, expanded, onToggle }: {
  node: TreeNode; onDragStart: (path: string) => void;
  expanded: boolean; onToggle: () => void;
}) {
  const hasChildren = node.children.length > 0;
  return (
    <div style={{ marginLeft: (node.depth - 1) * 14 }}>
      <div
        draggable
        onDragStart={() => onDragStart(node.path)}
        className="adl-module-mapping__tree-node"
      >
        <button
          className="adl-module-mapping__tree-toggle"
          onClick={onToggle}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          tabIndex={-1}
        >
          {hasChildren ? (expanded ? <ChevronDown /> : <ChevronRight />) : null}
        </button>
        <span className="adl-module-mapping__tree-icon"><FolderIcon /></span>
        <span className="adl-module-mapping__tree-path" title={node.path}>{node.path}</span>
        <span className="adl-module-mapping__tree-count">({node.commitCount})</span>
        {node.mappedModule && (
          <span className="adl-module-mapping__tree-module-badge">→ {node.mappedModule}</span>
        )}
      </div>
      {expanded && hasChildren && node.children.map((child) => (
        <TreeNodeRow
          key={child.path}
          node={child}
          onDragStart={onDragStart}
          expanded={false}
          onToggle={() => {}}
        />
      ))}
    </div>
  );
}

export const ModuleMappingEditor = React.memo(function ModuleMappingEditor({
  isOpen,
  onClose,
  directoryTree,
  rules: initialRules,
  onSave,
  onReset,
}: ModuleMappingEditorProps) {
  const { t } = useTCopy();
  const [rules, setRules] = useState<MappingRule[]>(initialRules);
  const [newModuleName, setNewModuleName] = useState('');
  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    panelRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    setRules(initialRules);
  }, [initialRules]);

  const tree = React.useMemo(() => buildTree(directoryTree, rules), [directoryTree, rules]);

  const definedModules = React.useMemo(() => {
    const map = new Map<string, MappingRule[]>();
    for (const rule of rules) {
      const existing = map.get(rule.module) ?? [];
      existing.push(rule);
      map.set(rule.module, existing);
    }
    return map;
  }, [rules]);

  const handleDrop = useCallback((targetModule: string) => {
    if (!draggedPath) return;
    setRules((prev) => {
      const filtered = prev.filter((r) => !(r.path === draggedPath + '/**' || r.path === draggedPath));
      return [...filtered, { path: draggedPath + '/**', module: targetModule, type: 'glob' }];
    });
    setDraggedPath(null);
  }, [draggedPath]);

  const handleDeleteModule = useCallback((moduleName: string) => {
    setRules((prev) => prev.filter((r) => r.module !== moduleName));
  }, []);

  const handleAddModule = useCallback(() => {
    const name = newModuleName.trim();
    if (!name || definedModules.has(name)) return;
    setRules((prev) => [...prev, { path: '', module: name, type: 'glob' }]);
    setNewModuleName('');
  }, [newModuleName, definedModules]);

  const handleRenameModule = useCallback((oldName: string, newName: string) => {
    setRules((prev) => prev.map((r) => r.module === oldName ? { ...r, module: newName } : r));
  }, []);

  const topLevelDirs = React.useMemo(() =>
    directoryTree.filter((d) => d.depth === 1),
  [directoryTree]);
  const unmappedDirs = topLevelDirs.filter(
    (d) => !rules.some((r) => {
      const rulePath = r.path.replace('/**', '');
      return d.path === rulePath || d.path.startsWith(rulePath + '/');
    }),
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  const handleBackdrop = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  const [dropModule, setDropModule] = useState<string | null>(null);

  if (!isOpen) return null;

  return (
    <div
      className="adl-prompt-modal"
      onKeyDown={handleKeyDown}
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
      aria-label={t.gitVisModuleMappingManage}
    >
      <div
        ref={panelRef}
        className="adl-prompt-modal__panel"
        tabIndex={-1}
        style={{ width: 'min(90vw, 800px)', maxHeight: '80vh' }}
      >
        <div className="adl-prompt-modal__header">
          {t.gitVisModuleMappingManage}
          <button
            type="button"
            className="adl-prompt-modal__header-close"
            onClick={onClose}
            aria-label={t.close}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="adl-module-mapping">
          <div className="adl-module-mapping__tree">
            <div className="adl-module-mapping__tree-title">{t.gitVisModuleMappingDirTree}</div>
            {tree.map((node) => (
              <TreeNodeRow
                key={node.path}
                node={node}
                onDragStart={setDraggedPath}
                expanded={expandedPaths.has(node.path)}
                onToggle={() => {
                  setExpandedPaths((prev) => {
                    const next = new Set(prev);
                    if (next.has(node.path)) next.delete(node.path);
                    else next.add(node.path);
                    return next;
                  });
                }}
              />
            ))}
          </div>
          <div className="adl-module-mapping__modules">
            <div className="adl-module-mapping__modules-title">{t.gitVisModuleMappingDefinedModules}</div>
            {[...definedModules.entries()].map(([moduleName, moduleRules]) => (
              <div
                key={moduleName}
                onDragOver={(e) => { e.preventDefault(); setDropModule(moduleName); }}
                onDragLeave={() => setDropModule(null)}
                onDrop={() => { handleDrop(moduleName); setDropModule(null); }}
                className={`adl-module-mapping__module-card${dropModule === moduleName ? ' adl-module-mapping__module-card--drop-target' : ''}`}
              >
                <div className="adl-module-mapping__module-card-header">
                  <span className="adl-module-mapping__tree-icon"><GearIcon /></span>
                  <input
                    defaultValue={moduleName}
                    onBlur={(e) => handleRenameModule(moduleName, e.target.value)}
                    className="adl-module-mapping__module-name"
                  />
                  <button
                    type="button"
                    className="adl-prompt-modal__header-close"
                    onClick={() => handleDeleteModule(moduleName)}
                    aria-label={t.delete}
                  >
                    <CloseIcon />
                  </button>
                </div>
                <div className="adl-module-mapping__module-paths" title={moduleRules.map((r) => r.path).join(', ')}>
                  {moduleRules.map((r) => r.path).join(', ')}
                </div>
              </div>
            ))}
            <div className="adl-module-mapping__add-module">
              <input
                value={newModuleName}
                onChange={(e) => setNewModuleName(e.target.value)}
                placeholder={t.gitVisModuleMappingNewModule}
                className="adl-module-mapping__add-input"
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddModule(); }}
              />
              <button
                type="button"
                className="adl-btn adl-btn--ghost adl-btn--square"
                onClick={handleAddModule}
                disabled={!newModuleName.trim()}
                aria-label={t.gitVisModuleMappingNewModule}
              >
                <PlusIcon />
              </button>
            </div>
          </div>
        </div>
        {unmappedDirs.length > 0 && (
          <div className="adl-module-mapping__unmapped">
            {t.gitVisModuleMappingUnmapped}: {unmappedDirs.map((d) => d.path).join(', ')}
          </div>
        )}
        <div className="adl-prompt-modal__actions adl-prompt-modal__actions--fill">
          <button
            type="button"
            className="adl-btn adl-btn--ghost adl-btn--square"
            onClick={onReset}
          >
            {t.gitVisModuleMappingReset}
          </button>
          <button
            type="button"
            className="adl-btn adl-btn--primary adl-btn--square"
            onClick={() => onSave(rules)}
          >
            {t.gitVisModuleMappingSave}
          </button>
        </div>
      </div>
    </div>
  );
});
