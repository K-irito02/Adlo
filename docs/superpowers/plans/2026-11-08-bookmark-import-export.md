# 书签导入 / 导出 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在浏览器「更多操作」菜单新增「导入书签 / 导出书签」，与 Edge / Chrome / Firefox / Safari 的 Netscape 书签文件双向互通；同时把「书签条目 id」从「标签页 id」里拆出来，修复由此引起的三个静默失效动作，并把「保存文本到文件」从剪贴板域提升为通用能力。

**Architecture:** 书签成为独立实体（自带 `id` / `addedAt` / `lastModifiedAt`），树节点区分「活标签页的 `tabId`」与「书签条目的 `bookmarkId`」；导入导出的编解码是**纯函数**（DOMParser + 手写序列化），IO 只在两端边界发生（读文件用 `<input type="file">`，写文件走通用保存命令 / 浏览器原生下载）。

**Tech Stack:** Rust（Tauri 2、`tauri-plugin-dialog`、`base64`）、TypeScript（React 19、Zustand、vitest、DOMParser/jsdom）。

**Spec:** 本文件（需求已在 grilling 对话中逐条确认；决策记录见 ADR `0017-bookmark-transfer-and-identity.md`）。

## Global Constraints

- 工作区：所有源码在 `adlo/`；文档写入**仓库根** `docs/`、`GLOSSARY.md`。
- 功能必须 **Tauri 桌面模式与浏览器模式行为一致**；新增 IPC 必须同步实现 `tauri-bridge/` / `preview-bridge/` / `mock/`，并补 parity 测试。
- 任何 UI 展示文本禁止硬编码，必须走 i18n key（`zh-CN` 与 `en-US` 同名同段落）。
- 未发布阶段**禁止**兼容层与数据迁移；旧书签数据**直接丢弃**（`localStorage` key 改名后旧值不再读取）。
- 禁止蓝色（`var(--accent)`）用作提示/警醒色。
- 测试分级执行：只跑受影响部分。
- Commit 遵循 Conventional Commit。

## 已确认的设计决策

| # | 决策 |
| --- | --- |
| 1 | 格式只做 Netscape bookmarks HTML，不做 JSON |
| 2 | 导出范围 = **复选框树**（两个分类根：工作区目录 / 自建目录），祖先半选显示小圆点（复用 `adl-search-ignore__check` 同一套样式与语义） |
| 3 | 导出对话框 = **双栏**（左树勾选 / 右"将导出"清单），两栏共用一个外框、中间一条**可拖拽分隔线**（180–480px，默认 240px，**不持久化**） |
| 4 | 只导出已收藏条目；过滤 `about:blank` / 空 URL / 非 http(s)；**不导出空目录**；单独勾选书签时**保留完整祖先目录链** |
| 5 | HTML 写全三个属性：`ADD_DATE`、`LAST_MODIFIED`、`ICON`（data URI） |
| 6 | 图标**不落书签**；导出时按 URL 从站点元数据缓存的 `faviconDataUri` 实时取，取不到就不写 |
| 7 | 导入 = **两步向导**：①选择内容（树勾选，默认全选）②目标与重复项；统计只在①底部显示，②底部显示"将导入 X 书签 · Y 目录" |
| 8 | 导入目标可选：新建文件夹（默认）/ 任一工作区目录 / 任一自建目录（含嵌套子目录） |
| 9 | 判重 = `(url, title)`，**只在目标节点内**比较；选项「跳过重复项（默认）/ 允许重复」互斥 |
| 10 | 导入保留文件内的 `ADD_DATE` / `LAST_MODIFIED` / `ICON` 原值 |
| 11 | 不做「撤销导入」；导入成功 / 导出成功 / 导出失败 **都要 toast**；保存对话框被取消不提示 |
| 12 | 边界：文件 > 10 MB 拒绝；只按 UTF-8 解码；解析失败或 0 条有效 → 报错且不写入 |
| 13 | 菜单位置：更多操作卡片最底部，独立分组；`!` 说明卡沿用现有 mini-markdown（`# ` 标题 + `· ` 分点） |
| 14 | hover 提示用**原生 `title`**，内容为完整路径 |
| 15 | 命名全量重命名（含 `localStorage` key）；术语统一，拆两个提交 |
| 16 | 时间戳落**每条书签条目**；`LAST_MODIFIED` 只在编辑标题/URL 时更新 |
| 17 | 「保存文本到文件」提升为通用能力，剪贴板改为其调用方 |
| 18 | 修复三个动作：`在当前标签打开`、`显示在中心`、`全部在新标签打开` |

