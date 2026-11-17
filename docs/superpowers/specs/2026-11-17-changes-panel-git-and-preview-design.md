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

- 以多信号（体积 / 行数）替代单一体积阈值，并把重型判定前置到任何差分、大纲、粘性上下文计算之前。
- 并排滚动改为滚动所有权 + rAF 合并 + 底部硬对齐，消除回环抖动与延迟。
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
}

export function profileDiffCost(base: string, current: string): DiffCostProfile;
```

实现为 O(n) 单遍扫描（统计 `\n`），不做切分、不分配大数组，避免"测量成本本身成为卡顿源"。

### 3.2 分档

`heavyPreviewLimits.ts` 新增：

```ts
export type DiffCostTier = 'light' | 'degraded' | 'heavy';
export function classifyDiffTier(profile: DiffCostProfile): DiffCostTier;
export function shouldSkipChangeOutline(base: string, current: string): boolean;
```

- `light`：`maxChars ≤ 256 KiB && maxLines ≤ 3000`
- `heavy`：`maxChars > 1 MiB || maxLines > 10_000`（确认门、plain 双栏、ranges/大纲跳过共用此判定）
- 其余为 `degraded`：关变更高亮与折叠标记轮询（语法仍解析）

行×行的 DP 成本由 `changePreviewDiffRanges` 自己的 `MAX_EXACT_DIFF_CELLS` 负责，不作为 viewer 降级信号（避免普通千行级代码 diff 被误判为重型）。阈值以 P0 实测数据校准后写回常量与注释；`TEXT_HEAVY_PREVIEW_CHARS` 保留为文件面板文本门与重型确认门的同源常量。

### 3.3 消费点调整

- `DiffEditorSection`：先 `profileDiffCost` → 分档；`computePreviewDiffVisualRanges` 与 `outlineForChangePreview` 只在 `light`/`degraded` 执行；`heavy` 全跳过。
- `degraded`：渲染 MergeView 但关闭 `highlightChanges`、跳过折叠标记轮询与 `forceParsing`；语法高亮保留。
- `SideBySideDiffViewer` / `InlineDiffViewer`：分档判定与面板一致（字符 + 行数），`forceParsing` 仅在 `light` 执行。
- `buildCollapsedUnchangedRanges`：`[...expandedLines].some(...)` 改为区间集合判定，消除 O(chunks × expanded) 的重复展开。

## 4. 事项 2：并排滚动同步

新增 `frontend/src/app/features/diff-viewer/scrollSync.ts`：

```ts
export interface ScrollSyncController {
  attach(): void;
  detach(): void;
}
export function createScrollSync(
  a: ScrollBox,
  b: ScrollBox,
  env?: Partial<ScrollSyncEnv>,
): ScrollSyncController;
```

机制：

1. **所有权（owner）**：收到未被识别为程序写入的 `scroll` 时，该侧成为 owner；无时间窗抑制，切换到另一侧可立即生效。
2. **程序写入识别**：写入对侧后回读实际位置并记录 `{ target, top, left }`；目标侧事件与记录值差值 ≤ 2px（`SCROLL_EPSILON + 1`）即视为程序写入并吞掉；位置已离开记录值的事件按用户输入处理。
3. **rAF 合并**：同一帧内多次 scroll 只同步一次；同帧双侧滚动以最后滚动的一侧为准。
4. **首尾硬对齐**：源在底部（±1px 平台）→ 目标 max；顶部由比例映射自然得到 0；其余按比例映射（`computeAlignedScrollTop`）。
5. 横向同步纳入同一控制器；编辑器自身的横向滚动管理不再直写对侧。

单测覆盖：首尾对齐（含 1px 平台）、比例映射、程序写入吞掉（打断顺序、写次数、夹取回读）、同帧双侧、跨侧立即接管、横向同步、rAF 合并、卸载清理。

## 5. 事项 3：Git 菜单能力

### 5.1 Rust

`crates/workspace/src/git/git_staging_all.rs`（与既有单文件 `git_staging.rs` 并列）：

- `stage_all(root)` → `git add -A`
- `unstage_all(root)` → 有 HEAD 时 `git restore --staged -- .`，无 HEAD（unborn）时 `git reset`
- `discard_all(root)` → 有 HEAD 时 `git restore --source=HEAD --staged --worktree -- .`；无 HEAD 时先 `git rm -r -f --cached` 清索引，随后 `git clean -fd`（索引内文件也会被删除）

新增 `crates/workspace/src/git/git_sync.rs`：

- `commit(root, message)`：空/纯空白消息拒绝（`AppError::InvalidInput`）
- `push(root)`：解析 upstream（`git rev-parse --abbrev-ref --symbolic-full-name @{u}`）；无 upstream 时选远程（优先 `origin`，否则唯一远程；多远程无 origin → 报错），执行 `git push -u <remote> HEAD`
- `pull_ff_only(root)`：`git pull --ff-only`
- push/pull 使用 120s 超时（超时结束进程树，每个流最多等 2s 回收输出）；本地 git 操作不设超时。
- 全量/远程六个 HTTP 端点要求显式 `workspacePath`（缺省 400），杜绝多工作区误伤。

### 5.2 HTTP / IPC

- 路由：`/workspace/git/stage-all|unstage-all|discard-all|commit|push|pull`
- `shared/ipc/workspace.ts` 新增方法；`httpBridge.ts`、`preview-bridge/preview-git.ts`、`dev/previewWorkspaceService/git.ts`（含 `index.ts` 路由表）、`mock/mock-workspace.ts` 同步实现。

### 5.3 Store 与 UI

- 扩展 `stores/actions/gitFileOpsActions.ts`：新增六个 action，统一失败 `captureError`，成功后调用 `refreshGitSnapshot(id, path, { silent: true })`（懒加载器在已有数据时不会重拍）。
- `WorkspaceChangesMenu`：按 `gitSnapshots[workspace.id]` 计算可用性；无变更禁用暂存/放弃，无已暂存禁用取消暂存；其余可点，失败在提交弹窗内展示错误。
- 新 `CommitDialog`：多行输入、Ctrl+Enter 提交、提交中禁用；「暂存全部并提交」勾选默认开启；失败原因在弹窗内常驻展示。
- 「放弃全部」复用 `ConfirmDialog` 二次确认（执行中禁用两键）；无 HEAD 时使用专用文案说明会清空索引并删除全部未忽略文件（含已暂存，`.gitignore` 项保留）。

## 6. 事项 4：媒体/办公预览与浏览器兜底

### 6.1 变更面板读取

- `editorSlice` 新增 `changePreviewMedia`、`changePreviewMediaLoading`、`changePreviewMediaError`。
- `openChangePreviewGeneric` 按 `categorizeFile` 分流：文本 → 现有 `changePreview`；媒体/办公 → `readMediaFile`（旧版 OLE 办公与文件面板同短路）。与文本链共用 `preview:` 请求代际，取消后迟到的读盘不会把预览写回。
- 读取失败保留选中路径并记录可展示错误（面板给重试与兜底入口），不留白。

### 6.2 渲染

- `DiffEditorSection` 的媒体/办公分支改为复用 `FilePreviewRenderers`（同一重型门、同一错误态、同一渲染器），不做逐行 diff（物理上无意义，UI 不再表述为"不支持"）；媒体读取失败展示错误 + 重试 + 兜底入口。
- 二进制/未知类型保留占位（其扩展名不在白名单内，故不提供兜底按钮）。

### 6.3 浏览器兜底

新组件 `PreviewExternalActions`：两个按钮 → `browserOpenTab(fileUrl)` + `centerShowBrowserTab` / `navigateRightTool('browser')`。仅在桌面（Tauri）显示：浏览器模式的浏览器面板是 iframe，WebView 会拦截 `file://` 子框架。

