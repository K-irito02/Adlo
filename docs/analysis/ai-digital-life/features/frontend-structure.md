# 前端应用结构

> 实现快照（细节以源码为准）；文件路径速查见 [00-quick-reference.md](../00-quick-reference.md)。

## 目录树

```
frontend/src/app/
├── commands/               # 命令注册系统
│   └── defaultCommands.ts  # 默认命令集 + 快捷键（settings：Ctrl+Shift+Comma）
├── components/             # 通用组件（跨功能域复用）
│   ├── settings/           # 设置面板（SettingsPanel/KeybindSettings/FontControl…）
│   ├── terminal/           # 终端组件（XtermTerminal 等）
│   ├── drag/               # 拖拽相关
│   ├── HintCard/           # Hint 卡片
│   ├── UnderlineTabs/      # 下划线标签页
│   ├── Toast.tsx           # Toast 通知
│   ├── Tooltip.tsx         # 自定义 Tooltip
│   └── ErrorBoundary.tsx   # 错误边界
├── features/               # 25 个功能域（详见下表）
├── hooks/                  # 通用 Hook（useKeyboardShortcuts/useKeyCapture/useEditorReveal…）
├── i18n/                   # 国际化（22 领域 × 中英，详见下表）
├── icons/                  # SVG 图标（actions/core/file/helper/status/terminal-nav/terminal-pane/terminal-profiles）
├── regions/                # 布局区域（详见下表）
├── stores/                 # Zustand 状态管理
│   ├── actions/            # 18 个跨切片 action 模块
│   ├── slices/             # 32 个状态切片（slicedStore.ts 实测）
│   ├── persisted/registry.ts # 持久化中心登记表（唯一写盘入口）
│   ├── StoreState.ts
│   ├── slicedStore.ts
│   ├── selectors.ts
│   ├── cacheHelpers.ts
│   ├── storageHelpers.ts
│   └── constants.ts
├── App.tsx                 # 根组件（TCopyProvider 注入）
└── LazyComponents.tsx      # 懒加载组件注册
```

## 25 个功能域 (features/)

| 功能域 | 目录 |
|--------|------|
| 内置浏览器 | `features/browser/` |
| 浏览器设置 | `features/browser-settings/` |
| 浏览器树 | `features/browser-tree/` |
| 中间区宿主 | `features/center/`（CenterEntryPage：dsh/浏览器/终端三入口） |
| 剪贴板历史 | `features/clipboard-history/` |
| 差异查看器 | `features/diff-viewer/` |
| 分隔线桥接条 | `features/divider-strip/` |
| dsh 宿主 | `features/dsh/` |
| 编辑器 | `features/editor/`（CodeMirror + FoldTooltipOverlay） |
| 文件树 | `features/file-tree/` |
| Git 可视化 | `features/git-visualization/` |
| GitHub 树 | `features/github-tree/` |
| 多工作区 | `features/multi-workspace/` |
| 大纲 | `features/outline/` |
| 补丁审查 | `features/patch-review/` |
| 文件预览 | `features/preview/` |
| 存储设置 | `features/storage-settings/` |
| 系统监视器 | `features/system-monitor/` |
| 终端 | `features/terminal/` |
| 通用树 | `features/tree/` |
| 工作区浏览器 | `features/workspace-browser/` |
| 工作区变更树 | `features/workspace-changes-tree/` |
| 工作区文件树 | `features/workspace-file-tree/` |
| 工作区设置 | `features/workspace-settings/` |
| 工作区终端 | `features/workspace-terminal/` |

> 以下目录不存在，相关能力由第三方 harness（dsh）提供或已下线：`conversation`、`mcp`、`lsp-panel`、`provider-manager`、`permission-settings`、`plugin-manager`、`custom-agent`、`reference-manager`、`session-fork`、`web-search`、`command-editor`。

## 布局区域 (regions/)

```
App.tsx
├── TitleBar                # 自定义标题栏（HamburgerMenu.adl-hamburger__* + CenterTabStrip + WindowControls）
├── LeftSidebar             # 左侧边栏（ClipboardHistoryList + SystemMonitorPanel + ResizeHandle）
├── CenterPane              # 中央多标签宿主（CenterEntryPage + adl-center__empty 缺 tab 提示）
├── RightPanel              # 右侧面板（6 工具切换：files/changes/browser/terminal/settings/communicate）
│   ├── editor-support/     # 编辑器支持（stickyContext.ts/stickyContextView.tsx 已迁入）
│   ├── panels/             # 子面板实现（BrowserPanel/ChangesPanel/FilesPanel/CommunicationPanel…）
│   ├── hooks/              # 右侧面板 Hook（useBrowserPanelProps/useRightPanelViewProps…）
│   ├── ToolSwitcher.tsx    # 工具切换（ToolId 六项）
│   └── types.ts
└── （无底部 StatusBar.tsx；状态信息位于各面板与标题栏）
```

## 国际化 (i18n/，22 领域 × 中英)

```
i18n/
├── en-US/                  # 英文（23 文件含 index.ts）
├── zh-CN/                  # 中文（23 文件含 index.ts）
├── TCopyContext.tsx        # TCopyProvider 上下文
├── useTCopy.ts             # useTCopy() hook（无 Provider 即抛错）
├── formatT.ts              # 模板插值（可单独导入）
├── format.ts               # 格式化工具
├── resolveLanguage.ts      # OS 跟随解析（zh→zh-CN，其余→en-US）
├── getAppCopy.ts / i18nLoader.ts / copyToClipboard.ts
├── index.ts
└── types.ts
```

### 22 个翻译域

| 域 | 说明 |
|----|------|
| approval | 审批流程文案 |
| browser | 浏览器面板文案 |
| changes | 变更面板文案 |
| ci | CI 状态文案 |
| common | 通用文案 |
| communicate | 通讯面板文案 |
| customAgent | 自定义 Agent 文案 |
| dsh | dsh 宿主文案 |
| durable | 持久会话文案 |
| errors | 错误文案 |
| file | 文件操作文案 |
| lsp | LSP 面板文案 |
| mcp | MCP 管理文案 |
| menu | 菜单文案 |
| models | 模型选择文案 |
| notification | 通知文案 |
| reference | 引用管理文案 |
| settings | 设置面板文案 |
| terminal | 终端文案 |
| utilities | 工具文案 |
| webSearch | 网络搜索文案 |
| workspace | 工作区文案 |

## 命令系统 (commands/)

| 文件 | 说明 |
|------|------|
| `defaultCommands.ts` | 默认命令注册表：命令元数据 + 默认快捷键（含 settings `Ctrl+Shift+Comma`） |

消费端：`hooks/useKeyboardShortcuts.ts`（匹配）、`hooks/useKeyCapture.ts`（按键捕获改键）、`regions/titleBarMenus.ts`（菜单快捷键展示）。
