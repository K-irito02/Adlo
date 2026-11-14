# R2 清理审查（B：测试清理）— rev8

## 范围

- 快照：`.review-diffs/manifest-rev8.md`（base `4484cf75c`，66 文件），只看 rev8；未使用 git 命令。
- 需求真源：`docs/root-cause-to-close/2026-11/progress-2026-11-14-233054.md` 的 P4 段（事项 3/5/8/9 与 P4 审查记录）。
- 被审文件（16 组）：
  - `adlo/frontend/src/app/components/__tests__/BrowserFavicon.test.tsx`
  - `adlo/frontend/src/app/components/__tests__/faviconDisplayCache.test.ts`
  - `adlo/frontend/src/app/features/browser-tree/__tests__/BrowserBookmarkRowActions.test.tsx`
  - `adlo/frontend/src/app/features/browser-tree/__tests__/BrowserTreeEntryFlatList.window.test.tsx`
  - `adlo/frontend/src/app/features/browser-tree/__tests__/BrowserTreeEntryMenu.list.test.tsx`
  - `adlo/frontend/src/app/features/browser-tree/__tests__/browserTreeFavicon.test.ts`
  - `adlo/frontend/src/app/features/browser/__tests__/BrowserNavSearchMode.test.tsx`
  - `adlo/frontend/src/app/features/browser/__tests__/useBookmarkToFolderDialog.test.tsx`
  - `adlo/frontend/src/app/features/browser/__tests__/useBrowserTagActions.test.ts`
  - `adlo/frontend/src/app/features/browser/useBrowserFolderCrud.test.ts`
  - `adlo/frontend/src/app/features/browser/useBrowserTabs.test.ts`
  - `adlo/frontend/src/app/stores/slices/__tests__/browserBookmarkSlice.test.ts`
  - `adlo/frontend/src/app/stores/slices/__tests__/browserTabsSlice.test.ts`
  - `adlo/frontend/src/app/icons/actions.test.tsx`、`core.test.tsx`
  - `adlo/frontend/src/app/i18n/__tests__/centerCopyParity.test.ts`
  - `adlo/frontend/src/app/features/tree/__tests__/useClampedMenuPosition.test.tsx`
- 判断方式：读用例 + 读实现做删除性推演。仅对 1 个文件实跑以量化超时（F3 证据）：`pnpm run test:one -- src/app/features/browser-tree/__tests__/BrowserTreeEntryFlatList.window.test.tsx`（5 passed；逐条 1965 / 145 / 2472 / 1557 / 993 ms）。其余文件未跑。
- `.only` / `.skip` / `.todo` / `console.log` / `debugger`：本轮 16 组文件零命中（`grep` 覆盖 `adlo/frontend/src/app/**/*.test.ts(x)`）。

## 上轮问题关闭情况（与本轮测试范围相关的 R1 条目）

- rev5 tree-menus low「global-only 用例的 `browserBookmarks` 未含该 URL」→ **已关闭**：`BrowserNavSearchMode.test.tsx:246-268` 显式把 `GlobalOnly` 加进 `bookmarks`（`:252-255`），并断言「取消收藏」存在、`browserContextDelete` 不存在（`:261-262`）。
- rev5 tree-menus low「活标签行不消耗 id 无用例」→ **已关闭**：`:270-295` 首行为 `browserOpenTabs` 活标签、次行为同标题书签（`:282-283`），`rows[1]` 取消收藏命中 `bm-one`（`:291-294`，旧 shift/回退行为会红）。
- rev5 bookmark-star low「global-only 未断言标题隔离」→ **已关闭**：`:264-266` 断言 `onOpenTabInNewTab(url, undefined)`（不带快照标题）。
- rev6 tree-menus low「open 不消耗用例可再收紧」→ **已关闭**：`:282-283` 活标签行与书签行标题同为 `One`，只靠顺序/回退无法蒙对。
- rev6 bookmark-star low「bookmark 行『删除』无用例」→ **已关闭**：`BrowserNavSearchMode.test.tsx:185-188` 断言 `onRemoveBookmarkTab('bm-5173', url)`；`BrowserBookmarkRowActions.test.tsx:156-165` 断言 `onRemoveBookmarkTab('imported-1', url)`。
- rev7 tree-menus low「历史行用例标题仍写『编辑/刷新』，与断言相反」→ **已关闭**：`:221` 标题已改为「不提供依赖 tabId 的编辑（刷新保留）」，断言 `:238-243` 与标题一致。
- favicon rev5/rev6「零需修复项」结论在 rev8 新增用例（`重挂不闪烁` 组、`snapshot` 传参）上需重新确认 → 本轮未发现失效断言（见「记录不修」最后一条关于 snapshot 双用例的说明）。

## 新增发现

### F1 [severity: medium] [category: 设计]

