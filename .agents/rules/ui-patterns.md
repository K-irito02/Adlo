---
description:
  UI pattern quick reference — dialog, menu, hover, click, color, hint card, button, file tree,
  tooltip, toast, input, card, badge, nav, loading, empty, motion, layout, responsive, accessibility
alwaysApply: true
---

# UI 模式速查

本文档是项目 UI/UX 标准的**唯一速查入口**。每个模式包含：场景识别 → 模式名 → 关键约束 → 权威文档链接。详细规范见
`docs/design-system/` 和本目录中的对应文件。

---

## 1. 对话框（Dialog）

### 确认对话框 → `ConfirmDialog`

- 文件：[ConfirmDialog.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/components/ConfirmDialog.tsx)
- Portal 到 `document.body`，`role="dialog"` + `aria-modal="true"`
- 遮罩层点击关闭，Escape 关闭
- 确认按钮自动聚焦；danger 模式用 `adl-btn--danger`
- 按钮排列：取消（左，secondary）+ 确认（右，primary/danger）

### 新建/重命名对话框 → `NewSessionDialog` / `RenameDialog`

- 文件：[NewSessionDialog.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/components/NewSessionDialog.tsx)、[RenameDialog.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/components/RenameDialog.tsx)
- 直角按钮、✕ 关闭按钮、i18n 标题简洁化
- 参考：[rename-dialog-standardization-2026-06-08.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/知识沉淀/交互优化/rename-dialog-standardization-2026-06-08.md)

### 模态表单 → `PromptModal`

- 文件：[PromptModal.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/components/PromptModal.tsx)

### 对话框通用规范

- 背景：`var(--bg-card)`，边框：`var(--border-default)`，阴影：`var(--shadow-lg)`，圆角：`var(--radius-lg)`
- 文档：[components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components.md)
  → Modal 章节

---

## 2. 菜单（Menu）

### 右键菜单 → `ContextMenu`

- 文件：[ContextMenu.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/components/ContextMenu.tsx)
- 定位跟随鼠标位置，`mousedown` 外部点击关闭
- 菜单项支持：disabled、danger（红色）、分隔线（separator）
- hint 属性触发 "!" 子卡片（详见 §7）
- 外部点击/ Escape 关闭

### 状态栏下拉菜单 → `.adl-statusbar__menu`

- 文件：[StatusBar.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/regions/StatusBar.tsx)
- 弹出卡片风格：`--surface-raised` 背景 + `--border` 描边 + `--radius-lg` 圆角 + `--shadow-lg` 阴影
- 选项行：hover 用 `--surface-hover` 背景，**无边框轮廓**
- 输入框：minimal chrome，hover/focus 浅灰背景
- 无蓝色 chrome，禁止 `adl-btn--primary`
- 文档：[components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components.md)
  → StatusBar menus 章节

### CodeMirror 右键菜单 → `.adl-cm-minimap-context-menu`

- 方案 C·极简线条风：underline 分段控件 + `::before` 左侧指示线 + 直角背景
- 选中态：深色背景 + 实线左侧指示线，无 checkbox
- 文档：[components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components.md)
  → Context menu 章节

### 菜单分隔线规范

- 分隔线仅在语义分组边界使用
- 白色分组（常规操作）/ 红色分组（危险操作）分离
- 参考：[github-menu-recursive-delete-and-grouping-2026-06-12.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/知识沉淀/交互优化/github-menu-recursive-delete-and-grouping-2026-06-12.md)

---

## 3. 悬停效果（Hover）

### 基础规则

- 所有交互元素必须有 `:hover` 态
- 颜色通过 `--surface-hover`（`rgba` 叠加），不依赖透明度微调
- 文档：[design-system.md](./design-system.md) → 交互状态

### 列表/菜单行悬停

- 背景：`var(--surface-hover)`，无边框变化
- 文字：保持 `var(--text-primary)`，不变色

### 卡片内全宽悬停（`::after` 伪元素模式）

- 适用场景：卡片内容行 hover 背景延伸至卡片左右边缘
- 关键：父元素 `z-index: 0` 创建局部层叠上下文，`::after` 的 `z-index: -1` 才能正确绘制
- 文档：[css-architecture.md](./css-architecture.md) → 全宽悬停背景模式
- 参考：[github-job-card-hover-and-status-dot-optimization-2026-06-14.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/知识沉淀/交互优化/github-job-card-hover-and-status-dot-optimization-2026-06-14.md)

### 父子悬停隔离

- 父级 `:hover` 背景会穿透绝对定位子元素（子元素背景透明时）
- 子元素必须显式设置遮罩背景（如 `var(--bg-card)`）+ `z-index` 覆盖父级
- 文档：[css-architecture.md](./css-architecture.md) → 绝对定位与悬停隔离

### 文件树悬停传播

- 虚拟化树：目录悬停 → JS 计算后代节点 → 添加 `is-hovered-by-ancestor` 类
- 文档：[css-architecture.md](./css-architecture.md) → 悬停传播