出现条件（同时满足）：

1. 处于「不支持 / 解码失败 / 媒体读取失败 / 打开失败」占位态；
2. 扩展名在 Chromium 原生可渲染白名单：`html/htm/xhtml`、`pdf`、`svg`、`png/jpg/jpeg/gif/bmp/webp/avif/ico`、`mp3/wav/ogg/m4a/aac/flac`、`mp4/webm/ogv/m4v`。

白名单外（`zip/exe/字体/odt/旧版 doc|ppt` 等）不显示按钮。工作区 id 未命中时严格返回 null，不回退当前工作区。

## 7. 错误处理与双端一致性

- 所有新 IPC 返回 `IpcResult`，失败在 store 侧 `captureError` 并由面板展示；不使用静默 catch。
- 浏览器模式经 node 侧执行同一 git 语义；桌面经 adl-server HTTP，二者错误码与文案一致。
- 新增文案一律进 i18n（`zh-CN` / `en-US` 成对）。

## 8. 测试与验证

| 层 | 内容 |
| --- | --- |
| Rust 单测 | 全量 stage/unstage/discard（含未跟踪）、commit 空消息、push 无 remote/无 upstream/唯一非 origin 远程、pull ff/非 ff |
| Rust HTTP | `crates/server/tests/workspace_git_all.rs` 新增 6 条（六端点 + 显式 workspacePath + 非仓库错误） |
| 前端单测 | `classifyDiffTier`/`profileDiffCost` 边界、`scrollSync` 状态机与写次数、`gitFileOpsActions`（断言 `refreshGitSnapshot`）、`CommitDialog`（含失败错误区）、`previewExternal`（白名单/严格解析/两个打开分支）、变更预览媒体分流与取消竞态、`MediaPreview` onError 失败态 |
| 真实环境 | `E:\AI-DIGITAL-LIFE\Git-Test-Repository`：菜单六项全流程 + 远程 push/pull；浏览器模式 Playwright 采样滚动 `scrollTop` 与长任务；双端打开 mp4/docx/xlsx/pdf |

## 9. 文档同步

- `docs/architecture/features/`（变更面板/预览能力）
- `docs/operations/ui-manual/`（右键菜单与提交弹窗交互）
- `docs/development/adding-an-ipc-domain.md` 若新增命名约定
- `GLOSSARY.md` 新增「代价分档」「浏览器兜底入口」等术语（若确为稳定概念）
