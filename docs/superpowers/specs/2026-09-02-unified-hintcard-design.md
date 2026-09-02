# 统一 HintCard 系统设计文档

> 日期：2026-09-02
> 状态：待审阅
> 作者：AI Assistant + 用户协作设计

## 1. 问题背景

项目中存在三套独立的信息提示卡片系统，各自为政：

| 系统 | 文件 | 用途 | 方向支持 |
|------|------|------|----------|
| `HintCardTrigger` | `HintCardTrigger.tsx` | React 组件，"!" 图标悬停提示 | 仅上/下 |
| `renderHintCard` | `renderHintCard.ts` | 命令式 DOM API，context menu 提示 | 仅左/右 |
| `Tooltip` / `TooltipSimple` | `Tooltip.tsx` | 短文本悬停提示 | 上/下/左/右（保持独立） |

### 核心 Bug

`HintCardTrigger` 的箭头定位存在缺陷：当卡片因超出视口右侧被水平钳制左移时，箭头的 X 坐标仍停留在触发器中心，导致箭头与卡片边缘分离。

调试日志证据（`debug-logs.txt`）：

```
card.left=796 (被钳制) vs arrowCZ.x=1022.6 (未钳制的触发器中心)
```

根因：`computeLayout()` 中卡片被 `clampCardLeft` 钳制后，`anchorXInCard` 虽然将箭头 clamp 到卡片范围内，但卡片整体左移后箭头与卡片的相对位置关系不正确。

### 其他问题

1. `HintCardTrigger` 仅支持上/下方向，缺少左/右支持
2. `renderHintCard` 无视口感知，不做翻转
3. 列点换行问题：`HintCardTrigger` 中 content 为 ReactNode 时无法自动解析 `· ` 前缀为 flex 列点样式
4. 三套系统样式分散在多个 CSS 文件中，维护成本高

## 2. 设计目标

1. **统一**：用一套组件替代 `HintCardTrigger` + `renderHintCard`，保留 `Tooltip` 独立
2. **4 方向智能定位**：上 → 右 → 下 → 左，左侧仅在最后手段时使用
3. **视口感知**：自动翻转、水平钳制、窗口 resize 重新计算
4. **箭头融合**：z-index 分层 + 重叠技术，箭头与卡片无缝衔接
5. **列点统一**：`·`（U+00B7）+ 固定 `var(--space-3)` 间距，字符串自动解析
6. **纯 React**：移除命令式 `renderHintCard` API，全部迁移到状态驱动

## 3. 架构设计

### 3.1 目录结构

```
frontend/src/app/components/HintCard/
├── HintCard.tsx              # 主组件（浮动卡片本体）
├── HintCardTrigger.tsx       # 触发器包装组件
├── useHintCard.ts            # Context Menu 场景的便捷 Hook
├── hintCardPosition.ts       # 纯函数定位引擎
├── hintCard.css              # 统一样式
├── index.ts                  # Barrel 导出
└── __tests__/
    ├── HintCard.test.tsx
    ├── HintCardTrigger.test.tsx
    ├── useHintCard.test.ts
    ├── hintCardPosition.test.ts
    └── renderHintCard.test.ts  # 迁移后删除
```

### 3.2 定位引擎 `hintCardPosition.ts`

纯函数，无副作用。替代原 `computeLayout`。

#### 类型定义

```typescript
type Placement = 'auto' | 'top' | 'right' | 'bottom' | 'left';

interface HintCardPositionOptions {
  triggerRect: DOMRect;
  cardWidth: number;
  cardHeight: number;
  placement?: Placement;       // 默认 'auto'
  viewportMargin?: number;     // 默认 4px
  gap?: number;                // 默认 5px
}

interface HintCardPositionResult {
  card: { left: number; top: number };
  arrow: { left: number; top: number };
  arrowBorder: { left: number; top: number };
  placement: Placement;        // 最终实际方向
}
```

#### 方向决策算法

```
computePosition(options) -> HintCardPositionResult

1. 如果 placement !== 'auto':
   a. 计算该方向的卡片位置
   b. 检查是否在视口内
   c. 如果是，返回此方向
   d. 如果不是，翻转到对侧（top↔bottom, left↔right）
   e. 对侧也放不下，clamp 到视口内

2. 如果 placement === 'auto'，按优先级尝试：
   top → right → bottom → left
   对每个方向：
   a. 计算卡片位置（沿主轴偏移 gap）
   b. 检查卡片是否完全在视口内
   c. 如果是，返回此方向
   d. 如果不是，尝试下一个方向
   e. 所有方向都放不下，使用第一个方向并 clamp
```

