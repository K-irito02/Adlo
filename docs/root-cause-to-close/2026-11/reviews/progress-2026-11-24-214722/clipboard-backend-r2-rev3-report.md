# clipboard-backend — R2 rev3 报告（死代码 / 冗余守卫 / 多余防御 / 诊断日志）

- 工作树：`E:\AI-DIGITAL-LIFE\SourceWorkspace-worktrees\slot-1`
- base：`595216f1f`，快照：`.review-diffs/*-rev3.diff`（35 文件 / 3 commits），manifest：`manifest-rev3.md`
- 审查口径：R2 只查**死代码、冗余守卫、根因修后多余的防御、应删/降级的诊断日志**；正当错误处理、边界校验、生产 `warn` / `error` 不计问题（简报 §2/§5、`review-brief.md`）
- 只读约束：未运行 `git diff/log/show`、未改源码/配置、未跑任何测试套件。结论来自读 rev3 快照 + 读当前源码（绝对路径）+ 删除性推演。未启动 dev server / 浏览器 / headless Chrome，无端口占用、无后台进程。

## 范围

| 文件（clipboard-backend scope） | rev3 改动 | R2 结论 |
| --- | --- | --- |
| `adlo/crates/clipboard/src/store.rs` | 新增 `MAX_HISTORY_ITEMS`、`prune_to`、启动/插入后裁剪、3 个用例 | 无死代码/冗余守卫；返回值面为测试专供，见「记录不修 2」 |
| `adlo/crates/clipboard/src/lib.rs` | `pub use store::{ClipboardStore, MAX_HISTORY_ITEMS}` | `pub` 有跨 crate 消费方（`handlers/clipboard.rs:20`），符合 §5.6 |
| `adlo/crates/clipboard/src/monitor.rs` | 原静默 `Err(_)` 改为 `error!` / `warn!`，新增 info/debug 埋点 | 生产 `error`/`warn` 正当；info 粒度见「记录不修 4」 |
| `adlo/crates/clipboard/Cargo.toml`、`adlo/Cargo.lock` | 新增 `tracing` 依赖 | 被 `store.rs` / `monitor.rs` 实际使用，非空依赖 |
| `adlo/crates/server/src/engine.rs` | `spawn_keepalive`（`loop { park() }`）+ 1 个用例 + 1 条 info | 死绑定见「记录不修 1」；泛型仅测试实例化见「记录不修 3」 |
| `adlo/crates/server/src/handlers/clipboard.rs` | `min(500)` → `min(MAX_HISTORY_ITEMS)`，注释同步 | 该 `.min()` 是查询上限的输入收敛（去掉会让 `limit>1000` 撞存储安全上限），属正当边界校验，不计冗余防御 |

上下文只读核对（不产 finding）：`docs/adr/0034-clipboard-history-retention-cap.md` 与实现逐条一致（500 上位、启动+入库各裁一次、按 `created_at` 降序、连 sidecar 一起删、裁剪失败只告警不回滚）；`frontend/.../utilitiesActions.ts:24` 的 500 与常量对齐。

## 上轮问题关闭情况（逐条：已关闭 / 未关闭 + 理由）

1. **R1 rev3 主表：无 finding（0 critical / 0 high / 0 medium / 0 low）** — 维持关闭。
   - 复核方式：rev3 快照与 R1 rev3 报告所述内容一致（store.rs 仅测试段改为 `list(MAX_HISTORY_ITEMS + 1)` + 两条 `get` 断言）；本轮独立按 R2 口径重扫新增行，未发现新引入的死代码、冗余守卫或调试日志残留。
2. **R1 rev2 遗留的「插入路径裁剪缺回归保护」（rev3 已修）** — 已关闭，且修复本身未引入冗余守卫：501 次走公共 `insert_or_bump`，断言只用公开 `list`/`get`，无 `as unknown as`、无私有字段直读。
3. **rev3 内新增的 `_with_cap` 类测试钩子** — 已确认不存在（`grep _with_cap` 在 `crates/` 仅命中无关的 `new_with_config_dir`），与进度文件「移除 `_with_cap` 测试钩子」一致。

## 新增发现

无。

### R2 专项核查记录（均通过）

