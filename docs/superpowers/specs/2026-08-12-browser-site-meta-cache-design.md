# 浏览器面板网站元数据持久化缓存设计（图标 + 标题）

**日期**：2026-08-12
**状态**：待审阅
**背景**：浏览器面板（工作区 / 非工作区书签 / 历史目录 / 已打开标签）中的标签与书签，重开应用后 Logo 图标出现延迟。根因：现有 `faviconUrlCache` 只缓存 favicon 的 **URL 字符串**，不缓存图片本体，重开后 `<img>` 仍需向远端重新下载图片；标题缓存（`metaCache`）为内存态、重启即丢。

## 目标

1. **零网络秒开**：重开应用后，已缓存条目的图标与标题完全从本地读取，不向任何远端服务端发起请求
2. **缓存图片本体**：favicon 图片字节以 base64 data-URI 持久化（渲染直接消费，不走网络）
3. **生命周期可预期**：
   - 缓存填充/刷新：仅在用户「点击打开标签/书签/历史项」或「地址栏导航」时触发，成功才写
   - 抓取失败：一律保留旧缓存，不删除、不回退
   - 彻底删除标签/书签/历史项：按引用计数清除对应缓存
4. **后端持久化（方案 C）**：Tauri 后端 JSON 文件 + 浏览器 preview 服务文件 + 前端内存层三层架构
5. **双端一致**：Tauri 桌面与浏览器模式行为完全一致

## 非目标（YAGNI）

- Service Worker 层 HTTP 缓存
- 缓存大小统计 UI / 手动清理按钮（控制台调用即可）
- 后台定期 / 启动时批量刷新缓存
- 标签切换触发刷新
- 与工作区绑定的缓存（缓存按 URL 全局共享）
- 旧 `adl-ui:browser-favicon-cache` localStorage 数据的迁移或兼容读取

## 架构

### 三层结构

```
渲染层（前端，零异步）
  BrowserFavicon → getFaviconUrl(url)
    → siteMetaCache.get(url) 命中 → data:image/... （零网络）
    → 未命中 → Google S2 回退 / 字母占位（不向目标站点发请求）
        ↓ 同步读 / 即时生效 + 防抖落盘
持久化层（SiteMetaCache 后端抽象）
  getAll() / upsert() / delete() / clear()
    ├─ Tauri:  invoke(Rust 命令) → data_dir/site-meta-cache.json
    ├─ 浏览器: fetch(preview 服务 HTTP 端点) → 工作区 .adl-cache/ 文件
    └─ Mock:   内存 Map（测试）
```

### 关键设计点

1. **启动一次批量预载**：应用启动调用一次 `siteMetaCache.init()`（`getAll`）填满内存 Map，之后渲染纯同步
2. **变更路径**：下载字节 → base64 → 更新内存（图标立即生效）→ 防抖异步写后端（不阻塞渲染）
3. **双端一致**：沿用现有 `isTauriShell()` 分流模式，新增 IPC 在三端各实现一次

## 数据模型

### 缓存条目（按规范化 URL 为 key）

```ts
interface SiteMetaCacheEntry {
  title: string;          // 标题
  faviconUrl: string;     // favicon 原始 URL（回退/刷新用）
  faviconDataUri: string; // favicon 图片本体 base64（渲染用它，零网络）
  fetchedAt: number;      // 成功抓取时间戳（ms）
}
```

### 内存层

```ts
const memoryCache = new Map<string, SiteMetaCacheEntry>();
```

与持久化层同源、同规模：启动时整体预载，无条数上限、无淘汰；条目移除仅由引用计数归零触发。

### Tauri 后端存储

- 文件：`data_dir/site-meta-cache.json`
- 格式：`Record<normalizedUrl, SiteMetaCacheEntry>`
- 防抖原子写入：合并变更后写入临时文件再 rename（避免损坏）
- **无条数上限**：条目仅随用户删除标签/书签/历史项（引用归零）而清除，天然绑定用户实际数据，不做 LRU 淘汰
  - 淘汰会误伤"用户仍保留书签"的条目，导致重开时重新抓取——违背零网络秒开目标

### 浏览器 preview 服务存储

- 目录：工作区根 `.adl-cache/`（与 `.adl-logs/` 调试日志同模式）
- 文件：`site-meta-cache.json`，格式与 Tauri 端一致
- 新增 HTTP 端点（`/__adl_preview_api__/browser/site-meta-cache`）：
  - `GET` → 返回全部条目
  - `PUT` → upsert 一批条目
  - `DELETE` → 删除指定 url 列表

