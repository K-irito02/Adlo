# Error Toast 持久错误通知：三级分级、模块作用域、popLayout 动画

> 2026-08-12 — 右下角持久错误通知（error toast）完整实现与优化中沉淀的可复用经验。
>
> **更新（2026-08-16）**：ErrorToast 已统一为复用 `ToastCard` 外壳 + 单一 `ToastRegion` 区域容器；「经验 3 popLayout」中"各 toast `layout`"已变更——**卡片级不再设 `layout`**（避免折叠时 framer 全卡 FLIP 缩放抖动，卡片增删时兄弟瞬间就位为已知取舍，仅摘要卡保留 layout）；`error-toast.css` 已删除（样式迁移至 `toast-card.css`）。见 [toast-card-unification-hover-collapse-2026-08-16.md](./toast-card-unification-hover-collapse-2026-08-16.md)。

## 背景

应用需要"持久"的错误提示：错误发生后出现在右下角，不自动消失，由用户手动关闭/清空，与顶部临时 toast（自动消失）分离。实现过程中涉及三类关键设计决策。

## 经验 1：三级分级（error / warning / info）

### 方案

按错误码语义集中分配级别，未知 code 默认 error：

- **error**（红 `#dc2626` 亮色 / `#eb7153` 暗色）：STORAGE / MIGRATION / SECURITY / PATCH / MODEL / NETWORK / INVOKE / INTERNAL / IO / CONFIG / TERMINAL
- **warning**（黄 `#b45309` 亮色 / `#f09c42` 暗色）：NOT_FOUND / INVALID_INPUT / APPROVAL_REQUIRED / WORKSPACE_ERROR（默认）
- **info**（普通色）：WORKSPACE_ERROR 且 detail 含 `not a git repository`（特例降级）

纯函数 `resolveErrorToastLevel(code, detail)` 放在组件就近模块，按 `(code, detail)` 判定。

### 教训

1. **对比度需按主题独立验证**：亮色主题 `#eb7153`/`#f09c42` 在 `#fafafa` 卡片背景上仅 2.1~2.9:1，不达 WCAG AA（≥4.5:1）。亮色改用 `#dc2626`（4.63:1）与 `#b45309`（4.81:1）；暗色保持原值（5.99:1 / 8.14:1）。**颜色必须分主题验证对比度**，不能只在暗色下目测。
2. **info 级用 `role="status"` + `aria-live="polite"`**，error/warning 用 `role="alert"` + `aria-live="assertive"`，避免普通通知打断读屏。
3. **info 标题不用"xx错误"**：新增 `errorsInfo`（Notice/提示）作为级别专用标题，与 code→标题映射分离。

## 经验 2：模块作用域（scope）清除

### 问题

操作入口 `clearError()` 清空整个队列，导致用户打开文件时模型/git 等无关错误被静默清掉，且各模块行为不一致。

### 方案（用户确认）

按 action 模块作用域隔离：

- `ErrorToastEntry` 加可选 `scope?: string`
- `reportError(code, detail, scope?)` / `captureError(get, error, scope?)` 记录来源模块
- `clearError(get, scope?)` / `clearErrorToasts(scope?)`：scope 提供只清该模块，缺省清全部
- 27 个 action 模块各定义 `const SCOPE = '模块名'`，调用点统一传参

### 教训

1. **scope 判断用 `!== undefined` 而非 truthiness**：空串是合法 scope 值，`scope ? ... : ...` 会导致空串不存储且清除时匹配不到（report/clear 两侧语义不一致）。
2. **机械重构用脚本批量替换后必须验证**：27 文件批量替换易漏插 SCOPE 常量定义（本案例 `editorActionsHelpers.ts`/`workspaceLifecycleActions.ts` 被漏掉），用 `tsc --noEmit` 兜底发现。
3. **持久队列需加 store 级上限**：`ERROR_TOAST_STORE_LIMIT = 50`，UI 只显示 5 条 + 摘要，store 保留更多供关闭后补位。

## 经验 3：popLayout 让位动画

### 问题

AnimatePresence 默认 sync 模式下，退出元素仍占 flex 布局空间：新 toast 出现时最旧的消失但摘要被顶起再回落，关闭中间一条出现空位且摘要跟着移动。

### 方案

`<AnimatePresence mode="popLayout">` + 各 toast `layout`：

- 退出元素立即脱离布局流（绝对定位），上方 toast 经 layout 平滑整体下移让位，摘要位置不动
- 关闭时不留空位，其余元素平滑补位
- `ErrorToast` 组件需 `forwardRef`（popLayout 测量依赖 ref）

### 教训

1. **popLayout 硬性要求**：子组件需 `forwardRef`、key 唯一、子节点为 AnimatePresence 直接子元素、容器有定位上下文（`position: fixed`）。审查时这些"必要代码"不能被误判为防御性代码清理掉。
2. **摘要图标与 toast 图标尺寸统一**：避免 sm/md 混用导致视觉不一致。

## 相关文件

- 组件：`frontend/src/app/components/ErrorToast.tsx`、`errorToastLevel.ts`、`ToastCard.tsx`（统一外壳）
- 切片：`frontend/src/app/stores/slices/errorToastSlice.ts`
- 样式：`frontend/src/styles/components/toast-card.css`（原 error-toast.css 已删除）、`themes.css`
- i18n：`errors.ts`（en/zh）
