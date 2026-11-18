# R1（正确性）审查报告 — 应用内自动更新 · 后端 / 发布链路 · rev1

## 范围

- 仓库根：`E:/AI-DIGITAL-LIFE/SourceWorkspace-worktrees/slot-2`
- 快照清单：`.review-diffs/manifest-rev1.md`（base `21ff18447e8c621c6b4eddd4cf8cedd189a2582e`，62 文件）
- 本报告只审**后端与发布链路**，输入 diff：
  - `.review-diffs/adlo_crates_update_src_lib.rs-rev1.diff`
  - `.review-diffs/adlo_crates_update_Cargo.toml-rev1.diff`
  - `.review-diffs/adlo_src-tauri_src_commands_update.rs-rev1.diff`
  - `.review-diffs/adlo_src-tauri_src_adl_server.rs-rev1.diff`
  - `.review-diffs/adlo_src-tauri_src_main.rs-rev1.diff`
  - `.review-diffs/adlo_src-tauri_tauri.conf.json-rev1.diff`
  - `.review-diffs/adlo_src-tauri_installer-hooks.nsh-rev1.diff`
  - `.review-diffs/adlo_src-tauri_permissions_digital-life.toml-rev1.diff`
  - `.review-diffs/adlo_crates_server_src_handlers_dsh.rs-rev1.diff`
  - `.review-diffs/adlo_scripts_release.mjs-rev1.diff`
  - `.review-diffs/adlo_scripts_release_manifest.mjs-rev1.diff`
  - `.review-diffs/adlo_scripts_build-stage-sidecar.ps1-rev1.diff`
- 上下文只读核对：`adlo/Cargo.toml`、`adlo/.cargo/config.toml`、`adlo/src-tauri/Cargo.toml`、`adlo/src-tauri/capabilities/*.json`、`adlo/src-tauri/src/adl_server.rs`、`adlo/src-tauri/src/main.rs`、`adlo/crates/download-source/src/lib.rs`、`tauri-plugin-updater-2.12.0/src/updater.rs`、`time-0.3.53/src/offset_date_time.rs`、前端契约文件（仅用于判断后端契约是否被消费）。
- 未运行 git diff/show；未运行测试套件；未启动 dev server / 浏览器（无端口占用，无后台进程遗留）。

## 上轮问题关闭情况

rev1 为**首轮**，无上轮项。

## 新增发现

### F1 [severity: high] [category: 正确性] 安装失败路径把应用留在「窗口已隐藏 + sidecar 已杀」的不可恢复状态

- 位置：`adlo/src-tauri/src/commands/update.rs:171-194`（尤其 `183-193`）；`adlo/src-tauri/src/adl_server.rs:131-142`
- 描述：`app_update_install` 的顺序是「`guard.take()` 取走下载结果 → 隐藏主窗口 → `ad_server.terminate()` → `install()`」。`install()` 在 Windows 上要先 `extract()` 把安装包落盘，再 `ShellExecuteW`，只有**成功**才 `std::process::exit(0)`；`extract` 失败（临时目录不可写 / 磁盘满 / 杀软删文件）或 `ShellExecuteW` 返回值 ≤32 时只是 `Err`，进程继续活着。此时：窗口已隐藏（无托盘可恢复，`main.rs:81-89` 只在页面加载完成时 `show()` 一次）、sidecar 已死且 `base_url` 被置 `None`、下载的字节已被 `take()` 丢弃。前端拿到 `Err` 后 `appUpdateStatus='error'`，但用户**看不到**任何东西，只能任务管理器杀进程；下一次启动前所有业务 IPC 都因 `ad_server.base_url()?` 为 `None` 失败（`commands/app.rs:29-30,74`）。
- 证据：
  - 插件 `tauri-plugin-updater-2.12.0/src/updater.rs:841-882`：`let updater_type = self.extract(bytes)?;` 先于一切副作用；`if result as isize <= 32 { return Err(...) }`；仅成功路径 `std::process::exit(0)`。
  - 插件同文件 `333` 行存在专门为此设计的 `on_before_exit` 钩子（`install_inner` 在 `extract` **之后**、执行安装器**之前**调用），当前实现没有用它，而是自己在调用前做不可逆副作用。
  - `adl_server.rs:131-142`：`terminate()` 只在成功拿到写锁时清 `base_url`；没有任何重启 sidecar 的代码路径（grep `ad_server`/`AdServerHandle` 只有 spawn 与查询）。
