# R2 清理审查报告（A：前端代码清理）— rev8

## 范围

- 快照：`.review-diffs/manifest-rev8.md`（rev8，base `4484cf75c`，66 文件）；只读本轮 rev8 快照 + 工作区源码。
- 派发范围内文件（前端 A 组）：
  - `components/`：`BrowserFavicon.tsx`、`faviconDisplayCache.ts`、`ContextMenu.tsx`
  - `features/browser-tree/**`：`BrowserTreeEntryMenu.tsx`、`BrowserTreeEntryFlatList.tsx`、`BrowserEntrySubEntries.tsx`、`BrowserCategorySection.tsx`、`browserEntrySubEntriesUtils.tsx`、`browserTreeEntryUtils.tsx`、`browserTreeFavicon.ts`、`types.ts`、`useBrowserTreeData.ts`、`BrowserTabTree.tsx`
  - `features/browser/**`：`BrowserNav*Mode.tsx`、`BrowserNavigator.tsx`、`BrowserPanel.tsx`、`BrowserPanelActionsContext.ts`、`BrowserTabBar.tsx`、`BrowserOpenTabFlatListItem.tsx`、`useBrowserTabs.ts`、`useBrowserFolderCrud.ts`、`useBrowserTagActions.ts`、`useBookmarkToFolderDialog.ts`
  - 其余：`features/center/CenterBrowserView.tsx`、`features/terminal/TerminalContextMenu.tsx`、`features/tree/treeEntryMenus.ts`、`regions/CenterTabStrip.tsx`、`stores/slices/{browserBookmarkSlice,browserTabsSlice}.ts`、`utils/{browserDisplayUtils,favicon}.ts`
- 只做清理维度（死代码/未使用导出、冗余守卫、重复实现、被取代未删的旧分支、日志与临时注释、注释与实现不符）；不重审正确性、不跑测试套件（按简报用删除性推演判断回归保护）。
- 需求真源：`docs/root-cause-to-close/2026-11/progress-2026-11-14-233054.md` P4 段（R1 rev1–rev7 记录）。

## 上轮问题关闭情况

- 本轮为 R2（清理审查）**首轮**，无上轮 R2 项可核对。
- 未重新打开 R1 语义问题：进度文件记录 R1 rev7「零问题」，本轮按派发范围仅做清理；下文发现的 3 条 medium 均属「重构后未清理的残留」，不是对 R1 结论的推翻（唯一涉及语义的一处已在 F1 证据中说明为何仍按清理处理）。
- 未验证 R1 报告原件（`favicon-r1-rev*.md` 等不在本次派发范围），本报告结论不依赖其内容。

## 新增发现

### F1 [severity: medium] [category: 死代码]

- 位置：
  - `adlo/frontend/src/app/features/browser/useBrowserTabs.ts:163-172`（`handleToggleBookmark` / `handleToggleBookmarkForTab`）、`:202-203`（返回）、`:59`、`:71`（`browserToggleBookmark` 订阅）
  - `adlo/frontend/src/app/components/faviconDisplayCache.ts:25`（`isInlineFaviconSource` 只被本文件 `:37` 调用，却 `export`）
  - `adlo/frontend/src/app/features/browser-tree/browserEntrySubEntriesUtils.tsx:168`（`handleBookmarkToggle` 只被本文件 `:266` 调用，却 `export`；本轮 `BrowserTreeEntryMenu` 已改为复用 `getTabContextMenuItems`，它原来的外部消费方被删除，导出未回收）
