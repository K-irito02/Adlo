# 0039 下载卡片以记录为骨架，重新下载复用记录，迁移只搬记录内文件

- Status: Accepted
- Date: 2026-11-27
- Domain: 内置浏览器 / 存储治理

## Context

下载卡片原本只按状态分组展示 `download_history`，既不检查文件是否仍在，也不提示路径变化：

1. 更改默认保存目录并开启自动迁移时，旧目录文件被搬走，但 `download_history.file_path` 未更新；旧目录可能被删除，历史项变成死链。
2. 用户删除 / 改名 / 移动已下载文件后，记录仍在，点击打开只留下前端 warn，没有缺失态，也没有重新下载入口。
3. 下载链接经 `target=_blank` 路由到新建标签，WebView2 子窗口创建耗时 1.5–5s 并占住 Tauri 命令管线；加载动画、侧栏 IPC 与下载卡片渲染一起受阻塞。WebView2 对不可见 / 1×1 的触发 WebView 不发起 `DownloadStarting`，隐藏触发方案（B）实测不可行。

## Decision

1. **记录骨架 + 瞬时文件状态**：卡片以 `download_history` 为唯一骨架，不扫描默认目录、不混入非 Adlo 文件；所有状态合成一个普通列表，按 `created_at DESC` 排序，不再分组。文件存在性只在打开卡片、路径变更完成、窗口重新聚焦（节流）时批量 `stat`，不后台轮询。
2. **行状态**：`completed` 且文件存在为正常项，落在默认目录之外时加「非默认位置」标签并提示完整路径；`completed` 且文件缺失则变暗、文件名删除线、不可点击打开，保留重新下载 / 复制链接 / 移除记录，隐藏打开 / 在文件夹中显示 / 删除文件。缺失态只作用于 `completed`；`failed` / `canceled` 只显示自身状态并同样提供重新下载。
3. **同文档下载**：带 `download` 属性或明确下载扩展名的普通 `target=_blank` 链接在注入脚本里 `preventDefault()` 后走隐藏 iframe 触发当前 WebView 的 `DownloadStarting`，不新建可见标签 / WebView；`useBrowserUrlChange` 忽略这类下载导航带来的地址栏更新。普通站点的 `window.open` 仅对明确文件扩展名使用同一隐藏 iframe 路径，`/files/`、`/get/` 等宽松候选继续保留原生新标签语义；重新下载命令仍走受控的 `window.location.assign`。
4. **重新下载复用原记录**：仅 `completed` 缺失 / `failed` / `canceled` 且 URL 为 http(s) 时可重新下载；注册带 tab / URL / 15s 过期的单槽 pending，`DownloadStarting` 命中后调用 `reset_for_redownload` 重置计时、字节、校验值与路径并复用原 id，同时把记录的 `url` 更新为实际上报 URL（重定向 / 签名 URL 变化下 `handle_download_finished` 与原生 operation 都按 URL 查找）。兜底匹配只允许同 tab 或注册时无 tab，避免无关下载抢走 pending。Auto 模式目标为当前默认目录 + 冲突改名；Ask 模式照常弹保存框并在返回后 reset。失败 → `failed`，取消 → `canceled`；超时回滚准备态并 toast「重新下载未开始」。
5. **tracked-only 迁移**：更改默认目录时先检查 `in_progress` / `paused`，存在则阻止并提示；只搬 `download_history` 中 `completed` 且文件存在、旧路径位于旧默认目录下的文件，保留相对子路径、冲突改名、同步 `file_path` / `file_name`；旧目录的非记录文件保留，仅当目录完全空且非系统保护目录时尽力删除。缺失跳过并汇总，`failed` / `canceled` 残留不迁移。部分失败时已搬文件保留新路径、设置不切换，错误带计数返回，前端随后刷新列表。
6. **启动期回收**：无活跃操作的 `in_progress` 记录标为 `failed` / `Interrupted`；`paused` 不动，迁移只被真实活跃 / 暂停任务阻止。
7. **不自动找回**：改名 / 移动不做自动关联，也不提供单条「迁移到当前目录」；用户重新下载或移除记录。

## Alternatives considered

- **隐藏触发 WebView（方案 B）**：三种变体（隐藏 builder、可见 builder + 1×1、about:blank + show + navigate）实测均不触发 `DownloadStarting`，放弃；保留 A+ 新标签路径仅作无活动 WebView 时的回退。
- **扫描默认目录作为文件浏览器**：会把非 Adlo 文件混入卡片，违背「下载卡片即下载历史」的口径。
- **重新下载新建记录**：会出现同一文件的两行，且原生进度事件与会话继承复杂；改为复用原 id 后前端按 id upsert。
- **迁移旧目录全部文件**：会动到用户自有文件；改为只搬下载记录中的文件，旧目录其它文件保留。
- **让 `target=_blank` 或普通站点 `window.open` 下载候选走 `window.location.assign`**：pdf / 媒体等可内联渲染时会顶掉当前页面，宽松路径还可能把普通 HTML 误当下载；改为仅对明确扩展名使用隐藏 iframe，受控的重新下载路径保留同文档导航。

## Consequences

- 文件状态是缓存快照：用户在外部删除 / 移动文件后，卡片直到下次打开、路径变更或窗口聚焦才会反映；不做后台轮询。
- 无活动 WebView 时重新下载回退到现有 A+ 新标签路径，可能短暂显示标签并付出 1.5–5s WebView 创建耗时。
- 普通下载链接改用隐藏 iframe 后，真实 WebView2 下 `DownloadStarting` 的触发、30s 移除 iframe 对超大下载的影响，以及站点的 `X-Frame-Options` 限制需手工验收（设计稿 §11.3）。
- `download_change_default_path` 的 `downloads_active` 阻止错误经 Tauri 命令以带前缀的消息抛出，前端按 `includes` 映射专用文案而非严格相等。
- 排障与逐轮审查见 [progress-2026-11-27-080441.md](../root-cause-to-close/2026-11/progress-2026-11-27-080441.md)；普通站点 `window.open` 下载的后续根因与真机验证见 [progress-2026-11-27-231334.md](../root-cause-to-close/2026-11/progress-2026-11-27-231334.md)。
