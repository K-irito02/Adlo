# 统一 HintCard 系统实施计划

> **对于代理工作者：** 必须使用子技能：`superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 逐任务实施。步骤使用复选框（`- [ ]`）语法跟踪。

**目标：** 将 `HintCardTrigger` + `renderHintCard` 两套系统合并为统一的 `HintCard` 组件，修复箭头定位 Bug，支持 4 方向智能定位。

**架构：** 新建 `HintCard/` 组件目录，包含纯函数定位引擎、React 复合组件、Context Menu Hook。分 4 步迁移：创建新组件 → 迁移 React 场景 → 迁移 Context Menu 场景 → 清理旧代码。

**技术栈：** React 19 + TypeScript + CSS（无新依赖）

## 全局约束

- 最小窗口宽度 640px
- CSS 颜色必须使用 `var(--…)` 自定义属性
- i18n key 不硬编码
- Tauri 桌面 + 浏览器双端一致
- 每个任务完成后运行 `pnpm --dir frontend run lint` 和 `pnpm --dir frontend run test`

---

## 文件结构映射

| 文件 | 职责 | 操作 |
|------|------|------|
| `frontend/src/app/components/HintCard/hintCardPosition.ts` | 纯函数定位引擎 | 新建 |
| `frontend/src/app/components/HintCard/hintCardPosition.test.ts` | 定位引擎测试 | 新建 |
| `frontend/src/app/components/HintCard/HintCard.tsx` | 主组件（浮动卡片） | 新建 |
| `frontend/src/app/components/HintCard/HintCardTrigger.tsx` | 触发器包装组件 | 新建 |
| `frontend/src/app/components/HintCard/HintCard.test.tsx` | 组件测试 | 新建 |
| `frontend/src/app/components/HintCard/useHintCard.ts` | Context Menu Hook | 新建 |
| `frontend/src/app/components/HintCard/useHintCard.test.ts` | Hook 测试 | 新建 |
| `frontend/src/app/components/HintCard/hintCard.css` | 统一样式 | 新建 |
| `frontend/src/app/components/HintCard/index.ts` | Barrel 导出 | 新建 |
| `frontend/src/styles/components/hintCard.css` | CSS 引入入口 | 新建 |
| `frontend/src/features/browser/BookmarkToFolderDialog.tsx` | 迁移 | 修改 |
| `frontend/src/features/workspace-settings/WorkspaceSettings.tsx` | 迁移 | 修改 |
| `frontend/src/features/workspace-settings/SortableWorkspaceList.tsx` | 迁移 | 修改 |
| `frontend/src/features/git-visualization/GitVisualizationView.tsx` | 迁移 | 修改 |
| `frontend/src/components/ContextMenu.tsx` | 迁移 | 修改 |
| `frontend/src/features/browser-tree/BrowserTreeEntryMenu.tsx` | 迁移 | 修改 |
| `frontend/src/features/browser-tree/BrowserEntrySubEntries.tsx` | 迁移 | 修改 |
| `frontend/src/features/browser/BrowserMenuHintItem.tsx` | 迁移 | 修改 |
| `frontend/src/regions/right-panel/panels/communicate/MenuHintItem.tsx` | 迁移 | 修改 |
| `frontend/src/components/HintCardTrigger.tsx` | 删除 | 删除 |
| `frontend/src/utils/renderHintCard.ts` | 删除 | 删除 |
| `frontend/src/utils/renderHintCard.test.ts` | 删除 | 删除 |
| `frontend/src/styles/regions/rightpanel/file-operations.css` | 清理样式 | 修改 |
| `frontend/src/styles/regions/rightpanel/browser-toolbar.css` | 清理样式 | 修改 |
| `frontend/src/styles/components/settings.css` | 清理注释 | 修改 |

---

## 任务 1：定位引擎 `hintCardPosition.ts`

**文件：**
- 创建：`frontend/src/app/components/HintCard/hintCardPosition.ts`
- 创建：`frontend/src/app/components/HintCard/hintCardPosition.test.ts`

**接口：**
- 消费：无（纯函数，无外部依赖）
- 产出：`computePosition(options: HintCardPositionOptions): HintCardPositionResult`

### 步骤 1.1：创建定位引擎源文件

- [ ] 创建 `frontend/src/app/components/HintCard/` 目录

- [ ] 创建 `hintCardPosition.ts`：

```typescript
export type Placement = 'auto' | 'top' | 'right' | 'bottom' | 'left';

export interface HintCardPositionOptions {
  triggerRect: DOMRect;
  cardWidth: number;
  cardHeight: number;
  placement?: Placement;
  viewportMargin?: number;
  gap?: number;
}

export interface HintCardPositionResult {
  card: { left: number; top: number };
  arrow: { left: number; top: number };
  arrowBorder: { left: number; top: number };
  placement: Placement;
}

const GAP = 5;
const VIEWPORT_MARGIN = 4;
const ARROW_FILL_HALF = 4;
const ARROW_BORDER_HALF = 5;
const ARROW_FILL_H = 5;
const ARROW_OVERLAP = 1;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

function anchorXInCard(cx: number, cardLeft: number, cardW: number): number {
  if (cardW <= 0) return cx;
  const lo = cardLeft + ARROW_BORDER_HALF;
  const hi = cardLeft + cardW - ARROW_BORDER_HALF;
  if (hi <= lo) return cx;
  return clamp(cx, lo, hi);
}

