# push-design R2（rev6 定向复审）— 报告

## 范围

只读 rev6 全量快照（`.review-diffs/*-rev6.diff`），并对照工作区源码；未运行 `git diff/log/show`，未改源码/配置，未跑测试，未启动 dev server / 浏览器。

本轮只确认 rev5 的 3 条 low 是否关闭，并检查 rev6 是否引入新的死代码/冗余/假绿。核对文件：`gitFileOpsActions.ts`、`workspaceSlice.ts`、`WorkspaceChangesActions.test.tsx`、`components/__tests__/ErrorToast.test.tsx`、`ErrorToast.tsx`、`button-semantic-standard.test.ts`、`composer-core.css`、`errorToastSlice.ts`，以及 rev5 已确认的 `WorkspaceChangesActions.ts` / `PushPreflightDialog` / `gitFileOpsActions.test.ts` 结论。`docs/**`、`prototype/**` 不在 R2 范围。

## 上轮问题关闭情况

- **rev5 L1（“行内按钮”失实注释）— 已关闭**：`gitFileOpsActions.ts:193` 已改为“同一工作区只允许一个远端操作在跑：**侧栏菜单与错误卡「重试」**共享此守卫”；`workspaceSlice.ts:65-67` 已改为“右下角错误卡片的「重试」…并与**侧栏菜单**互斥”。grep 全仓 `行内按钮` 在 store 目录无命中；当前 UI 确实只有菜单项与错误卡重试触发 push/pull。
- **rev5 L2（分支重试 false 契约测试）— 已关闭**：`WorkspaceChangesActions.test.tsx:439-445` 现在保存并断言 `runResult` 为 **false**，且仍锁刷新/查分支各两次、push 使用重读的 ahead=2；`components/__tests__/ErrorToast.test.tsx:285-309` 新增“action 返回 false 不调用 onDismiss、返回 true 才 onDismiss('e1')”用例，第二次点击也覆盖了 false 之后按钮重新可用。实现与 `ErrorToastAction` 契约（true=处理成功可关闭；false 不自动关闭；成功由 `git:push:<id>` 精确 scope 清理）一致。
- **rev5 L3（hover 外观值）— 已关闭**：`button-semantic-standard.test.ts:58-62` 取 hover scoped 规则并断言 `--btn-bg: var(--bg-hover);`；基础 scoped 规则的 `--btn-bg/--btn-fg/--btn-bd`、`border: none` 与无直接 `background`/`color` 断言仍在（`:52-57`）。
- **精确 scope / 无 prefix — 未被 rev6 破坏**：`errorToastSlice.ts:71-72` 仍为单 scope 签名，`232-236` 为 `t.scope !== scope`；`gitFileOpsActions.ts:220-221/262-263` 仍按 `git:push:<id>` / `git:pull:<id>` 精确清理；`gitFileOpsActions.test.ts:241/278` 仍断言精确 scope。push 失败与分支失败共用同一精确 scope，其它工作区靠定长 id + 精确过滤隔离，原前缀需求不存在。
- **R1 F1–F7 / R2 N1、N2、N3 — 未被 rev6 破坏**：rev6 的改动只有两处注释与三个测试文件（新增 ErrorToast 用例、分支重试用例断言、`button-semantic` 的 hover 值断言）；`composer-core.css` 的 scoped 自定义属性规则、`useDialogFocusTrap`、`gitOpsBusy`、summary/neutral-soft、level/ahead=0/取消等均未变，既有零问题结论保持。

## 新增发现

无（未发现 rev6 引入的新死代码/冗余防御/假绿测试/失实注释）。

## 记录不修

- **分支重试用例未显式锁“await beginPush()”的时序**：新用例锁了 `run()` 返回 false 与 beginPush 的最终效果；把实现改成 `void beginPush(); return false;`（不等待）仍可能通过（差异只在卡片按钮的 busy 持续时长）。属可选加固，不影响本轮验收（用户要求的是 false 契约与 ErrorToast 行为）。
- **hover scoped 规则未做直接 `background:`/`color:` 负向断言**：当前 hover 规则只设 `--btn-bg`；若未来在 hover 里加直接声明，现有测试只锁值不会发现。与 base 规则的负向断言不同，属可选补强。
- **历史记录仍在**：`localGitBusy` 与 `gitOpsBusy` 对 push/pull 的重复（可选精简）；`ConfirmDialog` 的 `tone` primary/warning/success 与 `warning-soft`/`success-soft` 无调用方但事项 8 要求保留；`--btn-bd` 与 `border: none` 的重复（验收口径保留）；`gitFileOpsActions.test` 重试 harness 的 busy map 是 no-op；“重试不被自身守卫拦截”仍靠实现推演；`useDialogFocusTrap` 在 busy 全 disabled 时 `focusables.length===0`（预存边界）；`button.css`/`themes.css` 的“已有实心按钮”注释在 prompt 场景略有歧义。
- **诊断日志**：rev6 未新增 console/debug；`copyToClipboard` warn 为既有代码。
- **文档/原型**：`docs/**`、`prototype/*.html` 不在 R2 范围。
- **进程/端口**：未启动任何服务，未跑测试。

## 结论

- 需修复项：0（本轮零问题）
