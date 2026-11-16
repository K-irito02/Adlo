/**
 * PROTOTYPE ONLY — 拖拽时“抬起的副本”样式对比。
 *
 * 约束：原行必须留在原位；副本按原行 1:1 克隆（不改内容、不改布局）。
 * 四个变体只改抬升处理：边框/阴影/缩放/玻璃/微倾。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

type GhostVariant = 'A' | 'B' | 'C' | 'D';
type Theme = 'light' | 'dark';

const GHOST_VARIANTS: readonly GhostVariant[] = ['A', 'B', 'C', 'D'] as const;

const GHOST_META: Record<GhostVariant, { name: string; description: string; tag: string }> = {
  A: {
    name: '现状 · 轻浮',
    description:
      '1px 中性边框 + 8/24 双层阴影 + 2% 放大 + 97% 不透明度。与原行差异最小，最接近当前实现。',
    tag: '现状',
  },
  B: {
    name: '纸张 · 厚阴影',
    description:
      '去掉边框，2/12/28 三层阴影 + 上浮 2px + 3% 放大。像一张纸被拿起，层次清楚又不过分。',
    tag: '推荐',
  },
  C: {
    name: '玻璃 · 模糊',
    description:
      '半透明卡片 + 12px backdrop blur + 内高光描边。副本下方内容隐约可见，最轻、最现代。',
    tag: '轻量',
  },
  D: {
    name: '拿起 · 微倾',
    description: '深阴影 + 上浮 3px + 3.5% 放大 + -0.8° 微倾。最有“拿在手里”的实体感，但会更抢眼。',
    tag: '实体',
  },
};

const DROP_TONE: Record<Theme, { into: string; line: string; glow: string }> = {
  dark: {
    into: 'rgba(255, 255, 255, 0.16)',
    line: 'rgba(255, 255, 255, 0.84)',
    glow: 'rgba(255, 255, 255, 0.20)',
  },
  light: {
    into: 'rgba(0, 0, 0, 0.12)',
    line: 'rgba(0, 0, 0, 0.78)',
    glow: 'rgba(0, 0, 0, 0.12)',
  },
};

interface TreeNode {
  key: string;
  label: string;
  kind: 'folder' | 'leaf';
  count?: number;
  children?: TreeNode[];
}

interface Category {
  key: string;
  label: string;
  nodes: TreeNode[];
}

const CATEGORIES: Category[] = [
  {
    key: 'workspace',
    label: '工作区目录',
    nodes: [
      {
        key: 'w-adlo',
        label: 'Adlo',
        kind: 'folder',
        count: 2,
        children: [
          { key: 'b-docs', label: '文档中心', kind: 'leaf' },
          { key: 'b-research', label: '竞品分析', kind: 'leaf' },
        ],
      },
    ],
  },
  {
    key: 'custom',
    label: '自建目录',
    nodes: [
      {
        key: 'f-video',
        label: '视频平台',
        kind: 'folder',
        count: 5,
        children: [
          { key: 'b-douyin', label: '抖音 · 记录美好生活', kind: 'leaf' },
          { key: 'b-bili', label: '哔哩哔哩', kind: 'leaf' },
          { key: 'b-youtube', label: 'YouTube', kind: 'leaf' },
          { key: 'b-tencent', label: '腾讯视频', kind: 'leaf' },
          { key: 'b-mango', label: '芒果TV', kind: 'leaf' },
        ],
      },
      {
        key: 'f-tools',
        label: '工具网站',
        kind: 'folder',
        count: 3,
        children: [
          { key: 'b-github', label: 'GitHub', kind: 'leaf' },
          { key: 'b-mdn', label: 'MDN Web Docs', kind: 'leaf' },
          { key: 'b-figma', label: 'Figma', kind: 'leaf' },
        ],
      },
      {
        key: 'f-ref',
        label: '参考文献',
        kind: 'folder',
        count: 2,
        children: [
          {
            key: 'f-api',
            label: 'API 文档',
            kind: 'folder',
            count: 2,
            children: [
              { key: 'b-openai', label: 'OpenAI API', kind: 'leaf' },
              { key: 'b-stripe', label: 'Stripe API', kind: 'leaf' },
            ],
          },
          { key: 'b-arxiv', label: 'arXiv', kind: 'leaf' },
        ],
      },
      {
        key: 'f-learn',
        label: '学习资料',
        kind: 'folder',
        count: 2,
        children: [
          { key: 'b-ts', label: 'TypeScript 手册', kind: 'leaf' },
          { key: 'b-rust', label: 'Rust Book', kind: 'leaf' },
        ],
      },
    ],
  },
];

interface FlatRow {
  key: string;
  label: string;
  kind: 'folder' | 'leaf';
  depth: number;
  count?: number;
  hasChildren: boolean;
  expanded: boolean;
}

function flattenCategory(nodes: TreeNode[], expanded: Set<string>): FlatRow[] {
  const result: FlatRow[] = [];
  const walk = (items: TreeNode[], depth: number): void => {
    for (const node of items) {
      const hasChildren = node.kind === 'folder' && (node.children?.length ?? 0) > 0;
      const isExpanded = hasChildren && expanded.has(node.key);
      result.push({
        key: node.key,
        label: node.label,
        kind: node.kind,
        depth,
        count: node.count,
        hasChildren,
        expanded: isExpanded,
      });
      if (isExpanded && node.children) {
        walk(node.children, depth + 1);
      }
    }
  };
  walk(nodes, 0);
  return result;
}

interface Feedback {
  kind: 'into' | 'insert';
  key: string;
  label: string;
  edge?: 'before' | 'after';
}

interface LineGeometry {
  top: number;
  left: number;
  width: number;
}

interface DragSession {
  key: string;
  startX: number;
  startY: number;
  active: boolean;
}

interface GhostHandle {
  element: HTMLElement;
  move: (clientX: number, clientY: number) => void;
}

interface GhostState {
  variant: GhostVariant;
  x: number;
  y: number;
}

function readParam<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const raw = new URLSearchParams(window.location.search).get(key);
  const upper = raw?.toUpperCase();
  return allowed.find((item) => item.toUpperCase() === upper) ?? fallback;
}

function readTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function rowDepth(element: HTMLElement): number {
  return Number(element.dataset.fbDepth ?? '0');
}

function subtreeBottom(element: HTMLElement): number {
  const depth = rowDepth(element);
  let bottom = element.getBoundingClientRect().bottom;
  let next = element.nextElementSibling as HTMLElement | null;
  while (next) {
    if (next.hasAttribute('data-fb-row')) {
      if (rowDepth(next) <= depth) {
        break;
      }
      bottom = next.getBoundingClientRect().bottom;
    }
    next = next.nextElementSibling as HTMLElement | null;
  }
  return bottom;
}

function createGhost(
  source: HTMLElement,
  clientX: number,
  clientY: number,
  variant: GhostVariant,
): GhostHandle {
  const rect = source.getBoundingClientRect();
  const clone = source.cloneNode(true) as HTMLElement;
  clone.classList.add('ghost-lift', `ghost-variant-${variant}`);
  clone.setAttribute('aria-hidden', 'true');
  for (const attr of ['data-fb-row', 'data-fb-kind', 'data-fb-depth', 'data-fb-label', 'role']) {
    clone.removeAttribute(attr);
  }
  clone.removeAttribute('aria-expanded');
  clone.style.position = 'fixed';
  clone.style.margin = '0';
  clone.style.width = `${rect.width}px`;
  clone.style.height = `${rect.height}px`;
  clone.style.left = `${rect.left}px`;
  clone.style.top = `${rect.top}px`;
  clone.style.pointerEvents = 'none';
  clone.style.zIndex = '9999';
  document.body.appendChild(clone);

  const offsetX = clientX - rect.left;
  const offsetY = clientY - rect.top;

  return {
    element: clone,
    move: (nextX: number, nextY: number) => {
      clone.style.left = `${nextX - offsetX}px`;
      clone.style.top = `${nextY - offsetY}px`;
    },
  };
}

function FolderIcon({ open }: { open?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {open ? (
        <path d="M3 8a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v1H3zM3 11h18l-2 7H5z" />
      ) : (
        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      )}
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ transform: open ? 'rotate(90deg)' : 'none' }}
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function LeafBadge({ label }: { label: string }) {
  return (
    <span className="fb-row__badge" aria-hidden="true">
      {label.slice(0, 1)}
    </span>
  );
}

function RowContent({ folder, expanded }: { folder: boolean; expanded?: boolean }) {
  return (
    <>
      <span className="fb-row__indent" style={{ width: 0 }} />
      <span className="fb-row__chevron">{folder ? <Chevron open={!!expanded} /> : null}</span>
      <span className="fb-row__icon">
        {folder ? <FolderIcon open={expanded} /> : <LeafBadge label="书" />}
      </span>
      <span className="fb-row__label">{folder ? '视频平台' : '书签示例'}</span>
      <span className="fb-row__count">{folder ? 5 : ''}</span>
    </>
  );
}

export function GhostPrototype() {
  const [variant, setVariant] = useState<GhostVariant>(() =>
    readParam('ghost', GHOST_VARIANTS, 'B'),
  );
  const [theme, setTheme] = useState<Theme>(
    () => readParam('theme', ['light', 'dark'] as const, readTheme()) as Theme,
  );
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(['w-adlo', 'f-video', 'f-ref']),
  );
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [line, setLine] = useState<LineGeometry | null>(null);
  const [ghostState, setGhostState] = useState<GhostState | null>(null);

  const treeRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragSession | null>(null);
  const ghostRef = useRef<GhostHandle | null>(null);
  const suppressClickRef = useRef(false);
  const variantRef = useRef(variant);
  variantRef.current = variant;

  const rowsByCategory = useMemo(
    () =>
      CATEGORIES.map((category) => ({
        category,
        rows: flattenCategory(category.nodes, expanded),
      })),
    [expanded],
  );

  const tone = DROP_TONE[theme];

  const toneStyle = useMemo<CSSProperties>(
    () =>
      ({
        '--fb-into': tone.into,
        '--fb-line-color': tone.line,
        '--fb-glow': tone.glow,
      }) as CSSProperties,
    [tone],
  );

  useEffect(() => {
    document.body.classList.add('ghost-proto');
    return () => {
      document.body.classList.remove('ghost-proto');
      ghostRef.current?.element.remove();
      ghostRef.current = null;
    };
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('ghost', variant);
    url.searchParams.set('theme', theme);
    window.history.replaceState(null, '', url);
  }, [variant, theme]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const removeGhost = useCallback(() => {
    ghostRef.current?.element.remove();
    ghostRef.current = null;
    setGhostState(null);
  }, []);

  const changeVariant = useCallback(
    (next: GhostVariant) => {
      setVariant(next);
      dragRef.current = null;
      setDragKey(null);
      setFeedback(null);
      setLine(null);
      removeGhost();
    },
    [removeGhost],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) {
        return;
      }
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
        return;
      }
      event.preventDefault();
      const index = GHOST_VARIANTS.indexOf(variantRef.current);
      const delta = event.key === 'ArrowRight' ? 1 : -1;
      changeVariant(
        GHOST_VARIANTS[(index + delta + GHOST_VARIANTS.length) % GHOST_VARIANTS.length],
      );
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [changeVariant]);

  useEffect(() => {
    const handleMove = (event: PointerEvent) => {
      const session = dragRef.current;
      if (!session) {
        return;
      }
      if (!session.active) {
        if (Math.hypot(event.clientX - session.startX, event.clientY - session.startY) < 4) {
          return;
        }
        session.active = true;
        setDragKey(session.key);
        const source = treeRef.current?.querySelector<HTMLElement>(
          `[data-fb-row="${CSS.escape(session.key)}"]`,
        );
        if (source) {
          ghostRef.current = createGhost(source, event.clientX, event.clientY, variantRef.current);
        }
      }
      event.preventDefault();
      ghostRef.current?.move(event.clientX, event.clientY);
      setGhostState({
        variant: variantRef.current,
        x: Math.round(event.clientX),
        y: Math.round(event.clientY),
      });

      const target = (
        document.elementFromPoint(event.clientX, event.clientY) as Element | null
      )?.closest<HTMLElement>('[data-fb-row]');
      const tree = treeRef.current;
      if (!target || !tree || target.dataset.fbRow === session.key) {
        setFeedback(null);
        setLine(null);
        return;
      }

      const rect = target.getBoundingClientRect();
      const y = event.clientY - rect.top;
      const targetKind = target.dataset.fbKind;
      const key = target.dataset.fbRow ?? '';
      const label = target.dataset.fbLabel ?? '';
      const depth = rowDepth(target);

      if (targetKind === 'folder' && y > rect.height * 0.25 && y < rect.height * 0.75) {
        setFeedback({ kind: 'into', key, label });
        setLine(null);
        return;
      }

      const edge: 'before' | 'after' = y < rect.height / 2 ? 'before' : 'after';
      const treeRect = tree.getBoundingClientRect();
      const topViewport = edge === 'before' ? rect.top : subtreeBottom(target);
      const left = 6 + depth * 14;
      setFeedback({ kind: 'insert', key, label, edge });
      setLine({
        top: topViewport - treeRect.top,
        left,
        width: Math.max(40, treeRect.width - left - 6),
      });
    };

    const handleUp = () => {
      const session = dragRef.current;
      dragRef.current = null;
      setDragKey(null);
      setFeedback(null);
      setLine(null);
      removeGhost();
      if (session?.active) {
        suppressClickRef.current = true;
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      }
    };

    const handleCancel = () => {
      dragRef.current = null;
      setDragKey(null);
      setFeedback(null);
      setLine(null);
      removeGhost();
    };

    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
    };
  }, [removeGhost]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLElement>, row: FlatRow) => {
    if (event.button > 0) {
      return;
    }
    dragRef.current = {
      key: row.key,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    };
  }, []);

  const toggleExpanded = useCallback((key: string) => {
    if (suppressClickRef.current) {
      return;
    }
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const meta = GHOST_META[variant];

  const stateJson = JSON.stringify(
    {
      ghost: variant,
      theme,
      dragging: dragKey,
      ghostPosition: ghostState,
      feedback,
      line: line
        ? { top: Math.round(line.top), left: Math.round(line.left), width: Math.round(line.width) }
        : null,
    },
    null,
    2,
  );

  return (
    <div className="fb-page ghost-page" style={toneStyle}>
      <header className="fb-header">
        <div>
          <p className="fb-eyebrow">Prototype · Drag ghost</p>
          <h1>拖拽时“抬起的副本”</h1>
          <p className="fb-subtitle">
            原行保持原位，副本按原行 1:1
            克隆跟随光标。四个变体只改变抬升处理：边框、阴影、缩放、玻璃与微倾。
            左侧可直接拖动；右侧有静态对照和当前参数。
          </p>
        </div>
        <div className="fb-badges" aria-hidden="true">
          <span>{meta.tag}</span>
          <span>{theme === 'dark' ? '暗色' : '亮色'}</span>
        </div>
      </header>

      <main className="fb-stage">
        <section className="fb-demo-wrap" aria-label="可拖拽的书签树示例">
          <div className="fb-panel">
            <div className="fb-panel__head">
              <span>书签目录</span>
              <span className="fb-panel__hint">按住行拖动</span>
            </div>
            <div className="fb-tree" ref={treeRef}>
              {rowsByCategory.map(({ category, rows }) => (
                <div className="fb-group" key={category.key}>
                  <div className="fb-cat">
                    <span className="fb-cat__label">{category.label}</span>
                    <span className="fb-cat__count">
                      {rows.filter((r) => r.depth === 0).length}
                    </span>
                  </div>
                  {rows.map((row) => {
                    const isInto = feedback?.kind === 'into' && feedback.key === row.key;
                    return (
                      <div
                        key={row.key}
                        className={`fb-row${row.kind === 'folder' ? ' fb-row--folder' : ''}${
                          isInto ? ' is-into' : ''
                        }`}
                        data-fb-row={row.key}
                        data-fb-kind={row.kind}
                        data-fb-depth={row.depth}
                        data-fb-label={row.label}
                        role="treeitem"
                        aria-expanded={row.hasChildren ? row.expanded : undefined}
                        onPointerDown={(event) => handlePointerDown(event, row)}
                        onClick={() => {
                          if (row.hasChildren) {
                            toggleExpanded(row.key);
                          }
                        }}
                      >
                        <span className="fb-row__indent" style={{ width: row.depth * 14 }} />
                        <span className="fb-row__chevron">
                          {row.hasChildren ? <Chevron open={row.expanded} /> : null}
                        </span>
                        <span className="fb-row__icon">
                          {row.kind === 'folder' ? (
                            <FolderIcon open={row.expanded} />
                          ) : (
                            <LeafBadge label={row.label} />
                          )}
                        </span>
                        <span className="fb-row__label">{row.label}</span>
                        <span className="fb-row__count">{row.count ?? ''}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
              {line ? (
                <div
                  className="fb-line"
                  style={{ top: line.top, left: line.left, width: line.width }}
                  aria-hidden="true"
                />
              ) : null}
            </div>
          </div>
          <p className="fb-caption">
            {ghostState
              ? `拖动中：抬起副本 ${variant} · ${meta.name}（原行保持原位）`
              : feedback
                ? feedback.kind === 'into'
                  ? `当前反馈：放入「${feedback.label}」`
                  : `当前反馈：插入到「${feedback.label}」${feedback.edge === 'after' ? '之后' : '之前'}`
                : '尚未拖拽：按住任意行试试。'}
          </p>
        </section>

        <aside className="fb-inspector" aria-label="方案规格">
          <div className="fb-card">
            <div className="fb-card__title">
              <span className="fb-key">{variant}</span>
              <span>{meta.name}</span>
            </div>
            <p className="fb-card__desc">{meta.description}</p>
          </div>

          <div className="fb-card">
            <div className="fb-card__title">与原行对照</div>
            <div className="ghost-preview">
              <span className="ghost-preview__label">原行（留在原位）</span>
              <div className="fb-row fb-row--folder ghost-preview__source">
                <RowContent folder />
              </div>
              <span className="ghost-preview__label">抬起副本 · 静态</span>
              <div className={`fb-row fb-row--folder ghost-sample ghost-variant-${variant}`}>
                <RowContent folder />
              </div>
            </div>
          </div>

          <div className="fb-card">
            <div className="fb-card__title">实现要点</div>
            <pre className="fb-code">
              {variant === 'A'
                ? `border: 1px solid var(--ghost-border)\nbox-shadow:\n  0 8px 24px var(--ghost-mid),\n  0 2px 6px var(--ghost-soft)\ntransform: scale(1.02)`
                : variant === 'B'
                  ? `border: none\nbox-shadow:\n  0 2px 4px var(--ghost-soft),\n  0 12px 28px var(--ghost-mid),\n  0 28px 56px var(--ghost-far)\ntransform: translateY(-2px) scale(1.03)`
                  : variant === 'C'
                    ? `background: var(--ghost-glass-bg)\nbackdrop-filter: blur(12px) saturate(1.08)\nborder: 1px solid var(--ghost-glass-border)\nbox-shadow: 0 12px 32px var(--ghost-mid)\ntransform: scale(1.025)`
                    : `border: 1px solid var(--ghost-border)\nbox-shadow:\n  0 4px 10px var(--ghost-soft),\n  0 18px 44px var(--ghost-mid)\ntransform: translateY(-3px)\n  rotate(-0.8deg) scale(1.035)`}
            </pre>
          </div>

          <div className="fb-card">
            <div className="fb-card__title">状态</div>
            <pre className="fb-code fb-code--state">{stateJson}</pre>
          </div>
        </aside>
      </main>

      <div className="fb-switcher" role="group" aria-label="切换抬起副本样式">
        <button
          type="button"
          className="fb-switcher__arrow"
          aria-label="上一个样式"
          onClick={() => {
            const index = GHOST_VARIANTS.indexOf(variant);
            changeVariant(
              GHOST_VARIANTS[(index - 1 + GHOST_VARIANTS.length) % GHOST_VARIANTS.length],
            );
          }}
        >
          ←
        </button>
        <span className="fb-switcher__label">
          <span className="fb-switcher__key">{variant}</span>
          {meta.name}
        </span>
        <div className="fb-switcher__dots">
          {GHOST_VARIANTS.map((item) => (
            <button
              key={item}
              type="button"
              className={`fb-switcher__dot${item === variant ? ' is-active' : ''}`}
              aria-label={`切换到样式 ${item}`}
              onClick={() => changeVariant(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <span className="fb-switcher__divider" aria-hidden="true" />
        <button
          type="button"
          className="fb-switcher__theme"
          aria-label="切换亮暗主题"
          onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        >
          {theme === 'dark' ? '暗' : '亮'}
        </button>
        <span className="fb-switcher__hint">← → 切换</span>
        <button
          type="button"
          className="fb-switcher__arrow"
          aria-label="下一个样式"
          onClick={() => {
            const index = GHOST_VARIANTS.indexOf(variant);
            changeVariant(GHOST_VARIANTS[(index + 1) % GHOST_VARIANTS.length]);
          }}
        >
          →
        </button>
      </div>
    </div>
  );
}
