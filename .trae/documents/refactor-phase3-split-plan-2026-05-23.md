# Phase 3 大型组件拆分执行计划

**生成日期**：2026-05-23
**前置条件**：Phase 1/2/4/5 已执行完毕（见 [refactor-fix-plan-2026-05-23.md](./refactor-fix-plan-2026-05-23.md)）

---

## 执行顺序

```
DiffViewer (低风险, 快速收益)
  → TerminalPanel (中风险, 独立域)
  → LeftSidebar (高风险, 最后攻坚)
```

---

## 一、DiffViewer 拆分

### 现状

- `DiffViewer.tsx` — 673 行，混合 3 个组件：`DiffViewer`（路由 53 行）、`SideBySideDiffViewer`（302 行）、`InlineDiffViewer`（159 行）
- 共享代码：`buildSharedExtensions`、5 个 `Compartment` 常量、4 个纯工具函数（共 ~100 行）
- `CodeEditor.tsx` 中也有相似的 `baseExtensions` 构建逻辑（~20 行重复）

### 目标文件结构

```
features/diff-viewer/
├── index.ts                              # 显式导出
├── DiffViewer.tsx                        # ~50 行，路由组件（mode 切换）
├── SideBySideDiffViewer.tsx              # ~300 行，从原文件直接迁移
├── InlineDiffViewer.tsx                  # ~160 行，从原文件直接迁移
├── sharedExtensions.ts                   # ~50 行，buildSharedExtensions + Compartments（新建）
├── diffViewerUtils.ts                    # ~70 行，4 个纯工具函数（getMergeChunks, scroll sync, buildCollapsedUnchangedRanges）
├── scrollbarWidth.ts                     # 已有，不动
├── changePreviewDiffRanges.ts            # 已有，不动
```

### 实施步骤

| 步骤 | 操作 | 文件 | 详细说明 |
|------|------|------|----------|
| 1.1 | **新建** | `sharedExtensions.ts` | 从原 DiffViewer.tsx 提取 `buildSharedExtensions`、5 个 `Compartment`、`COLLAPSE_UNCHANGED_CONFIG`、`MergeChunksResult`/`MergeChunk` 类型 |
| 1.2 | **新建** | `diffViewerUtils.ts` | 从原 DiffViewer.tsx 提取 4 个纯函数：`getMergeChunks`、`computeSyncedScrollTop`、`syncHorizontalScroll`、`buildCollapsedUnchangedRanges`、`syncScrollPosition` |
| 1.3 | **新建** | `SideBySideDiffViewer.tsx` | 原 L158-L458 代码迁移。imports 改为从 `./sharedExtensions` 和 `./diffViewerUtils` 导入 |
| 1.4 | **新建** | `InlineDiffViewer.tsx` | 原 L461-L619 代码迁移。imports 同理 |
| 1.5 | **改造** | `DiffViewer.tsx` | 简化为路由组件：接收 props → 根据 `sideBySide` 渲染 `<SideBySideDiffViewer>` 或 `<InlineDiffViewer>`。导入改为引用 3 个新文件 |
| 1.6 | **更新** | `features/diff-viewer/index.ts` | 补全新导出 |
| 1.7 | **更新** | 所有 `import` 调用方 | grep 全项目 `features/diff-viewer/DiffViewer` → 路径不变（`DiffViewer.tsx` 文件名未变） |

### 验证

```bash
npm --prefix frontend run typecheck
npm --prefix frontend test
```

---

## 二、TerminalPanel 拆分

### 现状

- `TerminalPanel.tsx` — 793 行，包含 10+ 个逻辑域
- 核心共享状态：`xtermRef`、`sessionOutputsRef`、`activeTab`、`contextMenu`
- 外部依赖：`RightPanelViewProps`（从 `../../regions/right-panel/types` 导入）

### 设计决策

使用 **`useTerminalPanel()` 自定义 Hook** 封装所有共享状态和逻辑：

