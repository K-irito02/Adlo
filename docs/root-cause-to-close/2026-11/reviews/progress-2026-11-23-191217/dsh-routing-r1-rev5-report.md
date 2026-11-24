# P4 R1 复审报告 — dsh-routing（rev5）

## 范围

快照 `.review-diffs/manifest-rev5.md`（base `aced53d8e`，78 文件；只看 rev5 完整快照）中的本链路三文件：

- `adlo/crates/server/src/handlers/dsh.rs`
- `adlo/frontend/src/app/features/dsh/dshAuthUrl.ts`
- `adlo/frontend/src/shared/ipc/dsh.ts`

**rev4 → rev5 增量定位**（读 `.review-diffs/*-rev4.diff` 与 `*-rev5.diff`，未用 git 命令）：

- 上述三文件的 diff 索引行完全一致（`21d5fba55..b38be2d47` / `e3a291bff..e508a3695` / `d172233af..1c59b8e78`），即**字节级未改动**。
- 消费侧/相邻文件同样未变：`dshActions.ts`（`daa5635ed..09e4624cd`）、`dshActions.test.ts`（`5b42a3e7e..f601e5345`）、`mock-dsh.ts`（`859ae0c97..581825171`）、`StoreState.ts`（`847d9ca6e..ada1f9f59`）、`CenterEntryPage.tsx`（`4af52ac47..586dd482a`）、`CenterEntryPage.test.tsx`（`a1d14caa0..1aa79a9d1`）、`i18n/{zh-CN,en-US}/browser.ts`（`14a18c6c0..a7b359670` / `239320063..d87188def`）rev4/rev5 索引行一致。
- rev5 文件数 78 vs rev4 77：唯一新增是 `adlo/frontend/src/app/stores/slices/__tests__/browserDownloadsSlice.test.ts`（浏览器下载切片测试），不在 dsh 链路，不涉及本轮契约。
- 本链路**继承 rev3 结论 + rev4 定向复核结论**，本轮只做回归抽查与三文件逐句复核。

审查方式：只读源码 + 删除性推演。**未运行任何测试 / 门禁**，未启动 dev server / 浏览器 / headless，未占用任何端口、无后台进程，未写源码树内临时文件。

## 上轮问题关闭情况（逐条）

- **F1（low，`restartedForAuth` 在 `Ok{restarted:false,url:null}` 路径缺失）— 已关闭，无回归。** 当前 `dsh.rs:224-227` 在该分支写 `value["restartedForAuth"] = serde_json::Value::Bool(true)` 后 `return Ok(value)`；与 `:203`（`run_restart` Err 回退）、`:221`（成功重建 payload）一起，`needs_auth_restart(&value)` 为真时三条返回路径都带该键。`value` 是 `:178` 的 `let mut`，且 `run_open` 恒返回 `open_payload` 构造的 object，索引赋值语义成立。
- **F2（low，`dshAuthUrl` 把「dsh 自身 401 指引」写成所有失败的统一后果）— 已关闭，无回归。** `dshAuthUrl.ts:16-18` 仍按两种终态分写「外部实例仍在时由 dsh 展示 401 指引，已被重启流程终止时由浏览器显示连接错误」，与 `free_stale_dsh_on_default_port`（`dsh.rs:386-432`：识别/杀前失败进程仍在；杀后端口未释放或后续 spawn/loopback 失败则原 URL 无服务）及 `run_restart`（`:887-896`：`Ok` 透传、`NotFound` 折成 `{restarted:false,url:null}`、其余 `Err` 透传）的失败面逐一对应。

## `restartedForAuth` 三分支与注释一致性

触发条件只有一个入口：`dsh.rs:188 if needs_auth_restart(&value)`，即 `authenticated=false && external=true`（`:146-149`）。三条返回路径：

| 分支 | 位置 | 载荷 | 注释出处 | 一致性 |
| --- | --- | --- | --- | --- |
| A `run_restart` 返回 `Err(e)` | `:196-206`，标记 `:203` | 原始 `value`（原裸 URL、`authenticated=false`、`external=true`）+ `restartedForAuth=true` | `:192-195`「机会性升级…回退原始 URL…① 识别占用者失败（进程仍在 → dsh 401）② 杀了残留但新进程未起来（原 URL 无服务 → 连接错误）。两种情况都用 restartedForAuth 标记「尝试过」」 | 相符：Err 面正好覆盖 ①（`pids_listening_on` 失败、非 dsh 占用兜底 `:429`）与 ②（`:421` 杀后端口未释放、`run_open` 的 loopback/spawn 失败 `:645-652`） |
| B `run_restart` 返回非空 url | `:207-223`，标记 `:221` | `open_payload(url, freedPort=false, authenticated, external)` + `restartedForAuth=true`；`authenticated/external` 取 `run_restart` 透传值（`:891-892`） | `:166-167` 返回值形状说明；`:192-195` 只约束失败面 | 相符：成功时不再沿用原始 `authenticated=false/external=true`，避免把旧实例状态写进新地址 |
| C `run_restart` 返回空/`null` url（`NotFound` 折成 `{restarted:false,url:null}`） | `:224-227`，标记 `:226` | 原始 `value` + `restartedForAuth=true` | `:224-225`「同样标记尝试过，并保留原始 URL 交给调用方展示」 | 相符 |

