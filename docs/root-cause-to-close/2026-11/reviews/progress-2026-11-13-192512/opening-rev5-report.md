# 审查报告 — opening 定向复核 rev5（只核 rev4 的 2 项 low）

## 范围

- 快照：`.review-diffs/manifest-rev5.md`（base `e16d966`，46 文件），只看 `*-rev5.diff` + 工作区源码（未用 `git diff/log/show`，未改任何源码/git）。
- 本轮只读 3 个文件：
  - `adlo/frontend/src/app/stores/actions/editorActions.ts`（`saveFile` `:981-1215`、`saveDirtyEditors` `:1275-1324`、`shouldPreflight` `:1077-1085`、`baselineContentForTarget` `:188-205`、`openFileOutsideWorkspaces` `:587-642`）
  - `adlo/frontend/src/app/stores/actions/externalWorkspace.ts`（注释 `:15-17`）
  - `adlo/frontend/src/app/stores/actions/__tests__/externalWorkspaceOpen.test.ts`（新用例 `:178-202`）
- 判定所需的既有行为仅读了 `shared/workspacePathMatch.ts:11-27`（`byPath` 的比较口径）与 `stores/slices/workspaceSlice.ts:104-109`（`setRecentWorkspaces` 整体替换）。
- **未运行任何测试**（未跑 vitest / check:changed）；结论为源码逐行推演 + 删除性推演，最终门禁由主代理执行。

## 上轮问题关闭情况（逐条）

| # | rev4 问题 | 结论 | 依据 |
| --- | --- | --- | --- |
| 1 | `workspaceId` 优先级缺失败用例（`externalWorkspaceOpen.test.ts:153-176` 删 `{workspaceId}` 仍绿） | **未关闭** | 新用例 `:178-202` **仍然不在歧义路径上**：`openFileOutsideWorkspaces` 把隐藏外部条目**追加**到 `recentWorkspaces`（`editorActions.ts:627`），测试随后又**追加**可见工作区（`test:197`）→ 数组序为 `[ws-1(/repo), external-E:/Shared, ws-shared(E:/Shared)]`。删掉 `saveFile` 的 `requestedWsId` 优先级或 `saveDirtyEditors` 的 `{ workspaceId }` 后，`byPath('E:/Shared')`（`:1011-1015` 的 `find` 先按数组序）**先命中外部条目**，得到与修复版本完全相同的 `id/key/path` → 断言逐条不变、用例仍绿。详见 F1。 |
| 2 | `externalWorkspace.ts` 注释与 `shouldPreflight` 不一致 | **部分关闭** | 指定句「基线缺失且没有外部旗/watch 信号时按草稿优先直接落盘（有信号时仍会读盘比对）」现与 `shouldPreflight`（`editorActions.ts:1083-1084`）**一致**：`!flag && !signal && baseline===undefined`（且 `targetIsExternal`）→ 不预检；任一 signal → 预检。但同一句前半「选中且文档缓存仍持有基线时」仍未修（rev4 已列的两处之一），实际条件是 `targetIsExternal && baseline !== undefined`，不要求「选中」，且选中时基线来自 `fileContent` 而非文档缓存；「并走冲突卡片」也只在 `classifyDiskContent` 判 `external`（或读盘失败）时发生。详见 F2。 |

## 新增发现

### F1 [severity: low] [category: 正确性]（测试有效性，rev4 F1 未真正关闭）

- 位置：`adlo/frontend/src/app/stores/actions/__tests__/externalWorkspaceOpen.test.ts:178-202`（关键 `:184`、`:197`、`:200-201`）；对应实现 `editorActions.ts:1011-1015`（`byPath`）、`:1026-1034`（优先级链）、`:1301-1305`（`saveDirtyEditors` 传参）
- 描述：新用例名义上覆盖「同路径目录成为可见工作区后仍按 `workspaceId` 定向」，但实际状态并没有制造歧义：隐藏外部条目仍在 `recentWorkspaces` 里且排在可见工作区**之前**，`byPath` 按数组序 `find` 会先命中它。于是删掉任一修复都不影响解析结果，用例不能变红；且被断言的落盘路径 `'E:/Shared'` 对两条分支都相同，断言本身也不具备区分力。用例注释 `:184`「按路径解析会命中真实工作区」在本用例的实际状态下是**不成立的事实断言**。
- 证据（删除性推演，逐条）：
  1. **删 `editorActions.ts:1305` 的 `{ workspaceId: effectiveWsId }`**（保留 `targetPath='E:/Shared'`）→ `saveDirtyEditors` 已先算出 `externalRoot='E:/Shared'`（`:1288`）与 `ws=external 条目`（`:1287`），`saveFile('notes.md','E:/Shared')`：`isSelectedTarget` 为真（`targetPath === selectedFilePath`），`byPath('E:/Shared')` 命中数组第 2 项外部条目（`:1012`，`sameWorkspacePath('E:/Shared','E:/Shared')` 为真）→ `targetWs.id` 仍是 external id → `key=external-id:notes.md` 命中草稿 → 预检 `baseline='# outside\n'` 与磁盘相同 → `unchanged` → 写入 → `pending` 被消费 → `saved:1, failed:0`，`updateFileContent('notes.md','draft','E:/Shared')`。**用例仍绿**。
  2. **删 `:1027` 的 `(requestedWsId ? byId(requestedWsId) : undefined)`（改成 byPath 优先）** → 同上，`workspacePath` 由 `saveDirtyEditors` 传入，`byPath` 仍先命中外部条目。**用例仍绿**。
  3. **删 `saveDirtyEditors` 的 `externalRoot` 取用（`:1301`）仅留 `ws.path`** → 本用例 `ws` 就是外部条目，`ws.path='E:/Shared'`，仍绿。
  4. 该用例在 rev3 代码（无 `workspaceId` 参数、`allWorkspaces.find(w => w.path === workspacePath)`）下同样会通过，说明它不构成任何回归保护。
  5. 真正能变红的形态（供修复参考）：必须在 `saveDirtyEditors` 之前**让隐藏外部条目离开 `recentWorkspaces`**、只保留同路径可见工作区（这正是生产现实：`setRecentWorkspaces` 整体替换，`workspaceSlice.ts:104-105`，隐藏条目只活在 `externalFileRoots`）。此时删 `{ workspaceId }` → `byPath` 命中 `ws-shared` → `key=ws-shared:notes.md` 无草稿 → `intendedPending` 为真（`:1042-1044`，选中文件 `notes.md` 且选中所属为 external）→ `:1060-1062` 返回 `false` → `failed:1, saved:0` 且 `updateFileContent` 不被调用 → 断言红。
