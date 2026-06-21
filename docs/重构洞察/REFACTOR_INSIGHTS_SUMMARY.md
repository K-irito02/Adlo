# 重构洞察汇总

> 本文档合并了 2026-05-21 至 2026-06-19 期间所有每日重构洞察报告的核心发现。
> 各轮执行的详细结果见 [REFACTORING_PROGRESS_REPORT.md](./REFACTORING_PROGRESS_REPORT.md)。
> 提炼的经验教训见 [../知识沉淀/重构/](../知识沉淀/重构/)。

## 按日期索引

| 日期 | 发现数 | 状态 | 主要领域 |
|------|--------|------|----------|
| 2026-05-21 | 21 | ✅ 已解决 | 类型安全、IPC 错误处理、Store 拆分、缓存优化 |
| 2026-05-22 | 20 | 🔄 部分解决 | Store 体积、桥接层拆分、搜索性能、文件遍历 |
| 2026-05-23 | 37 | 🔄 部分解决 | App 选择器重渲染、巨型组件拆分、Rust 依赖清理 |
| 2026-05-23-2 | 22 | 📋 待处理 | 双 Store 架构、重复 Slice 字段、CSS 巨型文件 |
| 2026-05-24 | 11 | 🔄 部分解决 | Storage SQL 模板、Mutex 中毒、preview-bridge 类型安全 |
| 2026-05-25 | 32 | 📋 待处理 | 组件规模超标（7 个 >500 行）、CodeMirror 全量加载、消息无虚拟化 |
| 2026-05-27 | 32 | 📋 待处理 | 双 Store 割裂（27 文件引旧 Store）、CSS 文件 2486 行、代码重复 |
| 2026-05-28 | 22 | ✅ 已解决 | App 逻辑提取 Hook、action 刷新链统一、Rust crate 拆分 |
| 2026-05-29 | 12 | 🔄 部分解决 | 消息虚拟化、文件缓存、依赖裁剪 |
| 2026-05-30 | 11 | 🔄 部分解决 | 清理 @deprecated 代码、统一 MessageStream 组件 |
| 2026-05-31 | 11 | 🔄 部分解决 | ui-store 清理、localStorage 工具统一、react-window 集成 |
| 2026-06-01 | 26 | 📋 待处理 | locations/ 死代码、app/ 根层级文件散落、Rust 锁优化、CSS Token 体系 |
| 2026-06-03 | 32 | 🔄 部分解决 | 死代码清理、Crate 依赖倒置、微 crate 合并、前端测试覆盖率 5.6% |
| 2026-06-05 | 37 | 📋 待处理 | ui-store 迁移不彻底、Rust 巨型函数、CSS 超阈值文件、React.memo 缺失 |
| 2026-06-07 | 6 | ✅ 已解决 | ui-store 完全删除、10 组件迁移、Rust 函数拆分 |
| 2026-06-08 | 25 | 🔄 部分解决 | browser 组件膨胀、CSS !important 回归、Rust 模块化完成 |
| 2026-06-09 | 18 | 📋 待处理 | 死代码删除、层级越界、Rust 参数过多、文件树无虚拟化 |
| 2026-06-10 | 18 | 📋 待处理 | 桥接层对齐、大文件虚拟化、终端性能、过度订阅 |
| 2026-06-12 | 24 | 📋 待处理 | GitHubPanel 1351 行、communicateSlice 712 行、10 个孤立 CSS、useBrowserPanel 增长失控 |
| 2026-06-13 | 16 | 🔄 部分解决 | Store 拆分成功（-75%）、GitHubTreeEntry 991 行、browserpanel 逆向膨胀 |
| 2026-06-14 | 13 | 📋 待处理 | 路径别名缺失、Diff 编辑器 useEffect 问题、文件树 O(n²)、虚拟列表 memo 失效 |
| 2026-06-15 | 18 | 📋 待处理 | cmScrollLeftSync 653 行、FoldTooltipOverlay 666 行、Rust crate 模块化 |
| 2026-06-16 | 12 | 📋 待处理 | 拆分不彻底（子模块已创建但主文件未清理）、深层相对导入 |
| 2026-06-17 | 9 | 🔄 部分解决 | BrowserPanel 977 行、CSS 3 文件超 1000 行、TitleBar 轮询优化 |
| 2026-06-19 | 16 | 📋 待处理 | useChangesPanelState 655 行、components.css 1075 行、agent_pipeline 898 行、29 处 console.log |
| 2026-06-20 | 9 | ✅ 已解决 | 浏览器 iframe 稳定性修复、大型文件拆分、console.log 清理 |
| 2026-06-21 | 11 | ✅ 已解决 | JSX 去重、CSS 拆分、Rust 函数拆分、CSS 硬编码清理 |
| 2026-06-22 | 8 | ✅ 已解决 | BrowserPanel Hook 提取、Rust clone 消除、CSS !important 清理 |

