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
- 参考：[rename-dialog-standardization-2026-06-08.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/knowledge-base/interaction/rename-dialog-standardization-2026-06-08.md)

### 模态表单 → `PromptModal`

- 文件：[PromptModal.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/components/PromptModal.tsx)

### 对话框通用规范

- 背景：`var(--bg-card)`，边框：`var(--border-default)`，阴影：`var(--shadow-lg)`，圆角：`var(--radius-lg)`
- 文档：[components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components/components.md)
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
- 文档：[components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components/components.md)
  → StatusBar menus 章节

### CodeMirror 右键菜单 → `.adl-cm-minimap-context-menu`

- 方案 C·极简线条风：underline 分段控件 + `::before` 左侧指示线 + 直角背景
- 选中态：深色背景 + 实线左侧指示线，无 checkbox
- 文档：[components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components/components.md)
  → Context menu 章节

### 菜单分隔线规范

- 分隔线仅在语义分组边界使用
- 白色分组（常规操作）/ 红色分组（危险操作）分离
- 参考：[github-menu-recursive-delete-and-grouping-2026-06-12.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/knowledge-base/interaction/github-panel/github-menu-recursive-delete-and-grouping-2026-06-12.md)

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
- 参考：[github-job-card-hover-and-status-dot-optimization-2026-06-14.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/knowledge-base/interaction/github-panel/github-job-card-hover-and-status-dot-optimization-2026-06-14.md)

### 父子悬停隔离

- 父级 `:hover` 背景会穿透绝对定位子元素（子元素背景透明时）
- 子元素必须显式设置遮罩背景（如 `var(--bg-card)`）+ `z-index` 覆盖父级
- 文档：[css-architecture.md](./css-architecture.md) → 绝对定位与悬停隔离

### 悬停显示的操作用户按钮（Hover-revealed action buttons）

- 场景：行/卡片悬停才出现的操作按钮（复制、跳转、更多操作）
- 默认 `opacity: 0` 且**必须** `pointer-events: none`，否则不可见区域仍可点击，误触发操作
- 悬停时 `opacity: 1; pointer-events: auto`
- 键盘可访问：用按钮自身的 `:focus-visible`（`opacity: 1; pointer-events: auto`）——**禁止**用容器级 `:focus-within`：鼠标点击按钮后按钮保持聚焦，`:focus-within` 持续命中 → 移出容器后按钮不消失
- 叠放占位图标：悬停按钮覆盖的默认图标（如文件夹图标）在 `:has(:focus-visible)` 时隐藏，避免与按钮重叠
- 参考：[git-vis-file-hotspots-leaderboard-2026-08-04.md](../../docs/knowledge-base/interaction/git-vis/git-vis-file-hotspots-leaderboard-2026-08-04.md)、[toast-card-unification-hover-collapse-2026-08-16.md](../../docs/knowledge-base/interaction/toast-hint-card/toast-card-unification-hover-collapse-2026-08-16.md)

### 文件树悬停传播

- 虚拟化树：目录悬停 → JS 计算后代节点 → 添加 `is-hovered-by-ancestor` 类
- 文档：[css-architecture.md](./css-architecture.md) → 悬停传播

---

## 4. 点击效果（Click / Active）

### 按钮点击

- `:active` 时 `translateY(1px)` 下沉 + 加深 accent
- `:focus-visible` 时 3px 焦点环（`--focus-ring`）
- 文档：[components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components/components.md)
  → Button 章节

### 复制按钮动画

- 唯一允许的第三方动画图标库：`lucide-animated`（MIT）
- 点击播放弹簧动画后自动恢复
- 参考：[browser-copy-button-animation-2026-06-18.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/knowledge-base/browser/navigation/browser-copy-button-animation-2026-06-18.md)

### 图标按钮

- 无背景常态（`transparent`），hover 显示 `--surface-hover`
- 无 outline、无 border

---

## 5. 颜色（Color）

### 核心约束

- **禁止硬编码颜色值**（hex、rgb、hsl 等），一律使用 `var(--...)`
- 文档：[tokens.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/foundations/tokens.md)、[themes.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/foundations/themes.md)

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
- 文档：[themes.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/foundations/themes.md)

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

- 完整 API：[components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components/components.md)
  → Button 章节