---

## 4. 点击效果（Click / Active）

### 按钮点击

- `:active` 时 `translateY(1px)` 下沉 + 加深 accent
- `:focus-visible` 时 3px 焦点环（`--focus-ring`）
- 文档：[components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components.md)
  → Button 章节

### 复制按钮动画

- 唯一允许的第三方动画图标库：`lucide-animated`（MIT）
- 点击播放弹簧动画后自动恢复
- 参考：[browser-copy-button-animation-2026-06-18.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/知识沉淀/浏览器/browser-copy-button-animation-2026-06-18.md)

### 图标按钮

- 无背景常态（`transparent`），hover 显示 `--surface-hover`
- 无 outline、无 border

---

## 5. 颜色（Color）

### 核心约束

- **禁止硬编码颜色值**（hex、rgb、hsl 等），一律使用 `var(--...)`
- 文档：[tokens.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/tokens.md)、[themes.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/themes.md)

### 语义 Token 速查

| 类别    | Token                          | 用途                                          |
| ------- | ------------------------------ | --------------------------------------------- |
| 背景    | `--bg`                         | 主画布（light: 248,248,248 / dark: 20,20,20） |
| 背景    | `--bg-card`                    | 卡片/对话框背景                               |
| 背景    | `--bg-muted`                   | 弱化背景                                      |
| 文字    | `--text-primary`               | 主文字                                        |
| 文字    | `--text-secondary`             | 次要文字                                      |
| 文字    | `--text-muted`                 | 禁用/占位文字                                 |
| 边框    | `--border-default`             | 默认边框                                      |
| 边框    | `--border-subtle`              | 弱边框                                        |
| 边框    | `--border-strong`              | 强调边框                                      |
| 强调    | `--accent`                     | 主强调色                                      |
| 强调    | `--accent-hover`               | 悬停强调                                      |
| Surface | `--surface-hover`              | 悬停底色                                      |
| Surface | `--surface-active`             | 选中底色                                      |
| Surface | `--surface-raised`             | 弹出层背景                                    |
| 状态    | `--success` / `--success-soft` | 成功                                          |
| 状态    | `--warning` / `--warning-soft` | 警告                                          |
| 状态    | `--danger` / `--danger-soft`   | 危险/错误                                     |
| 状态    | `--info` / `--info-soft`       | 信息                                          |

### 暗色主题

- 通过 `<html data-theme="dark">` 切换
- 所有语义 token 自动切换，组件无需感知
- 文档：[themes.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/themes.md)

---

## 6. 按钮（Button）

### 变体（Variant）

| 变体      | 类名                 | 用途                         |
| --------- | -------------------- | ---------------------------- |
| Primary   | `adl-btn--primary`   | 主操作（发送、确认）         |
| Secondary | `adl-btn--secondary` | 次要操作（取消）             |
| Ghost     | `adl-btn--ghost`     | 低优先操作（刷新、图标按钮） |
| Danger    | `adl-btn--danger`    | 危险操作（删除）             |

### 状态矩阵

| 状态                 | 行为                                    |
| -------------------- | --------------------------------------- |
| `:hover`             | 加深 accent（ghost/secondary 加深背景） |
| `:active`            | translateY(1px) + 更深 accent           |
| `:focus-visible`     | 3px 焦点环 `--focus-ring`               |
| `[disabled]`         | opacity 0.55, `cursor: not-allowed`     |
| `[aria-busy="true"]` | 显示 spinner，隐藏 label                |

### 文档

- 完整 API：[components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components.md)
  → Button 章节
- 状态矩阵：[components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components.md)
  → State coverage matrix### 危险操作按钮 → `adl-icon-btn--danger-hover`

- 用于"关闭选项卡"等危险操作按钮，常驻隐藏、hover 时显示
- 常态无背景色，hover 时变红：`color: var(--color-red-500); background: var(--color-red-100)`
- 文件：[BrowserTreeEntryFlatList.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/features/browser-tree/BrowserTreeEntryFlatList.tsx)
- 经验：[browser-opened-tabs-enhancement](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/知识沉淀/浏览器/browser-opened-tabs-enhancement-2026-06-23.md)

---

## 7. "!" 解释子卡片（Hint Card）

### 触发方式

- 菜单项设置 `hint` 属性 → 出现 "!" 图标
- 鼠标悬停 "!" 图标 → 弹出子卡片

### 子卡片样式

- 类名：`.adl-sub-hint-card`
- 直接 append 到 `document.body`（动态 DOM）
- 三个独立 `position: fixed` 元素：卡片 + 箭头填充 + 箭头边框
- 箭头使用 CSS 边框三角形（非 clip-path）
  - 默认（右侧卡片）：`border-right: 5px` → 指向左侧（←）
  - 左侧卡片（`--left` 变体）：`border-left: 5px` → 指向右侧（→），需显式 `border-right: 0`
    覆盖基础类
  - 向下卡片（`--down` 变体）：`border-top: 5px` → 指向上方（↑）
