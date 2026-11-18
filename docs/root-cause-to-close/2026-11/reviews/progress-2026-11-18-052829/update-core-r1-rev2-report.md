# R1（正确性）复审报告 — 应用内自动更新 · 后端 / 发布链路 · rev2

## 范围

- 仓库根：`E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/slot-2`
- 快照清单：`.review-diffs/manifest-rev2.md`（base `21ff18447e8c621c6b4eddd4cf8cedd189a2582e`，62 文件），只看 `-rev2.diff`
- 上一轮报告：`.review-diffs/update-core-r1-rev1-report.md`（F1–F13）
- 本轮 diff 输入：
  - `.review-diffs/adlo_src-tauri_src_commands_update.rs-rev2.diff`
  - `.review-diffs/adlo_crates_update_src_lib.rs-rev2.diff`、`adlo_crates_update_Cargo.toml-rev2.diff`
  - `.review-diffs/adlo_src-tauri_src_adl_server.rs-rev2.diff`、`adlo_src-tauri_src_main.rs-rev2.diff`、`adlo_src-tauri_src_commands_mod.rs-rev2.diff`
  - `.review-diffs/adlo_src-tauri_tauri.conf.json-rev2.diff`、`adlo_src-tauri_installer-hooks.nsh-rev2.diff`、`adlo_src-tauri_permissions_digital-life.toml-rev2.diff`
  - `.review-diffs/adlo_scripts_release.mjs-rev2.diff`、`adlo_scripts_release_manifest.mjs-rev2.diff`、`adlo_scripts_release-manifest.test.mjs-rev2.diff`、`adlo_scripts_build-stage-sidecar.ps1-rev2.diff`
  - `.review-diffs/adlo_package.json-rev2.diff`、`.gitignore-rev2.diff`、`adlo_Cargo.toml-rev2.diff`、`adlo_src-tauri_Cargo.toml-rev2.diff`
  - `.review-diffs/adlo_crates_server_src_handlers_dsh.rs-rev2.diff`
  - `.review-diffs/adlo_frontend_src_app_stores_slices_appUpdateSlice.ts-rev2.diff`、`..._slices___tests___appUpdateSlice.test.ts-rev2.diff`、`..._shared_ipc_update.ts-rev2.diff`、`..._features_update_UpdateNotificationCard.tsx-rev2.diff`、`..._features_about_AboutSettings.tsx-rev2.diff`、`..._hooks_useAppUpdateWatcher.ts-rev2.diff`、`..._tauri-bridge_tauri-update.ts-rev2.diff`、`..._mock_mock-update.ts-rev2.diff`、`..._mock-bridge.ts-rev2.diff`、`..._preview-bridge_index.ts-rev2.diff`、`..._httpBridge.ts-rev2.diff`、`..._i18n_{zh-CN,en-US}_notification.ts-rev2.diff`
  - `.review-diffs/docs_adr_0026-*.diff`、`docs_adr_0027-*.diff`、`GLOSSARY.md-rev2.diff`、`.agents_skills_adlo-release_SKILL.md-rev2.diff`
- 只读上下文：`RELEASE-CHECKLIST.md`、`.agents/rules/commands.md`、`.agents/rules/review-brief.md`、`.agents/rules/*`、`adlo/.cargo/config.toml`、`adlo/crates/download-source/src/lib.rs`、`adlo/crates/errors/src/lib.rs`、`tauri-plugin-updater-2.12.0/src/updater.rs`
- 约束遵守：未运行 `git diff/log/show`，未修改源码，未启动 dev server / 浏览器（无端口占用，无后台进程）；未跑测试套件（测试有效性用删除性推演，见各条）。
- 说明：`RELEASE-CHECKLIST.md` 与 `.agents/rules/commands.md` **不在** rev2 manifest 的 62 文件内，但工作区磁盘内容已指向 `release:build`（见 F5）；下文据此判定，并标注该风险。

## 上轮问题关闭情况

