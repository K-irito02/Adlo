/**
 * PROTOTYPE ONLY — 书签树「放入 / 插入」反馈样式终选版。
 *
 * 用户已选定 B 的方向，并按反馈调整：
 * - 放入：沿用“整行淡色背景”，不要 B 的描边/外发光。
 * - 插入：使用 B 的两端渐隐线。
 * - 配色：不使用强调色；暗色主题用白，亮色主题用黑。
 * 三个变体只调整深浅（轻 / 标准 / 强），用于挑选透明度。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

type Variant = 'B1' | 'B2' | 'B3';
type Theme = 'light' | 'dark';

const VARIANTS: readonly Variant[] = ['B1', 'B2', 'B3'] as const;

interface Tone {
  into: string;
  line: string;
  glow: string;
}

const TONES: Record<Variant, Record<Theme, Tone>> = {
  B1: {
    dark: {
      into: 'rgba(255, 255, 255, 0.12)',
      line: 'rgba(255, 255, 255, 0.62)',
      glow: 'rgba(255, 255, 255, 0.12)',
    },
    light: {
      into: 'rgba(0, 0, 0, 0.09)',
      line: 'rgba(0, 0, 0, 0.55)',
      glow: 'rgba(0, 0, 0, 0.08)',
    },
  },
  B2: {
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
  },
  B3: {
    dark: {
      into: 'rgba(255, 255, 255, 0.22)',
      line: 'rgba(255, 255, 255, 1)',
      glow: 'rgba(255, 255, 255, 0.30)',
    },
    light: {
      into: 'rgba(0, 0, 0, 0.17)',
      line: 'rgba(0, 0, 0, 0.92)',
      glow: 'rgba(0, 0, 0, 0.18)',
    },
  },
};

const VARIANT_META: Record<Variant, { name: string; description: string; tag: string }> = {
  B1: {
    name: '轻 · Soft',
    description:
      '暗色 12% 白 / 亮色 9% 黑；插入线 62% / 55%，光晕 12% / 8%。最克制，适合不喜欢打断阅读节奏的场景。',
    tag: '克制',
  },
  B2: {
    name: '标准 · Standard',
    description:
      '暗色 16% 白 / 亮色 12% 黑；插入线 84% / 78%，光晕 20% / 12%。与 hover 明确区分，亮暗两套都稳定，推荐。',
    tag: '推荐',
  },
  B3: {
    name: '强 · Strong',
    description:
      '暗色 22% 白 / 亮色 17% 黑；插入线 100% / 92%，光晕 30% / 18%。对比度最高，适合低亮度屏或远距离观看。',
    tag: '高对比',
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

function DemoFolderRow({ label, count }: { label: string; count: number }) {
  return (
    <div className="fb-row fb-row--folder is-into">
      <span className="fb-row__indent" style={{ width: 0 }} />
      <span className="fb-row__chevron">
        <Chevron open />
      </span>
      <span className="fb-row__icon">
        <FolderIcon open />
      </span>
      <span className="fb-row__label">{label}</span>
      <span className="fb-row__count">{count}</span>
    </div>
  );
}

export function FeedbackPrototype() {
  const [variant, setVariant] = useState<Variant>(() => readParam('variant', VARIANTS, 'B2'));
  const [theme, setTheme] = useState<Theme>(
    () => readParam('theme', ['light', 'dark'] as const, readTheme()) as Theme,
  );
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(['w-adlo', 'f-video', 'f-ref']),
  );
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [line, setLine] = useState<LineGeometry | null>(null);

  const treeRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<DragSession | null>(null);
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

  const tone = TONES[variant][theme];

  const toneStyle = useMemo<CSSProperties>(
    () =>
      ({
        '--fb-into': tone.into,
        '--fb-line-color': tone.line,
        '--fb-glow': tone.glow,
      }) as CSSProperties,
    [tone],
  );

  // URL 同步：variant / theme 可分享、刷新保持；清掉旧版 palette 参数。
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('variant', variant);
    url.searchParams.set('theme', theme);
    url.searchParams.delete('palette');
    window.history.replaceState(null, '', url);
  }, [variant, theme]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const changeVariant = useCallback((next: Variant) => {
    setVariant(next);
    setFeedback(null);
    setLine(null);
  }, []);

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
      const index = VARIANTS.indexOf(variantRef.current);
      const delta = event.key === 'ArrowRight' ? 1 : -1;
      const next = VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length];
      changeVariant(next);
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
      }
      event.preventDefault();

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
    };

    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleCancel);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
    };
  }, []);

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

  const meta = VARIANT_META[variant];
  const themeLabel = theme === 'dark' ? '暗色 · 白色反馈' : '亮色 · 黑色反馈';

  const stateJson = JSON.stringify(
    {
      variant,
      theme,
      tone,
      dragging: dragKey,
      feedback,
      line: line
        ? { top: Math.round(line.top), left: Math.round(line.left), width: Math.round(line.width) }
        : null,
    },
    null,
    2,
  );

  return (
    <div className="fb-page" data-variant={variant} style={toneStyle}>
      <header className="fb-header">
        <div>
          <p className="fb-eyebrow">Prototype · DnD feedback · B</p>
          <h1>拖拽反馈：中性底色 + 渐隐线</h1>
          <p className="fb-subtitle">
            放入沿用整行淡色背景（无描边、无外发光）；插入使用两端渐隐的 2px
            线。颜色不跟随强调色：暗色主题用白，亮色主题用黑。 本页只比较深浅，不会改变任何顺序。
          </p>
        </div>
        <div className="fb-badges" aria-hidden="true">
          <span>{meta.tag}</span>
          <span>{themeLabel}</span>
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
                        }${dragKey === row.key ? ' is-dragging' : ''}`}
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
            {feedback
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
            <div className="fb-tokens">
              <span className="fb-token">
                <i className="fb-token__fill" />
                放入 {tone.into}
              </span>
              <span className="fb-token">
                <i className="fb-token__line" />
                插入 {tone.line}
              </span>
              <span className="fb-token">
                <i style={{ background: tone.glow }} />
                光晕
              </span>
            </div>
          </div>

          <div className="fb-card">
            <div className="fb-card__title">规格预览</div>
            <div className="fb-spec">
              <span className="fb-spec__label">插入 · 行间（两端渐隐）</span>
              <div className="fb-demo-rows">
                <div className="fb-demo-row">哔哩哔哩</div>
                <div className="fb-line is-static" style={{ top: 29, left: 6, right: 6 }} />
                <div className="fb-demo-row">下一个书签</div>
              </div>
            </div>
            <div className="fb-spec">
              <span className="fb-spec__label">放入 · 目录（整行底色）</span>
              <div className="fb-demo-rows">
                <DemoFolderRow label="视频平台" count={5} />
              </div>
            </div>
          </div>

          <div className="fb-card">
            <div className="fb-card__title">实现要点</div>
            <pre className="fb-code">
              {`放入\n  background: ${tone.into}\n  border-radius: 6px（沿用现有行圆角）\n  不加 border / box-shadow\n\n插入\n  height: 2px\n  background: linear-gradient(90deg,\n    transparent, ${tone.line} 12%,\n    ${tone.line} 88%, transparent)\n  box-shadow: 0 0 8px ${tone.glow}`}
            </pre>
          </div>

          <div className="fb-card">
            <div className="fb-card__title">状态</div>
            <pre className="fb-code fb-code--state">{stateJson}</pre>
          </div>
        </aside>
      </main>

      <div className="fb-switcher" role="group" aria-label="切换反馈强度">
        <button
          type="button"
          className="fb-switcher__arrow"
          aria-label="上一个强度"
          onClick={() => {
            const index = VARIANTS.indexOf(variant);
            changeVariant(VARIANTS[(index - 1 + VARIANTS.length) % VARIANTS.length]);
          }}
        >
          ←
        </button>
        <span className="fb-switcher__label">
          <span className="fb-switcher__key">{variant}</span>
          {meta.name}
        </span>
        <div className="fb-switcher__dots">
          {VARIANTS.map((item) => (
            <button
              key={item}
              type="button"
              className={`fb-switcher__dot${item === variant ? ' is-active' : ''}`}
              aria-label={`切换到强度 ${item}`}
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
          {theme === 'dark' ? '暗 · 白' : '亮 · 黑'}
        </button>
        <span className="fb-switcher__hint">← → 切换强度</span>
        <button
          type="button"
          className="fb-switcher__arrow"
          aria-label="下一个强度"
          onClick={() => {
            const index = VARIANTS.indexOf(variant);
            changeVariant(VARIANTS[(index + 1) % VARIANTS.length]);
          }}
        >
          →
        </button>
      </div>
    </div>
  );
}
