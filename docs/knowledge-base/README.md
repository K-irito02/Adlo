# Knowledge Base

本目录集中管理全项目的**总结性知识**与**经验教训**，按内容主题（领域/子主题）分类维护，不按时间归档。

## 组织原则

- **按内容归类**：同类知识/经验教训归入同一子主题目录（如浏览器 favicon 经验统一在 `browser/favicon-meta/`），不按 `2026-XX/` 月份拆分
- **同名同系列文件合并**：文件名几乎相同、同一批次的系列文件（如 `refactoring-insight-execution-*`、`diff-viewer-gutter-hover-*`）合并为单一文件
- **细分触发**：某目录文件过多（> 15）或出现清晰子主题时，再进一步细分归纳
- **文件名**：`topic-description-YYYY-MM-DD.md`，日期后缀仅作为经验来源标记，不作归档维度

## 目录结构

| 目录 | 内容 | 文件数 |
|------|------|--------|
| [browser](./browser/) | 内置浏览器实现与修复（导航、标签、书签、下载、favicon/元数据、历史、WebView 嵌入） | 54 |
| [interaction](./interaction/) | 跨功能面板交互/UX 修复（GitHub 面板、终端、检索、Git 可视化、指针事件、toast） | 46 |
| [refactoring](./refactoring/) | 重构方法论、执行记录与架构改进（process / store-ui / architecture） | 25 |
| [code-quality](./code-quality/) | 代码质量检测与修复、工具链门禁（diff-viewer / git-vis-charts / toolchain-lint / 审计） | 33 |
| [multi-workspace](./multi-workspace/) | 多工作区开发中的变更面板、文件树、终端、布局等经验 | 15 |
| [ci-monitoring](./ci-monitoring/) | GitHub Actions CI 状态监控模块经验（按目录独立绑定、Token 持久化、日志隔离） | 7 |
| [tauri-backend](./tauri-backend/) | Tauri 命令性能、Rust 异步模式、主线程阻塞、serde JSON 等后端经验 | 9 |
| [toolchain](./toolchain/) | 开发工具链与环境配置经验（Git、Node、Rust、技能体系演进等） | 5 |
| [logging](./logging/) | 日志系统统一改造经验（OpenOptions 权限、ANSI 控制、双端一致性） | 2 |

## 索引

### Browser

→ [browser/README.md](./browser/README.md)

- `navigation/` — URL 导航、地址栏、落地页、SPA 导航与后退（11）
- `tab-management/` — 标签页创建/菜单/已打开标签（4）
- `bookmark/` — 书签对话框、去重、文件夹删除清理（6）
- `download/` — 下载链路、URL 检测与临时文件清理（3）
- `favicon-meta/` — favicon/标题/站点元数据同步与缓存（12）
- `history/` — 历史记录写入、导航与标签删除（4）
- `webview-embed/` — WebView 池、iframe 嵌入、覆盖层级（7）
- 根目录 — 综合参考（内置浏览器实现、链接拦截、树/子目录修复等）

### Interaction

→ [interaction/README.md](./interaction/README.md)

- `github-panel/` — GitHub CI 面板 UI/菜单/对话框/i18n（8）
- `terminal/` — 终端面板交互（多窗口窗格/布局引擎/自定义布局卡片、悬停菜单、xterm 滚动条）
- `search/` — 检索交互、加载态、设置弹窗（4）
- `git-vis/` — 分支图、热力图、文件热点、loading（5）
- `outline-file-tree/` — 大纲树与文件树连接线/导航（3）
- `pointer-events/` — 指针事件、命中区、拖拽、右键菜单（5）
- `toast-hint-card/` — toast、错误提示、hint card（5）
- 根目录 — 综合（i18n、对话框、状态栏、动画、剪贴板历史等）

### Refactoring

→ [refactoring/README.md](./refactoring/README.md)

- `process/` — 方法论、执行记录、阶段性总结（含 insight-execution 汇编与 2026-05 总结汇编）（12）
- `store-ui/` — Store 迁移、主题统一、UI 恢复（5）
- `architecture/` — crate 拆分、模块分解、终端/持久化架构（7）

### Code quality

→ [code-quality/README.md](./code-quality/README.md)

- `diff-viewer/` — 差异查看器修复（含 gutter-hover 汇编）（4）
- `git-vis-charts/` — 图表/热力图/echarts-visx 迁移/ChartBrush（9）
- `toolchain-lint/` — ESLint/Prettier/Clippy/rustfmt 门禁与工具链（6）
- `opencode-phase2-audit/` — 参考实现对照与 Phase 2 审计修复（6）
- 根目录 — [frontend-render-pitfalls-2026-10-18.md](./code-quality/frontend-render-pitfalls-2026-10-18.md)（`dangerouslySetInnerHTML` 内联字面量导致每次渲染重写 DOM / 变量驱动主题换肤 / 诊断纪律）

### Multi-workspace

