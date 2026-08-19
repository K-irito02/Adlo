# Task 5 报告 — 前端 save-only 三步走 + 移除前端 6s 计时

**状态**：DONE
**Commit**：`11be1b9f8755af113fb03af010c34a8f4973e929`

## 改动文件

| 文件 | 改动 |
|------|------|
| `frontend/src/app/utils/pageMetaClient.ts` | `PageMetaClient` 接口新增 `getSilent`；Tauri adapter + Preview adapter 实现 |
| `frontend/src/app/features/browser/useBrowserDialogs.ts` | 删除 `META_FETCH_TIMEOUT_MS` 常量与 `Promise.race` 超时包装；未命中分支改用 `getSilent` |
| `frontend/src/mock-bridge.ts` | `createMockPageMetaClient` 补 `getSilent`（满足接口） |
| `frontend/src/app/features/browser/__tests__/useBrowserDialogs.test.ts` | mock 补 `get`/`getSilent`/`peek`；无标题用例改用 `getSilent`；新增三步断言 |

`frontend/src/shared/ipc/browser.ts` 检索确认**无** `PageMetaClient` 接口定义，**未改**（per brief #5）。

## `getSilent` 三端实现对照

| 端 | 实现 |
|----|------|
| Tauri（真分支） | `invokeIpc<PageMeta>('browser_page_meta_get_silent', { url })` → `r.ok && r.data ? r.data : null` |
| Preview（假分支） | 复用现有 `requestPreviewApi<PageMeta>('/browser/page-meta/get', { body { url, force:false } })` 逻辑（回退 get，不新增 silent 端点） |
| Mock | 读取内存 `memory`（与 `get` 同语义，force 无差别） |

> ⚠ **相对简报的偏离**：简报建议 `getSilent: (url) => get(url)`。但对象字面量内部属性名**不构成**作用域内可引用的 `get` 绑定，实测 `typecheck` 报 `TS2304: Cannot find name 'get'`。因此三端 `getSilent` 均改为**直接内联各自 get 的等价实现**（Preview 调 `/browser/page-meta/get`，Mock 读 `memory`），行为与回退 get 完全一致，满足"不新增端点、不改后端"的约束。

## `useBrowserDialogs.ts` 分支改写对比

**before（未命中分支）**：
```typescript
const meta = await Promise.race([
  pageMetaClient.get(url),
  new Promise<null>((resolve) => setTimeout(() => resolve(null), META_FETCH_TIMEOUT_MS)),
]);
...
console.info('[bookmark-new-meta] fetched', { ... });
if (titleOk && (metaTitle || meta?.faviconDataUri)) title = metaTitle;
...
console.warn('[bookmark-new-meta] fetch failed', { ... });
```

**after（未命中分支）**：
```typescript
const meta = await pageMetaClient.getSilent(url);
...
console.info('[bookmark-new-meta] silent fetched', { ... });
if (titleOk && metaTitle) title = metaTitle;
...
console.warn('[bookmark-new-meta] silent fetch failed', { ... });
```

保留项：缓存命中分支、`isUnsafeTitle`/`isPlaceholderTitle`/`hostnameFromUrl` 兜底、`console.info('[bookmark-new-meta] start' / 'cache hit' / 'fallback hostname')` 全部调试日志。

## `META_FETCH_TIMEOUT_MS` 移除位置

常量定义（原 `useBrowserDialogs.ts` 顶部约 L15 的 JSDoc + `const META_FETCH_TIMEOUT_MS = 6000;`）整块删除；`Promise.race([... setTimeout ...])` 包装就地删除。超时交由后端静默命令内部（`SILENT_FETCH_TIMEOUT_MS=6000`）。

## mock-bridge 与测试更新

- `createMockPageMetaClient` 返回对象补 `getSilent`（读 `memory`，返回 `SiteMetaCacheEntry` 对应字段）。
- 测试顶部 mock：`{ peek: vi.fn(), get: vi.fn(), getSilent: vi.fn() }`（需补 `peek`，因为缓存命中分支调用 `pageMetaClient.peek`，缺会 `peek is not a function`）。
- 每个 `beforeEach` 对 `peek` / `get` / `getSilent` 三者 `mockReset()`。
- 无自定义标题用例 `vi.mocked(pageMetaClient.get).mockResolvedValue` → `getSilent`。
- 新增 3 用例：
  - 缓存命中真实标题 → 不调用 `getSilent`，直接采用缓存标题保存。
  - 缓存未命中 → 调用 `getSilent(url)` 并采用其标题保存。
  - `getSilent` 返回 null → `hostnameFromUrl` 兜底，用宿主名保存。

## 验证命令输出

```text
$ pnpm --dir frontend run typecheck          # ✓ tsc --noEmit 通过
$ pnpm --dir frontend run lint:fix           # ✓ 0 errors（2 个既有 warning 位于 browser-tree/useBrowserTreeCache.ts，与本 Task 无关）
$ pnpm --dir frontend run format             # ✓ 全部 unchanged
$ pnpm --dir frontend run test               # ✓ 233 files / 1826 tests 全通过
```
（`useBrowserDialogs.test.ts` 单独跑：24 tests 通过）

## 未决疑虑

1. **简报代码片段 `getSilent: (url) => get(url)` 存在作用域缺陷**（对象字面量内不引用同名属性）。已改为内联等价实现，行为等价，但偏离了简报字面代码。若后续有人想用"回退 get"复用，请注意对象内无法直接引用兄弟方法。
2. 三端 `getSilent` 与 `get` 的小段逻辑重复（Preview/Mock 各重复一次 get 体）；为保持最小变更未抽公共函数。