### 键归一化

复用 `fetchPageMeta.ts` 现有 `normalizeUrlForCache`（去 hash + 去尾部斜杠），保持读取/写入 key 一致。

## API 设计

### `siteMetaCache.ts`（新模块）

```ts
// 启动时一次性预载（幂等，可多次调用；返回 Promise 供等待）
export async function initSiteMetaCache(): Promise<void>;

// 预载是否完成（渲染门控：完成前不显示回退图标）
export function isSiteMetaCacheReady(): boolean;

// 等待预载完成
export function whenSiteMetaCacheReady(): Promise<void>;

// 同步读取 — 渲染唯一入口
export function getCachedSiteMeta(url: string): SiteMetaCacheEntry | undefined;

// 同步读 favicon（data-URI 优先；无则返回 ''）
export function getCachedFavicon(url: string): string;

// 同步读标题
export function getCachedTitle(url: string): string;

// 写入 — 成功抓取后调用；立即更新内存 + 防抖落盘
export function setCachedSiteMeta(url: string, entry: SiteMetaCacheEntry): void;

// 删除 — 引用计数确认后调用；立即删内存 + 排程落盘
export function removeCachedSiteMeta(url: string): void;

// 订阅 — 异步拿到数据后树节点自动重渲染（沿用现有订阅模式）
export function subscribeSiteMeta(url: string, callback: () => void): () => void;
export function subscribeSiteMetaGlobal(callback: (url: string) => void): () => void;

// 调试
export function getSiteMetaCacheStats(): { size: number; persisted: boolean };
```

### 后端抽象

```ts
interface SiteMetaBackend {
  getAll(): Promise<Record<string, SiteMetaCacheEntry>>;
  upsert(entries: Record<string, SiteMetaCacheEntry>): Promise<void>;
  remove(urls: string[]): Promise<void>;
  clear(): Promise<void>;
}
```

- `tauriSiteMetaBackend`：`invoke('browser_site_meta_get_all' | 'browser_site_meta_upsert' | 'browser_site_meta_remove' | 'browser_site_meta_clear')`
- `previewSiteMetaBackend`：HTTP 端点封装
- `mockSiteMetaBackend`：内存 Map

### Rust 命令（`src-tauri/src/commands/browser.rs`）

```rust
#[tauri::command] pub async fn browser_site_meta_get_all(state) -> Result<IpcResult<HashMap<String, SiteMetaCacheEntry>>>;
#[tauri::command] pub async fn browser_site_meta_upsert(state, entries: HashMap<String, SiteMetaCacheEntry>) -> Result<IpcResult<()>>;
#[tauri::command] pub async fn browser_site_meta_remove(state, urls: Vec<String>) -> Result<IpcResult<()>>;
#[tauri::command] pub async fn browser_site_meta_clear(state) -> Result<IpcResult<()>>;
```

所有命令在 `crates/browser` 内实现文件读写逻辑（`site_meta_cache.rs`），命令层仅转发。注册到 `capabilities/*.json`。

## 生命周期规则

| 场景 | 行为 |
|------|------|
| **应用启动** | `initSiteMetaCache()` 一次批量预载；**不主动刷新任何条目** |
| **点击打开标签/书签/历史项** | 触发抓取（`prefetchPageMeta`）→ **成功才写缓存**，失败保留旧缓存 |
| **地址栏导航** | 同上 |
| **切换标签** | 不触发刷新 |
| **手动「重新抓取图标和标题」** | `force` 强制刷新，成功才更新 |
| **彻底删除标签/书签/历史项** | store 层判定 URL 引用计数归零后调用 `removeCachedSiteMeta` |
| **抓取失败（超时/非 200/网络）** | 返回 null，缓存条目原样保留 |

### 抓取成功写入的判定

`prefetchPageMeta` / `fetchPageMeta` 成功且返回非空 `title` 或 `faviconDataUri` 时才写入。空结果不写。

### 抓取函数扩展（返回图片本体）

`PageMeta` 类型扩展 `faviconDataUri: string`：
- Tauri 端 `fetch_page_meta_inner`：解析出 favicon URL 后，用同一 `reqwest` client 下载 favicon 图片字节 → base64 data-URI；下载失败时 `faviconDataUri` 留空（标题仍可缓存，图标走回退）
- 浏览器 preview 服务 `/browser/page-meta`：同样在解析出 favicon URL 后 fetch 图片字节 → base64
- `frontend/src/shared/ipc/browser.ts` 的 `PageMeta` 接口同步扩展

