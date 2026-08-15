# 最近工作区：两处统一滚动显示 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让中心面板欢迎区与状态栏工作区菜单两处「最近工作区」都显示全量工作区（无数量限制），可见区域最多 3 行，超出的通过自定义垂直滚动条查看（悬停显示、移出隐藏、滑块可拖拽）。

**Architecture:** 新增共享 hook `useRevealScrollbar`（管理悬停态、溢出检测、滚动进度、拖拽换算）与纯展示组件 `RevealScrollbar`（渲染覆盖式滚动条 DOM）；两处各自把现有列表容器挂上 hook 的 ref/hover 事件并追加该组件，删除 `.slice()` 截断；滚动容器统一用 `.adl-reveal-scroll` 类（隐藏原生滚动条 + `overflow-y:auto`），行样式各自保留。

**Tech Stack:** React 19 + TypeScript + Vitest + @testing-library/react + jsdom；CSS 设计 token（`--text-muted`、`--duration-150`、`--ease-default`）。

## Global Constraints

- 数据源为 store `recentWorkspaces`（后端已过滤 `removedFromSidebar`），数据层/桥接层零改动。
- 不引入任何新依赖。
- 无新增 i18n 文案（滚动条 `aria-hidden`，空状态沿用 `workspaceRecentEmpty`）。
- 颜色等一律用 CSS 设计 token，禁止硬编码色值。
- 不统一两处行样式（WelcomeState 图标+名称+路径；StatusBar 名称+路径）。
- 代码禁止添加注释。
- 红绿 TDD：先写失败测试，再实现，再通过。
- 双端一致：滚动条为纯 DOM div，Tauri WebView2 与浏览器预览行为一致。
- 质量门禁命令：`pnpm --dir frontend run lint`、`pnpm --dir frontend run typecheck`、`pnpm --dir frontend run test`。

---

### Task 1: `useRevealScrollbar` hook

**Files:**
- Create: `ai-digital-life/frontend/src/app/hooks/useRevealScrollbar.ts`
- Test: `ai-digital-life/frontend/src/app/hooks/useRevealScrollbar.test.tsx`

**Interfaces:**
- Produces: `RevealScrollbarController` 类型与 `useRevealScrollbar(deps: DependencyList): RevealScrollbarController`。
  - `scrollRef: RefObject<HTMLDivElement | null>` — 绑到滚动容器
  - `hoverProps: { onMouseEnter: () => void; onMouseLeave: () => void }` — 绑到滚动容器
  - `visible: boolean` — `hovered && scrollable`
  - `scrollable: boolean` — `scrollHeight > clientHeight + 1`
  - `thumbStyle: CSSProperties` — `{ height, transform }`
  - `thumbListeners: { onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void }`

- [ ] **Step 1: 写失败测试**

创建 `ai-digital-life/frontend/src/app/hooks/useRevealScrollbar.test.tsx`：