- 阴影：`var(--shadow-md)`，圆角：`var(--radius-md)`
- `line-height: 1.5` 避免奇偶高度导致子像素边框渲染不对称

### 定位

- **右侧卡片（默认）**：`left: menuRight ± offset`，箭头尖端对齐卡片左缘
- **左侧卡片（`--left`）**：`left: anchorRect.left`，箭头尖端对齐菜单左边缘（`anchorRect.left`）
- 垂直居中：`top: centerY; transform: translateY(-50%)`

### 关键约束

- 动态 DOM 必须绑定到组件生命周期（useEffect cleanup 移除）
- 使用 `useRef<HTMLElement[]>` 存储引用，避免内存泄漏
- 父级 hover 背景隔离：子卡片需显式背景 + z-index
- `line-height` 必须为整数因子（如 `1.5`），避免 `line-height * font-size` 产生半像素值，否则
  `translateY(-50%)` 导致子像素定位，1px 边框抗锯齿不对称

### 文档

- 实现（右侧）：[ContextMenu.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/components/ContextMenu.tsx)
  → `showHint()`
- 实现（左侧）：[BrowserMenuHintItem.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/features/browser/BrowserMenuHintItem.tsx)
- 经验：[hint-card-arrow-positioning-fix-2026-06-11.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/知识沉淀/交互优化/hint-card-arrow-positioning-fix-2026-06-11.md)
- 子像素边框：[sub-card-border-subpixel-fix-2026-07-01.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/知识沉淀/交互优化/sub-card-border-subpixel-fix-2026-07-01.md)
- DOM 生命周期：[component-architecture.md](./component-architecture.md)
  → DOM 生命周期管理

### Hover Bridge（间隙桥接模式）

当子卡片/下拉菜单通过 `position: absolute` 定位在触发元素右侧且有间隙时（如 `left: calc(100% + 6px)`），鼠标穿过间隙会导致 CSS `:hover` 短暂失效，触发背景闪烁。

**解决方案**：在触发元素上添加 `::after` 伪元素，填满间隙：

```css
.trigger::after {
  content: '';
  position: absolute;
  top: 0;
  left: 100%;      /* 从触发元素右边缘向外延伸 */
  width: 6px;      /* 等于间隙宽度 */
  height: 100%;
  background: transparent;
}
```

**关键约束**：
- 伪元素必须是触发元素的 DOM 子节点，确保鼠标在 bridge 上时 CSS `:hover` 保持激活
- bridge 宽度必须等于触发元素与子卡片之间的间隙（通常由 `calc(100% + Npx)` 中的 N 决定）
- 子卡片必须渲染在触发元素的 DOM 子树内（非 Portal），否则 bridge 无法覆盖间隙
- 使用 `left: 100%`（向外延伸），**不要用** `right: 0`（会向内延伸，无法覆盖间隙）

**实现文件**：[BranchSubCard.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/regions/right-panel/panels/BranchSubCard.tsx)、[file-tree-browser.css](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/styles/regions/rightpanel/file-tree-browser.css)

### Dual-Text Label（双文本标签模式）

当标签文本在两种状态间切换（如"切换分支" ↔ 当前分支名），且两种文本长度不同时，直接替换文本会导致容器宽度变化，产生视觉跳动。

**解决方案**：使用 CSS Grid 将两个文本叠放在同一网格单元中，容器宽度取两者最大值，通过 `opacity` 过渡切换：

```css
.label--dual {
  display: grid;
}
.label--dual .label-text {
  grid-area: 1 / 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: opacity 0.12s ease;
}
.label--dual .label-text[data-active="false"] {
  opacity: 0;
}
```

**关键约束**：
- 两个文本始终渲染，仅通过 `data-active` 属性控制可见性
- 网格容器宽度由两个文本中较宽者决定，切换时宽度不变
- 过渡时长应短（~120ms），确保响应灵敏
- 需要 `overflow: hidden; text-overflow: ellipsis` 处理超长文本

**实现文件**：[BranchSubCard.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/regions/right-panel/panels/BranchSubCard.tsx)、[file-tree-browser.css](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/styles/regions/rightpanel/file-tree-browser.css)

---

## 8. 文件树（File Tree）

### 虚拟化树

- 文件：[fileTree.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/features/file-tree/fileTree.tsx)
- 扁平 `<li>` 结构 + `useVirtualList` 虚拟化
- 行高固定 **28px**

### 动态缩进

- CSS 变量：`--adl-tree-indent` = `(depth - 1) * 14px`
- 逐节点设置，实现层级感知

### 树干线

- 虚拟化树使用溢出模式：`--adl-trunk-height` = `(visibleDescendants + 1) * 28px`
- 文件节点隐藏 `::before`，树干线由父目录溢出提供

### 悬停高亮传播

- CSS 兄弟选择器 `~` 无法跨越扁平列表
- JS 计算：从悬停目录向后扫描直到 depth ≤ 悬停 depth
- 后代节点获得 `is-hovered-by-ancestor` 类

