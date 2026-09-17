import React, { useEffect, useMemo, useState } from 'react';
import { IconFolder, IconFolderOpen, IconSnippetCollapse, IconSnippetExpand } from '@icons';
import { FileIcon } from '@shared/file-icon';
import { TreeNodeRow } from '@features/file-tree/TreeNodeRow';
import { CustomScrollArea } from '@features/file-tree/CustomScrollArea';
import { highlightMatch } from './searchHighlight';

export interface SearchResultSnippet {
  line: number;
  preview: string;
  onOpen: () => void;
}

export interface SearchResultFile {
  /** 工作区内唯一键（相对路径） */
  key: string;
  path: string;
  name: string;
  /** 内容范围下的命中行数；文件范围不传（不显示计数徽标） */
  matchCount?: number;
  /** 内容范围下的内容片段；文件范围为空 */
  snippets: SearchResultSnippet[];
  onOpen: () => void;
  isActive?: boolean;
}

export interface SearchResultSection {
  workspaceId: string;
  workspaceName: string;
  files: SearchResultFile[];
}

interface SearchResultsTreeProps {
  sections: SearchResultSection[];
  variant: 'tree' | 'list';
  query: string;
  matchCase: boolean;
  expandLabel: string;
  collapseLabel: string;
  /** 文件名高亮 query：文件范围传检索词，内容范围传空串（仅高亮片段） */
  nameQuery: string;
  /** 工具栏折叠全部/展开全部信号：内容范围 target snippets，文件范围 target dirs */
  structureSignal: SearchStructureSignal | null;
  onStructureSignalConsumed: () => void;
  onCollapseStatusChange: (status: SearchCollapseStatus) => void;
}

interface SearchStructureSignal {
  action: 'collapse' | 'expand';
  target: 'snippets' | 'dirs';
  nonce: number;
}

interface SearchCollapseStatus {
  snippetsAllCollapsed: boolean;
  dirsAllCollapsed: boolean;
}

type ChildEntry =
  | { kind: 'dir'; path: string; name: string; children: ChildEntry[] }
  | { kind: 'file'; file: SearchResultFile };

function buildDirTree(files: SearchResultFile[]): ChildEntry[] {
  const roots: ChildEntry[] = [];
  const dirByPath = new Map<string, Extract<ChildEntry, { kind: 'dir' }>>();
  const getDir = (parent: ChildEntry[], dirPath: string, name: string) => {
    let dir = dirByPath.get(dirPath);
    if (!dir) {
      dir = { kind: 'dir', path: dirPath, name, children: [] };
      dirByPath.set(dirPath, dir);
      parent.push(dir);
    }
    return dir;
  };
  for (const file of files) {
    const slash = file.path.lastIndexOf('/');
    if (slash <= 0) {
      roots.push({ kind: 'file', file });
      continue;
    }
    const segments = file.path.slice(0, slash).split('/');
    let parent = roots;
    let acc = '';
    for (const segment of segments) {
      acc = acc ? `${acc}/${segment}` : segment;
      parent = getDir(parent, acc, segment).children;
    }
    parent.push({ kind: 'file', file });
  }
  return roots;
}

