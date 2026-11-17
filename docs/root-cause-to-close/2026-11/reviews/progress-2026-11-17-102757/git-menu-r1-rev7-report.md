# 事项3（Git 菜单六项能力）— R1 rev7 定向复核报告

审查对象：`.review-diffs/manifest-rev7.md`（base `afd628c1`，rev7）中的 rev7 快照，以及工作区对应源码。本轮只读：未改源码、未跑测试套件、未做变异实跑；可红性为静态推演（依赖点已在下文标注）。rev6→rev7 增量已逐文件比对（`git_helpers.rs` / `git.ts` / `git_staging_all.rs` / `gitStagingAll.test.ts` rev6 与 rev7 快照），确认改动范围仅限 packed-refs 检查与其用例。

## 范围与 rev6→rev7 增量

rev6 只剩 1 项：F1「packed-refs 结构检查调用了不存在的 `git packed-refs`，恒为 false」。rev7 的增量正好只有两处实现 + 两条用例：

- Rust `adlo/crates/workspace/src/git/git_helpers.rs:266-278`：`git packed-refs` → `run_git(root, &["rev-parse", "--git-path", "packed-refs"])`，再 `std::fs::read_to_string` 读取，按 ` <refname>` 后缀匹配；路径沿用 `is_absolute → root.join` 逻辑。
- preview `adlo/frontend/dev/previewWorkspaceService/git.ts:187-204`：同上，改为 `runGitCapture(..., ['rev-parse','--git-path','packed-refs'])` + `fsSync.readFileSync(packedAbsolute, 'utf8')`，`try/catch` 兜底为 false。
- 新用例：`git_staging_all.rs:187-203`（`discard_all_rejects_a_corrupt_packed_ref_instead_of_clearing_the_worktree`）、`gitStagingAll.test.ts:90-109`（`discardAll rejects a corrupt packed ref instead of clearing the worktree`）。两例都构造「删除 loose ref → 写 `0000…0 refs/heads/<branch>` 到 `packed-refs` → 断言 reject/Err 且 `tracked.txt` 仍在」。

## 上轮 F1 关闭确认

| 检查点 | 结论 | 依据 |
| --- | --- | --- |
| 数据源正确 | **关闭** | 两端都改为 `rev-parse --git-path packed-refs` 取真实文件路径后读文本；仓库内已无 `git packed-refs` 调用（grep `packed-refs` 仅剩 watch 元数据、helpers 注释与用例）。 |
| 解析格式 | **正确** | packed-refs 行格式为 `<oid> <refname>`；`line.trim().ends_with(" <refname>")`（Rust `lines()` 自动去 `\r`，preview 先 `trim()`）只命中目标分支，header（`# pack-refs with:`）与 peeled 行（`^<oid>`）都不匹配；refname 以 `refs/heads/` 开头、不含空格，无前缀误配（`feature/foo` 不会命中 `foo`）。 |
| 路径形态 | **正确** | `--git-path` 输出「绝对」或「相对 cwd」两种；两端都先判 `is_absolute` 再 `join(root)`，子目录仓库（`../.git/...`）与 linked worktree（common dir 绝对路径）都能命中同一 physical 文件。 |
| 失败方向 | **安全** | 读不到/路径解析失败 → `packedExists=false` → Unborn；packed 条目存在但提交不可解析 → `HeadState::Err` / `isUnbornHead=false` → 调用方在 `rm`/`clean` **之前**抛错，工作区不被触碰（与 loose-ref 用例同一路径）。 |
| 两端一致 | **一致** | Rust 与 preview 的判定顺序、读文件、后缀匹配语义逐行对应；仅调用原语不同（`run_git` / `runGitCapture`）。 |
| 范围收敛 | **是** | rev6→rev7 只改上述两个 packed 块 + 各加 1 条用例；`Present` 路径、unborn reset 路径、null-timeout 原语、kill 进程树等均未变，rev6 已关闭项无回归面。 |

## 计数核对（静态）

- Rust：`adlo/crates/workspace/src/git/**` 共 65 个 `#[test]`/`#[tokio::test]`，其中 12 个带 `#[ignore = "requires git in PATH"]`（git_branch 1、git_snapshot 7、git_worktree 3、git_vis/contributor 1），默认执行 **53** 例，与「Rust 53 例」口径吻合；新增 packed 用例（`git_staging_all.rs:187`）未 ignore，在 53 例内。
- preview：`gitStagingAll.test.ts` 共 **7** 个 `it`（unborn discard、unborn unstage、HEAD discard、空消息、loose 损坏、packed 损坏、null-timeout），与「preview 7 例」吻合；文件位于 `dev/` 下且命名 `*.test.ts`，被 vitest 默认 include 覆盖。
- 本轮未复跑两套测试（只读约束），上述为用例清单核对；"通过"沿用提交方口径。

