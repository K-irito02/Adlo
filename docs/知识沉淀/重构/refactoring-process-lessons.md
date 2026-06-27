# 重构过程经验教训汇总

> 从 [REFACTORING_PROGRESS_REPORT.md](../../重构洞察/REFACTORING_PROGRESS_REPORT.md) 中提取的经验教训，按重构轮次组织。

---

## 第三十轮（2026-06-03）：浏览器面板 WebView 可见性治理

1. **跨平台 GUI 编程要区分 HTML 元素层和 OS 窗口层** — Tauri 原生 WebView 是 OS 子窗口，不受 CSS 控制，必须通过 IPC 命令管理。

2. **React prop 链比 Zustand selector 更可靠** — 在涉及 `display: none`、`React.memo`、`hidden` 属性的组件树中，保证子组件收到更新的最可靠方式是将关键状态作为 prop 传递。

3. **Windows 窗口管理的历史包袱** — `SetWindowPos` 对 `WS_CHILD` 窗口的负坐标钳制持续影响了 30 年的 Win32 应用开发，使用正值大偏移量可规避。

4. **AB 问题的典型诱因是方案选择不当** — 多次在两个方案（hide/show vs 离屏）间切换，本质是 Tauri 子 WebView 不支持 hide/show，需要选择能稳定工作的第三方案（正值离屏 + prop 化 + 守卫）。

---

## 第二十九轮（2026-06-02）：浏览器面板计数重叠修复 + 溢出裁切体系统一

1. **CSS 的 `:focus-within` 副作用**：在可点击的子元素上使用 `:focus-within` 会引入永久性的状态锁定，用户点击后聚焦不主动退出，计数永久消失。交互态显隐应优先用 `:hover`。

2. **`absolute` 定位不参与 flex 布局**：脱离文档流的元素不响应 flex 容器的 `gap` 和 `align-items`，通过 `right` 定位需要精确计算环境变量（padding、border、margin），误差累积难以维护。flex 流 + `flex-shrink: 0` 更稳定。

3. **CSS 继承的隐性依赖**：`text-overflow` 在基类中定义为 `ellipsis`，子类覆盖非统一时出现碎片化。本次将三层 CSS（基类→顶级→子级）统一为 `clip`，消除未来出问题的断点。

---

## 第二十七轮（2026-06-02）：浏览器标签树计数优化

1. **CSS 像素级对齐必须用 DevTools 实测验证**：理论计算的"right: 16px"看似合理但实测有 4px 偏差，因为 `box-sizing: border-box` + `width: calc(100% + 4px)` + `margin-inline-start: -4px` 的组合让行实际只向左扩展、不向右扩展。最终用 `getBoundingClientRect().right` 验证后改为 `right: var(--space-3)` 才精确对齐。

2. **JSX 条件渲染的 `0` 陷阱**：`{count ? ... : null}` 会丢失合法的 `0`。TreeNodeRow 修复为 `count !== undefined && count !== null`，确保空目录也显示 "0"。

3. **数据 vs 渲染分层**：`useBrowserTreeData` 的 `counts: Map<path, number>` 是数据层（只存 directory 节点），`resolveChildCount` 是渲染层（file 节点返回 null 跳过渲染）。两层职责清晰分离后，单测覆盖也变简单。

4. **CSS override 禁用继承的副作用**：`.adl-browser-entry__tree .adl-filetree__label { overflow: visible }` 在过去某个需求中被加上，但未在移除理由上留痕，导致长名溢出和计数重叠。重构时要明确每个 override 的存在理由。

---

## 第十八轮（2026-05-29）：重构洞察全面修复

1. **react-window 不适用于树形 CSS**：递归 `<ul>` 渲染的树形连接线依赖 DOM 层级结构。react-window 的扁平列表破坏了 CSS 选择器。改用 `content-visibility: auto` 实现等价性能提升而不改 DOM 结构。

2. **Rust 内部可见性**：`pub(crate)` 在不同 crate 间不生效（如 `adl-storage` 的 `pub(crate)` 对 `src-tauri` 不可见），需改为 `pub`。

3. **CSS Token 值一致性**：`--bg-card` 和 `--surface-raised` 值不完全一致（差 4 度白），统一命名前需确认设计意图。

4. **Mutex→RwLock 迁移范围广**：涉及 15+ 处 `.lock()` 调用点，需逐一确认读写模式。显式区分 `.read()` 和 `.write()` 后获得正确性保证。

5. **前端文件迁移风险**：`ui-store.ts`（12 consumers）和 `types.ts`（16 consumers）的迁移需逐文件验证 `tsc --noEmit`。批量移动文件的策略是：移动 → `tsc` 获取错误列表 → 逐文件修复。

> 完整重构进度见 [REFACTORING_PROGRESS_REPORT.md](../../重构洞察/REFACTORING_PROGRESS_REPORT.md)