- **调试日志残留**：`grep` 扫描 `crates/clipboard/src/**` 与 `crates/server/src/{engine,handlers/clipboard}.rs`，无 `[DBG-*]` / `[ADL-DEBUG]` / `dbg!` / `println!`；`check-source-hygiene.mjs:26` 的 `DEBUG_TAG_PATTERN` 不会命中本次新增行。
- **死导出**：新增 `pub const MAX_HISTORY_ITEMS` 有真实跨 crate 消费（`adl_clipboard::MAX_HISTORY_ITEMS`），非「仅测试调用的 pub 包装」；`prune_to` 保持私有（`fn`），未外泄。
- **重复常量**：`crates/server` 与 `crates/clipboard` 内已无第二处字面量 500（`grep \b500\b` 的其余命中均为 browser/watch/harness 的无关常量），F1 的「双源漂移」未复现。
- **冗余守卫**：`prune_to` 的 `if items.len() <= max { return Ok(0) }` 是真实短路（避免无意义的全量排序），不是重复判断；`insert_or_bump` 的「裁剪失败不回滚」分支与 ADR 明文一致，属决策而非多余防御。
- **日志级别**：`monitor.rs` 的 `Monitor::new` / `recv` 失败用 `error!`、读取入库失败用 `warn!`，符合「生产 warn/error 正当」；`change received` / `shutdown received` 为 `debug`，不会在生产刷屏。

## 记录不修

1. `engine.rs:368` `let _keepalive = spawn_keepalive(monitor_handle);` —— 绑定的 `JoinHandle` 在函数末尾立即 Drop（detach），该局部变量对「保活」没有任何作用；`_` 前缀 + 名字容易被读成 RAII 守卫（以为不绑定就会被回收），实际不绑定也等价。纯可读性问题、零行为差异，建议后续顺手写成 `spawn_keepalive(monitor_handle);` 或 `let _ = ...`。不进主表（不改变行为/事实）。
2. `store.rs:39` `prune_to` 返回 `Result<usize, AppError>`：`removed` 计数在两条生产调用点（`store.rs:32`、`store.rs:102`）都被丢弃，仅 `store.rs:386` 用例消费；`Ok(0)` 的早退值同理。属「测试专供返回值」，可改为 `Result<()>` 并用 `list`/`get` 断言（与 rev3 用例的既有断言方式一致），但不构成死代码缺陷。若保留，可考虑在 warn 分支之外补一条 debug 级 `removed` 日志让该返回值在生产有消费方。
3. `engine.rs:375` `spawn_keepalive<T: Send + 'static>` 的泛型参数在生产只有 `ClipboardMonitorHandle` 一个实例，第二个实例（`DropFlag`）只出现在 `engine.rs:595` 用例里 —— 轻微 Speculative Generality，但正是它让「双 unpark 假唤醒」用例可写（否则需给真实 `ClipboardMonitorHandle` 加测试钩子，反而更糟），保留合理。
4. `engine.rs:338` / `monitor.rs:44` / `monitor.rs:48` 三条 `info!` 覆盖同一次启动（background listener → thread started → format listener created）。进度文件明确记录了「创建/退出/变更走 debug/info，便于下次复发定位」，属有意保留的诊断线索，不算遗留调试日志；仅提示同一次启动连打两条 info 略冗，若后续日志噪声被投诉，可把 `format listener created` 降为 `debug`。
5. `engine.rs:340` 注释「（与其它后台服务的保活线程同思路）」在仓内已无对应同类线程（`grep 保活|keepalive|thread::park` 仅命中本文件）—— 该行为 diff 上下文行、非本轮新增，属预存注释漂移，按复审收敛规则留给主代理 / P5 决定是否改。
6. `store.rs:63` `pub fn latest()` 仅被同 crate 的 `insert_or_bump` 调用，无跨 crate 消费方（§5.6 的「lib 内部辅助应 `pub(crate)`」）—— 预存、不在本轮 diff，记录不修。
7. `store.rs:46-50` 裁剪每条调用 `self.remove(&item.id)`，`remove` 会再次 `load_entity` 取回循环里已在内存的整条记录（多一次 DB 读 + 反序列化）；另每次插入都全量 `list_entities` + 排序（约 500 行）。与 rev2/rev3 R1 已记录的 O(n²) 性能项同源，性能非本轮范围，维持不修。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）——本轮零问题。
- 说明：R2 口径（死代码 / 冗余守卫 / 多余防御 / 诊断日志）在 clipboard-backend scope 全部通过；仅有的可清理点均为零行为差异的可读性/测试耦合项，已逐条列入「记录不修」。