## 可红性推演（逐端）

| 变异 | 结果 | 变红的断言/机制 |
| --- | --- | --- |
| Rust 把 `["rev-parse","--git-path","packed-refs"]` 改回 `["packed-refs"]` | **红** | `run_git` 走非零分支返回 `Err` → `.map(...)` 跳过 → `unwrap_or(false)` → `packed_exists=false`；loose ref 已被用例删除、`ref_exists=false` → `HeadState::Unborn` → `rm -r -f --cached --ignore-unmatch` + `clean -fd` 正常返回 `Ok(())` → `discard_all` 返回 Ok，`unwrap_err()` panic → `discard_all_rejects_a_corrupt_packed_ref…` 红（`tracked.txt` 也被 clean 删掉）。 |
| preview 把 `['rev-parse','--git-path','packed-refs']` 改回 `['packed-refs']` | **红** | `runGitCapture` 返回 `code≠0` → 命中 `!packedPath || packedPath.code !== 0 → return false` → `isUnbornHead=true` → `rm --cached`（null 超时）+ `clean -fd` 成功 → `discardAll` resolve → `rejects.toThrow()` 失败；随后 `existsSync(tracked.txt)` 也应为 false，双重变红。 |
| 只删 packed 段（不换成任何等价检查） | **红** | 同上：`packedExists` 恒 false → Unborn → 清理路径返回 Ok。 |
| 把 packed 判定改成 `show-ref --verify` 退出码语义（另一种正确实现） | 绿 | 语义等价，属允许的替代实现，不视为漏测。 |
| 保留新读文件逻辑但把 `ends_with` 改成 `includes` 或去掉空格 | 未覆盖 | 现有用例只含单一分支，无法区分；但误配需要 packed-refs 里存在子串相同的其它 ref，风险极低（见「记录不修」）。 |

**可红性的唯一依赖点**：改回后「`git rm -r -f --cached --ignore-unmatch -- .` 在 HEAD 指向不可解析 packed oid 时仍成功」。这与现有 unborn 用例（HEAD 不可解析、无 packed 条目）走的是同一 `git rm --cached -f` 路径；`-f` 跳过 `check_local_mod`/`check_removal_from_index`，`--ignore-unmatch` 跳过路径不匹配，`clean -fd` 不读 HEAD。因此旧实现会在用例里返回 Ok 并清空工作区 → 红。即便某版本 git 反而让 `rm` 失败（返回 Err/throw），用例会「绿」——但那时两端的清理路径已不可能在损坏 ref 上删除工作区，F1 的原始数据风险同样不存在；该分支不影响「修复后行为安全」的结论。此点与 rev6 的 loose-ref 用例共用同一前提。

## 新风险

- **无阻断性新风险**；未见新的破坏性路径、错误吞没点或双端分叉。
- 残余（low，非新增方向）：packed-refs 读取失败（权限/IO）与 `--git-path` 失败都折回 `false`（Unborn，fail-open）。相对 rev6 的「恒 false」已收窄到仅异常路径；若要与 loose ref 的 `ok_or_else` 同强度，可在两端把「文件存在但读失败」上抛，`NotFound` 才视为未打包。当前未做，不计入需修复。
- 残余（low）：packed 条目存在但对象缺失时，本实现报「损坏」，而个别 git 版本可能把 null-oid 条目视作 ref 不存在——本实现选择报错（拒绝 discard/restore），方向安全；仅错误文案可能不同于 git 原生。
- 记录不修：`ends_with` 后缀匹配理论上可被「同后缀 refname」误配（需 refname 以空格+目标名结尾），git refname 不含空格，实际不可构造；packed-refs 文本读取为一次性全量，大仓库（数万 refs）仅在损坏/unborn 分支额外一次读文件，量级可忽略。
- 既有记录不修项（preview 其它本地操作 30s、`discardFile` 兜底、taskkill 竞态、服务端任意 `workspacePath`）本轮无变化。

## 结论

- rev6 F1 已关闭：两端都改为读真实 `packed-refs` 文件，解析/路径/失败方向正确，双端一致；packed 变体用例已各补一条，且改回 `git packed-refs` 会让两端的 packed 用例变红（唯一前提与 rev6 loose 用例相同）。
- 计数口径核对通过（git 模块 65 个测试、12 个 ignore → 53 例执行；preview 7 例）；本轮未实跑，属静态核对。
- 无新风险需要修复。

需修复项：0