- 建议修复：把「隐藏窗口 + 结束 sidecar」放进 updater builder 的 `on_before_exit`（或至少在 `install()` 返回 `Err` 时 `window.show()` + 恢复/重建 sidecar + 保留 bytes 供重试）；`downloaded` 只在确认安装器已启动后再清空；`INSTALLING_EVENT` 应在真正启动安装器时发，而不是在不可逆操作之前。

### F2 [severity: high] [category: 正确性] 单源失败被折叠成「整体失败」，而前端不读 `error`，最终一律显示「已是最新」

- 位置：`adlo/src-tauri/src/commands/update.rs:196-216`（判定）、`:63`、`:78-79`（注释契约）；前端同轮 `adlo/frontend/src/app/stores/slices/appUpdateSlice.ts:113-127`、`adlo/frontend/src/shared/ipc/update.ts:20`
- 描述：`resolve_update` 只有在「所有来源都成功且都报无更新」时才 `UpToDate`；只要有一个来源报错，即使另一个来源明确回答「无更新」，也被判成 `Failed`。后端把失败塞进**成功返回**的 `UpdateCheck.error`（命令本身永不 `Err`），但前端 `checkAppUpdate` 完全不读 `data.error`：`!data.available` 分支直接 `appUpdateStatus='idle'`、`appUpdateError=null`、`appUpdateUpToDate=true`，关于页据此显示「已是最新 · 刚刚检查」。于是：
  - 两个来源都不可达 → 显示「已是最新」；
  - Gitee 正常返回「无更新」+ GitHub 被墙/超时（大陆常见），或反之 → 后端判 `Failed`、前端仍显示「已是最新」。
  即「错误被误当成已是最新」已在真实路径上发生。同时 `update.rs:63`（「仅当**所有**来源都失败时给出」）、`:196-197`（「全部报错才算 Failed」）、`useAppUpdateWatcher.ts:19`（「只有关于页的手动检查才展示错误」）三处注释与实现相反。
- 证据：`update.rs:210-216` 的 `if found.is_empty() { if errors.is_empty() { UpToDate } else { Failed } }`；`appUpdateSlice.ts:113-127` 无任何 `data.error` 读取（grep `appUpdateError` 只有 `result.error.message` 赋值，无 UI 消费）；`shared/ipc/update.ts:20` 复述了同一错误契约。另：ADR-0026 明文要求「在交给插件前先用应用自己的代理感知 HTTP 客户端预检清单内容是否可用」，当前实现无预检，只靠逐源调用插件（这本身比插件默认的 endpoint 列表更容错，但缺少「该源不可用」这一分类维度，正好被本条的折叠逻辑吃掉）。
- 建议修复：按源记录三态（`Update` / `UpToDate` / `Unavailable`），只要有一源回答 `UpToDate` 且无人报 `Update` 就返回 `UpToDate`；只有**全部** `Unavailable` 才 `Failed`。同时二选一：后端在无可用答案时返回 `IpcResult::err`，或前端消费 `data.error` 并把状态置 `error`。改完后同步修正上述三处注释与 `shared/ipc/update.ts` 的契约注释。

### F3 [severity: medium] [category: 正确性] 择优只比版本号，选中的源下载失败后不会回落到另一源