| 上轮 | 结论 | 依据 |
| --- | --- | --- |
| F1 安装失败留半死态 | **部分闭合**（残余见本轮 F1） | 隐藏窗口 + 结束 sidecar 已移入 `on_before_exit`（`update.rs:284-292`），插件在 `extract` **之后**才调用该钩子（`tauri-plugin-updater-2.12.0/src/updater.rs:847-852`），所以解压失败不再有副作用；但 `ShellExecuteW` 失败（`:878-880`）发生在钩子**之后**，窗口已隐藏、sidecar 已死 |
| F2 单源失败被折叠成整体失败 / 前端不读 `error` | **已闭合** | `adl_update::decide` 三态合并（`lib.rs:59-86`）+ 4 条单测（`lib.rs:272-297`）；`resolve_update` 直接复用它（`update.rs:221-266`，无第二份择优）；只有全部 `Unavailable` 才 `Err`（`:238-242`）；前端消费 `data.error` 置 `error`（`appUpdateSlice.ts:115-125`）+ 用例「所有来源都不可用时显示检查失败」（`appUpdateSlice.test.ts:193-213`）。删除性推演：去掉 `lib.rs:82` 的 `any_up_to_date` 回退，`decide_keeps_up_to_date_when_another_source_fails` 必红；去掉 `appUpdateSlice.ts:115` 分支，`appUpdateSlice.test.ts:210` 必红 |
| F3 择优后不回落到另一源 | **已闭合**（主路径；残余见本轮 F5） | `ResolveFound.alternates` 按版本降序（`update.rs:250-258`），`download_inner` 逐个尝试并在全部失败时清空旧字节（`:120-186`） |
| F4 代理解析与应用其余链路不一致 | **未闭合**（保留理由不成立，见本轮 F2） | 仍无 `no_proxy`；Manual 端点不可解析静默直连（`update.rs:306-312`）；Auto 无「代理不可达 → 直连」保护（`:313`）。注释声称「UpdaterBuilder 只接受单个代理 URL，做不到按目标匹配/回退」（`:296-298`）与插件 API 不符（见 F2 证据） |
| F5 `createUpdaterArtifacts` 使普通构建失败 / 文档未指路 | **已闭合** | `RELEASE-CHECKLIST.md:40-42` 明写「生产构建用 `pnpm --dir adlo run release:build`…普通 `cargo tauri build` 会因 `createUpdaterArtifacts` 直接失败」；`.agents/rules/commands.md:203` 已改为「release 打包用 `pnpm run release:build`，需签名私钥」；`adlo/package.json` 新增 4 个 `release:*` 脚本。残余：`build`（`package.json:20`）仍是裸 `cargo tauri build`，无「无签名构建」入口——按上轮建议的「二选一」已选文档路线，记为记录不修 |
| F6 `release:build` 强制要求密钥文件 | **已闭合** | 先认 `TAURI_SIGNING_PRIVATE_KEY`（内容），只有为空时才回退 `TAURI_SIGNING_PRIVATE_KEY_PATH` / `~/.tauri/adlo.key` 并要求存在（`release.mjs:157-175`） |
| F7 `publish` 不校验版本已提交 / tag 指错提交 | **部分闭合**（见本轮 F3） | `gh release create` 已带 `--target <HEAD>`（`release.mjs:235-241,260-261`）；但脏工作区只 `log("warning…")` 不拦截（`:235-238`），Gitee `target_commitish` 仍是 `"main"`（`:294`），技能流程 bump→build→publish 之间仍无 commit/push |
| F8 `--prerelease` 写进稳定通道清单 | **已闭合**（flag 路径） | `publish` 在最早处 `fail("--prerelease is not supported…")`（`release.mjs:226-230`），Gitee 清单更新不可达；残余（版本号字符串、死分支）见本轮 F8 |
| F9 下载无超时 / 无重入保护 / 失败不清空 | **已闭合** | `DOWNLOAD_TIMEOUT = 900s` 包住 `update.download`（`update.rs:33,139-162`）；`UpdateState.downloading: AtomicBool` + `swap(true)` 拒绝重入（`:53-57,110-118`）；全部候选失败清空 `downloaded`（`:174-177`） |
| F10 择优在壳层重写 / 判定路径无测试 | **部分闭合**（见本轮 F4） | `decide` 已下沉为纯函数并带 4 条真实分支用例（`lib.rs:59-86,272-297`），壳层不再重写；但 `target_key`（`lib.rs:21`）、`newest_candidate`（`:92`）、`SourceCandidate`（`:84`）仍无生产调用方 |
| F11 `published_at` 注释写「RFC 3339」 | **已闭合** | 注释已改为「插件给出的时间字符串（不保证 RFC 3339）；前端目前不渲染」（`update.rs:61`），与 `date.to_string()` 的实际实现一致，也不再误导 |
| F12 `summarize_notes` 只剥行首行尾 | **已闭合** | 新增 `clean_inline_markdown`（`lib.rs:157-186`）+ 3 条用例覆盖反引号 / 链接 / 强调（`lib.rs:264-268`）。删除性推演：移除 `clean_inline_markdown` 调用，`summarize_notes_strips_inline_markdown` 三条断言全红 |
| F13 NSIS 钩子未 `Pop` / 相对路径 / 非 ASCII | **已闭合** | `nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM adl-server.exe /T'` + `Pop $0` + 纯 ASCII `DetailPrint`（`installer-hooks.nsh:12-16,18-22`） |