#### 箭头锚定（修复核心 Bug）

```
箭头水平中心 = clamp(triggerCenterX, cardLeft + arrowBorderHalf, cardLeft + cardWidth - arrowBorderHalf)
```

关键：箭头始终跟随卡片位置，而不是固定在触发器中心。当卡片被钳制左移时，箭头也跟着左移。

#### 几何常量（与 CSS 同步）

```typescript
const GAP = 5;                 // 触发器与卡片间距
const VIEWPORT_MARGIN = 4;     // 视口边距
const ARROW_FILL_HALF = 4;     // 填充三角半宽
const ARROW_BORDER_HALF = 5;   // 描边三角半宽
const ARROW_FILL_H = 5;        // 填充三角高度
const ARROW_OVERLAP = 1;       // 箭头底边伸入卡片的重叠量
```

### 3.3 React 组件

#### HintCard 主组件

```typescript
interface HintCardProps {
  visible: boolean;
  triggerRect: DOMRect | null;  // 触发器的视口坐标
  placement?: Placement;        // 'auto' | 'top' | 'right' | 'bottom' | 'left'
  forcePlacement?: boolean;     // true = 严格使用指定方向，不自动翻转（默认 false）
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  children: React.ReactNode;
}
```

- `placement='auto'`（默认）：按优先级 top → right → bottom → left 自动选择
- `placement='right'`：优先右侧，放不下时自动翻转到左侧
- `placement='right' + forcePlacement=true`：严格右侧，放不下时 clamp 到视口内（不翻转）
- 通过 `createPortal` 渲染到 `document.body`
- 使用 `useLayoutEffect` 测量卡片尺寸后调用 `computePosition`
- 监听 `window resize` 事件重新计算
- `data-placement` 属性驱动 CSS 方向样式
- `data-state` 属性驱动开/关过渡动效

#### HintCardTrigger 触发器组件

```typescript
interface HintCardTriggerProps {
  content: React.ReactNode;       // 字符串自动解析列点，ReactNode 直接渲染
  placement?: Placement;          // 默认 'auto'
  longHoverMs?: number;           // 默认 300ms
  children: React.ReactNode;
}
```

- 内部使用 `<HintCard placement={placement}>` 渲染卡片
- 长按悬停（默认 300ms）→ 显示卡片
- 点击 → 切换卡片
- 卡片可悬停、可选择文本
- 鼠标离开触发器和卡片后自动关闭

#### useHintCard Hook

为 Context Menu 场景封装：

```typescript
function useHintCard(closeDelayMs?: number): {
  hintState: { content: string; triggerRect: DOMRect } | null;
  showHint: (content: string, triggerRect: DOMRect) => void;
  hideHint: () => void;
  scheduleHide: () => void;
  hintProps: {
    visible: boolean;
    triggerRect: DOMRect | null;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  };
}
```

内部管理 `HINT_CLOSE_DELAY_MS`（80ms）延迟关闭、鼠标进入卡片取消关闭。

### 3.4 字符串自动解析

当 `content` 为字符串时：

```
输入: "· 列点一\n· 列点二\n普通文本"

渲染:
  <div class="hint-card">
    <div class="hint-card__bullet-line">
      <span class="hint-card__bullet">·</span>
      <span class="hint-card__bullet-text">列点一</span>
    </div>
    <div class="hint-card__bullet-line">
      <span class="hint-card__bullet">·</span>
      <span class="hint-card__bullet-text">列点二</span>
    </div>
    <div class="hint-card__line">普通文本</div>
  </div>
```

规则：
- 以 `· `（U+00B7 + 空格）开头 → `bullet-line`（flex 布局）
- 空行 → `<br>` 分隔
- 其他行 → `hint-card__line`（`white-space: pre-line`）
- `content` 为 `ReactNode` 时直接渲染，不解析

## 4. 样式设计

### 4.1 卡片主体

```css
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
}
```

方向相关边框（箭头插入边不画边框）：

