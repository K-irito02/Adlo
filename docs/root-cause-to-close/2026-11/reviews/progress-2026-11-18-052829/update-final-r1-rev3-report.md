# 最终复审（R1 正确性 + R2 清理向）— 应用内自动更新 · rev3

## 范围

- 仓库根：`E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/slot-2`
- 快照：`.review-diffs/manifest-rev3.md`（base `21ff184`，1 commit，67 文件），只看 `-rev3.diff`
- 上轮输入：`.review-diffs/update-core-r1-rev2-report.md`（F1–F8 + 关闭表）、`.review-diffs/update-ui-r1-rev2-report.md`（F1–F8 / N1–N5）
- 本轮实际读过的 rev3 快照：`commands/update.rs`、`crates/update/src/lib.rs`、`crates/update/Cargo.toml`、`adl_server.rs`、`main.rs`、`commands/mod.rs`、`tauri.conf.json`、`installer-hooks.nsh`、`permissions/digital-life.toml`、`scripts/release.mjs`、`scripts/release/manifest.mjs`、`scripts/release-manifest.test.mjs`、`build-stage-sidecar.ps1`、`package.json`、`Cargo.toml`×2、`dsh.rs`、`.gitignore`、`GLOSSARY.md`、ADR-0026/0027、ADR README、`RELEASE-CHECKLIST.md`、`.agents/rules/commands.md`、`adlo-release/SKILL.md`、`SKILLS.md`，以及前端 34 个文件中的全部 update 相关项（slice / 测试 / 卡片 / 关于页 / i18n / watcher / 通知切片 / 四端桥接 / 持久化登记 / CSS）
- 工作区只读上下文：`appUpdateSlice.ts`、`UpdateNotificationCard.tsx`、`AboutSettings.tsx`、`TitleBarNotifications.tsx`、`persisted/entry.ts`、`persisted/apply.ts`、`i18n/useTCopy.ts`、`en-US/about.ts`、`tauri-2.11.5/src/{app,process}.rs`、`tauri-plugin-updater-2.12.0/src/updater.rs`（确认 `install_inner` 顺序、`restart_after_install` 默认 `true`、`AppHandle::restart() -> !`）
- 约束遵守：未运行 `git diff/log/show`；未修改任何源码/配置；未启动 dev server / 浏览器；未跑测试套件（测试有效性全部用删除性推演）。本报告是唯一写入的文件。

## 上轮问题关闭情况

### core rev2（`update-core-r1-rev2-report.md`）