- 描述：本轮把「收藏状态」统一为 URL 身份（`isUrlBookmarked`）后，所有可达的星标入口都走 `useBookmarkToFolderDialog.handleOpenBookmarkDialog`（内部改为 `browserRemoveBookmarksForUrl`）。`useBrowserTabs` 里两个按 (url,title) 元组 toggle 的包装函数已无任何消费方，其订阅的 `browserToggleBookmark` 也只为它们而存在。另有两处「模块内自用却仍 export」的函数。
- 证据：
  - 全仓检索：`handleToggleBookmark` / `handleToggleBookmarkForTab` 仅出现在 `useBrowserTabs.ts` 的定义与 `return` 中；`useBrowserTabs()` 的唯一生产消费方是 `BrowserPanel.tsx:146`，它只解构 `isBookmarked`（`:140`），星标按钮走 `handleOpenBookmarkDialog`（`BrowserToolbar.tsx:199-203`、`BrowserPanel.tsx:462/507`）。
  - 全仓检索：`isInlineFaviconSource` 除定义与 `:37` 外无引用；`handleBookmarkToggle` 除定义与 `:266` 外无引用。
  - 删除性推演：`useBrowserTabs.test.ts:25-71` 只断言 `isBookmarked`（按 URL 判定）；`browserEntrySubEntriesUtils`/`faviconDisplayCache` 的用例都不导入这两个导出。删掉上述符号与订阅，测试不会变红 —— 即当前无回归保护，属纯死代码。
- 建议修复：删除两个 toggle 回调及其返回项，并从 `useShallow` 选择器移除 `browserToggleBookmark`；`isInlineFaviconSource`、`handleBookmarkToggle` 去掉 `export`（或就地内联）。注意保留 store 侧 `browserToggleBookmark`（`useBookmarkToFolderDialog.ts:167` 仍在用），只清理 hook 侧接线。
- 备注（如实标注）：从快照看，`BrowserToolbar.tsx` 与这两个回调都不在本轮 diff 内，因此它们「无消费方」很可能在 base 之前就成立；仍列入本轮是因为 (a) 文件在本轮改动范围，(b) 本轮把收藏身份统一为 URL 后，这两个元组 toggle 包装已被彻底取代，属「被新实现取代却未删的旧分支」。主代理若判定为预存项，可降级为记录不修。

### F2 [severity: medium] [category: 死代码 / 设计]

- 位置：`adlo/frontend/src/app/features/browser-tree/BrowserTreeEntryMenu.tsx:246-267` 与 `:291-312`（两段菜单项渲染 JSX）；同文件 `:13-21`（`TreeMenuViewItem`）与 `:33-41`（`entryMenuItems` 内联同形类型）
- 描述：两个 portal 菜单的 `<button>` 渲染块（icon/badge/hint/危险色/事件）逐字重复 22 行 ×2，唯一差异是外层点击包装（`handleMenuItemClick` vs `handleTabMenuAction`）；同一文件里菜单项类型也被声明了两遍。
- 证据：
  - 两段 JSX 逐行比对一致（仅 `onClick` 包装函数不同、容器 `ref/style/data-menu-id` 属外层）。
  - 这种复制在本轮已经真出过事：进度 P4「R1 rev1 tree-menus F3」记录「列表菜单复制漂移，取消收藏范围与树不一致」，正是本轮改为共享 `getTabContextMenuItems` 才修好；两处渲染仍是两套手写，下次加字段（如 `separator`/`disabled`）仍会再漂一次。
- 建议修复：提取一个 `renderMenuItems(items: TreeMenuViewItem[], onItemClick: (fn: () => void) => () => void)`（或抽 `<TreeMenuList>` 局部组件）供两处复用；`entryMenuItems` 参数类型直接写 `TreeMenuViewItem[]`，删除重复声明。

### F3 [severity: medium] [category: 死代码 / 设计]

- 位置：`adlo/frontend/src/app/features/browser/useBookmarkToFolderDialog.ts:199-209`（本轮新增）／对照 `:122-130`、`:154-164`
- 描述：本轮新增的「无活标签页 → `browserCreateBookmarkEntry`」失败分支，把「目录冲突 → 拼 `browserBookmarkDuplicateWithPath` 文案 → toast → 关窗 → 清 pending」这段逻辑又抄了第三份；同一文件内三处冲突处理必须手工保持一致。
- 证据：`:199-209` 与 `:154-164` 除来源变量名（`result` vs `precheck`）外完全相同；`:122-130`（`addTabToDirectory`）是同一段逻辑的「只 toast 不关窗」变体。三份都依赖同一 i18n 键与 `formatT` 组合，任何一处改文案/改关闭策略都要改三处。
- 建议修复：提取 `showDuplicateToast(pathLabel: string | undefined)`（内部 `formatT(...)` + `showToast(msg, 'warning')`），三处共用；「关窗 + 清 pending」抽成 `closeDialogAfterCollision()` 供后两处调用。