「有据保留」四项核定：

| 保留项 | 判定 | 理由 |
| --- | --- | --- |
| F4 代理只做 https_proxy、不实现 `no_proxy`/自动回退（UpdaterBuilder 限制） | **不成立** | 见本轮 F2：插件提供 `configure_client`，且壳层本来就是「一源一 builder」，按目标解析代理完全可行 |
| F5 文档改指 `release:build`，留 P5 | **成立** | 文档已在磁盘生效（但不在 manifest 内，需确认随本分支提交） |
| F11 注释改为「插件给出的时间字符串」 | **成立** | 与实现逐句相符 |
| F10 里 `target_key` 仍无生产调用 | **不成立** | `review-brief.md:55`/§5.6 明文「无调用方的 `pub` 包装应删除或降级」；现在连 `newest_candidate` 也变成无调用方 |

## 新增发现

### F1 [severity: medium] [category: 正确性] `install()` 在钩子之后失败时仍是「窗口已隐藏 + sidecar 已死 + 字节已丢弃」的不可恢复态

- 位置：`adlo/src-tauri/src/commands/update.rs:189-203`（`take()` 在 `:192`，事件在 `:199`，`install` 在 `:200-203`）；钩子 `:284-292`
- 描述：顺序变成「取走已下载字节 → 发 `INSTALLING_EVENT` → `install()`」，而插件内部是「`extract(bytes)` → **`on_before_exit`（隐藏窗口 + 终结 sidecar）** → `ShellExecuteW` → 成功才 `exit(0)`」。于是当解压成功、但安装器启动失败（`ShellExecuteW` 返回 ≤32：安装器被 Defender 隔离、临时目录在解压后被清理、策略拦截 `open`）时，进程继续活着且：窗口隐藏（`main.rs` 只在页面加载完成时 `show()` 一次，无托盘）、`ad_server.base_url` 已被置 `None`（`adl_server.rs:131-145`）且没有任何重启入口、已下载字节已在 `:192` 被 `take()` 丢弃。前端此刻只能把状态置 `error`，但用户看不到任何界面。另外 `on_before_exit` 在插件里仅 `#[cfg(windows)]` 生效，非 Windows 上 `install()` 返回 `Ok` 而不退出、钩子不执行，前端会永久停在 `installing`。
- 证据：`tauri-plugin-updater-2.12.0/src/updater.rs:841-883`（`extract` @847 → 钩子 @849-852 → `ShellExecuteW` @868-877 → `result as isize <= 32` 返回 `Err` @878-880 → `std::process::exit(0)` @882）；`update.rs:192` 的 `guard.take()`；`adl_server.rs:131-145` 只 `take()` 子进程并清 `base_url`，无 respawn；`main.rs` 无窗口恢复路径。
- 建议修复：`app_update_install` 在 `install()` 返回 `Err` 时把字节放回 `UpdateState`、`window.show()`，并给 `AdServerHandle` 补一个 `restart()`（或把 `terminate()` 从钩子挪到「安装器已确认启动」之后——插件不提供该时点，则必须在失败分支自愈）；同时把「非 Windows 上 `install()` 返回 Ok 不退出」写进注释，或在该平台显式置 `error`。至少要在 `:192` 改成「失败时恢复字节」，避免一次瞬时失败逼用户重新下载几十 MB。

