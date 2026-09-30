# 面板拖拽线（Resize Handle）被浏览器 WebView 覆盖问题 —— 2026-06-18

## 问题概述

Tauri 桌面模式下，浏览器原生子 WebView 覆盖了右侧面板的拖拽线（resize handle），导致：

1. **拖拽线不可见**：CSS `:hover` 无法触发，视觉线不显示
2. **无法拖拽**：`pointerdown` 事件被 WebView 拦截，`handleResizeStart` 无法执行
3. **浏览器/IDE 模式下**：z-index 不足（`z-index: 2`），灰色线被网页内容遮挡

## 问题根因

### Tauri 模式
WebView2 是 OS 级渲染表面，位于 HTML 层之上。右侧面板的 resize handle 位于右侧面板的左边缘，紧贴 WebView 区域——WebView 覆盖了 handle 的 hover/pointer 事件区域。

### 浏览器/IDE 模式
单纯的 CSS 层叠问题：`z-index: 2` 低于网页内容，`var(--border-strong)` 灰色视觉效果太弱。

## 解决方案

### 方案对比

| 方案 | 描述 | 最终状态 |
|------|------|---------|
| 隐藏 WebView | 鼠标靠近时移出画面 | ❌ 用户不接收网页消失 |
| 微缩 WebView | 缩进 6px 暴露 handle | ❌ 用户不接收 WebView 尺寸变化 |
| **✅ 区域逃逸** | handle 向左扩展 8px 进入中心区域 | ✅ 选定的最终方案 |

### 方案三详细说明：区域逃逸

将 resize handle 从"紧贴右侧面板左边缘"改为"向左扩展 8px 进入中心区域"。

```
┌──────────────────────────────────────────────────┐
│  中心区域 (无 WebView)      │  右侧面板           │
│                              │                    │
│                 │← 8px 扩展 →│← handle 6px →      │
│                 │◄─── 14px 触摸区域 ──►│          │
│                              │  ┊ (视觉线)        │
│                              │  ┊ left:8px=对齐0  │
│                              │  ┊ 颜色:text-sec   │
│                              │                    │
└──────────────────────────────────────────────────┘
```

- **`.adl-rightpanel__resize-handle`**：`left: -8px`，`width: 14px`（中心区域 8px + 面板内 6px）
- **`::before` 视觉线**：`left: 8px`（相对于 handle，对齐右侧面板左边缘）
- **颜色**：`var(--text-secondary)`（亮灰）
- **z-index**：`var(--z-tooltip)`（90，足够高于任何网页内容）
- **hover/active 宽度**：4px

### 核心原理

中心区域（`.adl-tool-primary`）不存在子 WebView。handle 的 8px 扩展部分落入中心区域，鼠标在此区域可正常触发 CSS `:hover` 和 `pointerdown` 事件。一旦点击开始拖拽，`setPointerCapture` 保证 handle 持续接收后续指针事件，即使鼠标移入 WebView 覆盖区。

## 关键文件

| 文件 | 变更内容 |
|------|---------|
| `frontend/src/styles/regions/rightpanel/files-panel.css` | resize handle 向左扩展 8px，z-index 提升到 `var(--z-tooltip)` (90)，颜色改为 `var(--text-secondary)`，直角设计 |
| `frontend/src/app/features/browser/useBrowserWebView.ts` | 无需任何 Tauri IPC 干预，纯 CSS 方案 |
| `frontend/src/styles/regions/rightpanel/files-navigator.css` | navigator handle 回缩至面板内（`right: -4px→0`，`width: 8px→12px`），z-index 2→10，颜色统一 |
| `frontend/src/styles/regions/leftbar.css` | 垂直 handle 5px→8px+外扩，水平 handle 6px→8px+外扩，圆角→直角，颜色统一 |
| `frontend/src/styles/regions/rightpanel/diff-viewer.css` | 圆角→直角，容器 6px→8px，颜色统一 |
| `frontend/src/styles/regions/rightpanel/editor-surface.css` | navigator 折叠态增加 `flex: 0 0 0`，释放 flex 空间 |
| `frontend/src/styles/regions/rightpanel/communication-workflows.css` | GitHub navigator 折叠态增加 `flex: 0 0 0` |

