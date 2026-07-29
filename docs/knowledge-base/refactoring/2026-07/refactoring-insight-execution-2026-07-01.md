# refactoring-insight 全流程执行（2026-07-01~02）

## 背景

通过 `refactoring-insight` 技能系统性执行重构洞察工作流：6 阶段、18 任务，使用子代理驱动开发（Subagent-Driven Development, SDD）模式在隔离 git worktree 中完成，最终 fast-forward 合并到 main。

## 工作流架构

```
refactoring-insight 技能（6 阶段）
├── Phase 0：worktree 隔离（.worktrees/refactor-insight-main, 分支 refactor-insight-2026-07-01）
├── Phase 1：宏观审查
├── Phase 2：并行扫描代理（4 维度：前端 TS/React、Rust、CSS、跨领域）
├── Phase 3：洞察报告生成 + 行数验证
├── Phase 4：实施计划生成（18 任务）
├── Phase 5：SDD 执行（每任务一个新子代理 + 任务审查）
└── Phase 6：最终验证 + 分支收尾
```

## 关键经验

### 1. SDD 模式的优势

- **隔离上下文**：每任务一个新子代理，避免上下文污染
- **进度记录**：`.superpowers/sdd/progress.md` 记录所有任务状态，支持会话压缩后恢复
- **任务审查**：每任务后 dispatch reviewer 子代理验证 spec 合规 + 代码质量

### 2. 行数验证的重要性

并行扫描代理报告的行数不准确（BrowserPanel.tsx 报告 841 行，实际 778 行）。**撰写报告前必须用 PowerShell `Measure-Object -Line` 直接验证所有文件大小**。这影响优先级判定：BrowserPanel.tsx (778 行) 实际低于 800 行阈值，从 🔴 高优先级变更为 🟡 中优先级。

### 3. 子代理偏差的处理

子代理可能因实际情况与计划描述不符而偏差。处理原则：
- **目标导向**：偏差不阻塞，只要达成核心目标（<400 行、循环打破等）
- **记录透明**：在 progress.md 记录所有偏差和原因
- **审查宽容**：reviewer 接受合理的偏差，但要求记录

**本次偏差案例**：
- Task 11：计划描述 `setGitHubAccessToken` 等 token 函数，实际内联在 `gitHubSaveFolderConfig`。子代理改提取 `collectDescendantFolderIds` + `collectAffectedWorkspaceIds` 到 helpers 文件
- Task 12：计划描述 Crud=create/rename/delete + Reorder=drag/pin，实际文件无这些操作。子代理按实际语义拆分
- Task 14：clippy 要求移除 `mut`（`prune_old_sessions(&self)`），与计划文本不符
- Task 16：消除 clone 需要级联调整函数签名（owned `WorkspaceMeta` 贯穿调用链）
- Task 17：复用现有 i18n 键（DRY），不创建新的 `quickActions*` 键

### 4. leaf module 模式打破循环依赖

`browserFoldersSlice` ↔ `browserBookmarkSlice` 之间存在常量/类型循环导入。解决方案：创建 `browserSliceShared.ts` 作为 leaf module，承载跨切片共享的类型和常量。所有切片导入 shared，shared 不导入任何切片。

```typescript
// browserSliceShared.ts (leaf module)
export type { BookmarkTabItem, TabFolderState, TabFolderStateUpdate } from './browserFoldersTypes';
export type { BrowserTabState, BrowserTabStateUpdate };  // 从 browserTabsSlice 移入
export const BROWSER_BOOKMARKS_STORAGE_KEY = 'adl-ui:browser-bookmarks';
export const BROWSER_BOOKMARK_TABID_URL_MAP_KEY = 'adl-ui:browser-bookmark-tabid-url-map';
```

### 5. Windows worktree 清理的特殊处理

Windows 长路径（>260 字符）导致 `git worktree remove --force` 失败。解决方案：

```powershell
# 使用 robocopy 镜像空目录到目标（绕过长路径限制）
$empty = "...\.empty-tmp"
New-Item -ItemType Directory -Path $empty -Force | Out-Null
robocopy $empty $target /MIR /NFL /NDL /NJH /NJS /NC /NS /NP
Remove-Item -Recurse -Force $target
Remove-Item -Recurse -Force $empty
```

### 6. 已知预存问题不应阻塞验收

- `frontend/src/shared/ipc-types.generated.ts:2` 的 TS2307（`serde_json/JsonValue`）是预存环境问题。子代理创建 gitignored shim（`crates/kernel/bindings/serde_json/JsonValue.d.ts`），视为环境设置步骤（类似 `pnpm install`），不作为代码变更提交
- 6202 个 ESLint CRLF 警告（`prettier/prettier Delete ␍`）是仓库级治理问题（`core.autocrlf=true` + 无 `.gitattributes`），需要用户决策是否批量规范化

## 待后续治理项

1. **`useBrowserFolderCrud.ts` (460 行)**：本次拆分后仍是新的拆分候选
2. **`GitHubLogViewer.tsx` (313 行)**：未达 <250 目标，JSX (~158 行) 必须保持 byte-identical，renderLine/Row 是渲染关注点，不适合放入 3 个指定 hook 域
3. **QuickActions 丢失 "Ctrl+N" 提示**：现有 i18n 键值为 "New workspace"/"新建工作空间"，无快捷键后缀。可在 i18n 键值中补充 `(Ctrl+N)` 后缀
4. **CRLF 警告 6202 个**：需要添加 `.gitattributes` + 批量规范化，是仓库级治理决策

## SDD 工作流关键文件

- 进度记录：`.superpowers/sdd/progress.md`（任务状态、偏差、提交哈希）
- 任务简报：`.superpowers/sdd/task-N-brief.md`（子代理需求）
- 任务报告：`.superpowers/sdd/task-N-report.md`（子代理结果）
- 洞察报告：`docs/refactoring-insight/report/daily-insights/2026-07/refactor-insight-2026-07-01.md`
- 实施计划：`docs/plans/refactoring/refactor-plan-2026-07-01.md`

## 相关文件

- [重构进度报告](../../../refactoring-insight/report/progress/REFACTORING_PROGRESS_REPORT.md)
- [洞察报告 2026-07-01](../../../refactoring-insight/report/daily-insights/2026-07/refactor-insight-2026-07-01.md)
- [实施计划 2026-07-01](../../../plans/refactoring/refactor-plan-2026-07-01.md)
- [SDD 执行教训](execution-lessons.md)
- [refactoring-insight 技能](../../../../.agents/skills/refactoring-insight/SKILL.md)