## 各日洞察摘要

### 2026-05-21
- 消除 11 个 slice 工厂的 `as any` 类型断言，改为 `StoreState` 泛型
- IPC 错误粒度细化：区分网络错误与后端错误码
- LRU 缓存优化：访问计数阈值 + O(1) 淘汰
- 4 个废弃 Store 文件彻底删除，前端模块化为 7 个功能域

### 2026-05-22
- `slicedStore.ts` 1465 行单体 Store，需按领域拆分
- `previewBridge` 300+ 行，需拆分子桥接器
- Rust 搜索无索引优化，全文本遍历性能堪忧
- `sendMessage` 120 行单 action，需拆分为独立 handler

### 2026-05-23
- App 组件 80+ 字段扁平选择器，流式期间每秒 30+ 次全树重渲染
- `LeftSidebar.tsx` 1796 行，混合 8 类职责；`TerminalPanel.tsx` 793 行含 11 处硬编码中文
- Rust `storage` 全局 `Arc<Mutex<Connection>>` 阻塞 tokio 运行时
- `model-gateway` 空 choices 静默吞错；`change-engine` 含未使用依赖

### 2026-05-23-2
- App 选择器仍含 32 个状态字段，需下沉到子组件
- `workspaceSlice` 与 `diagnosticSlice` 字段重复定义（`indexingStatus`/`repoMap`）
- 双 Store 模式（`useUiStore` + `useAppStore`）形成斜向依赖
- `regions.css` 8144 行单体文件，需按区域拆分

### 2026-05-24
- Storage `EntityTable` 24 个变体 SQL 模板高度重复（~2100 字符）
- Rust `Mutex::expect` 在生产代码中应改为 `map_err` 优雅降级
- `ChangesPanel.tsx` 1196 行，需拆分为 4 个子组件
- `as any` 从 13 处减至 7 处，类型安全持续改善

### 2026-05-25
- 7 个组件超 500 行（ChangesPanel 1035、CenterPane 629、StatusBar 588 等）
- `moveIdWithinBucket` 在 4 个文件中完全重复定义
- CodeMirror 10 语言包全量静态导入 ~285KB，需动态加载
- highlight.js 全量 190+ 语言 ~150KB，实际只需 10 种
- `bootstrap()` 级联 3 次 set() 触发多次重渲染

### 2026-05-27
- Legacy `useUiStore`（817 行）被 27 个文件引用，与 slicedStore 形成双 Store 割裂
- `files-panel.css` 2486 行、`components.css` 1938 行，含 30+ 硬编码 hex 颜色
- `copyToClipboard` 3 处独立实现；右键菜单 ~200 行重复
- 全局仅 2 个 `React.memo`（占比 2.2%），编辑器和列表组件频繁无意义重渲染
- 前端 89 组件中仅 2 个使用 React.memo

### 2026-05-28
- App.tsx 447 行：提取拖拽/补丁审查/编辑器定位/主题同步等 Hook
- 8 个 action 中重复的刷新链：提取 `postMutationRefresh` 统一函数
- `adl-workspace` 7 个关注点：outline 子模块拆分为独立 crate
- 全部 22 项问题已修复完成

### 2026-05-29
- 消息列表无虚拟化，大量消息时渲染所有 DOM 元素
- `read_file` 每次都完整读取，无基于 mtime 的缓存
- `terminal` 和 `pty` 两个 crate 职责边界不清晰
- 构建优化：Vite manualChunks 已配置但可进一步优化

### 2026-05-30
- `ui-store.ts` 存在大量 @deprecated 代码未清理
- `MessageStream.tsx` 已创建但未被实际使用
- 消息流内联在 CenterPane 中，需引入 react-window 虚拟滚动
- 多项之前报告的问题已标记为已解决

### 2026-05-31
- `ui-store.ts` 中 @deprecated 终端代码需彻底删除
- localStorage 读写辅助函数在两个文件中重复
- `MessageStream` 已集成 react-window 实现虚拟滚动
- 浏览器功能状态分散在 ui-store 和 browserSlice 两处