| 文件 | 说明 |
|------|------|
| [changes-panel-alignment-fix.md](./multi-workspace/changes-panel-alignment-fix.md) | 变更面板文件行对齐优化 |
| [changes-panel-stats-button-alignment-fix-2026-06-07.md](./multi-workspace/changes-panel-stats-button-alignment-fix-2026-06-07.md) | 变更面板统计按钮居中 + TS 导入大小写修复 |
| [changes-terminal-panel.md](./multi-workspace/changes-terminal-panel.md) | 变更面板与终端面板重构 10 条经验 |
| [component-split.md](./multi-workspace/component-split.md) | Phase 3 组件拆分（Rust 异步模式、拆分策略） |
| [file-selection-fix.md](./multi-workspace/file-selection-fix.md) | 文件选择修复经验 |
| [file-tree.md](./multi-workspace/file-tree.md) | 多工作区文件树 11 条经验 |
| [interactive-terminal.md](./multi-workspace/interactive-terminal.md) | 交互式终端讨论总结 |
| [large-file-diff-degradation-2026-10-14.md](./multi-workspace/large-file-diff-degradation-2026-10-14.md) | 超大变更文件差异渲染：挂载成本、双侧取大门、plain 降级、fold 轮询风暴 |
| [search-workspace-binding-2026-10-14.md](./multi-workspace/search-workspace-binding-2026-10-14.md) | 文件检索工作区绑定、命中显式打开、ripgrep 式大文件检索、覆盖锚重定 |
| [stats-fix.md](./multi-workspace/stats-fix.md) | 多工作区统计修复经验 |
| [terminal-binding.md](./multi-workspace/terminal-binding.md) | 终端工作区绑定改进经验 |
| [terminal-profile.md](./multi-workspace/terminal-profile.md) | 终端默认配置修复（PTY 通信、SSE 同步、配置持久化） |
| [tree-layout-alignment.md](./multi-workspace/tree-layout-alignment.md) | 文件树布局对齐经验 |

### CI monitoring

| 文件 | 说明 |
|------|------|
| [ci-module-lessons-2026-06-09.md](./ci-monitoring/ci-module-lessons-2026-06-09.md) | CI 模块 15 条经验（Token 安全、GitHub API、内存保护） |
| [ci-to-communication-refactor-and-log-viewer-2026-06-10.md](./ci-monitoring/ci-to-communication-refactor-and-log-viewer-2026-06-10.md) | CI→通信面板重构 + CI 日志查看器 |
| [github-ci-tree-interaction-2026-06-10.md](./ci-monitoring/github-ci-tree-interaction-2026-06-10.md) | CI 树形目录交互重构（FileTree 集成、RenameDialog 标准化） |
| [ci-panel-help-system-2026-06-13.md](./ci-monitoring/ci-panel-help-system-2026-06-13.md) | CI 面板帮助系统增强 |
| [github-ci-per-directory-binding-2026-06-14.md](./ci-monitoring/github-ci-per-directory-binding-2026-06-14.md) | CI 按目录独立绑定（共享 state 污染、日志持久化、Rate Limit 保护） |
| [github-title-path-header-fix-2026-06-14.md](./ci-monitoring/github-title-path-header-fix-2026-06-14.md) | GitHub 标题路径提示行修复 |

### Tauri backend

| 文件 | 说明 |
|------|------|
| [tauri-sync-command-blocking-2026-07-14.md](./tauri-backend/tauri-sync-command-blocking-2026-07-14.md) | Tauri 同步命令阻塞主线程根因修复（async + spawn_blocking 模式） |
| [serde-json-null-vs-absent-2026-08-06.md](./tauri-backend/serde-json-null-vs-absent-2026-08-06.md) | serde JSON null vs 缺省 |
| [keyring-v3-no-default-backend-2026-08-07.md](./tauri-backend/keyring-v3-no-default-backend-2026-08-07.md) | keyring v3 无默认后端 |
| [third-party-api-casing-and-preview-parity-2026-08-07.md](./tauri-backend/third-party-api-casing-and-preview-parity-2026-08-07.md) | 第三方 API 大小写与预览模式一致性 |
| [dsh-port-reclaim-and-process-kill-2026-09-06.md](./tauri-backend/dsh-port-reclaim-and-process-kill-2026-09-06.md) | dsh 端口回收与进程清理 |
| [branch-graph-lane-algorithm.md](./tauri-backend/branch-graph-lane-algorithm.md) | 分支图泳道算法 |
| [handwritten-json-key-casing-2026-09-26.md](./tauri-backend/handwritten-json-key-casing-2026-09-26.md) | 手写 JSON 键名必须与 TS 类型逐键对齐（附键名存在性断言测试） |
| [storage-status-ui-thread-hang-2026-10-20.md](./tauri-backend/storage-status-ui-thread-hang-2026-10-20.md) | 设置面板打开即卡死：storage 同步命令在 UI 线程遍历 6 万文件 + 诊断心跳重 arm 防抖 |

### Toolchain

| 文件 | 说明 |
|------|------|
| [git-schannel-revocation-check-fix-2026-07-21.md](./toolchain/git-schannel-revocation-check-fix-2026-07-21.md) | Git for Windows Schannel 证书吊销检查导致推送超时 |
| [git-proxy-port-mismatch-fix-2026-07-30.md](./toolchain/git-proxy-port-mismatch-fix-2026-07-30.md) | git 代理端口 7890 与 VPN 实际 17890 不一致 |
| [tauri-dev-stale-exe-lock-2026-08-16.md](./toolchain/tauri-dev-stale-exe-lock-2026-08-16.md) | Tauri dev 模式残留进程锁定 exe 导致修改不生效 |
| [skill-system-retirement-2026-10-24.md](./toolchain/skill-system-retirement-2026-10-24.md) | 技能系统精简与文档真源化：三技能退役并入 `root-cause-to-close`、产物归档、说明集中到 `SKILLS.md` |
| [wdio-tauri-desktop-e2e-eval-2026-10-28.md](./toolchain/wdio-tauri-desktop-e2e-eval-2026-10-28.md) | 桌面端 E2E 实测：`@wdio/tauri-service` 跑通 5 条真机冒烟（~0.2s/用例），集成成本与踩坑清单，结论可行但 opt-in |

### Logging

| 文件 | 说明 |
|------|------|
| [log-system-lessons.md](./logging/log-system-lessons.md) | 日志系统统一改造经验（OpenOptions 权限、ANSI 控制、FormatTime、双端一致性） |