| 上轮 | 结论 | 依据 |
| --- | --- | --- |
| F1 install 失败留「窗口已隐藏 + sidecar 已死 + 字节已丢弃」半死态 | **已闭合** | `update.rs:208-216` 在 `install()` 返回 `Err` 时 `window.show()` + `tracing::error!` + `app.restart()`；`restart()` 是 `-> !`（`tauri-2.11.5/src/app.rs:588`），`process::restart` 先 spawn 新进程再 `exit(0)`（`process.rs:74-88`），新进程 setup 会重新拉起 sidecar，`terminate()` 的 `base_url = None` 只影响旧进程。残余（记录）：字节仍被丢弃、失败原因只在日志里（见「记录不修」） |
| F2 更新检查不遵守 `no_proxy` / 保留理由与插件 API 不符 | **未闭合（行为侧有据保留成立，注释侧不成立）** | 行为按用户决定保留「仅 https_proxy、无 no_proxy、无自动回退」；但 `update.rs:313-315` 的书面理由「`UpdaterBuilder` 只接受单个代理 URL，做不到按目标匹配/回退」与插件 API 相反——`configure_client` 存在（`updater.rs:357`，同时作用于 check 与 download），按源解析代理完全可行。保留应写成「产品决定」，不能写成「API 做不到」→ 见本轮 F6.6 |
| F3 `publish` 脏树只告警 / Gitee tag 指远端 `main` / 流程无 commit+push | **未闭合** | `release.mjs:245-247` 仍 `log("warning…")`；`release.mjs:300` 仍 `target_commitish: "main"`（GitHub 侧已用本地 `head`，两源 tag 仍可能指向不同提交）；`SKILL.md` 步骤 1→3→5→6 之间仍无 commit/push → 见本轮 F3 |
| F4 `target_key` / `newest_candidate` / `SourceCandidate` 无生产调用；`INSTALLING_EVENT` 无订阅者 | **部分闭合** | `target_key` 已用于 `builder.target(...)`（`update.rs:285-288`）；`newest_candidate`/`SourceCandidate`（`lib.rs:84-108`）仍只有测试调用；`INSTALLING_EVENT`（`update.rs:30,205`）+ `onInstalling`（`shared/ipc/update.ts:39` 与 4 处实现）仍零订阅 → 见本轮 F5 |
| F5 回落跨版本 → 显示 v0.3 装成 v0.2 | **已闭合** | `update.rs:125-130` 只保留 `version == target_version` 的备用源，注释说明动机；跨版本路径不可达 |
| F6 卡片 error 态零动作 / `downloaded` 被后台检查打回 `available` | **部分闭合** | 卡片 error 态已加文案 + 重试（`UpdateNotificationCard.tsx:129,134-146`），关于页已展示 `appUpdateError`（`AboutSettings.tsx:150-154`），空动作行不再出现（error 卡必然带 version）。但 `downloaded` 守卫**不可达**，行为未变 → 见本轮 F1（medium） |
| F7 比较器非全序 / 用例标题不覆盖排序 | **未闭合** | `update.rs:266-272` 仍只返回 `Less`/`Greater`；`update.rs:338-341` 仍只断言 `is_newer("0.2.0","0.1.9")`。且同版本过滤后这段排序对行为已无影响 → 并入本轮 F5 |
| F8 ① prerelease 版本号可入稳定清单 ② ADR-0026「应用自己预检清单」断言 | **未闭合** | `manifest.mjs:23` 的 `SEMVER` 仍接受 `-pre`，`publish` 只拦 `--prerelease` flag；`update.rs:241-266` 无预检步骤（实际靠 `decide` 把该源判 `Unavailable`）→ ①② 分别并入本轮 F3、F6.7 |

### UI rev2（`update-ui-r1-rev2-report.md`）

| 上轮 | 结论 | 依据 |
| --- | --- | --- |
| F1（critical）全源失败被当成「已是最新」 | **已闭合（保持）** | `appUpdateSlice.ts:115-124` 先判 `data.error`；用例 `appUpdateSlice.test.ts:193-213` |
| F2（high）卡片缺 ADR-0027 风险提示 | **已闭合（有据保留，用户决定）** | 卡片按用户要求不写重启提示（`UpdateNotificationCard.tsx:14-22` 布局约定），关于页承担告知（`AboutSettings.tsx:155-157`）；ADR-0027 修订段现已进入 rev3 快照（29 行版），rev2 的「快照缺修订段」注记关闭 |
| F3（medium）失败态未收口（N1） | **部分闭合** | 已补：卡片 error 文案 + 重试、关于页 error 详情（160 字截断）、不再有空动作行；剩余：三种失败共用「检查失败」文案（下载失败也标成检查失败）→ 本轮 F4 |
| F4（medium）僵尸更新卡 | **已闭合（代码 + 回归）** | `appUpdateSlice.ts:137-141` 清卡；用例 `appUpdateSlice.test.ts:215-231`「检查结果变为『已是最新』时清掉旧的更新卡片」——删掉 `:137-141` 后 `:230` 的 `toHaveLength(0)` 必红，真回归 |
| F5（medium）`silentError` 无回归保护 | **未闭合** | 见本轮 F2 |
| F6（low）折叠按钮双通道 / `role="status"` 包交互元素 | **已闭合** | `UpdateNotificationCard.tsx:106` 名称恒定 + `:105 aria-expanded`（规范允许的组合）；卡片根节点已无 `role="status"`（全仓 grep：update 相关组件零命中），进度行不再进 live region |
| F7（low）注释/命名 5 处 | **部分闭合** | 命名两项已修：`updateDownloadAndInstall` → `updateDownload`（`zh-CN/notification.ts:16`、`en-US/notification.ts:16`，引用 `AboutSettings.tsx:127`、`UpdateNotificationCard.tsx:141` 已同步）、`updateCollapseNotes` 已删除（全仓 grep 无残留）。5 处注释漂移全在 → 本轮 F6 |
| F8（low）中文缺字 / 双语标点不一致 | **部分未闭合** | `zh-CN/notification.ts:19`「关闭当前进行工作」仍缺「中的」→ 本轮 F4；双语标点属纯风格 → 记录不修 |