### 2026-06-01
- `locales/` 目录（60 keys × 2 语言）为死代码，全仓库零引用
- `app/` 根层级散落 15 个源文件，需迁移到子目录
- Rust `state.rs` 中 `config`/`current_workspace` 用 `Mutex` 而非 `RwLock`（读:写 ≈ 100:1）
- `agent.rs` `save_patch_set` 缺乏事务保护，崩溃可能导致孤儿数据
- CSS `components.css` 后半段使用 `themes.css` 直出变量而非语义 Token

### 2026-06-03
- `storageScheduler.ts` 死代码；`selectors.ts` 中原始值选择器误用 `useShallow`
- 4 个 crate 间依赖倒置：`command → task`、`change-engine → fs-ops`
- 23 条未使用 Rust 依赖；3 个微型 crate（logger/config/events）可合并
- 前端测试覆盖率仅 5.6%（309 源文件仅 32 测试文件）
- 102 次 Rust `.clone()` 调用集中在 workspace_sidebar 和 task

### 2026-06-05
- `ui-store.ts` 标记 @deprecated 但仍被 10 个文件直接引用
- `cache.rs` 228 行死代码（全部标记 `#[allow(dead_code)]`）
- `storage` 中 `assert!(limit <= 1000)` 在生产环境会 panic
- 6 个核心布局组件缺失 React.memo
- 4 组 `@keyframes` 动画重复定义；CSS `!important` 271 处

### 2026-06-07
- 完整迁移 ui-store 到 uiSlice，删除 ui-store.ts 文件
- 更新 10 个使用 useUiStore 的组件
- 拆分 Rust `maybe_execute_approved_command` 巨型函数
- 所有 98 Rust 测试 + 214 前端测试通过，类型检查零错误

### 2026-06-08
- `useBrowserPanel.ts` 879 行 Hook，混合 5+ 独立领域
- CSS `!important` 从 271 增至 391（+44%），但 95% 为必需的 CodeMirror 覆盖
- `command → task` 依赖倒置修复；`localStorageUtils.ts` 死代码删除
- 3 个微型 crate 合并入 kernel；PTY 7 Mutex 合并为 2 分组结构体
- `ChangesPanel.tsx` 从 1183 行降至 775 行（-34%）

### 2026-06-09
- `components/TitleBar.tsx` 和 `components/StatusBar.tsx` 为死代码（已被 regions/ 版本取代）
- Bridge 层层级越界：从 UI 层导入工具函数
- `useBrowserPanel.ts` 增长至 965 行（+86 行），持续膨胀
- Rust `agent_pipeline.rs` 中 `call_model` 10 参数、`finalize_run` 11 参数
- 文件树和会话列表无虚拟化

### 2026-06-10
- 三个桥接层（Tauri/Mock/Preview）未完全对齐，存在遗漏方法
- CI 模块在 Tauri 和 Preview 模式下实现差异大
- 大文件组件（fileTree、MultiWorkspaceFileTree、TerminalPanel）缺虚拟化
- 变更面板和会话面板存在过度订阅风险

### 2026-06-12
- `GitHubPanel.tsx` 1351 行，是前端最大单体文件
- `communicateSlice.ts` 712 行（5 个通信渠道），之前未被报告覆盖
- `useBrowserPanel.ts` 增长至 1042 行（4 天内 +18.5%）
- 10 个孤立 CSS 文件不在加载链中，是隐性维护陷阱
- `browserSlice.ts` 962 行持续增长

### 2026-06-13
- Store 架构重构成效显著：browserSlice（962→235 行，-75%）、communicateSlice（712→93 行，-87%）
- `GitHubTreeEntry.tsx` 991 行，与 BrowserTreeEntry 模式重复率约 60%
- `browserpanel.tsx` 逆向膨胀至 894 行（+22.6%），Hook 提取后主文件反而增长
- `workspaceActions.ts` 557 行、`githubSlice.ts` 729 行新识别超标
- agent_pipeline.rs 核心编排逻辑零测试覆盖（自上轮以来无变化）

### 2026-06-14
- 47+ 处使用深层相对导入（最深 5 层），需配置 TypeScript 路径别名
- Diff 编辑器 useEffect 依赖回调引用 → 每次父组件渲染 destroy+recreate 编辑器
- 文件树虚拟列表 memo 优化完全失效：`onMouseEnter`/`onMouseLeave` 每次渲染创建新函数
- BrowserTabBar O(n×m) 书签查找；`trunkHeightMap` O(n²) 计算
- 6 个文件中 Navigator Resize Handle 代码几乎完全相同