- 位置：`adlo/frontend/src/app/stores/slices/__tests__/browserBookmarkSlice.test.ts:970-1054`（新增 `browserRemoveBookmarksForUrl` describe 块）
- 描述：新增测试块用 `(get() as any)` 与 `get() as unknown as BrowserBookmarkSlice` 播种/读取 Store 状态。pre-commit 的 `check-no-new-any.mjs` 对 `adlo/frontend/src/app/stores` 的新增行做 diff-only 拦截（命中 `/\bas any\b|\bas unknown as\b/` 即 `exit(1)`），**本轮提交会直接失败**。
- 证据：
  - 快照 diff 中 `+` 行命中 22 处（`^\+.*\bas (any|unknown as)\b`），实测文件位置：`:977`、`:978`、`:982`、`:993`、`:999`、`:1001`、`:1005`、`:1010`、`:1011`、`:1015`、`:1016`、`:1020`、`:1027`、`:1028`、`:1032`、`:1033`、`:1037`、`:1044`、`:1045`、`:1048`、`:1049`、`:1053`。
  - `adlo/scripts/check-no-new-any.mjs:20-21`（`DIFF_PATHS = ["adlo/frontend/src/app/stores"]`、`BANNED` 正则）、`:38-41`、`:70`（`process.exit(1)`）。
  - `.agents/rules/commands.md:161` 与 `governance-gate-script-ratchet.md:13/24` 明确该检查在 pre-commit 跑暂存 diff 的新增行；根 `AGENTS.md`「禁止项」把 store 新增 `as any` 列入自动校验集。
  - 同文件上方的同名写法（如 `:29`）属 grandfathered 存量，本轮新增行不享有该豁免。
- 建议修复：改为不触发棘轮的写法——`createMockStore()` 的 `get()` 返回 `Record<string, unknown>`，用 `(get() as Record<string, unknown>).browserBookmarks = [...]` 播种，或给 `createMockStore()` 加 `seed(partial: Record<string, unknown>)` 辅助复用之。不建议挂 `no-new-any-allow`（这 22 处都是普通夹具，无豁免理由）。

### F2 [severity: medium] [category: 设计]

- 位置：`adlo/frontend/src/app/components/__tests__/BrowserFavicon.test.tsx:48-54` 与 `:93-97`
- 描述：两条用例是同一场景的重复（「无缓存、未结算」的默认 spinner 模式），断言几乎逐字相同：`fallback.style.display === 'none'` + `visibleImg === null`（`:48` 多一条 `fallback` 非空）。其中 `:48` 的标题与注释承诺「shows spinner … 显示 spinner」，却**没有任何 spinner 断言**——删掉整条 spinner 渲染分支该用例仍绿。
- 证据：
  - `:48` 用 `https://uncached.example`、`:93` 用 `https://never-fetched.example`，两者都无镜像条目：`getFaviconUrl` 均返回 `''`、`isSiteMetaResolvedOrRedirected` 均 false → 组件状态完全相同（`components/BrowserFavicon.tsx:104-125`、`:403-408`）。
  - 删除性推演：移除 `{isLoading && <Spinner/>}`（`BrowserFavicon.tsx:437`）后 `:48`、`:93` 都不红；spinner 断言只存在于 `:250-253`。
- 建议修复：删掉 `:48-54`（保留 `:93` 的「未结算显示空占位」语义，spinner 由 `:250` 覆盖）；若想保留合并版，则改成单条用例同时断言 `.adl-spinner` 非空 + fallback `display:none`，并删除另一条。

### F3 [severity: low] [category: 优化]

- 位置：`adlo/frontend/src/app/features/browser-tree/__tests__/BrowserTreeEntryFlatList.window.test.tsx:92`、`:123`、`:147`、`:159`
- 描述：4 条用例统一挂 `}, 15000)`（默认 5000）。实测这 4 条耗时 1965 / 2472 / 1557 / 993 ms，单条最高 2.5s，不到默认预算一半；15s 是默认值 3 倍、实测值 6 倍，属「非慢用例的超时通胀」。
- 证据：实跑命令与逐条 ms 见「范围」；用例如无 `waitFor`/真实计时器等待，耗时来自 120–200 行 jsdom 渲染。同目录 `BrowserTreeEntryFlatList.test.tsx`（单行 fixture）无超时；全仓 `*.test.tsx` 中 `}, \d{4,})` 仅本文件 4 处命中。
- 建议修复：删除 4 处 `, 15000`（或收紧到 10000 且只留最慢两条），并把 fixture 行数下调（200/120 → 100/90 即可覆盖「一页 80 + 追加」与「小于一页」边界）。

### F4 [severity: low] [category: 文档]