## 新增发现

### F1 [severity: medium] [category: 正确性] `downloaded` 保护守卫不可达，后台检查仍把「已下载待安装」打回「可下载」

- 位置：`adlo/frontend/src/app/stores/slices/appUpdateSlice.ts:97`（写 `checking`）与 `:145-150`（判断 `downloaded`）
- 描述：`checkAppUpdate` 在 `:97` 已把 `appUpdateStatus` 置为 `'checking'`，`:147` 的 `get().appUpdateStatus === 'downloaded'` 因此恒为 `false`。结果是「后台检查不把 `downloaded` 打回 `available`」这条本轮声称已修的行为**完全没生效**：启动 45 秒的首次检查与每 24 小时的定时检查（`useAppUpdateWatcher.ts:4,6,31-36`）一旦命中同一版本，仍会走 `:163-174` 把状态改成 `available`、清空 `appUpdateProgress`。用户可感知后果：铃铛绿点消失（`TitleBarNotifications.tsx:22-24,134` 依赖 `status === 'downloaded'`），卡片主按钮从「安装」退回「下载」，而壳层 `UpdateState.downloaded` 里那份同版本字节仍然有效——再点一次就是白下几十 MB，且这段时间内没有任何安装入口。
- 证据：状态机顺序（`:97` set → `:98` await → `:147` 读），中间没有任何写回 `downloaded` 的路径；`get()` 是同步读当前状态。回归侧为空：`appUpdateSlice.test.ts` 只有「下载失败/成功后状态」用例，没有任何「下载后再检查」的用例；删掉 `:145-150` 全部用例仍绿。
- 建议修复：在 `:97` 之前捕获 `const priorStatus = get().appUpdateStatus; const priorVersion = get().appUpdateVersion;`，`:147` 改用捕获值（`priorStatus === 'downloaded' && priorVersion === version`）；补一条用例：`check → downloadAppUpdate → check（同版本）`，断言 `status === 'downloaded'`、`appUpdateProgress === null`、卡片仍是「安装」入口（后者可用 store 断言 + 一个最小渲染断言）。若不想保留「仅同版本保留」的特例，则必须改为「检查结果版本不同才覆盖 `downloaded`」并写明理由。

### F2 [severity: medium] [category: 正确性/测试有效性] `silentError` 的四处抑制仍无回归保护（rev2 UI F5 未闭合）

- 位置：`adlo/frontend/src/app/stores/actions/editorActionsHelpers.ts:172-174、186-188、280-282、296-298`；`editorActions.ts:561,575,584,710-712`；`sessionRestore.test.ts:113-121`
- 描述：本轮把「会话恢复静默失败」接进了 `openFileForWorkspace` 的 `options.silentError`，但唯一的断言仍是参数透传（`sessionRestore.test.ts:118` 断言收到 `{ silentError: true }`）——而 `restoreLastOpenedFile` 在测试里是 mock 掉的，四处 `if (!config.silentError) captureError(...)` 一次都没被执行。删除性推演：把四个守卫全部删掉，`sessionRestore.test.ts` 与 `editorActionsHelpers.test.ts` 仍全绿；而回归后的表现是「启动时文件被删 → 弹全局错误卡」，正是 rev2 记录的用户可感知缺陷。
- 证据：`grep -n silentError` 在测试目录只命中 `sessionRestore.test.ts` 的参数断言；`editorActionsHelpers.test.ts` 无 `silentError` 用例（本轮未改）。
- 建议修复：在 `editorActionsHelpers.test.ts` 补两条（`readFile` 返回 `{ok:false}` 与 `Promise.reject` 各一），断言 `captureError`/`reportError` **未**被调用、且 `fileOpenError?.path` 仍被置位（证明只抑制全局卡、不吞错误视图）；媒体链（`readMediaFile`）同样至少 1 条。