- 状态矩阵：[components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components/components.md)
  → State coverage matrix### 危险操作按钮 → `adl-icon-btn--danger-hover`

- 用于"关闭选项卡"等危险操作按钮，常驻隐藏、hover 时显示
- 常态无背景色，hover 时变红：`color: var(--color-red-500); background: var(--color-red-100)`
- 文件：[BrowserTreeEntryFlatList.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/features/browser-tree/BrowserTreeEntryFlatList.tsx)
- 经验：[browser-opened-tabs-enhancement](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/knowledge-base/browser/tab-management/browser-opened-tabs-enhancement-2026-06-23.md)

### 主题切换与 transition（防闪烁）

**问题模式**：当交互元素（按钮、徽标等）的 `background` 或 `color` 使用主题相关变量（如 `var(--bg-card)`、`var(--text-primary)`）时，若 `transition` 包含 `background-color` 或 `color`，主题切换会产生近黑↔近白的可见闪烁。

**根因**：`var(--theme-transition)`（定义于 `tokens.css`）包含 `background-color 200ms`、`color 200ms` 等过渡。主题切换时这些变量值剧变（如 `--bg-card`: light `#fbfbfb` ↔ dark `#1a1a1a`），200ms 过渡使变化可见。

**正确做法**：
- 对**背景/文字色使用主题变量**的交互元素：精确列举 `transition-property`，仅保留所需过渡（如 `transition: opacity var(--duration-150) var(--ease-default);`），**不要**使用 `var(--theme-transition)`
- 对**背景为 `transparent`** 的元素：可安全使用 `var(--theme-transition)`（透明度不变，不触发 background-color 过渡）
- 主题切换时背景/文字色应**即时更新**，与其他小型按钮（如 `preset-trigger`）保持一致

**示例**：
```css
/* ✅ 正确：仅过渡 opacity（aria-pressed 切换所需） */
.adl-git-vis__series-toggle-btn {
  background: var(--bg-card); /* 主题相关 */
  transition: opacity var(--duration-150) var(--ease-default);
}

/* ✅ 正确：背景透明，可使用 var(--theme-transition) */
.adl-git-vis__refresh-btn {
  background: transparent;
  transition: color 0.15s, background 0.15s;
}
```

**对比验证**：若不确定某元素是否会闪烁，对比同区域背景为 `transparent` 的元素 — 若后者不闪烁而前者闪烁，则根因是背景色过渡。

---

## 7. "!" 解释子卡片（Hint Card）

### 触发方式
- 菜单项设置 `hint` 属性 → 出现 "!" 图标 → 悬停弹出子卡片

### 视觉规范
- 类名：`.adl-sub-hint-card`，直接 append 到 `document.body`
- 三个独立 `position: fixed` 元素：卡片 + 箭头填充 + 箭头边框
- 箭头使用 CSS 边框三角形，按 data-side 旋转
- 阴影：`var(--shadow-md)`，圆角：`var(--radius-md)`

### 关键约束
- 动态 DOM 必须绑定到组件生命周期（useEffect cleanup 移除）
- 使用 `useRef<HTMLElement[]>` 存储引用，避免内存泄漏
- `line-height` 必须为整数因子（如 1.5），避免子像素定位导致 1px 边框抗锯齿不对称

### 文档
- [ContextMenu.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/components/ContextMenu.tsx) → `showHint()`
- 左侧实现：[BrowserMenuHintItem.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/features/browser/BrowserMenuHintItem.tsx)
- 经验：[hint-card-arrow-positioning-fix](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/knowledge-base/interaction/toast-hint-card/hint-card-arrow-positioning-fix-2026-06-11.md)
- 子像素边框：[sub-card-border-subpixel-fix](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/knowledge-base/interaction/sub-card-border-subpixel-fix-2026-07-01.md)

### Hover Bridge（间隙桥接模式）
子卡片与触发元素有间隙时，在触发元素上添加 `::after` 伪元素填满间隙。详见 CSS 实现文件。

### Dual-Text Label（双文本标签模式）
标签文本在两种状态间切换时，使用 CSS Grid 叠放两个文本，通过 `opacity` 过渡切换。详见 [BranchSubCard.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/regions/right-panel/panels/BranchSubCard.tsx)。

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
- 经验：[file-tree-virtualized-connecting-lines-fix-2026-06-11.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/knowledge-base/interaction/outline-file-tree/file-tree-virtualized-connecting-lines-fix-2026-06-11.md)

