# R1 审查报告 — 应用内自动更新（前端 / rev2）

- 仓库根：`E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/slot-2`
- 快照：`.review-diffs/*-rev2.diff`（manifest base `21ff184`，1 commit，62 files；前端 33 文件）
- 只读审查：未运行 `git diff/show/log`，未修改任何源码/配置，只写了本报告。未启动 dev server / 浏览器 / headless Chrome（**未占用任何端口，无后台进程**），未运行测试套件（判断测试有效性用删除性推演）。
- 依据：`review-brief.md`、仓库根与 `adlo/AGENTS.md`、`.agents/rules/review-judgements.md`、`docs/design-system/guidelines/accessibility.md`、ADR-0026 / ADR-0027、`GLOSSARY.md`。
- 本轮实际变更面：与 rev1 快照逐文件对照，只有两个文件内容变化 —— `appUpdateSlice.ts`（新增 `data.error` 分支、已是最新时清卡）与 `appUpdateSlice.test.ts`（新增 1 条用例）。其余前端文件（卡片、关于页、四端桥接、i18n、CSS、watcher、persistence、editorActions）与 rev1 内容一致。

> **快照 / 磁盘不一致（流程注记，不计入需修复）**
> `docs/adr/0027-...md` 磁盘 mtime `14:42:49`，晚于本轮快照生成时间 `14:41:54`；快照里该 ADR 是新文件 20 行，磁盘现在是 29 行，多出「修订（2026-11-18，用户验收后）」一节（把「点击即关闭并重启」的告知从卡片移到关于页等）。本节是 F2「有据保留」的唯一书面依据，我按磁盘版判断；**下一轮快照必须包含它**，否则 ADR 与实现的权威关系在快照上是打架的。

## 范围

| 文件 | 复核结论 |
| --- | --- |
| `src/app/stores/slices/appUpdateSlice.ts`（新） | **本轮变更**：`:113-124` error 分支、`:137-141` 清僵尸卡 |
| `src/app/stores/slices/__tests__/appUpdateSlice.test.ts`（新） | **本轮变更**：`:193-213`「所有来源都不可用」 |
| `src/app/features/update/UpdateNotificationCard.tsx`（新） | 未变（行号与 rev1 相同） |
| `src/app/features/about/AboutSettings.tsx` / `aboutContent.ts` | 未变 |
| `src/app/hooks/useAppUpdateWatcher.ts` / `src/app/App.tsx` | 未变 |
| `stores/slices/notificationSlice.ts`、`regions/TitleBarNotifications.tsx`、`components/NotificationCard.tsx` | 未变 |
| `stores/persisted/{registry,entry}.ts`、`StoreState.ts`、`slicedStore.ts` | 未变 |
| `stores/actions/{editorActions,editorActionsHelpers}.ts`、`sessionRestore.test.ts` | 未变 |
| `shared/ipc/{update,digital-life}.ts`、`tauri-bridge/*`、`preview-bridge/*`、`mock-bridge.ts`、`mock/mock-update.ts`、`httpBridge.ts` | 未变 |
| i18n `zh-CN|en-US/notification.ts`、`zh-CN/about.ts` | 未变 |
| `styles/components/{notification-card,loading-row}.css`、`styles/regions/about-settings.css` | 未变 |
| `frontend/package.json`（`0.2.0`） | 与 `adlo/package.json`、`src-tauri/tauri.conf.json` 三处一致，`currentVersion` 与壳层同源成立 |

## 上轮问题关闭情况