### F4 [severity: low] [category: 死代码]

- 位置与内容（本轮新增的冗余条件/冗余展开，共 4 处）：
  1. `adlo/frontend/src/app/features/browser-tree/browserEntrySubEntriesUtils.tsx:255-260`：「取消收藏」文案三元里 `node.isSavedBookmark && node.bookmarkId` 与 `isBookmarked` 两个分支返回值相同（都是 `t.browserUnbookmark`），属重复分支。
  2. `adlo/frontend/src/app/components/BrowserFavicon.tsx:123-125` 与 `:187-189`：`Boolean(url && !preferred && isSiteMetaResolvedOrRedirected(url) && !initialMeta)` 中的 `&& !initialMeta` 恒被 `!preferred` 蕴含（`preferred = meta || snapshot`），是冗余条件。
  3. `adlo/frontend/src/app/features/browser-tree/browserTreeFavicon.ts:26`：`...(node.iconUri ? { snapshot: node.iconUri } : {})` —— `tsconfig.json` 未开 `exactOptionalPropertyTypes`，`snapshot: node.iconUri`（可 `undefined`）等价，条件展开无必要。
  4. `adlo/frontend/src/app/features/browser-tree/useBrowserTreeData.ts:144`：同上 `...(entry.iconUri ? { iconUri: entry.iconUri } : {})`；且同文件 `:156-158`、`:251-253` 对同一字段用的是 `if (entry.iconUri) node.iconUri = ...`，三处三种写法。
- 描述：本轮多处采用「先判空再拼对象/再比一次」的写法，导致同一语义出现双分支或双写法；不影响行为，但会让后续读者误以为这些分支各有语义。
- 建议修复：1 合并为 `(node.isSavedBookmark && node.bookmarkId) || isBookmarked ? … : …`；2 去掉 `&& !initialMeta`；3/4 直接写可选属性，并把 `iconUri` 赋值统一成一种写法（推荐 `if`）。

### F5 [severity: low] [category: 死代码 / 设计]

- 位置：`adlo/frontend/src/app/features/browser/useBrowserFolderCrud.ts:314-324`（`collectFolderEntries`）与 `:338-348`（`collectEntries`）
- 描述：同一个 `collectNodeOpenTargets` 里为「工作区分支」和「目录分支」各写了一个递归收集器，形状完全相同（取 `entries` 逐个 push → 按 `parentId` 递归子目录），差异只有是否带 `workspaceId`。
- 证据：两段结构一一对应（`find(f => f.id === id)` → `(folder?.entries ?? []).forEach(push)` → `filter(f => f.parentId === id).forEach(recurse)`），仅子目录 filter 多一个 `(!f.parentType || f.parentType === 'folder')` 条件、push 时多一个 `workspaceId` 字段。
- 建议修复：抽成 `collectFolderTargets(folderId, workspaceId?)`，两处各调一次；顺带把三处重复的 `{ url: string; title?: string; workspaceId?: string }` 收成一个局部类型。

### F6 [severity: low] [category: 文档]

- 位置：`adlo/frontend/src/app/components/BrowserFavicon.tsx:57-64`（`FAVICON_RETRY_MAX` / `FAVICON_RETRY_DELAY_MS` 的头注释）
- 描述：注释写「耗尽后仍失败才**永久降级**（避免"永远闪烁"）」，但本轮实现里耗尽只写 `exhaustedSrc`（`:134-136` 自己的注释即写明「本次挂载内已耗尽…换源/重挂后自动失效」，`:156`/`:191` 在元数据变化与 URL 变化时清空），模块级缓存也只记「成功过」的来源（`faviconDisplayCache.ts:60-63`）。「永久降级」与最终代码相反。
- 证据：`:344-346`（耗尽分支只 `setExhaustedSrc(failed)` + 清 probe）、`:191`（URL 变化 `setExhaustedSrc('')`）、`:156`（元数据变化同样清空）；重挂即重新获得完整 `FAVICON_RETRY_MAX` 预算（`:128`）。
- 建议修复：改为「耗尽后本次挂载内不再重试该来源；换源/重挂后重新获得预算」，并删掉「永久降级」措辞（该绝对断言也无测试可证）。

