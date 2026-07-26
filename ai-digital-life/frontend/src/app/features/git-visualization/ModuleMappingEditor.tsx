import React, { useCallback, useState } from 'react';
import { useTCopy } from '@i18n/useTCopy';
import type { MappingRule, DirectoryEntry } from '../types/module-mapping';

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

function TreeNodeRow({ node, onDragStart, expanded, onToggle }: {
  node: TreeNode; onDragStart: (path: string) => void;
  expanded: boolean; onToggle: () => void;
}) {
  const hasChildren = node.children.length > 0;
  return (
    <div style={{ marginLeft: (node.depth - 1) * 16 }}>
      <div
        draggable
        onDragStart={() => onDragStart(node.path)}
        style={{ cursor: 'grab', display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0' }}
      >
        {hasChildren ? (
          <span onClick={onToggle} style={{ cursor: 'pointer', width: 16, textAlign: 'center' }}>
            {expanded ? '▼' : '▶'}
          </span>
        ) : <span style={{ width: 16 }} />}
        <span>📁 {node.path}</span>
        <span style={{ fontSize: 10, opacity: 0.5, marginLeft: 4 }}>({node.commitCount})</span>
        {node.mappedModule && (
          <span style={{ fontSize: 10, color: 'var(--accent-color)', marginLeft: 4 }}>
            → {node.mappedModule}
          </span>
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

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)',
    }} onClick={onClose}>
      <div style={{
        background: '#1e1e2e', borderRadius: 8, color: '#cdd6f4',
        width: 800, maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottom: '1px solid var(--border-color)' }}>
          <h2>{t.gitVisModuleMappingManage}</h2>
          <button onClick={onClose}>✕</button>
        </div>
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'auto', padding: 12, borderRight: '1px solid var(--border-color)' }}>
            <h3 style={{ fontSize: 12, marginBottom: 8 }}>{t.gitVisModuleMappingDirTree}</h3>
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
          <div style={{ width: 300, overflow: 'auto', padding: 12 }}>
            <h3 style={{ fontSize: 12, marginBottom: 8 }}>{t.gitVisModuleMappingDefinedModules}</h3>
            {[...definedModules.entries()].map(([moduleName, moduleRules]) => (
              <div
                key={moduleName}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(moduleName)}
                style={{
                  padding: 8, marginBottom: 4, borderRadius: 4,
                  border: '1px solid var(--border-color)',
                  background: draggedPath ? 'var(--hover-color)' : undefined,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <input
                    defaultValue={moduleName}
                    onBlur={(e) => handleRenameModule(moduleName, e.target.value)}
                    style={{ border: 'none', background: 'transparent', fontWeight: 600, fontSize: 13 }}
                  />
                  <button onClick={() => handleDeleteModule(moduleName)}>✕</button>
                </div>
                <div style={{ fontSize: 10, opacity: 0.6, marginTop: 4 }}>
                  {moduleRules.map((r) => r.path).join(', ')}
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
              <input
                value={newModuleName}
                onChange={(e) => setNewModuleName(e.target.value)}
                placeholder={t.gitVisModuleMappingNewModule}
                style={{ flex: 1, fontSize: 12, padding: '2px 4px' }}
              />
              <button onClick={handleAddModule} disabled={!newModuleName.trim()}>+</button>
            </div>
          </div>
        </div>
        {unmappedDirs.length > 0 && (
          <div style={{ padding: '4px 12', fontSize: 11, opacity: 0.5 }}>
            {t.gitVisModuleMappingUnmapped}: {unmappedDirs.map((d) => d.path).join(', ')}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: 12, borderTop: '1px solid var(--border-color)' }}>
          <button onClick={onReset}>{t.gitVisModuleMappingReset}</button>
          <button onClick={() => onSave(rules)} style={{ fontWeight: 600 }}>{t.gitVisModuleMappingSave}</button>
        </div>
      </div>
    </div>
  );
});
