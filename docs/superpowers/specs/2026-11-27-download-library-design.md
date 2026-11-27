# 下载卡片文件状态与路径迁移设计

- 日期：2026-11-27
- 状态：待 builder check / 用户批准
- 范围：下载卡片（中心 + 右侧面板）、`download_history`、默认下载路径迁移、重新下载
- 关联进度：`docs/root-cause-to-close/2026-11/progress-2026-11-27-080441.md` 事项 2

## 1. 意图

下载卡片要回答三个问题：

1. 我下载过什么？
2. 这些文件现在还在不在、在不在当前默认目录？
3. 文件不在了，我还能重新下载；文件在别处，我还能打开/定位。

它**不是**当前下载目录的文件浏览器：列表以 `download_history` 记录为骨架，不扫描目录、不展示不是 Adlo 下载的文件。文件状态（存在/缺失/非默认位置）是每次打开卡片时按记录路径查出来的瞬时状态。

## 2. 目标

- 所有状态（`active` / `paused` / `completed` / `failed` / `canceled`）合成**一个普通列表**，按 `created_at DESC` 排序，不分组。
- `completed` 记录增加文件状态：存在（默认目录）/ 存在（非默认位置）/ 缺失。
- 缺失：文件名删除线、整行变暗、不可点击打开；状态行显示「文件缺失」；保留「重新下载」「移除记录」「复制链接」。
- 非默认位置：正常显示 + 「非默认位置」标签；悬停显示完整路径；打开/在文件夹中显示仍可用。
- `failed` / `canceled`：正常显示状态文字；提供「重新下载」。
- 重新下载：复用原记录 id；走 WebView2 同标签同文档下载（保留会话、进度、暂停/取消），不新建标签/WebView；失败 → `failed`，取消 → `canceled`。
- 默认路径变更 + 自动迁移：只迁移 `download_history` 中已完成且文件存在的文件；旧目录中的其它文件保留；记录 `file_path` 更新到实际落点；进行中/暂停阻止迁移。
- 相关文案同步修改。

## 3. 非目标

- 不自动找回被用户改名/移动的文件；不提供「重新关联」文件选择器（本期）。
- 不扫描当前默认目录、不显示非 Adlo 下载的文件。
- 不提供单条「迁移到当前目录」操作；迁移统一走设置。
- 不新增数据库列来持久化文件状态；文件状态是查询时瞬时的。
- 不做后台轮询 stat；只在打开卡片、路径变更完成、窗口重新聚焦时检查。
- 不改变 `active` / `paused` 下载本身的进度、暂停、恢复机制。
- 不迁移 `failed` / `canceled` 的残留文件（它们不在本次 tracked-only 迁移范围内）。

## 4. 现状与约束（代码事实）

- `download_list` 只读 `download_history`，不检查文件存在；`BrowserDownloadMenu` 当前按 `active / paused / failed / completed / canceled` 分组。
- `download_change_default_path`（`migrate=true`）当前搬移**旧默认目录整棵树**，成功后可能删除旧目录；**不更新 `download_history.file_path`**。迁移关闭时旧文件留在旧路径，但卡片不提示。
- `download_open_file` 直接打开路径，不检查存在；失败仅前端 `console.warn`。`download_show_in_folder` 在文件不存在时回退到当前默认目录。`delete_file_and_record` 在文件缺失时仍会删记录。
- 重新下载没有现成 reset 路径：`resume_download` 拒绝终态记录；WebView2 原生 `DownloadStarting` 会创建新记录；后台 reqwest 路径不带 WebView2 cookie / Referer / UA，只能下公开 URL，且可能把 HTML 登录页写成 `.crdownload` 并误标完成。
- `download_history` 已有 `file_path`、`created_at`、`completed_at`、`interrupt_reason` 等字段，无需 schema 变更。
- 下载卡片在中心工具栏和右侧面板工具栏都有入口；需要把承载卡片的宿主活动 WebView/tab 传给重新下载命令。

## 5. 方案取舍

### 方案 A：扫描当前默认目录（文件浏览器）

