# React 编码模式

> 源码路径：`ai-digital-life/frontend/src/`

## 组件拆分阈值

| 指标 | 阈值 | 行为 |
|------|------|------|
| 文件行数 | > 200 行 | 拆分子组件或提取 Hook |
| 条件渲染分支 | > 5 个 | 提取为独立子组件 |
| 状态变量 | > 5 个 `useState` | 考虑合并状态或使用 `useReducer` |
| `useEffect` | > 3 个 | 考虑提取自定义 Hook |
| props | > 6 个 | 考虑拆分子组件或使用组合模式 |
| 内联函数 | > 3 个传给子组件 | 提取为命名函数或用 `useCallback` |
| 嵌套层级 | > 4 层 | 提取中间件子组件 |

## Hook 设计规则

- 每个自定义 Hook 只做一件事（单一职责）
- 禁止在 Hook 内部直接访问 Store（通过参数注入）
- 命名约定：`use{Feature}{Action}`，如 `useTCopy`、`useIsTauri`、`useTheme`
- Hook 返回类型必须显式定义

```typescript
// ✅ 正确模式
export function useTCopy() {
  const { t, locale } = useTranslation();
  return { t, locale };
}

// ✅ 环境检测 Hook
export function useIsTauri(): boolean {
  const [isTauri] = useState(() => typeof window !== 'undefined' && '__TAURI__' in window);
  return isTauri;
}
```

## 功能域目录组织

```
features/{domain}/
├── index.ts              # 导出（组件 + 子组件）
├── {Domain}Panel.tsx     # 主面板组件
├── {SubComponent}.tsx    # 子组件
├── {SubComponent}.module.css  # 组件样式
└── {SubComponent}.test.ts     # 组件测试
```

通用组件目录：
```
components/{category}/
├── {Component}.tsx       # 组件
├── {Component}.module.css  # 样式
└── index.ts              # 导出
```

当前功能域（26 个）：
```
features/browser/             # 内置浏览器面板
features/browser-tree/        # 浏览器树形目录
features/terminal/            # 终端面板
features/diff-viewer/         # 差异查看器
features/editor/              # CodeMirror 编辑器
features/conversation/        # 对话消息块
features/file-tree/           # 文件树
features/workspace-file-tree/ # 工作区文件树
features/workspace-changes-tree/ # 工作区变更树
features/workspace-terminal/  # 工作区终端
features/workspace-browser/   # 工作区浏览器
features/multi-workspace/     # 多工作区容器
features/github-tree/         # GitHub 仓库树
features/outline/             # 大纲树
features/preview/             # 文件预览
features/patch-review/        # 补丁审查
features/mcp/                 # MCP 管理
features/lsp-panel/           # LSP 面板
features/provider-manager/    # 提供商管理
features/permission-settings/ # 权限规则编辑
features/plugin-manager/      # 插件管理
features/custom-agent/        # 自定义 Agent
features/reference-manager/   # 引用管理
features/session-fork/        # 会话 Fork
features/web-search/          # 网络搜索
features/command-editor/      # 命令编辑
features/tree/                # 通用树骨架
```

## i18n useTCopy 模式

所有 UI 展示文本必须使用 i18n key，禁止硬编码中英文。

```typescript
// ✅ 正确
function MyComponent() {
  const { t } = useTCopy();
  return <div>{t('workspace.title')}</div>;
}

// ❌ 错误
function MyComponent() {
  return <div>{'工作区'}</div>;
}
```

- i18n 文件：`frontend/src/app/i18n/en-US/`（26 域）和 `frontend/src/app/i18n/zh-CN/`（26 域）
- Hook：`frontend/src/app/hooks/useTCopy.ts`
- 语言切换时标题行/路径栏的渲染条件必须使用稳定性 fallback

## ErrorBoundary 模式

根级 ErrorBoundary 在 `frontend/src/app/components/ErrorBoundary.tsx`。

```typescript
<ErrorBoundary fallback={<ErrorFallback />}>
  <App />
</ErrorBoundary>
```

- 功能域级别的 ErrorBoundary 包装复杂面板
- 捕获渲染阶段错误，不捕获异步/事件错误

## Lazy Loading 模式（LazyComponents）

大型功能域使用 React.lazy 延迟加载，减少首屏包体积。

```typescript
const BrowserPanel = React.lazy(() => import('@features/browser/BrowserPanel'));
const TerminalPanel = React.lazy(() => import('@features/terminal/TerminalPanel'));
```

根级 LazyComponents 注册于 `frontend/src/app/LazyComponents.tsx`。

## Import 别名约定

定义于 `vite.config.ts`（resolve.alias）和 `tsconfig.json`（paths）。

| 别名 | 映射路径 | 用途 |
|------|----------|------|
| `@app` | `src/app` | 应用根级组件/配置 |
| `@features` | `src/app/features` | 功能域组件 |
| `@stores` | `src/app/stores` | Zustand Store 相关 |
| `@components` | `src/app/components` | 通用组件 |
| `@icons` | `src/app/icons` | 图标资源 |
| `@i18n` | `src/app/i18n` | 国际化 |
| `@utils` | `src/app/utils` | 工具函数 |
| `@hooks` | `src/app/hooks` | 自定义 Hook |
| `@regions` | `src/app/regions` | 布局区域 |
| `@shared` | `src/shared` | 共享类型/IPC/工具 |
| `@root` | `src/` | 前端根目录 |
| `@tauri-bridge` | `src/tauri-bridge` | Tauri IPC 桥接 |
| `@ai-digital-life/kernel` | `src/kernel/index.ts` | 核心类型桥接 |

## 文件参考

| 路径 | 职责 |
|------|------|
| `frontend/src/main.tsx` | 应用入口（React 挂载） |
| `frontend/src/app/App.tsx` | 根组件 |
| `frontend/src/app/LazyComponents.tsx` | 延迟加载组件注册 |
| `frontend/src/app/components/ErrorBoundary.tsx` | 错误边界 |
| `frontend/src/app/hooks/useTCopy.ts` | i18n Hook |
| `frontend/src/app/hooks/useIsTauri.ts` | 环境检测 Hook |
| `frontend/src/app/hooks/useTheme.ts` | 主题 Hook |
| `frontend/src/app/features/` | 26 个功能域 |
| `frontend/src/app/components/` | 通用组件（9 子目录） |
| `frontend/src/app/regions/` | 布局区域（StatusBar/Sidebar/Panel） |
| `frontend/src/app/i18n/` | 国际化（52 文件） |
| `frontend/src/app/commands/` | 命令注册表 |
| `frontend/vite.config.ts` | Vite 配置（别名/构建/插件） |
