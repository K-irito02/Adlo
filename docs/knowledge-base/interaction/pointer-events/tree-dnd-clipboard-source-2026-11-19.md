# 文件导航树拖拽与跨工作区剪贴板（2026-11-19）

文件面板多工作区树接入「放入 / 插入」拖拽与跨工作区复制/剪切时踩到的四个坑。

## 1. 抬起副本要克隆整行 `<li>`，且不能放大

- 现象：副本比侧栏行宽、文件图标离左边缘的距离与源行不一致。
- 根因：克隆的是行内 `.adl-tree-node__row`，`:li` 上的内联 `--adl-tree-indent` / `--adl-tree-row-offset` 与行宽都丢了；同时复用了书签树的 `translateY(-2px) scale(1.03)`。
- 修法：文件树路径克隆整个 `<li>`（克隆体里移除嵌套子树），并加 `.adl-browser-dnd-lift--tree` 覆盖为 `translateY(-2px)`（不放大）。验收用 `getBoundingClientRect().width` 与 `getComputedStyle(li).getPropertyValue('--adl-tree-indent')` 对齐源行。

## 2. 右键菜单项 id 是契约：复制是 `copy-op` 不是 `copy`

- 现象：跨工作区「复制 → 粘贴」报 `source not found`，而「剪切」正常。
- 根因：右面板通用菜单里「复制」的 id 是 `copy-op`（「复制完整路径」是 `copy-full-path`），按 `copy` 包装来源工作区的钩子从未命中；剪贴板缺少来源工作区，粘贴按目标根解析源路径。
- 修法：包装器同时匹配 `cut` / `copy-op`，并把绑定抽成纯函数（`bindWorkspaceClipboard`）+ 用例「复制菜单项记录来源工作区」。凡是按 id 改写菜单 action 的地方，先核对真实 id 并加调用级用例。

## 3. 同区粘贴失败必须保留剪贴板 —— action 要返回 boolean

- 现象：目标已存在时弹了错误 toast，但剪贴板已被清空，用户要重新剪切。
- 根因：`moveWorkspaceFile` / `duplicateWorkspaceFile` 返回 `Promise<void>` 且失败只 `captureError`，粘贴方无法区分成功/失败，只能无条件清空。
- 修法：两个 action 改为返回 `Promise<boolean>`（与跨区命令同口径），粘贴方只在 `true` 时 `clearClipboard()`；拖拽同理，移动失败不再写目录顺序。补「同区失败保留剪贴板」用例。

## 4. 吸顶标题会盖住定位/聚焦滚动

- 根因：标题 `position: sticky; top: 0`（34px），滚动容器顶部 padding 归零后，`scrollIntoView({block:'nearest'})` 会把 28px 行停在被标题完全遮挡的位置。
- 修法：给**行**加 `scroll-margin-top: 34px`（`li[data-path]`）。真机实测：目标行落点 34px（紧贴标题下沿）、聚焦吸顶标题按钮 `scrollTop` 增量 0。
- **不要**用容器 `scroll-padding-top`：它作用于整个滚动口，聚焦吸顶标题内的按钮时 Chromium 会按居中补偿，实测每次 focus 上跳约 150px 且可累加。行级 `scroll-margin` 只影响目标行本身。

## 相关

- 放置反馈与副本规范：[docs/design-system/drag-drop-feedback.md](../../../design-system/drag-drop-feedback.md)
- 变更面板最终**不支持**拖拽（只共享目录显示顺序），避免与 git 派生视图语义混淆。
