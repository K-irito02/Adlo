# R1 审查报告 — 应用内自动更新（前端 / rev1）

- 仓库根：`E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/slot-2`
- 快照：`.review-diffs/*-rev1.diff`（manifest base `21ff184`，1 commit，62 files）
- 只读审查：未运行 `git diff/show/log`，未修改任何源码/配置，未启动 dev server/浏览器（**无占用端口，无后台进程**），未运行测试套件。
- 依据：`review-brief.md`、仓库根 `adlo/AGENTS.md`、`.agents/rules/review-judgements.md`、`docs/design-system/guidelines/accessibility.md`、ADR-0026/0027、`GLOSSARY.md`。

## 范围

前端（33 个文件）中与本轮「应用内自动更新」直接相关的部分，逐文件核对：

| 文件 | 快照 |
| --- | --- |
| `src/app/stores/slices/appUpdateSlice.ts`（新增） | `adlo_frontend_src_app_stores_slices_appUpdateSlice.ts-rev1.diff` |
| `src/app/stores/slices/notificationSlice.ts` | `..._notificationSlice.ts-rev1.diff` |
| `src/app/stores/persisted/registry.ts` / `entry.ts` | `..._registry.ts` / `..._entry.ts` |
| `src/app/features/update/UpdateNotificationCard.tsx`（新增） | `..._UpdateNotificationCard.tsx-rev1.diff` |
| `src/app/features/about/AboutSettings.tsx`、`aboutContent.ts` | `..._AboutSettings.tsx`、`..._aboutContent.ts` |
| `src/app/regions/TitleBarNotifications.tsx`、`src/app/components/NotificationCard.tsx` | 同名快照 |
| `src/app/hooks/useAppUpdateWatcher.ts`（新增）、`src/app/App.tsx` | 同名快照 |
| `src/tauri-bridge/tauri-update.ts`、`src/mock/mock-update.ts`、`src/httpBridge.ts`、`src/preview-bridge/index.ts`、`src/mock-bridge.ts`、`src/tauri-bridge/index.ts`、`src/shared/ipc/update.ts`、`src/shared/ipc/digital-life.ts` | 同名快照 |
| i18n `zh-CN|en-US/notification.ts`、`zh-CN/about.ts` | 同名快照 |
| `styles/components/notification-card.css`、`styles/components/loading-row.css`、`styles/regions/about-settings.css` | 同名快照 |
| `stores/actions/editorActions.ts` / `editorActionsHelpers.ts` / `sessionRestore.test.ts` / `slices/__tests__/appUpdateSlice.test.ts` | 同名快照 |

为判定行为语义，另读了只读源文件：`src/app/stores/persisted/{apply,persist,hydrate,entry}.ts`、`src/main.tsx`、`src/tauri-bridge/tauri-shared.ts`、`src/app/features/file-tree/CustomScrollArea.tsx`、`src/app/utils/relativeTime.ts`、`src/app/features/preview/openByMethod.ts`、`src-tauri/src/commands/update.rs`（后端契约，只用于核对前端消费语义）。

## 上轮问题关闭情况

本轮是更新 UI 的首次审查（rev1），无上轮项。

## 新增发现

### F1 [severity: critical] [category: 正确性] 所有更新源都失败时，前端把它显示成「已是最新」

- 位置：`adlo/frontend/src/app/stores/slices/appUpdateSlice.ts:113-127`（`if (!data.available || !data.version)` 分支）
- 描述：`AppUpdateCheckResult.error` 是「全部来源都失败」的唯一信号（`src/shared/ipc/update.ts:20-21`；Rust 侧 `src-tauri/src/commands/update.rs:69-70、84-85` 明确写着「命令本身不失败——前端据此决定静默还是提示失败」）。切片完全不读 `data.error`：只要 `result.ok` 且 `available === false`，就落到 `appUpdateStatus: 'idle'` + `appUpdateUpToDate: true` + `appUpdateError: null`。于是 Gitee/GitHub 双双不可达（大陆网络下是常见场景）时，关于页显示「已是最新 · 上次检查：刚刚」，自动检查与手动检查都不会露出任何失败，用户永远不会再去点更新。
- 证据：Rust `app_update_check` 的 `ResolveOutcome::Failed` 分支返回 `available:false, version:None, error:Some(...)`（`adlo/src-tauri/src/commands/update.rs:114-123`），永远不会走 `IpcResult::Err`；前端唯一消费 `data.error` 的地方不存在（全仓 grep `appUpdateError` 只有写入、无读取）。`appUpdateSlice.test.ts` 也没有 `error` 非空的用例，删掉任何修复都不会变红。
- 建议修复：
  1. 在 `data.available === false` 分支先判 `data.error`：非空 → `appUpdateStatus:'error'`、`appUpdateError:data.error`、`appUpdateUpToDate:false`（`lastCheckedAt` 仍落盘）；仅在 `data.error === null` 时才写「已是最新」。
  2. 补用例：`result({ available:false, version:null, notes:null, source:null, error:'gitee: timeout' })` → 断言 `status === 'error'`、`appUpdateError` 含 `timeout`、`appUpdateUpToDate === false`。

