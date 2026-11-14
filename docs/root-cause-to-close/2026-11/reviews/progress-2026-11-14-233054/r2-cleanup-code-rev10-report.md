# R2 最终确认报告（A：代码清理）— rev10

## 范围

- 快照：`.review-diffs/manifest-rev10.md`（base `4484cf75c`，67 文件，与 rev9 同集）；只读工作区源码 + rev10 快照，未跑测试、未用 git。
- 复核对象：rev9 复审报告 `.review-diffs/r2-cleanup-code-rev9-report.md` 的唯一 low（`useBookmarkToFolderDialog.ts` JSDoc 归属错位），并确认本轮未引入其它变化。
- 文档组（ADR / ui-manual / 知识库 / 进度）与测试组不在本 scope。

## 上轮问题关闭情况

### F1（JSDoc 归属错位）— 已关闭

- `adlo/frontend/src/app/features/browser/useBookmarkToFolderDialog.ts:107`：`showDuplicateToast` 上方改为一行准确注释「目录冲突的统一 toast（带路径文案时显示具体目录）。」——不再声称「返回 false」，与函数体（`:108-116`，返回 `void`）一致。
- `:123-126`：原「落盘『标签 → 目录』关联…返回 false 表示目录冲突已 toast」的 JSDoc 已回到 `addTabToDirectory`（`:127`）上方，与其 `Promise<boolean>` + `:140` `return false` 的实现相符。
- 行为核对：`:138-142` 冲突时 `showDuplicateToast(result.pathLabel); return false;`（不关窗）——与 rev9 一致；预检（`:165-167`）与 `browserCreateBookmarkEntry` 失败（`:204-206`）仍是「toast + `closeDialogAfterCollision()` + return」；依赖数组 `[showDuplicateToast]`（`:144`）与 `handleBookmarkAddToFolder` 的 `[..., showDuplicateToast, closeDialogAfterCollision]`（`:239-248`）均未变。

## 新增发现

无。

### 其它变化抽查（确认本轮仅动注释）

- rev10 快照 `useBookmarkToFolderDialog.ts` 的 hunk 与 rev9 工作区状态逐段一致，唯一差异即上述注释移动 + 新增一行注释；无逻辑/依赖数组改动。
- 上轮六项修复在当前工作区仍成立：`useBrowserTabs.ts` 已无 `handleToggleBookmark*` / `browserToggleBookmark`（检索 0 命中）；`faviconDisplayCache.ts:25` 仍为非导出；`browserEntrySubEntriesUtils.tsx:256` 仍是合并后的文案条件；`BrowserTreeEntryMenu.tsx:157/266/290` 仍是 `renderMenuButtons` 双处共用；`browserTreeFavicon.ts:26` 仍是直接可选属性；`useBrowserTreeData.ts:145/159/254` 三处统一 `if`；`useBrowserFolderCrud.ts:302-333` 单一 `collectFolderTargets`；`BrowserFavicon.tsx:63` 重试注释仍与实现一致。
- 未发现清理引入的新问题（导入、依赖数组、导出引用、菜单渲染结构均无变化）。

## 记录不修

- `BrowserFavicon.tsx:206` 孤悬注释仍在：rev8/rev9 已记录为「不单独开修复项」，留待收尾顺手删除，不阻断本轮。
- rev8 记录不修项（`faviconUrl`+ref 双份状态、`degraded`、probe 守卫、`currentSrc` 记账口径、无生产者的 menu `icon` 管道、`isUrlBookmarked` 每次重算等）状态未变，按既有理由不放行修复。

## 结论

- 需修复项：**0**（本轮零问题）
- rev9 唯一 low 已正确关闭且未引入新问题；R2（代码清理 A 组）可收尾。
- 说明：本轮以静态阅读 + 全仓检索判定（未跑测试套件），最终门禁由主代理执行。
