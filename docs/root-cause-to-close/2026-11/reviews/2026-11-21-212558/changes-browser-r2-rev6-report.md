# R2 定向复审报告 — changes-browser / rev6

- 基线：`b96a5747f4a2ab23fde6ddc8a9748a7cdefb87f7`
- 快照：`.review-diffs/*-rev6.diff`（仅 rev6 全量快照）
- 约束遵守：未运行 `git diff/log/show`，未改源码/配置，未跑测试；未启动 dev server / 浏览器（无端口占用）。

## 范围

只确认 rev5 的 1 条 low 已关闭（`browser-webview.css` 空态注释不再声称存在已删除的「标题」），并确认 rev6 未引入新的死代码/冗余/失实注释、未破坏既有零问题结论。不审 `docs/**`。

## 上轮问题关闭情况

- **R2-rev5 F1（CSS 注释残留「标题 +」）— 已关闭**。`browser-webview.css:424` 现为「分类内联空态：创建目录指导，水平居中（用户 2026-11-07 指定）」，不再提「标题」；`.adl-browser-category__empty-title` 规则已删，全仓（源码/测试/CSS）无该 class 与「标题 + 创建目录指导」文本残留。空态现在只渲染 `.adl-browser-category__empty-guide`（`BrowserCategorySection.tsx:92-114`），与注释一致。
- **rev6 未引入新问题**：
  - 本 scope 仅 `browser-webview.css` 变化（519 → 838 字节，差异即注释与 `.empty-title` 死规则删除）；其余 scope 文件 rev5/rev6 diff 字节数逐一相同（`StoreState.ts` 1499、`BrowserCategorySection.tsx` 2505 及其测试 1477、`useBrowserFolderReorder.ts(.test)`、`BrowserTreeEntry.tsx` 3911、历史保留/`registry`、刷新链路等）。
  - 未新增死 CSS/i18n/测试：`.adl-browser-category__empty` 仍被 workspace/userFolder 空态与 `browser-tree-dnd.css:52` 使用；`.adl-browser-category__empty-guide` 正常使用；`browserCategoryEmptyHistory` 仍由 `BrowserTreeEntry.tsx:200` 使用；`BrowserCategorySection.empty.test.tsx` 已无 history 空态用例与多余 mock。
  - 新增文件 `components/__tests__/ErrorToast.test.tsx` 属错误卡片 scope，不在本 scope。
  - rev5 已确认的零问题结论（空 history 分类不可达、StoreState JSDoc、历史保留读写两侧、刷新链路、`allTreeExpanded` 等）继续成立。

## 新增发现

无。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）

## 记录不修（不进主表）

- `.adl-browser-category__empty` 的 `flex-direction: column` 与 `gap: 2px` 在只剩单个 guide 子元素后无视觉作用；容器仍被 workspace/userFolder 复用，属微冗余 CSS，可留待样式清理。
- `StoreState.ts:288` / `useAppStartup.ts:113` 的「跳过 5s 新鲜期」仍可反向读成绕过新鲜期；实现为跳过新鲜期内的快照（精确表述见 `gitSnapshotActions.ts:455`），建议后续统一措辞。
- 前几轮记录不修项未变化：history 工具函数的不可达防御分支、`refreshAllChanges` 恒等 `targetWorkspaceIds`、`scheduleChangesFollowQuietly` 转发包装、`useChangesAutoRefresh` 隐藏时空转、`browserEntrySubEntriesUtils.test.tsx:71-76` 冗余用例、`gitSnapshotActions.test.ts:317` 旧 describe 名、`browserHistoryRetention.ts:9` 与手册同步（P5）、`HISTORY_RETENTION_DAYS` 导出等。
