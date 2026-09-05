# AI Digital Life 快速参考 — 文件路径查找

> 按功能域组织的文件路径映射，支持 Ctrl+F 搜索关键词快速定位。
> 所有路径相对于 `ai-digital-life/`。

## Rust 后端

### 基础设施

```
crates/kernel/src/              # 核心类型（agent/ci/command/config/model/workspace/hotkeys）
crates/errors/src/lib.rs        # AppError 枚举（~30 变体）
crates/storage/src/             # SQLite 持久化（连接池/CRUD/会话/工作区）
crates/migration/src/           # SQLite schema 迁移
crates/adl-logging/src/         # 日志系统（tracing + appender）
```

### 领域服务

```
crates/workspace/src/           # 工作区管理（文件系统/Git/搜索/预览）
crates/conversation/src/        # 会话消息（创建/查询/Fork）
crates/command/src/             # 命令执行
crates/pty/src/                 # 伪终端进程管理
crates/fs-ops/src/              # 文件系统操作 + watcher
crates/task/src/                # 任务状态机
crates/context/src/             # 上下文选择与组装
crates/outline/src/             # 大纲解析（11 语言）
crates/credential/src/          # 凭据存储（keyring + 加密文件）
crates/ci-status/src/           # GitHub Actions CI 轮询
```

### AI 相关

```
crates/agent-runtime/src/       # Agent 运行时（路由/权限/Plan/Compaction/TokenCount/ToolRegistry）
crates/model-gateway/src/       # 模型网关（7 Provider + SSE 流式 + 路由）
crates/subagent/src/            # 子代理（Task 工具 + 权限派生）
crates/change-engine/src/       # 变更引擎（Patch/Snapshot/Revert）
crates/mcp-client/src/          # MCP 客户端（SSE/Stdio/StreamableHTTP + OAuth）
crates/lsp-client/src/          # LSP 客户端（诊断/符号/定义/引用）
```

### Tauri 入口

```
src-tauri/src/lib.rs            # Tauri 应用入口
src-tauri/src/main.rs           # 主函数
src-tauri/src/commands/         # 33 个 Command 模块
src-tauri/src/commands/app.rs   # 应用相关命令（debug/version/preferences）
src-tauri/src/commands/workspace.rs          # 工作区命令
src-tauri/src/commands/workspace_git.rs      # 工作区 Git
src-tauri/src/commands/workspace_sidebar.rs  # 工作区侧边栏
src-tauri/src/commands/agent.rs              # Agent 命令
src-tauri/src/commands/agent_pipeline.rs     # Agent 管道
src-tauri/src/commands/agent_pipeline_stream.rs  # 流式管道
src-tauri/src/commands/browser.rs            # 浏览器
src-tauri/src/commands/ci.rs                 # CI
src-tauri/src/commands/command.rs            # 命令
src-tauri/src/commands/commands_config.rs    # 命令配置
src-tauri/src/commands/compaction.rs         # 会话压缩
src-tauri/src/commands/conversation.rs       # 会话消息
src-tauri/src/commands/custom_agent.rs       # 自定义 Agent
src-tauri/src/commands/durable.rs            # 持久会话
src-tauri/src/commands/lsp.rs                # LSP
src-tauri/src/commands/mcp.rs                # MCP
src-tauri/src/commands/patch.rs              # Patch
src-tauri/src/commands/permission.rs         # 权限
src-tauri/src/commands/platform.rs           # 平台
src-tauri/src/commands/plugin.rs             # 插件
src-tauri/src/commands/provider.rs           # Provider
src-tauri/src/commands/pty_commands.rs       # PTY
src-tauri/src/commands/reference.rs          # 引用
src-tauri/src/commands/reserved.rs           # 保留接口
src-tauri/src/commands/retrieval.rs          # 检索
src-tauri/src/commands/run_activity.rs       # 活动日志
src-tauri/src/commands/session_fork.rs       # 会话分支
src-tauri/src/commands/snapshot.rs           # 快照
src-tauri/src/commands/subagent.rs           # 子代理
src-tauri/src/commands/task.rs               # 任务
src-tauri/src/commands/web_tools.rs          # 网络工具
src-tauri/src/capabilities/     # 权限能力定义
src-tauri/src/events/           # Tauri 事件
src-tauri/Cargo.toml            # Tauri 依赖
src-tauri/tauri.conf.json       # Tauri 配置
src-tauri/icons/                # 应用图标
```

## 前端

### 入口与配置

```
frontend/src/main.tsx           # 应用入口
frontend/src/app/App.tsx        # 根组件
frontend/vite.config.ts         # Vite 配置
frontend/package.json           # 前端依赖
```

### 功能域 (features/)

