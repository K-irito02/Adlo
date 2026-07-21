# Hint Card & DnD 修复记录

## 背景

本次修复涉及两个主要问题：
1. 项目中所有"!"图标的解释说明子卡片交互升级
2. 设置面板工作区列表拖拽到最后一个位置失败

## Hint Card 修复

### 问题
- 所有"!"图标使用 `TooltipSimple` 组件，不支持交互（点击、选择文字）
- 上下文菜单中的"!"使用手动 DOM 创建提示卡片，`pointer-events: none`
- 点击卡片时主菜单关闭（卡片不在菜单 DOM 内）

### 解决方案

1. **HintCardTrigger 组件**（`HintCardTrigger.tsx`）: 可复用的 React 组件
   - 长悬停（600ms）或点击触发提示卡片
   - 卡片通过 `createPortal` 渲染到 `document.body`
   - 使用 `useLayoutEffect` 进行视口边界检测（超出底部翻转到上方，`--down` 变体）
   - Hover bridge: 鼠标在触发器和卡片之间移动不关闭，离开 80ms 后关闭
   - `pointer-events: auto` + `user-select: text` 支持交互

2. **CSS 优先级**：`--up`/`--down` 变体使用双类名（如 `.adl-sub-hint-card__arrow.adl-sub-hint-card__arrow--up`）以覆盖 `file-operations.css` 中加载顺序靠后的基类。

3. **菜单关闭问题**：将提示卡片 append 到菜单元素内（而非 `document.body`），防止 `onMouseLeave` 触发 + `mousedown.stopPropagation()` 防止全局 mousedown 处理器关闭菜单。

### 关键文件
- `HintCardTrigger.tsx`（新组件）
- `ContextMenu.tsx`, `BrowserTreeEntryMenu.tsx`, `BrowserEntrySubEntries.tsx`, `BrowserMenuHintItem.tsx`, `MenuHintItem.tsx`（5 个 DOM 创建文件同步修改）
- `BookmarkToFolderDialog.tsx`（TooltipSimple → HintCardTrigger）
- `settings.css`（`--up`/`--down` CSS 变体）

---

## DnD 最后一个位置放置修复

### 问题
从列表 A 拖拽标签到列表 B 最后一位（所有标签下方）时失败。需要先悬停在 B 的标签上触发变动才能放置。

### 调试历程（6 轮迭代）

| 轮次 | 方案 | 结果 |
|------|------|------|
| 1 | `handleDragEnd` 中 `over = null` 时 fallback | 无效 — `over` 不为 null，指向源容器 |
| 2 | `findListContainerAtCursor` 基于 `data-droppable` | 有时效 — 标签下方无空区域时检测不到 |
| 3 | section-level fallback | 改善 — 但依然边界情况不稳 |
| 4 | `padding-bottom: 32px` 扩展 drop zone | 临时改善但视觉有变化 |
| 5 | 网格列重叠算法 | 最后采用 |

### 最终方案：网格列重叠算法

放弃依赖 `@dnd-kit` 的 `over` 值和 DOM rect 检测，改为：

1. 查询 `.workspace-grid` 获取网格边界
2. 计算三列分界（`gap: 12px` 补偿）
3. 计算被拖拽标签的 bounding box（`cursor - grabOffset + sourceRect`）
4. 计算标签与每列的水平重叠面积
5. 返回重叠最多的列

垂直感应范围：从 grid 顶部到 `window.innerHeight`（应用窗口下边缘），确保所有空区域都在感应范围内。

### 关键文件
- `useWorkspaceDnd.ts` — `findListContainerAtCursor()` 函数 + `handleDragEnd` 修改

### 经验教训
- `@dnd-kit` 的 `onDragOver` 在 `SortableContext` 中优先使用 sortable item 碰撞，容器 droppable 在空区域可能不可靠
- React `setState` 是异步批处理的，但在同一函数中同步读取 state 变量仍可获取旧值（闭包捕获）
- CSS Grid 列重叠计算比 DOM rect 包含检测更可靠，不依赖于具体元素高度

---

## 其他修复

- CSS 容器查询 `@container workspace-lists` 全部移除，改为卷帘裁剪（`overflow: hidden`）
- `HINT_CLOSE_DELAY_MS = 80` 提取为共享常量
- `IconAlertTriangle` → `IconAlertCircle`（圆形 "!" 图标）
- 描述文本移入 tooltip 卡片，移除独立 desc 渲染
- "(可选)" 改为 badge/pill 样式
