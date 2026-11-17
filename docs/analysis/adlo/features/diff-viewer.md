# Diff 查看器与补丁系统

## 整体架构

```
┌────────────────────────────────────────────────────────────────┐
│                    前端（React + Zustand）                      │
│                                                                │
│  features/diff-viewer/                                         │
│  ├── DiffViewer.tsx               ← 统一差异查看器              │
│  ├── SideBySideDiffViewer.tsx     ← 并排差异查看器              │
│  ├── InlineDiffViewer.tsx         ← 内联差异查看器              │
│  ├── diffViewerUtils.ts           ← 差异工具函数                │
│  ├── changePreviewDiffRanges.ts   ← 变更预览差异范围            │
│  ├── sharedExtensions.ts          ← 共享 CodeMirror 扩展        │
│  └── scrollbarWidth.ts            ← 滚动条宽度计算              │
│                                                                │
│  features/patch-review/                                        │
│  ├── PatchFileCard.tsx            ← 补丁文件卡片                │
│  ├── PatchHunkCard.tsx            ← 补丁块卡片                  │
│  ├── PatchReviewSummary.tsx       ← 补丁审查摘要                │
│  └── patchReview.ts               ← 补丁审查工具函数            │
│                                                                │
│  features/editor/                                              │
│  ├── CodeEditor.tsx               ← CodeMirror 编辑器封装       │
│  ├── cmFoldGutter.ts              ← 折叠槽扩展                  │
│  ├── cmLanguages.ts               ← 语言支持                    │
│  ├── cmScrollSync.ts              ← 滚动同步                    │
│  ├── cmLintHighlights.ts          ← Lint 高亮                   │
│  ├── cmHorizontalScroll.ts        ← 水平滚动                    │
│  ├── cmTheme.ts                   ← 编辑器主题                  │
│  └── ... (更多 CodeMirror 扩展)                                │
│                                                                │
│  stores/                                                        │
│  ├── slices/patchSlice.ts         ← 补丁状态切片                │
│  ├── actions/patchActions.ts      ← 补丁 Action                 │
│  ├── actions/snapshotActions.ts   ← 快照 Action                 │
│  └── changesSelectors.ts          ← 变更选择器                  │
└────────────────────────────────────────────────────────────────┘
                        │
                        ▼ IPC (tauri-bridge / preview-bridge / mock-bridge)
                        │
┌────────────────────────────────────────────────────────────────┐
│                Tauri 命令层                                    │
│                                                                │
│  src-tauri/src/commands/                                       │
│  └── （补丁/快照经 change-engine + workspace 通道，旧 patch.rs/snapshot.rs 已移除） │
└────────────────────────────────────────────────────────────────┘
                        │
┌────────────────────────────────────────────────────────────────┐
│            change-engine Crate（Rust）                          │
│                                                                │
│  crates/change-engine/src/                                     │
│  ├── lib.rs              ← 入口 + PatchProposal 结构           │
│  ├── patch_create.rs     ← 补丁创建（create_single_file_patch_set）│
│  ├── patch_apply.rs      ← 补丁应用与回滚（apply_patch_set/rollback）│
│  ├── revert.rs           ← 回滚到快照                          │
│  ├── snapshot.rs         ← 快照创建与加载                      │
│  ├── validation.rs       ← 补丁验证（application_result/validation_result）│
│  └── language.rs         ← 语言检测（language_for_path）       │
└────────────────────────────────────────────────────────────────┘
```

## change-engine Crate

| 文件 | 导出项 | 说明 |
|------|--------|------|
| `lib.rs` | `PatchProposal`, `set_hunk_decision`, `language_for_path` | crate 入口。`PatchProposal` 包含 workspace_id/session_id/run_id/path/before_content/after_content/title/summary |
| `patch_create.rs` | `create_single_file_patch_set` | 创建单个文件的补丁集。基于 before/after 内容生成 diff patch |
| `patch_apply.rs` | `apply_patch_set`, `rollback_patch_set` | 补丁应用（写入文件系统）和回滚（撤销变更） |
| `revert.rs` | (revert 相关) | 快照回滚：将工作区文件恢复到指定快照状态 |
| `snapshot.rs` | (snapshot 相关) | 快照创建与加载：基于文件系统状态创建检查点 |
| `validation.rs` | `application_result`, `validation_result_from_command` | 补丁应用结果验证和命令执行结果校验 |
| `language.rs` | `language_for_path` | 根据文件路径检测编程语言，用于差异高亮 |