只列当前默认目录中存在的文件，用下载记录补充元数据。

- 优点：天然处理改名/移动；不需要 stat 历史记录。
- 缺点：会混入不是 Adlo 下载的文件；旧路径文件直接消失；文件改名后丢失来源/时间/重新下载入口；与“下载卡片”语义不符。
- 未采用。

### 方案 B：纯下载历史（只读 DB，不查文件）

保持当前记录列表，只修迁移记录更新。

- 优点：改动最小。
- 缺点：无法区分文件是否还在；打开会静默失败；无法满足“删除/改名/移动后怎么显示”的需求。
- 未采用。

### 方案 C（采用）：记录骨架 + 瞬时文件状态

列表仍来自 `download_history`；打开卡片时批量 stat 记录路径，得到存在/缺失/是否在默认目录；缺失项保留在列表中，用删除线/变暗/禁用打开表达；路径迁移只搬记录中的文件并同步 `file_path`；重新下载复用记录 id，走 WebView2 同标签下载。

- 优点：保留来源/时间/重新下载；旧路径文件可见；不混入无关文件；数据库只增加瞬时查询，不改 schema。
- 代价：需要 stat 批量命令、pending-redownload 映射、迁移逐文件更新。

## 6. 已定决策

| # | 决策 |
| --- | --- |
| 1 | 列表以 `download_history` 为骨架，不扫描目录。 |
| 2 | 所有状态合成一个普通列表，按 `created_at DESC` 排序，不分组。 |
| 3 | `completed` 且文件存在：正常项；文件在非默认目录：加「非默认位置」标签 + 完整路径 tooltip。 |
| 4 | `completed` 且文件缺失：文件名删除线、整行变暗、不可点击打开；状态「文件缺失」；保留重新下载/移除记录/复制链接；隐藏打开文件/在文件夹中显示/删除文件。 |
| 5 | 缺失态只作用于 `completed`；`failed` / `canceled` 只显示自身状态，不叠加删除线。 |
| 6 | `failed` / `canceled` 也提供「重新下载」。 |
| 7 | 文件状态检查：打开卡片、路径变更完成、窗口重新聚焦（节流）时批量 stat；不后台轮询。 |
| 8 | 重新下载只对 `completed` 缺失 / `failed` / `canceled` 开放；复用原记录 id。 |
| 9 | 重新下载走 WebView2 同标签同文档下载 + pending-redownload 映射，保留会话/进度/暂停/取消；无活动 WebView 时回退隐藏下载标签。 |
| 10 | 重新下载目标为当前默认目录；冲突用现有 `resolve_conflict_path` 改名；`file_path`/`file_name` 更新到实际文件；`created_at` 更新为本次开始时间。 |
| 11 | 重新下载失败 → `failed`；取消 → `canceled`；成功 → `completed`。 |
| 12 | 自动迁移只搬 `completed` 且文件存在、路径在旧默认目录下的记录文件；保留相对子路径；冲突改名；更新记录。 |
| 13 | 有 `in_progress` / `paused` 下载时阻止迁移并提示；缺失记录跳过并汇总；`failed` / `canceled` 残留文件不迁移。 |
| 14 | 旧目录中的非记录文件保留；旧目录非空不再是错误；只在完全空且非系统保护目录时尽力删除。 |
| 15 | 迁移失败：已搬文件保留新路径并更新记录；设置不切换；返回已迁移/缺失/失败计数；前端失败后也刷新下载列表。 |
| 16 | 改名/移动不自动找回；不提供手动关联；用户重新下载或移除记录。 |
| 17 | 不提供单条「迁移到当前目录」。 |
| 18 | Ask 模式重新下载照常弹原生保存对话框；用户选定的路径写回 `file_path`；只有 Auto 模式预计算当前默认目录 + 冲突改名。 |
| 19 | 启动时把无活跃操作的 `in_progress` 行标为 `failed`（`Interrupted`）；迁移只被真实活跃/暂停任务阻止。 |
| 20 | 文件状态在 started/finished/remove/delete/clear 时失效；成功完成后单条刷新。 |
| 21 | `blob://` 等非 http(s) 记录隐藏「重新下载」「复制链接」。 |
| 22 | pending 匹配失败且该 tab 只有一个 pending 时兜底复用，避免同一次操作多出一条记录。 |
| 23 | 点击重新下载到 `browser-download-started` 之间用 `redownloadingIds` 显示准备中、禁用重复点击；15s 超时回滚并提示。 |

