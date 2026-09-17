# 检索结果新鲜度根治设计（stale 自动重算 + 点击校验重定位）

- **日期:** 2026-09-17
- **状态:** 待评审
- **范围:** 右侧面板-文件面板（检索文件模式）＋ 变更面板（相关能力复用）
- **前置记录:** `docs/root-cause-resolution/2026-09/progress-2026-09-17-122054.md`（事项 38–45）

## 背景

检索结果由后端在**请求那一刻**扫描磁盘生成（`crates/workspace/src/search.rs`：`search_text` 逐行 `contains`，行号为 `enumerate()+1`），前端把结果存进 `searchResults` 后**再无校验**。随后的任何文件变动（Agent/工具写入、git 切换、应用自身保存、补丁应用）都会使命中的行号过期。

实证（`.adl-logs/debug-logs.txt` 2026-09-17）：

- 预览跳转在懒加载未挂载时 `candidates: 0`（已修，见事项 43）；
- 编辑器链路出现 `line=268 / lineCount=57`、`line=451 / lineCount=32`、`line=1439 / lineCount=465`：**命中行超出当前内容行数**，即结果已 stale；
- 越界行揭示曾抛 `RangeError: Invalid line number 268 in 57-line document`，因无错误边界导致**整应用空白**（已加守卫，见事项 40）。

现状缺陷清单：

1. `searchResults` 除"再次检索/切换工作区"外永不失效（`onFileChanged` 仅给当前打开文件打"外部修改"标记，不影响结果）；
2. 命中不含工作区归属（`WorkspaceSearchHit{path,line,preview}`），跨工作区同相对路径会错配；
3. 后端**无工作区级文件 watcher**（仅 `kernel::config_watcher`；`digital-life://workspace-file-changed` 通道在前端桥存在但无人 emit）；
4. 变更面板预览跳转只认标题锚点（`revealOutlineLine` 查询 `[data-source-line]`），且 diff 编辑器揭示**无行数守卫**，与本轮已修的文件面板能力不一致。

## 目标

1. 检索面板的命中**始终与磁盘一致**：文件变更后自动重算受影响文件的命中；文件删除则该文件命中消失。
2. 点击任意命中**永不落空**：能定位就精确定位（含重定位），内容已不存在则明确标记「已失效」而非静默跳错。
3. 命中**绑定产生它的工作区**，打开文件按该工作区解析，杜绝跨工作区错配。
4. 文件面板与变更面板**共用同一套**跳转/校验/失效能力；变更树与文件树在文件变更后自动刷新。
5. 全程不抛 `RangeError`；新增 App 级错误边界，单点异常不再导致整应用空白。

## 非目标（YAGNI）

- 不覆盖 `docx/pdf/binary`（预览为无行号占位页，语义上无行可跳）；
- 不做结果持久化、不做跨会话缓存；
- 不为"文件名字符高亮"等既有检索 UI 另做改动。

## 调研结论（外部）

