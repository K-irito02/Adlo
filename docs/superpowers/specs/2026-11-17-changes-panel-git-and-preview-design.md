# 变更面板卡顿治理、并排滚动同步与 Git 菜单/预览能力设计

- 日期：2026-11-17
- 状态：已获用户批准（聊天内逐项确认）
- 关联进度：`docs/root-cause-to-close/2026-11/progress-2026-11-17-102757.md`
- 范围：右侧「变更」面板四项改进（性能、并排滚动、工作区 Git 菜单、媒体/办公预览与浏览器兜底）

## 1. 背景与问题

1. **卡顿**：变更面板打开较大变更文件时整体卡顿，低于现有 1MB 字符门也卡。现行门是单一体积阈值（`TEXT_HEAVY_PREVIEW_CHARS = 1024 * 1024`），且 `DiffEditorSection` 在重型门之前就已执行 O(n·m) 差分与大纲计算，门只挡住渲染、没挡住计算。
2. **滚动抽搐**：并排模式用同步布尔锁 `syncing` 抑制回环，但设置对侧 `scrollTop` 后立即复位，浏览器 `scroll` 事件异步到达再反向同步，形成 A↔B 反馈环；比例映射在首尾与取整差异处放大为持续抖动。
3. **菜单空实现**：工作区文件夹右键/「更多操作」菜单中「暂存全部 / 取消暂存 / 提交 / 推送 / 拉取 / 放弃全部」全部 `disabled` 占位；后端仅有单文件 stage/unstage/discard，缺少全量与远程能力。
4. **预览缺口**：变更面板把媒体与办公文件一律降级为占位，只给「在文件中打开」；文件面板已完整支持（含 mp4 原生播放）。同时缺少"内部渲染器不行但 WebView2 可打开"的出口。

## 2. 目标与非目标

**目标**

- 以多信号（体积 / 行数 / 差分单元格 / 变更块）替代单一体积阈值，并把重型判定前置到任何差分、大纲、粘性上下文计算之前。
- 并排滚动改为意图锁 + rAF 合并 + 首尾硬对齐，消除回环抖动与延迟。
- 六个 Git 菜单项在双端真实生效，并提供提交弹窗与放弃确认。
- 变更面板与文件面板可打开类型一致（含 mp4），并在合适的失败/不支持态提供两个浏览器打开入口。

**非目标**

- 不做 diff 虚拟化引擎替换、不引入新的 diff 算法库。
- 不做冲突解决 UI（pull 采用 `--ff-only`，分叉即提示）。
- 不为 WebView2 无法渲染的类型提供兜底按钮。

## 3. 事项 1：卡顿治理

### 3.1 代价画像

新增 `frontend/src/app/regions/right-panel/diffCost.ts`：

```ts
export interface DiffCostProfile {
  baseChars: number;
  currentChars: number;
  baseLines: number;
  currentLines: number;
  diffCells: number; // baseLines * currentLines（可能溢出时饱和到 Number.MAX_SAFE_INTEGER）
}

export function profileDiffCost(base: string, current: string): DiffCostProfile;
```

实现为 O(n) 单遍扫描（统计 `\n`），不做切分、不分配大数组，避免"测量成本本身成为卡顿源"。

### 3.2 分档

`heavyPreviewLimits.ts` 新增：

```ts
export type DiffCostTier = 'light' | 'degraded' | 'heavy';
export function classifyDiffTier(profile: DiffCostProfile): DiffCostTier;
```

- `light`：`maxChars < 256 KiB && maxLines < 3000 && diffCells < 250_000`
- `heavy`：`maxChars > 1 MiB || maxLines > 10_000 || diffCells > 2_000_000`
- 其余为 `degraded`

阈值以 P0 实测数据校准后写回常量与注释；`TEXT_HEAVY_PREVIEW_CHARS` 保留为文件面板文本门与重型确认门的同源常量。

### 3.3 消费点调整

- `DiffEditorSection`：先 `profileDiffCost` → 分档；`computePreviewDiffVisualRanges` 与 `outlineForChangePreview` 只在 `light`/`degraded` 执行；`heavy` 全跳过。
- `degraded`：渲染 MergeView 但关闭语法解析（不加载语言扩展）、关闭 `highlightChanges`、跳过粘性上下文重计算；保留折叠与滚动。
- `SideBySideDiffViewer` / `InlineDiffViewer`：新增 `degraded` 入参（或复用 `isHeavy` 为三态），`forceParsing` 仅在 `light` 执行。
- `buildCollapsedUnchangedRanges`：`[...expandedLines].some(...)` 改为区间集合判定，消除 O(chunks × expanded) 的重复展开。

## 4. 事项 2：并排滚动同步

新增 `frontend/src/app/features/diff-viewer/scrollSync.ts`：

```ts
export interface ScrollSyncController {
  attach(): void;
  detach(): void;
}
export function createScrollSync(a: EditorView, b: EditorView): ScrollSyncController;
```

机制：

1. **所有权（owner）**：收到未被识别为程序写入的 `scroll` 时，该侧成为 owner，并记录 `ownerUntil = now + 120ms`。
2. **程序写入识别**：每次写入对侧前记录 `{ target, top, left }`；目标侧事件与期望值差值 ≤ 1px 即视为程序写入并吞掉。
3. **rAF 合并**：同一帧内多次 scroll 只同步一次；owner 期间对侧写入不反向触发。
4. **首尾硬对齐**：源在 0 → 目标 0；源在 max（±1）→ 目标 max；其余按比例映射（`computeSyncedScrollTop` 保留）。
5. 横向同步纳入同一控制器，避免两套监听互相打架。

