# 重构进度报告

> 更新日期: 2026-05-21

## 完成状态

**全部完成** ✅

## 重构历程

### 第一轮重构（2026-05-20）：Zustand 切片定义
`store.ts` 已删除，创建 10 个切片定义文件。

### 第二轮重构（2026-05-21）：实现切片合并 + 性能优化
基于 [重构洞察报告](./refactor-insight-2026-05-21.md) 和 [实施计划](./重构实施计划-2026-05-21.md) 完成：

| 阶段 | 内容 | 状态 |
|------|------|------|
| Phase 0 | 清理 4 个遗留独立 Store（标记 @deprecated 后删除） | ✅ |
| Phase 1 | slicedStore.ts 迁移到 stores/，真正使用切片合并模式 | ✅ |
| Phase 2 | 选择器性能优化：useShallow React Hook 版本 | ✅ |
| Phase 3 | 流式事件性能：useStreamingText Hook（rAF 批量） | ✅ |
| Phase 4 | Rust 错误码去重 / 模型配置合并 DRY / 搜索 debounce | ✅ |

### 第三轮重构（2026-05-21）：CSS Token + 模块化分层 + 错误码统一
基于 [重构洞察报告 §3（其他发现）](./refactor-insight-2026-05-21.md) 完成：

| 议题 | 内容 | 状态 |
|------|------|------|
| 议题1：全局 CSS 变量迁移 | 新增 6 个 Shadow 设计 Token，替换硬编码值，添加 TypeScript 类型定义 | ✅ |
| 议题2：模块化分层（features/） | 7 个功能模块迁移到 `app/features/`，更新所有 import 路径 | ✅ |
| 议题3：统一错误处理 | 创建 `IpcErrorCode` 枚举，统一桥接层错误码 | ✅ |
| 遗留 Store 彻底清理 | 删除 4 个 @deprecated Store 文件 | ✅ |

### 第四轮重构（2026-05-21）：重构洞察验证与修复
基于 [insight-fix-plan](../../.trae/documents/refactor-insight-fix-plan-2026-05-21.md) 完成：

| Phase | 内容 | 状态 |
|-------|------|------|
| Phase 1：代码结构与类型安全 | 消除 `as any`（11 个 slice）、错误粒度、SSE 连接、监听器上限、Send+Sync 断言、路径分隔符抽取 | ✅ |
| Phase 2：性能优化 | 防抖封装、LRU 访问计数、缓存短路、工作区缓存清理、useMemo 对象引用优化、骨架屏动画、Release panic=abort | ✅ |
| Phase 3：补充问题 | queueMicrotask、subscribeChannel 验证 | ✅ |

### 第五轮重构（2026-05-22）：CodeMirror 双实例 Bug 修复
修复 `@codemirror/state` `instanceof` 检查失败导致的 `Unrecognized extension value` 运行时错误：

- **根因**：`@codemirror/state` 并非 `package.json` 直接依赖（仅通过 `@uiw/react-codemirror` 间接引入），pnpm 在不同路径加载导致多个实例
- **修复**：
  1. 在 `package.json` 添加 `@codemirror/state@^6.6.0` 作为显式直接依赖
  2. 在 [vite.config.ts](../../ai-digital-life/frontend/vite.config.ts) 添加 `optimizeDeps.include` — 强制 Vite 将 7 个 CodeMirror 核心包预捆绑为单例
  3. 因 pnpm store 损坏重建 `node_modules`（切换为 npm）

## 当前架构

### Store 架构

```
app/stores/
├── slicedStore.ts          # 基于切片合并的完整 Store（真源）
├── StoreState.ts           # 完整 StoreState 类型接口
├── slices.ts               # 统一导出所有切片
├── selectors.ts            # 选择器（含 useShallow React Hook 版本）
├── shared.ts               # 共享状态和工具（LRU 缓存、防抖搜索、缓存清理）
├── cacheUtils.ts           # 缓存工具函数
├── conversationUtils.ts    # 会话工具函数
├── index.ts                # 模块索引
├── slices/                 # 11 个独立切片（含 clipboardSlice）
└── (已删除)                # 4 个遗留 Store 已清理
```

### 功能模块架构

```
app/features/
├── file-tree/       # 文件树（FileTree, TreeNodeRow, CustomScrollArea）
├── outline/         # 代码大纲（OutlineTree, outlineModel）
├── patch-review/    # 补丁审查（patchReview 纯函数）
├── editor/          # CodeMirror 编辑器（CodeEditor, cmTheme, cmLanguages...）
├── diff-viewer/     # 差异查看器（DiffViewer, changePreviewDiffRanges）
├── preview/         # 文件预览（MarkdownPreview, DocxPreview, PdfPreview）
└── terminal/        # 终端面板（TerminalPanel）
```