| 封装到 Hook 的内容 | 原因 |
|-------------------|------|
| `xtermRef` (useRef) | 被创建/切换/输出缓冲/Kill 等子域共享 |
| `sessionOutputsRef` (useRef) | 输出缓冲的读写入口点 |
| `activeTab` (useMemo) | 多个子域只读使用 |
| `contextMenu` (useState) | 右键菜单与标签创建的交互 |
| `editingTabId` / `editValue` (useState) | 内联编辑被右键菜单和双击共享 |
| `terminalMenuOpen` / `shellMenuOpen` (useState) | 由统一的外部点击关闭 Effect 管理 |
| 对外 effect 订阅 | `subscribePtyOutput`、`onClickOutside` 放在 hook 内管理生命周期 |

### 目标文件结构

```
features/terminal/
├── index.ts                              # 导出
├── TerminalPanel.tsx                     # ~200 行 主容器
├── useTerminalPanel.ts                   # ~250 行 自定义 Hook（封装所有共享状态 + 逻辑）
├── TerminalTabBar.tsx                    # ~130 行 标签栏 + 拖拽排序 + 右键菜单触发
├── TerminalEmptyState.tsx                # ~80 行 空白引导页 + Shell 选择
├── TerminalShellSelector.tsx             # ~60 行 Shell 类型选择下拉
├── TerminalContextMenu.tsx               # ~50 行 右键菜单 Portal 渲染
├── TerminalMenuDropdown.tsx              # ~50 行 三点菜单下拉（Copy/Paste/Clear/Kill）
└── TerminalNavigator.tsx                 # ~50 行 导航器面板（历史记录管理）
```

### 实施步骤

| 步骤 | 操作 | 文件 | 详细说明 |
|------|------|------|----------|
| 2.1 | **新建** | `useTerminalPanel.ts` | 提取所有共享状态/ref/回调到自定义 Hook。签名：`function useTerminalPanel(props: RightPanelViewProps)`。返回：`{ xtermRef, sessionOutputsRef, activeTab, contextMenu, editingTabId, editValue, terminalMenuOpen, shellMenuOpen, handleCreateTab, handleSelectTab, handleCloseTab, handleCloseAllTabs, handleDragStart/End/Over/Drop, handleTogglePin, handleContextMenu, handleDoubleClick, handleEditSubmit, handleEditKeyDown, handleCopy, handlePaste, handleClear, handleKill, updateProfile, ... }` |
| 2.2 | **新建** | `TerminalTabBar.tsx` | 标签栏组件。Props：`{ tabs, activeTabId, onSelectTab, onCloseTab, onDragStart, onDragEnd, onDragOver, onDrop, onContextMenu, onDoubleClick } + pin 相关`。渲染标签列表 |
| 2.3 | **新建** | `TerminalEmptyState.tsx` | 空白引导组件。Props：`{ profiles, onSelectProfile }`。渲染 Shell 类型按钮 + 说明文字 |
| 2.4 | **新建** | `TerminalShellSelector.tsx` | Shell 选择下拉组件。Props：`{ currentProfile, profiles, menuOpen, onToggle, onSelect, menuRef }`。渲染 SplitPill 按钮组 |
| 2.5 | **新建** | `TerminalContextMenu.tsx` | 标签右键菜单。Props：`{ contextMenu, onTogglePin, onRename, onDelete, onClose }`。通过 `createPortal` 渲染浮动定位菜单 |
| 2.6 | **新建** | `TerminalMenuDropdown.tsx` | 三点菜单。Props：`{ menuOpen, menuRef, onCopy, onPaste, onClear, onKill }` |
| 2.7 | **新建** | `TerminalNavigator.tsx` | 导航器面板。Props：`{ commandHistory, navigatorMode, onModeChange, onSelectHistory }` |
| 2.8 | **改造** | `TerminalPanel.tsx` | 调用 `useTerminalPanel(props)` 获取所有状态/回调，作为组合容器组合各子组件。删除所有原逻辑代码 |
| 2.9 | **补充** | i18n 词汇表 | 将 11 处硬编码中文字符串替换为 `t()` 调用，在 `locales/zh-CN.ts` 和 `locales/en-US.ts` 中补充对应词条 |

### 验证