### F2 [severity: medium] [category: 正确性] 更新检查仍不遵守应用自己的代理语义，且保留理由与插件 API 不符

- 位置：`adlo/src-tauri/src/commands/update.rs:294-315`（`apply_proxy`），注释 `:296-298`
- 描述：与 `adl-download-source` 仍有三处实质差异：① 完全忽略 `config.proxy.no_proxy` 直连名单（`crates/download-source/src/lib.rs:436` 已实现，含 `*` 与 `.suffix` 规则）；② `Manual` 下 `https_proxy` 存在但解析失败时静默改直连（`update.rs:306-312`），而该 crate 明文「手动模式不做回退：用户显式填的代理失败时应当报错」（`lib.rs:264-265`）；③ `Auto` 模式直接返回未配置的 builder（`:313`），没有该 crate 的「代理端点不可达 → 静默直连」保护（`lib.rs:266-274`，注释记录了 2026-10-30 用户实测的残留环境变量场景）。第③条命中最高频场景：代理软件关掉后 `HTTPS_PROXY` 仍指向已停端口时，更新检查会整体失败（随后被 `decide` 归为 `Unavailable`，双源都如此即显示「检查失败」）。
- 证据：注释称「`UpdaterBuilder` 只接受单个代理 URL，做不到按目标匹配/回退」——但插件同时提供 `configure_client<F: Fn(ClientBuilder) -> ClientBuilder>`（`tauri-plugin-updater-2.12.0/src/updater.rs:353-362`），该回调被存进 `context` 并同时作用于**检查**（`:516-518`）与**下载**（`:707-709`）的客户端；`build_http_client` 里的 `reqwest::Proxy::custom(...)`（`download-source/src/lib.rs:220-247`，按 `no_proxy` + scheme 选择）可以直接搬进这个回调。且壳层是「每个源一个 Updater」（`update.rs:268-282` 的 `endpoints(vec![url])`），即使只想按目标匹配，也只需在 `check_one` 里用该源 URL 解析一次代理再 `.proxy(...)`/`.no_proxy()`——不存在「做不到」。
- 建议修复：把「代理配置 → reqwest ClientBuilder」抽到一处（`download-source` 暴露 `resolve_proxy_url` 的 `pub` 版本，返回 `Option<String>`），`apply_proxy` 改为 `builder.configure_client(move |client| …)`：`None` 模式 `no_proxy()`，Manual 按 URL 命中 `no_proxy` 则 `no_proxy()`、否则 `.proxy(...)`（解析失败返回 `Err` 而不是直连），Auto 复用 `proxy_endpoint_reachable_cached` 做回退。改完删掉 `:296-298` 的「限制」注释。

### F3 [severity: medium] [category: 正确性] `publish` 对脏工作区只告警，Gitee tag 仍指远端 `main`，发版流程缺 commit/push 步骤

- 位置：`adlo/scripts/release.mjs:221-296`（`dirty` 仅 `log` @235-238，`--target` @260-261，Gitee `target_commitish: "main"` @294）；技能流程 `.agents/skills/adlo-release/SKILL.md`（步骤 1/3/5/6）
- 描述：`release:bump` 必改 4 个受版本控制的文件（`Cargo.toml`、`tauri.conf.json`、两个 `package.json`），因此按技能流程走到 `publish` 时工作区**必然是脏的**，`dirty` 告警必然触发——这种「必然响的告警」会被训练成噪声。真实后果仍在：`--target HEAD` 现在把 GitHub tag 钉在本地 HEAD，但 HEAD 里 `tauri.conf.json` 还是**旧版本号**（bump 未提交），而同一 tag 的 Gitee Release 又用 `target_commitish: "main"` 从远端默认分支建 tag——两个源上同名 tag 指向两个不同的提交，且都不含本次版本号。技能里也仍没有「bump 之后 commit + push」这一步（§1 的 `git status --short` 检查发生在 bump 之前，等于失效）。
- 证据：`release.mjs:235-238`（`if (dirty) log("warning…")`）；`:294`（`target_commitish: "main"`，Gitee API 接受 commit sha）；`SKILL.md` 发版流程 1→3→5→6 之间无提交动作；`verify`（`release.mjs:343-381`）只比对远端清单版本与 HEAD 的 `tauri.conf`，不校验 tag 内容。
- 建议修复：`publish` 在脏工作区或 `HEAD != origin/<branch>` 时默认 `fail`，提供显式 `--allow-dirty` 逃生；`gh release create --target` 与 Gitee `target_commitish` 都传同一个 `head` sha；技能流程在「升版本号」与「构建」之间补一步 `git commit -am "chore(release): vX.Y.Z" && git push`。

