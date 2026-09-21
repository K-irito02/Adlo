# 右侧面板 UI 状态持久化：登记表 + 剪枝参照清单经验（2026-09-21）

来源：分支 `panel-state-persist`（T1–T29，28 实现任务 + 最终整分支评审 merge-ready）。

## 1. 登记表 + 剪枝参照清单必须就绪（本计划最核心的一条）

`hydrateAll()` 在 store 构造期执行，而 `recentWorkspaces` 要等 `bootstrap()` 后才从后端载入。若在构造期按工作区存在性剪枝，参照清单为空 → 把**全部**按工作区隔离的展开态误判为孤儿删除。目录级剪枝同样只在**该工作区树成功加载后**执行（树未加载 / 加载失败均跳过）。

落法：四个职责互斥的剪枝入口（`applyWorkspacePrune` / `applyTreeLoadedPrune` / `applyTabPrune` / `applyWorkspaceRemoved`）+ "清单为空一律跳过"硬安全规则 + 关键负例测试 + `loadedDirPaths` 缓存。凡是"构造期水合 + 运行时异步参照"的组合，都必须有这一层。

## 2. `persistField(key, value)` 返回 store 补丁

字段名来自登记表而非调用方手写，结构上消除"写盘字段与 set 字段错配"，同时消灭各 slice"先写盘再手动拼补丁"的重复样板。

## 3. 迁移类任务的最大风险是旧行为在搬迁中被无声丢弃

本计划 4 例：T7 写时 clamp、T10 `terminalTabsById` + shell 三档回退、T11 `searchLimit` 非持久化派生。审查模板固定项："逐条核对被删除的旧代码是否有对应承接"，预检固定项："创建期读取器里的跨键派生清单"。

## 4. 同一语义只保留一处定义

T9 被退回即因此（composite 自制弱守卫 vs 登记表校验器）。修法：composite 复用登记表校验器；`repairManualCollapsed` 抽共享函数供 read/prune/remap 三处。

## 5. 计划自相矛盾时问"哪条是错的"，而不是"怎么同时满足"

T2→T9 的键名大小写约束走错方向，代价是一个月后由另一个任务纠正。规格是 binding authority，计划是其论证。

## 6. 静默失效类缺陷单测测不到，必须留真机步骤

CSS 变量拼错、可选 prop 断链（flashPath 四层透传）、动画不生效——本计划 T13 教训。CLI 子代理必须如实申报未做，不得假装做过。

## 7. 不变量交给测试强制，而不是靠人维护清单

`PERSIST_KEEP_KEYS` 手写清单漏算一个数量级（T6 裁定）；`keepListGuard` 两条不变量 + `registrySelfCheck` 恰有其一 + 32KB 预算 + 体积用例，全程机器强制。T29 收尾时清单归零删除。

## 8. SDD 账本是压缩后唯一的恢复地图

`.superpowers/sdd/<plan>/progress.md` 第一行命名计划文件；`Task N: complete` 即 DONE；fix round 尾行即循环中点。裁定格式：`Ruling: 决定 — 理由 — 若错成本`。本计划 15 处计划缺陷全部经此格式裁定并回改计划文本。