## 7. UX 规格

### 7.1 列表

```text
[icon] report.pdf      2.1 MB                 11-27 11:02
[icon] setup.exe       失败 · 网络错误         11-27 11:03
[icon] movie.mp4       已取消                 11-27 11:04
[icon] ~~old.zip~~     文件缺失               11-27 11:05
[icon] archive.7z      2.1 MB  非默认位置     11-27 11:06
```

- 一个 `adl-download-menu__list`，按 `created_at DESC`；不再渲染状态分组标题。
- 搜索继续过滤文件名/URL；空结果显示现有无结果文案。
- 顶部标题、模式开关、搜索、底部设置/清空/打开文件夹保持不变。
- 下载按钮的进度环/角标继续由 `activeDownloads` 驱动，不受列表形态影响。

### 7.2 行状态

| 状态 | 显示 | 点击 | 菜单 |
| --- | --- | --- | --- |
| `active` | 进度条 + 速度 | 不打开文件 | 暂停、取消、更多 |
| `paused` | 「已暂停」 | 不打开文件 | 继续、取消、更多 |
| `completed`，文件存在，默认目录 | 正常 | 打开文件 | 打开、在文件夹中显示、复制链接、移除记录、删除文件 |
| `completed`，文件存在，非默认目录 | 正常 + 「非默认位置」 | 打开文件 | 同上 |
| `completed`，文件缺失 | 变暗 + 文件名删除线 + 「文件缺失」 | **禁用** | 重新下载、复制链接、移除记录 |
| `failed` | 「失败 · 原因」 | 不打开文件 | 重新下载、复制链接、移除记录（如仍有 `file_path`，保留删除文件） |
| `canceled` | 「已取消」 | 不打开文件 | 重新下载、复制链接、移除记录 |

- 缺失行的 `aria-disabled="true"`；整行不响应 `onClick`，但右键/「⋯」仍打开菜单。
- 「非默认位置」标签放在 meta 行；tooltip 显示完整 `file_path`。
- 文件状态加载中：completed 行先按正常显示，状态返回后再切换；避免闪烁可在首次加载前不渲染缺失样式。

### 7.3 重新下载交互

- 菜单项「重新下载」只出现在 `completed` 缺失 / `failed` / `canceled`，且 URL 是 http(s)。
- 点击后菜单关闭；行进入「准备中」：显示小型 spinner / 「正在准备…」，`redownloadingIds` 禁用重复点击。
- `browser-download-started` 到达后：清除 `redownloadingIds`，行进入 active（原 id），进度/角标出现。
- 15s 内没有 `browser-download-started`：清除 `redownloadingIds`，行回到原来的缺失/失败/取消状态，toast「重新下载未开始」。
- 目标路径：
  - Auto 模式：当前默认目录（含 storage override）；文件名沿用 `file_name`，冲突时 `stem (n).ext`。
  - Ask 模式：照常弹原生保存对话框；用户选定路径写回 `file_path`，reset 在对话框返回后执行。
- 成功：行回到正常 completed（文件存在）；失败：状态 `failed` + 原因；取消：`canceled`。
- 重新下载期间暂停/继续/取消按现有下载行为；`created_at` 已更新，列表位置以本次开始时间排序。

### 7.4 迁移设置文案