| 项 | 结论 | 依据 |
| --- | --- | --- |
| **F1（critical）全源失败被当成「已是最新」** | **已闭合** | `appUpdateSlice.ts:113-124` 在 `available === false` 之前先判 `data.error`，非空即 `status:'error'` + `appUpdateError:data.error` + `upToDate:false`（`lastCheckedAt` 仍经 `persistField` 落盘）；用例 `appUpdateSlice.test.ts:193-213` 断言 `status === 'error'`、`appUpdateError` 含 `timeout`、`appUpdateUpToDate === false`。删除性推演：删掉 `:115-124` 整段后 `available:false` 会落到 `:125` 的 idle 分支（`upToDate:true`），该用例在第一条断言即变红 —— 真回归保护。 |
| **F2（high）卡片缺 ADR-0027 的「点击即关闭并重启」提示** | **已闭合（有据保留，用户决定）** | 用户 2026-11-18 明确要求把该风险提示从卡片移到关于页；ADR-0027 磁盘版「修订」节已把该约束显式移交关于页，并限定卡片只保留版本、说明与动作按钮。关于页 `AboutSettings.tsx:211-213` 在 `downloaded` 态渲染 `updateReadyWithHint`。保留成立。**残余（已接受，不计入）**：从「绿点 → 面板 → 卡片 → 安装」这条主路径看不到任何风险提示，只有进关于页才看得到；「安装后会自动重启」比 ADR 原文「点击后将立即关闭应用并自动重启」弱一档，但该措辞就是用户口述的，ADR 修订亦逐字引用，不再要求改。 |
| **F3（medium）下载/安装失败与检查失败共用状态与文案，`appUpdateError` 无处呈现** | **未闭合** | 见 F1（本轮编号 N1） |
| **F4（medium）僵尸更新卡** | **代码已闭合，回归用例缺失** | `appUpdateSlice.ts:137-141` 在「已是最新」分支遍历并 `removeNotification` 掉全部 `type === 'update'` 卡（配合 `:129-132` 清空 version/notes/source，`v—` 与空动作行的成因已消失）。但**没有任何用例覆盖**：删掉 `:137-141` 后 `appUpdateSlice.test.ts` 全绿（现存用例要么事先没有卡，要么走 available 分支）。补测要求见 F2（本轮编号 N2）。 |
| **F5（medium）`silentError` 无回归保护** | **未闭合** | `sessionRestore.test.ts:113-121` 仍只断言 `openFileForWorkspace` 收到了 `{ silentError: true }`（参数透传），真正抑制全局错误卡的四处守卫在 `editorActionsHelpers.ts:172-174、186-188、280-282、296-298`，`editorActionsHelpers.test.ts` 本轮未改、无 `silentError` 用例。删除性推演：删掉这 4 个 `if (!config.silentError)` 后两套测试仍全绿。 |
| **F6（low）折叠按钮 `aria-expanded` + 随状态变化的 `aria-label`** | **未闭合** | `UpdateNotificationCard.tsx:105-106` 仍是两者并用；`role="status"`（`:65`）仍把动作按钮、关闭按钮与下载进度一起包进 live region。 |
| **F7（low）注释/命名与实现不符（5 处）** | **未闭合（5/5 全在）** | 见 F3（本轮编号 N3） |
| **F8（low）中文缺字、双语标点不一致** | **未闭合** | `zh-CN/notification.ts:19` 仍为「当前进行工作」；`zh-CN/about.ts:8-9` 已去句点，`en-US/about.ts:8-9` 仍带 `.`。 |

上轮「记录不修」各项本轮复核后仍成立（`available` 覆盖 `downloaded`、`appUpdatePublishedAt` 无消费方、`onInstalling` 无订阅方、httpBridge 死 stub、关于页相对时间为空、通知卡无时间戳、16×16 点击区、原型未登记、i18n keys 锁、跳过版本在关于页仍显示、`openUrlByMethod` 后无条件 toast）——不重复展开，本轮无新反证。

## 新增发现

> 编号 N1/N2/N3 对应上表未闭合项，不重复计数。

### N1 [severity: medium] [category: 正确性/设计] 失败态仍未收口：三种失败同一 `error`，文案恒为「检查失败」，错误信息不展示，卡片 error 态是零动作死胡同

