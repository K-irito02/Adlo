# Refactoring / Architecture

架构级重构（模块分解、crate 拆分、Store/Hook 设计、Provider 架构）的经验与评估报告。

## 文件

| 文件 | 说明 |
|------|------|
| [browser-module-decomposition-2026-06-29.md](./browser-module-decomposition-2026-06-29.md) | 浏览器模块组件分解（BrowserPanel/Navigator 拆分、路径别名、React.lazy） |
| [center-tab-host-dual-singleton-2026-10-02.md](./center-tab-host-dual-singleton-2026-10-02.md) | 中心标签宿主：单例 Hook 双宿主化（浏览器池/终端 PTY、位置排他） |
| [component-extraction.md](./component-extraction.md) | ChangesPanel 组件提取到 patch-review 模块的渐进式内部组件模式 |
| [crate-split-and-dep-inversion-2026-06-08.md](./crate-split-and-dep-inversion-2026-06-08.md) | 第 38-39 轮重构执行报告（crate 依赖倒置、文件拆分、死代码清理） |
| [persisted-state-registry-lessons-2026-09-21.md](./persisted-state-registry-lessons-2026-09-21.md) | 右侧面板 UI 状态持久化：登记表 + 剪枝参照清单经验 |
| [provider-model-streaming-redesign-2026-07-07.md](./provider-model-streaming-redesign-2026-07-07.md) | Provider 注册 / Model 路由 / SSE 真实流式传输三项深度重构 |
| [terminal-fix-2026-05-22.md](./terminal-fix-2026-05-22.md) | 终端功能修复（状态管理统一、SSE 稳定、光标重叠与多窗口显示） |
| [terminal-pty-evaluation.md](./terminal-pty-evaluation.md) | `terminal` 与 `pty` 两个 Rust crate 职责边界的评估报告 |