| 来源 | 做法 | 对我们的启示 |
|------|------|--------------|
| VS Code [`searchService.ts`](https://github.com/microsoft/vscode/blob/df4e4d95/src/vs/workbench/services/search/common/searchService.ts) `getOpenEditorResults` | **已打开文件用 live 编辑器模型**算匹配与行号（不走磁盘快照）；磁盘仅负责关闭的文件 | 点击校验/重定位必须优先用**打开中的缓冲**（`fileContent`） |
| VS Code [`searchModel.ts`](https://github.com/microsoft/vscode/blob/e8db8ed8/src/vs/workbench/contrib/search/browser/searchTreeModel/searchModel.ts) | 每批结果带 `searchInstanceID`，过期批次丢弃 | 重算结果须带会话标识，避免旧响应覆盖新会话 |
| [context-mode #317 / #335](https://github.com/mksglu/context-mode/issues/317) | 三策略：读时校验（mtime 快速门 + 内容哈希 → **返回前自动重算**并回报"已刷新 N 个"）、watcher 去抖增量、git diff 批量；**建议先做读时校验** | 采纳"读时校验"为点击路径；watcher 作为结果刷新驱动 |
| [ken ADR-012](https://github.com/townsendmerino/ken/commit/819cde6b858c444643d79abdd35870e2eae49dc7) | fsnotify + 固定去抖（2s） + 原子快照切换 | 去抖放**后端**，避免事件风暴穿透 IPC |
| [hermes-agent #5849](https://github.com/NousResearch/hermes-agent/issues/5849) | 轮询式 watcher（10s）+ 去抖 | 事件驱动优于轮询，佐证选 notify |

技术栈适配评估：`notify` 已是本项目依赖（`crates/kernel/src/config_watcher.rs` 使用），Rust 侧无新增第三方依赖；四端桥需同步实现新方法（项目硬规则），`mock`/`preview` 无真实 watcher 时降级为 no-op（沿用 `workspace.onFileChanged` 先例）。

## 决策记录（用户逐项确认）

| # | 议题 | 决策 |
|---|------|------|
| 1 | 刷新语义 | **A：局部重算** —— 新增后端"按文件搜索"接口，仅重算变更文件的命中 |
| 2 | watcher 范围/生命周期 | **B：启动即永久监听活动工作区**，切换工作区时重建 |
| 3 | 失效提示 | **A：行内标记「已失效」＋ 面板汇总计数**（点击不再跳转） |
| 4 | 自写文件 | **A：任何写入都触发重算**（含应用自身保存/新建/删除、外部工具、git 切换），后端去抖合并 |
| 5 | 命中上限 | **A：每文件上限（200）＋ 总量提示"仅显示部分结果"**（不再维持全局严格截断语义） |
| 6 | 文件树/变更树 | **A：两者都在文件变更后自动刷新**（去抖） |
| 7 | App 级错误边界 | **纳入本轮** |
| 8 | watcher 事件传输通道 | **甲：watcher 放 adl-server ＋ 新增 WebSocket 推送端点**（沿用 `/pty` 先例）；浏览器预览模式由 dev 中间件轮询 `/workspace/files-changed?since=` 兜底 |

## 架构（方案甲：Rust 事件源 + 前端策略 + 批量重算）

```
┌─ adl-server (Rust) ──────────────────────────────────────────────┐
│ crates/workspace/src/watch.rs   活动工作区 notify 递归监听        │
│   · 忽略规则剪枝   · 400ms 去抖   · 产出 {changed[], removed[]}    │
│   · 不含任何搜索逻辑                                              │
│ crates/workspace/src/search.rs  search_in_files(root, paths[],    │
│   query) —— 复用 search_text_in_files，语义与 search_text 一致    │
│ engine: 工作区打开/切换时启动或重建 watcher                        │
│ 推送: 新 WS 端点 /ws/workspace（沿用 /pty WebSocket 先例）         │
│ 命令: POST /workspace/search-in-files { paths[], query }          │
└───────────────┬──────────────────────────────────────────────────┘
                │ WS 帧: { kind:"files-changed", changed[], removed[], overflow? }
                │        （浏览器预览模式：轮询 /workspace/files-changed?since=）
┌───────────────▼─ Frontend ───────────────────────────────────────┐
│ shared/ipc/workspace.ts  登记 searchInFiles / onFilesChanged       │
│   四端：httpBridge(POST + WS) · tauri-bridge(继承 http) ·          │
│         preview-bridge(预览 API + 轮询) · mock-bridge(内存)        │
│ stores/actions/searchActions.ts  会话快照 + 重算调度（前端去抖200ms）│
│ stores/slices/searchSlice.ts   SearchSession / SearchHitEntry      │
│ features/preview/revealSourceLine.ts  共享跳转与重定位能力          │
│ FilesPanel（检索区） · ChangesPanel（复用同一套能力）               │
│ App 级 ErrorBoundary（新增）                                       │
└───────────────────────────────────────────────────────────────────┘
```

**通道现状（已核实）**：`workspace.onFileChanged` 在 httpBridge 为 no-op 占位（注释"deferred to Task 8"），Rust 端**无 `/event` SSE 路由**；服务端仅 `/pty` 一路 WebSocket。故本轮**新开一路 WS**（与 PTY 推送同构），不引入 SSE 桥。既有 `workspace-file-changed` 通道保持原状（非本 spec 范围）。

**职责边界**：后端只做"忠实事件源 + 精确重算能力"（无会话状态、无 UI 语义）；"何时重算、如何呈现过期、如何重定位"全部在前端决策，便于双端一致与单测。

## 接口清单

### Rust

- 新模块 `crates/workspace/src/watch.rs`
  - `pub struct WorkspaceWatcher`：`start(root, callback) -> Result<Self>` / `stop()`
  - 忽略规则剪枝（见下）；`400ms` 去抖；批量回调 `FilesChangedBatch { changed: Vec<String>, removed: Vec<String> }`（工作区相对路径，正斜杠）
  - 单批文件数上限 500：超限时按"超限"标记上报，由前端退化为整轮重搜
- `search.rs` 新增 `pub fn search_in_files(root: &Path, relative_paths: &[String], query: &str) -> Result<Vec<WorkspaceSearchHit>, AppError>`
  - 与 `search_text` 完全同一匹配语义（大小写不敏感 `contains`、行长截断 240、每文件上限 200）
- `crates/kernel/src/events.rs` 新增 `AppEvent::FilesChanged { changed: Vec<String>, removed: Vec<String>, overflow: bool }`（`kind()` = `workspace.files-changed`）
- `crates/server`：
  - `POST /workspace/search-in-files` handler（`{ paths: string[], query: string }`）
  - 新 WS 端点 `GET /ws/workspace`（与 `/pty` 同构）：订阅 `EventBus`，把 `FilesChanged` 序列化为 WS 文本帧 `{ kind: "files-changed", changed, removed, overflow }`
- `engine.rs`：工作区打开/启动恢复时启动 watcher；`/workspace/open` 切换工作区时重建；`clear_current` 时停止

### IPC（必须四端同步，并在 `shared/ipc/workspace.ts` 登记 `@command` / `@see`）

```ts
searchInFiles: (paths: string[], query: string) => Promise<IpcResult<WorkspaceSearchHit[]>>;
onFilesChanged: (listener: (batch: WorkspaceFilesChangedBatch) => void) => () => void;
```

```ts
interface WorkspaceFilesChangedBatch {
  changed: string[];   // 工作区相对路径
  removed: string[];
  overflow?: boolean;  // 单批超限，前端退化为整轮重搜
}
```

**各端实现**：

| 端 | `searchInFiles` | `onFilesChanged` |
|----|-----------------|------------------|
| `httpBridge`（Tauri 继承） | `POST /workspace/search-in-files` | 连接 WS `/ws/workspace`，按 `kind` 分发（断线自动重连；返回同步取消函数） |
| `preview-bridge`（浏览器） | 预览 API `POST /workspace/search-in-files` | **轮询** `GET /workspace/files-changed?since=<cursor>`（间隔 2s，仅在订阅期间），返回批次与游标 |
| `mock-bridge` | 内存 `documents` 上跑同名匹配 | 返回 no-op 取消函数（沿用 `onFileChanged` 先例） |
| `dev/previewWorkspaceService`（Vite 中间件） | 新增 `POST /workspace/search-in-files` handler（复用其 search 模块） | 新增 `GET /workspace/files-changed?since=` handler（`fs.watch` 递归 + 去抖，维护自增游标与批次环形缓冲） |

### Store

```ts
interface SearchHitEntry {
  workspaceId: string;   // 产生该命中的工作区（决策 2/3 的归属）
  path: string;          // 工作区相对路径
  line: number;
  preview: string;
  stale?: boolean;       // 内容已不存在（点击校验得出）
}
interface SearchSession {
  id: number;            // 会话标识：丢弃过期响应（VS Code searchInstanceID 同义）
  query: string;
  matchCase: boolean;
  wholeWord: boolean;
  useRegex: boolean;
  workspaceId: string;   // 检索发生时的活动工作区
  hits: SearchHitEntry[];
  partial?: boolean;     // 是否命中上限（决策 5 的"仅显示部分结果"）
}
```

纯函数 reducer（可单测，无 React）：`replaceFileHits(session, path, hits)`、`dropFileHits(session, path)`、`markHitsStale(session, path, line?)`、`toHitEntries(hits, workspaceId)`。

### 共享跳转能力 `features/preview/revealSourceLine.ts`

- `resolveSourceLineElement(container, line)` —— 块级映射（`data-source-line-start/end`，闭区间）取包含该行的最内层元素，无则最近前置块
- `revealSourceLine(container, line, { flash })` —— `scrollIntoView({ block:'center', behavior:'smooth' })` ＋ `.adl-md-flash` 落点闪烁
- `findLineForQuery(liveContent, query, options, preferredLine)` —— 在 live 内容中重定位（复用 `buildSearchPattern`）。返回**距 `preferredLine` 行号距离最小**的匹配行；距离相同取行号靠前者；内容中无匹配返回 `null`
- `revealEditorLineSafely(editor, line, { path, scope })` —— 行数校验；越界返回"无效"由调用方决定钳制/丢弃

## 数据流

### 检索

1. 回车 → 生成新 `session.id`、清空命中 → `workspace.search(query)` → 写 `hits`（每条打上当时活动工作区的 `workspaceId`）。
2. 响应回来时校验 `session.id` 与 `query` 仍匹配，否则丢弃（防过期响应覆盖）。
3. 截断语义（决策 5）：
   - **初次检索**沿用后端现行 **200 条全局上限**（`MAX_SEARCH_RESULTS`）；命中达到该上限即 `partial = true`。
   - **局部重算**（`searchInFiles`）按**每文件 200 条上限**，不再受全局 200 约束。
   - 两种情况下 `partial` 为真时，面板显示"仅显示部分结果"。

### 文件变更（决策 1/4/6）

`workspace-files-changed` → 前端 200ms 合并（多次事件并批）：

- **归属过滤**：watcher 只监听活动工作区，故仅处理 `workspaceId === 当前活动工作区` 的命中条目；其余工作区的命中不受本次事件影响（避免跨工作区同相对路径误改）。
- `removed` 命中过的文件 → `dropFileHits`（条目消失）；
- `changed` 命中过的文件 → 一次 IPC `searchInFiles(paths, query)` → 按文件 `replaceFileHits`（0 条则 `dropFileHits`）；
- `overflow` 为真 → 直接整轮重搜（复用现有 `searchFiles`）；
- 去抖后同时触发：`fetchGitStatus`（活动工作区）＋ 变更集内文件所在工作区的 `refreshGitSnapshot` ＋（文件树已展开时）`refreshAllWorkspaceTrees`（决策 6）。

### 点击命中（校验 ＋ 重定位）

1. 取 **live 内容**：该文件是当前打开文件 → 用 `fileContent`（含未保存修改，对齐 VS Code "open editor results"）；否则打开文件后读到的内容。
2. `findLineForQuery(liveContent, query, options, hit.line)`：
   - 返回等于 `hit.line` → **精确命中**，直接跳（编辑：`revealEditorLineSafely`；预览：`revealSourceLine(..., { flash: true })`）；
   - 返回其他行 → **重定位**：更新该条 `line` 后跳转，清除 `stale`；
   - 返回 `null` → 标记 `stale = true`，**不跳转**，行内显示「已失效」＋ 顶部汇总"N 处结果已失效"。
3. 预览模式：预览锚点本就基于 live `fileContent` 渲染，与重定位结果天然一致。

### stale 状态机

```
fresh ──(点击校验：内容中已搜不到 query)──▶ stale
stale ──(该文件重算后命中恢复)──────────▶ fresh
任意 ──(文件被删除 / 工作区切换)─────────▶ 条目移除
```

## 变更面板覆盖（复用，不重复造）

- 预览跳转：`revealOutlineLine` 改为调用共享 `resolveSourceLineElement` + `revealSourceLine`，从"仅标题锚点"升级为"任意行块级锚点 + 最近前置块 + 落点闪烁"，与文件面板行为一致。
- diff 编辑器揭示：改用 `revealEditorLineSafely`（消除当前的越界 `RangeError` 风险）。
- stale 校验：变更面板预览的 live 内容为 `changePreview.currentContent`，同样接入 `findLineForQuery` 与「已失效」提示。
- 自动刷新：watcher 事件驱动 `refreshGitSnapshot` / `fetchGitStatus`（决策 6）。

## 忽略规则（为什么需要 + 复用什么）

**结论：需要，且为行业标准做法。**

| 证据 | 内容 |
|------|------|
| VS Code 有专门的用户级设置 `files.watcherExclude` | 默认 `**/.git/objects/**`、`**/.git/subtree-cache/**`、`**/node_modules/*/**`、`**/.hg/store/**`（[默认值](https://github.com/microsoft/vscode/issues/137872)） |
| VS Code 官方 Wiki「File Watcher Internals」 | 递归监听大目录在 Linux 会**耗尽文件句柄**（inotify `ENOSPC`）并致高 CPU；该设置**专为此而设** |
| 维护者澄清（[#232665](https://github.com/microsoft/vscode/issues/232665)） | `files.exclude`/`search.exclude`/`files.watcherExclude` 是**三套不共享逻辑**的设置；Windows/macOS 用高效递归监听（`ReadDirectoryChangesW`/fsevents），排除规则在那里主要**过滤已派发事件以降 CPU**；Linux 才真正减少句柄占用 |
| 实测事故（[#3998](https://github.com/microsoft/vscode/issues/3998)） | 未排除 `node_modules`/`tmp` 时 watcher 占 ~1.7GB 内存、90–100% CPU；排除后降至 ~49MB |

**本项目的额外硬理由**：应用会把 `debug-logs.txt`（Tauri）/ `debug-logs-browser.txt`（浏览器）与 `.adl-logs/`（dev 构建）**持续写入工作区根目录**（见根 AGENTS.md「调试工具」；本轮调试实测持续写入）。若不排除，将形成"应用写日志 → watcher 触发 → 重算 → 再写日志"的自触发循环。另本仓 `target/debug` 曾达 130GB，构建期事件量极大。

**复用既有单一真源（不新造清单）**：

- 忽略目录直接复用 `crates/workspace/src/tree.rs::ignored_dirs()`（现含 `.git`、`target`、`node_modules`、`dist`、`build`、`.next`、`.cache`、`__pycache__`、`.venv`、`vendor`、`.idea`、`.vscode`、`.svelte-kit`、`.turbo`、`coverage`、`.nyc_output`、`out`、`.tox`），watcher 与文件树/检索共用同一语义，避免清单漂移；
- 追加应用噪声项：`.adl-logs`、`logs`、`test-artifacts`（目录）与 `debug-logs*.txt`、`*.tmp`、`.DS_Store`（文件名模式）。

**非目标**：不引入 `.gitignore` 驱动的动态过滤（VS Code 的 watcher 亦使用显式设置）；本轮不提供用户可配置的 watcher 排除项，如后续需要单独立项。

## 错误处理与降级

| 场景 | 处理 |
|------|------|
| watcher 启动失败 / 句柄耗尽 | warn 日志 + 降级为"无自动刷新"，UI 不受影响 |
| `searchInFiles` 失败 | **保留原命中**（不误删）＋ warn；下次事件自然重试 |
| 单批超限（`overflow`） | 退化为整轮重搜 |
| 行号越界 | 钳制或标记 stale，永不抛 `RangeError` |
| 文件删除/重命名 | 删除按 `removed` 丢弃；重命名按 `removed + changed`（新路径若命中会被后端搜出） |
| 工作区切换 | watcher 重建（决策 2）＋ 会话失效（清空命中、重置 stale） |
| 组件异常 | **新增 App 级 ErrorBoundary**（决策 7），单点异常不再整应用空白 |

## 测试策略（按项目规则分级执行，只跑受影响部分）

- **Rust** `crates/workspace`：
  - `watch.rs`：临时目录写入/删除/重命名、去抖合并（多次写 → 一批）、忽略规则（`.adl-logs/` 等不触发）、启动失败降级；用较短去抖窗口保证测试不慢
  - `search_in_files`：与 `search_text` 语义一致（大小写不敏感、240 截断、每文件上限 200、空 query 返回空）
- **Rust** `crates/server`：`POST /workspace/search-in-files`（正常/缺参/路径不存在）；事件 payload 形状
- **前端纯函数**：`replaceFileHits/dropFileHits/markHitStale/syncStaleFlags`；`findLineForQuery`（精确命中/重定位/找不到→null；Aa、全字、正则三种选项）；`resolveSourceLineElement`（单行块 `start===end`、跨行块、最近前置块回退）
- **四端 parity**：`searchInFiles`、`onFilesChanged` 在 `tauri-bridge`（含 http 继承）/`preview-bridge`/`mock-bridge`/`httpBridge` 均存在且语义一致（参照 `shared/ipc/__tests__/storage-parity.test.ts`）
- **接线断言**：沿用 `filesSearchMode.test.ts` 风格，断言两面板均调用共享 helper
- **双端手测清单**（Tauri ＋ 浏览器预览）：
  1. 外部工具改文件 → 面板该文件命中自动更新；删除 → 条目消失
  2. 应用内保存 → 命中更新；应用补丁 → 变更树自动刷新
  3. 点击失效条目 → 行内「已失效」＋ 汇总计数，不跳转、不白屏
  4. 内容移位后点击 → 落到新位置（重定位）
  5. 变更面板预览跳转 ＋ 落点闪烁；diff 揭示不白屏
  6. 切换工作区 → 命中清空、watcher 重建

## 四端一致要求

- 新 IPC 必须在四端同步实现并在 `shared/ipc/workspace.ts` 登记；浏览器/mock 无真实 watcher → `onFilesChanged` 返回 no-op 取消函数（沿用 `onFileChanged` 先例），`searchInFiles` 由 preview 服务端与 mock 内存实现同名语义。
- 所有 UI 文案走 i18n（`file.ts` 中英双语），禁止硬编码。新增 key（中英成对）：

| key | 中文 | 用途 |
|-----|------|------|
| `searchHitStale` | 已失效 | 行内标记（片段行/文件行） |
| `searchStaleSummary` | {count} 处结果已失效 | 面板汇总（`{count}` 走 `formatT`） |
| `searchPartialResults` | 仅显示部分结果 | 命中上限提示 |

## 风险与取舍

| 风险 | 取舍 |
|------|------|
| 大仓递归监听的内存/句柄 | 忽略剪枝 + 启动失败降级 + warn 日志；必要时限制监听目录数 |
| 事件风暴（构建产物、日志） | 后端 400ms 去抖 + 忽略规则（含应用自身写入）+ 前端 200ms 合并 |
| 每文件上限使总量不再严格截断 | 面板显示"仅显示部分结果"（决策 5），语义显式化 |
| `searchInFiles` 增加一次 IPC 往返 | 批量路径数组一次请求；仅对"命中过的变更文件"触发 |
| 重定位可能落到另一处相同文本 | 取**距原行最近**的匹配；行内保留更新后的行号，用户可感知 |

## 验收标准

1. 上述双端手测清单 6 项全部通过（Tauri 与浏览器预览一致）。
2. 文件变更后，检索面板不再出现"点击落空"；内容不存在时明确提示「已失效」。
3. 变更面板预览跳转与文件面板行为一致，diff 揭示不再有 `RangeError` 风险。
4. `cargo clippy --workspace --all-targets -- -D warnings` 与 `pnpm --dir frontend run lint`、`tsc --noEmit` 全绿；受影响测试通过。
5. 新增/修改的接口在四端均有实现与 parity 测试。

## 实施顺序（供 plan 参考，非本 spec 内容）

Rust（watch/search_in_files/handler/事件）→ 四端桥 → store 模型与 reducer → 共享 helper 与两面板接入 → ErrorBoundary → 测试与手测。