- 位置：`adlo/frontend/src/app/stores/slices/appUpdateSlice.ts:102-111`（check IPC 失败）、`:115-124`（全源失败）、`:213-217`（下载失败）、`:247`（安装失败）；`adlo/frontend/src/app/features/about/AboutSettings.tsx:67-68、83-93、187-193`；`adlo/frontend/src/app/features/update/UpdateNotificationCard.tsx:62、129-157`
- 描述：三种动作的失败都写同一个 `appUpdateStatus:'error'` + `appUpdateError`，于是
  1. 关于页 `switch` 的 `error` 分支恒返回 `t.aboutUpdateFailed`（「检查失败」）——下载失败、安装失败都被标成「检查失败」（`:67-68`）；
  2. 关于页按钮在 `error` 态显示「重试」，`handleUpdateAction` 落到 `checkAppUpdate({ manual: true })`（`:83-93`）——不管失败的是下载还是安装，都先重新联网检查一遍；
  3. `appUpdateError` 仍是**只写不读**（全仓 grep：仅 `appUpdateSlice.ts` 写入 + 测试断言），真实错误信息永不展示，用户拿不到可诊断信息；
  4. 通知卡片的 `error` 态仍无任何分支：`showActions = status !== 'installing'`（`:62`）会照常渲染动作行容器，但 `available` / `downloaded` 两个条件都不匹配（`:138-160`），于是渲染出一个**空动作行**；卡片只剩「发现新版本 vX + 说明 + 关闭」。
- **本轮 F1 修复带来的新暴露面**：`data.error` 分支（`:116-122`）只改状态，不清 `appUpdateVersion/appUpdateNotes`，也不清已有卡片。场景：先检查到 v0.2.0 并生成卡片，24h 后再检查时 Gitee/GitHub 双双不可达 → `status:'error'`、`appUpdateVersion` 仍是 `0.2.0`、卡片仍在，而卡片此刻零动作；用户若从卡片入手，将完全无法重试（只能关掉卡、再去关于页点「重试」，而关于页还写着「检查失败」）。这就是 rev1 F4 的僵尸卡症状在 error 路径上的复现，根因同在「error 态没有动作与文案模型」。
- 证据：`AboutSettings.tsx:67-68`（error → `t.aboutUpdateFailed`）、`:83-93`（重试 → check）；`UpdateNotificationCard.tsx:138-160`（无 `status === 'error'`）；`appUpdateSlice.ts:116-122`（error 分支不清版本字段、不回收卡片）。
- 建议修复（按动作收口，最小改动）：
  1. 把错误改成携带来源：`appUpdateError: { operation: 'check' | 'download' | 'install'; message: string } | null`；
  2. 关于页按 operation 出文案（检查失败 / 下载失败 / 安装失败 + `message` 摘要），「重试」按 operation 分派（下载失败 → `downloadAppUpdate()`；安装失败 → `installAppUpdate()`；检查失败 → `checkAppUpdate({manual:true})`）；
  3. 卡片 `error` 态补一行错误文案 + 对应重试按钮（`error` 且 `appUpdateVersion` 非空时给「重新下载 / 重新安装」）；
  4. i18n 补 3 条失败文案（中英各一），并给这一组状态补渲染断言（见 N2）；
  5. 决定 `data.error` 分支是否清卡：若保留旧版本可重试，就必须给卡片动作；否则与 `:137-141` 同形清卡，避免零动作卡。

### N2 [severity: medium] [category: 正确性/测试有效性] 本轮 3 处行为变更删掉后测试全绿：僵尸卡清空、`silent` 通知不弹浮层、`silentError` 抑制全局卡