### 文档

- 完整 CSS 模式：[css-architecture.md](./css-architecture.md) → 虚拟化树形列表的 CSS 模式
- 经验：[file-tree-virtualized-connecting-lines-fix-2026-06-11.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/知识沉淀/交互优化/file-tree-virtualized-connecting-lines-fix-2026-06-11.md)

---

## 9. Tooltip

### 统一入口

- **推荐**：`TooltipSimple`（便捷组件）
- **复杂场景**：`Tooltip` + `TooltipTrigger` + `TooltipContent`（组合模式）
- **文件系统路径展示**：可使用原生 `title` 属性（如 `WorkspaceList.tsx` 中的工作区路径）
  - 理由：路径內容为纯文本，原生 tooltip 无定位闪烁问题
  - 适用场景：工作区路径、文件路径等纯文本路径展示
- 文件：[Tooltip.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/components/Tooltip.tsx)
- 非路径场景**禁止**原生 `title` 属性

### 视觉规范

| 属性 | 值                                            |
| ---- | --------------------------------------------- |
| 背景 | `var(--tooltip-bg)`（反色主题：亮→暗，暗→亮） |
| 文字 | `var(--tooltip-fg)`                           |
| 圆角 | `var(--tooltip-radius)`（6px）                |
| 阴影 | `var(--tooltip-shadow)`                       |
| 动画 | 纯 opacity 过渡（无 scale）                   |
| 箭头 | 8px clip-path 三角，按 `data-side` 旋转       |

### 折叠 Tooltip

- `FoldTooltipOverlay`：CodeMirror 6 扩展，Portal 到 `document.body`
- 使用捕获阶段 `document.addEventListener` 绕过 MergeView 的 `stopPropagation`

### 文档

- [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components.md) →
  Tooltip design 章节
- [tokens.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/tokens.md) →
  Tooltip 章节

---

## 10. Toast 通知

### API

- 文件：[Toast.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/components/Toast.tsx)
- 类型：success（绿色）、warning（橙色）、error（红色）

### 视觉规范

| 属性 | 值                                |
| ---- | --------------------------------- |
| 位置 | Fixed, top center, `top: 24px`    |
| 动画 | 顶部下落 + 弹簧缓动               |
| 背景 | `var(--bg-card)`                  |
| 边框 | `1px solid var(--border-default)` |
| 圆角 | `4px`                             |
| 阴影 | `var(--shadow-md)`                |
| 字体 | `var(--text-xs)`                  |
| 图标 | 16×16px                           |

### 堆叠规则

- 同 source 的 toast 替换（同位置）
- 不同 source 的 toast 垂直堆叠，间距 8px
- 自动消失后调整位置

### 文档

- [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components.md) →
  Toast Notification 章节

---

## 11. 输入框（Input）

### 样式

- 类名：`.input`、`.textarea`、`.select`
- 默认无边框（minimal chrome），hover/focus 浅灰背景
- 错误态：`aria-invalid="true"` + `.input` 错误样式

### 表单字段

- 类名：`.field`、`.field__label`、`.field__hint`、`.field__error`
- 每个 input 必须有 visible label 或 `.sr-only` label
- 禁止 placeholder-only 隐式标签

### 文档

- [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components.md) →
  Component catalogue 章节
- [accessibility.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/accessibility.md)
  → Forms 章节

---

## 12. 卡片（Card）

### 变体

| 变体      | 用途                       |
| --------- | -------------------------- |
| `default` | 标准卡片                   |
| `inset`   | 嵌套卡片（卡片内的子分组） |

### 规范

- 语义化为 `<section>`（可 override）
- 可选 title、subtitle、toolbar
- 空状态使用 `renderEmptyState`

### 文档

- [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components.md) →
  Card 章节

---

## 13. 状态指示（Pill / Badge）

### 语调映射

| 语调                         | 类                                | Token            |
| ---------------------------- | --------------------------------- | ---------------- |
| neutral                      | `.pill`                           | `--bg-muted`     |
| healthy / success            | `.pill--healthy` / `--success`    | `--success-soft` |
| degraded / pending / warning | `.pill--degraded`                 | `--warning-soft` |
| unavailable / danger         | `.pill--unavailable` / `--danger` | `--danger-soft`  |
| info                         | `.pill--info`                     | `--info-soft`    |
| accent                       | `.pill--accent`                   | `--accent-soft`  |

### 关键规则

- 状态颜色**不能**是唯一信号：pill 始终配文字，关键状态（success/warning/danger）配图标

### 文档

- [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components.md) →
  Pill / Badge 章节
- [accessibility.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/accessibility.md)
  → Color & Contrast 章节

---

## 14. 导航（Navigation）

### 导航项

- 类名：`.nav__item`
- 当前页：`aria-current="page"`
- 小屏幕自动折叠 label

### IconStrip（图标条）