### 设计 Token 类型

```
frontend/src/design-system/
├── tokens.ts         # TypeScript 类型定义（ShadowToken / ColorToken / SpacingToken）
├── theme.ts          # 主题工具函数
├── index.ts          # 模块索引
├── components.ts     # 组件样式类型
├── icons.ts          # 图标类型
└── html.ts           # HTML 属性类型
```

### 关键改进

| 改进项 | 说明 |
|--------|------|
| 切片合并 | slicedStore 使用 `createUISlice(), createWorkspaceSlice(), ...` 真正合并，消除 11 处 `as any` |
| StoreState 类型 | 独立类型文件，定义完整 Store 接口 |
| 选择器优化 | 所有选择器提供 `useShallow` React Hook 版本，避免不必要重渲染 |
| 搜索 debounce | `searchFiles` 300ms debounce，封装为 `createDebouncedSearch` 工具 |
| 流式优化 | `useStreamingText` Hook 使用 rAF 批量合并高频 delta 事件 |
| LRU 缓存优化 | 访问计数阈值（每 3 次访问提升一次），减少 Map delete+set 重哈希 |
| 缓存短路 | `openFile` 缓存命中时直接返回，跳过网络请求 |
| 工作区缓存隔离 | 切换工作区时自动清理陈旧缓存条目 |
| Rust DRY | `commands/mod.rs` 复用 `CommandError::from()` 去重错误码映射 |
| 前端 DRY | 提取 `preferencesMerger.ts` 消除桥接重复逻辑；抽取 `joinPathSegments` 消除 5 处路径分隔符重复代码 |
| 遗留清理 | 4 个遗留 Store 已删除 |
| CSS Token 迁移 | 6 个 Shadow 设计 Token 替换硬编码值，亮暗主题区分 |
| 模块化分层 | 7 个功能模块迁移到 `features/`，统一 index.ts 导出 |
| 错误码统一 | `IpcErrorCode` 枚举跨桥接层共享 |
| invoke 错误粒度 | 区分网络错误（TypeError）→ `NETWORK_ERROR`、后端错误 → 透传 code |
| SSE 连接管理 | 引用计数自动关闭，无监听器时释放 EventSource |
| PTY 监听器限流 | 两个桥接层均添加 `MAX_PTY_LISTENERS = 32` 上限 |
| Rust Send+Sync 断言 | PtySession / SessionManager / PtySessionHandle 静态类型安全验证 |
| 骨架屏动画 | 响应式 `background-size`、`will-change` GPU 提示、`prefers-reduced-motion` 禁用 |
| Release 构建 | 添加 `panic = "abort"`，减少二进制体积 |
| 微任务刷新 | `queueLowPriorityRefresh` 优先使用 `queueMicrotask` |

## 重构统计

| 指标 | 数值 |
|------|------|
| 重构轮次 | 5 轮 |
| 新增/修改文件 | StoreState.ts, useStreamingText.ts, preferencesMerger.ts, design-system/tokens.ts, package.json（@codemirror/state 显式依赖）, vite.config.ts（optimizeDeps） |
| 重写/迁移文件 | slicedStore.ts, selectors.ts, shared.ts, 11 个 slice 文件 |
| 删除文件 | app/slicedStore.ts（旧 1237 行），4 个废弃 Store, pnpm-lock.yaml |
| 迁移模块 | 7 个（file-tree / outline / patch-review / editor / diff-viewer / preview / terminal） |
| 新增设计 Token | 6 个 Shadow token（亮暗主题各 6 个值） |
| 消除 `as any` | 11 处（所有 slice 工厂） |
| 消除重复代码 | 5 处路径分隔符 → 全局 `joinPathSegments` |
| 新增 Rust 断言 | 3 个 `static_assertions` |
| 包管理变更 | pnpm → npm（因 pnpm store 损坏恢复为 npm） |
| 新增 Vite 配置 | `optimizeDeps.include` 强制 7 个 CodeMirror 包预捆绑为单例 |
| 切片数量 | 11 个独立切片 |
| 类型检查 | 0 错误 |
| 测试通过 | 171/171（Vitest），2 个 Playwright E2E 预存问题 |
| Rust 编译 | cargo check 零警告零错误 |

## 相关文档

- [重构洞察报告](./refactor-insight-2026-05-21.md)
- [重构实施计划](./重构实施计划-2026-05-21.md)
- [Insight Fix 实施计划](../../.trae/documents/refactor-insight-fix-plan-2026-05-21.md)