- 开关说明：**「更改默认保存位置时，仅迁移下载记录中的文件；旧目录中的其它文件保留。」**
- 开启确认：替换“搬迁全部文件和文件夹 / 删除旧目录”的表述，改为“仅迁移下载记录中的文件；旧目录其它文件保留”。
- 阻止提示：**「有正在下载或暂停的任务，请先完成或取消后再迁移。」**
- 结果提示：**「已迁移 N 个下载文件；M 个文件缺失，未迁移。」**
- 失败提示：沿用 `storageDownloadMigrateFailed`，正文可保持「迁移文件失败：{error}」。
- 关闭迁移时仍只切换路径，不搬任何文件；旧文件显示为「非默认位置」。

## 8. 后端设计

### 8.1 文件状态查询

新增命令：

```text
download_file_states(ids: Vec<String>) -> IpcResult<Vec<DownloadFileState>>
```

```rust
struct DownloadFileState {
    id: String,
    exists: bool,
    in_default_dir: bool,
    error: Option<String>, // NotFound / PermissionDenied / 其它 I/O
}
```

- 在 `spawn_blocking` 中执行，避免主线程 stat。
- `in_default_dir` 用当前 `effective_default_dir` + `normalize_path_key` / 组件级 `starts_with` 判断，避免 `Downloads2` 前缀误判。
- 任何 stat 错误都返回 `exists=false` + `error`；前端统一按缺失处理，tooltip 可显示原因。
- 只对 `completed` 记录调用（或调用后前端只对 completed 使用）；`active/paused/failed/canceled` 忽略状态。
- 前端只在卡片打开、路径变更后、窗口 focus（节流）时调用；id 列表来自当前 `downloads`。

### 8.2 重新下载

新增命令：

```text
download_redownload(id: String, tab_id: Option<String>) -> IpcResult<()>
```

流程：

1. 读取记录；只允许 `completed` 且文件缺失 / `failed` / `canceled`；URL 必须是 http(s)；否则返回 `InvalidInput`，前端菜单层同时隐藏。
2. 目标路径：
   - Auto 模式：`resolve_download_target(url, file_name)`（当前默认目录 + 冲突改名），删除旧的 `<file_path>.crdownload`（如果存在）。
   - Ask 模式：不预计算；由 `DownloadStarting` 里现有的 `blocking_save_file` 弹框，用户选定路径后再 reset。
3. 在 `DownloadManager` 注册 pending-redownload：
   ```rust
   PendingRedownload { record_id, tab_id, url, expires_at: Instant + 15s }
   ```
   同一时间只允许一个 pending；已有则返回忙碌错误。
4. 找到 `tab_id` 对应的 WebView，调用 `navigate(url)`（同标签同文档导航）。如果 `tab_id` 缺失/找不到 WebView：
   - 回退到隐藏下载标签：用现有新标签下载路径打开该 URL，并把 pending 绑定到新 tab id；
   - 该路径可能带来 1.5–5s 的 WebView 创建阻塞，属于低频回退，需在 UI 上正常显示 `redownloadingIds` / active。
5. `DownloadStarting` 的 `requested_handler` 先检查 pending：
   - 优先按 `(tab_id, url)` 匹配；
   - 如果 URL 因重定向/签名变化没有精确匹配，但该 tab 只有**一个**未过期 pending，则兜底消费它；
   - 命中后先按当前模式解析最终路径（Auto：步骤 2 的预计算结果；Ask：`blocking_save_file` 返回的用户路径），再调用 `DownloadManager::reset_for_redownload(record_id, destination_final_path)`，**不创建新记录**；
   - 把 `last_record_id` 设为原记录 id，启动现有进度监控；
   - 发出 `browser-download-started`（payload 是更新后的原记录），前端按 id upsert 并清除 `redownloadingIds`；
   - 清除 pending。
6. 超时/导航未触发下载：清除 pending，记录保持不变，前端清除 `redownloadingIds` 并 toast「重新下载未开始」。
7. 若匹配失败且没有唯一 pending 可兜底：走正常的「新建记录」路径；原记录保持不变（用户可再次重试或移除）。

`reset_for_redownload` 的 DB 更新：