function calcForPlacement(
  triggerRect: DOMRect,
  cardW: number,
  cardH: number,
  placement: Placement,
  vw: number,
  vh: number,
  margin: number,
  gap: number,
): HintCardPositionResult | null {
  const cx = triggerRect.left + triggerRect.width / 2;
  const cy = triggerRect.top + triggerRect.height / 2;

  let cardLeft: number;
  let cardTop: number;

  switch (placement) {
    case 'top':
      cardLeft = clamp(cx - cardW / 2, margin, vw - cardW - margin);
      cardTop = triggerRect.top - cardH - gap;
      break;
    case 'bottom':
      cardLeft = clamp(cx - cardW / 2, margin, vw - cardW - margin);
      cardTop = triggerRect.bottom + gap;
      break;
    case 'left':
      cardLeft = triggerRect.left - cardW - gap;
      cardTop = clamp(cy - cardH / 2, margin, vh - cardH - margin);
      break;
    case 'right':
      cardLeft = triggerRect.right + gap;
      cardTop = clamp(cy - cardH / 2, margin, vh - cardH - margin);
      break;
    default:
      return null;
  }

  // 检查是否在视口内
  if (cardLeft < margin || cardLeft + cardW > vw - margin) return null;
  if (cardTop < margin || cardTop + cardH > vh - margin) return null;

  return buildResult(triggerRect, cardLeft, cardTop, cardW, cardH, placement);
}

function buildResult(
  triggerRect: DOMRect,
  cardLeft: number,
  cardTop: number,
  cardW: number,
  cardH: number,
  placement: Placement,
): HintCardPositionResult {
  const cx = triggerRect.left + triggerRect.width / 2;
  const cy = triggerRect.top + triggerRect.height / 2;

  let anchorX: number;
  let anchorY: number;

  if (placement === 'top' || placement === 'bottom') {
    anchorX = anchorXInCard(cx, cardLeft, cardW);
    anchorY = placement === 'top' ? cardTop + cardH : cardTop;
  } else {
    anchorX = placement === 'left' ? cardLeft + cardW : cardLeft;
    anchorY = anchorXInCard(cy, cardTop, cardH);
  }

  let arrow: { left: number; top: number };
  let arrowBorder: { left: number; top: number };

  if (placement === 'top') {
    arrow = { left: anchorX - ARROW_FILL_HALF, top: cardTop + cardH - ARROW_OVERLAP };
    arrowBorder = { left: anchorX - ARROW_BORDER_HALF, top: cardTop + cardH - ARROW_OVERLAP - 1 };
  } else if (placement === 'bottom') {
    arrow = { left: anchorX - ARROW_FILL_HALF, top: cardTop + ARROW_OVERLAP - ARROW_FILL_H };
    arrowBorder = { left: anchorX - ARROW_BORDER_HALF, top: cardTop + ARROW_OVERLAP - ARROW_BORDER_HALF };
  } else if (placement === 'left') {
    arrow = { left: cardLeft + cardW - ARROW_OVERLAP, top: anchorY - ARROW_FILL_HALF };
    arrowBorder = { left: cardLeft + cardW - ARROW_OVERLAP - 1, top: anchorY - ARROW_BORDER_HALF };
  } else {
    arrow = { left: cardLeft + ARROW_OVERLAP - ARROW_FILL_H, top: anchorY - ARROW_FILL_HALF };
    arrowBorder = { left: cardLeft + ARROW_OVERLAP - ARROW_BORDER_HALF, top: anchorY - ARROW_BORDER_HALF };
  }

  return { card: { left: cardLeft, top: cardTop }, arrow, arrowBorder, placement };
}

const FLIP_MAP: Record<string, Placement> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

const AUTO_PRIORITY: Placement[] = ['top', 'right', 'bottom', 'left'];

export function computePosition(options: HintCardPositionOptions): HintCardPositionResult {
  const {
    triggerRect,
    cardWidth,
    cardHeight,
    placement = 'auto',
    viewportMargin = VIEWPORT_MARGIN,
    gap = GAP,
  } = options;

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (placement !== 'auto') {
    const result = calcForPlacement(triggerRect, cardWidth, cardHeight, placement, vw, vh, viewportMargin, gap);
    if (result) return result;

    // 翻转到对侧
    const flipped = FLIP_MAP[placement];
    if (flipped) {
      const flippedResult = calcForPlacement(triggerRect, cardWidth, cardHeight, flipped, vw, vh, viewportMargin, gap);
      if (flippedResult) return flippedResult;
    }

    // 都放不下，clamp 到视口
    const cx = triggerRect.left + triggerRect.width / 2;
    const cy = triggerRect.top + triggerRect.height / 2;
    const cardLeft = clamp(cx - cardW / 2, viewportMargin, vw - cardWidth - viewportMargin);
    const cardTop = clamp(
      placement === 'top' ? triggerRect.top - cardHeight - gap : triggerRect.bottom + gap,
      viewportMargin,
      vh - cardHeight - viewportMargin,
    );
    return buildResult(triggerRect, cardLeft, cardTop, cardWidth, cardHeight, placement);
  }

  // auto：按优先级尝试
  for (const p of AUTO_PRIORITY) {
    const result = calcForPlacement(triggerRect, cardWidth, cardHeight, p, vw, vh, viewportMargin, gap);
    if (result) return result;
  }

  // 所有方向都放不下，使用 top 并 clamp
  const cx = triggerRect.left + triggerRect.width / 2;
  const cardLeft = clamp(cx - cardWidth / 2, viewportMargin, vw - cardWidth - viewportMargin);
  const cardTop = clamp(triggerRect.top - cardHeight - gap, viewportMargin, vh - cardHeight - viewportMargin);
  return buildResult(triggerRect, cardLeft, cardTop, cardWidth, cardHeight, 'top');
}
```

### 步骤 1.2：创建定位引擎测试

- [ ] 创建 `hintCardPosition.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computePosition } from './hintCardPosition';
import type { Placement } from './hintCardPosition';