### F4 [severity: medium] [category: 设计] `target_key` / `newest_candidate` / `SourceCandidate` 无生产调用方，`INSTALLING_EVENT` 无订阅者

- 位置：`adlo/crates/update/src/lib.rs:21-37`（`target_key`）、`:84-100`（`newest_candidate` + `SourceCandidate`）；`adlo/src-tauri/src/commands/update.rs:31-34`（`INSTALLING_EVENT`）、`:199`（emit）；`adlo/frontend/src/shared/ipc/update.ts:39`（`onInstalling`）、`tauri-bridge/tauri-update.ts:19-22`
- 描述：`decide` 下沉后，`newest_candidate` 与 `SourceCandidate` 成了与 `decide` 语义重叠的**第二套择优 API**，两者都只有 `#[cfg(test)]` 调用；`target_key` 从头到尾没有生产调用方（清单的平台键由插件自己拼）。另外 `INSTALLING_EVENT` 的唯一订阅入口 `onInstalling` 全仓无消费者（`useAppUpdateWatcher` 只订阅 `onProgress`，切片在 `installAppUpdate` 里已自行置 `installing`），属于「发事件但没人听」的死链路。
- 证据：grep `target_key|newest_candidate` 命中只在 `lib.rs`（定义 + 测试）；grep `onInstalling` 只命中四个桥接实现与测试桩，无业务订阅；`review-brief.md:55` 与 §5.6「无调用方的 `pub` 包装应删除或降级」。
- 建议修复：删 `target_key` 或改为 `pub(crate)` 并在测试里 `#[cfg(test)]` 自用；删 `newest_candidate` / `SourceCandidate`（`decide` 已覆盖择优）；删 `INSTALLING_EVENT` + `onInstalling`（含三处桥接与 `shared/ipc/update.ts` 声明），或反过来让前端真的订阅它（在安装器真被启动时置 `installing`）。

### F5 [severity: medium] [category: 正确性] 回落会把「UI 显示的版本」和「实际安装的版本」拆开

- 位置：`adlo/src-tauri/src/commands/update.rs:120-186`、`:189-203`；前端 `adlo/frontend/src/app/stores/slices/appUpdateSlice.ts:145-186`
- 描述：`app_update_check` 报的是 `decide` 选中的最高版本（例如 Gitee 的 v0.3.0），前端把 `v0.3.0` 写进卡片与关于页。若 v0.3.0 的附件 404/被 CDN 拦截，`download_inner` 回落到另一源的 **v0.2.0** 并成功，`DownloadedUpdate` 里存的是 v0.2.0；`app_update_install` 不校验「已下载版本 == 当前展示版本」，直接安装。结果：用户看到「发现新版本 v0.3.0」，装完启动却是 v0.2.0，且界面没有任何提示。这条路径正是 F3 的修复新开出来的（上轮只有单源单版本时不可达）。
- 证据：`update.rs:126-131`（`candidates = [found.update] + found.alternates`）、`:164-173`（成功即写入该候选的 `update`）、`:189-203`（install 不做版本比对）；前端版本号唯一来源是 `appUpdateSlice.ts:167`（`appUpdateVersion: data.version`，即 check 的结果）。
- 建议修复：`ResolveFound` 里区分主候选与回落候选，回落成功时把实际版本回传前端（下载结果带 `version`，安装前校验），或直接**只回落同版本**（`alternates.retain(|update| update.version == primary.version)`）——同版本多源才是 ADR-0026 的原始诉求；跨版本回落要么禁用，要么在卡片上明示「现将安装 v0.2.0」。

### F6 [severity: medium] [category: 正确性] `error` 状态的更新卡片既无错误文案也无任何动作；`downloaded` 态会被后台检查打回 `available`