---

## File Structure

### Phase 0 — 身份拆分与改名（无行为变化）

| 文件 | 职责 | 动作 |
| --- | --- | --- |
| `adlo/frontend/src/app/stores/slices/browserTypes.ts` | `BookmarkEntry` / `BookmarkFolder` 类型 | 改 |
| `adlo/frontend/src/app/stores/slices/browserBookmarkSlice.ts` | 收藏/取消/编辑/删除 | 改 |
| `adlo/frontend/src/app/stores/slices/browserFoldersSlice.ts` | 文件夹 CRUD（`tabs` → `entries`） | 改 |
| `adlo/frontend/src/app/stores/slices/browserFoldersDeletion.ts` | 删除级联 | 改 |
| `adlo/frontend/src/app/stores/slices/browserFoldersUtils.ts` | 路径标签 | 改 |
| `adlo/frontend/src/app/stores/slices/browserTabsSlice.ts` | 打开标签时补书签映射 | 改 |
| `adlo/frontend/src/app/stores/persisted/registry.ts` | 持久化登记 + 校验器 | 改 |
| `adlo/frontend/src/app/stores/persisted/composite.ts` | `buildBrowserTabUrlMap` | 改 |
| `adlo/frontend/src/app/stores/StoreState.ts` / `slices.ts` | 汇总类型 | 改 |
| `adlo/frontend/src/app/features/browser-tree/**` | 树构建、节点类型、标题映射 | 改 |
| `adlo/frontend/src/app/features/browser/**`（Navigator / Nav*Mode / use*Actions） | 透传与动作 | 改 |

### Phase 1 — 动作修复

| 文件 | 动作 |
| --- | --- |
| `features/browser/useBrowserTagActions.ts` | `handleOpenTabInCurrentTab(url)` 收 URL |
| `features/browser/useBrowserFolderCrud.ts` | `handleOpenAllInNewTabs` 读 `entry.url` |
| `features/browser-tree/browserEntrySubEntriesUtils.tsx` | 菜单项改传 `url` |
| `features/browser-tree/BrowserTreeEntryMenu.tsx` | 「显示在中心」依赖 `tabId` 仅在活标签页存在 |

### Phase 2 — 通用保存文件能力

| 文件 | 动作 |
| --- | --- |
| `adlo/src-tauri/src/commands/file_save.rs` | 新增：对话框 + 写盘（从 `clipboard.rs` 抽出） |
| `adlo/src-tauri/src/commands/clipboard.rs` | 删除 `clipboard_save_to_file` |
| `adlo/src-tauri/src/main.rs` / `permissions/digital-life.toml` | 命令注册与白名单 |
| `adlo/frontend/src/shared/ipc/fileSave.ts` | 新增契约 |
| `adlo/frontend/src/tauri-bridge/tauri-file-save.ts` | Tauri 实现 |
| `adlo/frontend/src/preview-bridge/preview-file-save.ts` | 预览实现（dev 服务路由 `/file/save`） |
| `adlo/frontend/src/mock/mock-file-save.ts` | Mock 实现 |
| `adlo/frontend/src/httpBridge.ts` | HTTP 基线 |
| `adlo/frontend/dev/previewWorkspaceService/index.ts` | 路由改名 |
| `features/clipboard-history/ClipboardItemViewer.tsx` | 改用 `fileSave` |

### Phase 3 — 编解码纯函数

| 文件 | 动作 |
| --- | --- |
| `adlo/frontend/src/app/features/bookmarks/bookmarkHtml.ts` | 新增：解析 + 序列化 |
| `adlo/frontend/src/app/features/bookmarks/bookmarkHtml.test.ts` | 新增测试 |
| `adlo/frontend/src/app/features/bookmarks/bookmarkTransferTypes.ts` | 新增：中间树结构 |

### Phase 4 — store 批量写入

| 文件 | 动作 |
| --- | --- |
| `adlo/frontend/src/app/stores/slices/bookmarkTransferSlice.ts` | 新增：`browserImportBookmarks` |
| `adlo/frontend/src/app/features/bookmarks/collectExportTree.ts` | 新增：把勾选结果摊平成导出树 |

### Phase 5 — UI

| 文件 | 动作 |
| --- | --- |
| `features/browser/useBrowserPanelMenuItems.ts` | 菜单加两项 |
| `features/browser/BrowserMenuDropdown.tsx` | 加两个图标 |
| `features/bookmarks/ExportBookmarksDialog.tsx` + css | 新增 |
| `features/bookmarks/ImportBookmarksDialog.tsx` + css | 新增 |
| `features/bookmarks/useBookmarkTransfer.ts` | 新增：读文件 / 调编解码 / toast |
| `app/hooks/useNavigatorResize.ts` | 参数化（容器 ref + 两栏） |
| `i18n/{zh-CN,en-US}/browser.ts` | 文案 |

