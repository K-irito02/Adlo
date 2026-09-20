import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { WorkspaceTreeNode } from '@ai-digital-life/kernel';
import { FileIcon } from '@shared/file-icon';
import {
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconFoldVertical,
  IconUnfoldVertical,
} from '@icons';
import { TooltipSimple } from '@components/Tooltip';
import { CustomScrollArea } from '@features/file-tree/CustomScrollArea';
import {
  ignoreCheckStateOf,
  toggleIgnoredPath,
  type IgnoreCheckState,
} from '../../../shared/ipc/searchIgnore';

interface SearchIgnoreTreeProps {
  /** 当前工作区 id（切换时展开态重置，忽略名单由调用方按工作区传入） */
  workspaceId: string;
  nodes: WorkspaceTreeNode[];
  /** 该工作区的手动忽略名单（store 快照） */
  ignoredPaths: string[];
  onChange: (next: string[]) => void;
  expandLabel: string;
  collapseLabel: string;
  checkLabel: (name: string) => string;
  emptyHint: string;
  /** 工具栏右侧扩展（调用方传入：检索设置里放 gitignore 开关 + 说明入口） */
  toolbarExtra?: React.ReactNode;
}

type CheckState = IgnoreCheckState;

/** 与文件树同层级缩进：每层 14px（文件树 `--adl-tree-indent: (depth-1)*14`，此处 depth 从 0 起）。 */
const INDENT_PER_LEVEL = 14;
/**
 * 虚拟化行高（固定值）：行内容单行不换行（勾选 14px / chevron 18px / 图标 16px
 * 均 ≤ 24px 内容区）+ 上下 padding 各 2px = 28px。改行样式时必须同步改这里，
 * 否则虚拟占位与真实行错位。
 */
const ROW_HEIGHT = 28;
/** 可视窗口上下各多渲染的行数（快速滚动不露白） */
const OVERSCAN_ROWS = 12;

function collectDirPaths(nodes: WorkspaceTreeNode[], out: string[]): void {
  for (const node of nodes) {
    if (node.kind === 'directory') {
      out.push(node.path);
      collectDirPaths(node.children, out);
    }
  }
}

/** 在树中找到某路径的节点（含其子树）。 */
function findNode(nodes: WorkspaceTreeNode[], path: string): WorkspaceTreeNode | undefined {
  for (const node of nodes) {
    if (node.path === path) {
      return node;
    }
    const found = findNode(node.children, path);
    if (found) {
      return found;
    }
  }
  return undefined;
}

/**
 * 取消勾选"仅被祖先覆盖"的路径：把最近的显式祖先条目展开为兄弟条目，
 * 唯独留下目标路径不被忽略（其余兄弟仍保持忽略）。例如忽略名单为 ['a']，
 * 取消勾选 a/b/c.md 后，a 被替换为 a 下除 b 链之外的兄弟 + b 下除 c 链之外的兄弟……
 * 递归到底，目标文件最终处于未忽略态。
 */
function expandAncestorForUncheck(
  roots: WorkspaceTreeNode[],
  target: string,
  ignored: string[],
): string[] {
  const normalizedTarget = target.replace(/\\/g, '/');
  // 最近的显式祖先（含自身精确条目时调用方不会走到这里）。
  let ancestor: string | undefined;
  for (const ig of ignored) {
    if (normalizedTarget === ig || normalizedTarget.startsWith(`${ig}/`)) {
      if (ancestor === undefined || ig.length > ancestor.length) {
        ancestor = ig;
      }
    }
  }
  if (ancestor === undefined) {
    return toggleIgnoredPath(target, ignored);
  }
  const ancestorNode = findNode(roots, ancestor);
  if (!ancestorNode) {
    return toggleIgnoredPath(target, ignored);
  }
  const rest = ignored.filter((ig) => ig !== ancestor && !ig.startsWith(`${ancestor}/`));
  const expanded: string[] = [];
  const walk = (dir: WorkspaceTreeNode) => {
    for (const child of dir.children) {
      if (normalizedTarget === child.path) {
        continue;
      }
      if (normalizedTarget.startsWith(`${child.path}/`)) {
        if (child.kind === 'directory') {
          walk(child);
        }
        continue;
      }
      expanded.push(child.path);
    }
  };
  walk(ancestorNode);
  return [...rest, ...expanded];
}