```tsx
import { describe, it, expect } from 'vitest';
import { fireEvent, render } from '@testing-library/react';
import { useRevealScrollbar, type RevealScrollbarController } from './useRevealScrollbar';

function mockLayout(el: HTMLElement, box: { scrollHeight: number; clientHeight: number }) {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => box.scrollHeight });
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => box.clientHeight });
}

function ThumbProbe({ controller }: { controller: RevealScrollbarController }) {
  return (
    <div
      data-testid="thumb"
      data-visible={controller.visible}
      data-scrollable={controller.scrollable}
      style={controller.thumbStyle}
      {...controller.thumbListeners}
    />
  );
}

function Host({ items, box }: { items: number; box: { scrollHeight: number; clientHeight: number } }) {
  const controller = useRevealScrollbar([items]);
  return (
    <div ref={controller.scrollRef} {...controller.hoverProps} data-testid="host">
      {Array.from({ length: items }, (_, i) => (
        <div key={i}>{i}</div>
      ))}
      <ThumbProbe controller={controller} />
    </div>
  );
}

function renderHost(items: number, box: { scrollHeight: number; clientHeight: number }) {
  const rendered = render(<Host items={items} box={box} />);
  const host = rendered.container.querySelector('[data-testid="host"]') as HTMLElement;
  mockLayout(host, box);
  fireEvent.scroll(host);
  return { ...rendered, host };
}

describe('useRevealScrollbar', () => {
  it('is not scrollable and never visible when content fits', () => {
    const { host } = renderHost(2, { scrollHeight: 100, clientHeight: 100 });
    fireEvent.mouseEnter(host);
    const thumb = document.querySelector('[data-testid="thumb"]') as HTMLElement;
    expect(thumb.dataset.scrollable).toBe('false');
    expect(thumb.dataset.visible).toBe('false');
  });

  it('shows the thumb on hover when content overflows', () => {
    const { host } = renderHost(5, { scrollHeight: 400, clientHeight: 100 });
    fireEvent.mouseEnter(host);
    const thumb = document.querySelector('[data-testid="thumb"]') as HTMLElement;
    expect(thumb.dataset.scrollable).toBe('true');
    expect(thumb.dataset.visible).toBe('true');
    expect(thumb.style.height).toBe('25px');
    expect(thumb.style.transform).toBe('translateY(0px)');
  });

  it('hides the thumb on mouse leave', () => {
    const { host } = renderHost(5, { scrollHeight: 400, clientHeight: 100 });
    fireEvent.mouseEnter(host);
    fireEvent.mouseLeave(host);
    const thumb = document.querySelector('[data-testid="thumb"]') as HTMLElement;
    expect(thumb.dataset.visible).toBe('false');
  });

  it('updates thumb position as the container scrolls', () => {
    const { host } = renderHost(5, { scrollHeight: 400, clientHeight: 100 });
    host.scrollTop = 150;
    fireEvent.scroll(host);
    const thumb = document.querySelector('[data-testid="thumb"]') as HTMLElement;
    expect(thumb.style.transform).toBe('translateY(37.5px)');
  });

  it('drag the thumb translates to scrollTop and clamps', () => {
    const { host } = renderHost(5, { scrollHeight: 400, clientHeight: 100 });
    fireEvent.mouseEnter(host);
    const thumb = document.querySelector('[data-testid="thumb"]') as HTMLElement;
    fireEvent.pointerDown(thumb, { pointerId: 1, clientY: 0 });
    fireEvent.pointerMove(window, { pointerId: 1, clientY: 30 });
    fireEvent.pointerUp(window, { pointerId: 1, clientY: 30 });
    expect(host.scrollTop).toBe(120);
  });

  it('re-measures when deps change and content starts to overflow', () => {
    const box = { scrollHeight: 100, clientHeight: 100 };
    const rendered = render(<Host items={2} box={box} />);
    const host = rendered.container.querySelector('[data-testid="host"]') as HTMLElement;
    mockLayout(host, box);
    box.scrollHeight = 400;
    rendered.rerender(<Host items={5} box={box} />);
    const thumb = document.querySelector('[data-testid="thumb"]') as HTMLElement;
    expect(thumb.dataset.scrollable).toBe('true');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --dir frontend run test -- hooks/useRevealScrollbar.test.tsx`
Expected: FAIL（模块不存在，导入报错）。

- [ ] **Step 3: 实现 hook**

创建 `ai-digital-life/frontend/src/app/hooks/useRevealScrollbar.ts`：

