# Design: 浏览器"新建标签"→"新建书签"重构 + 悬停按钮原生 title 化

日期：2026-08-14
状态：已批准

## 目标

将浏览器目录树与新建对话框从"新建标签"语义重构为"新建书签"语义，并对目录/书签悬停按钮的 tooltip 方案做统一调整：

1. **文案改名**：`browserNewTab`→`browserNewBookmark`（新建书签）、`browserContextCreateTab`→`browserContextCreateBookmark`、`browserEditTab`→`browserEditBookmark`（编辑书签）、`browserTabName`→`browserBookmarkName`（书签名称），并同步改名 prop（`newTabLabel`→`newBookmarkLabel`）。
2. **工具栏 tabs 模式 "+"**：label 用 `browserNewBookmark`，tooltip 由原生 `title` 改为自定义 TooltipSimple（与"始终新建标签页"图标相同但功能不同，故自定义 tooltip）；open 模式 "+" 保持原生 `title` 不变。
3. **目录树**：悬停"+"按钮 label 用 `browserContextCreateBookmark`；右键菜单（顶级 + 嵌套的 folder/workspace 节点）新增"新建书签"项。
4. **对话框**：创建模式标题"新建书签"、编辑模式标题"编辑书签"；底部按钮改为左 `[保存并打开]`、右 `[仅保存]`，两模式均无"取消"按钮；`onConfirm` 增加 mode 参数。
5. **保存语义**："保存并打开"遵循"新建标签/当前标签"开关；"仅保存"不开标签（新增 store action）。
6. **悬停按钮原生 title 化（新增调整点 1）**：目录或书签悬停时，"更多操作"（`more`）与"刷新Logo/标题"（`refresh`）按钮由 TooltipSimple 改为系统原生 `title`。
7. **文案调整（新增调整点 2）**："刷新Logo/标题"按钮与右键菜单提示文字改为"刷新图标与标题"。

## 决策（已与用户确认）

| 决策点 | 结论 |
|--------|------|
| key 值改动范围 | 共享 key 值**全局改**，同步改名 key/prop |
| "保存并打开"在当前标签模式下的书签去向 | **存入目标目录**（工具栏/悬停按钮带入的目录），无论开关状态 |
| 对话框右侧按钮文案 | 创建与编辑两模式均用 **"仅保存"** |
| 编辑模式"保存并打开"语义 | **遵循开关**（保存编辑后，新建标签→开新标签 / 当前标签→导航当前标签） |
| 对话框底部按钮布局 | 左 `[保存并打开]`、右 `[仅保存]`，无"取消"（右上角 X + 点击遮罩仍可取消） |
| 目录右键菜单 | 仅新增 **"新建书签"** 一项（不加"保存并打开"项） |
| 工具栏 tabs "+" tooltip | 改 **TooltipSimple**（新建书签）；open "+" 保持原生 `title` |
| 悬停按钮 tooltip（新） | 目录/书签悬停的 `more`、`refresh` 按钮改原生 `title`；`create-tab`、`close` 保持 TooltipSimple |
| "刷新"文案（新） | 按钮与右键菜单提示改为"刷新图标与标题" |

## 改动点

### 1. i18n 改名与新增

| 现 key | 新 key | zh | en | 使用处 |
|--------|--------|----|----|--------|
| `browserNewTab` | `browserNewBookmark` | 新建书签 | New bookmark | 工具栏 tabs "+"、CreateTabDialog 创建标题 |
| `browserContextCreateTab` | `browserContextCreateBookmark` | 新建书签 | New bookmark | 目录悬停"+"按钮（顶级+嵌套） |
| `browserEditTab` | `browserEditBookmark` | 编辑书签 | Edit bookmark | CreateTabDialog 编辑标题 |
| `browserTabName` | `browserBookmarkName` | 书签名称 | Bookmark name | CreateTabDialog / BookmarkToFolderDialog 名称字段 |
| 新增 | `browserMenuNewTab` | 新建标签 | New tab | 工具栏"更多"菜单 `new-tab` 项（真·开标签，语义不同，保留"标签"措辞） |
| 新增 | `browserBookmarkSaveOnly` | 仅保存 | Save only | 两对话框右侧按钮 |
| 新增 | `browserBookmarkSaveAndOpen` | 保存并打开 | Save and open | 两对话框左侧按钮 |
| `browserRefreshMeta` | （值改） | 刷新图标与标题 | Refresh Icon & Title | 书签悬停 `refresh` 按钮 + 右键菜单项 |
| `browserRefreshMetaHint` | （值改） | 重新获取图标与标题，并清除旧缓存。若标签名称已自定义则保留自定义名称。 | Re-fetch icon and title, clearing old cache. If the tab name has been customized, the custom name is preserved. | 右键菜单提示文字 |