- 位置：`adlo/src-tauri/src/commands/update.rs:130-165`、`:218-235`
- 描述：`app_update_download` 重新 `resolve_update` 后只对**一个**候选调用 `download()`，失败即 `AppError::Network`，没有任何「换另一个来源再试」的路径。后果：Gitee 清单版本更高（或同版本但先命中）而其附件 404 / 被区域 CDN 拦截时，即使 GitHub 上同版本的附件完好，用户也永远装不上（清单版本号更高 → 永远压过 GitHub 的有效条目）。这与 ADR-0026 选择双源的初衷（「避免某一次发版漏更新 Gitee 清单后用户永远收不到更新」）正好相反：漏传的是**附件**时没有兜底。
- 证据：`update.rs:130-136` 只处理 `Found/UpToDate/Failed` 三态；`update.rs:141-157` 单次 `resolved.update.download(...)`；`update.rs:153-165` 失败分支没有任何重试或候选切换。
- 建议修复：`resolve_update` 返回**按版本降序的候选列表**，`download` 逐个尝试（捕获下载/签名失败后切换下一个）；或对「同一版本存在多源」时按来源顺序提供 fallback URL。

### F4 [severity: medium] [category: 正确性] 更新检查的代理解析与应用其余下载链路语义不一致

- 位置：`adlo/src-tauri/src/commands/update.rs:252-278`
- 描述：`apply_proxy` 自己重写了一套代理策略，与本仓库既有真源 `adl-download-source` 的行为有三处实质差异：
  1. `Manual` 模式用 `https_proxy.or(http_proxy)` **跨字段回退**，而 `download-source` 明文规定 https 只认 `https_proxy`、只有 `http_proxy` 时 https 目标直连（`crates/download-source/src/lib.rs:229-246`、`:946` 注释「不做跨字段回退」）。结果：更新请求可能走上用户没打算给 https 用的代理。
  2. 完全忽略 `config.proxy.no_proxy` 直连名单（`lib.rs:220-235` 是实现了的）。
  3. `Manual` 下端点解析失败时**静默改直连**（`update.rs:271-273`），而该 crate 明文「手动模式不做回退：用户显式填的代理失败时应当报错」；`Auto` 模式也没有该 crate 的「代理端点不可达 → 直连」保护（`lib.rs:262-274`，注释记录了 2026-10-30 用户实测的残留环境变量场景）。在该场景下更新检查会整体失败。
- 证据：上述行号；`update.rs:257` 读的就是同一份 `download-sources` 配置（`state.storage.paths().root`）。
- 建议修复：把「代理配置 → reqwest/UpdaterBuilder」抽成一处的共享函数（或让 updater 复用 `build_http_client` 的解析结果），至少补齐 `no_proxy` 与「Manual 不回退」两条明文规则。

### F5 [severity: medium] [category: 副作用] `createUpdaterArtifacts: true` 使普通构建在无私钥环境直接失败，而仓库仍把 `cargo tauri build` 当发布构建入口

- 位置：`adlo/src-tauri/tauri.conf.json:34`（`bundle.createUpdaterArtifacts`）；受影响文档：`RELEASE-CHECKLIST.md:40`、`.agents/rules/commands.md:203`
- 描述：开启 `createUpdaterArtifacts` 后，Tauri CLI 在**未设置** `TAURI_SIGNING_PRIVATE_KEY` / 密码时直接以 `A public key has been found, but no private key` 失败（`plugins.updater.pubkey` 已内置，所以必然触发），而 `adlo/package.json:20` 的 `build` 仍是裸 `cargo tauri build`、`commands.md:203` 明写「release 打包用 `pnpm run build`」、`RELEASE-CHECKLIST.md:40` 的发布步骤也是 `cargo tauri build`。任何没有私钥的开发机/CI 现在都无法产出安装包，且报错信息不指向 `release:build`。
- 证据：Tauri 官方 updater 文档「If createUpdaterArtifacts is on but those env vars are unset, tauri build fails」；tauri-apps/tauri#15638 的原始报错文本；本仓库 `e2e:build` 用 `--no-bundle` 所以不受影响，`pnpm run build` 受影响。
- 建议修复：本轮同步把 `RELEASE-CHECKLIST.md` / `commands.md` 的发布构建改指 `release:build`，并提供明确的「无签名构建」入口（如 `build:unsigned` → `cargo tauri build --config '{"bundle":{"createUpdaterArtifacts":false}}'`），避免有人靠删配置绕过。