### F2 [severity: high] 「已下载待安装」卡片缺少 ADR-0027 强制要求的「点击即关闭应用并重启」提示

- 位置：`adlo/frontend/src/app/features/update/UpdateNotificationCard.tsx:125-157`；对照 `adlo/frontend/src/app/features/about/AboutSettings.tsx:211-213`
- 描述：ADR-0027 的接受理由建立在「没有拦截弹窗，但卡片文案承担告知」之上，原文要求**卡片**「改为笼统的提示文案并只提供一个「安装」按钮」，且「提示文案必须写明『点击后将立即关闭应用并自动重启』，不得弱化成『稍后重启生效』」（`docs/adr/0027-...md:5、16`）。实现里：`downloaded` 态的卡片仍是「发现新版本 + vX + 完整更新说明 + 安装按钮」，**没有任何重启/关闭提示**；唯一的提示 `updateReadyWithHint` 只在「关于」页渲染。而进入安装的主路径恰恰是「绿点 → 通知面板 → 卡片」，用户在这条主路径上完全看不到「点下去会立刻关应用」。
- 证据：`UpdateNotificationCard.tsx` 全文 160 行，无 `updateReadyWithHint`/无任何 `updateReady*` 引用；该键仅在 `AboutSettings.tsx:212` 使用。卡片头部在 `downloaded` 态仍渲染 `t.updateAvailableShort`（「发现新版本」），与 ADR「改为笼统的提示文案」不符。
- 建议修复：在卡片 `status === 'downloaded'` 分支渲染重启用提示（建议卡片专用、更强的文案：「点击「安装」后应用将立即关闭并自动重启」，与 ADR 措辞对齐；`updateReadyWithHint` 同步去掉弱化表述），并把卡片标题在 `downloaded`/`installing` 态改为「更新已下载 / 正在安装」。ADR 与本实现二选一同步（若确实决定不做卡片提示，必须显式修订 ADR-0027 并说明数据丢失风险由什么承担）。

### F3 [severity: medium] 下载失败 / 安装失败与「检查失败」共用同一状态与文案；`appUpdateError` 无处呈现，卡片 error 态是死胡同

- 位置：`appUpdateSlice.ts:193-201`（download 失败）、`:228-232`（install 失败）、`:105-110`（check 的 IPC 失败）；`AboutSettings.tsx:84-85、100-110`；`UpdateNotificationCard.tsx:129-157`
- 描述：三个动作的失败都写同一个 `appUpdateStatus:'error'` + `appUpdateError`，但：
  - 关于页 `switch` 的 `error` 分支恒返回 `t.aboutUpdateFailed`（「检查失败」）——下载失败/安装失败被标成「检查失败」，属错误文案；
  - 关于页按钮在 `error` 态显示「重试」，`handleUpdateAction` 落到 `checkAppUpdate({manual:true})`，即无论失败的是下载还是安装，都先重新联网检查一遍；
  - `appUpdateError` 全仓只写不读（grep 证实），真实错误信息永远不展示，用户拿不到可诊断信息；
  - 通知卡片在 `error` 态既不显示任何文字（`showActions` 只对 available/downloaded 出按钮，`error` 无分支），也不显示错误——一张只剩「发现新版本 vX + 说明 + 关闭」的卡，用户点完「下载」看不出发生了什么。
- 证据：`appUpdateSlice.ts:194-199`（download 失败只置 error）、`:230-232`（install 失败只置 error）；`AboutSettings.tsx:84-85` 单一文案；`UpdateNotificationCard.tsx` 129-157 三个 `status` 条件里没有 `error`。
- 建议修复：把「哪个动作失败」留在状态里（如 `appUpdateError: { operation: 'check'|'download'|'install'; message: string } | null`），关于页按 operation 出文案（检查失败/下载失败/安装失败 + message 摘要），卡片 `error` 态给出错误行 + 对应重试（下载失败 → 重新下载；安装失败 → 重新安装）。i18n 补 3 条失败文案。