```sql
UPDATE download_history
SET status = 'in_progress',
    bytes_received = 0,
    total_bytes = NULL,
    interrupt_reason = NULL,
    created_at = ?now,
    completed_at = NULL,
    auto_resume_count = 0,
    etag = NULL,
    last_modified = NULL,
    file_path = ?new_path,
    file_name = ?new_file_name,
    source_tab_id = ?tab_id
WHERE id = ?id
```

- 成功后由现有 `complete_download` 更新 completed/bytes；失败/取消由现有 finished/canceled 事件把状态改为 `failed` / `canceled`（Q19 = C）。
- 重新下载不删除旧文件；缺失场景没有旧文件。若 failed/canceled 记录仍有残留文件，保留，新文件冲突时改名。
- 前端 `browser-download-started` 处理改为**按 id upsert**（已存在则替换，不 prepend 重复项），保证复用记录不会出现两条。

### 8.3 迁移

`change_default_path` 新流程：

1. 读取 settings，计算 `old_effective` / `new_effective`；校验新路径绝对路径、非重叠、非深保护树（沿用现有校验）。
2. 查询 `download_history` 中 `status='completed'` 的记录（lean query：id, file_path, file_name）。
3. 若存在任何 `in_progress` / `paused` 记录：直接返回错误 `downloads_active`，不移动任何文件。
4. 过滤 `file_path` 在 `old_effective` 下、文件存在的记录；按 `file_path` 去重（同一文件多条记录只搬一次，但所有记录都更新）。
5. 对每条：
   - `rel = file_path.strip_prefix(old)`（Windows 大小写不匹配时按组件重建）；
   - `dest = new.join(rel)`；`create_dir_all(dest.parent())`；
   - 若 dest 存在：`resolve_conflict_path(dest)` 得到实际 dest；
   - `move_path(src, dest)`；成功后 `UPDATE download_history SET file_path = ?, file_name = ? WHERE id = ?`；冲突改名时同步 `file_name`。
6. 缺失文件：跳过，计入 `missing`；不修改记录。
7. `failed` / `canceled` 记录：不迁移，路径保持不变。
8. 记录路径在 `old_effective` 之外（“每次询问”保存到别处 / 自定义路径）：不移动，记录保持原路径。
9. 旧目录：移动结束后，如果完全为空且不是系统保护目录，尽力 `remove_dir`；仍有非记录文件则保留，不算错误。
10. 设置最后落盘；任何一步失败：
    - 已移动的文件保留新路径，记录已更新；
    - 设置不切换；
    - 返回已迁移/缺失/失败计数和错误信息；
    - 前端收到失败后仍调用 `fetchDownloads()` 刷新记录路径。

新增 DB helper：

```sql
UPDATE download_history SET file_path = ?1, file_name = ?2 WHERE id = ?3
```

迁移不再调用现有整目录 `migrate_dir`；相关整目录测试重写为 tracked-only 测试。

### 8.5 启动期回收 stale `in_progress`

- 应用启动、下载 UI 可用之前，在 `DownloadManager` 初始化/`spawn_blocking` 中执行一次：
  ```sql
  UPDATE download_history
  SET status = 'failed', interrupt_reason = 'Interrupted'
  WHERE status = 'in_progress'
  ```
- 只处理 `in_progress`，不动 `paused`（用户主动暂停，`.crdownload` 仍有效）。
- 这一步之后，迁移的“进行中/暂停阻止”只对应真实会话里的活跃任务 + 用户暂停任务；崩溃残留的幽灵行变成失败项，可在列表里重新下载。
- 启动回收需要在 `download_list` 首次返回前完成，避免 UI 闪一帧假进度；实现上放在下载管理器初始化或 app setup 的 blocking 阶段。
- 测试：seed 一条 `in_progress` + 一条 `paused`，启动回收后 `in_progress` 变 `failed/Interrupted`，`paused` 不变；迁移只被 `paused`/活任务阻止。

### 8.4 事件

- 重新下载复用记录：`browser-download-started` 触发前端 upsert；进度/完成/失败/取消沿用现有事件。
- 迁移命令返回结果；前端成功/失败后都刷新 `downloads`（失败时尤其重要）。
- 文件状态查询不写事件，前端按需刷新。