function SearchFileRow(props: {
  file: SearchResultFile;
  depth: number;
  flat: boolean;
  query: string;
  matchCase: boolean;
  /** 文件名高亮 query（内容范围为空串，仅高亮片段） */
  nameQuery: string;
  expandLabel: string;
  collapseLabel: string;
  /** 内容范围且有片段时：悬停显示片段折叠/展开切换 */
  snippetsCollapsible: boolean;
  snippetsCollapsed: boolean;
  onToggleSnippets: () => void;
}) {
  const {
    file,
    depth,
    flat,
    query,
    matchCase,
    nameQuery,
    expandLabel,
    collapseLabel,
    snippetsCollapsible,
    snippetsCollapsed,
    onToggleSnippets,
  } = props;
  return (
    <TreeNodeRow
      // 与 FileTree 同约定：TreeNodeRow 收到的 depth 为层级+1（indent = (depth-1)*14）
      depth={depth + 1}
      rowOffset={depth * 48 + 4}
      hasChildren={false}
      isActive={file.isActive}
      expandLabel={expandLabel}
      collapseLabel={collapseLabel}
      onActivate={() => file.onOpen()}
      itemClassName="adl-filetree__item adl-filetree__node--file"
      rowClassName="adl-filetree__row"
      labelClassName="adl-filetree__label"
      toggleClassName="adl-filetree__toggle"
      indentClassName={`adl-filetree__indent${flat ? ' adl-filetree__indent--flat' : ''}`}
      labelContentClassName="adl-filetree__node-main"
      label={highlightMatch(file.name, nameQuery, matchCase)}
      nodePath={file.path}
      iconBefore={
        <span className="adl-filetree__file-icon" aria-hidden="true">
          <FileIcon fileName={file.name} size={16} />
        </span>
      }
      count={file.matchCount}
      countClassName="adl-filetree__count adl-search-file__count"
      metaClassName="adl-filetree__meta adl-tree-node__meta--inline"
      meta={
        snippetsCollapsible ? (
          <button
            type="button"
            className="adl-search-file__snippet-toggle"
            onClick={onToggleSnippets}
            aria-label={snippetsCollapsed ? expandLabel : collapseLabel}
            aria-expanded={snippetsCollapsed ? 'false' : 'true'}
            title={snippetsCollapsed ? expandLabel : collapseLabel}
          >
            {snippetsCollapsed ? (
              <IconSnippetExpand size={12} decorative />
            ) : (
              <IconSnippetCollapse size={12} decorative />
            )}
          </button>
        ) : undefined
      }
    >
      {file.snippets.length > 0 && !snippetsCollapsed ? (
        <ul
          className="adl-search-snippet-list"
          style={{ '--adl-search-pull': `${4 + depth * 14}px` } as React.CSSProperties}
        >
          {file.snippets.map((snippet, index) => (
            <li key={`${file.key}:${snippet.line}:${index}`} className="adl-search-snippet__item">
              <button
                type="button"
                className="adl-search-snippet__btn"
                onClick={snippet.onOpen}
                title={`${snippet.line} ${snippet.preview}`}
              >
                <span className="adl-search-snippet__line">{snippet.line}</span>
                <span className="adl-search-snippet__preview">
                  {highlightMatch(snippet.preview || file.path, query, matchCase)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </TreeNodeRow>
  );
}

function SearchDirRows(props: {
  entries: ChildEntry[];
  depth: number;
  flat: boolean;
  query: string;
  matchCase: boolean;
  nameQuery: string;
  collapsedDirs: Set<string>;
  onToggleDir: (path: string) => void;
  expandLabel: string;
  collapseLabel: string;
  workspaceId: string;
  collapsedFiles: Set<string>;
  onToggleSnippets: (key: string) => void;
}) {
  const {
    entries,
    depth,
    flat,
    query,
    matchCase,
    nameQuery,
    collapsedDirs,
    onToggleDir,
    workspaceId,
    collapsedFiles,
    onToggleSnippets,
  } = props;
  return (
    <>
      {entries.map((entry) => {
        if (entry.kind === 'file') {
          const snippetKey = snippetKeyOf(workspaceId, entry.file.key);
          return (
            <SearchFileRow
              key={entry.file.key}
              file={entry.file}
              depth={depth}
              flat={flat}
              query={query}
              matchCase={matchCase}
              nameQuery={nameQuery}
              expandLabel={props.expandLabel}
              collapseLabel={props.collapseLabel}
              snippetsCollapsible={entry.file.snippets.length > 0}
              snippetsCollapsed={collapsedFiles.has(snippetKey)}
              onToggleSnippets={() => onToggleSnippets(snippetKey)}
            />
          );
        }
        // 默认全部展开：collapsedDirs 只记录被用户手动收起的目录
        const isExpanded = !collapsedDirs.has(entry.path);
        return (
          <TreeNodeRow
            key={entry.path}
            // 与 FileTree 同约定：TreeNodeRow 收到的 depth 为层级+1（indent = (depth-1)*14）
            depth={depth + 1}
            rowOffset={depth * 48 + 4}
            hasChildren
            isExpanded={isExpanded}
            expandLabel={props.expandLabel}
            collapseLabel={props.collapseLabel}
            onToggle={() => onToggleDir(entry.path)}
            onActivate={() => onToggleDir(entry.path)}
            itemClassName="adl-filetree__item adl-filetree__node--directory"
            rowClassName="adl-filetree__row"
            labelClassName="adl-filetree__label"
            toggleClassName="adl-filetree__toggle"
            indentClassName={`adl-filetree__indent${flat ? ' adl-filetree__indent--flat' : ''}`}
            labelContentClassName="adl-filetree__node-main"
            label={entry.name}
            nodePath={entry.path}
          >
            {isExpanded ? (
              <ul className="adl-filetree__children">
                <SearchDirRows {...props} entries={entry.children} depth={depth + 1} />
              </ul>
            ) : null}
          </TreeNodeRow>
        );
      })}
    </>
  );
}

// 检索结果树：与变更面板共用同一行级 chrome（TreeNodeRow + adl-filetree__* + FileIcon +
// adl-multitree-entry 分组头），内容范围时文件行下方追加内容片段子行。
function collectDirPaths(entries: ChildEntry[], out: string[]) {
  for (const entry of entries) {
    if (entry.kind === 'dir') {
      out.push(entry.path);
      collectDirPaths(entry.children, out);
    }
  }
}

function snippetKeyOf(workspaceId: string, fileKey: string) {
  return `${workspaceId}:${fileKey}`;
}

const SearchResultsTree = React.memo(function SearchResultsTree(props: SearchResultsTreeProps) {
  const {
    sections,
    variant,
    query,
    matchCase,
    expandLabel,
    collapseLabel,
    nameQuery,
    structureSignal,
    onStructureSignalConsumed,
    onCollapseStatusChange,
  } = props;
  const flat = variant === 'list';

  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => new Set());
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(() => new Set());
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setCollapsedSections(new Set());
    setCollapsedDirs(new Set());
    setCollapsedFiles(new Set());
  }, [query, sections]);

  const trees = useMemo(() => {
    if (variant === 'list') {
      return null;
    }
    const map = new Map<string, ChildEntry[]>();
    for (const section of sections) {
      map.set(section.workspaceId, buildDirTree(section.files));
    }
    return map;
  }, [sections, variant]);

  const toggleIn = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // 工具栏折叠全部/展开全部信号：内容范围作用全体片段，文件范围作用目录树
  useEffect(() => {
    if (!structureSignal) {
      return;
    }
    if (structureSignal.target === 'snippets') {
      if (structureSignal.action === 'collapse') {
        const all = new Set<string>();
        for (const section of sections) {
          for (const file of section.files) {
            if (file.snippets.length > 0) {
              all.add(snippetKeyOf(section.workspaceId, file.key));
            }
          }
        }
        setCollapsedFiles(all);
      } else {
        setCollapsedFiles(new Set());
      }
    } else if (trees) {
      if (structureSignal.action === 'collapse') {
        const all: string[] = [];
        trees.forEach((entries) => collectDirPaths(entries, all));
        setCollapsedDirs(new Set(all));
      } else {
        setCollapsedDirs(new Set());
      }
    }
    onStructureSignalConsumed();
  }, [structureSignal, sections, trees, onStructureSignalConsumed]);

  // 向工具栏回报告知当前折叠状态（决定折叠/展开图标）
  useEffect(() => {
    const snippetKeys: string[] = [];
    for (const section of sections) {
      for (const file of section.files) {
        if (file.snippets.length > 0) {
          snippetKeys.push(snippetKeyOf(section.workspaceId, file.key));
        }
      }
    }
    const dirPaths: string[] = [];
    trees?.forEach((entries) => collectDirPaths(entries, dirPaths));
    onCollapseStatusChange({
      snippetsAllCollapsed: snippetKeys.every((k) => collapsedFiles.has(k)),
      dirsAllCollapsed: dirPaths.every((p) => collapsedDirs.has(p)),
    });
  }, [sections, trees, collapsedFiles, collapsedDirs, onCollapseStatusChange]);

  return (
    <CustomScrollArea
      shellClassName="adl-multitree"
      scrollClassName="adl-multitree-scroll"
      scrollbarClassName="adl-multitree-scrollbar"
      thumbClassName="adl-multitree-scrollbar__thumb"
    >
      {sections.map((section) => {
        const sectionCollapsed = collapsedSections.has(section.workspaceId);
        return (
          <div key={section.workspaceId} className="adl-multitree-entry">
            <div className="adl-multitree-entry__header">
              <div className="adl-multitree-entry__expand">
                <button
                  type="button"
                  className="adl-multitree-entry__expand-btn"
                  onClick={() => toggleIn(setCollapsedSections, section.workspaceId)}
                  aria-label={sectionCollapsed ? expandLabel : collapseLabel}
                  aria-expanded={sectionCollapsed ? 'false' : 'true'}
                >
                  {sectionCollapsed ? (
                    <IconFolder size={14} decorative />
                  ) : (
                    <IconFolderOpen size={14} decorative />
                  )}
                </button>
              </div>
              <div
                className="adl-multitree-entry__namezone"
                role="button"
                tabIndex={0}
                onClick={() => toggleIn(setCollapsedSections, section.workspaceId)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggleIn(setCollapsedSections, section.workspaceId);
                  }
                }}
                aria-label={section.workspaceName}
              >
                <span className="adl-multitree-entry__name" title={section.workspaceName}>
                  {section.workspaceName}
                </span>
                <span className="adl-multitree-entry__count">{section.files.length}</span>
              </div>
            </div>
            {sectionCollapsed ? null : (
              <div className="adl-multitree-entry__tree">
                <ul className="adl-filetree adl-tree-root adl-search-results">
                  {variant === 'list' ? (
                    section.files.map((file) => {
                      const snippetKey = snippetKeyOf(section.workspaceId, file.key);
                      return (
                        <SearchFileRow
                          key={file.key}
                          file={file}
                          depth={0}
                          flat
                          query={query}
                          matchCase={matchCase}
                          nameQuery={nameQuery}
                          expandLabel={expandLabel}
                          collapseLabel={collapseLabel}
                          snippetsCollapsible={file.snippets.length > 0}
                          snippetsCollapsed={collapsedFiles.has(snippetKey)}
                          onToggleSnippets={() => toggleIn(setCollapsedFiles, snippetKey)}
                        />
                      );
                    })
                  ) : (
                    <SearchDirRows
                      entries={trees?.get(section.workspaceId) ?? []}
                      depth={0}
                      flat={flat}
                      query={query}
                      matchCase={matchCase}
                      nameQuery={nameQuery}
                      collapsedDirs={collapsedDirs}
                      onToggleDir={(path) => toggleIn(setCollapsedDirs, path)}
                      expandLabel={expandLabel}
                      collapseLabel={collapseLabel}
                      workspaceId={section.workspaceId}
                      collapsedFiles={collapsedFiles}
                      onToggleSnippets={(key) => toggleIn(setCollapsedFiles, key)}
                    />
                  )}
                </ul>
              </div>
            )}
          </div>
        );
      })}
    </CustomScrollArea>
  );
});

export { SearchResultsTree };
export type { SearchResultsTreeProps, SearchStructureSignal, SearchCollapseStatus };