---

## 9. Tooltip

### 方案选择

- **可选方案**：`TooltipSimple`（便捷组件）、`Tooltip` + `TooltipTrigger` + `TooltipContent`（组合模式）、系统原生 `title` 属性。
- **决策方式**：自定义 Tooltip 与原生 `title` 均可使用，**开发时由用户决策**，不预设硬性绑定。
- 参考：
  - `TooltipSimple` 适用于多数按钮提示。
  - 原生 `title` 适用于轻量纯文本提示（无定位/动画需求）。
- 文件：[Tooltip.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/components/Tooltip.tsx)

### 视觉规范

| 属性 | 值                                                                 |
| ---- | ------------------------------------------------------------------ |
| 背景 | 同主题 3D 按钮渐变（`--tooltip-bg-top → --tooltip-bg-bottom`，无反色） |
| 文字 | `var(--tooltip-fg)`（即 `var(--text-primary)`）                     |
| 圆角 | `var(--tooltip-radius)`（7px）                                       |
| 边框 | 无（`border: none`，立体感只靠内外阴影）                             |
| 阴影 | `var(--tooltip-shadow)`（顶内高光 + 底内收影 + 贴边/环境投影）        |
| 动画 | `opacity + translateY(8px→0)` 滑入（`--duration-350` expo 进入 / `--duration-150` 退出，无缩放） |
| 箭头 | 无（已删除；`data-side` 保留仅用于定位）                             |
| 换行 | `overflow-wrap: anywhere`（长词/URL 强制断行，CJK 不受影响）         |
| 宽度 | `maxWidth` prop（默认 240，接通到 `style.maxWidth`，定位用实测尺寸）  |

### WebView2 避让（Tauri 桌面）

- WebView2 是 OS 级渲染表面，任何 DOM（含 Tooltip）都盖不住它，`z-index` 无效。
- 策略是 Tooltip 自己让路（不动 WebView，避免页面闪烁）：`computePosition` 接收
  `avoidRects`，按"首选边 → 对侧 → 其余边"试算，第一个"视口内 + 不与任何避让矩形重叠"胜出；
  主轴放下但横向压住时先沿横轴滑移到最近空位；四边全堵才回退老逻辑（可能被盖，属已接受的降级）。
- 首选侧差一点放不下（仅被视口边缘裁切几个像素）时**钳进视口留在该侧、不翻边**
  （事项 9：翻下去常落进 WebView 覆盖区）；滑移后与原位边沿间距超过
  `MAX_SLIDE_DETACH_PX`（200px）即拒绝并继续换边（事项 9：拒绝被甩到矩形远缘）。
  无避让矩形时（浏览器模式）走老逻辑：真裁切仍翻边（底边槽可见，翻边无害）。
- 矩形来源：`getWebViewAvoidRects()`（仅 Tauri，采集
  `.adl-tool-primary--browser` 与 `.adl-center-browser__content[data-webview-active]`，
  与 `setTabBounds` 容器同源；浏览器模式返回空）。
- 经验：[tooltip-webview-avoidance-2026-10-01.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/knowledge-base/interaction/tooltip-webview-avoidance-2026-10-01.md)

### 折叠 Tooltip

- `FoldTooltipOverlay`：CodeMirror 6 扩展，Portal 到 `document.body`
- 使用捕获阶段 `document.addEventListener` 绕过 MergeView 的 `stopPropagation`

### 文档

- [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components/components.md) →
  Tooltip design 章节
- [tokens.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/foundations/tokens.md) →
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

- [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components/components.md) →
  Toast Notification 章节

### 持久错误通知（Error Toast）