### F6 [severity: medium] [category: 正确性] `release:build` 在「密钥以内容形式注入」时仍然强制要求 `~/.tauri/adlo.key` 存在

- 位置：`adlo/scripts/release.mjs:156-165`
- 描述：脚本先无条件 `existsSync(keyPath)` 并把缺失当致命错误，**之后**才判断 `TAURI_SIGNING_PRIVATE_KEY` 是否已设置。Tauri 官方支持该变量直接放私钥内容（CI Secret 的标准形态），而 `adlo-release` 技能的失败处置表也写着「检查 `TAURI_SIGNING_PRIVATE_KEY`（路径或内容）」——与实现矛盾。在没有该文件、只设了内容的环境里脚本会在启动 cargo 之前退出。
- 证据：`release.mjs:157-162` 的检查顺序；`process.env.TAURI_SIGNING_PRIVATE_KEY` 只在 `:163-165` 用于「为空则填路径」。
- 建议修复：仅在 `TAURI_SIGNING_PRIVATE_KEY` 与 `TAURI_SIGNING_PRIVATE_KEY_PATH` 都未设置时才要求默认文件存在。

### F7 [severity: medium] [category: 正确性] `publish` 不校验版本号已提交/推送，`gh release create` 会把 tag 指到远端旧提交

- 位置：`adlo/scripts/release.mjs:217-255`（`gh release create <tag>` 未带 `--target`）、`:273`（Gitee `target_commitish: "main"`）
- 描述：`release:bump` 只改工作区文件（`Cargo.toml` / `tauri.conf.json` / 两个 `package.json`），技能流程里 bump 之后直接 build → publish，**没有 commit/push 步骤**（`adlo-release` §发版流程 3→6）。而 `gh release create` 在 tag 不存在时会用远端默认分支最新提交建 tag，不是本地 HEAD。结果：release tag 指向一个**不含本次版本号**的提交，且本地 `Cargo.lock` 还会被构建改动（脏工作区）。`publish` 对此没有任何检查。
- 证据：`release.mjs:217-221` 只校验 tag 与 `tauri.conf` 版本一致，`:235-255` 未传 `--target`；`:224-226` 读 notes 前也没有 `git status` 校验。
- 建议修复：`publish` 开头校验 `git status --short` 干净且 `HEAD == origin/<branch>`（或要求 `--allow-dirty` 显式跳过），并给 `gh release create` 传 `--target <本机 HEAD sha>`；在技能流程里补「提交并推送 bump」这一步。

### F8 [severity: medium] [category: 正确性] `verify` / `publish --prerelease` 会把预发布写进稳定通道清单

- 位置：`adlo/scripts/release.mjs:250-254`（GitHub 侧跳过 prerelease）、`:296-302`（无条件下发 Gitee 稳定清单）
- 描述：`publish --prerelease` 只影响 GitHub（`releases/latest` 会跳过它），但脚本仍然把 rc 版本写进 `release/latest.json`——而 Gitee 清单是**稳定通道的唯一指针**（ADR-0026「只做稳定通道」）。同一版在两个源上的可见性相反：GitHub 用户看不到，Gitee（大陆主路径）用户被推 rc。随后 `verify` 也会失败（GitHub `releases/latest/download/latest.json` 仍是上一版，`:338` 版本不匹配），技能里没有任何说明。
- 证据：`:250-254` 的 `--prerelease` 分支；`:296-302` 无 `if (!prerelease)` 保护；`:321-345` 的版本一致性断言。
- 建议修复：按 ADR-0026 直接拒绝 `--prerelease`（只做稳定通道），或 prerelease 时跳过 Gitee 清单更新并在 `verify` 里跳过 GitHub 稳定地址断言。