- 位置：`adlo/frontend/src/app/features/update/UpdateNotificationCard.tsx:63-160`（`showActions` @63、按钮分支 @133-146）；`adlo/frontend/src/app/stores/slices/appUpdateSlice.ts:93-97`、`:115-125`、`:197-224`
- 描述：F2 的修复让失败不再伪装成「已是最新」，但 `error` 在卡片里没有出口：`showActions` 只排除了 `installing`，而动作行只在 `available` / `downloaded` 渲染按钮，因此 `error` 会渲染出一个**空的动作行**——没有「重试/下载」、没有错误文案（`appUpdateError` 全仓无消费者，卡片的说明区只渲染 `notes`）。触发路径很日常：用户点「下载」→ 网络中断 → 状态 `error` → 卡片从此只剩版本号与说明，唯一恢复路径是去「关于」页点「重试」。反方向也有问题：`checkAppUpdate` 的守卫不排除 `downloaded`（`:93`），所以一次自动/手动检查会把 `downloaded` 覆盖成 `available`（`:164-175`），而壳层内存里那份已下载字节仍然有效——界面却重新显示「下载」，用户再点一次就是白下几十 MB。另外关于页只显示通用「检查失败」，`appUpdateError` 的具体原因（哪一源失败）从不展示。
- 证据：`UpdateNotificationCard.tsx:133-146`（只有 `status === 'available'` / `'downloaded'` 两组按钮）；grep `appUpdateError` 仅命中切片自身与测试，无任何 UI 读取；`appUpdateSlice.ts:93` 的守卫集合为 `checking|downloading|installing`。
- 建议修复：卡片在 `error` 时渲染失败文案 + 「重试」按钮（`downloadAppUpdate` 即可复用）；`checkAppUpdate` 在 `status === 'downloaded'` 时跳过（或检查结果版本相同则保持 `downloaded`）；关于页把 `appUpdateError` 作为 `title`/次行展示（注意脱敏，当前错误串只含来源 URL 与插件文本）。

### F7 [severity: low] [category: 正确性] 回落排序的比较器不满足全序，且唯一「覆盖排序」的用例只断言 `is_newer`

- 位置：`adlo/src-tauri/src/commands/update.rs:250-258`（`alternates.sort_by`）、`:317-325`（`is_newer_used_for_alternate_ordering`）
- 描述：比较器只返回 `Less` / `Greater`——两个候选版本相同或任一版本不可解析时（`is_newer` 双向都 `false`）会对同一对元素同时给出 `Greater`，违反 `Ord` 的传递/反对称约定，排序结果依赖实现细节（同版本双源谁先谁后就变成未定义，而「同版本多源」恰是最常见形态）。配套用例名叫「…用于候选排序」，实际只断言 `is_newer("0.2.0","0.1.9")`——该断言在 `lib.rs` 里已有等价用例，删掉 `update.rs:250-258` 的排序代码这条用例依然全绿，属 `review-brief.md` §5.9 的「标题承诺未覆盖」。
- 证据：`update.rs:252-257` 两个分支；`lib.rs:238-243` 中已存在同名语义的 `is_newer_compares_semver_not_string_order`。
- 建议修复：`alternates.sort_by(|l, r| match (parse_version(&l.version), parse_version(&r.version)) { (Some(a), Some(b)) => b.cmp(&a), ... })`；用例改为构造两个 `Update` 无法轻易做到时，至少把排序抽成 `fn sort_alternates(&mut Vec<Update>)` 的纯逻辑并在 `adl-update` 里对 `(version, source)` 元组断言顺序。

### F8 [severity: low] [category: 文档] 「只做稳定通道」还有两个缺口：prerelease 版本号字符串可入稳定清单、ADR-0026 的「应用自己预检清单」已与实现不符