- 类名：`.adl-iconstrip`、`.adl-iconstrip__button`
- 默认图标按钮，选中/悬停共享中性灰填充（无强调色 chrome）
- 分隔线是**条件叠加层**（仅相邻灰态时显示），非永久分隔
- 自定义变量：`--adl-iconstrip-height`、`--adl-iconstrip-button-size` 等

### 分段控件

- `renderSegmentedControl`：`data-segmented-name` + `data-segmented-value`，单次委托 click 处理

### 文档

- [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components.md) →
  Navigation item / Icon strip / Segmented control 章节

---

## 15. 加载态（Loading / Skeleton）

### 骨架屏

- 类名：`.skeleton`
- 动效：`@keyframes skeleton-shimmer`

### 按钮加载

- `[aria-busy="true"]`：显示 spinner，隐藏 label，禁用 pointer events

### 文档

- [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components.md) →
  Component catalogue / Button 章节

---

## 16. 空状态（Empty State）

### API

```ts
renderEmptyState({ icon, title, description, action });
```

### 规范

- 图标 + 标题 + 描述 + 可选操作按钮
- 占位/添加元素的 `border-width` 必须与真实元素一致（`box-sizing: border-box`）
- 仅 `border-style` 改为 `dashed` 即可视觉区分

### 文档

- [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components.md) →
  Empty state 章节
- [css-architecture.md](./css-architecture.md) → 布局稳定性

---

## 17. 动画与动效（Motion）

### Token 速查

| 类别 | Token                                                                                          |
| ---- | ---------------------------------------------------------------------------------------------- |
| 缓动 | `--ease-default`（220 emphasis）、`--ease-enter`、`--ease-exit`、`--ease-spring`               |
| 复合 | `--transition-colors`、`--transition-shadow`、`--transition-transform`、`--transition-opacity` |

### 关键规则

- 动画仅使用 `transform` 和 `opacity`，避免触发 layout/paint
- 禁止 `transition: all`
- `prefers-reduced-motion: reduce` 自动将所有 duration 缩为 1ms

### 文档

- [tokens.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/tokens.md) → Motion 章节
- [accessibility.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/accessibility.md)
  → Motion 章节

---

## 18. 布局（Layout）

### 间距

- 4px 基准网格：`--space-1`(4px) → `--space-24`(96px)
- 文档：[tokens.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/tokens.md) →
  Spacing

### 关键布局 Token

| Token                       | 值    | 用途       |
| --------------------------- | ----- | ---------- |
| `--titlebar-height`         | 36px  | 标题栏     |
| `--statusbar-height`        | 28px  | 状态栏     |
| `--sidebar-width`           | 248px | 侧边栏     |
| `--sidebar-width-collapsed` | 64px  | 折叠侧边栏 |

### 布局稳定性

- 内容可变容器使用固定 `width`，禁止仅 `min-width`
- 图标/徽标用 `margin-left: auto` 固定右侧，非绝对定位
- 禁止动态列表项不同高度

### 文档

- [css-architecture.md](./css-architecture.md) → 布局稳定性
- [tokens.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/tokens.md) → Layout

---

## 19. 响应式（Responsive）

### 断点

| 宽度     | 效果                 |
| -------- | -------------------- |
| ≤ 1280px | 3 列 → 2 列          |
| ≤ 960px  | 侧边栏折叠为图标模式 |
| ≤ 640px  | 最小支持，侧边栏隐藏 |

### 约束

- 最小窗口宽度 640px
- 基础样式面向最小布局，`min-width` 渐进增强
- `:hover` 仅用于 affordance，不依赖其完成必要交互

### 文档

- [responsive.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/responsive.md)

---

## 20. 无障碍（Accessibility）

### 目标

- WCAG 2.1 AA 级别
- 颜色对比度 ≥ 4.5:1（正文）、≥ 3:1（大文本/图形 UI）

### 关键规则

- 所有交互控件为真实 `<button>` / `<a>` / 表单控件，禁止 `div role="button"`
- 装饰性图标 `aria-hidden="true"`，语义图标必须有 `title`/`aria-label`
- Banner 使用 `role="status"` + `aria-live`
- 表单 input 必须有 label（visible 或 `.sr-only`），禁止 placeholder-only
- `prefers-reduced-motion` 自动缩小动效
- `prefers-contrast: more` 增强边框和焦点环

### 文档

- [accessibility.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/accessibility.md)

---

## 21. Resize Handle / Scrollbar 重叠解决

### 场景

Resize Handle（8-12px, z-index:10）与自定义 Scrollbar（7px,
z-index:3）在视觉上重叠，导致 Scrollbar 无法 hover/交互。

### 方案：pointer-events 分流

- Handle 本身设 `pointer-events: none`（不拦截任何事件）
- `::before` 伪元素设 `pointer-events: auto`，仅提供 3px 可拖拽边缘
- hover/active 样式用 `.handle:hover::before`（伪类在前，伪元素在后），不可用
  `.handle::before:hover`