### PatchProposal 数据结构

```
PatchProposal {
    workspace_id: &str,
    session_id: &str,
    run_id: Option<String>,
    relative_path: &str,
    before_content: &str,
    after_content: &str,
    title: String,
    summary: String,
}
```

### 关键流程

```
补丁创建流程:
  create_single_file_patch_set(proposal)
    → 基于 before_content / after_content 生成 unified diff
    → 拆分为多个 hunk（块）
    → 返回 PatchSet

补丁应用流程:
  apply_patch_set(patch_set)
    → 遍历每个文件的每个 hunk
    → 应用变更到工作区文件
    → 返回 PatchApplicationResult

补丁回滚流程:
  rollback_patch_set(patch_set)
    → 反向应用每个 hunk 的变更
    → 恢复文件到修改前状态

快照回滚流程:
  revert_to_snapshot(snapshot_id)
    → 读取快照文件列表
    → 用快照内容覆盖工作区文件
```

## 补丁/快照通道

> 补丁/快照经 `change-engine` crate + `shared/ipc/patch.ts` + `snapshot.ts` 通道，前端状态 `patchSlice.ts` + `patchActions.ts`。

### IPC 接口 (`shared/ipc/patch.ts`)

```typescript
interface PatchBridge {
  applyPatchSet(input: { patchSet: PatchSet }): Promise<IpcResult<PatchApplicationResult>>;
  rollbackPatchSet(input: { patchSet: PatchSet }): Promise<IpcResult<void>>;
  setHunkDecision(input: { patchSetId: string; hunkId: string; decision: 'pending' | 'accepted' | 'rejected' }): Promise<IpcResult<PatchSet>>;
}
```

### IPC 接口 (`shared/ipc/snapshot.ts`)

```typescript
interface SnapshotBridge {
  createSnapshot(input: { workspaceId: string; workspaceRoot: string; messageId: string; sessionId: string }): Promise<IpcResult<GitSnapshot>>;
  listSnapshots(workspaceId: string, workspaceRoot: string): Promise<IpcResult<GitSnapshot[]>>;
  restoreSnapshot(input: { workspaceId: string; workspaceRoot: string; snapshotId: string }): Promise<IpcResult<void>>;
}
```

## 前端状态管理

### patchSlice.ts

```
PatchSlice {
    activePatchSet?: PatchSet;                          // 当前激活的补丁集
    activePatchSets: Record<string, PatchSet | undefined>;  // 多个补丁集（按 ID 索引）
    latestPatchApplication?: PatchApplicationResult;    // 最近一次补丁应用结果

    setActivePatchSet(patchSet),
    setActivePatchSets(patchSets),
    setLatestPatchApplication(result),
    clearPatchState(),
}
```

### patchActions.ts

| Action 方法 | 说明 |
|-------------|------|
| `setHunkDecision` | 设置补丁块的接受/拒绝/待定决策。调用 `window.digitalLife.patch.setHunkDecision()` |
| `applyPatchSet` | 应用补丁集。调用 `window.digitalLife.patch.applyPatchSet()` |
| `rollbackPatchSet` | 回滚补丁集。调用 `window.digitalLife.patch.rollbackPatchSet()` |

### snapshotActions.ts

| Action 方法 | 说明 |
|-------------|------|
| `createSnapshot` | 创建快照。调用 `window.digitalLife.snapshot.createSnapshot()` |
| `listSnapshots` | 列出快照。调用 `window.digitalLife.snapshot.listSnapshots()` |
| `restoreSnapshot` | 恢复快照。调用 `window.digitalLife.snapshot.restoreSnapshot()` |

## 前端功能组件

### diff-viewer 功能域