## 配套修改

### 一、拖拽线标准化统一

本次会话对项目中全部 **5 个拖拽线** 进行了标准化：

| 拖拽线 | 方向 | 容器 | 默认→hover 宽度 | hover 颜色 | 直角 | z-index |
|--------|------|------|----------------|-----------|------|---------|
| 左侧边栏 (leftbar) | 垂直 | 5px→**8px**，`right: -2px` | 1px→3px | `border-strong`→`var(--text-secondary)` | 是 | 10 |
| 对话面板 (leftbar) | 水平 | 6px→**8px**，`left/right: -2px` | 1px→3px | `border-strong`→`var(--text-secondary)` | **圆角→直角** | **2→10** |
| 右侧面板 (files-panel) | 垂直 | 14px | **2px→1px** / hover **4px→3px** | `var(--text-secondary)` | 是 | `var(--z-tooltip)` |
| 工具导航器 (files-navigator) | 垂直 | 6px→**8px** / `right: -4px`→`0`/**12px**（回缩至面板内） | 1px→3px | `border-strong`→`var(--text-secondary)` | 是 | **2→10** |
| 差异查看器 (diff-viewer) | 垂直 | 6px→**8px** | 1px→3px | `border-strong`→`var(--text-secondary)` | **圆角→直角** | 10 |

### 二、Navigator Resize Handle 位置修正

工具导航器的 resize handle 之前使用 `right: -4px; width: 8px`——右侧 4px 扩展到 `.adl-tool-primary`（浏览器 WebView 区域），被 OS 级 WebView2 覆盖，只有 navigator 内部 4px 可触发拖拽，难以触发。

**修复**：将 handle 完全放在 navigator 内部：
- `right: -4px` → `right: 0`（紧贴 navigator 右边界，不再向 WebView 扩展）
- `width: 8px` → `12px`（全部在 navigator 内，HTML 层，无 WebView 干扰）
- `::before` 从 `left: 50%; transform: translateX(-50%)` 改为 `left: auto; right: 0`（紧贴右边缘）

### 三、Navigator 折叠内容区域扩展修复

点击"右侧面板-切换左侧边栏"按钮折叠 navigator 后，内容区域（`.adl-tool-primary`）未向左展开。

**根因**：基础 CSS 规则中 `.adl-tool-surface--files > .adl-tool-navigator` 有 `flex-shrink: 0`，折叠状态只设了 `width: 0` 却没有取消 flex 收缩，导致 navigator 的逻辑空间仍然保留。

**修复**：在折叠状态增加 `flex: 0 0 0`，强制 flex item 的基础尺寸为零（2 个文件——`editor-surface.css` 和 `communication-workflows.css`）。grid 版本（`.adl-tool-surface.is-navigator-collapsed` 用 `grid-template-columns: 56px 0 minmax(0, 1fr)`）不受影响。

## 经验教训

### 1. 不是所有 WebView 覆盖场景都需要隐藏 WebView
WebView 是 OS 级渲染表面，但 HTML 元素可以通过改变自身位置来"逃出"WebView 覆盖区。利用中心区域无 WebView 的特点让 handle 部分扩展过去即可。

### 2. setPointerCapture 保证拖拽持续
一旦 `pointerdown` 被 handle 捕获（通过 `setPointerCapture`），即使后续鼠标移入 WebView 覆盖区，handle 仍然持续接收 `pointermove`/`pointerup` 事件。这是整个方案可行的关键。

### 3. 视觉线定位技巧
`::before` 的定位需要使用 `left: 8px`（相对于 handle 的 `-8px` 起始点），使得视觉线恰好对齐右侧面板的左边缘（绝对像素位置 0），看起来线贴在面板左边缘。

### 4. resize handle 的 z-index 需要足够高
浏览器/IDE 模式下网页内容通过 iframe 正常层叠，`z-index: 2` 被网页内容覆盖。提升到 `var(--z-tooltip)`（90）可以保证始终在网页之上。

### 5. 灰色线的可见性
`var(--border-strong)` 在宽灰背景上不够醒目，改为 `var(--text-secondary)`（亮灰/亮黑，视主题而定），配合 hover 时 4px 宽度，视觉上足够突出。

### 6. Flexbox 中隐藏元素需要同时修改 flex-basis
`width: 0` + `flex-shrink: 0` 不会真正释放 flex 空间。必须同时设置 `flex: 0 0 0` 覆盖 `flex-basis`（或 `flex-grow/shrink`），否则逻辑布局空间仍然保留，相邻元素无法扩展。grid 布局无此问题（grid 列宽是绝对的）。

## 后续演进（2026-09-30）：dsh 打破"区域逃逸"前提 → 透明桥接条

### 前提失效
区域逃逸成立的前提是"中心区无 WebView"。dsh 打开后，中心区 `DshHostRegion`（`.adl-app-host { inset: 0 }`）被 dsh WebView2 子窗口全覆盖；叠加浏览器侧边栏收起后浏览器 tab WebView2 贴到面板左缘（仅隔 1px border），14px 命中带两侧全灭，仅剩顶栏 ToolSwitcher 行约 40px×6px 可达——"很难触发拖拽"。拖拽一旦起手即正常（ResizeObserver→bounds 镜像自动跟随），难点只在第一次抓取。

### 方案对比

| 方案 | 描述 | 最终状态 |
|------|------|---------|
| 常驻 DOM 沟槽 | dsh 容器右缩 8px + 浏览器主容器左缩 6px，露出真实分隔条；bounds 镜像自动跟随，零 Rust/IPC 改动（commit `741c5057` 留档） | ❌ 功能成立，用户否决视觉（两侧间隙） |
| **✅ 透明桥接条** | 接缝上架 6px 全高透明子 WebView（`adl-divider-strip`），同层夺回命中权，只回传 X 增量，主窗口复用既有几何逻辑；双 WebView 全幅零间隙（commit `fd3802fe`） | ✅ 当前方案 |

### 桥接条关键设计
- **z-order**：`add_child` 新子窗口天然最上层；兄弟窗口（重）建会盖住条 → store 瞬态 `siblingWebviewNonce`（dsh open / tab 建窗双 bump 点）驱动销毁重建回到最上层。
- **拖拽协议自愈**：条页 `seq` 按文档重置，主窗口 show 成功即重置 `lastSeq`（否则重建后首轮拖拽被保序守卫误杀）；`end` 自带尾帧位移，关闭 move/end 乱序窗口。
- **主题/语言/无障碍**：条页零硬编码，主题色与 aria-label 经 init script 注入（`serde_json::to_string` 转义）；主题实值比较后才重建（`<html>` 内联抖动不重建）。
- **命令**：`divider_strip_show/set_bounds/hide/drag`（async + `run_on_main_thread` 惯例；`drag` 校验后 `app.emit` 转交主窗口），4 端 bridge 同步（Tauri 实现 + preview/mock/http no-op）。

### 新增经验
1. **命中权问题必须在 OS 窗口层解决**：布局层让位（沟槽）功能可修复但可能付出视觉代价，先确认美学约束再选层。
2. **跨文档序号必须配代际重置**：子页面重建会重置本地计数器，主窗口保序守卫须在重建点同步重置，否则"安全修复"制造新假死。
3. **快照基线决定复审有效性**：`git diff <range>` 看不见未提交改动，复审快照必须用工作区级 diff，否则复审结论无证据。