### F3 [severity: medium] [category: 正确性] 发版链路仍可发出「tag 与版本号不一致」的双源 Release，且流程里没有提交步骤

- 位置：`adlo/scripts/release.mjs:239-247`（脏树仅告警）、`:256-282`（GitHub `--target head`）、`:300`（Gitee `target_commitish: "main"`）、`:232-236`（只拦 flag）、`adlo/scripts/release/manifest.mjs:23`（`SEMVER` 仍接受预发布段）、`.agents/skills/adlo-release/SKILL.md` 步骤 1/3/5/6
- 描述：三处仍未收口，且互相叠加：
  1. `release:bump` 必改 4 个受版本控制的文件，走到 `publish` 时工作区**必然脏**，`dirty` 分支必然触发——这种「必然响的告警」等于没有门禁，用户仍能在「bump 未提交」的状态下发布：GitHub tag 钉在本地 HEAD（其 `tauri.conf.json` 还是旧版本号），Gitee tag 从远端 `main` 建——两源同名 tag 指向不同提交、且都不含本次版本号。
  2. `SKILL.md` 步骤 1（`git status --short` 干净）发生在 bump 之前，3→5→6 之间没有 `git commit` + `git push`，等于把上述状态合法化。
  3. `--prerelease` 已被拒（`:232-236`），但 `bump 0.2.0-rc.1` 仍能通过 `isVersion`（`manifest.mjs:23`），`publish` 不校验版本串是否含 `-` → rc 版本号照样写进两源稳定清单，与 ADR-0026「只做稳定通道」冲突（GitHub 侧也不会打 prerelease 标记）。
- 证据：`release.mjs:245-247` 只有 `log`；`:267 --target head` vs `:300 "main"`；`SKILL.md` 发版流程 1→8 无提交动作；`verify`（`:348-387`）只比对远端清单版本与**本地** `tauri.conf`，不校验 tag → 提交内容，因此上述错位不会被 `verify` 发现。
- 建议修复：`publish` 在脏工作区或 `HEAD != origin/<branch>` 时默认 `fail`，提供显式 `--allow-dirty`；`--target` 与 Gitee `target_commitish` 都传同一个 `head` sha；`bump`/`publish` 对含 `-` 的版本直接 `fail`（或加 `isStableVersion`）；`SKILL.md` 在「升版本号」与「构建」之间补 `git commit -am "chore(release): vX.Y.Z" && git push`。

### F4 [severity: low] [category: 文档] 失败态文案仍把「下载失败」说成「检查失败」，且唯一的数据丢失告知仍是病句

- 位置：`adlo/frontend/src/app/features/about/AboutSettings.tsx:86-87`、`adlo/frontend/src/app/features/update/UpdateNotificationCard.tsx:129`、`adlo/frontend/src/app/i18n/zh-CN/notification.ts:15,19`、`adlo/frontend/src/app/i18n/en-US/notification.ts:13`
- 描述：切片仍用单一 `appUpdateStatus: 'error'` 承载检查失败与下载失败（安装失败已因 `app.restart()` 不可达），两处渲染都取常量文案：关于页恒为 `aboutUpdateFailed`「检查失败」/「Check failed」，卡片恒为 `updateCheckFailed`「检查更新失败」/「Update check failed」。于是「下载中断」在界面上被标成「检查失败」——用户会去点「重试」触发一次重新检查（关于页 `handleUpdateAction` 的 error 分支落到 `checkAppUpdate`），而不是重试下载。另一处：`updateReadyWithHint` 仍是「建议先保存或关闭当前进行工作」（缺「中的」），而它现在是全仓唯一的数据丢失风险告知（卡片侧按用户决定已删），病句代价比以前更大；ADR-0027 修订段逐字引用了这句，改文案需同步 ADR。
- 证据：`AboutSettings.tsx:86-87`（switch 的 `error` 分支无 operation 区分）、`UpdateNotificationCard.tsx:129`；`grep appUpdateError` 只命中切片与关于页，无 operation 字段；`zh-CN/notification.ts:19` 原文。
- 建议修复：给 `appUpdateError` 带上 `operation`（`check` / `download`），两处文案按 operation 取值（补 zh/en 各 1–2 条「下载失败」），关于页「重试」按 operation 分派（download → `downloadAppUpdate()`）；中文改为「…建议先保存或关闭当前进行中的工作」，同步 ADR-0027 修订段引用。`updateCheckFailed` 与 `aboutUpdateFailed` 内容重复，收口时留一个。