```
frontend/src/app/features/browser/             # 内置浏览器面板（着陆页/标签/导航/书签/iframe）
frontend/src/app/features/browser-tree/        # 浏览器树形目录
frontend/src/app/features/terminal/            # 终端面板
frontend/src/app/features/diff-viewer/         # 差异查看器
frontend/src/app/features/editor/              # CodeMirror 编辑器
frontend/src/app/features/conversation/        # 对话消息块
frontend/src/app/features/file-tree/           # 文件树
frontend/src/app/features/workspace-file-tree/ # 工作区文件树
frontend/src/app/features/workspace-changes-tree/ # 工作区变更树
frontend/src/app/features/workspace-terminal/  # 工作区终端
frontend/src/app/features/workspace-browser/   # 工作区浏览器
frontend/src/app/features/multi-workspace/     # 多工作区容器
frontend/src/app/features/github-tree/         # GitHub 仓库树
frontend/src/app/features/outline/             # 大纲树
frontend/src/app/features/preview/             # 文件预览
frontend/src/app/features/patch-review/        # 补丁审查
frontend/src/app/features/mcp/                 # MCP 管理
frontend/src/app/features/lsp-panel/           # LSP 面板
frontend/src/app/features/provider-manager/    # 提供商管理
frontend/src/app/features/permission-settings/ # 权限规则编辑
frontend/src/app/features/plugin-manager/      # 插件管理
frontend/src/app/features/custom-agent/        # 自定义 Agent
frontend/src/app/features/reference-manager/   # 引用管理
frontend/src/app/features/session-fork/        # 会话 Fork
frontend/src/app/features/web-search/          # 网络搜索
frontend/src/app/features/command-editor/      # 命令编辑
frontend/src/app/features/tree/                # 通用树骨架
```

### 通用组件 (components/)

```
frontend/src/app/components/agent/             # ExecutionSummary, PlanCard, StepBlock
frontend/src/app/components/approval/          # ApprovalCard, AuditPanel
frontend/src/app/components/conversation/      # CompactionIndicator, ReferencePopover, SnapshotList, TokenUsage...
frontend/src/app/components/models/            # CustomProviderDialog, ModelPicker, ProviderManager
frontend/src/app/components/session/           # DurableStatusIndicator
frontend/src/app/components/settings/          # FontControl, KeybindSettings, SettingsPanel...
frontend/src/app/components/terminal/          # CommandOutputBlock, XtermTerminal
frontend/src/app/components/workspace/         # CheckpointTimeline, GitSummary, IndexStatus...
```

### 根级组件

```
frontend/src/app/components/Composer.tsx         # 对话输入框
frontend/src/app/components/MessageBubble.tsx    # 消息气泡
frontend/src/app/components/MessageStream.tsx    # 消息流
frontend/src/app/components/PromptInput.tsx      # Prompt 输入
frontend/src/app/components/AgentSelector.tsx    # Agent 选择
frontend/src/app/components/PlanModeBanner.tsx   # Plan 模式
frontend/src/app/components/SubagentIndicator.tsx # 子代理
frontend/src/app/components/ContextBuilder.tsx    # 上下文构建
frontend/src/app/components/ConfirmDialog.tsx    # 确认弹窗
frontend/src/app/components/ContextMenu.tsx      # 右键菜单
frontend/src/app/components/Toast.tsx            # Toast 通知
frontend/src/app/components/Tooltip.tsx          # Tooltip
frontend/src/app/components/SessionManagement.tsx # 会话管理
frontend/src/app/components/ErrorBoundary.tsx    # 错误边界
frontend/src/app/components/WelcomeState.tsx     # 欢迎页
```

### Zustand Store

```
frontend/src/app/stores/slicedStore.ts           # Store 合并入口
frontend/src/app/stores/StoreState.ts            # 完整类型定义
frontend/src/app/stores/slices.ts                # 切片统一导出
frontend/src/app/stores/selectors.ts             # 选择器
frontend/src/app/stores/cacheHelpers.ts           # 缓存系统
frontend/src/app/stores/storageHelpers.ts         # localStorage 持久化
frontend/src/app/stores/constants.ts             # 常量
frontend/src/app/stores/actions/                 # 12 个 action 模块
frontend/src/app/stores/slices/                  # 24 个状态切片
```

### IPC 桥接

```
frontend/src/tauri-bridge.ts          # Tauri invoke 桥接
frontend/src/preview-bridge/          # 浏览器模式桥接（~17 文件）
frontend/src/mock-bridge.ts           # 纯内存模拟
frontend/src/shared/ipc/              # 30 个 IPC 接口定义
frontend/src/shared/ipc/index.ts      # 统一导出
frontend/src/shared/typedErrors.ts    # 16 个 AppError 子类
```

### 设计系统

```
frontend/src/design-system/tokens.ts  # 设计 Token 类型
frontend/src/design-system/theme.ts   # ThemeController
frontend/src/design-system/components.ts # 组件 API
frontend/src/design-system/icons.ts   # 图标类型
```

### 国际化

```
frontend/src/app/i18n/en-US/          # 英文（26 个领域文件）
frontend/src/app/i18n/zh-CN/          # 中文（26 个领域文件）
frontend/src/app/i18n/i18n.ts         # 核心实例
frontend/src/app/i18n/types.ts        # 类型定义
```

### Hooks

```
frontend/src/app/hooks/useTCopy.ts    # i18n Hook
frontend/src/app/hooks/useIsTauri.ts  # 环境检测
frontend/src/app/hooks/useTheme.ts    # 主题 Hook
# ... 更多自定义 Hook
```

## 脚本与配置

```
package.json                        # 根包配置
pnpm-workspace.yaml                 # pnpm 工作区
turbo.json                          # Turbo 构建
.editorconfig                       # 编辑器格式
.eslintrc.cjs                       # ESLint 配置（根级）
.prettierrc                         # Prettier 配置
.prettierignore                     # Prettier 忽略
.markdownlint.json                  # Markdown lint
```

## 测试

```
frontend/src/**/*.test.ts            # 前端 Vitest 测试
crates/*/tests/                      # Rust 集成测试
crates/*/src/**/*.rs (测试模块)      # Rust 单元测试
crates/server/tests/common/mod.rs    # Rust 集成测试共享 helpers
```