文件：`frontend/src/app/i18n/zh-CN/browser.ts`、`frontend/src/app/i18n/en-US/browser.ts`。

> 注意：`browserNewTabPage`、`browserNewTabBtn`、`browserNewTabFolder` 与"新建标签页/文件夹"相关 key 语义不同，**不改动**。

### 2. BrowserNavUtilityButtons.tsx（工具栏 "+" / "清空"）

- prop `newTabLabel` → `newBookmarkLabel`，调用处传 `t.browserNewBookmark`。
- tabs 模式 "+"：`plusLabel = newBookmarkLabel`，tooltip 用 **TooltipSimple**（`content={plusLabel}`），移除原生 `title`，保留 `aria-label`。
- open 模式 "+"：`plusLabel = alwaysNewTabLabel`（`browserNewTabAlways`），保持原生 `title` + `aria-label`。
- 清空按钮：保持原生 `title`（`browserClearAllOpenTabs`）不变。

### 3. BrowserNavigator.tsx 接线

- `:182` `newTabLabel={t.browserNewTab}` → `newBookmarkLabel={t.browserNewBookmark}`。
- 其余逻辑（tabs→`setCreateTabDialog`、open→`handleAlwaysNewTab`）不变。

### 4. 目录树悬停按钮与右键菜单

- `browserTreeEntryUtils.tsx`：
  - `getEntryHoverButtons`（顶级）：`create-tab` label → `t.browserContextCreateBookmark`。
  - `getEntryMoreMenuItems`（顶级，folder/workspace 节点）：新增
    `{ id: 'create-bookmark', label: t.browserContextCreateBookmark, action: () => callbacks.onCreateTab(wsId, fId) }`。
- `browserEntrySubEntriesUtils.tsx`：
  - `getChildNodeHoverButtons`（嵌套）：`create-tab` label → `t.browserContextCreateBookmark`。
  - `getChildNodeMoreMenuItems`（嵌套，folder 节点）：新增 `create-bookmark` 项 → `callbacks.onCreateTab(childWorkspaceId, folderId)`。
- `BrowserTreeEntry.tsx`：悬停按钮渲染处（`:157-171`）——`more` 按钮改原生 `title`（`title={btn.label}` + `aria-label`），其余按钮保持 TooltipSimple。
- `BrowserEntrySubEntries.tsx`：
  - 目录节点悬停按钮（`:176-203`）：`more` 改原生 `title`。
  - 书签/tab 叶子悬停按钮（`:133-164`）：`refresh`、`more` 改原生 `title`；`close` 保持 TooltipSimple。
  - 右键菜单：`create-bookmark` 项 action → `callbacks.onCreateTab(childNode.workspaceId, childNode.folderId)`。

### 5. CreateTabDialog.tsx（创建与编辑共用）

- `onConfirm` 签名：`(name: string, url: string, mode: 'save-only' | 'save-and-open') => void`。
- 底部按钮（`adl-prompt-modal__actions--fill`）：
  - 左：`[保存并打开]`（`t.browserBookmarkSaveAndOpen`，primary 样式）。
  - 右：`[仅保存]`（`t.browserBookmarkSaveOnly`，ghost 样式）。
  - 移除 `取消`（`t.browserCancel`）按钮；Enter 键触发 `save-and-open`；Esc / 点击遮罩 / 右上角 X 仍调用 `onCancel`。
- 标题：创建模式 `t.browserNewBookmark`，编辑模式 `t.browserEditBookmark`。
- 名称字段 label/placeholder → `t.browserBookmarkName`。

### 6. 保存语义（useBrowserDialogs.ts + 新增 store action）