- 建议修复（二选一，均保持公共入口）：
  - 在 `test:197` 处把 `recentWorkspaces` 替换为「去掉所有 `isExternalWorkspaceId` 条目 + 加入 `visible`」，即 `store.setState({ recentWorkspaces: [...(store.getState().recentWorkspaces ?? []).filter(w => !isExternalWorkspaceId(w.id)), visible] })`；并断言 `updateFileContent` 调用一次、`saveDirtyEditors()` 返回 `{saved:1, failed:0}`。
  - 或保留隐藏条目但把 `visible` 插到数组**首位**，使 `byPath` 先命中 `ws-shared`（同样能变红）。
  - 同时把 `:184` 注释改为可证事实（例如「隐藏条目被列表刷新清掉后，按路径会命中同路径可见工作区」）。

### F2 [severity: low] [category: 文档]（注释仍与 `shouldPreflight` 不完全一致）

- 位置：`adlo/frontend/src/app/stores/actions/externalWorkspace.ts:15-17`
- 描述：现文本「…选中且文档缓存仍持有基线时，保存前会读盘比对并走冲突卡片；基线缺失且没有外部旗/watch 信号时按草稿优先直接落盘（有信号时仍会读盘比对）」——后半句已对齐（见上轮表格第 2 条）；前半句仍不成立：
  1. 预检条件 `targetIsExternal && baseline !== undefined`（`editorActions.ts:1083-1084`）**不要求「选中」**：非选中但文档缓存仍有基线的外部文件同样预检（`baselineContentForTarget` `:194-204` 的缓存回退分支）。
  2. 目标「选中」时基线取自 `get().fileContent`（`:197-203`），**不读文档缓存**；「文档缓存仍持有基线」只描述非选中分支。
  3. 「并走冲突卡片」并非必然：只有 `classifyDiskContent` 判 `'external'`（`editorSavePipeline.ts:134-137`）或读盘失败时才推卡（`editorActions.ts:1103-1129`）；磁盘与基线一致时仅继续落盘。
- 证据：上述行号逐条可对；该句是注释中的行为断言，非风格问题。
- 建议修复：改为「有（选中文件的当前正文或该键文档缓存中的）基线时，保存前读盘比对，磁盘被外部改动才走冲突卡片；基线缺失且无外部旗/watch 信号时按草稿优先直接落盘（有信号时仍读盘比对）」。

## 记录不修

1. **新用例的外部 id 文档缓存未在 `afterEach` 清理**（只清 `'ws-1'`，`test:97`）：缓存键按外部根哈希区分，当前无其它用例复用 `E:/Shared` 等根，暂无跨用例影响；属测试卫生，记录。
2. **`recentWorkspaces` 条目与 `externalFileRoots` 双写**（`editorActions.ts:639`）：本轮未改动，rev4 已核（两条腿一致），不重复展开。

## 已核对为正确的部分

- `shouldPreflight` 的 negative 分支与「基线缺失时直接落盘」一致：`targetIsExternal && baseline===undefined && !flag && !signal` → 不预检；`force` 仍在其外（`:1085`）。
- 新用例的预检本身稳定：pending `'draft'`、磁盘 `'# outside\n'`、基线同磁盘 → `unchanged`，不会误推冲突卡导致 flaky。
- 新用例无 `as any` / `as unknown as`，`updateFileContent` 断言参数与实现 `:1137-1141`（`bridgeWsPath` = `workspacePath`）一致。
- `saveDirtyEditors` 的 `global` 键仍映射当前工作区（`:1304`），无新增漂移。

## 需实跑才能判定

- 无。第 1 项的删除性推演依赖两处确定性的数组顺序（`:627` 追加、`test:197` 追加）与 `Array.prototype.find` 顺序语义，无需实跑；未运行 vitest。

## 结论

- 需修复项：2（critical 0 / high 0 / medium 0 / low 2）
  - F1（low，测试有效性）：rev4 F1 **未关闭**——新用例仍在隐藏外部条目排于可见工作区之前的非歧义状态，删 `{workspaceId}` / 删 `requestedWsId` 优先级均不变红；注释 `:184` 断言不成立。
  - F2（low，文档）：`externalWorkspace.ts:15-17` 指定句已修好，但前半「选中且文档缓存仍持有基线时…并走冲突卡片」仍与 `shouldPreflight` 不一致。
- 未发现这两个 low 之外的新问题（无 critical/high/medium）。
- **本轮零问题？否**（2 条 low，均为 rev4 项目的未完全关闭，非新引入）。
