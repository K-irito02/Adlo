# Task 5 简报 — 前端 save-only 三步走 + 移除前端 6s 计时

> 本简报是唯一需求来源。请严格按此实现，不要读整个计划文件。
> **子 Agent 隔离**：你只实现本 Task。Task 1-4（后端静默抓取命令 `browser_page_meta_get_silent`、开关 `SILENT_FETCH_ENABLED`、`CachedMetaBridge`）已交付并通过评审，后端命令已注册（见 `src-tauri/src/main.rs:139`）。本 Task 只动前端。

## 目标与上下文

把前端新建书签"无自定义标题"时的标题/favicon 获取从"前端 6s Promise.race 超时 + 后端爬虫"改为对齐 Chrome/Edge 的三步走：**缓存命中 → 直接使用；未命中 → 调用后端静默 WebView 渲染命令 `browser_page_meta_get_silent`（超时由后端静默 tab 自兜底 ≤6s）**。移除非必要的前端 `META_FETCH_TIMEOUT_MS` 计时。

## 已由主 Agent 解决的关键设计决策（必须遵守）

1. **新增 `pageMetaClient.getSilent(url)`**：`PageMetaClient` 接口 + 三端对齐：
   - Tauri adapter：调用 `browser_page_meta_get_silent`，返回 `PageMeta | null`（`r.ok && r.data ? r.data : null`，与 `get` 一致）。
   - Preview adapter：**回退到 `get(url)`**（预览模式无静默 tab，`requestPreviewApi` 无 silent 端点；行为上调用现有 `/browser/page-meta/get`）。
   - Mock（`createMockPageMetaClient` in `frontend/src/mock-bridge.ts`）：回退到内存版 `get`。
2. **移除前端计时**：删除 `useBrowserDialogs.ts` 顶部的 `META_FETCH_TIMEOUT_MS` 常量（仅此处使用）与 `Promise.race([... setTimeout ...])` 包装。超时交给后端静默命令内部（`SILENT_FETCH_TIMEOUT_MS=6000`），不再前端抢超时。
3. **三步走逻辑保持不变**：外层 `peek` 缓存命中优先分支**原样保留**；仅把未命中分支的 `Promise.race(pageMetaClient.get(url), timeout)` 换成 `await pageMetaClient.getSilent(url)`，其余 `titleOk` 判定 / `hostnameFromUrl` 兜底 / `console.info('[bookmark-new-meta] ...')` 调试日志全部保留。
4. **保留调试日志**：`[bookmark-new-meta] start / cache hit / silent fetched / fallback hostname / fetch failed` 这些日志必须保留（用户验收依赖日志）。
5. **不改后端**：不碰 `src-tauri/`、`crates/`、预览后端 `previewWorkspaceService`；不新增预览 silent 端点（回退 get 即可）。

## 涉及文件

- Modify: `frontend/src/app/utils/pageMetaClient.ts`（接口 + Tauri adapter + Preview adapter）
- Modify: `frontend/src/app/features/browser/useBrowserDialogs.ts`（未命中分支换 `getSilent` + 移除计时）
- Modify: `frontend/src/mock-bridge.ts`（`createMockPageMetaClient` 补 `getSilent`，满足接口）
- Modify: `frontend/src/app/features/browser/__tests__/useBrowserDialogs.test.ts`（mock 补 `getSilent`，把依赖 `get` 的无标题用例改到 `getSilent`）
- 若 `frontend/src/shared/ipc/browser.ts` 无 client 接口定义则**不改**（`PageMetaClient` 只定义在 `pageMetaClient.ts`）；确认后决定。

## 消费的接口（Task 3/4 已交付，读源码确认）

- 后端命令 `#[tauri::command] async fn browser_page_meta_get_silent(app, state, url) -> Result<IpcResult<PageMeta>, CommandError>`（已注册）。
- 既有 `pageMetaClient.get / peek / report / refresh / warmup / subscribeUpdated`。
- 既有展示层工具 `isUnsafeTitle / isPlaceholderTitle / hostnameFromUrl`（从 `@utils/browserDisplayUtils` import，已在文件顶部）。

## 实现要求

### 1. `pageMetaClient.ts` 增加 `getSilent`

```typescript
export interface PageMetaClient {
  peek(url: string): SiteMetaCacheEntry | undefined;
  get(url: string, opts?: { force?: boolean }): Promise<PageMeta | null>;
  getSilent(url: string): Promise<PageMeta | null>;          // 新增
  report(meta: PageMeta, source: MetaSource): Promise<void>;
  refresh(url: string): Promise<PageMeta | null>;
  warmup(urls: string[]): Promise<void>;
  subscribeUpdated(listener: (p: PageMetaUpdatedPayload) => void): () => void;
}
```

- Tauri 分支（`isTauriShell() ? {...} : {...}` 的 **真分支**）新增：

```typescript
getSilent: async (url) => {
  const r = await invokeIpc<PageMeta>('browser_page_meta_get_silent', { url });
  return r.ok && r.data ? r.data : null;
},
```

- Preview 分支（**假分支**）新增（回退 get，不新增预览端点）：

```typescript
getSilent: (url) => get(url),
```

> 注意：假分支对象里已存在 `get`，直接 `getSilent: (url) => get(url)`（闭包引用同对象内 `get`，别写成未定义变量）。

### 2. `useBrowserDialogs.ts` 改未命中分支 + 移除计时