### 关键约束

- 仅 3px 是可接受的最小可拖拽宽度
- 禁止 transition `width`（仅 opacity/background-color）
- 仅 Handle 与 Scrollbar 视觉重叠时才需要此方案（判断条件：Handle z-index > Scrollbar
  z-index + 位置叠加）

### 文档

- 完整经验：[知识沉淀](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/知识沉淀/交互优化/resize-handle-pointer-events-diversion-2026-06-23.md)
- 实现文件：`frontend/src/styles/regions/leftbar.css` (`.adl-leftbar__resize-handle`)
- 实现文件：`frontend/src/styles/regions/rightpanel/files-navigator.css`
  (`.adl-tool-navigator__resize-handle`)

---

## 快速索引

| 场景                                   | 查哪个文档                                                                                                                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 我要做个对话框                         | [§1 对话框](#1-对话框dialog) → [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components.md)                                                                   |
| 我要做个菜单                           | [§2 菜单](#2-菜单menu) → [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components.md)                                                                         |
| 我要调悬停颜色                         | [§3 悬停效果](#3-悬停效果hover) → [tokens.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/tokens.md)                                                                        |
| 我要调点击反馈                         | [§4 点击效果](#4-点击效果click--active) → [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components.md)                                                        |
| 我要选颜色变量                         | [§5 颜色](#5-颜色color) → [themes.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/themes.md)                                                                                |
| 我要做按钮                             | [§6 按钮](#6-按钮button) → [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components.md)                                                                       |
| 我要做 "!" 提示                        | [§7 Hint Card](#7--解释子卡片hint-card) → [ContextMenu.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/components/ContextMenu.tsx)                           |
| 我要做文件树                           | [§8 文件树](#8-文件树file-tree) → [css-architecture.md](./css-architecture.md)                                                                                                                |
| 我要做 Tooltip                         | [§9 Tooltip](#9-tooltip) → [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components.md)                                                                       |
| 我要做 Toast                           | [§10 Toast](#10-toast-通知) → [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components.md)                                                                    |
| 我要做输入框                           | [§11 输入框](#11-输入框input) → [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components.md)                                                                  |
| 我要做卡片                             | [§12 卡片](#12-卡片card) → [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components.md)                                                                       |
| 我要做状态标签                         | [§13 Pill](#13-状态指示pill--badge) → [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components.md)                                                            |
| 我要做导航                             | [§14 导航](#14-导航navigation) → [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components.md)                                                                 |
| 我要做加载态                           | [§15 加载态](#15-加载态loading--skeleton) → [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components.md)                                                      |
| 我要做空状态                           | [§16 空状态](#16-空状态empty-state) → [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components.md)                                                            |
| 我要做动画                             | [§17 动画](#17-动画与动效motion) → [tokens.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/tokens.md)                                                                       |
| 我要调布局                             | [§18 布局](#18-布局layout) → [tokens.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/tokens.md)                                                                             |
| 我要调响应式                           | [§19 响应式](#19-响应式responsive) → [responsive.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/responsive.md)                                                             |
| 我要做无障碍                           | [§20 无障碍](#20-无障碍accessibility) → [accessibility.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/accessibility.md)                                                    |
| 我要修 resize handle 与 scrollbar 重叠 | [§21 Resize Handle](#21-resize-handle--scrollbar) → [知识沉淀](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/知识沉淀/交互优化/resize-handle-pointer-events-diversion-2026-06-23.md)        |
| 我要做 hover text-overflow 遮罩        | [§23 Hover 渐变蒙版](#23-hover-渐变蒙版) → [知识沉淀](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/知识沉淀/浏览器/browser-navigator-4-mode-2026-06-24.md)                                 |
| 我要做子卡片菜单（分支切换等）         | [§22 子卡片菜单](#22-子卡片菜单sub-card-menu) → [BranchSubCard.tsx](file:///E:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/regions/right-panel/panels/BranchSubCard.tsx) |
| 我要写 CSS                             | [css-architecture.md](./css-architecture.md)                                                                                                                                                  |
| 我要拆组件                             | [component-architecture.md](./component-architecture.md)                                                                                                                                      |
| 我要查设计约束                         | [design-system.md](./design-system.md)                                                                                                                                                        |

---

## 22. 子卡片菜单（Sub-Card Menu）

### 场景

菜单项悬停时弹出子卡片（如变更面板的"切换分支"功能），子卡片与菜单卡片之间存在间距，且子卡片需跟随菜单项垂直位置。

### 标准

| 属性       | 值                                                                               |
| ---------- | -------------------------------------------------------------------------------- |
| 子卡片定位 | `position: absolute`，相对于菜单项容器                                           |
| 水平偏移   | `left: anchor(right)` + `margin-left: var(--space-px)`（CSS Anchor Positioning） |
| 垂直对齐   | `top: var(--adl-changes-branch-sub-top, 0)`（父菜单传入 CSS 变量动态控制）       |
| 背景       | `var(--bg-card)`                                                                 |
| 边框       | `1px solid var(--border)`                                                        |
| 圆角       | `var(--radius-lg)`                                                               |
| 阴影       | `var(--shadow-lg)`                                                               |

### 悬停延迟规范

主菜单到子卡片的过渡使用 **200ms 延迟关闭**，防止鼠标意外移出时子卡片立即隐藏：

- 主菜单项 `onMouseLeave`：启动 200ms `setTimeout`，到期才隐藏子卡片
- 子卡片 `onMouseEnter`：清除延迟计时器，保持子卡片显示
- 子卡片 `onMouseLeave`：立即隐藏（用户已明确离开子卡片区域）
- 参考实现：`TerminalShellSelector.tsx`（`handleMouseLeaveSubMenu` /
  `handleMouseEnterSubMenuContent`）
- 关键文件：`BranchSubCard.tsx` `BranchMenuItem` 中的 `leaveTimerRef`

### > 图标固定在最右侧

- ">" 图标作为 flex 项的直属子项（而非内嵌在按钮内），通过 wrapper 容器的 `display: flex` +
  `flex: 1` 确保图标永远在最右侧
- 按钮内仅包含 icon + label（flex: 1），arrow 作为按钮的兄弟元素
- 结构示例：
  ```html
  <div class="adl-multitree-entry__menu-item--with-sub">
    <button><!-- icon + label --></button>
    <span class="...arrow"><IconChevronRight /></span>
  </div>
  ```
- `adl-multitree-entry__menu-item-arrow` 使用 `flex-shrink: 0` + 默认 `order` 使其位于最右

### 标签显示规则（动态标签）

对于功能选项的名称：

- **默认态**（未悬停）：显示当前值（如当前分支名称）
- **悬停态**：显示功能说明文字（如"切换分支"）
- 分支名过长时使用 `text-overflow: ellipsis` 省略截断
- 右侧 ">" 图标固定在容器最右侧（见上节）
- 实现参考：`BranchSubCard.tsx` 的 `BranchMenuItem` 组件

### 悬停背景规范

- 唯一悬停背景由 wrapper 容器（`.adl-multitree-entry__menu-item--with-sub:hover`）提供
- 内部按钮 (`button.adl-multitree-entry__menu-item--with-sub-btn`) 无独立背景
- 按钮内仅保留 `background: transparent; cursor: pointer`

### 子卡片内分支项：原生 Tooltip

- 每个分支 `<button>` 设置 `title={branch.name}`，悬停时系统原生 tooltip 完整显示分支名称
- 解决省略截断后分支名显示不完整的问题

### 关键文件

- 组件：`BranchSubCard.tsx`
- CSS：`changes-panel.css`（`.adl-changes-branch-submenu`、`.adl-changes-branch-item`）、`file-operations.css`（`.adl-multitree-entry__menu-item--with-sub`）
- 参考实现：`TerminalShellSelector.tsx`（`.adl-menu__dropdown--right` 水平偏移模式 + 延迟关闭模式）

### 文档

- 经验沉淀：[知识沉淀/交互优化/](./docs/知识沉淀/交互优化/)

---

## 23. Hover 渐变蒙版

### 场景

Hover 时，`.adl-filetree__label` 文字超出
`.adl-filetree__meta`（或关闭按钮）的覆盖范围，露出遮不住的文字。常见于 `<button>` flex 子项忽略
`min-width: 0` 导致溢出。

### 方案：`::after` 伪元素渐变蒙版

在行容器上添加 `::after`，hover 时显示渐变遮罩，挡住溢出的文字：

```css
.row {
  position: relative; /* 确保伪元素定位正确 */
}

.row::after {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 40px;
  background: linear-gradient(
    to right,
    transparent 0%,
    var(--bg-occlusion) 40%,
    var(--bg-occlusion) 100%
  );
  opacity: 0; /* 默认隐藏 */
  pointer-events: none; /* 不阻塞交互 */
  transition: opacity var(--duration-150) var(--ease-default);
  z-index: 1; /* 在 meta (z-index:2) 之下 */
}

.row:hover::after {
  opacity: 1; /* hover 时显示 */
}
```

### 关键约束

| 约束                   | 理由                                                                 |
| ---------------------- | -------------------------------------------------------------------- |
| `z-index: 1`           | 必须小于 meta 的 z-index (2)，确保关闭按钮可点击                     |
| `pointer-events: none` | 不阻塞 bottom/right 区域的点击                                       |
| `width: 40px`          | 匹配关闭按钮区域宽度（右 padding 12px + 按钮 22px + gap 8px ≈ 42px） |
| 仅 hover 显示          | 避免常驻视觉干扰                                                     |
| `--bg-occlusion`       | 与 meta 遮罩色一致，视觉无缝                                         |
| `text-overflow: clip`  | 配合蒙版，无省略号                                                   |

---

## 25. 子卡片间距全局标准

### 标准

所有子卡片/子菜单（sub-card / sub-menu / sub-dropdown）与主菜单卡片之间的水平间距必须统一为
**1px**，使用 **CSS `calc(100% + Npx)`** 实现，其中 `N` 需根据每个位置的父容器偏移量手动调校。

### 实现方案

```
                           ┌──────────────────────┐
                           │  主菜单卡片            │
                           │  ┌───────────┐         │
                           │  │ 菜单项     │ → → →  │  ← 菜单项宽度 = N px
                           │  │ (触发元素) │         │
                           │  └───────────┘         │
                           └──────────────────────┘
                                   │ calc(100% + Npx)
                                   ▼
                           ┌──────────────┐
                           │  子卡片        │
                           └──────────────┘
```

**关键发现：** CSS Anchor Positioning 在当前 WebView 版本中 `CSS.supports` 返回 true，
但 `position-anchor` 在运行时解析失败（`computed positionAnchor: "none"`），且 `@supports`
块整体被浏览器忽略。因此**所有子卡片使用 `absolute + calc(100% + Npx)` 回退方案**，
`@supports (position-anchor)` 块保留作为未来兼容，但不可依赖。

### `Npx` 值的精确计算

`100%` 相对于 **offsetParent 的 content-box 宽度**（非 border-box）。
当 offsetParent 有 `border: 1px` 时，content-box 比 border-box 少 2px。

此外，当 offsetParent 比主菜单卡片窄时（例如在 `display: grid` 或 `flex` 列中），
子菜单的 `left` 需对齐到**主菜单卡片的右边缘**，而非 offsetParent 的右边缘。

计算方式：
```
N = (主菜单卡片右边缘 + 1px) - offsetParent content-box 左边缘 - offsetParent content-box 宽度
```

**实际数值（当前布局下验证）：**

| # | 位置 | offsetParent | border | content-box width | `N` 值 |
|---|------|------------|--------|-------------------|--------|
| 1 | split-btn menu/settings | `.adl-split-btn` (relative) | 1px | 300px | 11 |
| 2 | statusbar branch submenu | `.adl-statusbar__submenu-wrap` (relative) | 0px | ~116px | 10 |
| 3 | changes-panel branch sub-card | `.adl-multitree-entry__menu-item--with-sub` (relative) | 0px | ~166px | 6 |

### 代码模板

```css
/* Trigger anchor-name (retained for future anchor support): */
[data-anchor-name='my-trigger'] {
  anchor-name: --my-trigger;
}

/* Sub-card: */
.sub-card {
  position: absolute;
  top: 0;
  left: calc(100% + Npx);
  /* ...rest of styles */
}

/* Anchor positioning fallback (kept as future-compat, not relied upon): */
@supports (position-anchor) {
  .sub-card {
    position-anchor: --my-trigger;
    left: anchor(right);
    top: anchor(top);
    margin-left: var(--space-px);
  }
}
```

### 全部位置清单

| # | 组件 | CSS 选择器 | offsetParent | `N` | 调试日志 key |
|---|------|-----------|-------------|-----|------------|
| 1 | 变更面板分支子卡片 | `.adl-changes-branch-submenu` | `.adl-multree-entry__menu-item--with-sub` | 6 | `gap from menu right edge` |
| 2 | 终端面板右键子菜单 | `.adl-menu__dropdown--right` | `.adl-menu__item--has-sub` | 6 | - |
| 3 | 选择文件夹拆分按钮菜单 | `.adl-split-btn__menu` | `.adl-split-btn` | 11 | `gap from workspace menu right` |
| 4 | 选择文件夹拆分按钮设置面板 | `.adl-split-btn__settings` | `.adl-split-btn` | 11 | - |
| 5 | 状态栏分支子菜单 | `.adl-statusbar__submenu` | `.adl-statusbar__submenu-wrap` | 10 | `gap from trigger right` |
| 6 | 标题栏品牌 Tooltip | `.adl-titlebar__brand-tooltip` | —（dead code） | - | - |

### 验证方法

打开子卡片后查看 debug-logs.txt，搜索对应 key，确认值 = 1：

```
[ADL-DEBUG] actual gap from workspace menu right: 1
[ADL-DEBUG] actual gap from menu right edge: 1
```

### 已知问题

- Anchor Positioning 在 Tauri WebView2 中 `CSS.supports` 返回 true 但实际不工作，
  `@supports` 块被浏览器忽略（不应用内部规则）。
- `left: calc(100% + Npx)` 中的 `N` 是布局敏感的：改变 offsetParent 的 border、padding、
  width，或主菜单卡片的 width 都会改变所需 N 值。
- 添加新的子卡片位置时，使用上述公式精确计算 N，并用 log 验证。不要用猜的方式。

### 文档

- CSS 变量 `--space-px: 1px`（`tokens.css:15`）是间隙的唯一来源（仅用于 anchor block）
- 浏览器兼容性：Chromium 125+（2024年5月），Tauri WebView2 始终是最新版本