function makeRect(left: number, top: number, w: number = 16, h: number = 16): DOMRect {
  return { left, top, right: left + w, bottom: top + h, width: w, height: h, x: left, y: top, toJSON() {} };
}

describe('computePosition', () => {
  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1200);
    vi.stubGlobal('innerHeight', 800);
  });

  it('top: card above trigger, arrow points down', () => {
    const trigger = makeRect(500, 400);
    const result = computePosition({ triggerRect: trigger, cardWidth: 200, cardHeight: 100, placement: 'top' });
    expect(result.placement).toBe('top');
    expect(result.card.top).toBe(400 - 100 - 5); // trigger.top - cardH - gap
    expect(result.arrow.top).toBeGreaterThan(result.card.top);
  });

  it('bottom: card below trigger, arrow points up', () => {
    const trigger = makeRect(500, 100);
    const result = computePosition({ triggerRect: trigger, cardWidth: 200, cardHeight: 100, placement: 'bottom' });
    expect(result.placement).toBe('bottom');
    expect(result.card.top).toBe(100 + 16 + 5); // trigger.bottom + gap
  });

  it('left: card to the left, arrow points right', () => {
    const trigger = makeRect(500, 300);
    const result = computePosition({ triggerRect: trigger, cardWidth: 200, cardHeight: 100, placement: 'left' });
    expect(result.placement).toBe('left');
    expect(result.card.left).toBe(500 - 200 - 5);
  });

  it('right: card to the right, arrow points left', () => {
    const trigger = makeRect(500, 300);
    const result = computePosition({ triggerRect: trigger, cardWidth: 200, cardHeight: 100, placement: 'right' });
    expect(result.placement).toBe('right');
    expect(result.card.left).toBe(500 + 16 + 5);
  });

  it('auto: prefers top when space available', () => {
    const trigger = makeRect(500, 400);
    const result = computePosition({ triggerRect: trigger, cardWidth: 200, cardHeight: 100 });
    expect(result.placement).toBe('top');
  });

  it('auto: flips to bottom when no space on top', () => {
    const trigger = makeRect(500, 10); // near top edge
    const result = computePosition({ triggerRect: trigger, cardWidth: 200, cardHeight: 100 });
    expect(result.placement).toBe('bottom');
  });

  it('auto: flips to right when no space on top or bottom', () => {
    const trigger = makeRect(500, 5); // very near top
    const result = computePosition({ triggerRect: trigger, cardWidth: 600, cardHeight: 200 });
    expect(['right', 'left']).toContain(result.placement);
  });

  it('horizontal clamp: arrow stays within card bounds', () => {
    const trigger = makeRect(1100, 300); // near right edge
    const result = computePosition({ triggerRect: trigger, cardWidth: 480, cardHeight: 100, placement: 'top' });
    const arrowLeft = result.arrow.left;
    const cardLeft = result.card.left;
    expect(arrowLeft).toBeGreaterThanOrEqual(cardLeft + 5);
    expect(arrowLeft).toBeLessThanOrEqual(cardLeft + 480 - 5);
  });

  it('left placement flips to right when no space', () => {
    const trigger = makeRect(5, 300); // near left edge
    const result = computePosition({ triggerRect: trigger, cardWidth: 200, cardHeight: 100, placement: 'left' });
    expect(result.placement).toBe('right');
  });
});
```

### 步骤 1.3：运行测试验证通过

- [ ] 运行：`cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend && npx vitest run src/app/components/HintCard/hintCardPosition.test.ts`
- 预期：所有测试通过

### 步骤 1.4：提交

- [ ] 提交：`git add src/app/components/HintCard/hintCardPosition.ts src/app/components/HintCard/hintCardPosition.test.ts && git commit -m "feat(hintcard): add positioning engine with 4-direction viewport-aware layout"`

---

## 任务 2：HintCard 主组件

**文件：**
- 创建：`frontend/src/app/components/HintCard/HintCard.tsx`
- 创建：`frontend/src/app/components/HintCard/HintCard.test.tsx`

**接口：**
- 消费：`computePosition` from `hintCardPosition.ts`
- 产出：`HintCard` 组件（export）

### 步骤 2.1：创建 HintCard 组件

- [ ] 创建 `HintCard.tsx`：

```typescript
import { useRef, useState, useCallback, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { computePosition, type Placement, type HintCardPositionResult } from './hintCardPosition';
import './hintCard.css';

export interface HintCardProps {
  visible: boolean;
  triggerRect: DOMRect | null;
  placement?: Placement;
  forcePlacement?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  children: React.ReactNode;
}

function parseContent(content: React.ReactNode): React.ReactNode {
  if (typeof content !== 'string') return content;

  const lines = content.split('\n');
  return lines.map((line, idx) => {
    if (line.startsWith('· ')) {
      return (
        <div key={idx} className="hint-card__bullet-line">
          <span className="hint-card__bullet">·</span>
          <span className="hint-card__bullet-text">{line.slice(2)}</span>
        </div>
      );
    }
    if (line === '') {
      return idx !== lines.length - 1 ? <br key={idx} /> : null;
    }
    return (
      <div key={idx} className="hint-card__line">
        {line}
      </div>
    );
  });
}

export function HintCard({
  visible,
  triggerRect,
  placement = 'auto',
  forcePlacement = false,
  onMouseEnter,
  onMouseLeave,
  children,
}: HintCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<HintCardPositionResult | null>(null);

  const recompute = useCallback(() => {
    if (!triggerRect || !cardRef.current) return;
    const cardRect = cardRef.current.getBoundingClientRect();
    const effectivePlacement = forcePlacement ? (placement === 'auto' ? 'right' : placement) : placement;
    const result = computePosition({
      triggerRect,
      cardWidth: cardRect.width,
      cardHeight: cardRect.height,
      placement: effectivePlacement,
    });
    setPos(result);
  }, [triggerRect, placement, forcePlacement]);

  useLayoutEffect(() => {
    if (visible && triggerRect) {
      recompute();
    } else {
      setPos(null);
    }
  }, [visible, triggerRect, recompute]);

  useEffect(() => {
    if (!visible) return;
    const onResize = () => recompute();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [visible, recompute]);

  const content = useMemo(() => parseContent(children), [children]);

  if (!visible || !pos) return null;

  return createPortal(
    <>
      <div
        ref={cardRef}
        className="hint-card"
        data-placement={pos.placement}
        data-state="open"
        style={{ left: pos.card.left, top: pos.card.top }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {content}
      </div>
      <div
        className="hint-card__arrow"
        data-placement={pos.placement}
        style={{ left: pos.arrow.left, top: pos.arrow.top }}
      />
      <div
        className="hint-card__arrow-border"
        data-placement={pos.placement}
        style={{ left: pos.arrowBorder.left, top: pos.arrowBorder.top }}
      />
    </>,
    document.body,
  );
}
```

### 步骤 2.2：创建 HintCard 测试

- [ ] 创建 `HintCard.test.tsx`：

```tsx
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HintCard } from './HintCard';

function makeRect(left: number, top: number): DOMRect {
  return { left, top, right: left + 16, bottom: top + 16, width: 16, height: 16, x: left, y: top, toJSON() {} };
}

describe('HintCard', () => {
  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1200);
    vi.stubGlobal('innerHeight', 800);
  });

  it('renders nothing when not visible', () => {
    const { container } = render(
      <HintCard visible={false} triggerRect={makeRect(100, 100)}>
        hint text
      </HintCard>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders card with string content', async () => {
    await act(async () => {
      render(
        <HintCard visible triggerRect={makeRect(100, 100)}>
          hello world
        </HintCard>,
      );
    });
    expect(screen.getByText('hello world')).toBeTruthy();
  });

  it('parses bullet lines from string', async () => {
    await act(async () => {
      render(
        <HintCard visible triggerRect={makeRect(100, 100)}>
          {'· item one\n· item two'}
        </HintCard>,
      );
    });
    expect(screen.getByText('item one')).toBeTruthy();
    expect(screen.getByText('item two')).toBeTruthy();
  });

  it('renders ReactNode content directly', async () => {
    await act(async () => {
      render(
        <HintCard visible triggerRect={makeRect(100, 100)}>
          <div data-testid="custom">custom content</div>
        </HintCard>,
      );
    });
    expect(screen.getByTestId('custom')).toBeTruthy();
  });
});
```

### 步骤 2.3：运行测试验证通过

- [ ] 运行：`cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend && npx vitest run src/app/components/HintCard/HintCard.test.tsx`
- 预期：所有测试通过

### 步骤 2.4：提交

- [ ] 提交：`git add src/app/components/HintCard/HintCard.tsx src/app/components/HintCard/HintCard.test.tsx && git commit -m "feat(hintcard): add HintCard component with string auto-parsing"`

---

## 任务 3：HintCardTrigger 触发器组件

**文件：**
- 创建：`frontend/src/app/components/HintCard/HintCardTrigger.tsx`
- 创建：`frontend/src/app/components/HintCard/HintCardTrigger.test.tsx`

**接口：**
- 消费：`HintCard` from `HintCard.tsx`
- 产出：`HintCardTrigger` 组件（export）、`HINT_CLOSE_DELAY_MS` 常量（export）

### 步骤 3.1：创建 HintCardTrigger 组件

- [ ] 创建 `HintCardTrigger.tsx`：

```typescript
import { useRef, useState, useCallback, useEffect } from 'react';
import { HintCard } from './HintCard';
import type { Placement } from './hintCardPosition';

