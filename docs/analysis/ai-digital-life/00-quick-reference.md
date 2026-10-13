# AI Digital Life 快速参考 — 文件路径查找

> 按功能域组织的文件路径映射，支持 Ctrl+F 搜索关键词快速定位。
> 所有路径相对于 `ai-digital-life/`。
> 快照数字以源码为准；规范约束见 `.agents/rules/`。

## Rust 后端（22 个 crate）

### 基础设施

```
crates/kernel/src/              # 共享内核（app_info/config/events/storage/types 子模块；storage 提供 StoragePaths 统一路径解析）
crates/types/src/               # 共享类型 crate
crates/errors/src/lib.rs        # AppError 统一错误枚举（thiserror 派生，禁 Result<_, String>）
crates/storage/src/             # SQLite 持久化（连接池/CRUD，WAL 模式）
crates/migration/src/           # SQLite schema 迁移
crates/adl-logging/src/         # 日志系统（tracing + appender）
```

### 领域服务

```
crates/workspace/src/           # 工作区管理（文件系统/Git/搜索/预览）
crates/pty/src/                 # 伪终端进程管理（traits.rs/rust_pty_impl.rs/session_manager/shell_resolver.rs）
crates/fs-ops/src/              # 文件系统操作 + watcher
crates/outline/src/             # 大纲解析
crates/credential/src/          # 凭据存储（keyring + 加密文件降级）
crates/ci-status/src/           # CI 状态
crates/clipboard/src/           # 剪贴板历史
crates/sysmon/src/              # 系统监视器
crates/change-engine/src/       # 变更引擎（Patch/Snapshot/Revert）
crates/server/src/              # adl-server 后端引擎（浏览器模式真实后端）
```

### 第三方 harness 宿主集成（deepseek dsh）

```
crates/webapp-host/src/         # dsh 进程托管与拉起
crates/dsh-bundle/src/          # 内置 dsh 预安装包
crates/dsh-version/src/         # dsh 版本管理（已安装列表/切换/仓库查询）
crates/download-source/src/     # 下载源与镜像配置
```

> Agent 对话、模型接入与编排由第三方 harness 提供，本仓库仅做宿主集成，不自建 agent-runtime/model-gateway/mcp-client/lsp-client。

### Tauri 入口

```
src-tauri/src/main.rs            # 主函数
src-tauri/src/lib.rs             # 应用入口（AppState 构建 + 插件注册 + Command 注册）
src-tauri/src/setup.rs           # 启动流程（含存储迁移 run_startup_migration）
src-tauri/src/state.rs           # AppState
src-tauri/src/adl_server.rs      # adl-server 子进程管理
src-tauri/src/commands/          # 13 个文件（12 领域 + mod.rs）：app/browser/browser_memory/browser_webview_setup/clipboard/divider_strip/download_commands/platform/port_scan/reserved/storage/workspace
src-tauri/src/capabilities/      # 权限能力白名单（default.json + browser-remote.json，禁 "all"/"**"）
src-tauri/tauri.conf.json        # Tauri 配置（显式 CSP，withGlobalTauri 关闭）
src-tauri/icons/                 # 应用图标
```

## 前端

### 入口与配置

```
frontend/src/main.tsx           # 应用入口
frontend/src/app/App.tsx        # 根组件（含 TCopyProvider 注入）
frontend/vite.config.ts         # Vite 配置（@ 别名）
frontend/package.json           # 前端依赖
```

### 功能域 (features/，25 个)

```
frontend/src/app/features/browser/              # 内置浏览器面板
frontend/src/app/features/browser-settings/     # 浏览器设置
frontend/src/app/features/browser-tree/         # 浏览器树形目录
frontend/src/app/features/center/               # 中间区多标签宿主（CenterEntryPage：dsh/浏览器/终端）
frontend/src/app/features/clipboard-history/     # 剪贴板历史
frontend/src/app/features/diff-viewer/          # 差异查看器
frontend/src/app/features/divider-strip/        # 分隔线透明桥接条
frontend/src/app/features/dsh/                  # dsh 版本管理与宿主渲染
frontend/src/app/features/editor/               # CodeMirror 编辑器（含 FoldTooltipOverlay）
frontend/src/app/features/file-tree/            # 文件树
frontend/src/app/features/git-visualization/    # Git 可视化
frontend/src/app/features/github-tree/          # GitHub 仓库树
frontend/src/app/features/multi-workspace/      # 多工作区容器
frontend/src/app/features/outline/              # 大纲树
frontend/src/app/features/patch-review/         # 补丁审查
frontend/src/app/features/preview/               # 文件预览
frontend/src/app/features/storage-settings/     # 存储设置组
frontend/src/app/features/system-monitor/        # 系统监视器
frontend/src/app/features/terminal/             # 终端面板（xterm.js + 多窗格）
frontend/src/app/features/tree/                  # 通用树骨架
frontend/src/app/features/workspace-browser/     # 工作区浏览器
frontend/src/app/features/workspace-changes-tree/ # 工作区变更树
frontend/src/app/features/workspace-file-tree/   # 工作区文件树
frontend/src/app/features/workspace-settings/    # 工作区设置
frontend/src/app/features/workspace-terminal/   # 工作区终端
```

### 通用组件 (components/)

```
frontend/src/app/components/settings/   # SettingsPanel、KeybindSettings、FontControl…
frontend/src/app/components/terminal/   # XtermTerminal 等
frontend/src/app/components/drag/       # 拖拽相关
frontend/src/app/components/HintCard/   # Hint 卡片
frontend/src/app/components/UnderlineTabs/ # 下划线标签页
frontend/src/app/components/Toast.tsx    # Toast 通知
frontend/src/app/components/Tooltip.tsx  # 自定义 Tooltip
frontend/src/app/components/ErrorBoundary.tsx # 错误边界
```

