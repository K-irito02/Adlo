# clipboard-backend — R1 rev3 定向确认报告

- 工作树：`E:\AI-DIGITAL-LIFE\SourceWorkspace-worktrees\slot-1`
- base：`595216f1f`，快照：`.review-diffs/*-rev3.diff`，manifest：`manifest-rev3.md`
- 上轮报告：`.review-diffs/clipboard-backend-r1-rev2-report.md`（唯一未关闭项：插入路径裁剪缺回归保护）
- 只读约束：未运行 `git diff/log/show`、未改源码/配置、未运行任何测试（结论来自读 rev3 快照 + 读当前源码 + 删除性推演）。未启动 dev server / 浏览器，无端口占用。

## 范围

| 文件（clipboard-backend scope） | 与 rev2 的关系 | 结论 |
| --- | --- | --- |
| `adlo/crates/clipboard/src/store.rs` | 唯一有变化的文件（测试段） | rev2 F1 已关闭，见下 |
| `adlo/crates/clipboard/src/lib.rs` | 快照 SHA-256 与 rev2 相同 | 无新增改动，无问题 |
| `adlo/crates/clipboard/src/monitor.rs` | 与 rev2 相同 | 无新增改动，无问题 |
| `adlo/crates/clipboard/Cargo.toml` | 与 rev2 相同 | 无问题 |
| `adlo/Cargo.lock` | 与 rev2 相同 | 无问题 |
| `adlo/crates/server/src/engine.rs` | 与 rev2 相同 | 无问题 |

（`adlo/crates/server/src/handlers/clipboard.rs` 属未归属文件，rev3 快照亦与 rev2 一致；不在本 scope 主表产 finding，仅作为读取上限上下文核对。）

变化核对：rev3 `store.rs` 相对 rev2 只改了一处——`insert_enforces_default_history_cap` 的读取方式由 `store.list(MAX_HISTORY_ITEMS)` 改为 `store.list(MAX_HISTORY_ITEMS + 1)`，并补两条 `store.get(..)` 断言；常量、`prune_to`、`new()` 启动裁剪、`insert_or_bump` 内裁剪及另外两个用例逐字未变。

## 上轮问题关闭情况（逐条：已关闭 / 未关闭 + 理由）

1. **rev2 F1（medium｜`insert_enforces_default_history_cap` 用 `list(500)` 自截断，删掉插入裁剪仍全绿）— 已关闭**
   - 现状（`store.rs:434-439`）：`let rows = store.list(MAX_HISTORY_ITEMS + 1)` → `rows.len() == MAX_HISTORY_ITEMS`、首 `"500"`、尾 `"1"`，再加 `get("0")` 必须 `None`、`get("1")` 必须 `Some`。
   - **501 vs 500 已可区分**：`list_entities_with_limit`（`adlo/crates/storage/src/entity_crud.rs:63-82`）是 `ORDER BY json_extract(json,'$.createdAt') DESC LIMIT {limit}`，只在 `limit > 1000` 报错；`501` 在安全上限内且大于裁剪后行数，不再被自身截断。`ClipboardItem` 为 `#[serde(rename_all = "camelCase")]`（`adlo/crates/types/src/types/clipboard.rs:30`），`$.createdAt` 真实存在，排序为有效 DESC；`created_at = base + i` 互不相同，无并列不确定性。
   - 删除性推演（删掉 `store.rs:102-107` 的 `prune_to(MAX_HISTORY_ITEMS)`，保留启动裁剪）：
     1. `temp_store` 建库为空，启动裁剪 0 条；循环插入 `0..=500` 共 501 条，内容 `content-{i}` 各异、`digest` 均 `None`，去重条件（同 kind + 同 content + 同 digest + 3s 内）不命中，全部落库 → 501 行。
     2. `list(501)` 返回 501 行 → `assert_eq!(rows.len(), 500)` **变红**；即便只看首尾，`rows.last()` 会是 `"0"` 而非 `"1"`，**再红一次**。
     3. `get("0")` 命中 → `is_none()` 断言 **变红**。三层断言互相独立，均直击「插入后收口」。
   - 反向推演（裁剪存在但参数错）：
     - 上限改成 `> 500`（如 501/600）：501 行留存 → len 断言红。
     - 上限改成 `< 500`（如 400）：`get("1")` 被误删 → 红；首尾断言也红。
     - `prune_to` 方向写反（删最新）：`rows.first() != "500"` 且 `get("0").is_some()` → 红；`prune_to_keeps_newest_and_deletes_old_item_files` 同时红。
     - 边界改成 `len >= max` 即裁（少留一条）：插入第 500 条时被裁成 499 → 最终 len 499 → 红。
   - 公共入口合规（简报 §5.1）：走 `insert_or_bump` 生产入口，断言用公开的 `list` / `get`，无 `as unknown as`、不读私有字段。
   - 标题一致性（§5.9）：标题承诺「insert 收口到默认上限」，断言已覆盖条数 + 被裁条目消失 + 最新条目留存，名实相符。
   - 结论：rev1 F2 的「启动时机」与「插入时机」两半现均有会变红的回归保护，F2 整体关闭。

2. **rev2 记录不修项**（常量注释措辞、`_keepalive` 命名、handler 调大常量后的 1000 上限耦合、501 次插入 O(n²)）在本轮快照中均未变化，处理结论维持不变。

## 新增发现

无。rev3 仅调整上述一个用例的读取与断言，未引入新的实现代码、注释或 i18n 变更。

## 记录不修

1. `store.rs:434` 的 `MAX_HISTORY_ITEMS + 1` 使该用例隐式依赖存储层 `limit ≤ 1000` 的安全上限（与 rev2 记录项 3 同源耦合）。若将来 `MAX_HISTORY_ITEMS ≥ 1000`，用例会以 `InvalidInput("query limit ... exceeds safety cap")` 直接失败——是响亮失败而非静默放过，属可接受的测试侧耦合，不改。
2. `store.rs:439` 断言消息写 `"newest MAX_HISTORY_ITEMS rows survive"`，而断言对象是 `"1"`（现存最旧一条）。语义正确（`"1"` 确在最新 500 条内）但措辞偏向「整体存活」，若 P5 顺手可改成 `"oldest surviving row is kept"` 之类更贴断言；纯措辞，不影响事实，不进主表。
3. `insert_enforces_default_history_cap` 每次插入都触发 `prune_to` 全量读取（约 12.5 万次行反序列化，O(n²)），debug 下可感知；沿用 rev2 记录不修结论（性能非本轮范围，`prune_to` 全量加载亦为已记录的可选优化）。

## 结论

- 需修复项：0（critical 0 / high 0 / medium 0 / low 0）——本轮零问题。
- 说明：rev2 唯一未关闭项（插入路径裁剪回归保护）已按建议修复并完成删除性与反向推演验证；clipboard-backend scope 其余文件 rev3 无改动，无回归。