## 9. 前端设计

### 9.1 Store

`browserDownloadsSlice` 新增：

```ts
downloadFileStates: Record<string, DownloadFileState>;
redownloadingIds: ReadonlySet<string>;

refreshDownloadFileStates: (ids?: string[]) => Promise<void>;
redownloadDownload: (id: string, tabId?: string) => Promise<IpcResult<void>>;
```

- `downloadFileStates` / `redownloadingIds` 都是瞬时状态，不持久化。
- `refreshDownloadFileStates` 调用 `download_file_states`；默认取当前 `downloads` 中 completed 的 id。
- `redownloadDownload` 调用 `download_redownload`：
  - 调用前把 id 加入 `redownloadingIds`，并启动 15s 超时；
  - 成功返回后不手工改下载状态，等 `browser-download-started`；事件到达时移出 `redownloadingIds`；
  - 调用失败/超时：移出 `redownloadingIds`，返回错误/触发 toast。
- `browser-download-started` 的 reducer 改为按 id upsert，兼容复用记录；同时删除 `downloadFileStates[id]`（active 不显示缺失态）。
- 状态/文件变更时的 `downloadFileStates` 失效规则：
  - `browser-download-started` / `browser-download-finished` / `browser-download-error` / `browser-download-paused` / `browser-download-resumed` / `browser-download-canceled`：删除该 id；
  - `browser-download-finished` 且 success：删除后异步 `refreshDownloadFileStates([id])`，让重新下载成功的那一行立刻从删除线恢复；
  - `removeDownloadRecord` / `deleteDownloadFile`：删除该 id；
  - `clearDownloadHistory`：清空整个 map。
- `browser-download-started` 也负责清除 `redownloadingIds` 中对应 id。

### 9.2 Hook / 刷新

- `useBrowserDownloads` 在 `isTauri` 就绪后继续负责订阅/首次拉取。
- 打开卡片时：`fetchDownloads()` + `refreshDownloadFileStates()`。
- 监听 `downloadSettings.default_path` 变化：完成后刷新状态。
- 监听 `window.focus`：距上次刷新 ≥2s 时刷新状态（节流），不做定时器轮询。

### 9.3 组件

- `BrowserDownloadMenu`：
  - 移除 `DownloadGroup` 分组；`filteredDownloads.sort((a,b) => b.created_at - a.created_at)`。
  - 每项传 `fileState`（来自 `downloadFileStates[record.id]`）和 `isDefaultLocation`（`fileState.in_default_dir`）。
  - 搜索只过滤，不改变排序。
- `BrowserDownloadItem`：
  - 新增 props：`fileState?: DownloadFileState`、`redownloading?: boolean`。
  - `isMissing = record.status === 'completed' && fileState && !fileState.exists`。
  - 缺失：`adl-download-item--missing`、文件名 `line-through`、`onClick` 直接 return、`aria-disabled`。
  - 非默认位置：meta 行渲染「非默认位置」badge + `title={record.file_path}`。
  - 状态文字：`failed` 用现有失败原因；`canceled` 新增「已取消」；缺失新增「文件缺失」；`paused` 可加「已暂停」；`redownloading` 显示「正在准备…」+ spinner。
- `BrowserDownloadContextMenu`：
  - 新增 `onRedownload`；`completed` 缺失 / `failed` / `canceled` 且 URL 为 http(s) 时显示「重新下载」。
  - `blob://` 等非 http(s) 记录隐藏「重新下载」和「复制链接」；缺失的 blob 只保留「移除记录」。
  - 缺失时隐藏打开/在文件夹中显示/删除文件；保留复制链接、移除记录。
  - `failed` / `canceled` 保留复制链接（仅 http(s)）、移除记录、重新下载；如仍有 `file_path` 可保留删除文件（实现时按现有语义）。
  - `redownloadingIds.has(id)` 时「重新下载」禁用。
