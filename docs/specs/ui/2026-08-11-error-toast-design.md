# 报错 Toast 设计（替换全局 error 横幅）

- 日期：2026-08-11
- 状态：已获用户批准（分节评审通过）

## 背景与目标

当前所有操作失败经 `captureError()`（约 30 个 action 模块调用）把 `[CODE] message` 写入全局 `error` 单字符串状态，由 `App.tsx:182-186` 渲染为顶部固定横幅 `adl-banner--error`。该横幅没有关闭按钮、不消失、一条报错覆盖前一条。

目标：报错改为**右下角、不自动消失、可折叠/展开**的 toast，支持叠加、条数上限与清空；并保留复制完整报错信息的能力。

## 范围

- **仅替换全局 error 横幅**。现有顶部居中、自动消失的成功/警告 toast（`toastSlice` + `Toast.tsx` / `toast.css`）完全不动。
- 所有 `captureError` 入口（全部现存 action 模块 + `generalActions.ts:72` 启动失败路径）改为入队。

## 方案：独立错误 toast 切片 + 独立组件

### 1. 数据模型与 Store

新增切片 `ErrorToastSlice`（挂入现有 35 切片合并机制 `slicedStore.ts`）：

```ts
interface ErrorToastEntry {
  id: string;      // createUiId('error-toast')
  code: string;    // 例如 'WORKSPACE_ERROR'；无 code 时为 ''（回退通用标题）
  detail: string;  // 完整报错 message
}

interface ErrorToastSlice {
  errorToasts: ErrorToastEntry[];
  reportError: (code: string, detail: string) => string; // 入队并返回 id
  dismissErrorToast: (id: string) => void;
  clearErrorToasts: () => void;
}
```

接线改造：

- `cacheHelpers.captureError(get, error)`：解析 `AppError` / `{code,message}` / 普通错误 → 提取 `code`（无则 `''`）与 `detail`（原始 message），调 `get().reportError(code, detail)`。
- `cacheHelpers.clearError(get)`：改为 `get().clearErrorToasts()`（沿用"每次操作开始前清掉上次报错"的既有语义）。
- `generalActions.ts:72`：`set({ loading: false, error: ... })` 改为 `captureError(get, appInfoResult.error)`。
- 删除 `uiSlice` 的 `error`/`setError`（含 `uiSliceTypes.ts` 对应字段）。
- 删除 `App.tsx:182-186` 横幅，新增细粒度订阅 `const errorToasts = useAppStore((state) => state.errorToasts)`。
- `loadingPerformance.test.ts:47` 断言从 `useAppStore((state) => state.error)` 改为 `useAppStore((state) => state.errorToasts)`（保持"根组件细粒度订阅"守护意图）。

> 已有验证：`httpBridge.ts:623` 读取的是 bash tool 执行记录的 `state.error`，与全局 store 无关，不受影响。

### 2. 组件与视觉

新文件 `frontend/src/app/components/ErrorToast.tsx`：

- `ErrorToastContainer`：`createPortal` 到 `document.body`；`position: fixed`，`right`/`bottom: var(--space-5)`；`z-index: var(--z-toast)`；`flex-direction: column-reverse`（最新一条贴底向上叠）；`max-width: 400px`；父容器 `pointer-events: none`，子项 `pointer-events: auto`。
- 单条外观：`--surface-elevated` 背景 + `backdrop-filter: blur()` + `--border-subtle` 细边框 + `--shadow-lg`；圆角 `--radius-md`（小弧度直角，非 `rounded-2xl`）；内容区左图标（`alert-octagon`，色 `--color-danger`，继承 `currentColor`）+ 右侧标题（`font-semibold`）+ 详情正文（完整 message 自动换行，超长路径 `break-all`）。
- 右上角按钮区（从左到右）：折叠/展开（`chevron-down`/`chevron-up`）→ 复制（`copy`）→ 关闭（`close`）。透明小圆钮，hover 加深。
- 默认展开；折叠态仅显示图标 + 标题 + 详情单行省略截断，按钮区常驻。
- 展开态：组件内 `useState<Record<string, boolean>>` 本地管理（默认全展开），不进全局状态。
- 动画：`motion`（v12，已有依赖）淡入 + 上移 + 轻微缩放；关闭经 `AnimatePresence` 淡出后再从数组移除。
- 标题渲染期解析：`useTCopy` 按 `code` 查 `errors.titleByCode[code] ?? errors.genericTitle`（store 不依赖 i18n）。
- 复制：复用既有 `copyToClipboard` 工具复制完整 `detail`；点击后按钮短暂显示"已复制"（transient，不常驻）。

上限与摘要：

- 同时显示前 5 条；超出部分在堆顶渲染一条紧凑摘要 chip：「还有 N 条 · 清空全部」，N 用 `formatT` 插值；清空全部 → `clearErrorToasts()`。
- 单条各自可关闭。

### 3. i18n

- 新增领域 `errors`（zh-CN / en-US 双份），注册进 i18n index 与 keys 奇偶校验测试。
- `titleByCode`：覆盖现有 `errorCodeMap` 全部类型（WORKSPACE_ERROR→"工作区错误"、NOT_FOUND→"未找到"、STORAGE_ERROR→"存储错误" 等约 15 个 + `genericTitle`"操作失败"兜底）。
- 按钮文案 key：折叠/展开、复制、已复制、关闭、还有 N 条、清空全部、测试按钮文案。

### 4. 开发模式测试按钮

- 新组件 `DevErrorTestButtons`：`import.meta.env.DEV` 时挂载（生产构建剔除），固定左下角（避开右下角报错区）。
- 两个按钮各控制一个模拟状态：
  1. 「注入测试报错」：每点一次入队一条（逐条叠加，观察条目动画与折叠态）。
  2. 「批量注入 7 条」：一次入队 7 条（观察 5 条上限 + 摘要 + 清空全部）。
- 模拟数据用真实 code + 长 message（含 git fatal 示例、超长路径）以观察换行/截断。

### 5. 双端一致性

纯前端改动，无新增 Tauri Command / capability，Tauri 桌面与浏览器模式行为一致。

### 6. 测试

- `errorToastSlice` 单元测试：report / dismiss / clear。
- 更新 `captureTypedError.test.ts`：校验入队条目的 code/detail。
- `ErrorToast` 组件测试：默认展开、折叠切换、复制（mock clipboard）复制完整 detail、关闭移除、≥6 条出现摘要与清空全部、未知 code 回退通用标题。
- `loadingPerformance.test.ts` 断言更新。
- i18n keys 奇偶校验纳入新领域。

## 验收标准

- 手动触发任意操作失败（如打开非 git 工作区），报错以右下角 toast 出现，不自动消失。
- 折叠/展开、复制、关闭、清空全部均可用且文案国际化。
- 6+ 条时显示 5 条 +「还有 N 条」摘要。
- 开发模式左下角两个测试按钮可用；生产构建无此 UI。
- Tauri 与浏览器模式表现一致。
- `pnpm --dir frontend run test` / `lint` / `tsc --noEmit` 全绿。