- 文件：[ErrorToast.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/components/ErrorToast.tsx)、[ToastCard.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/components/ToastCard.tsx)、[ToastRegion.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/components/ToastRegion.tsx)
- **与顶部 Toast 区别**：右下角持久渲染，不自动消失，由用户手动关闭/清空；顶部 Toast 自动消失
- **统一卡片外壳**：ErrorToast 与 FileOpNotice 均复用 `ToastCard` 外壳（tone/icon/title/detail/onDismiss/role/ariaLive 映射）；右下角为**单一固定区域** `ToastRegion`（`.toast-card-region`，portal 到 body），内嵌两个 labeled group（error 组贴边、notice 组在上），避免两个同位固定区域重叠
- **三级分级**（resolveErrorToastLevel(code, detail) 按 code 语义判定）：
  - error（红 --error-toast-error）：真实失败（STORAGE/MODEL/NETWORK/INTERNAL 等），role="alert" + aria-live="assertive"
  - warning（黄 --error-toast-warning）：可恢复（NOT_FOUND/INVALID_INPUT 等），role="alert" + aria-live="assertive"
  - info（普通色）：提示（如"非 Git 仓库"工作区错误），role="status" + aria-live="polite"，标题用 errorsInfo（提示/Notice）而非"xx错误"
  - 未知 code 默认 error；FileOpNotice 用 role="status" + polite（良性提示）
- **模块作用域清除**：reportError(code, detail, scope?) 记录来源模块；clearError(get, scope?) 只清该模块错误，clearError(get) 缺省清全部。每个 action 模块定义 const SCOPE
- **队列上限**：store 保留最近 50 条（ERROR_TOAST_STORE_LIMIT），UI 显示最近 5 条 + "+N 摘要"
- **动画**：AnimatePresence mode="popLayout" + forwardRef（popLayout 测量要求）；**卡片级不设 `layout`**（避免折叠时 framer 全卡 FLIP 缩放抖动，卡片增删时兄弟瞬间就位为已知取舍，仅摘要卡保留 layout）；折叠/展开用**实测 max-height 过渡**（useLayoutEffect 读 scrollHeight 设内联 max-height + 两阶段收起：动画期间保持 pre-wrap，`transitionend` 后加 nowrap+ellipsis；ResizeObserver/fonts.ready/resize 兜底重测）
- **操作**：折叠/展开、复制、关闭（单条）、清空全部（摘要行）。折叠/复制按钮为 **hover-only**（`.toast-card__btn--detail`，`:hover` 或按钮自身 `:focus-visible` 显示）
- 经验：[toast-card-unification-hover-collapse-2026-08-16.md](../../docs/knowledge-base/interaction/toast-hint-card/toast-card-unification-hover-collapse-2026-08-16.md)

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

- [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components/components.md) →
  Component catalogue 章节
- [accessibility.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/guidelines/accessibility.md)
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

- [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components/components.md) →
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

- [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components/components.md) →
  Pill / Badge 章节
- [accessibility.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/guidelines/accessibility.md)
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

- [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components/components.md) →
  Navigation item / Icon strip / Segmented control 章节

---

## 15. 加载态（Loading / Skeleton）

### 统一加载行 → `LoadingRow`

