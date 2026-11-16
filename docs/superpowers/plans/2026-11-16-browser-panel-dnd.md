# 浏览器面板拖拽 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让右侧浏览器面板的书签树与已打开标签列表支持按方案 D 拖拽移动/排序，并让书签目录与活标签彻底解耦。

**Architecture:** 新增「容器 → 子项 key 顺序表」持久化状态与纯函数 mutation 模型；树构建按顺序表生成混排 children；DnD 通过树容器事件委托 + fixed overlay 指示器实现，避免侵入虚拟化列表；标签页排序把面板顺序合并回全量 tabs 后复用 `browserReorderTabs`。

**Tech Stack:** React 19 + Zustand + TypeScript + Vitest + Pointer Events（Tauri `dragDropEnabled` 会吞掉 HTML5 DnD，故不用 HTML5 Drag & Drop）

**Spec:** `docs/superpowers/specs/2026-11-16-browser-panel-dnd-design.md`

## Global Constraints

- 不改 Rust / IPC / Tauri capability。
- **不关闭 `dragDropEnabled`**：内部拖拽必须用 Pointer Events；保留 Tauri 原生文件/文件夹拖入。
- 不新增 `BookmarkFolder` / `BookmarkEntry` 字段。
- 所有用户可见文案走 i18n（zh-CN + en-US 同步）。
- 双端（Tauri 桌面 / 浏览器预览）行为一致。
- 只改本功能需要的文件，不顺手重构无关代码。

---

### Task 1: 顺序表纯函数模型

**Files:**
- Create: `adlo/frontend/src/app/stores/slices/browserBookmarkOrder.ts`
- Create: `adlo/frontend/src/app/stores/slices/__tests__/browserBookmarkOrder.test.ts`

**Interfaces:**
- Produces: `CUSTOM_ROOT`, `folderContainerKey`, `workspaceContainerKey`, `folderItemKey`, `entryItemKey`, `resolveContainerChildren`, `applyBookmarkMove`, `BookmarkMove`, `BookmarkMoveError`, `BookmarkMoveState`.

- [ ] Step 1: 写失败测试：默认顺序（目录在前/书签在后）、顺序表混排、跨容器移动、new-root、非法后代、书签到 custom root。
- [ ] Step 2: `pnpm --dir adlo/frontend run test:one src/app/stores/slices/__tests__/browserBookmarkOrder.test.ts`，确认失败。
- [ ] Step 3: 实现纯函数，返回新的 folders/workspaceBookmarks/order，不读 store。
- [ ] Step 4: 重跑测试，确认通过。
- [ ] Step 5: Commit `feat(stores): add bookmark order model`。

### Task 2: Store 状态、action 与持久化

**Files:**
- Modify: `adlo/frontend/src/app/stores/slices/browserFoldersSlice.ts`
- Modify: `adlo/frontend/src/app/stores/persisted/registry.ts`
- Modify: `adlo/frontend/src/app/stores/slices/__tests__/browserPanelPersistence.test.ts`
- Modify: `adlo/frontend/src/app/stores/slices/__tests__/browserFoldersSlice.test.ts`（如存在）

**Interfaces:**
- Produces: `browserBookmarkChildOrder`, `browserMoveBookmarkNode`.
- Consumes: Task 1 的 `applyBookmarkMove`。

- [ ] Step 1: 写失败测试：初始 `{}`；action 成功后 folders/workspaceBookmarks/order 更新并写 localStorage；失败不改状态；新持久化键读取回退。
- [ ] Step 2: 跑测试确认失败。
- [ ] Step 3: 在 slice 中加字段与 action，调用纯函数，成功后 `persist` 三份状态；registry 加 `adl:browser.bookmarkChildOrder`（`readStringArrayRecord`, `global`）。
- [ ] Step 4: 重跑测试通过。
- [ ] Step 5: Commit `feat(stores): persist bookmark child order and moves`。

### Task 3: 树构建混排 + 移除活标签/音频耦合

**Files:**
- Modify: `adlo/frontend/src/app/features/browser-tree/useBrowserTreeData.ts`
- Modify: `adlo/frontend/src/app/features/browser-tree/useBrowserTreeCache.ts`
- Modify: `adlo/frontend/src/app/features/browser-tree/__tests__/browserTreeCounts.test.ts`（按实际测试文件调整）
- Modify: `adlo/frontend/src/app/features/browser-tree/BrowserTabTree.tsx`
- Modify: `adlo/frontend/src/app/features/browser/BrowserNavTabsMode.tsx`
- Modify: `adlo/frontend/src/app/features/browser/BrowserNavListMode.tsx`
- Modify: `adlo/frontend/src/app/features/browser/BrowserNavigator.tsx`
- Modify: `adlo/frontend/src/app/features/browser/useBrowserPanelState.ts` / `BrowserPanelStateContext.ts`（以实际选择器位置为准）

**Interfaces:**
- Consumes: `resolveContainerChildren`。
- Produces: `useBrowserTreeData` 新增 `browserBookmarkChildOrder` 入参；工作区树不再有 `tabNodes`；书签节点无 `isPlayingAudio`/`isAudioMuted`。

- [ ] Step 1: 写/改失败测试：工作区根节点 children 不含活标签；书签节点无音频；顺序表决定混排；无顺序表时目录在前。
- [ ] Step 2: 跑相关测试确认失败。
- [ ] Step 3: 改 buildFolderNode / buildWorkspaceCategoryTree / buildUserFolderCategoryTree；删除 tabNodes 与活标签查找；把 order 传入。
- [ ] Step 4: 重跑相关测试通过；更新调用链类型。
- [ ] Step 5: Commit `feat(browser): mix bookmark tree order and drop live tabs`。