## 错误处理边界

| 场景 | 处理 |
|------|------|
| 后端文件读写失败 | 静默失败 + console.warn，前端内存层仍可用（本次会话内缓存生效） |
| JSON 解析损坏 | 重建空缓存（丢弃损坏文件） |
| 启动预载失败 | `isSiteMetaCacheReady` 仍置为 true（门控放行），内存层为空 → 所有条目按未命中处理（回退图标），不阻塞渲染 |
| 抓取失败 | 返回 null，不改缓存 |
| 配额 / 写入超限 | 静默失败，不阻塞 |
| 防抖落盘期间再次写入 | 防抖合并，最后一次为准 |

## 性能优化

无上限缓存的核心风险是「规模增长后启动变慢、落盘变重」。对策遵循 **限尺寸不限条数、序列化仅发生在落盘、渲染热路径零解析** 三条原则。

### 1. 启动异步预载（不阻塞首屏，预载门控渲染）

- `initSiteMetaCache()` 在应用启动时异步调用，**不阻塞首次渲染**
- **预载门控**：`BrowserFavicon` 在 `isSiteMetaCacheReady()` 为 true 前，渲染固定尺寸空占位 span（尺寸与图标一致，避免布局跳动），**不显示任何回退图标**
- 预载完成后（本地文件读，通常 <50ms）：命中缓存 → 立即显示 data-URI；未命中 → 才走 Google S2 / 字母占位回退
- 语义：**图标要么不出现在屏幕上，一出现就是真实缓存图标**；回退图标只在"确定未命中"后才显示，杜绝"先回退后真实"的闪烁
- 预载为纯本地文件读取，不产生任何网络请求

### 2. 单条大小上限（限尺寸不限条数）

| 字段 | 上限 | 理由 |
|------|------|------|
| `faviconDataUri` | ≤ 64KB（约 256px PNG base64） | 超出则丢弃图片本体，仅缓存标题；图标走回退。防止单张大图撑爆内存 |
| `title` | ≤ 200 字符 | 防止异常页面返回超长标题 |
| 条目总数 | 无上限 | 仅随用户删除行为收缩 |

- 内存总量 ≈ 条目数 × 单条上限，天然有界；即便 1000 条也仅 ~10MB 级

### 3. 落盘效率（序列化仅在防抖触发时）

- 内存 Map 是**唯一真源**；每次 `set/remove` 只改内存，不立即序列化
- 防抖窗口（500ms）合并突发写入 → 一次 `getAll 结果替换 + 原子写`（临时文件 + rename）
- 落盘内容为当前内存全量快照，保证「最后一次为准」且文件永不半写损坏
- 启动预载时若内存已有部分条目，与后端结果合并（以后端为准，内存缺失才补）

### 4. 渲染热路径零解析

- `getCachedSiteMeta/getCachedFavicon/getCachedTitle` 为纯 `Map.get`（O(1)），不解析 URL
- URL 归一化（`normalizeUrlForCache`）仅在 `setCachedSiteMeta`/`removeCachedSiteMeta` 写路径执行一次，渲染读路径不做任何解析
- `getFaviconUrl` 的 data-URI 命中为纯字符串返回，无网络、无 IPC、无解析

### 5. 订阅扇出控制

- `subscribeSiteMeta` 单 URL 订阅：仅通知该 URL 对应节点
- `subscribeSiteMetaGlobal` 全局订阅：仅限初始化/批量刷新等少数场景使用，避免每图标一次全局通知

## 双端一致性

- Tauri 模式：Rust 后端 JSON 文件 + IPC
- 浏览器预览模式：preview 服务 HTTP 端点 + 工作区文件
- Mock 模式：内存 Map（测试）
- 三端同一 `SiteMetaBackend` 接口；前端渲染/订阅/生命周期逻辑完全共享

## 测试策略

### 单元测试

| 模块 | 用例 |
|------|------|
| `siteMetaCache`（内存层） | set/get/remove/clear；data-URI 优先；键归一化一致性；订阅触发重渲染；`isSiteMetaCacheReady` 门控语义 |
| `siteMetaCache`（防抖落盘） | 防抖合并；删除排程落盘；多次写入合并为一次 |
| `siteMetaCache`（性能） | 渲染读路径不做 URL 解析（O(1) 断言）；单条超限丢弃图片本体仅留标题；启动预载合并已存在内存条目 |
| Rust `site_meta_cache.rs` | JSON 文件 upsert/remove/clear/load；损坏文件重建；原子写（临时文件+rename） |
| 引用计数逻辑 | URL 仍被其他标签/书签引用时保留缓存；引用归零后删除 |

