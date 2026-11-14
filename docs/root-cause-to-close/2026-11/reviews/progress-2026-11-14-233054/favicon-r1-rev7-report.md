# R1 审查报告（rev7 定向复核）— favicon 子系统

- 仓库根：`E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/slot-1`
- 快照：`.review-diffs/*-rev7.diff`（本轮 rev7，只读）；清单 `.review-diffs/manifest-rev7.md`（66 文件）
- 上一轮报告：`.review-diffs/favicon-r1-rev6-report.md`（结论：零需修复项）
- 实跑命令：**无**（未运行任何测试/门禁）

## 范围

对 manifest 全部 66 个文件做 rev6/rev7 快照哈希比对（SHA256 前 12 位），**仅 3 个文件变动**，与派发前提一致：

| 文件 | rev7 变动 | 与 favicon 关系 |
| ---- | -------- | --------------- |
| `adlo/frontend/src/app/components/BrowserFavicon.tsx` | **无**（`B5567DDBCAD9`，与 rev5/rev6 同值） | 本范围主体 ✓ |
| `adlo/frontend/src/app/components/__tests__/BrowserFavicon.test.tsx` | **无**（`C7FB8B88E315`） | 用例未改 ✓ |
| `adlo/frontend/src/app/features/browser/BrowserNavSearchMode.tsx` | 改（bookmark-star 范围） | 仅间接：搜索结果行菜单裁剪 |
| `adlo/frontend/src/app/features/browser/__tests__/BrowserNavSearchMode.test.tsx` | 改（同范围） | 无关 |
| `docs/root-cause-to-close/2026-11/progress-2026-11-14-233054.md` | 改（记录 rev6 结论） | 文档 |

favicon 链路其余文件 rev6→rev7 哈希逐一相同：`faviconDisplayCache.ts`（`99F1EACF6F85`）、其用例、`browserTreeFavicon.ts`（`218C89F6F9D6`）及其用例、`types.ts`、`useBrowserTreeData.ts`、`BrowserEntrySubEntries.tsx`、`BrowserTreeEntryFlatList.tsx`（`F044DC2C82F7`）、`browserTreeEntryUtils.tsx`、`utils/favicon.ts`、`utils/browserDisplayUtils.ts`、`files-navigator.css`（`8FE91E92FF85`，probe 层样式）、`BrowserTabBar.tsx`、`CenterTabStrip.tsx`、`CenterBrowserView.tsx`、两个 store 切片。

## rev6 结论维持核对

1. **`BrowserFavicon.tsx` 字节级未变** → rev5/rev6 的零问题结论原样成立（`probe={src, ownerUrl}` 单一 state、10 个 `setProbe` 对象调用点、`handleProbeLoad`/`handleProbeError`/complete 补检读同一次提交归属且归属为空早退、无 `probeUrlRef`/`setProbeSrc`/`|| url`）✓
2. **用例未改**，rev4 F1 的「不可测 → 结构修复 + 注释」处置不变 ✓
3. **本轮间接影响（`BrowserNavSearchMode.tsx`）与 favicon 无关**：rev7 相对 rev6 只改一处判据——历史行右键菜单 `refresh` 由「一律屏蔽」改为 `!!node.url && (!isHistoryKind || !!node.tabId)`（与悬停刷新同口径），另修注释。节点 favicon 输入未变：`nodeType` 仍为 `isOpenTab ? 'tab' : isBookmarkRow ? 'bookmark' : 'history'`、`isSavedBookmark: isBookmarkRow`，仍未透传 `iconUri`；搜索结果行仍经 `BrowserTreeEntryFlatList` → `faviconPropsForNode` 渲染，活标签行走 `spinner`、其余行走 `initial`（被动）✓
4. **进度文件**：新增 rev6 记录「favicon：零问题（与 rev5 哈希一致，无间接影响）」，与上一轮报告一致 ✓

## 新增发现

**无。** 本轮既无 favicon 源码/用例改动，也无任何改动触及 favicon 的节点字段、快照来源、元数据镜像、样式或缓存语义。

记录不修沿用 rev5（R1–R13），rev7 未触达任何一条。

## 结论

- 需修复项：**0**（critical 0 / high 0 / medium 0 / low 0）—— **本轮零问题**
- `BrowserFavicon.tsx` 及全部 favicon 链路文件与 rev6 哈希一致；全仓仅 `BrowserNavSearchMode.tsx` + 其用例 + 进度文件变动，其中菜单 `refresh` 判据收紧不改变节点 favicon 字段与被动/主动分类。