- 位置：`adlo/scripts/release.mjs:221-230`、`adlo/scripts/release/manifest.mjs:23-27`；`docs/adr/0026-app-update-via-official-updater-dual-source.md:11,24`（正文第 11 行与 Consequence 第 2 条）
- 描述：① `--prerelease` flag 已被拒绝，但 `release:bump 0.2.0-rc.1` 仍可通过 `isVersion`（`manifest.mjs:23` 允许 `-pre`），`publish` 不校验版本号是否含预发布段，GitHub 侧也不会打 prerelease 标记 → `releases/latest` 会把 rc 当稳定版推给所有用户（ADR-0026 明文「只做稳定通道」）。② ADR-0026 决定段写「在交给插件前先用应用自己的代理感知 HTTP 客户端预检清单内容是否可用」，Consequence 又断言「插件只在非 2xx 时切换 endpoint，因此 200-但-是网关 HTML 必须由应用预检，否则永久失败」。本轮实现并没有预检，而是靠 `decide` 把该源判为 `Unavailable` 让另一源胜出——行为上更好，但 ADR 的两句绝对断言已不成立（`review-brief.md` §5.2.1 要求 ADR 与代码同轮对齐）。
- 证据：`release.mjs:226-230` 只拦 flag；`manifest.mjs:23` 的 `SEMVER` 含预发布段且被 `isVersion`/`buildManifest` 共用；`update.rs:221-266` 无预检步骤，`lib.rs:59-86` 才是实际兜底。
- 建议修复：`publish`/`build` 对 `version` 含 `-` 直接 `fail`（或在 `isVersion` 之外加 `isStableVersion`）；把 ADR-0026 的决定段与 Consequence 第 2 条改写为「每源独立检查，任一源异常不推翻另一源结论；200-非-JSON 由清单解析失败归为不可用」（P5 可一并处理，但代码侧缺口 ① 现在就该补）。

## 记录不修

- `adlo/crates/update/Cargo.toml:16` 的 `serde` 无任何使用（`lib.rs` 无 derive、无 `to_string`）——上轮已记，仍未清。
- `adlo/crates/update` 仍未加入 `adlo/.cargo/config.toml` 的 `debug=2` 白名单（其余自有 crate 逐个登记）。
- `adlo/src-tauri/tauri.conf.json:18-29` 的 `plugins.updater.endpoints` 与 `crates/update/src/lib.rs:20-23` 的 `UPDATE_SOURCES` 重复维护同一列表，壳层每条都用 `endpoints(vec![url])` 覆盖，配置里那份永不生效。
- `clean_inline_markdown`（`lib.rs:185`）的 `replace("__","")` 会把标识符里的双下划线吃掉（`__init__` → `init`）；发布说明里罕见，接受。
- `appUpdatePublishedAt` / `UpdateCheck.published_at` 全链路无渲染消费者（注释已如实写「前端目前不渲染」）。
- `release.mjs:235` 的 `spawnSync("git", …).stdout.trim()` 在 git 缺失/非仓库时 `stdout` 为 `null`，会抛未捕获 TypeError（`fail` 之外的路径）。
- `release.mjs:343-381` 的 `verify` 只校验 `signature` 存在不校验匹配，Gitee raw 请求也无 cache-busting（上轮已记）。
- `installer-hooks.nsh:12-22` 仍按镜像名杀该用户下所有 `adl-server.exe`（含另一个安装/开发实例）；应用侧 `terminate()` 是主路径，钩子只作兜底，接受。
- `adlo/package.json:20` 的 `build` 仍是裸 `cargo tauri build`（在无私钥环境会因 `createUpdaterArtifacts` 失败），文档已指路 `release:build`；未提供「无签名构建」脚本。
- `adlo/frontend/src/app/features/update/UpdateNotificationCard.tsx:114-127`：`total` 未知时进度显示 `…%`，属占位省略号语义，非缺陷。

## 已核对无问题（本轮重点）

