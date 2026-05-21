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
| 议题1：全局 CSS 变量迁移 | 新增 6 个 Shadow 设计 Token（亮暗主题区分），替换 `regions.css` 中 6 处硬编码值，添加 TypeScript 类型定义 | ✅ |
| 议题2：模块化分层（features/） | 7 个功能模块迁移到 `app/features/`（file-tree / outline / patch-review / editor / diff-viewer / preview / terminal），更新所有 60+ import 路径 | ✅ |
| 议题3：统一错误处理 | 创建 `IpcErrorCode` 枚举，统一 tauri-bridge 和 preview-bridge 的错误码 | ✅ |
| 遗留 Store 彻底清理 | 删除 4 个 @deprecated Store 文件 | ✅ |

## 当前架构

### Store 架构

```
app/stores/
├── slicedStore.ts          # 基于切片合并的完整 Store（真源）
├── StoreState.ts           # 完整 StoreState 类型接口
├── slices.ts               # 统一导出所有切片
├── selectors.ts            # 选择器（含 useShallow React Hook 版本）
├── shared.ts               # 共享状态和工具
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
| 切片合并 | slicedStore 使用 `createUISlice(), createWorkspaceSlice(), ...` 真正合并 |
| StoreState 类型 | 独立类型文件，定义完整 Store 接口 |
| 选择器优化 | 所有选择器提供 `useShallow` React Hook 版本，避免不必要重渲染 |
| 搜索 debounce | `searchFiles` 300ms debounce，减少 IPC 调用 |
| 流式优化 | `useStreamingText` Hook 使用 rAF 批量合并高频 delta 事件 |
| Rust DRY | `commands/mod.rs` 复用 `CommandError::from()` 去重错误码映射 |
| 前端 DRY | 提取 `preferencesMerger.ts` 消除 preview-bridge / mock-bridge 重复逻辑 |
| 遗留清理 | 4 个遗留 Store 已删除 |
| CSS Token 迁移 | 6 个 Shadow 设计 Token 替换硬编码值，亮暗主题区分 |
| 模块化分层 | 7 个功能模块迁移到 `features/`，统一 index.ts 导出 |
| 错误码统一 | `IpcErrorCode` 枚举跨桥接层共享 |

## 重构统计

| 指标 | 数值 |
|------|------|
| 新增文件 | StoreState.ts, useStreamingText.ts, preferencesMerger.ts, design-system/tokens.ts |
| 重写/迁移文件 | slicedStore.ts (stores/), selectors.ts, index.ts, slices.ts |
| 删除文件 | app/slicedStore.ts（旧 1237 行），4 个废弃 Store |
| 迁移模块 | 7 个（file-tree / outline / patch-review / editor / diff-viewer / preview / terminal） |
| 新增设计 Token | 6 个 Shadow token（亮暗主题各 6 个值） |
| 切片数量 | 11 个独立切片 |
| 类型检查 | 0 错误 |
| 测试通过 | 171/171（Vitest），2 个 Playwright E2E 预存问题 |

## 相关文档

- [重构洞察报告](./refactor-insight-2026-05-21.md)
- [重构实施计划](./重构实施计划-2026-05-21.md)
