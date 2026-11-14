# R1 审查报告（rev6 定向复核）— favicon 子系统

- 仓库根：`E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/slot-1`
- 快照：`.review-diffs/*-rev6.diff`（本轮 rev6，只读）；清单 `.review-diffs/manifest-rev6.md`（66 文件）
- 上一轮报告：`.review-diffs/favicon-r1-rev5-report.md`（结论：零需修复项）
- 进度真源：`docs/root-cause-to-close/2026-11/progress-2026-11-14-233054.md:238-239`
- 实跑命令：**无**（未运行任何测试/门禁）

## 范围

本轮只做定向复核：确认 `BrowserFavicon.tsx` 未再改动，并检查其它文件改动对 favicon 的间接影响。

对 manifest 全部 66 个文件做 rev5/rev6 快照哈希比对（SHA256 前 12 位），**仅 4 个文件变动**：

| 文件 | rev6 变动 | 与 favicon 关系 |
| ---- | -------- | --------------- |
| `adlo/frontend/src/app/components/BrowserFavicon.tsx` | **无**（哈希 `B5567DDBCAD9`，rev5 同值） | 本范围主体，零改动 ✓ |
| `adlo/frontend/src/app/components/__tests__/BrowserFavicon.test.tsx` | **无**（哈希 `C7FB8B88E315`） | 用例未改 ✓ |
| `adlo/frontend/src/app/features/browser/BrowserNavSearchMode.tsx` | 改（bookmark-star 范围） | 仅间接：搜索结果节点形状/菜单裁剪 |
| `adlo/frontend/src/app/features/browser/__tests__/BrowserNavSearchMode.test.tsx` | 改（同范围） | 无关 |
| `docs/operations/ui-manual/rightpanel/tools/browser.md` | 改（新增「图标重挂记忆」行等） | 文档 |
| `docs/root-cause-to-close/2026-11/progress-2026-11-14-233054.md` | 改（记录 rev5 结论） | 文档 |

其余 favicon 链路文件哈希与 rev5 完全一致：`faviconDisplayCache.ts` 及其用例、`browserTreeFavicon.ts` 及其用例、`types.ts`、`useBrowserTreeData.ts`、`BrowserEntrySubEntries.tsx`、`BrowserTreeEntryFlatList.tsx`、`browserTreeEntryUtils.tsx`、`utils/favicon.ts`、`utils/browserDisplayUtils.ts`、`files-navigator.css`（probe 层样式）、`BrowserTabBar.tsx`、`CenterTabStrip.tsx`、`CenterBrowserView.tsx`、两个 store 切片。

## rev5 结论维持核对

1. **`BrowserFavicon.tsx` 字节级未变** → rev5 的零问题结论原样成立：`probe` 仍是 `{src, ownerUrl}` 单一 state（`:112-120`），10 个 `setProbe` 调用点全部传对象，`handleProbeLoad`（`:309-324`）/ `handleProbeError`（`:326-358`，含 `probeOwnerUrl === url` 守卫）/ complete 补检（`:375-391`）一律读同一次提交的归属且归属为空即早退；`probeUrlRef` / `setProbeSrc` / `|| url` 兜底在源码中零残留 ✓
2. **用例未改**：`BrowserFavicon.test.tsx` 哈希与 rev5 一致（含两条 SSR 用例、换 URL/forget/failed/重挂/耗尽 8 条），rev4 F1 的「不可测 → 结构修复 + 注释」处置不变 ✓
3. **无回退**：favicon 相关注释、`snapshot` 透传、`faviconDisplayCache` 语义、probe `<img>` 的 `key`/`src`/`onLoad`/`onError` 均与 rev5 相同 ✓

## 间接影响核对（其它文件改动）

- **`BrowserNavSearchMode.tsx`（rev6）**：搜索结果行仍经 `BrowserTreeEntryFlatList` → `faviconPropsForNode(node)` 渲染图标（本文件不直接引用 `BrowserFavicon`）；rev6 只改了两件事——同 URL 多条目改为**标题精确匹配、不再回退到 `unused[0]`**，以及历史行菜单裁剪（`refresh`/`edit` 不再对历史行开放）。节点形状与 favicon 相关的字段未变：`nodeType` 仍为 `isOpenTab ? 'tab' : isBookmarkRow ? 'bookmark' : 'history'`、`isSavedBookmark: isBookmarkRow`，因此
  - 活标签行仍是 `spinner` 主动列表；
  - 书签行/历史行（含「收藏域但无目录条目」的 global-only 行）仍全部 `passive → pending='initial'`，首帧不转圈；
  - 仍未透传 `iconUri`（记录不修 R7 不变，非本轮回归）。
  结论：rev6 的归属/菜单收紧**不改变任何 favicon 的输入或显示路径**✓
- **ui-manual `browser.md`**：新增 `:478`「图标重挂记忆（v2026-11-15）」行——「已成功显示过的图标 / 该页面上次显示的图标按会话记忆；折叠/展开、目录↔列表切换重挂时首帧直接复用，不再退回占位」。与实现一致（`faviconDisplayCache` 的 `loadedSources` + `pageDisplaySources` + `resolveInitialSources` 的渲染期同步取值），且该路径正是 `BrowserFavicon.test.tsx:285-319` 锁住的重挂用例 ✓；同轮修订的音频指示器行（`bookmarkUrlKey` 口径）与 favicon 无关 ✓
- **进度文件 `:238-239`**：rev5 结论记录与本次复核一致（「零需修复项 … 2 条纯优化记录不修」）✓

## 新增发现

**无。** 本轮既无 favicon 源码/用例改动，也无任何改动触及 favicon 的输入（节点字段/快照/元数据镜像）、样式或缓存语义。

记录不修沿用 rev5（R1–R13，全部原样有效：`preferred === displaySrc` 早退不认领归属、记忆写入双处、耗尽分支无用例、损坏 data-URI 仅模块级用例、12s 过渡、`preferred` 冗余、搜索行无 `iconUri`、evicted 探针透明度、渲染期读缓存、孤立注释、未校验 `iconUri`、`setProbe` 对象身份多一帧空渲染、旧页 probe 耗尽的收窄写法）；其中 R13 相关的行为（旧页 probe 失败清 probe）在 rev6 未触达，URL 变化仍先重置 `exhaustedSrc`（`:191`）而自愈。

## 结论

- 需修复项：**0**（critical 0 / high 0 / medium 0 / low 0）—— **本轮零问题**
- 摘要：`BrowserFavicon.tsx` 及全部 favicon 链路文件 rev5→rev6 哈希一致（rev5 零问题结论原样成立）；全仓仅 4 个文件变动，其中 `BrowserNavSearchMode` 的归属/菜单收紧不改变节点 favicon 字段与被动/主动分类，文档改动与实现相符，无间接影响。