export const HINT_CLOSE_DELAY_MS = 80;

export interface HintCardTriggerProps {
  content: React.ReactNode;
  placement?: Placement;
  longHoverMs?: number;
  children: React.ReactNode;
}

export function HintCardTrigger({
  content,
  placement = 'auto',
  longHoverMs = 300,
  children,
}: HintCardTriggerProps) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const triggerRectRef = useRef<DOMRect | null>(null);
  const [visible, setVisible] = useState(false);
  const hoverTimerRef = useRef<number | undefined>(undefined);
  const closeTimerRef = useRef<number | undefined>(undefined);

  const cancelHoverTimer = useCallback(() => {
    if (hoverTimerRef.current !== undefined) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = undefined;
    }
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== undefined) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
  }, []);

  const hide = useCallback(() => {
    setVisible(false);
    triggerRectRef.current = null;
  }, []);

  const show = useCallback(() => {
    const el = triggerRef.current;
    const rect = (el?.querySelector('button') ?? el)?.getBoundingClientRect();
    if (!rect) return;
    triggerRectRef.current = rect;
    setVisible(true);
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(hide, HINT_CLOSE_DELAY_MS);
  }, [cancelClose, hide]);

  const handleMouseEnter = useCallback(() => {
    cancelClose();
    if (!visible) {
      cancelHoverTimer();
      hoverTimerRef.current = window.setTimeout(show, longHoverMs);
    }
  }, [cancelClose, visible, cancelHoverTimer, show, longHoverMs]);

  const handleMouseLeave = useCallback(() => {
    cancelHoverTimer();
    if (visible) scheduleClose();
  }, [cancelHoverTimer, visible, scheduleClose]);

  const handleClick = useCallback(() => {
    cancelHoverTimer();
    cancelClose();
    setVisible((v) => !v);
  }, [cancelHoverTimer, cancelClose]);

  useEffect(() => {
    return () => {
      cancelHoverTimer();
      cancelClose();
    };
  }, [cancelHoverTimer, cancelClose]);

  const handleCardMouseEnter = useCallback(() => {
    cancelClose();
  }, [cancelClose]);

  const handleCardMouseLeave = useCallback(() => {
    scheduleClose();
  }, [scheduleClose]);

  return (
    <span
      ref={triggerRef}
      style={{ display: 'inline-flex' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      {children}
      <HintCard
        visible={visible}
        triggerRect={triggerRectRef.current}
        placement={placement}
        onMouseEnter={handleCardMouseEnter}
        onMouseLeave={handleCardMouseLeave}
      >
        {content}
      </HintCard>
    </span>
  );
}
```

### 步骤 3.2：创建 HintCardTrigger 测试

- [ ] 创建 `HintCardTrigger.test.tsx`：

```tsx
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HintCardTrigger } from './HintCardTrigger';