### F4 [severity: medium] 更新消失后旧的更新卡片不清理（僵尸卡：`v—`、零动作）

- 位置：`appUpdateSlice.ts:113-127`（未清理 `type === 'update'` 通知）；`UpdateNotificationCard.tsx:68、106-116、129-157`；卡片身份见 `appUpdateSlice.ts:70、164-174`
- 描述：更新卡片与 store 的更新状态是两套生命周期：卡片只由 `check`（available 时）和 `download` 补建，却没有任何地方在「本次检查结果为已是最新」时回收它。一旦同一会话里先出现过 available 卡片、之后的检查返回 UpToDate（清单回滚、双源择优结果变化、或换源后版本更低），卡片仍留在面板中：`appUpdateVersion` 已被清空 → 徽标渲染成 `v—`，`appUpdateNotes` 为 null → 显示「本次更新没有提供说明」，`status === 'idle'` → 没有任何按钮。用户只能手动关掉这张「发现新版本 v—」的卡。
- 证据：`checkAppUpdate` 的 up-to-date 分支（113-127）只 `set` 状态，不遍历 `notifications`；对比 available 分支（158-174）与 `skipAppUpdateVersion`（242-269）都显式 `removeNotification`。卡片用 `version ?? '—'`（`UpdateNotificationCard.tsx:68`）与 `notes || t.updateNoNotes`（`:41-42`）兜底，正好把空状态渲染成一张看似正常的卡。
- 建议修复：up-to-date 分支里移除全部 `notification.type === 'update'` 的卡片（与 skip 分支同形）；补用例：先 check 得到 available 并生成卡片，再用 `available:false` 的桥接 check，断言 `notifications` 中无 update 卡片。

### F5 [severity: medium] `silentError` 的实质行为没有回归保护（删掉修复测试仍全绿）

- 位置：`adlo/frontend/src/app/stores/actions/editorActionsHelpers.ts:56、172-174、186-188、216-217、280-282、296-298`；测试 `stores/actions/__tests__/editorActionsHelpers.test.ts`、`stores/actions/sessionRestore.test.ts:113-121`
- 描述：本轮唯一的行为变更点是「会话恢复失败时不再弹全局错误卡」，但现有用例只断言 `restoreLastOpenedFile` 把 `{ silentError: true }` 传给了被 spy 的 `openFileForWorkspace`。真正的抑制逻辑在 `openFileGeneric` / `openMediaFileGeneric` 里，而 `editorActionsHelpers.test.ts` 已有现成的 `mockReportError(get)` 断言设施（`:60-64`、`:289`），却没有一条 `silentError: true` 用例。删除性推演：删掉 `editorActionsHelpers.ts` 里 4 处 `if (!config.silentError)`，`sessionRestore.test.ts` 与 `editorActionsHelpers.test.ts` 全部仍然通过。
- 证据：全仓 grep `silentError` 只命中 1 条测试断言，且是参数透传断言（`sessionRestore.test.ts:118`）。
- 建议修复：在 `editorActionsHelpers.test.ts` 补两条：`readFile` 返回 `{ok:false}` 与 `Promise.reject`，各带 `silentError: true`，断言 `reportError` **未**被调用、且 `fileOpenError?.path` 仍被置位（证明只抑制全局卡、不吞错误视图）；媒体链同理补一条。同一轮内也建议给新 UI 补最小渲染断言（`downloaded` 只出安装、`error` 出错误行），否则 F2/F3 的修复同样无法回归。

### F6 [severity: low] [category: 文档/设计] 折叠按钮同时用「随状态变化的 aria-label」和 `aria-expanded`

- 位置：`UpdateNotificationCard.tsx:100-109`
- 描述：`aria-label` 在 `t.updateExpandNotes` / `t.updateCollapseNotes` 之间切换，同时带 `aria-expanded={expanded}`。仓库设计规范明文禁止二者并用（`docs/design-system/guidelines/accessibility.md:12`：「Toggle buttons pick one state channel: a constant name paired with `aria-pressed`/`aria-expanded`, **or** a name that changes with the action and no state attribute. Never both」）。读屏会念成「收起更新说明 · 已折叠」这类自相矛盾的组合。
- 附带（同一组件）：根节点 `role="status"` 把可交互按钮与**下载进度**一起包进 live region（`:65`、`:113-123`），下载期间每次进度更新都会触发播报。
- 建议修复：保留 `aria-expanded` + 恒定名称（如「更新说明」，图标表达方向），删掉随状态变化的 `aria-label`；把 `role="status"` 收窄到单独的进度/状态行（或仅在 `downloading`/`installing` 行上 `aria-live="polite"`），不要把动作按钮放进去。