- 位置（同类：标题/注释承诺与断言或事实不符，共 6 处）：
  1. `BrowserFavicon.test.tsx:155`「…(recovers when the server comes up)」——只断言重试后 probe 换了新节点（`:170-172`），从未模拟服务就绪后的 load 成功；真正的恢复断言在 `:285-298`。
  2. `useBrowserTagActions.test.ts:40`「在中心打开：新建中心标签并保留面板活动标签约束」——未断言 `browserActiveTabId`/面板侧状态，只断言 `location==='center'`、`title` 与 `centerTabs.refId`。
  3. `BrowserNavSearchMode.test.tsx:221`「历史行即使有**同名**活标签…」——`makeTab('tab-live', …)`（`:235`）走默认 `title='Tab'`，与历史行 `HistoryLive` 并不同名；该用例实际锁的是「历史行 `edit` 恒隐藏、`refresh` 保留」（`BrowserNavSearchMode.tsx:204-221` 的 keep 判据只看 `nodeType`，与标签标题无关）。
  4. `BrowserBookmarkRowActions.test.tsx:115`「右键打开菜单卡片并包含打开/**删除**等条目」——只断言 `browserContextOpenCurrent`，删除已在 `:156` 单独覆盖。
  5. `useBrowserFolderCrud.test.ts:17` describe 名仍是「树删除跳过中心标签」，但本轮新增的 3 条（`:43`、`:78`、`:123`）都是「全部在中心打开」。
  6. `browserTreeFavicon.test.ts:41-43` 把 `nodeType:'tab' + isSavedBookmark` 变体解释为「兼容其它调用方构造的节点」（标题还写「(search results)」），实际是**生产可达路径**：`useBrowserTreeData.ts:148-155`（收藏目录里仍有活标签的条目）与 `:219-250`（工作区书签快照）都会产出该组合；搜索行本轮已改为 `nodeType:'bookmark'`（`BrowserNavSearchMode.tsx:136`）。
- 描述/证据：以上均为读用例 + 读实现逐条对照所得；断言本身有效，问题在文案与断言的落差，以及第 6 条对「为什么保留该变体」的事实性误述。
- 建议修复：1 删去「recovers…」或补一次 `fireEvent.load(probeImg(container)!)` 后断言可见图标；2 补 `expect(useAppStore.getState().browserActiveTabId).toBe('')` 或删掉「保留面板活动标签约束」；3 把 `makeTab` 标题传成 `'HistoryLive'`，或把标题改为「历史行有同 URL 活标签」；4 标题去掉「/删除」；5 describe 改名（如「useBrowserFolderCrud 目录批量操作」）或把新用例移到独立 describe；6 注释与标题改为「收藏目录中仍有活标签的条目即该组合（`useBrowserTreeData.buildFolderNode`），因此判定必须 `isSavedBookmark` 优先」。

## 记录不修

- `BrowserNavSearchMode.test.tsx:216/240/242/243/261` 的 `expect(screen.getByText(...)).toBeDefined()` 属恒真形式（`getBy*` 未命中即抛错），但这是全仓既有写法（同类约 100 处，如 `components/settings/KeybindSettings.test.tsx:58-64`），单点改动只会制造不一致，留待统一清理。
- `BrowserTreeEntryFlatList.window.test.tsx:22-48` 的 `MockIntersectionObserver.observed` 数组从未被读取（`trigger()` 直接回调，不依赖 observed）；`unobserve/disconnect/takeRecords` 属 stub 完整性所需，只删 `observed` 收益极低。
- `useClampedMenuPosition.test.tsx:22-33` 的 `data-testid="menu"` 与 `style` 未被任何断言使用。刻意断言内部 `adjusted` 是合理的：组件 style 为 `adjusted?.top ?? position.top`，回归态（复用上一次坐标）下 DOM 顶层坐标仍是本次 `position.top`，改 DOM 断言无法区分（读 `features/tree/treeEntryMenus.ts:80-91` 推演）。
- `useBrowserTabs.test.ts:69-78`「未收藏的 URL 保持空心状态（反向守护）」与 `:58-67` 的负向断言重复度较高，但「`isBookmarked` 恒为 true」的实现只能被负向用例拦住，属可删不删的低价值反向守护。
- `useBookmarkToFolderDialog.test.tsx:120-144` 新用例未 stub `browserToggleBookmark`，会真实写入 store（`useBookmarkToFolderDialog.ts:167`）；本文件其余用例不读 `browserBookmarks`，当前无顺序依赖，未计入需修复。
- `BrowserNavSearchMode.test.tsx:6-7` 同模块拆成两条 `import type`（无 `import/no-duplicate-imports` 规则，纯风格）。
- `icons/actions.test.tsx`、`icons/core.test.tsx` 以 path `d` 字面量/子路径计数作断言（实现细节），但与本仓 `core.test.tsx` 既有「viewBox + corner path」风格一致，且是图标几何的唯一可测面，保留。
- `BrowserBookmarkRowActions.test.tsx:16-35` 与 `BrowserTreeEntryMenu.list.test.tsx:15-34` 的 `callbacks` 对象逐字重复；`SectionCallbacks` 全字段必填，两文件入口不同（`BrowserCategorySection` vs `BrowserTreeEntry` list 模式），暂不提取共享 fixture。
- `BrowserFavicon.test.tsx:270-283`（SSR 内联快照）与 `:353-365`（内联快照首帧）非重复：前者锁「effect 未执行」的 render 期解析，RTL 的 `render` 会 flush effect，删掉 `resolveInitialSources` 的 `snapshotReady` 优先级只有 SSR 用例会红（`BrowserFavicon.tsx:74-96`）。

## 结论

- 需修复项：4（critical 0 / high 0 / medium 2 / low 2）