### 2026-06-15
- `cmScrollLeftSync.ts` 653 行混合 5+ 种职责；`FoldTooltipOverlay.tsx` 666 行
- `GitHubTreeEntry.tsx` 970 行（第二大组件）；`GitHubPanel.tsx` 996 行
- `preview-bridge/index.ts` 620 行，需按领域拆分
- Rust `ci-status/src/lib.rs` 453 行单文件混合 4+ 职责
- 4 个 Action 模块（editorActions/sessionActions/gitActions/patchActions）完全无单元测试

### 2026-06-16
- `GitHubTreeEntry.tsx` 子模块已提取但主文件仍保留 ~178 行重复定义
- `BrowserPanel.tsx` 964 行仍混合多职责；`BrowserTreeEntry.tsx` 711 行
- `uiSlice.ts` 576 行诊断状态与 `diagnosticSlice`（43 行）重叠
- `githubSlice.ts` 777 行含 6+ 子领域
- 2 处深层相对导入未迁移到路径别名

### 2026-06-17
- `BrowserPanel.tsx` 977 行需提取 BrowserNavigator 独立组件
- 3 个 CSS 文件超 1000 行：communication-panel.css（1738）、files-panel.css（1724）、file-tree.css（1234）
- `TitleBar.tsx` 490 行含内联 MenuDropdown 和 3 组菜单定义
- TitleBar 使用 `setInterval(500ms)` 轮询窗口最大化状态，应改为事件监听
- `selectors.ts` 284 行混合 8+ 域选择器

### 2026-06-19
- `useChangesPanelState.tsx` 655 行，是所有 hook 中最大的
- `components.css` 1075 行超阈值，包含 10+ 组件内联样式
- `uiSlice.ts` 541 行，需按功能域拆分
- `agent_pipeline.rs` 898 行，是 Rust 最大文件
- 全局 29 处 `console.log/warn/error` 残留生产代码中
- 前端 10+ 个 CSS 文件、10+ 个 TS/TSX 文件超过 800 行阈值

### 2026-06-22
- BrowserPanel 1040 行：提取 `useBrowserToast` + `useBrowserDialogs` 两个 Hook，-163 行
- 合并两个 CreateTabDialog 渲染为单次渲染
- Rust agent.rs `make_activity_emitter` 参数 `&str` 化，消除 3 次 clone
- CSS `!important` 清理：file-tree-core.css（26 处）+ files-panel-list.css（18 处）

## 统计

- **总发现项**: ~500+（跨 28 个报告日）
- **已完全解决**: 6 天（05-21、05-28、06-07、06-20、06-21、06-22）
- **部分解决**: 10 天
- **待处理**: 12 天
- **涉及领域**: 架构设计、性能优化、CSS 架构、Rust 后端、React 组件、状态管理、测试覆盖、双端一致性、桥接层

### 高频重复问题（跨多日报告）

| 问题 | 首次出现 | 最后出现 | 出现次数 |
|------|----------|----------|----------|
| 巨型组件/文件超阈值 | 05-22 | 06-19 | 20+ |
| Store 选择器过度订阅/重渲染 | 05-23 | 06-17 | 15+ |
| CSS 文件超 1000 行 | 05-23-2 | 06-19 | 12+ |
| ui-store 迁移/双 Store 割裂 | 05-23-2 | 06-07 | 8 |
| 代码重复（前端+Rust） | 05-23 | 06-16 | 10+ |
| 缺少 React.memo | 05-25 | 06-09 | 5 |
| 虚拟化缺失 | 05-25 | 06-10 | 6 |
| Rust 测试覆盖不足 | 05-23 | 06-15 | 5 |
| 死代码/废弃代码 | 05-30 | 06-09 | 5 |

### 已解决的关键架构债务

- ✅ Zustand Store 从 1465 行拆分为 12 切片 + 11 action 模块
- ✅ Legacy `ui-store.ts` 完全删除，迁移到 slicedStore
- ✅ 3 个微型 Rust crate 合并入 kernel
- ✅ `command → task` 依赖倒置修复
- ✅ PTY 7 Mutex 合并为 2 分组结构体
- ✅ `ChangesPanel` 从 1183 行降至 775 行（-34%）
- ✅ `browserSlice` 从 962 行降至 235 行（-75%）
- ✅ `communicateSlice` 从 712 行降至 93 行（-87%）
- ✅ 前端 `as any` 从 13 处减至 0 处
- ✅ CodeMirror 语言包全量加载 → 按需动态加载