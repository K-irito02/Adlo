# 重构实施计划 – 2026-06-27

## 执行顺序

按优先级排序，同优先级中按"最小变更→最大变更"排序：

| 序号 | 任务 | 优先级 | 变更范围 | 预计影响 |
|------|------|--------|----------|----------|
| 1 | Rust browser.rs Mutex unwrap 修复 | 🔴高 | 单文件 | 低风险 |
| 2 | App.tsx getState() activeSessionId 改选择器订阅 | 🔴高 | 单文件 | 低风险 |
| 3 | React.memo 恢复：30+ 个列表项/叶子组件添加 memo | 🔴高 | 多文件 | 中风险 |
| 4 | React.lazy/Suspense 恢复：12 个重型组件 | 🔴高 | 多文件 | 中风险 |
| 5 | BrowserNavigator.tsx 按导航模式拆分（4 子组件） | 🔴高 | 多文件 | 中风险 |
| 6 | BrowserPanelContent.tsx 提取子组件 | 🔴高 | 多文件 | 中风险 |
| 7 | BrowserEntrySubEntries.tsx 按视图模式拆分 | 🔴高 | 多文件 | 中风险 |
| 8 | useBrowserTreeActions.ts 按操作域拆分为 3 Hook | 🟡中 | 多文件 | 中风险 |
| 9 | useChangesPanelState.tsx 提取子 Hook | 🟡中 | 多文件 | 低风险 |
| 10 | useBrowserUrlChange.ts 提取子 Hook | 🟡中 | 多文件 | 中风险 |
| 11 | BrowserPanel.tsx 提取子组件（Toolbar + Dialogs） | 🟡中 | 多文件 | 中风险 |
| 12 | kernel/index.ts 按域拆分为子模块 | 🟡中 | 多文件 | 高风险 |
| 13 | model-gateway/src/lib.rs 模块化拆分 | 🟡中 | 单文件 | 低风险 |
| 14 | Rust agent_pipeline.rs 剩余 clone 消除 | 🟡中 | 单文件 | 低风险 |
| 15 | Rust task.rs clone 消除 + approval 子模块 | 🟡中 | 多文件 | 中风险 |

## 执行原则

1. **先小后大**：优先执行单文件、低风险变更，积累信心后再推进大范围变更
2. **每步验证**：每完成一项变更，立即运行类型检查 + 相关测试
3. **不破坏现有功能**：所有修改不得改变 UI/UX 行为
4. **失败即停**：任一步骤失败，停止后续执行，分析原因后决策

## 风险控制

| 风险项 | 缓解措施 |
|--------|----------|
| React.memo 恢复导致功能回归 | 逐组件添加，每批次运行 typecheck + 前端测试验证。先覆盖列表项组件（渲染量最大） |
| React.lazy 恢复导致首屏闪烁 | 确保 Suspense fallback 组件存在且匹配 loading 状态样式 |
| 组件拆分导致 props 传递断裂 | 拆分前先记录现有 props 契约，拆分后确认所有调用点更新 |
| 大范围组件拆分导致编译错误 | 拆分后立即运行 `pnpm typecheck` 确认零错误 |
| Rust 签名变更导致编译失败 | 先 `cargo check`，再 `cargo test` |
| kernel/index.ts 拆分导致导入断裂 | 保留 index.ts 作为 barrel re-export，内部拆分为子模块 |

## 关键注意事项

### React.memo 恢复策略
- **优先级顺序**：列表项组件 > 叶子展示组件 > 面板头部组件 > 工具栏组件
- **必须配合** `useCallback` 稳定化事件处理函数引用，否则 memo 无效
- **目标组件清单**（基于历史记录）：BrowserTreeEntry、GitHubTreeEntry、WorkspaceFileTreeEntry、WorkspaceChangesEntry、TreeNodeRow、SessionListItem、GitHubCITreeItem、TerminalEntry 等 ~30 个

### React.lazy 恢复策略
- **目标组件**（基于第 53 轮记录）：RightPanel、EditorSurfaceShell、DiffEditorSection、ChangesPanel、GitHubPanel、BrowserPanel、TerminalPanel、SearchPanel、FilesPanel、SettingsPanel、AuditPanel、ModelPanel 等 12 个重型组件
- **Suspense fallback**：使用现有骨架屏样式或简单的 Loading spinner

### 组件拆分策略
- BrowserNavigator 4 模式拆分风险最高（80 轮刚重构），需谨慎保持导航切换逻辑完整
- BrowserEntrySubEntries 拆分涉及 3 种渲染模式，需确保 list/view/tree 切换无残影