describe('HintCardTrigger', () => {
  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1200);
    vi.stubGlobal('innerHeight', 800);
  });

  it('renders children', () => {
    render(
      <HintCardTrigger content="hint">
        <button>!</button>
      </HintCardTrigger>,
    );
    expect(screen.getByText('!')).toBeTruthy();
  });

  it('shows card on click', async () => {
    render(
      <HintCardTrigger content="hint text">
        <button>!</button>
      </HintCardTrigger>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('!'));
    });
    expect(screen.getByText('hint text')).toBeTruthy();
  });

  it('hides card on second click', async () => {
    render(
      <HintCardTrigger content="hint text">
        <button>!</button>
      </HintCardTrigger>,
    );
    await act(async () => {
      fireEvent.click(screen.getByText('!'));
    });
    await act(async () => {
      fireEvent.click(screen.getByText('!'));
    });
    expect(screen.queryByText('hint text')).toBeNull();
  });
});
```

### 步骤 3.3：运行测试验证通过

- [ ] 运行：`cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend && npx vitest run src/app/components/HintCard/HintCardTrigger.test.tsx`
- 预期：所有测试通过

### 步骤 3.4：提交

- [ ] 提交：`git add src/app/components/HintCard/HintCardTrigger.tsx src/app/components/HintCard/HintCardTrigger.test.tsx && git commit -m "feat(hintcard): add HintCardTrigger with long-hover and click toggle"`

---

## 任务 4：useHintCard Hook

**文件：**
- 创建：`frontend/src/app/components/HintCard/useHintCard.ts`
- 创建：`frontend/src/app/components/HintCard/useHintCard.test.ts`

**接口：**
- 消费：`HINT_CLOSE_DELAY_MS` from `HintCardTrigger.tsx`
- 产出：`useHintCard` hook（export）

### 步骤 4.1：创建 useHintCard Hook

- [ ] 创建 `useHintCard.ts`：

```typescript
import { useRef, useState, useCallback } from 'react';
import { HINT_CLOSE_DELAY_MS } from './HintCardTrigger';

export interface HintState {
  content: string;
  triggerRect: DOMRect;
}

export function useHintCard(closeDelayMs: number = HINT_CLOSE_DELAY_MS) {
  const [hintState, setHintState] = useState<HintState | null>(null);
  const closeTimerRef = useRef<number | undefined>(undefined);

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== undefined) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = undefined;
    }
  }, []);

  const hideHint = useCallback(() => {
    cancelClose();
    setHintState(null);
  }, [cancelClose]);

  const showHint = useCallback(
    (content: string, triggerRect: DOMRect) => {
      cancelClose();
      setHintState({ content, triggerRect });
    },
    [cancelClose],
  );

  const scheduleHide = useCallback(() => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      setHintState(null);
      closeTimerRef.current = undefined;
    }, closeDelayMs);
  }, [cancelClose, closeDelayMs]);

  const handleCardMouseEnter = useCallback(() => {
    cancelClose();
  }, [cancelClose]);

  const handleCardMouseLeave = useCallback(() => {
    scheduleHide();
  }, [scheduleHide]);

  return {
    hintState,
    showHint,
    hideHint,
    scheduleHide,
    hintCardProps: {
      visible: hintState !== null,
      triggerRect: hintState?.triggerRect ?? null,
      onMouseEnter: handleCardMouseEnter,
      onMouseLeave: handleCardMouseLeave,
    },
  };
}
```

### 步骤 4.2：创建 useHintCard 测试

- [ ] 创建 `useHintCard.test.ts`：

```typescript
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useHintCard } from './useHintCard';