- **签名不可绕过**：`app_update_download` 仍走插件 `Update::download()`，它在返回字节前 `verify_signature(&buffer, …)`（`updater.rs:740-747`）；`app_update_install` 安装的就是这份已验签的内存字节；回落候选同样经过 `download()` 验签，切换来源不会绕过签名。`tauri.conf.json` 未开 `dangerousInsecureTransportProtocol`，清单/附件全 https。
- **`decide` 与索引对齐**：`SourceState` 由 `results` 逐条 `map` 生成（`update.rs:227-235`），`Decision::Found(index)` 在 `:245-249` 直接索引 `updates`，没有重排造成的错配；`decide` 对不可解析版本跳过（`lib.rs:71`）不影响正确性，因为插件只用 `semver::Version` 比较版本（`updater.rs:576-579`），进入 `SourceState::Update` 的串必可解析。
- **`on_before_exit` 确实作用于被安装的那个 `Update`**：`Update` 持有 `context: UpdaterContext`（`updater.rs:671,599` 的 `self.context.clone()`），钩子存在 `context.on_before_exit`（`:335-340`），因此 `check_one` 里注册的钩子在 `install()` 时仍然生效；`download_inner` 重新 resolve 出来的候选也带同一钩子。
- **下载超时不会遗漏客户端连接**：`Update.timeout` 在插件里恒为 `None`（`updater.rs:595`）且 `download()` 自建 `ClientBuilder`（`:691-715` 不带检查期的 `.timeout()`），所以壳层的 `tokio::time::timeout` 是唯一兜底且必要；`downloading` 的 `swap(true)` 在 `await` 之前、`store(false)` 在 `await` 之后（`update.rs:112-118`），并发 IPC 只会起一次下载。
- **下载代理与检查同源**：`Update.proxy` / `no_proxy` 在 check 时从 builder 复制（`updater.rs:596-597`），下载时使用（`:701-706`），所以 F2 的代理修复会同时对下载生效，不会出现「检查走代理、下载直连」的新裂缝。
- **IPC 权限最小化**：三个命令只进 `permissions/digital-life.toml`（新增 3 行），`digital-life-commands` 仅挂 `main` 窗口，远程 `browser-remote` 未引入 `updater:default`。
- **Mutex / 锁中毒**：`update.rs:191-193`、`:166-173`、`:174-177` 均对 `Err(_)` 处理，不二次 panic；`adl_server.rs:131-145` 的 `terminate()` 用 `poisoned.into_inner()`。
- **sidecar 生命周期**：`terminate()` 走 `kill_child_tree`（taskkill `/T /F` + `child.kill()` + `child.wait()`）并清 `base_url`；被 `take()` 后 `Drop` 不会二次 kill；`CREATE_NO_WINDOW` 的 `CommandExt` 用法在 `adl_server.rs:104-111`、`:157-166` 正确，`dsh.rs:12-17` 用 tokio 固有 `creation_flags`（无需 `CommandExt`）。
- **错误字符串无敏感信息**：`check_one`/`download`/`install` 的错误只拼来源 URL、插件 Display 文本、`last_error`，不含代理凭据或令牌；`fail()` 打印的 Gitee 响应体不含 token（token 走 body/query，不透传进错误文本）。
- **跨端桥接一致**：`update` 域在 `httpBridge.ts:1300-1312`（`supported:false` + `taskNotSupported`）、`mock/mock-update.ts`（`supported:false`）、`preview-bridge/index.ts:312`（复用 mock）三处语义一致；`tauri-update.ts` 只是命令/事件转发。
- **清单生成**：`manifest.mjs` 产出 `version/notes/pub_date/platforms.windows-x86_64.{url,signature}` 与插件 `RemoteRelease` 解析字段一致；`downloadUrl` 四条 URL 在 `release-manifest.test.mjs:26-35` 有断言；`pub_date` 去掉毫秒以兼容 `time` 解析。
- **`build-stage-sidecar.ps1`**：显式分支替代 splat，`$ProfileArgs` 无残留引用，`$LASTEXITCODE` 检查保留。
- **`decide` 覆盖的真实分支**：`Unavailable + Update`、`UpToDate + Unavailable`、`Unavailable × 2`、`0.1.9 vs 0.2.0`、`0.10.0 vs 0.9.0`（`lib.rs:272-297`）——上轮 F10 指出的「删掉 `is_newer` 的 Err 分支也不会变红」已被消除（`is_newer` 不再是判定路径，改由 `decide` 承担并有 5 条用例）。

## 结论

- 需修复项：8（critical 0 / high 0 / medium 5 / low 3）
- 阻塞判断：F1/F2/F5/F6 影响真实用户路径（安装失败不可恢复、代理不通、装错版本、失败后卡片死路），建议本轮修；F3 属发版链路完整性，下次发版前必须修；F7/F8 可在同一轮顺手清掉。
- 上轮 13 项中 **9 项已闭合**（F2、F5、F6、F9、F11、F12、F13，以及 F3 的主路径与 F8 的 flag 路径），**3 项部分闭合**（F1、F7、F10），**1 项未闭合**（F4，保留理由不成立），另有 1 项保留理由不成立（F10 的 `target_key`）。