- `handleCreateTabConfirm(name, url, mode)`：
  - `mode === 'save-and-open'`：
    - 开关=新建标签（`!browserNavigateInPlace`）：`browserOpenTab(url, title, folderId ? undefined : workspaceId, folderId || undefined)` + `bookmarkNewTab(workspaceId, folderId)`（现逻辑）。
    - 开关=当前标签（`browserNavigateInPlace`）：`browserNavigateActiveTab(url, title)` + `bookmarkNewTab(workspaceId, folderId)`（将当前标签 bookmark 进目标目录）。
  - `mode === 'save-only'`：调用新 store action `browserCreateBookmarkEntry({ url, title, workspaceId, folderId })`，不开标签。
  - 空名称时沿用现有 `prefetchPageMeta` 标题解析逻辑。
- `handleEditTabConfirm(name, url, mode)`：
  - `mode === 'save-only'`：`browserUpdateTab(tabId, { title, url })`（现逻辑）。
  - `mode === 'save-and-open'`：`browserUpdateTab` + 按开关打开（新建标签→`browserOpenTab(url, title)` / 当前标签→`browserNavigateActiveTab(url, title)`）。
- `useBrowserDialogs` 需新增依赖 `browserNavigateInPlace`（读 store）。
- `BrowserPanelDialogs.tsx`：`onConfirm` 透传 `handleCreateTabConfirm` / `handleEditTabConfirm`（签名已兼容 mode 参数）。

### 7. 新增 store action `browserCreateBookmarkEntry`

位置：`frontend/src/app/stores/slices/browserBookmarkSlice.ts`。

签名：`browserCreateBookmarkEntry(input: { url: string; title: string; workspaceId?: string; folderId?: string }) => void`

行为（不开标签）：
- 若 `browserBookmarks` 中无该 url，追加 `{ url, title }`（写入 `BROWSER_BOOKMARKS_KEY`）。
- 若 `folderId`：向该 folder 的 `tabs` 追加 `{ tabId: 合成id, url, title }`（`BookmarkTabItem`，用 `createUiId` 生成合成 tabId），写入 `BROWSER_TAB_FOLDERS_KEY`。
- 若 `workspaceId`：向 `browserWorkspaceBookmarks[workspaceId]` 追加 `{ tabId: 合成id, url, title }`，写入 `BROWSER_WORKSPACE_BOOKMARKS_KEY`。
- 若 `folderId` 时同步更新 `browserBookmarkTabIdUrlMap[合成id] = url`（`BROWSER_BOOKMARK_TABID_URL_MAP_KEY`）。

树渲染与点击打开已支持无活动标签的书签节点（`buildFolderNode` 的 `isSavedBookmark` 分支 + `BrowserTabTree.handleOpenFile` 的 `bookmark:`/`tab:` 路径解析），故"仅保存"产物可正常显示与点击打开，无需额外改动。

### 8. 测试

- 更新 `BrowserNavUtilityButtons.test.tsx`：tabs 模式断言 TooltipSimple（非原生 `title`）+ label `newBookmarkLabel`；open 模式断言原生 `title`。
- 更新 `keys.test.ts`：`browserNewTab`/`browserContextCreateTab`/`browserEditTab`/`browserTabName` 改名 + 3 个新 key 双端 parity。
- 新增测试：
  - 目录右键菜单含"新建书签"项（顶级 + 嵌套）。
  - `handleCreateTabConfirm` 三态（save-only / save-and-open×新建标签 / save-and-open×当前标签）。
  - `handleEditTabConfirm` 两态（save-only / save-and-open）。
  - `browserCreateBookmarkEntry` 写 bookmarks / folder tabs / workspace bookmarks / tabIdUrlMap。
  - CreateTabDialog 渲染 `[保存并打开] [仅保存]`，无"取消"；mode 参数透传。

## 验收标准

- `pnpm --dir frontend run typecheck` 0 错误
- `pnpm --dir frontend run lint` 0 errors
- `pnpm --dir frontend vitest run <涉及测试>` 通过
- i18n parity（keys.test.ts）通过
- 双端一致：Tauri 与浏览器模式行为一致
- 工具栏 tabs "+" 为 TooltipSimple，open "+" 为原生 title；目录/书签悬停 `more`/`refresh` 为原生 title，`create-tab`/`close` 为 TooltipSimple

## 非目标

- 不改动 `browserNewTabPage`、`browserNewTabBtn`、`browserNewTabFolder` 等"新建标签页/文件夹"措辞。
- 不改动 `common.clearAllOpenTabs` 死 key。
- 不重构书签数据模型（`BookmarkTabItem` 保留 `tabId` 字段，仅"仅保存"用合成 id）。
- 不改变"始终新建标签页"open 模式行为与 tooltip 方案。