- 文件：[LoadingRow.tsx](file:///E:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/components/LoadingRow.tsx)
- CSS：[loading-row.css](file:///E:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/styles/components/loading-row.css)
- 组合：CSS border spinner（14px）+ 文字从左到右扫光闪烁动画
- 用法：`<LoadingRow variant="row" />`（树条目内联）或 `<LoadingRow variant="center" />`（面板居中）
- 内置 `role="status"` + `aria-label`
- `prefers-reduced-motion` 自动降级

### 骨骼屏

- 类名：`.skeleton`
- 动效：`@keyframes skeleton-shimmer`

### 按钮加载

- `[aria-busy="true"]`：显示 spinner，隐藏 label，禁用 pointer events

### 文档

- [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components/components.md) →
  Component catalogue / Button 章节

---

## 16. 空状态（Empty State）

### 统一空状态行 → `EmptyRow`

- 文件：[LoadingRow.tsx](file:///E:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/components/LoadingRow.tsx)（与 LoadingRow 同文件）
- 用法：`<EmptyRow variant="row" message={t.noContent as string} />` 或 `variant="center"`
- 文字居中对齐（`width: 100%` + `text-align: center`）
- 内置 `role="status"` + `aria-label={message}`

### 核心规范

- **禁止句号结尾**：所有空状态文字提示结尾不得有句号 "。" 或英文句点 "."
- **居中显示**：空状态文字必须在各自显示区域内水平居中
- 图标 + 标题 + 描述 + 可选操作按钮
- 占位/添加元素的 `border-width` 必须与真实元素一致（`box-sizing: border-box`）
- 仅 `border-style` 改为 `dashed` 即可视觉区分

### 文档

- [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components/components.md) →
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

- [tokens.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/foundations/tokens.md) → Motion 章节
- [accessibility.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/guidelines/accessibility.md)
  → Motion 章节

---

## 18. 布局（Layout）

### 间距

- 4px 基准网格：`--space-1`(4px) → `--space-24`(96px)
- 文档：[tokens.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/foundations/tokens.md) →
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
- [tokens.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/foundations/tokens.md) → Layout

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

- [responsive.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/guidelines/responsive.md)

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

- [accessibility.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/guidelines/accessibility.md)

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

- 完整经验：[knowledge-base](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/knowledge-base/interaction/pointer-events/resize-handle-pointer-events-diversion-2026-06-23.md)
- 实现文件：`frontend/src/styles/regions/leftbar.css` (`.adl-leftbar__resize-handle`)
- 实现文件：`frontend/src/styles/regions/rightpanel/files-navigator.css`
  (`.adl-tool-navigator__resize-handle`)

---

## 快速索引

| 场景                                   | 查哪个文档                                                                                                                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 我要做个对话框                         | [§1 对话框](#1-对话框dialog) → [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components/components.md)                                                                   |
| 我要做个菜单                           | [§2 菜单](#2-菜单menu) → [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components/components.md)                                                                         |
| 我要调悬停颜色                         | [§3 悬停效果](#3-悬停效果hover) → [tokens.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/foundations/tokens.md)                                                                        |
| 我要调点击反馈                         | [§4 点击效果](#4-点击效果click--active) → [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components/components.md)                                                        |
| 我要选颜色变量                         | [§5 颜色](#5-颜色color) → [themes.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/foundations/themes.md)                                                                                |
| 我要做按钮                             | [§6 按钮](#6-按钮button) → [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components/components.md)                                                                       |
| 我要做 "!" 提示                        | [§7 Hint Card](#7--解释子卡片hint-card) → [ContextMenu.tsx](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/components/ContextMenu.tsx)                           |
| 我要做文件树                           | [§8 文件树](#8-文件树file-tree) → [css-architecture.md](./css-architecture.md)                                                                                                                |
| 我要做 Tooltip                         | [§9 Tooltip](#9-tooltip) → [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components/components.md)                                                                       |
| 我要做 Toast                           | [§10 Toast](#10-toast-通知) → [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components/components.md)                                                                    |
| 我要做输入框                           | [§11 输入框](#11-输入框input) → [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components/components.md)                                                                  |
| 我要做卡片                             | [§12 卡片](#12-卡片card) → [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components/components.md)                                                                       |
| 我要做状态标签                         | [§13 Pill](#13-状态指示pill--badge) → [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components/components.md)                                                            |
| 我要做导航                             | [§14 导航](#14-导航navigation) → [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components/components.md)                                                                 |
| 我要做加载态                           | [§15 加载态](#15-加载态loading--skeleton) → [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components/components.md)                                                      |
| 我要做空状态                           | [§16 空状态](#16-空状态empty-state) → [components.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/components/components.md)                                                            |
| 我要做动画                             | [§17 动画](#17-动画与动效motion) → [tokens.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/foundations/tokens.md)                                                                       |
| 我要调布局                             | [§18 布局](#18-布局layout) → [tokens.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/foundations/tokens.md)                                                                             |
| 我要调响应式                           | [§19 响应式](#19-响应式responsive) → [responsive.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/guidelines/responsive.md)                                                             |
| 我要做无障碍                           | [§20 无障碍](#20-无障碍accessibility) → [accessibility.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/design-system/guidelines/accessibility.md)                                                    |
| 我要修 resize handle 与 scrollbar 重叠 | [§21 Resize Handle](#21-resize-handle--scrollbar) → [knowledge-base](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/knowledge-base/interaction/pointer-events/resize-handle-pointer-events-diversion-2026-06-23.md)        |
| 我要做 hover text-overflow 遮罩        | [§23 Hover 渐变蒙版](#23-hover-渐变蒙版) → [knowledge-base](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/knowledge-base/browser/navigation/browser-navigator-4-mode-2026-06-24.md)                                 |
| 我要做子卡片菜单（分支切换等）         | [§22 子卡片菜单](#22-子卡片菜单sub-card-menu) → [BranchSubCard.tsx](file:///E:/AI-DIGITAL-LIFE/SourceWorkspace/ai-digital-life/frontend/src/app/regions/right-panel/panels/BranchSubCard.tsx) |
| 我要写 CSS                             | [css-architecture.md](./css-architecture.md)                                                                                                                                                  |
| 我要拆组件                             | [component-architecture.md](./component-architecture.md)                                                                                                                                      |
| 我要查设计约束                         | [design-system.md](./design-system.md)                                                                                                                                                        |

---

## 22. 子卡片菜单（Sub-Card Menu）

### 场景
菜单项悬停时弹出子卡片（如变更面板的"切换分支"功能），子卡片与菜单卡片之间存在间距。

### 标准

| 属性 | 值 |
|------|-----|
| 子卡片定位 | `position: absolute`，相对于菜单项容器 |
| 水平偏移 | `left: calc(100% + Npx)`（N 值按布局计算，见下节） |
| 垂直对齐 | `top: var(--adl-changes-branch-sub-top, 0)` |
| 背景/边框 | `var(--bg-card)` / `1px solid var(--border)` |
| 圆角/阴影 | `var(--radius-lg)` / `var(--shadow-lg)` |

### 悬停延迟规范
主菜单到子卡片过渡使用 **200ms 延迟关闭**，防止鼠标意外移出时子卡片立即隐藏：
- 主菜单项 `onMouseLeave`：启动 200ms `setTimeout`，到期才隐藏
- 子卡片 `onMouseEnter`：清除延迟计时器，保持显示
- 子卡片 `onMouseLeave`：立即隐藏

### ">" 图标固定在最右侧
按 `flex: 1` 布局确保按钮内容扩展、箭头始终在最右。详见 [css-architecture.md](./css-architecture.md)。

### 标签显示规则（动态标签）
- **默认态**：显示当前值（如分支名）；**悬停态**：显示功能说明文字（如"切换分支"）
- 长文本使用 `text-overflow: ellipsis` 截断

### 关键文件
- 组件：`BranchSubCard.tsx`；CSS：`changes-panel.css`、`file-operations.css`
- 参考实现：`TerminalShellSelector.tsx`（水平偏移 + 延迟关闭模式）

### 文档
- 经验沉淀：[knowledge-base/interaction/](../../docs/knowledge-base/interaction/)
- 子卡片间距全局标准见 [§25](#25-子卡片间距全局标准)

---

## 23. Hover 渐变蒙版

### 场景
文字超出操作按钮覆盖范围时，使用 `::after` 伪元素渐变蒙版遮挡溢出文字。

### 标准模式
```css
.row::after {
  content: ''; position: absolute; top: 0; right: 0; bottom: 0;
  width: 40px; pointer-events: none; z-index: 1;
  background: linear-gradient(to right, transparent, var(--bg-occlusion) 40%);
  opacity: 0; transition: opacity var(--duration-150);
}
.row:hover::after { opacity: 1; }
```

### 关键约束
- `z-index: 1`（必须小于 meta 的 z-index: 2，确保关闭按钮可点击）
- `pointer-events: none`（不阻塞点击）；仅 hover 显示
- 详见 [knowledge-base/browser/](../../docs/knowledge-base/browser/navigation/browser-navigator-4-mode-2026-06-24.md)

---

## 24. 悬停预览与确认回退（Hover Preview + Confirm Reset）

### 场景
下拉菜单/选择器中，用户悬停选项时实时预览效果（无需点击），离开菜单时恢复为已确认状态。

### 标准模式
```tsx
// 1. 两个状态：confirmed（已确认） + 实时 store
const [confirmedVal, setConfirmedVal] = useState(storeVal);
const confirmedRef = useRef(storeVal);

// 2. 菜单打开时捕获当前确认值（依赖仅 [open]，不可加 storeVal）
//    否则悬停预览时 storeVal 变化会误覆盖 confirmed 状态
useEffect(() => {
  if (open) {
    setConfirmedVal(storeVal);
    confirmedRef.current = storeVal;
  }
}, [open]);

// 3. 悬停 → 更新 store 预览
const handleItemEnter = useCallback((val) => {
  setStoreVal(val);       // 实时预览
}, [setStoreVal]);

// 4. 离开菜单 → 回退到确认值
const handleMenuLeave = useCallback(() => {
  setStoreVal(confirmedRef.current);  // 恢复
}, [setStoreVal]);

// 5. 点击选中 → 更新确认值 + 关闭
const handleSelect = useCallback((val) => {
  setStoreVal(val);
  setConfirmedVal(val);
  confirmedRef.current = val;
  setOpen(false);
}, [setStoreVal]);

// 6. 外部点击/Escape → 恢复确认值 + 关闭
const handleOutside = (e) => {
  setStoreVal(confirmedRef.current);
  setOpen(false);
};

// 7. 打勾图标用 confirmedVal（不跟随悬停预览）
{confirmedVal === item.id && <IconCheck />}
```

### 关键约束
- store 更新即时生效（无防抖），确保预览体验流畅
- `confirmedRef`（ref）用于恢复逻辑（不触发重渲染），`confirmedVal`（state）用于打勾图标渲染
- 必须同步处理 Escape 键、外部点击、菜单离开三种离开路径
- 聚焦（`onFocus`）应与悬停（`onMouseEnter`）同步触发预览，保证键盘可访问
- **Hover Guard**：菜单首次打开时，设置 `hoverGuardRef` 在一帧内阻止 `onMouseEnter`/`onFocus` 触发预览，防止光标已在菜单位置时产生误触发（spurious mouseenter）。打开时设 `hoverGuardRef.current = true`，`requestAnimationFrame` 后重置为 `false`。`handleItemEnter` 入口判断 `if (hoverGuardRef.current) return;`

---

### 标准
所有子卡片与主菜单之间的水平间距必须统一为 **1px**，使用 `left: calc(100% + Npx)` 实现，N 值按布局手动调校。

**要点**：
- 因 CSS Anchor Positioning 在 WebView2 中解析失败，所有子卡片使用 `absolute + calc(100% + Npx)` 回退方案
- `100%` 相对于 offsetParent 的 content-box 宽度；border/padding 会影响 N 值
- 添加新子卡片时用公式计算 N，通过 `[ADL-DEBUG] actual gap from ...` 日志验证

### 位置清单

| # | 组件 | 选择器 | `N` |
|---|------|--------|-----|
| 1 | 变更面板分支子卡片 | `.adl-changes-branch-submenu` | 6 |
| 2 | 终端面板右键子菜单 | `.adl-menu__dropdown--right` | 6 |
| 3 | 拆分按钮菜单 | `.adl-split-btn__menu` | 11 |
| 4 | 状态栏分支子菜单 | `.adl-statusbar__submenu` | 10 |

### 文档
- CSS 变量 `--space-px: 1px`（`tokens.css:15`）
- 详细分析：[knowledge-base/interaction/](../../docs/knowledge-base/interaction/)

---

## 25. 分栏拖拽分界线（Split Divider Drag）

### 场景
面板内两个区域（如终端一个标签内的 N 个独立窗格之间、导航器与内容区）之间需要用户可拖拽调整占比的 1px 分界线。终端为多窗格模型：**一个标签 = N 个各自独立 PTY 的窗格**，每窗格可独立关闭 / 清空 / 最大化，布局分「均分（equal）」与「自由（free）」两种，并有自定义布局卡片（拖拽排序 / 交换位置 / 双击标注）。

### 实现（新实例必须复用此模式，不得另起炉灶）
- 参考实现：`features/terminal/useTerminalPaneLayout.ts`（窗格间列 / 行分界线与自由拖拽，含卸载兜底）、`features/terminal/terminalPaneLayout.ts`（比例 / 归一化矩形纯函数与单测）、`hooks/useNavigatorResize.ts`（导航器，**缺卸载兜底**，勿照抄该缺口）
- 分界线元素：`role="separator"` + `aria-orientation` + `aria-valuemin/max/now` + i18n `aria-label`；视觉 1px，命中区 `::before` 向两侧各外扩 ≥4px
- 拖拽协议：`setPointerCapture` + `pointermove` 内 rAF 节流 + **拖拽期间只写 CSS 变量（不逐帧 setState）** + `pointerup` 提交状态并持久化（值未变化时不提交，避免纯点击产生冗余渲染/落盘）
- **卸载兜底必须有**：`detach` 收尾函数存入 ref，卸载 effect 统一回收 pointer 监听 / rAF / body 上的 resizing 类
- 比例换算抽成纯函数并配单测：像素下限换算成比例后与固定上下限双向钳制；极短面板（两像素下限矛盾）取包络区间兜底（先 `min` 后 `max`）
- 区域换位用 flex `order`（DOM 顺序不变，避免重挂载有状态子树如 xterm）

### 文档
- 终端多窗格交互说明：[ui-manual/rightpanel/tools/terminal.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/operations/ui-manual/rightpanel/tools/terminal.md)「边界线拖拽（均分模式）」
- 设计文档：[terminal-multipane-design.md](file:///e:/AI-DIGITAL-LIFE/SourceWorkspace/docs/superpowers/specs/2026-10-07-terminal-multipane-design.md)
---

## 26. 进行中的破坏性操作：`aria-disabled` 而非 `disabled`（In-Flight Dialog Actions）

### 概述

确认对话框在**执行破坏性操作期间**（例如逐条删除最多 200 条剪贴板历史，秒级窗口）需要「按钮不可重复点击」，但**不能**用 `disabled`：Chromium / WebView2 会把被禁用且已聚焦的元素失焦到 `<body>`，焦点逃出 `aria-modal`；若同时把对话框内所有按钮都禁用，Tab 遍历也会直接离开模态框（`focusables.length === 0` 时任何焦点陷阱都无从接管）。

### 实现

- 按钮保持可聚焦，用 `aria-disabled="true"` 表达状态；**动作层**用重入守卫拦截（`clearingRef` / 早期 return）
- 指针层用 CSS 拦截（视觉与 `disabled` 一致）：
  ```css
  .adl-prompt-modal [aria-disabled='true'] {
    opacity: 0.45;
    cursor: not-allowed;
    pointer-events: none;
  }
  ```
- 守卫用 **ref** 承载（`clearingRef`）而非 state：`closeConfirm` 的依赖数组才能是 `[]`，焦点陷阱 effect 仅依赖「对话框开合」→ 不会因 `clearing` 变化而 teardown/setup（重建瞬间的 cleanup 会把焦点归还到模态框背后）
- 打开时聚焦主操作按钮，关闭时把焦点归还触发按钮；**触发按钮可能已禁用**（如清空后无可见条目）→ 回退聚焦常驻可聚焦的兄弟控件

### 验证要求

`toBeDisabled()` / `disabled` 属性相关的**焦点行为断言在 jsdom 中恒真（不会失焦），必须用真实 Chromium（Playwright，`channel: msedge`）验证**；jsdom 断言只能锁「属性存在与否」，不能锁「焦点是否仍在模态框内」。

### 文档

- 实现示例：`frontend/src/app/features/clipboard-history/ClipboardHistoryHeader.tsx`（焦点陷阱 + `clearingRef` + 触发按钮禁用回退）
- 手册：[ui-manual/leftbar/clipboard-history.md](../../docs/operations/ui-manual/leftbar/clipboard-history.md)
- 知识沉淀：[clipboard-history-panel-rework-2026-09-17.md](../../docs/knowledge-base/interaction/clipboard-history-panel-rework-2026-09-17.md)

---

## 27. 危险操作 hover 色的特异性（Danger Hover Specificity）

### 概述

`.adl-icon-btn` 家族的 hover 基类为 `.adl-icon-btn:hover:not(:disabled)`（特异性 **0,3,0**），且 `regions/titlebar.css` 通过 `styles/index.css` 在**多数 region 文件之后**加载。因此形如 `.adl-icon-btn--danger-hover:hover`（0,2,0）的修饰类规则**会被静默覆盖成死规则**。

### 实现

- 修饰类必须提权到 ≥ (0,4,0) 且与加载顺序无关：
  ```css
  .adl-icon-btn.adl-icon-btn--danger-hover:hover:not(:disabled) {
    color: var(--danger);
    background: var(--danger-soft);
  }
  ```
- 颜色走主题 token（`--danger` / `--danger-soft`），不要用与主题无关的调色板（Tailwind `--color-red-*` 在暗色主题下背景近白）
- 同一模式也适用于其他共享类覆盖：本文件先于 `titlebar.css` 加载时，覆盖必须显式提权（如 `.adl-icon-btn.adl-clipboard__searchbtn`）

### 文档

- 知识沉淀：[clipboard-history-panel-rework-2026-09-17.md](../../docs/knowledge-base/interaction/clipboard-history-panel-rework-2026-09-17.md)