- 无第四种 `needs_auth_restart` 为真却不标记的出口；`needs_auth_restart` 为假时 `:230 Ok(value)` 不尝试重启，也就不应有该键——与 `:167` 的 `restartedForAuth?` 可选声明一致。
- `dsh.ts:274-275` 字段注释「本次打开是否为了取得认证入口而尝试过重启 dsh（不保证成功）」对三分支都成立（A/C 为失败、B 为成功但字段语义只是「尝试过」）。
- 分支 B 的 `authenticated` 缺省兜底 `:216 unwrap_or_else(|| url_has_launch_token(&url))` 在当前 `run_restart`（`:891-892`）恒透传后实际走不到，属防御性兜底，保留。
- `dsh.ts:174-181`（`DshBridge.open`）、`dsh.ts:266-275`、`dshAuthUrl.ts:13-18` 三处文案与最终代码逐句相符；无新增绝对断言（rev5 无新注释，故不产生 `claims-ack-rev5.md`）。

## 新增发现

本轮 rev5 相对 rev4 在 dsh 链路零改动，**无新增需修复项、无回归**。

## 记录不修

- 整块修复（`dsh.rs:203/221/226`）仍无回归测试：删除这三行不会让任何 `cargo test` 变红；现有用例只覆盖纯函数 `url_has_launch_token`（`:1411-1419`）与 `needs_auth_restart`（`:1420-1437`）。handler 级用例需真起 `ServerState` + spawn dsh，成本高，rev2/rev3/rev4 已连续记录；「三条路径都标记」目前靠代码阅读可证。
- 死 URL 语义仍是既定折衷：C 分支回退的原始 URL 指向刚被 `free_stale` 杀掉的进程，前端会据此建/导航到死地址；`authenticated/external` 也保持旧值。两处注释已如实描述终态（`dsh.rs:192-195`、`dshAuthUrl.ts:16-18`），字段级 JSDoc（`dsh.ts:178`「失败回退原始 URL」）未提「可能已无服务」，字面不假、属可补一句的润色（rev4 记录项）。
- `restartedForAuth` 全仓仍无读取方（`grep` 仅 `dsh.rs` 写入点 + `dsh.ts` 声明/文案），目前是诊断性 wire 字段；语义自洽，保留。
- `DshBridge.open` 的 `@returns`（`dsh.ts:179`）与 `DshOpenResult` 头注释（`:261`）仍未提 `authenticated`/`external`/`restartedForAuth`；`openDsh` 的 `@returns`（`dshActions.ts:122`）仍只写 `{url, freedPort}`（rev2/rev3/rev4 记录的纯润色）。
- 重启成功后 `freedPort` 恒 `false`（`dsh.rs:220`），即使 `run_restart` 内部 `free_stale` 返回过 `true`；用户看不到「端口已释放并重启」卡片（rev2/rev3 记录项，未变）。
- `run_restart` 透传的 `authenticated`/`external` 仍未写进 `DshRestartResult`（`dsh.ts:84-88`）——内部专用字段，`restartDsh` 只读 `url`，对外契约注释未失真。
- **并发结论复核（对 rev4 记录项的纠正，不改变结论）**：rev4 记录「第二次调用会命中 fast path，无重复拉起风险」措辞不精确——并发 `/dsh/open` 的第二次可能被阻塞后自行 spawn，未必走 fast path；但重走锁序列（`run_open:509/523/529`、`run_restart:855-871`、`free_stale:386-432`）后，危险顺序「B 的 `run_restart` 在 A 刚 spawn 出托管实例后才 `guard.take()`」需要 B 的 `run_open` 仍观察到外部裸实例，而 A 的 `free_stale` 已确认端口释放（`:413-423`）+ B 侧 `check_port_fast` 复验（`:553`）会把缓存 ReuseRunning 判失效，B 要么自行 spawn、要么在持锁复查看到 A 的实例，故该顺序不可达；双重重启风险维持 rev4 的豁免结论。
- `dsh.ts:267`「`?token=`」与 `:268`「裸 URL 必 401」为产品前提（事项 7）而非可证事实；`url_has_launch_token` 只要求非空 token 值，不校验 token 有效性（过期 token 仍 `authenticated=true`，不触发重启）。属前提边界，暂不修。
- `shouldRefreshDshTab` 的 `existing.pathname === ''` 不可达（`dshActions.ts:46`）、只按 pathname 判根；浏览器模式 `navigateTab` 行为差异。rev1/rev2 记录项，未变。
- `docs/**`（ADR 0001、progress 文件、analysis）留 P5 同步；本轮未审（`manifest-rev5.md` 亦标注不写 diff）。

## 结论

- 需修复项：0（本轮零问题；rev4 两条 low 均保持关闭，无回归）