interface IgnoreCheckProps {
  state: CheckState;
  label: string;
  onToggle: () => void;
}

/**
 * 最左侧独立列的勾选框（需求：统一在最左侧成一列，不跟在节点名前）。
 * `role=checkbox` 承载——点击 stopPropagation 不触发行的展开/打开，
 * 键盘（Enter/Space）同样可达；`aria-checked="mixed"` 对应半选小圆点。
 */
const IgnoreCheck = React.memo(function IgnoreCheck({ state, label, onToggle }: IgnoreCheckProps) {
  const checkClass = state === 'checked' ? ' is-checked' : state === 'partial' ? ' is-partial' : '';
  return (
    <span
      className={`adl-search-ignore__check${checkClass}`}
      role="checkbox"
      aria-checked={state === 'partial' ? 'mixed' : state === 'checked' ? 'true' : 'false'}
      aria-label={label}
      tabIndex={0}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      onKeyDown={(event) => {
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          event.stopPropagation();
          onToggle();
        }
      }}
    >
      {state === 'checked' ? <IconCheck size={12} decorative /> : null}
    </span>
  );
});

interface IgnoreTreeNodeProps {
  node: WorkspaceTreeNode;
  depth: number;
  state: CheckState;
  expanded: boolean;
  expandLabel: string;
  collapseLabel: string;
  checkAriaLabel: string;
  onToggleDir: (path: string) => void;
  onToggleCheck: (path: string) => void;
  /** 该行 chevron 是否高亮（悬停祖先链传递，见 `hoveredPath`） */
  toggleHighlighted: boolean;
  onHover: (path: string | null) => void;
  /** 平铺后的兄弟序号（虚拟化后层级改由 aria-level/setsize/posinset 表达） */
  posInSet: number;
  setSize: number;
}

/**
 * 自定义行（不用 TreeNodeRow）：文件树的行类是 full-bleed 设计
 * （`width: calc(100% + offset)` + 负 margin，专为无边框面板准备），
 * 在弹窗边框容器里会左右溢出；且 TreeNodeRow 的 DOM 顺序固定 chevron 在前，
 * 勾选框做不到"最左侧独立列"。此处视觉 token 与文件树对齐
 * （24px 行高、hover 色、12px chevron、16px FileIcon），布局自有。
 */
const IgnoreTreeNode = React.memo(function IgnoreTreeNode({
  node,
  depth,
  state,
  expanded,
  expandLabel,
  collapseLabel,
  checkAriaLabel,
  onToggleDir,
  onToggleCheck,
  toggleHighlighted,
  onHover,
  posInSet,
  setSize,
}: IgnoreTreeNodeProps) {
  const isDir = node.kind === 'directory';
  const handleToggleDir = useCallback(() => onToggleDir(node.path), [onToggleDir, node.path]);
  const handleToggleCheck = useCallback(() => onToggleCheck(node.path), [onToggleCheck, node.path]);
  // 目录行点击 = 展开/折叠（与文件树同行为），勾选走行首 checkbox；
  // 文件行点击 = 勾选切换。
  const handleActivate = useCallback(() => {
    if (isDir) {
      onToggleDir(node.path);
    } else {
      onToggleCheck(node.path);
    }
  }, [isDir, onToggleDir, onToggleCheck, node.path]);

  const handleMouseEnter = useCallback(() => onHover(node.path), [onHover, node.path]);
  const handleMouseLeave = useCallback(() => onHover(null), [onHover]);

  return (
    <li
      className="adl-search-ignore__item"
      role="treeitem"
      aria-level={depth + 1}
      aria-setsize={setSize}
      aria-posinset={posInSet}
      aria-expanded={isDir ? (expanded ? 'true' : 'false') : undefined}
      data-path={node.path}
    >
      <div
        className="adl-search-ignore__row"
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <IgnoreCheck state={state} label={checkAriaLabel} onToggle={handleToggleCheck} />
        {/* 勾选框是固定 gutter（不随深度缩进，纵向成一列）；
            只有树内容按深度缩进 */}
        <div
          className="adl-search-ignore__row-body"
          style={{ paddingLeft: depth * INDENT_PER_LEVEL }}
        >
          {isDir ? (
            <button
              type="button"
              className={`adl-search-ignore__toggle${toggleHighlighted ? ' is-highlighted' : ''}`}
              onClick={handleToggleDir}
              aria-label={(expanded ? collapseLabel : expandLabel) as string}
              aria-expanded={expanded ? 'true' : 'false'}
              tabIndex={-1}
            >
              {expanded ? (
                <IconChevronDown size={12} decorative />
              ) : (
                <IconChevronRight size={12} decorative />
              )}
            </button>
          ) : (
            <span className="adl-search-ignore__toggle" aria-hidden="true" />
          )}
          <button
            type="button"
            className="adl-search-ignore__label"
            title={node.path}
            onClick={handleActivate}
          >
            {isDir ? null : (
              <span className="adl-search-ignore__file-icon" aria-hidden="true">
                <FileIcon fileName={node.name} size={16} />
              </span>
            )}
            <span className="adl-search-ignore__label-text">{node.name}</span>
          </button>
        </div>
      </div>
    </li>
  );
});