### F5 [severity: low] [category: 死代码] 无调用方的 `pub`、无人订阅的事件、被同版本过滤架空的排序、不可达的 prerelease 分支（§5.6 强制项）

- 位置与事实：
  1. `adlo/crates/update/src/lib.rs:84-108`：`SourceCandidate` + `newest_candidate` 仍只有 `#[cfg(test)]` 调用（`:216-241`），与 `decide` 语义重叠，是第二套择优 API；同时 `lib.rs:13` 的文档把它写成择优权威（「两个来源版本不同时取较新者（见 [`newest_candidate`]）」），而生产路径走的是 `decide`。
  2. `adlo/src-tauri/src/commands/update.rs:30,205`：`INSTALLING_EVENT` 只发不收；`shared/ipc/update.ts:39` 的 `onInstalling` 在 `tauri-update.ts:19-22`、`httpBridge.ts:1310`、`mock/mock-update.ts:24` 与测试桩各实现一次，全仓无业务订阅（`useAppUpdateWatcher` 只订 `onProgress`；`installAppUpdate` 自己置 `installing`）。
  3. `update.rs:266-272`：`alternates.sort_by(...)` 在 `:125-130` 的同版本过滤之后已对行为无影响（`decide` 选中的必是最高版本，过滤后只剩同版本项，顺序无语义），比较器本身还不满足全序（同版本双向返回 `Greater`，rev2 F7 未修）。
  4. `update.rs:334-342` 的 `is_newer_used_for_alternate_ordering` 只断言 `is_newer("0.2.0","0.1.9")`——删除上面那段排序它依然全绿，标题承诺未覆盖（§5.9），且与 `lib.rs:238-243` 重复。
  5. `adlo/scripts/release.mjs:277-281`（`ghArgs.push("--prerelease")`）与 `:301`（Gitee `prerelease`）在 `:232-236` 的 `fail` 之后不可达；文件头用法注释 `:13` 仍宣传 `[--prerelease]`。
- 建议修复：删 `newest_candidate`/`SourceCandidate` 与其 2 条用例，`lib.rs:13` 改指 `decide`；删 `INSTALLING_EVENT` + `onInstalling`（含 `shared/ipc/update.ts` 声明、三处桥接实现与测试桩）；删 `alternates.sort_by` 与 `update.rs` 的重复用例（`is_newer` 若随之失去生产调用方则一并降级/删除）；删 `release.mjs` 的 prerelease 残留并把用法注释改成当前支持的参数。

### F6 [severity: low] [category: 文档] 注释与 ADR 仍与实现不符（7 处，含 rev2 明确点名的 5 处）