| 组件 | 说明 |
|------|------|
| `DiffViewer.tsx` | 统一差异查看器：根据配置选择内联或并排模式，管理差异高亮和行号映射 |
| `SideBySideDiffViewer.tsx` | 并排差异查看器：左右两栏分别显示 before/after 内容，支持 CodeMirror 实例同步滚动 |
| `InlineDiffViewer.tsx` | 内联差异查看器：统一视图中显示增删行，通过颜色标记区分 |
| `diffViewerUtils.ts` | 差异工具函数：merge chunks 与折叠范围计算 |
| `scrollSync.ts` | 并排滚动同步控制器：程序写入回读归因、滚动所有权、rAF 合并、底部硬对齐、横向同步 |
| `changePreviewDiffRanges.ts` | 变更预览差异范围：计算代码变更的精确行范围 |
| `sharedExtensions.ts` | 共享 CodeMirror 扩展：diff 查看器和编辑器公用的扩展配置 |
| `scrollbarWidth.ts` | 滚动条宽度计算工具 |

> 代价分档：`regions/right-panel/diffCost.ts`（体积/行数画像）与 `heavyPreviewLimits.ts` 的 `classifyDiffTier` 决定 light/degraded/heavy。`degraded` 关行内变更高亮与折叠标记轮询（语法仍解析）；`heavy` 走面板确认门 + plain 双栏，并跳过 ranges/大纲计算。行×行 DP 仅服务 `changePreviewDiffRanges` 自己的 `MAX_EXACT_DIFF_CELLS`，不参与 viewer 降级。

### patch-review 功能域

| 组件 | 说明 |
|------|------|
| `PatchFileCard.tsx` | 补丁文件卡片：展示单个文件的补丁信息，包含文件名、变更统计、接受/拒绝操作 |
| `PatchHunkCard.tsx` | 补丁块卡片：展示单个 hunk（diff 块）的详细内容和逐块决策 |
| `PatchReviewSummary.tsx` | 补丁审查摘要：汇总所有文件的补丁决策状态和审查进度 |
| `patchReview.ts` | 补丁审查工具函数：审查状态计算、统计汇总 |

### editor 功能域

| 组件/扩展 | 说明 |
|-----------|------|
| `CodeEditor.tsx` | CodeMirror 编辑器封装：支持 diff 模式、只读模式、语法高亮 |
| `cmFoldGutter.ts` | 代码折叠槽扩展 |
| `cmHorizontalScroll.ts` | 水平滚动条扩展 |
| `cmLanguages.ts` | 多语言语法支持注册 |
| `cmLintHighlights.ts` | Lint 错误高亮扩展 |
| `cmScrollSync.ts` | 双栏滚动同步（用于并排 diff） |
| `cmTheme.ts` | CodeMirror 主题配置 |
| `editorAdapters.ts` | 编辑器适配器：统一的编辑器接口抽象 |
| `editorStateCache.ts` | 编辑器状态缓存 |
| `FoldContextMenu.tsx` | 折叠右键菜单 |
| `FoldTooltipContent.tsx` | 折叠提示内容 |
| `FoldTooltipOverlay.tsx` | 折叠提示覆盖层 |
| `gutterHoverSync.ts` | 槽悬停同步 |

### 右侧面板中的 Diff 相关组件

| 组件 | 路径 | 说明 |
|------|------|------|
| `DiffEditorSection.tsx` | `regions/right-panel/panels/DiffEditorSection.tsx` | 差异编辑器区域：在右侧面板中嵌入 diff 查看器 |
| `PatchReviewSection.tsx` | `regions/right-panel/panels/PatchReviewSection.tsx` | 补丁审查区域：补丁审查的 UI 容器 |
| `ChangesTreePanel.tsx` | `regions/right-panel/panels/ChangesTreePanel.tsx` | 变更树面板：展示文件变更列表 |
| `DiffToolbar.tsx` | `regions/right-panel/DiffToolbar.tsx` | 差异工具栏：切换 diff 模式、接受/拒绝操作 |
| `ChangesPanel/` | `regions/right-panel/panels/ChangesPanel/` | 变更面板子组件（分支选择/过滤/排序/对话框） |

## 相关 Hook

| Hook | 路径 | 说明 |
|------|------|------|
| `usePatchReview.ts` | `app/hooks/usePatchReview.ts` | 补丁审查 Hook：补丁集加载、决策管理 |
| `usePatchReviewWithEditor.ts` | `app/hooks/usePatchReviewWithEditor.ts` | 编辑器集成的补丁审查 Hook |
| `useEditorReveal.ts` | `app/hooks/useEditorReveal.ts` | 编辑器定位 Hook：跳转到指定行 |

