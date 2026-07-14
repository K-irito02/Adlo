import { useMemo, useState } from 'react';
import type { RepoMapNode } from '@ai-digital-life/kernel';
import type { CopyDict } from '../../i18n';
import {
  IconChevronDown,
  IconChevronRight,
  IconFileText,
  IconFolder,
  IconMap,
  IconSearch,
} from '../../icons';

interface RepoMapViewProps {
  t: CopyDict;
  nodes: RepoMapNode[];
}

function RepoMapNodeItem({ node, depth }: { node: RepoMapNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = node.children.length > 0;
  const isDir = node.kind === 'directory';

  return (
    <li className="adl-repomap__node">
      <div
        className="adl-repomap__row"
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        role={hasChildren ? 'button' : undefined}
        tabIndex={hasChildren ? 0 : undefined}
        onClick={hasChildren ? () => setExpanded((v) => !v) : undefined}
        onKeyDown={hasChildren ? (e) => e.key === 'Enter' && setExpanded((v) => !v) : undefined}
      >
        {hasChildren ? (
          expanded ? (
            <IconChevronDown size={12} decorative />
          ) : (
            <IconChevronRight size={12} decorative />
          )
        ) : (
          <span className="adl-repomap__spacer" />
        )}
        {isDir ? <IconFolder size={14} decorative /> : <IconFileText size={14} decorative />}
        <span className="adl-repomap__name">{node.name}</span>
        {isDir && <span className="adl-repomap__count">{node.fileCount}</span>}
        {node.primaryLanguage && (
          <span className="adl-chip adl-chip--xs adl-chip--muted">{node.primaryLanguage}</span>
        )}
      </div>
      {expanded && hasChildren && (
        <ul className="adl-repomap__children">
          {node.children.map((child) => (
            <RepoMapNodeItem key={child.path} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function RepoMapView({ t, nodes }: RepoMapViewProps) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!query.trim()) {
      return nodes;
    }
    const lower = query.toLowerCase();
    function matchNode(node: RepoMapNode): boolean {
      if (node.name.toLowerCase().includes(lower)) {
        return true;
      }
      return node.children.some(matchNode);
    }
    return nodes.filter(matchNode);
  }, [nodes, query]);

  return (
    <div className="adl-repomap">
      <header className="adl-repomap__header">
        <IconMap size={14} decorative />
        <h4>{t.repoMap}</h4>
      </header>
      <div className="adl-repomap__search">
        <IconSearch size={12} decorative />
        <input
          type="text"
          className="adl-repomap__input"
          placeholder={t.repoMapSearch}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <ul className="adl-repomap__tree">
        {filtered.map((node) => (
          <RepoMapNodeItem key={node.path} node={node} depth={0} />
        ))}
      </ul>
    </div>
  );
}