单测覆盖：首尾对齐、比例映射、程序写入吞掉、owner 超时转移、卸载清理。

## 5. 事项 3：Git 菜单能力

### 5.1 Rust

`crates/workspace/src/git/git_staging.rs`：

- `stage_all(root)` → `git add -A`
- `unstage_all(root)` → `git restore --staged -- .`（失败回退 `git reset`）
- `discard_all(root)` → `git restore --source=HEAD --staged --worktree -- .` + `git clean -fd`

新增 `crates/workspace/src/git/git_sync.rs`：

- `commit(root, message)`：空/纯空白消息拒绝（`AppError::InvalidInput`）
- `push(root)`：解析 upstream（`git rev-parse --abbrev-ref --symbolic-full-name @{u}`）；无 upstream 时选远程（优先 `origin`，否则唯一远程；多远程无 origin → 报错），执行 `git push -u <remote> HEAD`
- `pull_ff_only(root)`：`git pull --ff-only`
- push/pull 使用 120s 超时，其余沿用 30s。

### 5.2 HTTP / IPC

- 路由：`/workspace/git/stage-all|unstage-all|discard-all|commit|push|pull`
- `shared/ipc/workspace.ts` 新增方法；`httpBridge.ts`、`preview-bridge/preview-git.ts`、`dev/previewWorkspaceService/git.ts`（含 `index.ts` 路由表）、`mock/mock-workspace.ts` 同步实现。

### 5.3 Store 与 UI

- 新 `stores/actions/gitOpsActions.ts`：六个 action，统一失败 `captureError`、成功 `loadGitSnapshot`。
- `WorkspaceChangesMenu`：按 `gitSnapshots[workspace.id]` 计算可用性；无变更禁用暂存/放弃，无已暂存禁用取消暂存；其余可点，错误由后端返回并在面板提示。
- 新 `CommitDialog`：多行输入、Ctrl+Enter 提交、提交中禁用；「暂存全部并提交」勾选默认开启。
- 「放弃全部」复用 `ConfirmDialog` 二次确认，文案声明不可恢复。

## 6. 事项 4：媒体/办公预览与浏览器兜底

### 6.1 变更面板读取

- `editorSlice` 新增 `changePreviewMedia`、`changePreviewMediaLoading`。
- `openChangePreviewGeneric` 按 `categorizeFile` 分流：文本 → 现有 `changePreview`；媒体/办公 → `readMediaFile`。沿用请求序号与缓存键，快速切换不串台。

### 6.2 渲染

- `DiffEditorSection` 的媒体/办公分支改为复用 `FilePreviewRenderers`（同一重型门、同一错误态、同一渲染器），不做逐行 diff（物理上无意义，UI 不再表述为"不支持"）。
- 二进制/未知类型保留占位并接兜底按钮。

### 6.3 浏览器兜底

新组件 `PreviewExternalActions`：两个按钮 → `browserOpenTab(fileUrl)` + `centerShowBrowserTab` / `navigateRightTool('browser')`。

出现条件（同时满足）：

1. 处于「不支持 / 解码失败 / legacy / unreadable / 媒体错误」占位态；
2. 扩展名在 Chromium 原生可渲染白名单：`html/htm/xhtml`、`pdf`、`svg`、`png/jpg/jpeg/gif/bmp/webp/avif/ico`、`mp3/wav/ogg/m4a/aac/flac`、`mp4/webm/ogv/m4v`。

白名单外（`zip/exe/字体/odt/旧版 doc|ppt` 等）不显示按钮。

## 7. 错误处理与双端一致性

- 所有新 IPC 返回 `IpcResult`，失败在 store 侧 `captureError` 并由面板展示；不使用静默 catch。
- 浏览器模式经 node 侧执行同一 git 语义；桌面经 adl-server HTTP，二者错误码与文案一致。
- 新增文案一律进 i18n（`zh-CN` / `en-US` 成对）。

## 8. 测试与验证

| 层 | 内容 |
| --- | --- |
| Rust 单测 | 全量 stage/unstage/discard（含未跟踪）、commit 空消息、push 无 remote/无 upstream/唯一非 origin 远程、pull ff/非 ff |
| Rust HTTP | `crates/server/tests/workspace_git_all.rs` 新增 6 条 |
| 前端单测 | `classifyDiffTier`/`profileDiffCost`、`computeSyncedScrollTop` 边界、scrollSync 状态机、gitOps actions、CommitDialog、ExternalActions 白名单、变更预览媒体分流竞态 |
| 真实环境 | `E:\AI-DIGITAL-LIFE\Git-Test-Repository`：菜单六项全流程 + 远程 push/pull；浏览器模式 Playwright 采样滚动 `scrollTop` 与长任务；双端打开 mp4/docx/xlsx/pdf |

## 9. 文档同步

- `docs/architecture/features/`（变更面板/预览能力）
- `docs/operations/ui-manual/`（右键菜单与提交弹窗交互）
- `docs/development/adding-an-ipc-domain.md` 若新增命名约定
- `GLOSSARY.md` 新增「代价分档」「浏览器兜底入口」等术语（若确为稳定概念）