### F7 [severity: low] [category: 文档/设计] 注释与命名和实现不符（5 处，逐条可证伪）

- 位置与描述：
  1. `appUpdateSlice.ts:53`：「`manual` 只影响『失败是否可被用户看到』以外的节流无关行为」——句子自相矛盾；实现是 `manual` **只**影响「是否绕过跳过/24h 提示节流」（`:137`），与错误可见性无关（错误可见性根本不存在，见 F3）。
  2. `appUpdateSlice.ts:18`：「`lastPromptedVersion/At`：同日最多提示一次」——实现是 `checkedAt - lastPromptedAt < DAY_MS` 的 24h 滚动窗口（`:131-134`），不是「同日」。
  3. `useAppUpdateWatcher.ts:19`：「只有『关于』页的手动检查才展示错误」——自动检查失败同样置 `status:'error'`，关于页同样渲染「检查失败」+「重试」（`AboutSettings.tsx:84-85`）；该句与实现相反。
  4. `notification-card.css:116-118`：「动作行左「查看更新说明」、右「跳过 + 下载/安装」」——卡片已无「查看更新说明」按钮（同一轮 `UpdateNotificationCard.tsx:14-15` 的注释明说「说明页入口只在「关于」页提供，卡片里不再重复」），CSS 注释是旧布局残留。
  5. `httpBridge.ts:1300-1303`：「preview/mock bridges use the shared unsupported implementation」——实际是两套：`mock/mock-update.ts` 返回 `IpcErrorCode.INVOKE_ERROR` + 自定义英文串，httpBridge 用 `taskNotSupported`（`NOT_SUPPORTED`），并未共享。
- 附带命名问题（同属「名称不揭示用途」）：i18n key `updateDownloadAndInstall`（`zh-CN/notification.ts:16`、`en-US/notification.ts:16`）的取值只有「下载 / Download」，按钮行为也只是下载。key 名承诺了不存在的「并安装」，后续维护者极易把它接到 install 上。
- 建议修复：按实现改写 1/3/4/5；`DAY_MS` 注释改成「24 小时内最多提示一次」；i18n key 改名为 `updateDownload`（两语同步，含 `AboutSettings.tsx:188` / `UpdateNotificationCard.tsx:143` 两处引用）。

### F8 [severity: low] [category: 文档] i18n 文案缺陷：中文缺字、双语标点不一致

- 位置：`adlo/frontend/src/app/i18n/zh-CN/notification.ts:19`；`zh-CN/about.ts:8-9` vs `en-US/about.ts:8-9`
- 描述：
  1. `updateReadyWithHint: '更新已下载，安装后会自动重启，建议先保存或关闭当前进行工作'`——「当前进行工作」缺「中的」，用户可见病句（且该句同时不满足 ADR-0027 的措辞要求，见 F2）。
  2. 本轮把 `aboutTagline` / `aboutLicenseLine` 的中文句号去掉（`'基于 MIT 许可证发布'`），但英文仍保留句点（`'Released under the MIT License.'`）。两语同一视觉块标点风格不一致；这两处改动也与本功能无关（scope creep）。
- 证据：上述行；`UpdateNotificationCard.tsx:41` 的 `cleanNotes` 会主动剥掉说明尾部 `。`/`.`，说明项目确实有「短文案不带句末标点」的取向，但英文 side 没跟上。
- 建议修复：中文改为「…建议先保存或关闭当前进行中的工作」；`aboutTagline`/`aboutLicenseLine` 两语统一（要么都去句点，要么都保留）。

## 记录不修（不计入需修复）