- `useDownloadItemActions`：
  - 新增 `handleRedownload(record)`：读取当前宿主活动 tab id，调用 `redownloadDownload`；错误 toast。
  - `handleOpenFile` / `handleShowInFolder` 由菜单层控制，缺失时不显示。
- `BrowserDownloadButton`：
  - 新增可选 `activeTabId` prop；`CenterBrowserView` / `BrowserToolbar` 传入本宿主活动浏览器 tab id。
  - 传给 `BrowserDownloadMenu`，再传给重新下载 action；无 tab 时传 undefined，由后端回退/报错。

### 9.4 i18n

新增 key（命名按现有 `browserDownload*` 约定，中英同步）：

- `browserDownloadMissingFile`：文件缺失 / File missing
- `browserDownloadNonDefaultLocation`：非默认位置 / Non-default location
- `browserDownloadRedownload`：重新下载 / Download again
- `browserDownloadCanceled`：已取消 / Canceled
- 迁移文案替换/新增：
  - `storageDownloadMigrateHint` / `...EnableConfirm` 改为 tracked-only + 保留其它文件；
  - 新增 `storageDownloadMigrateBlockedActive`（进行中/暂停阻止）；
  - 新增 `storageDownloadMigrateResult`（已迁移 N / 缺失 M）；
  - 现有 `storageDownloadMigrateFailed` 保留。

`settingsSearchIndex` 索引 label + hint，文案变化后无需额外改索引。

### 9.5 CSS

- `.adl-download-item--missing { opacity: ...; }`
- `.adl-download-item--missing .adl-download-item__name { text-decoration: line-through; }`
- `.adl-download-item__badge`（非默认位置/状态）复用现有 meta 样式或新增小徽章。
- 移除/保留分组样式：`adl-download-menu__group*` 不再使用；如无其它引用，按死代码检查删除。
- 缺失行禁用 hover 的打开指针，但保留菜单按钮可点。

## 10. 边界与风险

- **同标签重新下载的导航风险**：如果 URL 现在返回 HTML 而不是下载，当前标签可能被导航走。pending 15s 超时；记录不变；用户可返回。原 URL 之前是下载，正常情况可接受。
- **Ask 模式**：重新下载照常弹原生保存框；目标路径在对话框返回后才确定，reset 必须延迟到那时；Auto 模式才预计算默认目录 + 冲突改名。
- **无活动 WebView 回退**：隐藏下载标签会重新引入 1.5–5s 子 WebView 创建阻塞；只在没有活动浏览器标签时发生，UI 显示 `redownloadingIds` / active。
- **pending 映射**：优先按 `(tab_id, url)` 匹配；URL 因重定向/签名变化不匹配时，如果该 tab 只有一个未过期 pending，则兜底复用；不做前缀匹配；超时清理。
- **重新下载未开始**：15s 内没有 `browser-download-started` → 清除 `redownloadingIds`，行回到原状态，toast「重新下载未开始」；记录未被修改。
- **启动期幽灵 `in_progress`**：启动时统一标 `failed/Interrupted`；`paused` 保留。迁移只被真实活跃任务 + paused 阻止。
- **`blob://` / 非 http(s)**：菜单层隐藏重新下载/复制链接；后端也返回 `InvalidInput`，避免误用。
- **迁移部分失败**：已移动文件/记录保持新路径，设置不切换；返回计数；前端刷新。不要尝试全局回滚（会引入双倍磁盘/回滚失败）。
- **stat 错误**：网络盘/权限错误统一按缺失显示，tooltip 显示原因；不在后台反复重试。
- **Windows 路径大小写/分隔符**：迁移/默认目录判定使用 `normalize_path_key` + 组件级 `starts_with`，不要用字符串前缀。
- **失败/取消的状态变化**：重新下载失败 → failed，取消 → canceled；原 completed 缺失状态会被新状态替换（Q19 = C）。
- **旧目录删除**：只在完全空且非系统保护目录时删除；有非记录文件必须保留。
- **重新下载冲突**：新文件 `stem (n).ext`，`file_name` 同步，避免卡片显示旧名。
- **文件状态只对 completed**：failed/canceled 的残留文件不显示 missing/非默认标签。
- **文件状态失效**：任何状态变更/移除/删除/清空都删 `downloadFileStates[id]`；成功完成后再单条刷新，避免重新下载成功后仍显示删除线。
- **清理历史**：仍清空所有记录；文件状态 map 需同步清空。