function makeRect(left: number, top: number): DOMRect {
  return { left, top, right: left + 16, bottom: top + 16, width: 16, height: 16, x: left, y: top, toJSON() {} };
}

describe('useHintCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('initial state is null', () => {
    const { result } = renderHook(() => useHintCard());
    expect(result.current.hintState).toBeNull();
  });

  it('showHint sets state', () => {
    const { result } = renderHook(() => useHintCard());
    act(() => {
      result.current.showHint('test hint', makeRect(100, 100));
    });
    expect(result.current.hintState).toEqual({ content: 'test hint', triggerRect: makeRect(100, 100) });
  });

  it('hideHint clears state', () => {
    const { result } = renderHook(() => useHintCard());
    act(() => {
      result.current.showHint('test hint', makeRect(100, 100));
    });
    act(() => {
      result.current.hideHint();
    });
    expect(result.current.hintState).toBeNull();
  });

  it('scheduleHide clears state after delay', () => {
    const { result } = renderHook(() => useHintCard(100));
    act(() => {
      result.current.showHint('test hint', makeRect(100, 100));
    });
    act(() => {
      result.current.scheduleHide();
    });
    expect(result.current.hintState).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.hintState).toBeNull();
  });

  it('showHint cancels scheduled hide', () => {
    const { result } = renderHook(() => useHintCard(100));
    act(() => {
      result.current.showHint('hint1', makeRect(100, 100));
    });
    act(() => {
      result.current.scheduleHide();
    });
    act(() => {
      result.current.showHint('hint2', makeRect(200, 200));
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.hintState?.content).toBe('hint2');
  });
});
```

### 步骤 4.3：运行测试验证通过

- [ ] 运行：`cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend && npx vitest run src/app/components/HintCard/useHintCard.test.ts`
- 预期：所有测试通过

### 步骤 4.4：提交

- [ ] 提交：`git add src/app/components/HintCard/useHintCard.ts src/app/components/HintCard/useHintCard.test.ts && git commit -m "feat(hintcard): add useHintCard hook for context menu hint state"`

---

## 任务 5：CSS 样式 + Barrel 导出

**文件：**
- 创建：`frontend/src/styles/components/hintCard.css`
- 创建：`frontend/src/app/components/HintCard/index.ts`
- 修改：`frontend/src/styles/index.css`（添加引入）

**接口：**
- 消费：CSS 变量（`--bg-card`, `--border-default`, `--space-2`, `--space-3` 等）
- 产出：`.hint-card`、`.hint-card__arrow`、`.hint-card__arrow-border`、`.hint-card__bullet-line` 等 CSS 类

### 步骤 5.1：创建 hintCard.css

- [ ] 创建 `frontend/src/styles/components/hintCard.css`：

```css
/* HintCard — 统一信息提示卡片样式 */

.hint-card {
  position: fixed;
  z-index: 100000;
  max-width: min(480px, 90vw);
  width: max-content;
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  box-shadow: var(--shadow-md);
  font-size: var(--text-xs);
  line-height: 1.5;
  padding: var(--space-2) var(--space-3);
  word-break: break-word;
  overflow-wrap: break-word;
  line-break: loose;
  display: flex;
  flex-direction: column;
  gap: 2px;
  pointer-events: auto;
  user-select: text;
}

.hint-card[data-placement="top"]    { border-width: 0 1px 1px 1px; }
.hint-card[data-placement="bottom"] { border-width: 1px 1px 0 1px; }
.hint-card[data-placement="left"]   { border-width: 1px 0 1px 1px; }
.hint-card[data-placement="right"]  { border-width: 1px 1px 1px 0; }

.hint-card[data-state="open"] {
  transition: opacity var(--duration-150, 150ms) var(--ease-enter, ease-in);
  opacity: 1;
}
.hint-card[data-state="closed"] {
  transition: opacity var(--duration-100, 100ms) var(--ease-exit, ease-out);
  opacity: 0;
  pointer-events: none;
}

/* --- 箭头填充三角 --- */
.hint-card__arrow {
  position: fixed;
  z-index: 99999;
  pointer-events: none;
  width: 0;
  height: 0;
}
.hint-card__arrow[data-placement="top"] {
  border-top: 5px solid var(--bg-card);
  border-right: 4px solid transparent;
  border-left: 4px solid transparent;
}
.hint-card__arrow[data-placement="bottom"] {
  border-bottom: 5px solid var(--bg-card);
  border-right: 4px solid transparent;
  border-left: 4px solid transparent;
}
.hint-card__arrow[data-placement="left"] {
  border-left: 5px solid var(--bg-card);
  border-top: 4px solid transparent;
  border-bottom: 4px solid transparent;
}
.hint-card__arrow[data-placement="right"] {
  border-right: 5px solid var(--bg-card);
  border-top: 4px solid transparent;
  border-bottom: 4px solid transparent;
}