```bash
npm --prefix frontend run typecheck
npm --prefix frontend test
# 浏览器模式手动验证：创建终端 / 切换 tab / 右键菜单 / Kill / 空白状态引导
```

---

## 三、LeftSidebar 拆分

### 现状

- `LeftSidebar.tsx` — 1796 行
- 28 个 props（10 数据 + 18 回调）
- 紧耦合群组：拖放状态（6+ 共享 state/ref 在 8 个回调间穿梭）、sidebarViewModel 驱动所有渲染
- 约 210 行 Mock 死代码（`usingMockStandaloneSessions = false`）

### 设计决策

- **Mock 代码**：直接删除（用户确认：`usingMockStandaloneSessions = false`）
- **拖放重排**：合并到 `SessionList` 组件内部（用户确认），保持内部耦合但对外简洁
- **子组件数据**：props 透传方式，`LeftSidebar` 接收全部 28 个 props，分发给子组件（最大程度保持外部接口不变）

### 目标文件结构

```
regions/
├── LeftSidebar.tsx                           # ~80 行 合成容器
├── left-sidebar/
│   ├── index.ts                              # 重新导出 LeftSidebar（或直接从 LeftSidebar.tsx 导出）
│   ├── WorkspaceList.tsx                     # ~165 行 工作区列表渲染 + 展开/折叠 + 右键菜单触发
│   ├── SessionList.tsx                       # ~450 行 会话列表渲染 + 拖放重排 + 分页控制 + 重命名内联编辑（含 Mock 移除后的精简）
│   ├── ConversationPanel.tsx                 # ~60 行 对话面板 + 高度调整
│   ├── ResizeHandle.tsx                      # ~60 行 侧边栏宽度拖拽 + 对话面板高度拖拽
│   ├── SidebarContextMenu.tsx                # ~80 行 右键菜单 Portal 组件（合并 workspace/session 两种菜单项构建）
│   └── mockData.ts                           # 删除（不创建此文件）
```

### 实施步骤

#### 3.0 准备阶段

| 步骤 | 操作 | 说明 |
|------|------|------|
| 3.0a | 建立 `regions/left-sidebar/` 目录 | 创建新目录 |
| 3.0b | 分析所有 props 流向 | 确认每个子组件接收哪些 props 子集 |

#### 3.1 SidebarContextMenu 提取（最独立，最优先行）

| 子步骤 | 说明 |
|--------|------|
| 移动 `SidebarMenuState` 类型 | 原 L101-L103 |
| 移动 `SidebarMenuItem` 类型 | 原 L366-L372 |
| 移动 `STATUS_LABEL` 常量 | 原 L105-L111 |
| 移动 `SidebarContextMenu` 组件 | 原 L374-L430。改为接收 `{ menuState, renderMenuItems, onClose, onAction }` props |
| 移动 `buildWorkspaceTooltip` | 原 L302-L307 |
| 移动 `exportSessionMarkdown` | 原 L309-L323 |
| 移动 `StatusLamp` / `WorkspaceDirectoryIcon` | 原 L270-L300 |
| 移动 `renderWorkspaceMenu()` | 原 L1066-L1100 → 改为纯函数 `buildWorkspaceMenuItems()` |
| 移动 `renderSessionMenu()` | 原 L1102-L1158 → 改为纯函数 `buildSessionMenuItems()` |

**新文件**: `SidebarContextMenu.tsx` — ~80 行。包含组件 + 类型 + 菜单项构建函数。

#### 3.2 ResizeHandle 提取

| 子步骤 | 说明 |
|--------|------|
| 移动 `handleResizeMouseDown` | 原 L740-L796。改为独立组件，接收 `{ onResize }` 回调 |
| 移动 `handleConversationResizeMouseDown` | 原 L820-L875。同上 |
| 移动 `readConversationPanelHeight` / `writeConversationPanelHeight` / `clampConversationPanelHeight` | 原 L45-L67 |

**新文件**: `ResizeHandle.tsx` — ~60 行。

#### 3.3 ConversationPanel 提取