删除文件顶部 `META_FETCH_TIMEOUT_MS` 常量（L15）。把 L99-124 的 `try` 块改写为：

```typescript
} else {
  try {
    // 移除 META_FETCH_TIMEOUT_MS：超时由后端静默 tab 自兜底（≤6s）
    const meta = await pageMetaClient.getSilent(url);
    const metaTitle = meta?.title?.trim() ?? '';
    const titleOk =
      Boolean(metaTitle) &&
      !isUnsafeTitle(metaTitle) &&
      !isPlaceholderTitle(metaTitle, url);
    console.info('[bookmark-new-meta] silent fetched', {
      url,
      metaTitle,
      titleOk,
      hasFavicon: Boolean(meta?.faviconDataUri),
      elapsedMs: Date.now() - requestStart,
    });
    if (titleOk && metaTitle) {
      title = metaTitle;
    }
  } catch (err) {
    console.warn('[bookmark-new-meta] silent fetch failed', { url, err: String(err) });
  }
  if (!title) {
    title = hostnameFromUrl(url) || url;
    console.info('[bookmark-new-meta] fallback hostname', { url, title });
  }
}
```

> 变更前后的语义核对：
> - 旧 `if (titleOk && (metaTitle || meta?.faviconDataUri)) title = metaTitle;` → 新 `if (titleOk && metaTitle) title = metaTitle;`。因为无标题时 `metaTitle` 为空字符串则 `titleOk=false`，二者等价；保留简洁形式即可。
> - 缓存命中分支（L93-98）**原样保留**。
> - `setIsCreatingTab(true/false)` 包裹与 `console.info('[bookmark-new-meta] start', { url })` 保留。

### 3. `mock-bridge.ts` 补 `getSilent`

在 `createMockPageMetaClient` 返回对象中新增（复用其内部 `get`）：

```typescript
getSilent: (url) => get(url),
```

> 该函数返回 `PageMetaClient`，缺 `getSilent` 会编译失败，必须补。

### 4. `useBrowserDialogs.test.ts` 更新

- 顶部 mock 由 `{ get: vi.fn() }` 改为同时含 `getSilent`：

```typescript
vi.mock('@utils/pageMetaClient', () => ({
  pageMetaClient: { get: vi.fn(), getSilent: vi.fn() },
}));
```

- 把**无自定义标题**（`handleCreateTabConfirm('', url, ...)`）用例中依赖 `pageMetaClient.get` 的改到 `getSilent`：
  - `vi.mocked(pageMetaClient.get).mockResolvedValue` → `vi.mocked(pageMetaClient.getSilent).mockResolvedValue`（对应的空标题用例：failed-fetch null、adopt title、empty-datauri、favicon-q、datauri-only、title-preserve）。
  - 每个 `beforeEach` 里 `vi.mocked(pageMetaClient.get).mockReset()` 改为同时对 `getSilent` `mockReset()`。
- **新增断言**（保持现有风格）：无标题 + 缓存命中真实标题 → 不调用 `getSilent` 直接采用缓存；未命中 → 调用 `getSilent`；`getSilent` 返回 null → 用宿主名占位标题保存。
- 有自定义标题（`handleCreateTabConfirm('Name' | 'Title', ...)`）的用例**不得**调用 `getSilent`/`get`（可加 `expect(pageMetaClient.getSilent).not.toHaveBeenCalled()` 可选）。不要改这些用例的保存行为断言。

### 5. `shared/ipc/browser.ts`

`PageMetaClient` 接口不在该文件（在 `pageMetaClient.ts`）。确认 `browser.ts` 无 client 接口后**不改**。若检索发现另有 client 接口定义，同步补 `getSilent`。

## 测试

- 必须通过：
  - `$env:Path = "C:\Program Files\nodejs;$env:Path"`；`$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"`（如需）
  - `pnpm --dir frontend run typecheck`
  - `pnpm --dir frontend run test`（重点：`useBrowserDialogs.test.ts`）
  - `pnpm --dir frontend run lint:fix`（处理后重新 typecheck）
- 若出现与三月销毁无关的既有 flaky（如 preview 服务）属环境问题，记录即可。

## 全局约束

- 展示层启发式（`isUnsafeTitle`/`isPlaceholderTitle`/缓存判定）不得改动。
- 保留全部 `[bookmark-new-meta]` 调试日志。
- 不新增依赖；不改后端；不新增预览 silent 端点；不改非相关逻辑。
- 变更后按 `.trae/rules/mandatory-testing.md` 触发结束验收（前端 L3 级：lint + format + typecheck + 全部 vitest）。

## 提交

```
git add frontend/src/app/utils/pageMetaClient.ts frontend/src/app/features/browser/useBrowserDialogs.ts frontend/src/mock-bridge.ts "frontend/src/app/features/browser/__tests__/useBrowserDialogs.test.ts"
git commit -m "feat(frontend): cache→tab→silent three-step bookmark meta, drop 6s timer"
```

## 报告契约

将完整报告写入本简报同目录 `task-5-report.md`：改动文件、`getSilent` 三端实现对照、`useBrowserDialogs` 分支改写前后对比、`META_FETCH_TIMEOUT_MS` 移除位置、mock-bridge 与测试更新、验证命令输出、commit hash、未决疑虑。返回消息只需给：状态（DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED）、commit hash、一句话测试摘要、疑虑（如有）。