### F9 [severity: medium] [category: 正确性] 下载没有超时、没有取消、也没有并发/重入保护

- 位置：`adlo/src-tauri/src/commands/update.rs:129-165`
- 描述：`CHECK_TIMEOUT` 只设在 `check` 用的 builder 上；插件把 `Update.timeout` 固定为 `None`（`tauri-plugin-updater-2.12.0/src/updater.rs:595`，下载侧 `:698-700` 直接用 `self.timeout`），所以 `download()` 没有任何读超时。加上：同一 `UpdateState` 没有「下载中」标记，两个调用会并行下载并互相覆盖；前端在 `downloading` 状态会拒绝重试（`appUpdateSlice.ts:190-192`），因此一次 CDN 半挂（连上但不发数据）就能让卡片永远停在某个百分比，只能重启应用。
- 证据：上述插件行号；`update.rs:138-157` 的闭包无取消通道；`update.rs:153-165` 成功才写状态，失败不动状态（旧字节仍留在内存里）。
- 建议修复：给下载加超时/可取消（`tokio::time::timeout` 包住 `download`，或记录 `Instant` 在进度回调里超时中止），并在 `UpdateState` 里加 `downloading: bool` 拒绝重入；失败时清空旧 `DownloadedUpdate`，避免安装到过期版本。

### F10 [severity: medium] [category: 设计] 择优逻辑在壳层重写，`newest_candidate` / `target_key` 无生产调用方，真正的判定路径无测试

- 位置：`adlo/crates/update/src/lib.rs:21-27`（`target_key`）、`:43-59`（`newest_candidate`）、`adlo/src-tauri/src/commands/update.rs:218-235`（重写的择优）
- 描述：crate 文档写「放在独立 crate 里的原因是这些规则需要单元测试」，但生产代码只用了 `UPDATE_SOURCES` / `is_newer` / `summarize_notes`；`target_key` 与 `newest_candidate` 零调用方（只有 `#[cfg(test)]` 用），`resolve_update` 则把「取最新」重写了一遍。于是：① 违反「仅测试调用的 `pub` 包装应删除或降级」；② F2 的失败分类、同版本先命中、不可解析版本这些真实分支完全没有测试保护（删掉 `is_newer` 的 `Err` 分支也不会变红）。若要靠测试防住 F2，判定必须搬进纯逻辑层。
- 证据：`grep adl_update::|newest_candidate|target_key` 只有 `UPDATE_SOURCES`/`is_newer`/`summarize_notes` 被 `src-tauri` 引用；`update.rs:218-235` 与 `lib.rs:49-59` 是同一逻辑的两份实现；`lib.rs` 测试只覆盖 `newest_candidate`/`target_key`/`is_newer`/`summarize_notes`。
- 建议修复：把「每源三态 → (UpToDate | Found | Failed) + 择优」做成 `adl-update` 的纯函数（输入 `&[(source, Result<Option<ver>, err>)]`）并补测试；删除 `target_key` 或让壳层真的用它做 target 校验，避免两份实现漂移。

### F11 [severity: low] [category: 文档] `published_at` 注释写「RFC 3339」，实际是 `time::OffsetDateTime` 的 `Display` 格式

- 位置：`adlo/src-tauri/src/commands/update.rs:59-60`、`:101`
- 描述：`resolved.update.date.as_ref().map(|date| date.to_string())` 产出的是 `time` crate 的 Display 形式（`YYYY-MM-DD H:MM:SS.s +HH:MM:SS`，日期与时间之间是空格、偏移带秒），不是 RFC 3339。当前前端没有消费者（`appUpdatePublishedAt` 只透传，关于页与卡片都不渲染），所以暂无用户可见错误，但契约注释会误导第一个使用者（`new Date(...)` 在 Chromium 下会是 `Invalid Date`）。
- 证据：`time-0.3.53/src/offset_date_time.rs:1629-1656`（`fmt_into_buffer` 写入 `date` + `b' '` + `offset`）；前端 grep `publishedAt` 无更新卡/关于页消费。
- 建议修复：显式 `date.format(&time::format_description::well_known::Rfc3339)`（`format` 已开启时）或把注释降级为「时间戳字符串，格式由插件实现决定」。