### Phase 6 — 文档

| 文件 | 动作 |
| --- | --- |
| `docs/adr/0017-bookmark-transfer-and-identity.md` | 新增 |
| `GLOSSARY.md` | 术语 |
| `CONTEXT.md` | 落点更新 |

---

## Task 1: 书签独立身份（数据结构 + 持久化）

**Interfaces:**

```ts
// browserTypes.ts
export interface BookmarkEntry {
  id: string;            // 原 tabId → 书签自身 id，createUiId('bookmark')
  url: string;
  title: string;
  addedAt: number;       // 毫秒时间戳
  lastModifiedAt: number;
}

export interface BookmarkFolder {
  id: string;
  name: string;
  createdAt: number;
  isUserCreated: boolean;
  parentId?: string;
  parentType?: 'workspace' | 'folder';
  entries: BookmarkEntry[];   // 原 tabs
}
```

- `browserTabFolders` → `browserBookmarkFolders`（key `adl:browser.tabFolders` → `adl:browser.bookmarkFolders`）
- `browserWorkspaceBookmarks: Record<string, BookmarkEntry[]>`
- `browserBookmarkTabIdUrlMap` → `browserTabBookmarkUrls: Record<tabId, url>`（key `adl:browser.tabIdUrlMap` → `adl:browser.tabBookmarkUrls`）
- `browserBookmarks`（全局 `(url,title)` 去重索引）保留不变，只作为"该链接是否已收藏"的索引，不承载时间戳

- [ ] **Step 1:** 改类型与校验器（`isBookmarkEntry` 校验 `id/url/title/addedAt/lastModifiedAt`）
- [ ] **Step 2:** 全部写入点用 `Date.now()` 填 `addedAt`；`browserUpdateSavedBookmark` 只更新 `lastModifiedAt`
- [ ] **Step 3:** `rg -l 'tabFolders|BookmarkTabItem|WorkspaceBookmarkEntry|tabIdUrlMap'` 清零后 `pnpm --dir frontend run typecheck`
- [ ] **Step 4:** 更新 `browserBookmarkSlice.test.ts` / `browserFoldersSlice` 相关测试

## Task 2: 树节点区分 tabId / bookmarkId

```ts
interface BrowserTreeNode {
  tabId?: string;       // 仅当背后有活标签页
  bookmarkId?: string;  // 书签条目
  url: string;
  nodeType: 'tab' | 'bookmark' | 'history' | 'directory' | 'workspace';
}
```

- `useBrowserTreeData.ts` 的 folder / workspace 分支：书签条目写 `bookmarkId`，不写 `tabId`；活标签页写 `tabId`
- path 拼装里 `bookmark:<bookmarkId>:<url>`（保持稳定）
- [ ] 验证：点书签条目仍能打开；`browserTreeTitle` 不变

## Task 3: 三个动作修复

- [ ] `handleOpenTabInCurrentTab(url: string)`：活动标签页存在则导航到该 URL（`navigateTabExplicit` 优先）
- [ ] `handleOpenAllInNewTabs`：folder 分支 `folder.entries.forEach(e => browserOpenTab(e.url, e.title))`；workspace 分支同时打开 `browserWorkspaceBookmarks[wsId]` 的条目
- [ ] 「显示在中心」：`tabId` 只对活标签页存在，书签自动落到既有 `openUrlInCenter(url, name)` 分支
- [ ] 测试：三个动作对"无活标签页的书签条目"都产生可见效果

## Task 4: 通用保存文件

```rust
// commands/file_save.rs
#[tauri::command]
pub async fn app_save_file(app: tauri::AppHandle, payload: SaveFilePayload) -> IpcResult<Option<String>>
// SaveFilePayload { suggested_name: String, data_base64: String }
```

- [ ] Rust：抽 helper `write_with_save_dialog(app, name, bytes) -> Option<PathBuf>`
- [ ] 注册命令 + `permissions/digital-life.toml` 白名单（`main.rs` 的机器校验必须通过）
- [ ] 四端桥接同名同形状；`shared/ipc/__tests__/file-save-parity.test.ts`
- [ ] 剪贴板查看器改调新命令；删除 `clipboard_save_to_file`

## Task 5: 编解码