```ts
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DependencyList,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';

export interface RevealScrollbarController {
  scrollRef: RefObject<HTMLDivElement | null>;
  hoverProps: {
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  };
  visible: boolean;
  scrollable: boolean;
  thumbStyle: CSSProperties;
  thumbListeners: {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  };
}

interface Geometry {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

const MIN_THUMB_HEIGHT = 24;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function readGeometry(el: HTMLDivElement): Geometry {
  return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
}

function computeThumb(geometry: Geometry): { height: number; top: number } {
  const { scrollTop, scrollHeight, clientHeight } = geometry;
  if (scrollHeight <= clientHeight + 1 || clientHeight <= 0) {
    return { height: clientHeight, top: 0 };
  }
  const ratio = clientHeight / scrollHeight;
  const height = Math.max(MIN_THUMB_HEIGHT, ratio * clientHeight);
  const maxScroll = scrollHeight - clientHeight;
  const top = (scrollTop / maxScroll) * (clientHeight - height);
  return { height, top };
}

export function useRevealScrollbar(deps: DependencyList): RevealScrollbarController {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const [geometry, setGeometry] = useState<Geometry>({ scrollTop: 0, scrollHeight: 0, clientHeight: 0 });
  const dragState = useRef<{ pointerId: number; startY: number; startScrollTop: number } | null>(null);

  const measure = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    setGeometry(readGeometry(el));
  }, []);

  const depsKey = deps.join('\u0000');

  useEffect(() => {
    measure();
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const onScroll = () => measure();
    el.addEventListener('scroll', onScroll, { passive: true });
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(el);
    }
    return () => {
      el.removeEventListener('scroll', onScroll);
      observer?.disconnect();
    };
  }, [measure, depsKey]);

  const onDragMove = useCallback(
    (event: PointerEvent) => {
      const el = scrollRef.current;
      const state = dragState.current;
      if (!el || !state) {
        return;
      }
      const current = readGeometry(el);
      if (current.clientHeight <= 0 || current.scrollHeight <= current.clientHeight + 1) {
        return;
      }
      const thumb = computeThumb(current);
      const maxScroll = current.scrollHeight - current.clientHeight;
      const maxThumbTop = current.clientHeight - thumb.height;
      if (maxThumbTop <= 0) {
        return;
      }
      const deltaY = event.clientY - state.startY;
      const scrollDelta = (deltaY / maxThumbTop) * maxScroll;
      el.scrollTop = clamp(state.startScrollTop + scrollDelta, 0, maxScroll);
      measure();
    },
    [measure],
  );

  const endDrag = useCallback(
    (event: PointerEvent) => {
      const state = dragState.current;
      if (!state || event.pointerId !== state.pointerId) {
        return;
      }
      dragState.current = null;
      window.removeEventListener('pointermove', onDragMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    },
    [],
  );

  const startDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const el = scrollRef.current;
      if (!el) {
        return;
      }
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      dragState.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startScrollTop: el.scrollTop,
      };
      window.addEventListener('pointermove', onDragMove);
      window.addEventListener('pointerup', endDrag);
      window.addEventListener('pointercancel', endDrag);
    },
    [onDragMove, endDrag],
  );

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', onDragMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    };
  }, [onDragMove, endDrag]);

  const { scrollTop, scrollHeight, clientHeight } = geometry;
  const scrollable = scrollHeight > clientHeight + 1;
  const thumb = computeThumb(geometry);
  const visible = hovered && scrollable;

  return {
    scrollRef,
    hoverProps: {
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
    },
    visible,
    scrollable,
    thumbStyle: {
      height: `${thumb.height}px`,
      transform: `translateY(${thumb.top}px)`,
    },
    thumbListeners: { onPointerDown: startDrag },
  };
}
```

注意：`endDrag` 的 useCallback 依赖数组为空但闭包引用 `onDragMove`；`onDragMove` 在 `endDrag` 之前声明，运行时两者均已初始化，合法。若 lint 报 `react-hooks/exhaustive-deps`，在 `endDrag` 的依赖数组后追加 `onDragMove` 并在该行加 `// eslint-disable-next-line react-hooks/exhaustive-deps`。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --dir frontend run test -- hooks/useRevealScrollbar.test.tsx`
Expected: 6 个用例全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add ai-digital-life/frontend/src/app/hooks/useRevealScrollbar.ts ai-digital-life/frontend/src/app/hooks/useRevealScrollbar.test.tsx
git commit -m "feat(hooks): add useRevealScrollbar for recent workspace scrollbar"
```

---

### Task 2: `RevealScrollbar` 组件 + CSS

**Files:**
- Create: `ai-digital-life/frontend/src/app/components/RevealScrollbar.tsx`
- Create: `ai-digital-life/frontend/src/styles/components/reveal-scrollbar.css`
- Modify: `ai-digital-life/frontend/src/styles/components.css`（追加 `@import`）
- Test: `ai-digital-life/frontend/src/app/components/RevealScrollbar.test.tsx`