### F12 [severity: low] [category: 文档] `summarize_notes` 声称「去掉 Markdown 记号」，实际只剥行首/行尾

- 位置：`adlo/crates/update/src/lib.rs:68-72`（`summarize_notes` 文档）、`:100-106`（`clean_markdown_line`）
- 描述：`clean_markdown_line` 只做 `trim_start_matches(['#','>','*','-','+','`','_'])` 与 `trim_end_matches(['*','_','`'])`。行内记号原样保留：``"修复 `a` 崩溃"`` 仍是 ``修复 `a` 崩溃``，`**重点**`、`[链接](url)`、`~~删除~~` 都不会被处理；而文档与 ADR-0026 都承诺「卡片不渲染 Markdown，所以必须产出纯文本，否则用户会看到 `## ` 之类的原始记号」。列表行内的 `` ` `` 和链接是最常见形态，用户会看到原始记号。
- 证据：实现只处理行首/行尾；`lib.rs` 测试只覆盖「行首 `##`/`-`」与空输入、截断，没有行内记号用例。
- 建议修复：要么补行内清理（反引号、`[text](url)` → `text`、`**`/`_` 成对去除）并加用例，要么把注释/ADR 的措辞降级为「去掉行首的块级记号，行内记号保留」。

### F13 [severity: low] [category: 安全] NSIS 钩子：`nsExec::Exec` 返回值未 `Pop`，且按镜像名/搜索顺序调 `taskkill`

- 位置：`adlo/src-tauri/installer-hooks.nsh:11-19`
- 描述：① `nsExec::Exec` 会把退出码压栈，两个宏都没有 `Pop $0`，在 makensis 生成的安装器里留下未平衡的栈（Tauri 模板同一 section 里后续若有 `Pop`，会取到错误值）。② `taskkill /IM adl-server.exe /T` 按镜像名杀该用户下**所有** `adl-server.exe`（含另一个 Adlo 安装或开发实例），不限定安装目录；③ 未写绝对路径，`CreateProcess` 会先搜当前目录，理论上可被同目录同名程序劫持（需要已有本地写权限，风险很低）。④ `DetailPrint` 里用了非 ASCII 省略号，`.nsh` 以 ANSI 读取时可能显示为乱码（需真实打包验证，未实跑）。
- 证据：宏体全文；NSIS `nsExec` 文档约定返回码在栈上。
- 建议修复：`nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM adl-server.exe /T'` + `Pop $0`；更好的是按安装目录过滤（`/FI "IMAGENAME eq adl-server.exe"` 不够，可用 `wmic`/`taskkill` 结合路径判断，或保留应用侧 `terminate()` 为主、钩子只做兜底）；`DetailPrint` 改纯 ASCII。

## 记录不修（可选 / 已记录理由 / 不影响本轮结论）