## 记录不修

- `BrowserFavicon.tsx:208` 孤悬注释（`// 说明：snapshot 变化时同样需要重置重试/耗尽状态…`）：不附着任何代码，位于两个 effect 之间，行为已由 `:182-206` 的依赖数组实现。建议下次触碰该文件时顺手删除，不单独开修复项。
- `BrowserFavicon.tsx` 的 `faviconUrl`（state）+ `faviconUrlRef`（ref）双份同值状态（`:108`、`:122`、`:152-154`、`:184-185`）：ref 用于 `applyMetaUpdate` 的 prev 比较与 5s 定时器读取（避免 stale closure）。收敛为单一来源需重排 effect 依赖，风险高于收益；记录保留。
- `BrowserFavicon.tsx:405-406` 的 `degraded`：本轮已不再用它遮挡图标（旧 `showImg = current && !degraded` 已删），现在只参与 `isLoading` 的一个近乎不可达组合（需 `preferredSrc` 为空而 `degraded` 为真）。作为边界兜底保留，暂不删状态。
- `BrowserFavicon.tsx:424` 的 `probeSrc !== displaySrc`：状态机内 probe 清空与 `displaySrc` 提交同批发生，该比较基本不可达；作为廉价防御保留。
- `BrowserFavicon.tsx:385` `markFaviconSourceLoaded(el.currentSrc || loaded)` 与 `:318` `markFaviconSourceLoaded(loaded)` 记账口径不一（complete 补检会记解析后的 `currentSrc`）：属归属/记账正确性范畴，R1 已按「src 与 ownerUrl 同一 state」收口，本轮不作清理项；若后续出现「已加载却仍探测」再复查。
- `useBrowserTreeData.ts` 三处 `iconUri` 赋值写法不一致（`:144` 条件展开 / `:156-158` `if` / `:251-253` `if`）：只影响可读性，已在 F4-4 里合并建议，不单列。
- 菜单 `icon?` 管道（`browserEntrySubEntriesUtils.tsx:189`、`browserTreeEntryUtils.tsx:118`、`TreeMenuViewItem.icon`）当前无生产者：进度 P4 已记录「保留供已打开标签页等有图标菜单」，本轮不重开。
- `isUrlBookmarked` 每次调用逐个重算 `bookmarkUrlKey`（`BrowserEntrySubEntries.tsx:274/357`、`BrowserTreeEntryMenu.tsx:214`、`BrowserNavSearchMode.tsx:254`）：调用点都在右键菜单/活动标签渲染，不在逐行渲染热路径；原先的 `bookmarkedKeys` Set 已随「按 URL 身份」语义移除，当前不构成可测回归，记录备查。
- `computeNavigatorCount` 无生产消费方：R1 rev4 已记录为文档口径问题（进度 P4），本轮不重复上报。
- `BrowserNavigator.tsx` 第二处 `BrowserNavListMode` 调用本次新增 `onBookmarkTab` / `onRemoveBookmarkTab` 两行：属修复「列表模式缺回调」的接线，非冗余，记录以说明已核对。

## 结论

- 需修复项：6（critical 0 / high 0 / medium 3 / low 3）
- 需修复清单：F1（未使用返回值/导出）、F2（菜单渲染双份）、F3（冲突处理三份）、F4（冗余条件/展开 4 处）、F5（递归收集器双份）、F6（重试注释与实现相反）。
- 说明：均未实跑测试；回归保护判断用删除性推演（读用例 + 读实现）得出，最终门禁由主代理执行。