- 逐条：
  1. `appUpdateSlice.ts:53`：「`manual` 只影响『失败是否可被用户看到』以外的节流无关行为」——句子自相矛盾，且与实现相反（`manual` 只决定是否绕过跳过/24h 节流，见 `:158`；「错误是否可见」根本不由它决定）。
  2. `appUpdateSlice.ts:18`：「同日最多提示一次」——实现是 `checkedAt - lastPromptedAt < DAY_MS` 的 24 小时滚动窗口（`:152-155`）。
  3. `useAppUpdateWatcher.ts:13`：「失败一律静默……只有『关于』页的手动检查才展示错误」——自动检查同样写 `status: 'error'`（`appUpdateSlice.ts:102-124`），关于页对自动检查失败同样渲染「检查失败」。成立的只有「不弹浮层」。
  4. `styles/components/notification-card.css:117`：「动作行左『查看更新说明』、右『跳过 + 下载/安装』」——卡片已无该按钮（说明入口只在关于页，`UpdateNotificationCard.tsx:20-21`），且 error 态只有一个「重试」。
  5. `httpBridge.ts:1303`：「the preview/mock bridges use the shared unsupported implementation」——实际是两套：`mock/mock-update.ts:13-17` 返回 `INVOKE_ERROR` + 英文串，`httpBridge.ts:1305-1310` 用 `taskNotSupported`。
  6. `commands/update.rs:313-315`：见关闭表 F2——「`UpdaterBuilder` 只接受单个代理 URL，做不到按目标匹配/回退」与插件 API（`configure_client`）相反，应改写为产品决定（如「更新检查只认 https_proxy，与下载源不同：宁可直连也不引入第二套代理规则」）。
  7. `docs/adr/0026-...md:11` 与 Consequences 第 2 条：「在交给插件前先用应用自己的代理感知 HTTP 客户端预检清单内容是否可用」/「预检必须由应用自己完成，否则这类故障会表现为『检查更新永远失败』」——实现没有预检步骤；200-非-JSON 的失败由插件报错 → `decide` 归 `Unavailable` → 另一源胜出，ADR 描述的症状与机制都不成立（rev2 core F8 ②，§2.1 要求同轮对齐）。
- 建议修复：1/3/4/5/6 按实现改写（或删掉过时的布局说明）；2 改「24 小时内最多提示一次」；7 改为「每源独立检查，任一源异常不推翻另一源结论；200-非-JSON 由清单解析失败归为不可用」。

## 记录不修

| 项 | 位置 | 理由 |
| --- | --- | --- |
| 安装失败后已下载字节被丢弃，重启后用户只看到「什么都没发生」 | `update.rs:208-216` | 用户本轮明确选择 `app.restart()` 自愈（优于半死窗口）；错误原因在 `tracing::error!` 里，重新给一个跨重启的错误 toast 需要新的持久化字段，收益不抵复杂度 |
| `app.restart()` 在 spawn 新进程失败时静默 `exit(0)` | `tauri-2.11.5/src/process.rs:83-88`（插件上游行为） | 极端环境（exe 被移动/隔离）下才会发生；应用侧无可补救动作 |
| 非 Windows 上 `install()` 返回 `Ok` 而不退出，前端会停在 `installing` | `updater.rs:1045-1051` | 本项目 `bundle.targets: ["nsis"]`，只发 Windows 安装包；注释已写明「Windows 上此调用会…退出当前进程」 |
| `adl/crates/update/Cargo.toml:16` 的 `serde` 无任何使用 | 该文件 | 上轮已记，仍未清；不影响构建 |
| `adl-update` 仍未加入 `adlo/.cargo/config.toml` 的 `debug=2` 白名单 | 该文件 | 上轮已记，等统一登记 |
| `tauri.conf.json:18-29` 的 `plugins.updater.endpoints` 与 `UPDATE_SOURCES` 重复，壳层逐源 `endpoints(vec![url])` 覆盖 | 两文件 | 配置里那份永不生效，但保留可让 `tauri-plugin-updater` 的 schema 校验通过；上轮已记 |
| `release.mjs:240-241` 的 `spawnSync("git", …).stdout.trim()` 在 git 缺失/非仓库时抛未捕获 `TypeError` | 该文件 | 上轮已记；正常发版环境必有 git |
| `release.mjs:348-387` 的 `verify` 不校验 `.sig` 与安装包匹配，Gitee raw 请求无 cache-busting | 该文件 | 上轮已记 |
| `installer-hooks.nsh:18-26` 按镜像名杀该用户下所有 `adl-server.exe` | 该文件 | 应用侧 `terminate()` 是主路径，钩子只作兜底；上轮已记 |
| `adlo/package.json:20` 的 `build` 仍是裸 `cargo tauri build`（无私钥会因 `createUpdaterArtifacts` 失败） | 该文件 | 文档已指路 `release:build`；上轮已记 |
| `adl_server.rs:139-141` 的 `base_url` 写锁中毒时不清空（同函数 `:132-135` 的 `child` 用 `poisoned.into_inner()`） | 该文件 | 需要「持有 base_url 写锁时 panic」才触发，实际不可达；一致性瑕疵 |
| 卡片 error 态仍显示 `updateAvailableShort`「发现新版本」+ 版本 pill | `UpdateNotificationCard.tsx:67,68` | 用户定稿的卡片只要求版本 + 说明 + 按钮；错误行已说明状态 |
| 关于页 `downloaded` 态按钮显示「安装」，同时下方警示文案较长 | `AboutSettings.tsx:129,155-157` | 用户决定的告知位置，非缺陷 |
| `appUpdatePublishedAt` / `UpdateCheck.published_at` 全链路无渲染消费者 | 两处 | 注释已如实写「前端目前不渲染」 |
| `summary` / `fullInfo` 对 update 卡是死数据（组件改读 store） | `appUpdateSlice.ts:190-201,233-246` | 删除需动 `NotificationData` 形状，超出本轮；上轮已记 |
| en-US `aboutTagline`/`aboutLicenseLine` 仍带句点，中文已去句点 | `en-US/about.ts:8-9` | 纯风格，双语可各自成立；本轮 en-US 文件不在 manifest 内 |
| 更新卡片（`downloaded` / `error` / `installing` 三态）无渲染回归 | `UpdateNotificationCard.tsx` | 渲染基建已有（`NotificationCard.test.tsx`），但本轮已补的两个关键回归（清卡、silent 浮层）价值更高；F1/F4 收口时一并补 |
| `prototype/update-card/index.html` 未在文档中登记 | 该文件 | 纯设计草稿，不影响运行 |