```ts
export interface TransferFolder { name: string; children: TransferNode[] }
export type TransferNode = { kind: 'folder'; folder: TransferFolder } | { kind: 'bookmark'; url: string; title: string; addedAt: number; lastModifiedAt: number; icon?: string };

parseBookmarkHtml(html: string): { rootName: string; nodes: TransferNode[]; invalidCount: number }
serializeBookmarkHtml(rootName: string, nodes: TransferNode[], icons: Map<string, string>): string
```

- [ ] 解析：`DOMParser('text/html')`，只认 `DL > DT > (H3 | A)`；`<DT>` 无闭合标签由 HTML 解析器隐式处理
- [ ] 过滤非 http(s) 并计数；`ADD_DATE`/`LAST_MODIFIED`（秒）→ 毫秒；缺失回退 `addedAt`/`lastModifiedAt`
- [ ] 序列化：`<!DOCTYPE NETSCAPE-Bookmark-file-1>` + `<META ... charset=UTF-8>` + `<TITLE>` + `<H1>`；空目录跳过；属性值 HTML 转义
- [ ] 图标：`icons.get(normalizedUrl)`，有则写 `ICON="data:..."`，无则省略
- [ ] 测试覆盖：嵌套 3 层、空目录、`about:blank`、无 title、含 `&<>"` 的标题、属性缺失、往返一致

## Task 6: 导入写入（批量）

```ts
browserImportBookmarks(input: {
  nodes: TransferNode[];
  target: { kind: 'new-folder'; name: string } | { kind: 'folder'; id: string } | { kind: 'workspace'; id: string };
  duplicatePolicy: 'skip' | 'allow';
}): { importedBookmarks: number; importedFolders: number; skipped: number }
```

- [ ] 一次 `set` + 一次 `persist`；每条生成 `createUiId('bookmark')`
- [ ] 判重：目标节点内按 `(url,title)`；`allow` 时不查
- [ ] 嵌套目录逐层建 `BookmarkFolder`（`parentType` 依目标而定）
- [ ] 同步维护 `browserBookmarks` 索引与 `browserTabBookmarkUrls`（仅 folder 目标，与现有语义一致）
- [ ] 测试：目标为新建/文件夹/工作区三种；skip/allow；空目录不建

## Task 7: 导出对话框（变体 B + 分隔条）

- [ ] 左树：两个分类根、勾选框、半选圆点、展开/折叠/全选/清空
- [ ] 右栏：解析式清单（整目录命中即停），单条可移除
- [ ] 分隔条：把 `useNavigatorResize` 参数化为 `useSplitResize({ containerRef, min, max })`；默认 240px，不持久化
- [ ] 行与清单项 `title` = 完整路径
- [ ] 取消 → 关闭；确认 → 系统保存对话框 → 成功/失败 toast

## Task 8: 导入对话框（两步向导）

- [ ] Step 1：文件条 + 树勾选（默认全选）+ 底部 `已选 X / Y 个书签`
- [ ] Step 2：`导入到` + `文件夹名`（默认 `书签_YYYY_M_D`，本地化）+ 重复项单选 + 底部 `将导入 X 个书签 · Y 个目录`
- [ ] 解析失败 / 0 条 / >10 MB：停在文件选择并提示，不进 Step 1

## Task 9: 菜单与说明卡

- [ ] 菜单底部新增 `导入书签` / `导出书签` + 分隔线 + `!` 提示标记
- [ ] 导出说明卡：范围、保留目录层级、过滤规则、跨浏览器往返
- [ ] 导入说明卡：Chrome/Edge 导出路径、Firefox 导出路径、Adlo 导入步骤、判重口径

## Task 10: 文档

- [ ] ADR `0017`：只做 HTML、书签身份与标签页解耦、判重口径、图标按 URL 取
- [ ] `GLOSSARY.md`：书签条目 / 书签文件夹 / 标签页书签映射
- [ ] `CONTEXT.md`：新增落点

---

## 提交拆分

1. `refactor(browser): decouple bookmark identity from tab identity`
2. `fix(browser): make tab actions work for saved bookmarks`
3. `refactor(ipc): generalize save-to-file command`
4. `feat(browser): add bookmark html codec`
5. `feat(browser): import and export bookmarks`
6. `docs: record bookmark transfer decisions`

## 验证

```powershell
cd adlo/frontend
pnpm run typecheck
pnpm run test -- bookmark browser
cd ../..
pnpm --dir adlo run cargo:check
```

全量门禁（`check:full` / `cargo test --workspace`）需用户批准后才跑。
