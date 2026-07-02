# 重构实施计划 – 2026-06-29

## 执行顺序

按优先级排序，同优先级中按"最小变更→最大变更"排序：

| 序号 | 任务 | 优先级 | 变更范围 | 预计影响 |
|------|------|--------|----------|----------|
| 1 | Rust task.rs L486 unwrap 修复 | 🔴高 | 单文件 | 低风险 |
| 2 | console.log 清理（fetchPageMeta 6处 + mock-bridge 2处 + ciSlice 1处） | 🔴高 | 3 文件 | 低风险 |
| 3 | App.tsx getState() activeSessionId 改选择器订阅 | 🔴高 | 单文件 | 低风险 |
| 4 | Rust agent_pipeline.rs clone 消除（8→4） | 🔴高 | 单文件 | 低风险 |
| 5 | Rust patch.rs clone 消除（8→4） | 🔴高 | 单文件 | 低风险 |
| 6 | Rust workspace_sidebar.rs clone 消除（7→3） | 🔴高 | 单文件 | 低风险 |
| 7 | BrowserPanel.tsx 提取 BrowserPanelToolbar + BrowserPanelDialogs | 🔴高 | 多文件 | 中风险 |
| 8 | BrowserNavigator.tsx 按导航模式拆分（4 子组件） | 🔴高 | 多文件 | 中风险 |
| 9 | 深层相对导入替换（100 文件，分 3 批） | 🔴高 | 多文件 | 高风险 |
| 10 | React.lazy/Suspense 恢复（12 个重型组件） | 🔴高 | 多文件 | 中风险 |
| 11 | CSS !important 清理（diff-*.css 系列 147 处） | 🔴高 | 3 文件 | 中风险 |
| 12 | useBrowserTreeActions.ts 按操作域拆分（512→3 Hook） | 🟡中 | 多文件 | 中风险 |
| 13 | useBrowserTreeData.ts 提取子 Hook（456→3 Hook） | 🟡中 | 多文件 | 中风险 |
| 14 | useChangesPanelStateUtils.ts 按功能域拆分（411→3 文件） | 🟡中 | 多文件 | 低风险 |
| 15 | useBrowserUrlChange.ts 提取子 Hook（319→2 Hook） | 🟡中 | 多文件 | 中风险 |
| 16 | BrowserPanelContent.tsx 提取子组件（397→2 组件） | 🟡中 | 多文件 | 中风险 |
| 17 | BrowserEntrySubEntries.tsx 按视图模式拆分（337→2 组件） | 🟡中 | 多文件 | 中风险 |
| 18 | Rust task.rs clone 消除 + approval 子模块（10→5） | 🟡中 | 多文件 | 中风险 |
| 19 | kernel/index.ts 按域拆分为子模块（1158→barrel） | 🟡中 | 多文件 | 高风险 |
| 20 | shared/ipc.ts 按功能域拆分（1296→barrel） | 🟡中 | 多文件 | 高风险 |
| 21 | crates/workspace/lib.rs 测试代码迁移 | 🟡中 | 单文件 | 低风险 |
| 22 | githubRepoSlice.ts 拆分（422→2 片） | 🟡中 | 多文件 | 中风险 |
| 23 | crates/model-gateway/lib.rs 精简为 barrel | 🟢低 | 单文件 | 低风险 |
| 24 | crates/browser/browser_webview.rs clone 消除 | 🟢低 | 单文件 | 低风险 |

## 执行原则

1. **先小后大**：优先执行单文件、低风险变更，积累信心后再推进大范围变更
2. **每步验证**：每完成一项变更，立即运行类型检查 + 相关测试
3. **不破坏现有功能**：所有修改不得改变 UI/UX 行为
4. **失败即停**：任一步骤失败，停止后续执行，分析原因后决策

## 分批执行

### 第 1 批（低风险快赢，预计 6 项）
序号 1-6：单文件 Rust 修复 + 前端清理 + 单文件 clone 消除

### 第 2 批（中风险组件拆分，预计 4 项）
序号 7-10：BrowserPanel/Navigator 拆分 + 深层导入 + React.lazy

### 第 3 批（中风险 Hook/Store 拆分，预计 6 项）
序号 11-16：Hook 拆分 + CSS 清理 + BrowserPanelContent/BrowserEntrySubEntries

### 第 4 批（高风险大型模块拆分，预计 4 项）
序号 17-20：kernel/index.ts + shared/ipc.ts + Rust task.rs + githubRepoSlice

### 第 5 批（低优先级收尾，预计 2 项）
序号 21-22：model-gateway 精简 + browser_webview clone

## 风险控制

| 风险项 | 缓解措施 |
|--------|----------|
| 深层相对导入替换导致编译错误 | 分批替换，每批 30 文件，批次间运行 typecheck |
| 组件拆分导致 props 传递断裂 | 拆分前先记录现有 props 契约，拆分后确认所有调用点更新 |
| React.lazy 恢复导致首屏闪烁 | 确保 Suspense fallback 组件存在且匹配 loading 状态样式 |
| kernel/index.ts 拆分导致导入断裂 | 保留 index.ts 作为 barrel re-export，内部拆分为子模块 |
| CSS !important 清理导致 CodeMirror 样式错乱 | 仅清理 diff-*.css 系列，保留 cm-overrides.css 和 terminal-panel.css 的 !important |
| 大范围变更导致编译错误 | 拆分后立即运行 `pnpm typecheck` 确认零错误 |

## 关键注意事项

### console.log 清理策略
- 保留 `debugLogCollector.ts`（15 处，调试基础设施）
- 保留 `ErrorBoundary.tsx`（1 处 console.error，合理）
- 清理 `fetchPageMeta.ts`（6 处）、`mock-bridge.ts`（2 处）、`ciSlice.ts`（1 处）

### CSS !important 清理策略
- 只清理 `diff-viewer.css`（68）、`diff-inline.css`（46）、`diff-side-by-side.css`（33）
- 保留 `cm-overrides.css`（38）、`terminal-panel.css`（18）等第三方库覆盖
- 通过提高选择器特异性替代 `!important`

### React.lazy 恢复策略
- 目标组件：RightPanel、EditorSurfaceShell、DiffEditorSection、ChangesPanel、GitHubPanel、BrowserPanel、TerminalPanel、SearchPanel、FilesPanel、SettingsPanel、AuditPanel、ModelPanel
- Suspense fallback：使用现有骨架屏样式

### 深层导入替换策略
- 分 3 批，每批 ~30 文件
- 优先替换 browser 模块（导入最密集）
- 使用 `@` 别名替换 `../../` 及以上深度