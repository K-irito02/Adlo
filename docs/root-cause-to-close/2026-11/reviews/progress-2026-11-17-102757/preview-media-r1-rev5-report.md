# 事项4「变更面板媒体/办公预览 + 浏览器兜底」R1 / rev5 定向复核报告

## 范围

- 定向复核：只核对 rev4 报告新增的 2 项 low（N1 回归保护缺口 / N2 重试守卫仅字符串覆盖）是否关闭，以及 rev4→rev5 是否引入新问题。
- 快照：`.review-diffs/manifest-rev5.md`（base `afd628c1fa59301ed71c3da683ea2277d977999b`）+ rev5 快照；对照工作区源码与 rev4 快照逐项比对。
- rev4→rev5 的本事项实际变更（其余媒体相关文件与 rev4 逐字节一致：`MediaPreview.tsx`、`MediaPreview.test.tsx`、`previewExternal.ts`(+test)、`PreviewExternalActions.tsx`、`cacheHelpers.ts`、`editorActionsHelpers.ts`、`DiffEditorSection.tsx`、`editorSlice.ts`）：
  - `adlo/frontend/src/app/stores/cacheHelpers.test.ts`（新增，16 行）
  - `adlo/frontend/src/app/features/preview/previewMediaWiring.test.ts`（+1 断言 +1 注释）
  - `adlo/frontend/src/app/stores/actions/__tests__/editorActionsHelpers.test.ts`（失败用例 +2 断言）
- 实跑范围（简报 §1 允许的单测文件级验证）：`vitest run` 上述 3 个测试文件 + `MediaPreview.test.tsx`，4 files / 37 tests 全绿（13:51，耗时 9.29s）。未启动 dev server / 浏览器，无端口占用；未执行任何 git 命令、未改源码。

## 上轮问题关闭情况

### rev4 N1-1 [low] helper 媒体三字段无断言 —— 已关闭

- `cacheHelpers.test.ts:5-15` 对 `clearedChangePreviewState()` 整体 `toEqual` 全字段补丁（含 `changePreviewMedia: null`、`changePreviewMediaLoading: false`、`changePreviewMediaError: null`）。
- 删除性推演：删掉 `cacheHelpers.ts:322-324` 任一媒体行，实际对象缺少该键（媒体字段期望值为 `null`/`false`，`toEqual` 不会像 `undefined` 那样忽略缺失键）→ 用例变红。清空补丁与 `gitSnapshotActions.ts:79/193/220/275/328`、`generalActions.ts:639` 共用同一 helper，回归保护成立。

### rev4 N1-2 [low] 媒体失败分支 loading 复位无断言 —— 已关闭

- `editorActionsHelpers.test.ts:898-902` 失败用例新增 `changePreviewMediaLoading === false` 与 `changePreviewLoading === false`。
- 删除性推演：入口 `editorActionsHelpers.ts:328` 先置 `changePreviewLoading: true`；删掉失败分支 `:384` 的 `changePreviewLoading: false` 后该值保持 `true`，`:902` 变红；`:385` 的 `changePreviewMediaLoading: false` 同理由 `:901` 守护。此分支即「变更面板列出但已删除/超限媒体」的高频路径，守卫用例与修复点一一对应。

### rev4 N2 [low] 重试「owner 为 null 不回退」仅字符串覆盖 —— 已关闭（text-level，按 rev4 建议的第二种方案）

- `previewMediaWiring.test.ts:24` 新增 `/selectedChangePreviewWorkspaceId === undefined/` 守卫断言，注释与最终代码一致（`DiffEditorSection.tsx:260-268`：`owner` 命中即返回，仅 `id === undefined` 才走 `onOpenChangePreview`）。
- 删除性推演：把 `DiffEditorSection.tsx:266` 改为 `if (!owner)`（即 owner 为 null 也回退）会移除该唯一文本命中（全文 `grep selectedChangePreviewWorkspaceId` 仅 `:266` 带 `=== undefined`）→ 用例变红，覆盖了 rev2 F1 / rev3 F2 的原始缺陷形态（工作区已移除时读当前工作区同名路径）。
- 残留（记录不修，与 rev4 建议一致）：该守卫仍是源码文本级断言，理论上「保留字面量但改变控制流」的改写仍可能漏检；若要更强保护，需按 rev4 建议把重试目标抽成纯函数并做 3 支单测。当前修复已使目标缺陷形态变红，属可接受成本。

## 新增发现

无。rev5 对本事项仅新增/加强测试断言与一处测试文件，未改生产源码；新增断言与实现逐行相符，用例标题与断言一致；实跑全绿，未发现新 critical/high/medium/low。

## 记录不修

- `cacheHelpers.test.ts` 中 `selectedChangePreviewPath/WorkspaceId`、`changePreview` 的 `undefined` 期望值在 `toEqual` 下不校验「键存在」（缺键与显式 `undefined` 等价）；本轮目标是媒体字段，媒体字段用 `null`/`false` 已被精确校验，未扩大断言强度。
- N2 守卫断言仍为文本级（见上），若后续改动重试分支建议改纯函数测试。
- rev4 已记录项继续有效：`owner === null` 时重试按钮可见但静默无动作；`previewMediaWiring.test.ts:27` 用例名「不可达的占位分支」措辞不精确；CSS `.adl-preview-external` 待主代理补 `getComputedStyle` 证据；`loadGitSnapshot`/`refreshGitSnapshot` 的 @writes 漏 preview 字段（base 已存在）。
- 本轮实跑使用 vitest 默认缓存，未新增源码树文件；未产生需清理的后台进程。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）；rev4 N1（两项）与 N2 均已关闭，rev5 未引入新问题。

需修复项：0
