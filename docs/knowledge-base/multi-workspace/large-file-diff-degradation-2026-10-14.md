# 超大变更文件差异渲染：挂载成本与降级策略（2026-10-14）

## 背景

变更面板打开一个 **5.6MB / 11.5k 行** 的删除型变更文件（HEAD 有内容、工作区已删）时：

- 差异视图最小化→还原时整窗黑屏、数秒后才恢复；点击界面无响应；
- 最大化仍按小窗尺寸渲染、还原被裁剪，数秒后才纠正；
- 拖拽面板边缘、切回该面板均卡顿。

## 根因（日志实证，非推断）

挂载埋点结论（`[ADL-DEBUG]` 临时埋点，已删）：

```
mount inline heavy=true origLen=5646505 modLen=0 lines=1 chunks=1
  stateMs=0  viewMs=1334  totalMs=1464  foldPoll=skipped
```

- **`new EditorView` 一项就占 1.3~1.5s**（`stateMs=0`）：`@codemirror/merge` 的 inline 统一视图对 5.6MB 的 `original` 构造非虚拟化 widget DOM（11.5k 行），阻塞主线程；小文件对照仅 8~36ms。
- **门缺口**：重型门只看 `currentContent.length`。删除型 `current=''` → 门永不触发 → 巨型 `base` 无门直渲染。修复取 `max(base, current)`。
- **后台轮询风暴**：`useFoldMarkerAutoHide` 挂载后无条件 `100ms × 60`（整 6 秒）`forceParsing(整篇, 1500ms)` + fold-gutter 重配；plaintext 下无解析器→标记永不出现，纯无用功。
- **陈旧尺寸**：编辑器只在挂载与开关行号/换行时 `requestMeasure()`，从不监听容器尺寸 → 窗口最大化/还原按旧尺寸渲染。
- **错误连带**：`openChangePreviewGeneric` 失败分支保留旧预览，切到大文件失败后内容区仍是上一个文件、门也出不来（"被侵占"）。
- **选中时序**：请求开始即切 `selected`（preview 滞后）→ 跨工作区"大切小"时门 key（新工作区 + 旧内容路径）错配，闪一次门。

## 修复要点

| 问题 | 处理 |
|------|------|
| 门缺口 | 门与判定同取 `max(base,current) > 1M 字符`（`heavyChangePreviewLength`/`isHeavyDiffContent`） |
| 挂载阻塞 | 确认后**不挂 MergeView**，改 plain `CodeEditor`（虚拟化只挂可视行）；删除型展 base、新增型展 current、双侧重型双 pane |
| 轮询风暴 | `useFoldMarkerAutoHide` 加 `disabled`；diff viewer 重型传 `isHeavy`，`CodeEditor` 按 `language==='plaintext'` 自动禁用 |
| 陈旧尺寸 | 容器 `ResizeObserver → requestMeasure()`，回调用 rAF 节流（拖拽不风暴） |
| 失败连带 | 失败是终态：清 `changePreview`，不回退旧内容（与 `openFileGeneric` 对齐） |
| 闪门 | 选中改**就绪才切换**；后台刷新加 `pendingChangePreviewPath` 哨兵让路 |
| 后端门 | 变更预览 current/base 上限 1MB→8MB（与开文件对齐），双端（Rust + preview-service）一致 |

## 可复用经验

1. **大文档性能先量再改**：把挂载/阶段耗时打点（`stateMs`/`viewMs`/`totalMs`）比盲改一堆选项更快定位。本次关字符标记/gutter/语法高亮等一堆选项都**没**解决，真凶是 `new EditorView` 本身。
2. **删除型变更的 `current` 为空**：任何按 `currentContent.length` 做的门都会漏掉巨型 `base`。判据必须双侧取大。
3. **VS Code 范式**：>30MB/300K 行关 tokenization/wrapping/folding，附"Forcefully Enable Features"手动开回。本项目的"确认门 + 仍然打开 + 简化渲染"同构，是全行业通用做法（GitHub 大 diff 默认折叠、Monaco `maxComputationTime` 熔断、JetBrains 轻量模式）。
4. **`@codemirror/merge` 的大文档杠杆**：`highlightChanges`（默认全量字符标记）、`mergeControls`（每 chunk 按钮）、`syntaxHighlightDeletions`（默认开）、`gutter`（每变更行标记）、`diffConfig.scanLimit/timeout`（同步计算）。只读预览里 `mergeControls` 落不了盘，是纯成本。
5. **自定义 hook 的隐式轮询**：`useFoldMarkerAutoHide` 这类"挂载即起轮询"的 hook，在被复用到新场景（重型 plain）时必须显式关闭，否则旧优化在主路径上失效（审查发现）。
6. **"就绪才切换"的连带**：把 selected 从"请求开始"挪到"终态"会改变所有读 selected 的旁路（如 `fetchGitStatus` 刷新）语义，需同步加在途哨兵，否则点击被后台刷新静默作废。

## 相关

- 后端上限：`crates/workspace/src/lib.rs`（`DEFAULT_MAX_TEXT_FILE_BYTES`）、`preview.rs`、`git/git_helpers.rs`；浏览器 `dev/previewWorkspaceService/git.ts`。
- 前端门：`regions/right-panel/heavyPreviewLimits.ts`；渲染分支 `panels/DiffEditorSection.tsx`。