| 项 | 位置 | 理由 |
| --- | --- | --- |
| 自动检查会把 `downloaded` 降级回 `available` | `appUpdateSlice.ts:93`（守卫不含 `downloaded`）、`:142-153` | 触发窗口是「开着应用 >24h 且下载后未安装」；ADR-0027 已明文声明「已下载」是易失状态，重下的代价只是带宽，可接受。若用户在意，可在守卫里对 `downloaded` 跳过自动检查 |
| `appUpdatePublishedAt` / `AppUpdateCheckResult.publishedAt` 无消费方 | `appUpdateSlice.ts:41、147`、`shared/ipc/update.ts:17-18` | 死字段，纯清理项；不影响行为 |
| `onInstalling`（`digital-life://app-update-installing`）四端实现但无订阅方 | `shared/ipc/update.ts:39`、`tauri-update.ts:19-22`、`mock-update.ts:24`、`httpBridge.ts:1310` | 后端仍在 emit（`commands/update.rs:195`）；前端无消费者，属未发布阶段可删的空包装。若保留，应接到「安装中」态或删掉整条通道 |
| `httpBridge` 里的 update stub 实际永不被消费 | `httpBridge.ts:1304-1311` | tauri 与 preview 都会覆盖它，属第二份 unsupported 实现；建议合并到一处（与 F7-5 同源） |
| 关于页「上次检查：」可能为空 | `AboutSettings.tsx:86-96` + `utils/relativeTime.ts:12-14` | `formatRelativeTime` 对未来时间戳返回 `''`（时钟漂移），调用方未回退；概率极低，可后续加 `|| t.relativeTimeJustNow` |
| 更新卡片不显示通知时间戳 | `NotificationCard.tsx:20-22` | 与其他通知卡的呈现差异，属用户定稿的卡片设计 |
| 折叠按钮 16×16 点击区 | `notification-card.css:243-258` | 项目目标 WCAG 2.1 AA（未含 2.5.8 target size）；与既有 18-20px 图标按钮同量级 |
| 原型页未登记 | `adlo/frontend/prototype/update-card/index.html` | `prototype/README.md` 未收录新原型；原型目录已有先例，属可选整理 |
| 8 条新 i18n 键未进 `keys.test.ts` 锁定 | `i18n/__tests__/keys.test.ts` | 该用例集只锁历史回归键，非强制；但 F2/F8 修文案后建议补一条双语存在性断言 |
| 跳过版本仍在关于页显示「发现新版本 + 下载」 | `appUpdateSlice.ts:142-153` + `AboutSettings.tsx:187-193` | GLOSSARY「跳过版本」定义为「不再提醒」，关于页属按需查看，不算提醒；用例 `appUpdateSlice.test.ts:122-131` 已把该语义钉死 |
| `openUrlByMethod` 后无条件 toast「已在 X 打开」 | `AboutSettings.tsx:112-124` | `openUrlByMethod` 返回 `void`，无法判定成功；同文件 `handleOpenLogs` 有 `opened.ok` 检查而这里没有。纯文案风险，可后面收敛 |

## 验证待补（不计入需修复，属流程门禁）

1. **CSS 级联真实渲染证据**（brief §5.7）：本轮新增 3 个 CSS 文件改动（`notification-card.css` 新增 230 行、`loading-row.css` 合并选择器、`about-settings.css` 新行），必须有 `node adlo/scripts/ui-probe.mjs` 在亮/暗两套主题下的 `getComputedStyle` 证据，至少覆盖：`.adl-update-card__notes-text` 的 `-webkit-line-clamp` 生效、`.adl-update-card__notes-shell.is-scrollable .adl-update-card__notes-scrollbar` 的 `opacity` 切换、`.adl-notif-dot` 的 `background` 解析为 `--success`、`.adl-update-card__line.adl-loading-row__text--shimmer` 的 `color: transparent` 生效。仅 CSS 文本/截图不算通过。
2. **跨端交接（backend/R2）**：`app_update_install` 先 `window.hide()` + 结束 sidecar，再调用 `install()`（`src-tauri/src/commands/update.rs:189-199`）。若 `install()` 返回错误，前端会收到 error 并置 `status:'error'`，但窗口已隐藏、sidecar 已死——这个错误永远没有可见机会，属后端时序问题，请 R2/主代理一并核。
3. **桌面 E2E 冒烟**：绿点/卡片/关于页行属桌面-only 交互（浏览器模式 `supported:false`），按 `desktop-e2e-wdio` 技能至少跑一次冒烟确认没改坏启动链路（`useAppUpdateWatcher` 挂在 `App`）。

## 结论

- 需修复项：**8**（critical 1 / high 1 / medium 3 / low 3）
- 一句话摘要：更新链路的前端骨架（切片状态机、四端桥接、持久化校验、计时器与订阅清理）整体干净，但**全部更新源失败被当成「已是最新」**（F1）让失败路径整体失效，且 ADR-0027 赖以成立的数据丢失告知在通知卡片上缺失（F2）——这两条必须本轮修掉；其余为失败态收口、卡片生命周期、测试有效性与注释/文案漂移。