- 位置：`adlo/frontend/src/app/stores/slices/appUpdateSlice.ts:137-141`；`adlo/frontend/src/app/stores/slices/notificationSlice.ts:52、61`；`adlo/frontend/src/app/stores/actions/editorActionsHelpers.ts:172-174、186-188、280-282、296-298`
- 描述：逐条做删除性推演，三条用户可感知的行为契约都没有会变红的用例。
  1. **僵尸卡清空**（F4 的修复本身）：删掉 `appUpdateSlice.ts:137-141`，`appUpdateSlice.test.ts` 全绿。缺「先 check 到 available 并生成卡 → 再用 `available:false` 的桥接 check → 断言 `notifications` 里无 `type:'update'`」这条用例（rev1 F4 已点名此用例形状）。
  2. **更新卡不弹浮层**：`notificationSlice.ts:61` 的 `silent ? state.activePopupId : …` 是「更新提醒只进列表」的唯一实现。`notificationSlice.test.ts` 现有 4 条 `activePopupId` 用例都走非 silent 路径，删掉该分支后全部仍绿；而回归后的表现是：检查到新版本会像合并冲突一样弹出浮层打断用户。
  3. **会话恢复静默**（rev1 F5）：同前，四处 `if (!config.silentError)` 删掉后仍绿。
- 证据：`grep silent` 在测试里只命中 `sessionRestore.test.ts:118` 的参数透传断言；`notificationSlice.test.ts` 无 `silent: true` 用例；`appUpdateSlice.test.ts` 无「清卡」用例。UI 渲染测试基建已具备（`components/NotificationCard.test.tsx`、`ConflictModal.test.tsx` 用 `@testing-library/react` + jsdom），不是「没有基建」。
- 建议修复（同一轮补齐，均为小用例）：
  - `appUpdateSlice.test.ts`：加「已是最新时清掉旧卡」（断言 `updateNotifications(state)` 长度 0，且 `appUpdateVersion === null`）；
  - `notificationSlice.test.ts`：加「silent 通知不入 `activePopupId`」（`addNotification({type:'update',…,silent:true})` 后 `activePopupId` 保持 `null`；已有其它弹窗时保持原 id）；
  - `editorActionsHelpers.test.ts`：`readFile` 返回 `{ok:false}` 与 `Promise.reject` 各一条带 `silentError:true`，断言 `reportError` **未**被调用且 `fileOpenError?.path` 仍被置位（证明只抑制全局卡、不吞错误视图）；媒体链同理 1 条；
  - 给更新卡片补最小渲染断言（`downloaded` 只出「安装」、`error` 出错误行）——否则 N1、F6 的修复同样无法回归。

### N3 [severity: low] [category: 文档] 注释/命名与实现不符（5 处全在）+ i18n key 名承诺了不存在的「并安装」

- 位置与事实（本轮逐条复核，均未改动）：
  1. `appUpdateSlice.ts:53`：「`manual` 只影响『失败是否可被用户看到』以外的节流无关行为」——句子自相矛盾，且与实现相反：`manual` **只**决定是否绕过「跳过 / 24h」节流（`:153`），与错误可见性无关（错误可见性根本不存在，见 N1）。
  2. `appUpdateSlice.ts:18`：「`lastPromptedVersion/At`：同日最多提示一次」——实现是 `checkedAt - lastPromptedAt < DAY_MS` 的 24h 滚动窗口（`:147-150`），不是「同日」。
  3. `useAppUpdateWatcher.ts:19`：「失败一律静默……只有『关于』页的手动检查才展示错误」——自动检查失败同样置 `status:'error'`（`appUpdateSlice.ts:115-123`），关于页同样渲染「检查失败」（`AboutSettings.tsx:67-68`）；该句与实现相反。另「一律静默」与本轮 F1 的目的一半冲突：自动检查**不再静默失败**（状态可见），只有「不弹浮层」成立。
  4. `notification-card.css:116-118`：「动作行左『查看更新说明』、右『跳过 + 下载/安装』」——卡片已无「查看更新说明」按钮（`updateViewNotes` 仅 `AboutSettings.tsx:207` 使用；卡片注释 `UpdateNotificationCard.tsx:20-21` 明说说明入口只在关于页），CSS 注释是旧布局残留。
  5. `httpBridge.ts:1301-1303`：「preview/mock bridges use the shared unsupported implementation」——实际是两套：`mock/mock-update.ts:13-17` 返回 `IpcErrorCode.INVOKE_ERROR` + 自定义英文串，`httpBridge.ts:1305-1310` 用 `taskNotSupported`（`NOT_SUPPORTED`），并未共享。
  6. 命名：`updateDownloadAndInstall`（`zh-CN/notification.ts:16`、`en-US/notification.ts:16`）取值只有「下载 / Download」，按钮行为也只是下载。key 名承诺了不存在的「并安装」，后续维护者极易把它接到 install 上。