| 子步骤 | 说明 |
|--------|------|
| 移动对话面板 state | `conversationsCollapsed`（原 L470）、`conversationPanelHeight`（原 L480）、`conversationResizeCleanupRef`（原 L504） |
| 移动 `getConversationPanelMaxHeight` | 原 L564-L571 |
| 移动 `syncConversationPanelHeight` effect | 原 L573-L588 |
| 移动 JSX | 原 L1713-L1771 |

**新文件**: `ConversationPanel.tsx` — ~60 行。

#### 3.4 WorkspaceList 提取

| 子步骤 | 说明 |
|--------|------|
| 移动 `workspaceItems` 派生变量 | 原 L496 |
| 移动 `expandedSessionWorkspaces` / `toggleSessionWorkspace` 的 useUiStore | 原 L463-L468 |
| 移动 `handleWorkspaceDrop` | 原 L798-L818（含拖放逻辑） |
| 移动 `renderWorkspaceMenu` 调用（buildWorkspaceMenuItems 已在 ContextMenu 模块中） | 移除函数定义，只保留调用 |
| 移动 JSX | 原 L1546-L1710 |

**新文件**: `WorkspaceList.tsx` — ~165 行。

#### 3.5 SessionList 提取（最大块）

| 子步骤 | 说明 |
|--------|------|
| 删除所有 Mock 相关代码 | 原 L115-L268, L481-L482, L497, L590-L738 — 共计 ~210 行直接删除 |
| 移动会话相关 ref | `dragOverSessionIdRef`（L506）、`dropFlashTimeoutRef`（L505）、`draggingRef`（L501）、`cleanupDragRef`（L503）、`rafRef`（L502） |
| 移动会话相关 state | `dragSessionId`（L475）、`dragOverSessionId`（L476）、`droppedSessionId`（L477）、`expandedSessionLists`（L479）、`ephemeralVisibleSessionIds`（L483）、`archiveOpen`（L469）、`hoveredSessionId`（L471）、`renamingSessionId`（L473）、`renameDraft`（L474） |
| 移动 `sessionItemsById` useMemo | 原 L509-L526 |
| 移动 `sidebarViewModel` useMemo | 原 L485-L495（注意：这会依赖 `buildSidebarViewModel` 导入） |
| 移动 `displayStandaloneSessions` / `displayStandaloneArchivedSessions` | 原 L498-L499 |
| 移动所有拖放回调（8 个 handleSession*） | 原 L877-L1064 |
| 移动 `setDragOverSessionTarget` / `flashDroppedSession` | 原 L545-L562 |
| 移动 `removeEphemeralVisibleSessionId` | 原 L613-L623 |
| 移动 4 个 moveId* 模块级函数 | 原 L325-L351 |
| 移动 `mergeEphemeralVisibleSessions` | 原 L353-L364 |
| 移动 `renderSessionRows()` | 原 L1199-L1476 |
| 移动 `renderSessionLimitControl()` | 原 L1160-L1197 |
| 移动清理 useEffect | 原 L528-L543 |

**新文件**: `SessionList.tsx` — ~450 行。

#### 3.6 LeftSidebar 合成容器改造

**LeftSidebar.tsx**（改造后）:

```tsx
export function LeftSidebar(props: LeftSidebarProps) {
  const { t, locale, collapsed, ... } = props;

  return (
    <aside className="adl-sidebar">
      <ResizeHandle onResize={handleWidthResize} />
      <div ref={contentRef} className="adl-sidebar__content">
        <WorkspaceList
          workspaces={props.recentWorkspaces}
          expandedSessionWorkspaces={expandedSessionWorkspaces}
          onToggleWorkspace={toggleSessionWorkspace}
          onDrop={handleWorkspaceDrop}
          onPin={props.onPinWorkspace}
          onUnpin={props.onUnpinWorkspace}
          onRemove={props.onRemoveWorkspace}
          onReveal={props.onRevealWorkspace}
        />
        <SessionList
          t={t}
          locale={locale}
          sessions={sessions}
          sessionDetails={sessionDetails}
          activeSessionId={activeSessionId}
          streamingActiveRunId={streamingActiveRunId}
          indexingStatus={indexingStatus}
          onSelectSession={props.onSelectSession}
          onPinSession={props.onPinSession}
          onUnpinSession={props.onUnpinSession}
          onRenameSession={props.onRenameSession}
          onArchiveSession={props.onArchiveSession}
          onArchiveAllSessions={props.onArchiveAllSessions}
          onMarkRead={props.onMarkSessionRead}
          onMarkUnread={props.onMarkSessionUnread}
          onMarkAllRead={props.onMarkAllSessionsRead}
          onReorderSessions={props.onReorderSessions}
          onDeleteSession={props.onDeleteSession}
          onOpenWorkspace={props.onOpenWorkspace}
        />
        <ConversationPanel
          collapsed={conversationsCollapsed}
          onToggleCollapse={toggleConversationsCollapse}
        />
      </div>
    </aside>
  );
}
```