上轮两份报告的「记录不修」其余条目复核后仍成立，理由不变（`available` 覆盖 `downloaded` 归入 F1 处理；`onInstalling` 归入 F5）。

## 验证待补（流程门禁，不计入需修复）

1. **CSS 真实渲染证据**（brief §5.7）仍缺：本轮 3 个 CSS 文件（`notification-card.css` 新增 `.adl-notif-dot` 与更新卡 200+ 行、`loading-row.css` 新增两个 shimmer 复合选择器、`about-settings.css` 新增 4 个块）需要 `ui-probe.mjs` 在亮/暗两套主题读 `getComputedStyle`，至少覆盖 `.adl-notif-dot` 的 `background` 解析为 `--success`、`.adl-update-card__notes-text` 的 `-webkit-line-clamp`、`.adl-update-card__line.adl-loading-row__text--shimmer` 的 `color: transparent`、`.adl-about__update-status.adl-loading-row__text--shimmer` 同样生效。仅 CSS 文本或截图不算通过。
2. **桌面 E2E 冒烟**：绿点 / 卡片 / 关于页行是桌面-only 交互（浏览器模式 `supported: false`），按 `desktop-e2e-wdio` 至少跑一次确认 `useAppUpdateWatcher` 挂载后没改坏启动链路。
3. **`check:all` / `cargo:clippy`**：本轮 Rust 侧新增 `app.restart()` 的 `!` 分支、`AppHandle::restart` 的 never 类型收窄，以及 `dsh.rs` 的 `hidden_command` 三处替换，最终门禁由主代理执行。

## 结论

- 需修复项：**6**（critical 0 / high 0 / medium 3 / low 3）
- rev2 共 16 项（core F1–F8 + UI F1–F8，无重号）：**已闭合 6**（core F1、F5；UI F1、F2、F4、F6），**部分闭合 5**（core F2、F4、F6；UI F3、F7），**未闭合 5**（core F3、F7、F8；UI F5、F8）
- 一句话摘要：本轮把安装失败改为 `app.restart()` 自愈、把回落收紧到同版本、给卡片 error 态补了文案与重试，三处硬伤都真的修好了；但「后台检查不把 `downloaded` 打回 `available`」因守卫写在 `checking` 之后而**不可达**（F1，medium，且无用例覆盖），`silentError` 抑制仍无回归（F2），发版链路仍是「脏树只告警 + 双源 tag 分叉 + 无 commit 步骤 + prerelease 版本号可入稳定清单」（F3），其余为失败态文案、死代码（`newest_candidate`/`INSTALLING_EVENT`/被同版本过滤架空的排序）与 7 处注释/ADR 漂移。