interface FlatRow {
  node: WorkspaceTreeNode;
  depth: number;
  posInSet: number;
  setSize: number;
}

const SearchIgnoreTree = React.memo(function SearchIgnoreTree({
  workspaceId,
  nodes,
  ignoredPaths,
  onChange,
  expandLabel,
  collapseLabel,
  checkLabel,
  emptyHint,
  toolbarExtra,
}: SearchIgnoreTreeProps) {
  // 白名单式展开：默认全部折叠（含异步后到达的目录——打开弹窗即只渲染顶层，
  // 大仓库不再一次性构建数千行）。工作区切换时重置。
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  // 当前悬停的行：其自身 + 所有后代行的 chevron 同步高亮（高亮传递）。
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);
  const workspaceRef = useRef(workspaceId);
  const scrollElRef = useRef<HTMLDivElement | null>(null);
  const scrollRafRef = useRef(0);
  // 虚拟化视口（可视区 scrollTop + 高度），滚动/resize 时经 rAF 节流更新。
  const [viewport, setViewport] = useState({ top: 0, height: 360 });
  useEffect(() => {
    if (workspaceRef.current !== workspaceId) {
      workspaceRef.current = workspaceId;
      setExpanded(new Set());
      setHoveredPath(null);
      scrollElRef.current?.scrollTo({ top: 0 });
      setViewport((prev) => ({ ...prev, top: 0 }));
    }
  }, [workspaceId]);

  // 容器尺寸变化（弹窗/面板 resize）即刷新视口高度，否则窗口行数算少。
  useEffect(() => {
    const el = scrollElRef.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      return;
    }
    const update = () =>
      setViewport((prev) =>
        prev.height === el.clientHeight && prev.top === el.scrollTop
          ? prev
          : { top: el.scrollTop, height: el.clientHeight },
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollElRef.current;
    if (!el) {
      return;
    }
    window.cancelAnimationFrame(scrollRafRef.current);
    scrollRafRef.current = window.requestAnimationFrame(() => {
      setViewport((prev) =>
        prev.top === el.scrollTop && prev.height === el.clientHeight
          ? prev
          : { top: el.scrollTop, height: el.clientHeight },
      );
    });
  }, []);

  useEffect(() => () => window.cancelAnimationFrame(scrollRafRef.current), []);

  const allDirPaths = useMemo(() => {
    const out: string[] = [];
    collectDirPaths(nodes, out);
    return out;
  }, [nodes]);
  // 空树时视为"已全部展开"，禁用切换按钮（与之前语义一致）。
  const allExpanded = useMemo(
    () => allDirPaths.length > 0 && allDirPaths.every((p) => expanded.has(p)),
    [allDirPaths, expanded],
  );

  const handleToggleDir = useCallback((path: string) => {
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

  const handleExpandAll = useCallback(() => {
    setExpanded(new Set(allDirPaths));
  }, [allDirPaths]);
  const handleCollapseAll = useCallback(() => {
    setExpanded(new Set());
  }, []);

  const handleHover = useCallback((path: string | null) => {
    setHoveredPath(path);
  }, []);

  const handleToggleCheck = useCallback(
    (path: string) => {
      const explicit = ignoredPaths.includes(path);
      const state = ignoreCheckStateOf(path, ignoredPaths);
      if (!explicit && state === 'checked') {
        // 仅被祖先覆盖：展开祖先为兄弟条目，唯独放行目标路径。
        onChange(expandAncestorForUncheck(nodes, path, [...ignoredPaths]));
      } else {
        onChange(toggleIgnoredPath(path, ignoredPaths));
      }
    },
    [ignoredPaths, nodes, onChange],
  );

  // 可见行平铺（只走数据、不建 React 元素：3 万行也只要几毫秒）。
  // 渲染只取视口窗口 + 上下 overscan，展开全部不再一次性建几万个 DOM。
  const flatRows = useMemo(() => {
    const out: FlatRow[] = [];
    const walk = (list: WorkspaceTreeNode[], depth: number) => {
      list.forEach((node, index) => {
        out.push({ node, depth, posInSet: index + 1, setSize: list.length });
        if (node.kind === 'directory' && expanded.has(node.path)) {
          walk(node.children, depth + 1);
        }
      });
    };
    walk(nodes, 0);
    return out;
  }, [nodes, expanded]);

  const windowStart = Math.max(0, Math.floor(viewport.top / ROW_HEIGHT) - OVERSCAN_ROWS);
  const windowEnd = Math.min(
    flatRows.length,
    Math.ceil((viewport.top + viewport.height) / ROW_HEIGHT) + OVERSCAN_ROWS,
  );

  const isEmpty = nodes.length === 0;

  return (
    <div className="adl-search-ignore">
      {/* 左侧=调用方扩展（检索设置里放 gitignore 开关），右侧=展开/折叠全部 */}
      <div className="adl-search-ignore__toolbar">
        {toolbarExtra ? (
          <div className="adl-search-ignore__toolbar-group">{toolbarExtra}</div>
        ) : null}
        <div className="adl-search-ignore__toolbar-group">
          <TooltipSimple content={allExpanded ? collapseLabel : expandLabel} placement="top">
            <button
              type="button"
              className="adl-tool-context__iconbtn adl-tool-navigator__context-btn"
              onClick={allExpanded ? handleCollapseAll : handleExpandAll}
              aria-label={(allExpanded ? collapseLabel : expandLabel) as string}
              disabled={allDirPaths.length === 0}
            >
              {allExpanded ? (
                <IconFoldVertical size={14} decorative />
              ) : (
                <IconUnfoldVertical size={14} decorative />
              )}
            </button>
          </TooltipSimple>
        </div>
      </div>
      {isEmpty ? (
        <p className="adl-empty-hint">{emptyHint}</p>
      ) : (
        <CustomScrollArea
          shellClassName="adl-search-ignore__scroll"
          scrollClassName="adl-search-ignore__scroll-area"
          scrollbarClassName="adl-multitree-scrollbar"
          thumbClassName="adl-multitree-scrollbar__thumb"
          onScroll={handleScroll}
          scrollRef={scrollElRef}
        >
          <ul className="adl-search-ignore__tree" role="tree">
            {windowStart > 0 ? (
              <div
                className="adl-search-ignore__spacer"
                style={{ height: windowStart * ROW_HEIGHT }}
                aria-hidden="true"
              />
            ) : null}
            {flatRows.slice(windowStart, windowEnd).map(({ node, depth, posInSet, setSize }) => {
              const isDir = node.kind === 'directory';
              return (
                <IgnoreTreeNode
                  key={node.path}
                  node={node}
                  depth={depth}
                  state={ignoreCheckStateOf(node.path, ignoredPaths)}
                  expanded={isDir && expanded.has(node.path)}
                  expandLabel={expandLabel}
                  collapseLabel={collapseLabel}
                  checkAriaLabel={checkLabel(node.name)}
                  onToggleDir={handleToggleDir}
                  onToggleCheck={handleToggleCheck}
                  toggleHighlighted={
                    hoveredPath !== null &&
                    (node.path === hoveredPath || node.path.startsWith(`${hoveredPath}/`))
                  }
                  onHover={handleHover}
                  posInSet={posInSet}
                  setSize={setSize}
                />
              );
            })}
            {windowEnd < flatRows.length ? (
              <div
                className="adl-search-ignore__spacer"
                style={{ height: (flatRows.length - windowEnd) * ROW_HEIGHT }}
                aria-hidden="true"
              />
            ) : null}
          </ul>
        </CustomScrollArea>
      )}
    </div>
  );
});

export { SearchIgnoreTree, ROW_HEIGHT };
export type { SearchIgnoreTreeProps, CheckState };