## 11. 测试

### 11.1 Rust

- `download_file_states`：存在/缺失/非默认/权限错误/网络路径；`in_default_dir` 大小写与前缀边界。
- `reset_for_redownload`：状态、bytes、created_at、completed_at、file_path/file_name、source_tab_id；原 id 不变；Auto / Ask 两种路径解析。
- pending-redownload：同 tab + URL 命中、URL 变化但唯一 pending 兜底、超时、重复 pending、无 tab 回退、完成/失败/取消事件。
- 启动回收：`in_progress` → `failed/Interrupted`，`paused` 不变。
- 迁移：只搬 tracked completed；untracked 保留；旧目录保留；冲突改名更新 file_path/file_name；嵌套相对路径；缺失跳过；InProgress/Paused 阻止；部分失败；系统目录不删；空旧目录删除。
- 前端 store/event upsert；重下载不重复；`downloadFileStates` 在 started/finished/remove/delete/clear 时失效，成功后单条刷新。

### 11.2 Frontend

- 单列表排序（created_at DESC）、无分组标题。
- 缺失行：删除线、变暗、点击不打开、菜单项正确。
- 非默认位置 badge/tooltip。
- failed/canceled 状态文字 + 重新下载。
- 重新下载调用参数（id, tabId）；失败 toast。
- 迁移文案（zh/en）与成功/失败/阻止 toast。
- 文件状态刷新时机：打开卡片、路径变化、focus 节流。
- i18n key parity。

### 11.3 手工

- 下载 → 打开卡片 → 文件在默认目录：正常打开。
- 改默认路径 + 自动迁移开：文件搬到新目录，卡片路径正常；旧目录非记录文件保留。
- 改默认路径 + 自动迁移关：旧文件显示「非默认位置」，仍可打开。
- 删除/改名/移动已下载文件后打开卡片：缺失态、删除线、不可点、可重新下载/移除。
- 重新下载：复用同一行、进度/角标出现；成功后正常；失败 → failed；取消 → canceled。
- Ask 模式重新下载：弹原生保存框，用户路径写回 `file_path`。
- 点击重新下载后 15s 未开始：准备中消失、回到原状态、toast。
- 下载中强杀应用再启动：该行显示 `failed · Interrupted`，迁移不被幽灵行阻止。
- `blob://` 记录：不显示重新下载/复制链接，只保留移除记录。
- 进行中/暂停时尝试迁移：被阻止并提示。
- 非默认路径/缺失项搜索、清空历史。

## 12. 实施顺序（给计划用）

1. 后端 `download_file_states` + TS 类型/store。
2. 后端 `reset_for_redownload` + pending-redownload + `download_redownload` 命令。
3. 前端卡片单列表 + 状态文字 + 缺失/非默认样式 + 菜单动作。
4. 迁移 tracked-only + 记录更新 + 文案 + 测试。
5. 事件 upsert、focus/路径变更刷新、i18n、CSS、手工验证。
6. 删除临时探针（`freezeProbe` / `[DBG-freeze]` / `create-for-tab slow`）并收尾。

## 13. 留给 builder 的决定

- 命令/类型命名、pending 结构体字段与清理位置。
- `download_file_states` 的并发/批量上限、错误文案。
- 无活动 WebView 回退的具体实现（复用现有新标签下载路径 vs 其它）。
- Ask 模式 `blocking_save_file` 返回后 reset 的具体时序/线程。
- 启动期 `in_progress → failed` 回收放在 DownloadManager 初始化还是 app setup 的 blocking 阶段。
- 缺失/非默认 badge 的精确 CSS/组件复用。
- 迁移部分失败的计数/错误文案细节。
- 测试文件组织与 fixture。
