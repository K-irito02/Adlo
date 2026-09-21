# 工作区树跨重启缓存（stale-while-revalidate）设计

- 日期：2026-09-21；分支：`panel-state-persist`（后续独立分支实施）。
- 前置结论：`treeLoader` 冷扫 6800ms → 去 stat 化后 1054ms（`treeLoader settled` 日志实证）；git 快照仅 ~0.4s。慢的是树扫描本身。
- 适用判定（本设计仅覆盖同时满足者）：冷加载秒级 **且** 内容容忍 stale（有运行时校准兜底）。变更面板（快照 0.4s 且须新鲜）、浏览器面板（已三层持久化）、终端面板（单次 JSON 读毫秒级）、各子视图（已持久化 UI 态/按需 IPC）均不适用，论证见 §7。

## 1. 总览与数据流

```
启动（冷，无行）                    启动（有行）
  │                                   ├─→ 读 SQLite 行（ms 级）→ 立刻渲染旧树
  │                                   └─→ 后台静默重扫 → 一致则无感 / 不一致则原子替换 + 写回
  └─→ 全量扫（现状 ~1s）→ 写缓存行
写操作（新建/重命名/删除/外部 watcher）→ 删对应行（复用 invalidate_tree_cache 时机）
设置清除 → 删 DB 文件 → 下次冷扫重建
```

核心不变量：**缓存永远只是加速层**——读失败/无行/反序列化失败一律回退全量扫；总开关关闭 = 现状全量语义。

## 2. 后端（`crates/workspace` + 存储体系）

- 新文件 `crates/workspace/src/tree_cache_store.rs`，仿 `site_meta_cache.rs` 三件套：
  - 表 `tree_cache(workspace_path TEXT PRIMARY KEY, tree_json TEXT, captured_at INTEGER)`。
  - `get(path)` / `put(path, tree)` / `remove(path)` / `stats()`（行数、总字节、最早/最晚 `captured_at`，供设置页）。
  - 单行树 JSON 超 8MB 拒绝写入（`MAX_TREE_NODES` 已封顶条目数，此为第二道内存上限）。
- 失效复用：`invalidate_tree_cache(path)`（内存）同时删 SQLite 行——写操作与 watcher 回调已调它，**零新增调用点**；`generation` 代际逻辑不动。
- 读路径：`list_tree_cached` 改为 L1 内存 → L2 SQLite → L3 全量扫并回写。TTL 只做一件事：行年龄 < TTL 时**跳过后台重扫**（默认 15 分钟，高级可调 5/15/60 分钟/1 天；15 分钟内重启 = 零扫描）。`force=true` 语义不变（全量扫 + 写回）。
- 路径与迁移：DB 文件落 `adl-kernel::storage` 解析目录，注册为第 10 个可迁移分类（`StorageCategory` + locator `pendingMigration` 复用 Plan B 整套：复制→校验→切指针→清旧源；失败不切指针，旧路径照常）。

## 3. IPC（双端一致）

- **不新增命令**：`TreeBody` 加可选字段 `allow_stale: bool`（缺省 false = 现状全量语义）；`force=true` 优先（全量扫 + 写回，忽略本字段）。
- **响应加来源标记**：`WorkspaceTreePayload { tree, from_cache: bool }`——前端靠它决定静默校准还是直接采用，兼诊断日志。
- **四端同步实现**：Tauri 真后端全功能；mock-bridge / preview-bridge / http 桥的 `allow_stale` 恒走 miss + `from_cache:false`（语义正确，只是无加速；开发/预览环境正确性优先）。

## 4. 前端（`loadBatch` + 消费方）

- **加载语义拆分**：`workspaceTreeLoading` 保持"首屏阻塞中"含义；后台校准走静默路径（复用 `workspaceTreeRefreshing` 旋转语义，不转圈）。规则：**有 stale 可渲染时永不置 loading**。
- **校准触发**：`loadBatch` 传 `allow_stale:true` → 首包若 `from_cache` 则先 `set` 树（秒开）→ 同工作区再发一次全量请求后台校准；一致则跳过 `set`（无感），不一致原子替换。TTL 窗内跳过校准。二次全量扫系刻意取舍（YAGNI：`fresh_since` 增量协议不做，后台 1 秒用户无感，简单正确）。
- **剪枝交互**：stale 树**不得**作为目录剪枝参照（`applyTreeLoadedPrune` 只在 `from_cache:false` 的新鲜分支调用）；`workspaceIds` 级剪枝不受影响。
- **失败回退**：stale 读失败/无行 → 现状全量路径（loading 转圈），行为与今天一致。

## 5. 设置 UI（存储组）

- **基础**：新增"工作区树缓存"行——自定义路径（走存储迁移体系）+ 大小/工作区数/缓存时间展示 + "清除缓存"按钮；i18n 双语 key。
- **高级**：总开关（默认开；关闭 = 现状全量语义）+ TTL 步长（默认 15 分钟）。

## 6. 测试与验收

- Rust（`adl-workspace`）：行级 roundtrip、失效删除、TTL 跳扫、8MB 拒写、损坏行回退全量。
- 前端：stale 先渲染→校准替换一致/不一致两路、刷新不重闪（沿用语义）、剪枝不消费 stale（负例）、开关关闭行为、清除按钮。
- 双端一致：Tauri 真加速用例；mock/preview 恒 miss 正确性用例。
- 验收指标：本仓库单仓冷启动树渲染 ≤1.5s（含 stale 即时渲染）；校准过程无 loading 闪烁；关闭场景（无行/损坏/开关关）行为与现状一致。

## 7. 其它面板核查结论（不再议）

| 面板 | 证据 | 结论 |
|---|---|---|
| 变更（git 快照） | 416ms；须新鲜，缓存指纹代价≈重跑 | 不做 |
| 浏览器（标签/历史/收藏 + 站点元数据） | 登记表同步读；元数据已有 Rust SQLite + 启动预载 | 不做 |
| 终端（标签/偏好/只读历史） | 单次 JSON 读（预算封顶）；PTY 本就不跨重启 | 不做（标签上百时复测） |
| 子视图 | 已持久化 UI 态 / 按需 IPC，无启动批量 IO | 不做 |

## 8. 已排除项

- 树快照拆分渲染：快照仅 0.4s（日志实证），无意义。
- 懒加载子树：与 V3 全树假设 + 剪枝 R2 正面冲突，大改。
- VS Code 式 exclude：后端 `ignored_dirs` 已有等价物；"仓库根即工作区"场景下再排除等于藏文件。