```css
.hint-card[data-placement="top"]    { border-width: 0 1px 1px 1px; }
.hint-card[data-placement="bottom"] { border-width: 1px 1px 0 1px; }
.hint-card[data-placement="left"]   { border-width: 1px 0 1px 1px; }
.hint-card[data-placement="right"]  { border-width: 1px 1px 1px 0; }
```

### 4.2 箭头（4 方向）

z-index 层级（从高到低）：
- `100000` 卡片背景
- `99999` 填充箭头（颜色 = `--bg-card`）
- `99998` 描边箭头（颜色 = `--border-default`，大 1px）

各方向使用 CSS border 三角形：

```css
/* 上（卡片在下，箭头从顶部指向上方触发器） */
.hint-card__arrow[data-placement="top"] {
  border-top: 5px solid var(--bg-card);
  border-right: 4px solid transparent;
  border-left: 4px solid transparent;
}

/* 下（卡片在上，箭头从底部指向下方触发器） */
.hint-card__arrow[data-placement="bottom"] {
  border-bottom: 5px solid var(--bg-card);
  border-right: 4px solid transparent;
  border-left: 4px solid transparent;
}

/* 左（卡片在右，箭头从左侧指向左方触发器） */
.hint-card__arrow[data-placement="left"] {
  border-left: 5px solid var(--bg-card);
  border-top: 4px solid transparent;
  border-bottom: 4px solid transparent;
}

/* 右（卡片在左，箭头从右侧指向右方触发器） */
.hint-card__arrow[data-placement="right"] {
  border-right: 5px solid var(--bg-card);
  border-top: 4px solid transparent;
  border-bottom: 4px solid transparent;
}
```

描边箭头类似，各方向 border-size 加 1px，颜色为 `var(--border-default)`。

### 4.3 列点样式

```css
.hint-card__bullet-line {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);    /* 统一间距 */
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
```

### 4.4 过渡动效

```css
.hint-card[data-state="open"] {
  transition: opacity var(--duration-150) var(--ease-enter);
  opacity: 1;
}
.hint-card[data-state="closed"] {
  transition: opacity var(--duration-100) var(--ease-exit);
  opacity: 0;
  pointer-events: none;
}
@media (prefers-reduced-motion: reduce) {
  .hint-card { transition: none !important; }
}
```

### 4.5 融合效果原理

```
视觉层次（从后到前）：
  描边箭头（1px 边缘可见）→ 填充箭头（盖住描边，仅露 1px）→ 卡片背景（盖住填充箭头底边）

结果：箭头仿佛从卡片边缘"生长"出来，无硬交界线
```

## 5. 迁移计划

### 5.1 迁移范围

| 现有系统 | 调用方 | 迁移方式 |
|----------|--------|----------|
| `HintCardTrigger` | `BookmarkToFolderDialog.tsx` | 替换为新 `HintCardTrigger` |
| `HintCardTrigger` | `WorkspaceSettings.tsx` | 替换为新 `HintCardTrigger` |
| `HintCardTrigger` | `SortableWorkspaceList.tsx` | 替换为新 `HintCardTrigger` |
| `HintCardTrigger` | `GitVisualizationView.tsx` | 替换为新 `HintCardTrigger` |
| `renderHintCard` | `ContextMenu.tsx` | `useHintCard` + `<HintCard>` |
| `renderHintCard` | `BrowserTreeEntryMenu.tsx` | `useHintCard` + `<HintCard>` |
| `renderHintCard` | `BrowserEntrySubEntries.tsx` | `useHintCard` + `<HintCard>` |
| `renderHintCard` | `BrowserMenuHintItem.tsx` | `useHintCard` + `<HintCard>` |
| `renderHintCard` | `MenuHintItem.tsx` | `useHintCard` + `<HintCard>` |

### 5.2 迁移步骤

**第一步：创建新组件（无破坏性）**
- 创建 `HintCard/` 目录及所有文件
- 实现定位引擎 + 测试
- 实现组件 + 测试
- 此阶段旧代码不受影响

**第二步：迁移 HintCardTrigger 的 4 处 React 场景**
- 逐个替换 `BookmarkToFolderDialog`、`WorkspaceSettings`、`SortableWorkspaceList`、`GitVisualizationView`
- 每替换一处运行测试验证