/* --- 箭头描边三角 --- */
.hint-card__arrow-border {
  position: fixed;
  z-index: 99998;
  pointer-events: none;
  width: 0;
  height: 0;
}
.hint-card__arrow-border[data-placement="top"] {
  border-top: 6px solid var(--border-default);
  border-right: 5px solid transparent;
  border-left: 5px solid transparent;
}
.hint-card__arrow-border[data-placement="bottom"] {
  border-bottom: 6px solid var(--border-default);
  border-right: 5px solid transparent;
  border-left: 5px solid transparent;
}
.hint-card__arrow-border[data-placement="left"] {
  border-left: 6px solid var(--border-default);
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
}
.hint-card__arrow-border[data-placement="right"] {
  border-right: 6px solid var(--border-default);
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
}

/* --- 列点样式 --- */
.hint-card__bullet-line {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
}
.hint-card__bullet {
  flex-shrink: 0;
  transform: translateY(-0.03em);
  line-height: 1;
}
.hint-card__bullet-text {
  flex: 1;
  min-width: 0;
}
.hint-card__line {
  white-space: pre-line;
}

/* --- Reduced motion --- */
@media (prefers-reduced-motion: reduce) {
  .hint-card { transition: none !important; }
}
```

### 步骤 5.2：创建 Barrel 导出

- [ ] 创建 `frontend/src/app/components/HintCard/index.ts`：

```typescript
export { HintCard } from './HintCard';
export type { HintCardProps } from './HintCard';
export { HintCardTrigger, HINT_CLOSE_DELAY_MS } from './HintCardTrigger';
export type { HintCardTriggerProps } from './HintCardTrigger';
export { useHintCard } from './useHintCard';
export { computePosition } from './hintCardPosition';
export type { Placement, HintCardPositionOptions, HintCardPositionResult } from './hintCardPosition';
```

### 步骤 5.3：在 CSS 入口引入

- [ ] 找到 `frontend/src/styles/index.css`，在文件末尾添加：

```css
@import './components/hintCard.css';
```

### 步骤 5.4：验证 CSS 加载

- [ ] 运行开发服务器验证无 CSS 编译错误

### 步骤 5.5：提交

- [ ] 提交：`git add src/styles/components/hintCard.css src/app/components/HintCard/index.ts src/styles/index.css && git commit -m "feat(hintcard): add unified hintCard CSS and barrel exports"`

---

## 任务 6：迁移 HintCardTrigger 的 4 处 React 场景

**文件：**
- 修改：`frontend/src/features/browser/BookmarkToFolderDialog.tsx`
- 修改：`frontend/src/features/workspace-settings/WorkspaceSettings.tsx`
- 修改：`frontend/src/features/workspace-settings/SortableWorkspaceList.tsx`
- 修改：`frontend/src/features/git-visualization/GitVisualizationView.tsx`

**接口：**
- 消费：`HintCardTrigger` from `components/HintCard`
- 产出：各文件改用新 `HintCardTrigger`

### 步骤 6.1：迁移 BookmarkToFolderDialog.tsx

- [ ] 打开 `BookmarkToFolderDialog.tsx`
- [ ] 将 `import { HintCardTrigger } from '../../components/HintCardTrigger'` 改为 `import { HintCardTrigger } from '../../components/HintCard'`
- [ ] 验证 `content` prop 传递方式不变（已是字符串）
- [ ] 运行测试：`npx vitest run src/features/browser/BookmarkToFolderDialog`

### 步骤 6.2：迁移 WorkspaceSettings.tsx

- [ ] 打开 `WorkspaceSettings.tsx`
- [ ] 将 `import { HintCardTrigger } from '../../components/HintCardTrigger'` 改为 `import { HintCardTrigger } from '../../components/HintCard'`
- [ ] 运行测试：`npx vitest run src/features/workspace-settings/WorkspaceSettings`

### 步骤 6.3：迁移 SortableWorkspaceList.tsx

- [ ] 打开 `SortableWorkspaceList.tsx`
- [ ] 将 `import { HintCardTrigger } from '../../components/HintCardTrigger'` 改为 `import { HintCardTrigger } from '../../components/HintCard'`
- [ ] 运行测试：`npx vitest run src/features/workspace-settings/SortableWorkspaceList`

### 步骤 6.4：迁移 GitVisualizationView.tsx

- [ ] 打开 `GitVisualizationView.tsx`
- [ ] 将 `import { HintCardTrigger } from '../../components/HintCardTrigger'` 改为 `import { HintCardTrigger } from '../../components/HintCard'`
- [ ] 确认 content 为 ReactNode（`<BranchGraphHelpCard />`）— 新组件支持
- [ ] 运行测试：`npx vitest run src/features/git-visualization/GitVisualizationView`

### 步骤 6.5：全量测试 + lint

- [ ] 运行：`cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend && pnpm run test`
- [ ] 运行：`cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend && pnpm run lint`

### 步骤 6.6：提交

- [ ] 提交：`git add src/features/ && git commit -m "refactor(hintcard): migrate 4 HintCardTrigger React scenarios to new component"`

---

## 任务 7：迁移 renderHintCard 的 5 处 Context Menu 场景

**文件：**
- 修改：`frontend/src/components/ContextMenu.tsx`
- 修改：`frontend/src/features/browser-tree/BrowserTreeEntryMenu.tsx`
- 修改：`frontend/src/features/browser-tree/BrowserEntrySubEntries.tsx`
- 修改：`frontend/src/features/browser/BrowserMenuHintItem.tsx`
- 修改：`frontend/src/regions/right-panel/panels/communicate/MenuHintItem.tsx`

**接口：**
- 消费：`useHintCard` + `HintCard` from `components/HintCard`
- 产出：各文件改用状态驱动方式

### 步骤 7.1：迁移 ContextMenu.tsx

- [ ] 打开 `ContextMenu.tsx`
- [ ] 移除 `import { renderHintCard } from '../utils/renderHintCard'`
- [ ] 添加 `import { useHintCard, HintCard } from '../components/HintCard'`
- [ ] 移除 `hintElementsRef` 和 `closeTimerRef`
- [ ] 移除 `hideHint`、`scheduleHideHint`、`showHint` 函数
- [ ] 添加 `const { hintState, showHint, scheduleHide, hintCardProps } = useHintCard()`
- [ ] 在 `onMouseEnter` 处理器中调用 `showHint(item.hint!, btnRect)`
- [ ] 在 `onMouseLeave` 处理器中调用 `scheduleHide()`
- [ ] 在 `useEffect` 清理中移除 `hintElementsRef.current.forEach((el) => el.remove())`
- [ ] 在 JSX 末尾添加 `<HintCard {...hintCardProps}>{hintState?.content}</HintCard>`
- [ ] 运行测试

### 步骤 7.2：迁移 BrowserTreeEntryMenu.tsx

- [ ] 打开 `BrowserTreeEntryMenu.tsx`
- [ ] 移除 `import { renderHintCard } from '../../utils/renderHintCard'`
- [ ] 添加 `import { useHintCard, HintCard } from '../../components/HintCard'`
- [ ] 移除 `hintElementsRef`、`closeTimerRef`、`hideHint`、`scheduleHideHint`
- [ ] 在 hook 内部添加 `const { hintState, showHint, scheduleHide, hintCardProps } = useHintCard()`
- [ ] 重构 `showHint` 和 `showTabHint` 使用新的 `showHint` 方法
- [ ] 在 `entryMenuSlot` 和 `tabContextMenuSlot` 的 JSX 末尾添加 `<HintCard {...hintCardProps}>{hintState?.content}</HintCard>`
- [ ] 返回值中确保 HintCard 被渲染
- [ ] 运行测试

### 步骤 7.3：迁移 BrowserEntrySubEntries.tsx

- [ ] 打开 `BrowserEntrySubEntries.tsx`
- [ ] 同样替换 `renderHintCard` 为 `useHintCard` + `HintCard`
- [ ] 运行测试

### 步骤 7.4：迁移 BrowserMenuHintItem.tsx

- [ ] 打开 `BrowserMenuHintItem.tsx`
- [ ] 同样替换 `renderHintCard` 为 `useHintCard` + `HintCard`
- [ ] 运行测试

### 步骤 7.5：迁移 MenuHintItem.tsx

- [ ] 打开 `MenuHintItem.tsx`
- [ ] 同样替换 `renderHintCard` 为 `useHintCard` + `HintCard`
- [ ] 运行测试

### 步骤 7.6：全量测试 + lint

- [ ] 运行：`cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend && pnpm run test`
- [ ] 运行：`cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend && pnpm run lint`

### 步骤 7.7：提交

- [ ] 提交：`git add src/components/ContextMenu.tsx src/features/browser-tree/ src/features/browser/BrowserMenuHintItem.tsx src/regions/ && git commit -m "refactor(hintcard): migrate 5 context menu scenarios to React state-driven HintCard"`

---

## 任务 8：删除旧代码 + 清理

**文件：**
- 删除：`frontend/src/components/HintCardTrigger.tsx`
- 删除：`frontend/src/utils/renderHintCard.ts`
- 删除：`frontend/src/utils/renderHintCard.test.ts`
- 修改：`frontend/src/styles/regions/rightpanel/file-operations.css`
- 修改：`frontend/src/styles/regions/rightpanel/browser-toolbar.css`
- 修改：`frontend/src/styles/components/settings.css`

### 步骤 8.1：删除旧文件

- [ ] 删除 `frontend/src/components/HintCardTrigger.tsx`
- [ ] 删除 `frontend/src/utils/renderHintCard.ts`
- [ ] 删除 `frontend/src/utils/renderHintCard.test.ts`

### 步骤 8.2：清理 CSS

- [ ] 打开 `file-operations.css`，删除 `.adl-sub-hint-card` 相关所有样式（约 250-365 行）
- [ ] 打开 `browser-toolbar.css`，删除 `.adl-sub-hint-card--left`、`.adl-sub-hint-card__arrow--left`、`.adl-sub-hint-card__arrow-border--left` 样式（约 193-223 行）
- [ ] 打开 `settings.css`，清理关于 `adl-sub-hint-card` 的注释

### 步骤 8.3：清理旧导入

- [ ] 全局搜索 `from './HintCardTrigger'` 和 `from '../HintCardTrigger'` 和 `from '../../components/HintCardTrigger'` 等，确保无残留导入
- [ ] 全局搜索 `from '../utils/renderHintCard'` 和 `from '../../utils/renderHintCard'` 等，确保无残留导入

### 步骤 8.4：全量测试 + lint + typecheck

- [ ] 运行：`cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend && pnpm run test`
- [ ] 运行：`cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend && pnpm run lint`
- [ ] 运行：`cd E:\AI-DIGITAL-LIFE\SourceWorkspace\ai-digital-life\frontend && npx tsc --noEmit`

### 步骤 8.5：提交

- [ ] 提交：`git add -A && git commit -m "refactor(hintcard): remove old HintCardTrigger and renderHintCard, clean up CSS"`
