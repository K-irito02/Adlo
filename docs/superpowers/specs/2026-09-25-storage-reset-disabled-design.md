# 存储组恢复按钮"未更改禁用"完整方案 — 设计文档

- 日期：2026-09-25
- 状态：设计已批准，待实现计划
- 背景：事项 13（全设置组恢复按钮统一"未更改禁用"逻辑）。general 行级与 workspace 块级已落地（`275dc910`）；
  shortcuts 行/块级已落地。剩余：存储 4 块 + 侧边栏 4 行。硬约束：默认根仅后端知晓，
  `StorageStatus` 无相关字段（近似定义会在自定义根场景误禁用，比常开更坏）。

## 1. 后端字段（Rust）

`crates/server/src/handlers/storage.rs` 的 `StorageStatus` DTO 新增 additive 字段
`default_root: String`（serde camelCase → `defaultRoot`）。

- 取值：与 `patch_to_selection` 空根回落逻辑同源的 `defaults.root`
 （`StoragePaths` 默认构造的 root），保证前后端"默认"定义同源。
- 精确性依据：`paths.rs:67`——仅 `PerCategory` 下 categories 覆盖生效，
 unified 下忽略；故"unified + 根相等 + 无草稿"即精确等价"重置补丁无操作"，
 不存在误禁用。
- 只读，无迁移，无新路由，无 capability 登记。
- `src-tauri/src/commands/storage.rs`（约 317 行）的 status 构造若为独立 DTO 则同步加字段
 （实现时核对是否为同一构造路径）。
- 测试：Rust 单测——自定义根时 `default_root != root`，默认布局时相等
 （对标 `paths.rs:166` 的 `unified_default_root_matches_current_layout` 风格）。

## 2. 桥与 TS 类型

- `frontend/src/shared/ipc/storage.ts`：`StorageStatus` 加必填 `defaultRoot: string`
 （未发布，无兼容包袱；mock/preview 构造处同步补，`tsc` 即编译门）。
- `tauri-bridge` 直通；`preview-bridge`/`http` 同 service 已有；`mock-bridge` fabrication
  补与既有 mock 数据自洽的固定值。
- `storage-parity.test.ts` 追加 `defaultRoot` 四端断言（有字段且为字符串）。

## 3. 前端四块判定

各块 header 恢复按钮加 `disabled`，定义如下；未知态（status 未加载/失败）一律启用
（fail-open，避免把用户锁死）。复用现有置灰样式，无文案新增。

| 块 | 默认定义 | 数据源 |
|---|---|---|
| 核心路径 | `mode==='unified'` + `root===defaultRoot` + 无未应用草稿（`!isDirty`，含 rootDraft 与 categoryDrafts） | `status` + 本地草稿态 |
| 树缓存 | `enabled===true && ttlMinutes===15`（关闭态保持启用，沿用"恢复即重开"决策） | `treeStats`（已有回退常量） |
| 终端预算 | `config.terminalHistoryBudgetBytes === 1GiB` | store（父组件读） |
| 下载路径 | `default_path==='' && !auto_migrate_on_path_change` | store `downloadSettings` |

## 4. 侧边栏聚合

`SettingsPanel` 订阅所需状态，给 `SettingsNav` 新增可选 prop
（如 `disabledResetGroups: ReadonlySet<SettingsGroupId>`）：

- general/workspace/shortcuts：config 与各自 `GROUP_RESET_PATCHES` 默认值直比；
- storage：§3 四块判定全真才禁用，任一未知/偏离则启用；
- 未订阅到数据时一律启用。hover 显隐与确认框流程不动。

## 5. 测试矩阵（只测受影响部分）

- Rust：status DTO 新字段单测；`cargo clippy --workspace --all-targets` + `cargo fmt`。
- TS：parity 断言；四块各 2 用例（默认禁用/偏离启用）+ 未知态启用；侧边栏聚合
  （全默认禁用/任一偏离启用）；`tsc` + `eslint` 零警告。

## 6. 约束重申
- 无 UI 文本硬编码；i18n 中英（如需新 key）同步；双端一致（纯展示逻辑 + 已有偏好字段，
  新 status 字段经四端 parity 覆盖）；红绿测试；本产品未发布，不做兼容/迁移代码
  （DTO 加字段为 additive，非兼容层）。