**Interfaces:**
- Consumes: `RevealScrollbarController`（Task 1）
- Produces: `RevealScrollbar({ controller }: { controller: RevealScrollbarController })` — `scrollable=false` 时渲染 `null`，否则渲染 `.adl-reveal-scrollbar` 轨道与 `.adl-reveal-scrollbar__thumb` 滑块。

- [ ] **Step 1: 写失败测试**

创建 `ai-digital-life/frontend/src/app/components/RevealScrollbar.test.tsx`：

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RevealScrollbar } from './RevealScrollbar';
import type { RevealScrollbarController } from '../hooks/useRevealScrollbar';

function makeController(overrides: Partial<RevealScrollbarController>): RevealScrollbarController {
  return {
    scrollRef: { current: null },
    hoverProps: { onMouseEnter: () => {}, onMouseLeave: () => {} },
    visible: false,
    scrollable: false,
    thumbStyle: { height: '24px', transform: 'translateY(0px)' },
    thumbListeners: { onPointerDown: () => {} },
    ...overrides,
  };
}

describe('RevealScrollbar', () => {
  it('renders nothing when not scrollable', () => {
    const { container } = render(
      <RevealScrollbar controller={makeController({ scrollable: false })} />,
    );
    expect(container.querySelector('.adl-reveal-scrollbar')).toBeNull();
  });

  it('renders track and thumb with controller state when scrollable', () => {
    const { container } = render(
      <RevealScrollbar
        controller={makeController({ scrollable: true, visible: true })}
      />,
    );
    const track = container.querySelector('.adl-reveal-scrollbar') as HTMLElement;
    expect(track).not.toBeNull();
    expect(track.getAttribute('data-visible')).toBe('true');
    const thumb = track.querySelector('.adl-reveal-scrollbar__thumb') as HTMLElement;
    expect(thumb).toHaveStyle({ height: '24px' });
    expect(track.getAttribute('aria-hidden')).toBe('true');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --dir frontend run test -- components/RevealScrollbar.test.tsx`
Expected: FAIL（组件不存在）。

- [ ] **Step 3: 实现组件**

创建 `ai-digital-life/frontend/src/app/components/RevealScrollbar.tsx`：

```tsx
import type { RevealScrollbarController } from '../hooks/useRevealScrollbar';

export function RevealScrollbar({ controller }: { controller: RevealScrollbarController }) {
  if (!controller.scrollable) {
    return null;
  }
  const { visible, thumbStyle, thumbListeners } = controller;
  return (
    <div className="adl-reveal-scrollbar" data-visible={visible} aria-hidden="true">
      <div className="adl-reveal-scrollbar__thumb" style={thumbStyle} {...thumbListeners} />
    </div>
  );
}
```

- [ ] **Step 4: 添加 CSS**

创建 `ai-digital-life/frontend/src/styles/components/reveal-scrollbar.css`：

```css
.adl-reveal-scroll {
  position: relative;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
}

.adl-reveal-scroll::-webkit-scrollbar {
  display: none;
}

.adl-reveal-scrollbar {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 8px;
  z-index: 1;
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--duration-150) var(--ease-default);
}

.adl-reveal-scrollbar[data-visible='true'] {
  opacity: 1;
}

.adl-reveal-scrollbar__thumb {
  position: absolute;
  top: 0;
  left: 2px;
  width: 4px;
  border-radius: 999px;
  background: var(--text-muted);
  opacity: 0.75;
  cursor: pointer;
  touch-action: none;
}

.adl-reveal-scrollbar[data-visible='true'] .adl-reveal-scrollbar__thumb {
  pointer-events: auto;
}
```

在 `ai-digital-life/frontend/src/styles/components.css` 末尾追加一行：

```css
@import './components/reveal-scrollbar.css';
```

- [ ] **Step 5: 运行测试确认通过**

Run: `pnpm --dir frontend run test -- components/RevealScrollbar.test.tsx`
Expected: 2 个用例 PASS。

- [ ] **Step 6: 提交**

```bash
git add ai-digital-life/frontend/src/app/components/RevealScrollbar.tsx ai-digital-life/frontend/src/app/components/RevealScrollbar.test.tsx ai-digital-life/frontend/src/styles/components/reveal-scrollbar.css ai-digital-life/frontend/src/styles/components.css
git commit -m "feat(scrollbar): add RevealScrollbar overlay component and styles"
```

---

### Task 3: WelcomeState 接入

**Files:**
- Modify: `ai-digital-life/frontend/src/app/regions/center-pane/WelcomeState.tsx`
- Modify: `ai-digital-life/frontend/src/styles/regions/center.css`
- Test: `ai-digital-life/frontend/src/app/regions/center-pane/WelcomeState.test.tsx`

**Interfaces:**
- Consumes: `useRevealScrollbar`（Task 1）、`RevealScrollbar`（Task 2）
- Produces: 列表容器外层 `<div class="adl-welcome__recent-scroll adl-reveal-scroll">`，全量渲染（无 slice）。

- [ ] **Step 1: 写失败测试**

创建 `ai-digital-life/frontend/src/app/regions/center-pane/WelcomeState.test.tsx`：

```tsx
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';
import type { CopyDict } from '../../i18n';
import { TCopyProvider } from '../../i18n/TCopyContext';
import { WelcomeState } from './WelcomeState';

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

function TestProvider({ children }: { children: React.ReactNode }) {
  return (
    <TCopyProvider t={mockT} locale="en-US">
      {children}
    </TCopyProvider>
  );
}

function ws(id: string, path: string, name: string): RecentWorkspaceEntry {
  return {
    id,
    path,
    rootPath: path,
    name,
    lastOpenedAt: 0,
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    removedFromSidebar: false,
    available: true,
    hiddenFromRightPanels: false,
  };
}

function renderWelcome(count: number) {
  const workspaces = Array.from({ length: count }, (_, i) => ws(`w${i}`, `E:/ws-${i}`, `WS ${i}`));
  return render(
    <TestProvider>
      <WelcomeState
        hasWorkspace={false}
        recentWorkspaces={workspaces}
        onOpenWorkspace={vi.fn()}
        onPickWorkspaceDirectory={vi.fn()}
        onCreateSession={vi.fn()}
      />
    </TestProvider>,
  );
}

describe('WelcomeState recent workspaces', () => {
  it('renders all recent workspaces without truncation', () => {
    renderWelcome(9);
    for (let i = 0; i < 9; i += 1) {
      expect(screen.getByText(`WS ${i}`)).toBeInTheDocument();
    }
  });

  it('wraps the list in the reveal-scroll container', () => {
    const { container } = renderWelcome(9);
    expect(
      container.querySelector('.adl-welcome__recent-scroll.adl-reveal-scroll'),
    ).not.toBeNull();
  });

  it('does not render a scrollbar when there are few workspaces', () => {
    const { container } = renderWelcome(2);
    expect(container.querySelector('.adl-reveal-scrollbar')).toBeNull();
  });

  it('shows the overlay scrollbar on hover when scrollable', () => {
    const { container } = renderWelcome(9);
    const scroll = container.querySelector('.adl-reveal-scroll') as HTMLElement;
    Object.defineProperty(scroll, 'scrollHeight', { configurable: true, value: 400 });
    Object.defineProperty(scroll, 'clientHeight', { configurable: true, value: 100 });
    fireEvent.scroll(scroll);
    fireEvent.mouseEnter(scroll);
    const track = container.querySelector('.adl-reveal-scrollbar') as HTMLElement;
    expect(track).not.toBeNull();
    expect(track.getAttribute('data-visible')).toBe('true');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --dir frontend run test -- center-pane/WelcomeState.test.tsx`
Expected: FAIL（第一条「renders all...」通过但 `.slice(0,5)` 只渲染 5 条；「reveal-scroll container」等因类不存在失败）。

- [ ] **Step 3: 实现接入**

修改 `ai-digital-life/frontend/src/app/regions/center-pane/WelcomeState.tsx`：

在导入区追加：

```tsx
import { useRevealScrollbar } from '../../hooks/useRevealScrollbar';
import { RevealScrollbar } from '../../components/RevealScrollbar';
```

在 `WelcomeState` 组件体内（`const { t } = useTCopy();` 之后）追加：

```tsx
const scrollbar = useRevealScrollbar([recentWorkspaces.length]);
```

将列表块（当前 `{recentWorkspaces.length ? (\n  <ul className="adl-welcome__recent-list">\n    {recentWorkspaces.slice(0, 5).map(...)}\n  </ul>\n) : (\n  <p className="adl-welcome__empty">...</p>\n)}`）替换为：

```tsx
{recentWorkspaces.length ? (
  <div
    className="adl-welcome__recent-scroll adl-reveal-scroll"
    ref={scrollbar.scrollRef}
    {...scrollbar.hoverProps}
  >
    <ul className="adl-welcome__recent-list">
      {recentWorkspaces.map((workspace) => (
        <li key={workspace.path}>
          <button
            type="button"
            title={`${workspace.name}\n${workspace.path}`}
            onClick={() => onOpenWorkspace(workspace.path)}
          >
            <span className="adl-welcome__recent-icon" aria-hidden="true">
              <IconFolder size={14} decorative />
            </span>
            <span className="adl-welcome__recent-name">{workspace.name}</span>
            <span className="adl-welcome__path">{workspace.path}</span>
          </button>
        </li>
      ))}
    </ul>
    <RevealScrollbar controller={scrollbar} />
  </div>
) : (
  <p className="adl-welcome__empty">{t.workspaceRecentEmpty}</p>
)}
```

在 `ai-digital-life/frontend/src/styles/regions/center.css` 中 `.adl-welcome__recent-list` 规则之前追加：

```css
.adl-welcome__recent-scroll {
  max-height: 108px;
}
```

> `max-height` 目标为恰好 3 行（当前行高约 32px + 4px 间距），最终值在 Task 5 预览中按实际行高校准。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --dir frontend run test -- center-pane/WelcomeState.test.tsx`
Expected: 4 个用例 PASS。

- [ ] **Step 5: 提交**

```bash
git add ai-digital-life/frontend/src/app/regions/center-pane/WelcomeState.tsx ai-digital-life/frontend/src/styles/regions/center.css ai-digital-life/frontend/src/app/regions/center-pane/WelcomeState.test.tsx
git commit -m "feat(welcome): render all recent workspaces with reveal scrollbar"
```

---

### Task 4: StatusBar 接入

**Files:**
- Modify: `ai-digital-life/frontend/src/app/regions/StatusBar.tsx`
- Modify: `ai-digital-life/frontend/src/styles/regions/statusbar-menu.css`
- Test: `ai-digital-life/frontend/src/app/regions/StatusBar.test.tsx`

**Interfaces:**
- Consumes: `useRevealScrollbar`（Task 1）、`RevealScrollbar`（Task 2）
- Produces: `.adl-statusbar__menu-list` 容器获得 `adl-reveal-scroll` 类、ref、hover 事件与末尾 `RevealScrollbar`；移除原有 `max-height:180px; overflow-y:auto`。

- [ ] **Step 1: 写失败测试**

创建 `ai-digital-life/frontend/src/app/regions/StatusBar.test.tsx`：

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { RecentWorkspaceEntry } from '@ai-digital-life/kernel';
import type { CopyDict } from '../i18n';
import { TCopyProvider } from '../i18n/TCopyContext';
import { useAppStore } from '../stores/slicedStore';
import { StatusBar } from './StatusBar';

const mockT = new Proxy({} as Record<string, string>, {
  get: (_, key) => (typeof key === 'string' ? key : ''),
}) as unknown as CopyDict;

function TestProvider({ children }: { children: React.ReactNode }) {
  return (
    <TCopyProvider t={mockT} locale="en-US">
      {children}
    </TCopyProvider>
  );
}

function ws(id: string, path: string, name: string): RecentWorkspaceEntry {
  return {
    id,
    path,
    rootPath: path,
    name,
    lastOpenedAt: 0,
    isPinned: false,
    pinnedOrder: 0,
    unpinnedOrder: 0,
    removedFromSidebar: false,
    available: true,
    hiddenFromRightPanels: false,
  };
}

const baseProps = {
  appInfo: undefined,
  currentWorkspace: undefined,
  recentWorkspaces: [] as RecentWorkspaceEntry[],
  gitSnapshot: undefined,
  gitBranches: [],
  modelHealth: undefined,
  isStreaming: false,
  activeRun: undefined,
  workspaceContextMode: 'global' as const,
  onOpenWorkspace: vi.fn(),
  onClearWorkspaceContext: vi.fn(),
  onPickWorkspaceDirectory: vi.fn(),
  onRefreshGitBranches: vi.fn(),
  onSwitchGitBranch: vi.fn(),
  onCreateGitBranch: vi.fn(),
};

beforeEach(() => {
  useAppStore.setState({ providers: [] });
});

function renderStatusBar(count: number) {
  const props = {
    ...baseProps,
    recentWorkspaces: Array.from({ length: count }, (_, i) =>
      ws(`w${i}`, `E:/ws-${i}`, `WS ${i}`),
    ),
  };
  return render(
    <TestProvider>
      <StatusBar {...props} />
    </TestProvider>,
  );
}

function openWorkspaceMenu(container: HTMLElement) {
  const trigger = container.querySelector('.adl-statusbar__item') as HTMLElement;
  fireEvent.click(trigger);
}

describe('StatusBar recent workspaces', () => {
  it('renders all recent workspaces without truncation', () => {
    const { container } = renderStatusBar(9);
    openWorkspaceMenu(container);
    for (let i = 0; i < 9; i += 1) {
      expect(screen.getByText(`WS ${i}`)).toBeInTheDocument();
    }
  });

  it('does not render a scrollbar with few workspaces', () => {
    const { container } = renderStatusBar(2);
    openWorkspaceMenu(container);
    expect(container.querySelector('.adl-reveal-scrollbar')).toBeNull();
  });

  it('shows the overlay scrollbar on hover when scrollable', () => {
    const { container } = renderStatusBar(9);
    openWorkspaceMenu(container);
    const list = container.querySelector('.adl-statusbar__menu-list') as HTMLElement;
    Object.defineProperty(list, 'scrollHeight', { configurable: true, value: 400 });
    Object.defineProperty(list, 'clientHeight', { configurable: true, value: 100 });
    fireEvent.scroll(list);
    fireEvent.mouseEnter(list);
    const track = container.querySelector('.adl-reveal-scrollbar') as HTMLElement;
    expect(track).not.toBeNull();
    expect(track.getAttribute('data-visible')).toBe('true');
  });
});
```

> 若 `StatusBar` 或其子组件在渲染时依赖 store 其他切片（如 `recentWorkspaces`、`gitSnapshots`）导致测试报错，在 `beforeEach` 中补充对应默认值，例如 `useAppStore.setState({ recentWorkspaces: [], gitSnapshots: [] })`。

- [ ] **Step 2: 运行测试确认失败**

Run: `pnpm --dir frontend run test -- regions/StatusBar.test.tsx`
Expected: FAIL（第一条「renders all...」因 `.slice(0,6)` 只渲染 6 条失败；后两条因类/滚动条不存在失败）。

- [ ] **Step 3: 实现接入**

修改 `ai-digital-life/frontend/src/app/regions/StatusBar.tsx`：

在导入区追加：

```tsx
import { useRevealScrollbar } from '../hooks/useRevealScrollbar';
import { RevealScrollbar } from '../components/RevealScrollbar';
```

在 `StatusBar` 组件体内（`const { t } = useTCopy();` 之后）追加：

```tsx
const recentScrollbar = useRevealScrollbar([recentWorkspaces.length]);
```

将工作区菜单中最近工作区块（当前从 `<div className="adl-statusbar__menu-list">` 到对应 `</div>`）替换为：

```tsx
<div
  className="adl-statusbar__menu-list adl-reveal-scroll"
  ref={recentScrollbar.scrollRef}
  {...recentScrollbar.hoverProps}
>
  {recentWorkspaces.length === 0 ? (
    <span className="adl-statusbar__menu-empty">{t.workspaceRecentEmpty}</span>
  ) : (
    recentWorkspaces.map((workspace) => (
      <button
        key={workspace.id}
        type="button"
        title={`${workspace.name}\n${workspace.path}`}
        className={`adl-statusbar__menu-option${currentWorkspace?.id === workspace.id ? ' is-active' : ''}`}
        onClick={() => {
          onOpenWorkspace(workspace.path);
          setOpenMenu(undefined);
        }}
      >
        <span className="adl-statusbar__menu-option-main">{workspace.name}</span>
        <span className="adl-statusbar__menu-option-sub">{workspace.path}</span>
      </button>
    ))
  )}
  <RevealScrollbar controller={recentScrollbar} />
</div>
```

修改 `ai-digital-life/frontend/src/styles/regions/statusbar-menu.css`：

将 `.adl-statusbar__menu-list` 规则：

```css
.adl-statusbar__menu-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 180px;
  overflow-y: auto;
  overscroll-behavior: contain;
}
```

替换为：

```css
.adl-statusbar__menu-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.adl-statusbar__menu-list.adl-reveal-scroll {
  max-height: 132px;
}
```

> `max-height` 目标为恰好 3 行（当前行高约 41px + 4px 间距），最终值在 Task 5 预览中按实际行高校准。

- [ ] **Step 4: 运行测试确认通过**

Run: `pnpm --dir frontend run test -- regions/StatusBar.test.tsx`
Expected: 3 个用例 PASS。

- [ ] **Step 5: 提交**

```bash
git add ai-digital-life/frontend/src/app/regions/StatusBar.tsx ai-digital-life/frontend/src/styles/regions/statusbar-menu.css ai-digital-life/frontend/src/app/regions/StatusBar.test.tsx
git commit -m "feat(statusbar): render all recent workspaces with reveal scrollbar"
```

---

### Task 5: 全量验证与视觉校准

**Files:**
- Modify: 无需代码改动；根据预览结果校准 Task 3/4 中的 `max-height` 像素值。

- [ ] **Step 1: 运行全量质量门禁**

Run:
```bash
pnpm --dir frontend run lint
pnpm --dir frontend run typecheck
pnpm --dir frontend run test
```
Expected: lint 0 errors（允许既有 pre-existing warnings）、typecheck 通过、全部测试 PASS。

- [ ] **Step 2: 浏览器预览视觉验证**

Run: `pnpm --dir frontend run dev`
浏览器打开预览地址，验证：

1. 无工作区时欢迎区显示所有已添加工作区（多于 5 个不再截断）。
2. 欢迎区最近工作区最多显示 3 行，第 4 个起需要滚动；鼠标悬停出现右侧滚动条，移出即隐藏。
3. 状态栏打开工作区菜单，最近工作区同样最多 3 行、悬停显隐滚动条。
4. 拖动滚动条滑块能滚动列表；滚轮也能滚动。
5. 行样式与改造前一致（欢迎区图标+名称+路径；状态栏名称+路径）。
6. 若有偏差（第 4 项露出半行、或第 3 项被裁切），调整 Task 3 `center.css` 与 Task 4 `statusbar-menu.css` 中的 `max-height` 像素值并刷新验证。

- [ ] **Step 3: 确认后提交校准**

```bash
git add ai-digital-life/frontend/src/styles/regions/center.css ai-digital-life/frontend/src/styles/regions/statusbar-menu.css
git commit -m "style(recent): tune recent workspace list max-height"
```

> 若 Task 5 无需像素调整，跳过本步（无改动不提交空提交）。

---

## 自审结果

- **Spec 覆盖**：数据全量（Task 3/4 删 slice）；3 可见区域（Task 3/4 max-height）；悬停显隐滚动条 + 可拖拽（Task 1 hook + Task 2 组件）；两处都做（Task 3/4）；行样式保留（CSS 仅加 max-height/共享类，未改行样式）。全部覆盖。
- **占位符**：仅 `max-height` 像素值为"待预览校准"的明确数值目标（108px/132px 为初值，非 TBD），含校准步骤。
- **类型一致**：`RevealScrollbarController` 字段名在 Task 1 定义、Task 2/3/4 引用，前后一致（`scrollRef/hoverProps/visible/scrollable/thumbStyle/thumbListeners`）。