## 文件参考指南

| 路径 | 说明 |
|------|------|
| `crates/change-engine/src/lib.rs` | change-engine crate 入口 |
| `crates/change-engine/src/patch_create.rs` | 补丁创建 |
| `crates/change-engine/src/patch_apply.rs` | 补丁应用与回滚 |
| `crates/change-engine/src/revert.rs` | 快照回滚 |
| `crates/change-engine/src/snapshot.rs` | 快照创建与加载 |
| `crates/change-engine/src/validation.rs` | 补丁验证 |
| `crates/change-engine/src/language.rs` | 语言检测 |
| `crates/change-engine/Cargo.toml` | change-engine 依赖 |
| `frontend/src/app/stores/slices/patchSlice.ts` | 补丁状态切片 |
| `frontend/src/app/stores/actions/patchActions.ts` | 补丁 Action |
| `frontend/src/app/features/diff-viewer/DiffViewer.tsx` | 统一差异查看器 |
| `frontend/src/app/features/diff-viewer/SideBySideDiffViewer.tsx` | 并排差异查看器 |
| `frontend/src/app/features/diff-viewer/InlineDiffViewer.tsx` | 内联差异查看器 |
| `frontend/src/app/features/diff-viewer/diffViewerUtils.ts` | 差异工具函数 |
| `frontend/src/app/features/diff-viewer/changePreviewDiffRanges.ts` | 变更预览差异范围 |
| `frontend/src/app/features/diff-viewer/sharedExtensions.ts` | 共享 CodeMirror 扩展 |
| `frontend/src/app/features/diff-viewer/scrollbarWidth.ts` | 滚动条宽度 |
| `frontend/src/app/features/patch-review/PatchFileCard.tsx` | 补丁文件卡片 |
| `frontend/src/app/features/patch-review/PatchHunkCard.tsx` | 补丁块卡片 |
| `frontend/src/app/features/patch-review/PatchReviewSummary.tsx` | 补丁审查摘要 |
| `frontend/src/app/features/patch-review/patchReview.ts` | 补丁审查工具函数 |
| `frontend/src/app/features/editor/CodeEditor.tsx` | CodeMirror 编辑器 |
| `frontend/src/app/features/editor/editorAdapters.ts` | 编辑器适配器 |
| `frontend/src/app/features/editor/editorStateCache.ts` | 编辑器状态缓存 |
| `frontend/src/app/features/editor/cmFoldGutter.ts` | 折叠槽扩展 |
| `frontend/src/app/features/editor/cmScrollSync.ts` | 滚动同步 |
| `frontend/src/app/features/editor/cmLanguages.ts` | 语言支持 |
| `frontend/src/app/features/editor/cmLintHighlights.ts` | Lint 高亮 |
| `frontend/src/app/features/editor/cmHorizontalScroll.ts` | 水平滚动 |
| `frontend/src/app/features/editor/cmTheme.ts` | 编辑器主题 |
| `frontend/src/app/regions/right-panel/panels/DiffEditorSection.tsx` | 差异编辑器区域 |
| `frontend/src/app/regions/right-panel/panels/PatchReviewSection.tsx` | 补丁审查区域 |
| `frontend/src/app/regions/right-panel/panels/ChangesTreePanel.tsx` | 变更树面板 |
| `frontend/src/app/regions/right-panel/panels/ChangesPanel/` | 变更面板（分支/过滤/排序） |
| `frontend/src/app/regions/right-panel/DiffToolbar.tsx` | 差异工具栏 |
| `frontend/src/app/hooks/usePatchReview.ts` | 补丁审查 Hook |
| `frontend/src/app/hooks/usePatchReviewWithEditor.ts` | 编辑器补丁审查 Hook |
| `frontend/src/app/hooks/useEditorReveal.ts` | 编辑器定位 Hook |
| `frontend/src/shared/ipc/patch.ts` | 补丁 IPC 接口定义 |
| `frontend/src/shared/ipc/snapshot.ts` | 快照 IPC 接口定义 |