- 建议修复：按实现改写 1/3/4/5；2 改成「24 小时内最多提示一次」；6 改名为 `updateDownload`（两语同步，含 `AboutSettings.tsx:188`、`UpdateNotificationCard.tsx:143` 两处引用）。

### N4 [severity: low] [category: 文案] 关于页是唯一风险告知，但中文缺字、双语标点不一致

- 位置：`adlo/frontend/src/app/i18n/zh-CN/notification.ts:19`；`zh-CN/about.ts:8-9` vs `en-US/about.ts:8-9`
- 描述：
  1. `updateReadyWithHint: '更新已下载，安装后会自动重启，建议先保存或关闭当前进行工作'` ——「当前进行工作」缺「中的」，是用户可见病句。该句现在是**全仓唯一**的数据丢失风险告知（卡片侧已按用户要求删除，见 F2），病句落在这句上的代价比以前更大。
  2. 本轮把 `aboutTagline` / `aboutLicenseLine` 的中文句号去掉，英文仍保留句点；同属与本功能无关的 scope creep，且两语同一视觉块标点风格不一致。
- 证据：上述行；`UpdateNotificationCard.tsx:47` 的 `cleanNotes` 会剥掉说明尾部 `。`/`.`，说明「短文案不带句末标点」确有取向，但英文侧没跟上。
- 建议修复：中文改为「…建议先保存或关闭当前进行中的工作」；`aboutTagline`/`aboutLicenseLine` 两语统一（都去句点或都保留）。**注意**：ADR-0027 磁盘版「修订」节逐字引用了这句中文，改文案需同步改 ADR 引用，否则再次出现 ADR/i18n 漂移。

### N5 [severity: low] [category: 设计/无障碍] 折叠按钮命名通道与状态通道并用；`role="status"` 包住交互元素与进度

- 位置：`adlo/frontend/src/app/features/update/UpdateNotificationCard.tsx:65、100-109`
- 描述：`aria-label` 在 `t.updateExpandNotes` / `t.updateCollapseNotes` 之间切换，同时带 `aria-expanded={expanded}`。仓库设计规范明文禁止二者并用（`docs/design-system/guidelines/accessibility.md:12`：「a constant name paired with `aria-pressed`/`aria-expanded`, **or** a name that changes with the action and no state attribute. Never both」）。读屏会念成「收起更新说明 · 已折叠」这类自相矛盾的组合。同一组件根节点 `role="status"`（`:65`）把关闭按钮、折叠按钮与**下载进度**一起包进 live region：下载期间每次进度更新都触发播报。
- 证据：上述行；规范原文见上。
- 建议修复：保留 `aria-expanded` + 恒定名称（如「更新说明」，方向由图标表达），删掉随状态变化的 `aria-label`；把 `role="status"` 收窄到单独的进度/状态行（或仅在 `downloading`/`installing` 行上 `aria-live="polite"`），不要把动作按钮放进去。

## 记录不修