- `adlo/src-tauri/src/commands/update.rs:153-165`：下载失败时旧的 `DownloadedUpdate` 仍留在 `Mutex` 里（约几十 MB），且 `install` 不校验「已下载版本 == 当前可用版本」。当前 UI 在 `error`/`available` 状态下不暴露安装按钮（`UpdateNotificationCard.tsx:152-160`），只有直接调 IPC 才可能装到旧版本，故按 low 记录（建议仍在 F9 的修复里顺手清空）。
- `adlo/src-tauri/tauri.conf.json:41-44` 与 `adlo/crates/update/src/lib.rs:20-23` 重复维护同一份来源列表；壳层每条都用 `endpoints(vec![url])` 覆盖，`tauri.conf` 的 `endpoints` 永不生效。建议删掉配置里的 `endpoints` 或加注释指路，避免下次只改一处。
- `adlo/crates/update/Cargo.toml:16` 的 `serde` 无任何使用（`lib.rs` 未引用）。
- `adlo/crates/update` 未加入 `adlo/.cargo/config.toml` 的 `debug=2` 白名单（其余自有 crate 逐个登记），debug 构建下该 crate 调试信息会降为 `1`。
- `release.mjs:321-345` 的 `verify` 只校验 `signature` **存在**，不校验它与产物匹配；且 Gitee raw 请求无 cache-busting，CDN 命中旧清单时可能误判 OK。发布后的真实验签只能靠客户端 `download()`（插件已实现，见 F 区外的「已核对无问题」）。
- Gitee 令牌以 query 形式出现在 `release.mjs:309`（Gitee v5 API 的要求）；已核对 `log`/`fail`/`run` 的输出路径不会打印 token 或 `process.env`，无令牌泄漏。默认 Gitee Release 非幂等（GitHub 成功后 Gitee 失败需要手工补），已由 `adlo-release` 技能「失败处置」记录，不再计为需修复。
- `adlo/scripts/release.mjs:224-226`：`--notes-file` 指向不存在的文件时是未捕获异常（堆栈直出），非致命。

## 已核对无问题（本轮重点项）

- **签名不可绕过**：`app_update_download` 用的是插件 `Update::download()`，它在返回字节前调用 `verify_signature(&buffer, &self.signature, &self.context.config.pubkey, ...)`（`tauri-plugin-updater-2.12.0/src/updater.rs:740-748`）；`app_update_install` 安装的就是这份已验签的内存字节（同一 `DownloadedUpdate`），中间落盘只发生在 `install()` 内部、来源是已验签字节。`tauri.conf.json` 未开 `dangerousInsecureTransportProtocol`，endpoint 全 https。两个源共用同一把公钥/同一份附件，符合 ADR-0026。
- **IPC 权限最小化**：三个命令只加进 `permissions/digital-life.toml`（`digital-life-commands` 仅挂在 `main` 窗口，`capabilities/default.json:5,25`）；远程内容的 `browser-remote` 只拿到 `core:default`（`capabilities/browser-remote.json:9-11`），未引入 `updater:default`，插件 JS API 对前端不可达。
- **Mutex 中毒**：`update.rs` 两处 `lock()` 都对 `Err(_)` 返回 `AppError::Internal`，不会二次 panic；`adl_server.rs:131-142` 的 `terminate()` 用 `poisoned.into_inner()` 拿回内层。
- **sidecar 生命周期**：`terminate()` 走 `kill_child_tree`（taskkill `/T` + `child.kill()` + `child.wait()`），确实等待退出；`Drop` 路径不受影响（已被 `take()` 的 child 为 `None`，不会二次 kill）。`CREATE_NO_WINDOW` 的 `CommandExt` 用法在 `adl_server.rs:104-111`、`:161-166` 正确；`dsh.rs:185-191` 用的是 `tokio::process::Command` 的固有方法 `creation_flags`（`tokio-1.53.0/src/process/mod.rs:675`），无需 `CommandExt`，不会漏 import。
- **错误字符串无敏感信息**：`check_one`/`download` 的错误只拼来源 URL 与插件 Display 文本，不含代理凭据或令牌。
- **清单格式**：`manifest.mjs` 产出 `version/notes/pub_date/platforms.{windows-x86_64}.{url,signature}`，与插件 `RemoteRelease` 解析字段一致；`downloadUrl` 生成的四条 URL 形态与 Gitee/GitHub 实际下载路径一致（`release-manifest.test.mjs:26-35` 有断言）。
- **`build-stage-sidecar.ps1`**：去掉数组 splat 后 `--release` 走显式分支，`$ProfileArgs` 已无残留引用，`$LASTEXITCODE` 检查保留。

## 结论

- 需修复项：13（critical 0 / high 2 / medium 8 / low 3）
- 阻塞判断：F1、F2 建议本轮内修；F3/F4/F9 影响真实用户路径（单源不可用、代理不通、下载卡死）；F5/F6/F7/F8 属发布链路，必须在下次发版前修。