### 布局区域 (regions/)

```
frontend/src/app/regions/TitleBar.tsx        # 标题栏
frontend/src/app/regions/CenterPane.tsx       # 中间区（adl-center--tab-host 多标签宿主）
frontend/src/app/regions/CenterTabStrip.tsx   # 中间区标签条
frontend/src/app/regions/LeftSidebar.tsx      # 左侧边栏（剪切看板 + 系统监控）
frontend/src/app/regions/RightPanel.tsx       # 右侧面板（6 工具切换）
frontend/src/app/regions/HamburgerMenu.tsx    # 汉堡菜单（adl-hamburger__*）
frontend/src/app/regions/WindowControls.tsx   # 窗口控制（仅 Tauri）
frontend/src/app/regions/left-sidebar/        # 左栏子模块
frontend/src/app/regions/right-panel/        # 右面板子模块（含 editor-support/）
```

### Zustand Store（32 切片，见 slicedStore.ts）

```
frontend/src/app/stores/slicedStore.ts    # Store 合并入口（32 个 create*Slice，含 8 浏览器 + 3 GitHub）
frontend/src/app/stores/StoreState.ts     # 完整类型定义
frontend/src/app/stores/slices.ts         # 切片统一导出
frontend/src/app/stores/selectors.ts      # 选择器（useShallow）
frontend/src/app/stores/cacheHelpers.ts   # 缓存系统 + clearError/captureError/captureTypedError
frontend/src/app/stores/storageHelpers.ts # localStorage 读写工具（经中心登记表）
frontend/src/app/stores/persisted/registry.ts # 持久化中心登记表（adl:ui.*，唯一写盘入口）
frontend/src/app/stores/constants.ts      # 常量
frontend/src/app/stores/actions/          # 18 个跨切片 action 模块
frontend/src/app/stores/slices/           # 状态切片（含 browser*/centerTabs/ci/clipboard*/communicate/diagnostic/dsh/editor/errorToast/fileOpNotice/git*/github*/notification/patch/reference/search/systemMonitor/terminal/toast/ui/workspace）
```

### IPC 桥接（三端对齐）

```
frontend/src/tauri-bridge.ts       # Tauri 入口（重导出 tauri-bridge/）
frontend/src/tauri-bridge/          # Tauri 桥接（index + tauri-app/browser/clipboard/dsh/reserved/shared/window/workspace）
frontend/src/preview-bridge/        # 浏览器模式桥接（index + preview-browser-audio/diagnostic/events/git/patch/preview-pty-bridge/reachability/search/storage/window/workspace）
frontend/src/mock-bridge.ts         # 纯内存模拟入口（+ mock/ 按域模块）
frontend/src/shared/ipc/            # 25 个 IPC 接口定义文件
frontend/src/shared/ipc/index.ts    # 统一导出（含 DigitalLifeBridge）
frontend/src/shared/typedErrors.ts  # 类型化错误类（fromIpcErrorCode）
frontend/dev/previewWorkspaceService/ # 浏览器模式后端服务（含 writeDebugLogs）
```

### 设计系统

```
frontend/src/design-system/tokens.ts  # 设计 Token 类型真源
frontend/src/design-system/theme.ts   # ThemeController（setTheme({ mode }) + subscribe/dispose/getState）
frontend/src/design-system/components.ts # 组件 API
frontend/src/design-system/icons.ts   # 图标类型
frontend/src/styles/tokens.css        # CSS 变量落点
frontend/src/styles/themes.css        # light/dark 主题变量
```

### 国际化（22 领域 × 中英）

```
frontend/src/app/i18n/zh-CN/          # 中文（23 文件含 index.ts）
frontend/src/app/i18n/en-US/          # 英文（23 文件含 index.ts）
frontend/src/app/i18n/useTCopy.ts     # useTCopy() hook（无 Provider 即抛错）
frontend/src/app/i18n/TCopyContext.tsx # TCopyProvider 上下文
frontend/src/app/i18n/formatT.ts      # 模板插值（可单独导入）
frontend/src/app/i18n/types.ts        # 类型定义
```

### Hooks

```
frontend/src/app/hooks/useKeyboardShortcuts.ts # 快捷键（DEFAULT_COMMANDS）
frontend/src/app/hooks/useKeyCapture.ts        # 按键捕获
frontend/src/app/commands/defaultCommands.ts   # 默认命令注册表（含 settings 快捷键 Ctrl+Shift+Comma）
# ... 更多自定义 Hook
```

## 脚本与配置

```
ai-digital-life/package.json            # 运行脚本（dev:tauri/dev:browser/dev:both/dev:preview，经 scripts/run-project-surface.mjs）
ai-digital-life/pnpm-workspace.yaml     # pnpm 工作区
ai-digital-life/.cargo/config.toml      # Cargo 配置（含 clean/prune/rebuild alias）
.editorconfig                           # 编辑器格式
```

## 测试

```
frontend/src/**/*.test.ts(x)       # 前端 Vitest 测试（与被测模块同级 __tests__/ 或同目录）
crates/*/tests/                     # Rust 集成测试
crates/*/src/**/*.rs（#[cfg(test)]） # Rust 内联单元测试
crates/server/tests/common/mod.rs   # Rust 集成测试共享 helpers
```

## 运行模式

```
cd ai-digital-life
pnpm run dev:browser    # 浏览器预览（Vite + adl-server 真实后端）
pnpm run dev:tauri      # Tauri 桌面
pnpm run dev:both       # 双端同时（一致性验证）
```