**第三步：迁移 renderHintCard 的 5 处 Context Menu 场景**
- 逐个重构 `ContextMenu`、`BrowserTreeEntryMenu`、`BrowserEntrySubEntries`、`BrowserMenuHintItem`、`MenuHintItem`
- 将命令式调用改为 `useHintCard` hook + `<HintCard>` 渲染
- 每替换一处运行测试验证

**第四步：清理旧代码**
- 删除 `HintCardTrigger.tsx`（旧组件）
- 删除 `renderHintCard.ts`（旧命令式 API）
- 删除 `renderHintCard.test.ts`
- 删除 `file-operations.css` 中 `.adl-sub-hint-card` 相关样式
- 删除 `browser-toolbar.css` 中 `.adl-sub-hint-card--left` 等样式
- 清理 `settings.css` 中相关注释
- 清理 `HINT_CLOSE_DELAY_MS` 的旧导入路径
- 全量测试 + lint + typecheck

### 5.3 Context Menu 迁移示例

迁移前（`ContextMenu.tsx` 命令式）：

```tsx
const showHint = (e: React.MouseEvent, hintText: string) => {
  const btnRect = buttonEl?.getBoundingClientRect();
  const menuRect = menuEl?.getBoundingClientRect();
  hintElementsRef.current = renderHintCard({
    content: hintText, buttonRect: btnRect, menuRect,
    onCardMouseEnter: () => { /* cancel close timer */ },
    onCardMouseLeave: scheduleHideHint,
  });
};
```

迁移后（状态驱动）：

```tsx
const { hintState, showHint, scheduleHide, hintProps } = useHintCard();

const handleShowHint = (e: React.MouseEvent, hintText: string) => {
  const btnRect = e.currentTarget.getBoundingClientRect();
  const menuRect = menuRef.current!.getBoundingClientRect();
  showHint(hintText, btnRect);
};

// 渲染
<HintCard
  visible={!!hintState}
  triggerRect={hintState?.triggerRect}
  placement="right"
  onMouseEnter={hintProps.onMouseEnter}
  onMouseLeave={hintProps.onMouseLeave}
>
  {hintState?.content}
</HintCard>
```

## 6. 测试策略

| 层级 | 内容 |
|------|------|
| 单测 | `hintCardPosition.ts`：4 方向定位、视口翻转、箭头 clamp、auto 优先级、边界条件 |
| 单测 | `HintCard` 组件：字符串解析、列点渲染、ReactNode 渲染、状态切换 |
| 单测 | `HintCardTrigger`：长按悬停、点击切换、自动关闭 |
| 单测 | `useHintCard` hook：timer 管理、show/hide/scheduleHide |
| 集成测试 | Context Menu 场景：hint 显示/隐藏、鼠标交互、多菜单项切换 |
| 视觉验证 | 用户手动测试：各位置箭头指向、视口边缘翻转、resize 后重新定位 |

## 7. 调试支持

在 `hintCardPosition.ts` 中保留调试日志：

```typescript
console.info(
  `[HintCard] position: placement=${original}→${result.placement}; ` +
  `trigger={left:${triggerRect.left.toFixed(1)},top:${triggerRect.top.toFixed(1)},` +
  `w:${triggerRect.width.toFixed(1)},h:${triggerRect.height.toFixed(1)}}; ` +
  `card={left:${result.card.left.toFixed(1)},top:${result.card.top.toFixed(1)}}; ` +
  `arrow={left:${result.arrow.left.toFixed(1)},top:${result.arrow.top.toFixed(1)}}`
);
```

待视觉确认无误后可选择移除。

## 8. 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| Context Menu 迁移后 z-index 冲突 | 菜单 z-index 100001，卡片 100000 |
| 迁移期间旧测试失败 | 分步迁移，每步运行全量测试 |
| `GitVisualizationView` content 为 ReactNode | 新组件支持 ReactNode，不强制字符串解析 |
| 窗口 resize 时性能 | `requestAnimationFrame` 节流 |

## 9. 不在范围内

- `Tooltip` / `TooltipSimple` 保持不变，不与此系统合并
- 不改变 i18n 字符串中的 `· ` 前缀格式（已统一）
- 不改变 `HINT_CLOSE_DELAY_MS`（80ms）的值