### 验证

```bash
npm --prefix frontend run typecheck           # 无类型错误
npm --prefix frontend test                     # 全部 183 个测试通过
# 手动验证：
#   1. 工作区列表展开/折叠正常
#   2. 会话拖放重排正常
#   3. 右键菜单workspace/session正常
#   4. 侧边栏宽度调整正常
#   5. 对话面板高度调整正常
#   6. 新工作区/新会话正常工作
```

---

## 风险评估与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| LeftSidebar 拆分后拖放功能异常 | 🟡中 | 🔴高 | 每次提取后立即 `typecheck` + 手动验证拖放；保留原文件至所有验证通过再删除 |
| TerminalPanel 的 useTerminalPanel Hook 遗漏共享状态 | 🟡中 | 🟡中 | 先在原文件中定义 Hook 并逐步迁移（从最独立的子域开始），每次迁移后运行 `typecheck` |
| DiffViewer 的 sharedExtensions 与 CodeEditor 的 baseExtensions 重复 | 🟢低 | 🟢低 | 待拆分完成后统一提取（作为独立后续任务，不纳入本轮范围） |
| import 路径在大规模文件迁移过程中出错 | 🟡中 | 🟡中 | 每步 typecheck 验证，不做批量操作 |

---

## 验证完成确认清单

| 检查项 | 命令 |
|--------|------|
| 前端类型检查 | `npm --prefix frontend run typecheck` |
| 前端测试 | `npm --prefix frontend test` |
| 功能回归 DiffViewer | 浏览器模式打开 diff 视图，切换 sideBySide 模式，确认滚动同步/折叠正常 |
| 功能回归 TerminalPanel | 创建终端 → 切换 tab → 右键菜单 → Kill → 空白状态 |
| 功能回归 LeftSidebar | 展开工作区 → 拖放重排会话 → 右键菜单 → 调整宽度 → 对话面板高度调整 |

---

> 基于 [refactor-insight-2026-05-23.md](../../docs/重构洞察/refactor-insight-2026-05-23.md) 和 [refactor-fix-plan-2026-05-23.md](./refactor-fix-plan-2026-05-23.md) 制定

---

## 执行完成状态

| 任务 | 状态 | 验证 |
|------|------|------|
| DiffViewer 拆分（5 个文件） | ✅ | typecheck + 183 test 通过 |
| TerminalPanel 拆分（8 个文件） | ✅ | typecheck + 183 test 通过 |
| LeftSidebar 拆分（7 个文件） | ✅ | typecheck + 183 test 通过 |
| Mock 死代码删除（~210 行） | ✅ | — |
| i18n 硬编码替换（11 处） | ✅ | — |
| Rust 编译 | ✅ | cargo check 通过 |

### 文件变更统计

| 指标 | 数值 |
|------|------|
| 新建文件 | 17 个 |
| 修改文件 | 5 个（LeftSidebar.tsx, DiffViewer.tsx, TerminalPanel.tsx, copy.ts, index.ts） |
| 删除代码 | ~210 行 Mock 死代码 |
| 总代码削减 | LeftSidebar: 1796→292 行, DiffViewer: 673→77 行, TerminalPanel: 793→236 行 |