### Task 4: 书签树 DnD（方案 D + overlay 指示器）

**Files:**
- Create: `adlo/frontend/src/app/features/browser-tree/useBrowserTreeDnd.ts`
- Create: `adlo/frontend/src/app/features/browser-tree/BrowserTreeDndOverlay.tsx`
- Modify: `adlo/frontend/src/app/features/browser-tree/BrowserTabTree.tsx`
- Modify: `adlo/frontend/src/app/features/browser-tree/BrowserCategorySection.tsx`
- Modify: `adlo/frontend/src/app/features/tree/MultiTreeEntryShell.tsx`（增加可选 `dataPath`）
- Modify: `adlo/frontend/src/app/features/browser-tree/BrowserTreeEntry.tsx`
- Modify: `adlo/frontend/src/app/styles/regions/rightpanel/browser-webview.css` / 新建 `browser-tree-dnd.css`
- Create: `adlo/frontend/src/app/features/browser-tree/__tests__/BrowserTreeDnd.test.tsx`

**Interfaces:**
- Consumes: `browserMoveBookmarkNode`, `resolveContainerChildren`, `BrowserCategoryState`。
- Produces: 树容器上的 `onDragStart/onDragOver/onDrop/onDragEnd` 与 fixed overlay。

- [ ] Step 1: 写失败测试：放入文件夹、插入到书签前/后、非法后代恢复、自建目录标题行新顶级、工作区标题行拒绝、折叠目录放入后保持折叠。
- [ ] Step 2: 跑测试确认失败。
- [ ] Step 3: 实现 `useBrowserTreeDnd`（事件委托 + 节点 map + 校验 + overlay 状态）与 `BrowserTreeDndOverlay`（插入线/放入高亮/幽灵行）。
- [ ] Step 4: 接线 `BrowserTabTree` / `BrowserCategorySection` / `MultiTreeEntryShell` `dataPath`；加 CSS。
- [ ] Step 5: 重跑测试通过。
- [ ] Step 6: Commit `feat(browser): drag and drop bookmark tree`。

### Task 5: 已打开标签页排序

**Files:**
- Create: `adlo/frontend/src/app/features/browser/useOpenTabReorder.ts`
- Modify: `adlo/frontend/src/app/features/browser/BrowserOpenTabFlatList.tsx`
- Modify: `adlo/frontend/src/app/features/browser/BrowserOpenTabFlatListItem.tsx`
- Modify: `adlo/frontend/src/app/features/browser/BrowserNavOpenMode.tsx`
- Modify: `adlo/frontend/src/app/features/browser/BrowserNavigator.tsx`
- Modify: `adlo/frontend/src/app/features/browser/useBrowserDragDrop.ts`（复用/删除旧实现，按实际调用点）
- Create: `adlo/frontend/src/app/features/browser/__tests__/BrowserOpenTabReorder.test.tsx`

**Interfaces:**
- Consumes: `browserReorderTabs`、全量 `browserTabs`。
- Produces: `useOpenTabReorder({ panelTabs, onReorder })`，返回 `dragOverIndex/handleDragStart/handleDragOver/handleDrop/handleDragEnd`。

- [ ] Step 1: 写失败测试：普通组重排、pinned 组内重排、pinned 边界、跨组拒绝、中心标签位置不变。
- [ ] Step 2: 跑测试确认失败。
- [ ] Step 3: 实现 hook 与行级 DnD；合并面板顺序回全量 tabs 后调用 `browserReorderTabs`。
- [ ] Step 4: 重跑测试通过。
- [ ] Step 5: Commit `feat(browser): reorder open tabs by drag`。

### Task 6: i18n 与样式收口

**Files:**
- Modify: `adlo/frontend/src/app/i18n/zh-CN/browser.ts`
- Modify: `adlo/frontend/src/app/i18n/en-US/browser.ts`
- Modify: `adlo/frontend/src/app/features/browser-tree/*`（toast/aria 文案）
- Modify: `adlo/frontend/src/styles/regions/rightpanel/browser-tree-entry.css` 或新建 `browser-tree-dnd.css`

- [ ] Step 1: 加 DnD toast/aria/pinned 分组文案（中英同步）。
- [ ] Step 2: 加插入线/幽灵行/放入高亮/禁止态样式，全部消费 CSS token。
- [ ] Step 3: `pnpm --dir adlo/frontend run check:i18n`。
- [ ] Step 4: Commit `feat(browser): add drag drop copy and styles`。

### Task 7: 门禁与文档

**Files:**
- Modify: `docs/root-cause-to-close/2026-11/progress-2026-11-16-105349.md`
- Modify: `docs/superpowers/specs/2026-11-16-browser-panel-dnd-design.md`（如实现有偏离）
- Modify: `GLOSSARY.md`（如新增术语）

- [ ] Step 1: `pnpm --dir adlo/frontend run check:changed`（不带 `--skip-tests`）。
- [ ] Step 2: 修复失败项；必要时跑受影响测试。
- [ ] Step 3: 更新进度文件（实现、验证、待用户确认）。
- [ ] Step 4: Commit `feat(browser): bookmark and tab drag reorder`。

---

## Self-Review

- 规格第 4.1 矩阵 → Task 1/3/4；4.2 顺序 → Task 1/2/3；4.3 交互 → Task 4；4.4 标签 → Task 5；第 5 数据模型 → Task 1/2/3；第 6 i18n → Task 6；第 7 测试 → 各任务 + Task 7。
- 无 TBD / TODO；所有接口名与规格一致。
- 生产不实现悬停自动展开，原型开关仅评估用（与规格 Non-goals 一致）。