| 项 | 位置 | 理由 |
| --- | --- | --- |
| 卡片在 `downloaded` / `installing` 态标题仍是「发现新版本」 | `UpdateNotificationCard.tsx:67` | 关于页已显示「更新已下载」，卡片有「安装」按钮可识别状态；用户 2026-11-18 定稿卡片布局只要求版本 + 说明 + 按钮，ADR 修订未要求状态化标题。可选优化 |
| 两个 error 分支的 `set` 块逐字重复 | `appUpdateSlice.ts:102-111` 与 `:115-124` | Fowler「Duplicated Code」气味；N1 的修复必然同时改这两处，届时顺手合并即可，现在单独提取收益低 |
| `installing` 态关于页按钮文案落到「检查更新」（禁用） | `AboutSettings.tsx:187-193` | 安装成功即退出、失败转 error，该中间态通常不到 1 秒且按钮禁用；纯文案风险 |
| 关于页 error 态不显示「上次检查」时间 | `AboutSettings.tsx:67-68` | 失败时时间戳价值低，且 N1 重做文案时会一并决定 |
| 更新卡的 `summary` / `fullInfo` 写入了但组件不读（改读 store） | `appUpdateSlice.ts:191-197、235-242` | 更新卡不用浮层、不复制，这两个字段对 update 卡是死数据；删除需动 `NotificationData` 形状，等 N1 收口时一起看 |
| 单元测试 harness 用 `initial as StoreState` 断言最小状态 | `appUpdateSlice.test.ts:24、31` | 只断言两个切片、未用 `as unknown as`，不触发 ratchet；注释「不做类型擦除断言」指未用双跳断言，可接受 |

上轮「记录不修」其余 11 条本轮复核仍成立，理由不变（见 rev1 报告），不重复。

## 验证待补（不计入需修复，属流程门禁）

1. **CSS 级联真实渲染证据**（brief §5.7）仍未附：本轮 3 个 CSS 文件改动（`notification-card.css` 新增 230 行、`loading-row.css` 合并选择器、`about-settings.css` 新行）需要 `node adlo/scripts/ui-probe.mjs` 在亮/暗两套主题下的 `getComputedStyle` 证据，至少覆盖 `.adl-update-card__notes-text` 的 `-webkit-line-clamp`、`.adl-update-card__notes-shell.is-scrollable .adl-update-card__notes-scrollbar` 的 `opacity`、`.adl-notif-dot` 的 `background` 解析为 `--success`、`.adl-update-card__line.adl-loading-row__text--shimmer` 的 `color: transparent`。仅 CSS 文本/截图不算通过。
2. **ADR-0027 修订段必须进下一轮快照**（见文首注记）：它承载 F2 的保留依据；若最终不入库，F2 立刻回到「未闭合（high）」。
3. **跨端交接（backend/R2）**：`app_update_install` 先 `window.hide()` + 结束 sidecar 再 `install()`（`src-tauri/src/commands/update.rs:189-199`）；若 `install()` 返回错误，前端会置 `status:'error'`，但窗口已隐藏、sidecar 已死，该错误没有可见机会——N1 的错误呈现修好之后，这条后端时序问题仍然会让「安装失败」用户不可见，请 R2 一并核。
4. **桌面 E2E 冒烟**：绿点/卡片/关于页行属桌面-only 交互（浏览器模式 `supported:false`），按 `desktop-e2e-wdio` 技能至少跑一次确认没改坏启动链路（`useAppUpdateWatcher` 挂在 `App`）。

## 结论

- 需修复项：**5**（critical 0 / high 0 / medium 2 / low 3）
- 已闭合：**2**（F1 critical、F2 high）；F4 的代码修复已闭合，只差回归用例（并入 N2）
- 一句话摘要：F1（全源失败当「已是最新」）与 F2（卡片风险提示）已按用户决定收口，更新链路的状态机骨架依旧干净；剩余集中在**失败态仍未收口**（N1：三种失败共用「检查失败」文案、`appUpdateError` 无人读、卡片 error 态零动作，且本轮 F1 修复让 error 路径上能再出现零动作卡）与**回归保护缺口**（N2：僵尸卡清空、silent 通知、silentError 三处删掉后测试全绿），其余为注释/命名与文案/无障碍漂移。