### 集成测试

| 用例 |
|------|
| 预载完成前图标区域为空占位（不显示回退图标） |
| 预载完成后命中缓存 → 直接显示 data-URI 图标（零网络断言） |
| 预载完成后未命中 → 显示回退图标 |
| 点击打开 → 成功写入 → 树节点自动更新图标 |
| 打开抓取失败 → 旧缓存保留 |
| 删除最后一个引用 → 缓存条目消失 |

## 文件变更清单

| 文件 | 操作 |
|------|------|
| `frontend/src/app/utils/siteMetaCache.ts` | 新增（内存层 + 后端抽象 + 订阅） |
| `frontend/src/app/utils/siteMetaCache.test.ts` | 新增 |
| `frontend/src/app/utils/siteMetaBackends/tauri.ts` | 新增 |
| `frontend/src/app/utils/siteMetaBackends/preview.ts` | 新增 |
| `frontend/src/app/utils/siteMetaBackends/mock.ts` | 新增 |
| `frontend/src/app/utils/fetchPageMeta.ts` | 重构（移除缓存状态，仅保留纯抓取逻辑） |
| `frontend/src/app/utils/favicon.ts` | 修改（`getFaviconUrl` 改走 `siteMetaCache` data-URI 优先） |
| `frontend/src/app/components/BrowserFavicon.tsx` | 修改（预载门控空占位 + 订阅切到 `subscribeSiteMeta`） |
| `frontend/src/app/features/browser/useBrowserPageMeta.ts` | 修改（写缓存改走 `setCachedSiteMeta`） |
| `frontend/src/app/features/browser/useBrowserTagActions.ts` | 修改（刷新/删除改用新 API） |
| `frontend/src/app/features/browser/useBrowserMenuActions.ts` | 修改 |
| `frontend/src/app/features/browser/useBrowserFolderCrud.ts` | 修改 |
| `frontend/src/app/features/browser/useBrowserBookmarkActions.ts` | 修改 |
| `frontend/src/app/features/browser/useBrowserDialogs.ts` | 修改 |
| `frontend/src/app/features/browser/useBrowserTabs.ts` | 修改 |
| `frontend/src/app/features/browser/useBrowserPanelHandlers.ts` | 修改 |
| `frontend/src/app/features/browser/useBrowserPanelAddressSubmit.ts` | 修改 |
| `frontend/src/app/features/browser/useBrowserUrlChange.ts` | 修改 |
| `frontend/src/app/features/browser/useBrowserPageMeta.ts` | 修改 |
| `frontend/src/app/stores/slices/browserBookmarkSlice.ts` | 修改（删除时引用计数判定后清除缓存） |
| `src-tauri/src/commands/browser.rs` | 修改（新增 4 个命令 + `fetch_page_meta_inner` 下载 favicon 字节） |
| `frontend/vite.config.ts` | 修改（`/browser/page-meta` 端点下载 favicon 字节） |
| `crates/browser/src/site_meta_cache.rs` | 新增 |
| `crates/browser/src/lib.rs` | 修改（导出模块） |
| `src-tauri/capabilities/*.json` | 修改（登记命令） |
| `frontend/dev/previewWorkspaceService/siteMetaCache.ts` | 新增（preview 服务端实现） |
| `frontend/dev/previewWorkspaceService/index.ts` | 修改（注册端点） |
| `frontend/src/shared/ipc/browser.ts` | 修改（`PageMeta` 增加 `faviconDataUri`） |
| `frontend/src/app/utils/__tests__/fetchPageMeta.test.ts` | 修改（适配移除缓存状态） |

## 性能影响

| 维度 | 评估 |
|------|------|
| 首次渲染（命中） | 纯同步 `Map.get` 返回 data-URI，零网络、零 IPC、零 URL 解析 |
| 启动预载 | 异步不阻塞首屏，纯本地读 <50ms；与渲染并行 |
| 内存占用 | 随缓存规模线性，单条 ≤ 64KB（上限内），天然有界 |
| 磁盘占用 | JSON 文件随缓存规模线性，无上限，仅随引用归零收缩 |
| 写入 | 防抖合并 + 序列化仅在落盘时发生，不阻塞渲染 |
| 未命中 | 仅 Google S2 回退（浏览器 HTTP 缓存），不向目标站点请求 |
