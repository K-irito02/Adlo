# 编辑器自动保存：watcher 回声与保存竞态（2026-11-08）

> 来源：文件面板「新建后误报保存冲突」+「输入时短暂回退旧内容」两问题的根因排查与结构化修复。
> 关键实现：`adlo/frontend/src/app/stores/editorSavePipeline.ts`、`stores/actions/editorActions.ts`。

## 症状

- 新建文件后立即输入，偶发右下角「保存冲突」卡片，但没有任何外部程序修改该文件。
- 连续输入/换行时，编辑器偶尔瞬间回到换行前的旧状态，随后恢复。

## 根因

1. **watcher 回声被当成外部修改**：后端 `WorkspaceWatcher` 递归监听工作区，应用自身的新建/写入也会回传 `files-changed`。旧前端只按「路径命中选中文件 + 300ms 防抖脏标存在」立 `externalFileChange`，没有比较磁盘内容；新建回声约 400ms 到达，正好与脏标置位形成竞态。
2. **保存响应覆盖新草稿**：`saveFile` 在请求返回后无条件 `dropPendingEditorText` 并把 `fileContent` 覆盖为请求发出时的旧内容。用户在请求在途继续输入时，受控 CodeMirror `value` 会被 `@uiw/react-codemirror` 在 typing latch 结束后整体替换为旧值。

## 修复模型

- **草稿真相源**：`pendingEditorText`（按工作区+路径键控）是唯一草稿来源；`dirtyEditorPaths` 只是 300ms 防抖的 UI 灰点，不能拿来做同步判定。
- **按文件串行保存**：`enqueueEditorSave(key, task)` 保证同一文件后一次保存等待前一次落定；任务真正执行时再读暂存缓冲。
- **保存代际**：请求入队时推进 `saveSeq`；迟到的旧响应直接丢弃，不更新基线/mtime/脏标。清理（删除/切工作区/冲突裁决）时**推进**而不是删除代际，避免旧响应与新请求撞号。
- **自写回声识别**：`noteLocalWriteContent` 只存内容指纹（长度 + hash，不存全文）；`classifyDiskContent` 按「草稿相同 → 本地写入指纹相同 → 基线相同 → 其它」判为 `self-echo` / `unchanged` / `external`。
- **外部变更读盘分类**：watcher 批次只记录信号并调度 reconcile；reconcile 读磁盘后分类。保存前若存在新鲜 watcher 信号或外部旗，也先读盘复核。**external 判定时绝不把外部内容写进按 key 的文档缓存**，否则后续非选中 flush 会把外部内容误当基线而放行覆盖。
- **不写旧基线**：保存在途出现新草稿时保留草稿与脏标，只同步 mtime，不更新 `fileContent`；等到下一次保存成功且草稿未再变化，才推进基线。
- **打开保护**：`openFile` 仅在「目标文件自身仍有未落盘草稿 + flush 失败」时中止；其它文件失败不阻塞打开无草稿目标，避免全局卡死。

## 测试经验

- 用 fake timers + deferred promise 精确控制「保存在途」「读盘在途」窗口；断言「首写未落定前第二次写未起飞」才能真钉住串行化。
- 每条关键守卫做变异自检：删掉守卫用例必须变红。反例：只断言最终 `writes` 顺序的用例，删掉队列仍会绿。
- 控制器受控 value 的回退不靠肉眼：核对 `@uiw/react-codemirror` 的 typing latch + external dispatch 行为，并在 store 层断言 `fileContent` 不被旧响应覆盖。
- 跨工作区/非选中文件必须用按 key 的基线（文档缓存），不能用当前选中的 `fileContent`。

## 参考

- VS Code：`files.autoSave`（afterDelay 默认 1000ms）与保存冲突 Compare / Overwrite / Revert。
- Monaco：编辑器模型版本 / dirty 状态与保存版本分离。
- 本仓测试：`editorAutosaveRace.test.ts`、`editorSavePipeline.test.ts`、`workspaceFileOpsFlush.test.ts`。
