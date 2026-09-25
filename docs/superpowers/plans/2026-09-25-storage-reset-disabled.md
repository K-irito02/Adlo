# 存储恢复按钮"未更改禁用"完整方案 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 存储组 4 块 + 侧边栏 4 行的恢复按钮在"已是默认"时禁用，未知态保持启用。

**Architecture:** 后端 `StorageService` 记住 `defaults.root` 并经既有 `getStatus`
两处构造点暴露为 `defaultRoot`；前端四端同步类型与 mock；各块本地判定 + fail-open；
侧边栏聚合。

**Tech Stack:** Rust (Tauri 2.x + axum server handlers) + React 19 + Zustand + Vitest;
pnpm (frontend) / Cargo workspace.

**Spec:** `docs/superpowers/specs/2026-09-25-storage-reset-disabled-design.md`

## Global Constraints

- 无 UI 文本硬编码（本计划零新文案，只动 `disabled` 属性）。
- 中英 i18n key 集不变（无增删）。
- 双端一致：`defaultRoot` 经 `storage-parity.test.ts` 四端覆盖。
- Conventional Commit：`type(scope): summary`。
- 每任务 TDD：失败测试 → 实现 → 转绿 → commit；Rust `cargo clippy + fmt`、
 前端 `tsc --noEmit + eslint` 零警告。
- 产品未发布：DTO 加字段为 additive，不做兼容/迁移代码。
- 测试命令：Rust（工作目录 `ai-digital-life/`）`cargo test -p <crate>`；
 前端（工作目录 `ai-digital-life/`）`pnpm --dir frontend run test --run <path>`；
 `tsc`/`eslint` 工作目录 `ai-digital-life/frontend/`。

---

### Task 1: Rust — `StorageService` 记住默认根 + 两处 status 暴露

**Files:**
- Modify: `ai-digital-life/crates/kernel/src/storage/paths.rs` (`StorageService` 加字段 + accessor + 同文件单测)
- Modify: `ai-digital-life/crates/server/src/handlers/storage.rs` (`StorageStatus` 加字段 + `status()` 构造)
- Modify: `ai-digital-life/src-tauri/src/commands/storage.rs` (`StorageStatus` 加字段 + `storage_get_status` 构造)
- Test: Rust 单测（`paths.rs` 同文件 `mod tests` + 现有 handler/command 测试若有则扩）

**Interfaces:**
- Produces: `StorageService::default_root() -> &Path`；
 `StorageStatus { .., default_root: String }`（两处 DTO，serde camelCase → `defaultRoot`）。

- [ ] **Step 1: Write the failing test.** 在 `paths.rs` 的 `mod tests` 追加
 （先读该模块既有 `defaults()` helper，约 157 行）：

```rust
#[test]
fn service_remembers_default_root() {
    let defaults = defaults();
    let loc = StorageLocator { selection: StorageSelection { mode: StorageMode::Unified, root: None, categories: BTreeMap::new() }, ..Default::default() };
    let svc = StorageService::from_locator(&loc, &defaults);
    assert_eq!(svc.default_root(), &defaults.root);
}
```

（若 `StorageLocator`/`StorageSelection` 字面量构造与实际字段不符——先读
`locator.rs` 定义再落笔，编译不过即按编译器提示修正，只改测试不改产品代码。）

- [ ] **Step 2: Run test to verify it fails.**

Run: `cargo test -p adl-kernel storage::paths::tests::service_remembers_default_root`（工作目录 `ai-digital-life/`）
Expected: FAIL（`default_root` 方法不存在；crate 名先核对 `crates/kernel/Cargo.toml` 的 `name`，若不是 `adl-kernel` 则替换）。

- [ ] **Step 3: Write minimal implementation.**

`paths.rs`：
```rust
pub struct StorageService {
    paths: StoragePaths,
    selection: StorageSelection,
    default_root: std::path::PathBuf,
}

impl StorageService {
    pub fn from_locator(loc: &StorageLocator, defaults: &StorageDefaults) -> Self {
        Self { paths: StoragePaths::from_locator(loc, defaults), selection: loc.selection.clone(), default_root: defaults.root.clone() }
    }

    pub fn default_root(&self) -> &std::path::Path {
        &self.default_root
    }
}
```

`handlers/storage.rs` 的 `StorageStatus` 加 `pub default_root: String`，
`status()` 构造加 `default_root: svc.default_root().to_string_lossy().to_string(),`。
`src-tauri/src/commands/storage.rs` 的 `StorageStatus` 同样加字段，
`storage_get_status` 构造同样加一行（`svc` 为 `state.storage.clone()`，同一 accessor）。

- [ ] **Step 4: Run tests to verify they pass.**

Run: `cargo test -p adl-kernel storage` + Rust 新增单测所在包全跑
Expected: PASS；随后 `cargo clippy --workspace --all-targets -- -D warnings`
（零警告）与 `cargo fmt --check`（干净；不干净则 `cargo fmt` 后重跑）。

- [ ] **Step 5: Commit.**

```bash
git add ai-digital-life/crates/kernel/src/storage/paths.rs ai-digital-life/crates/server/src/handlers/storage.rs ai-digital-life/src-tauri/src/commands/storage.rs
git commit -m "feat(storage): expose default root in storage status"
```

---

### Task 2: TS 类型 + mock + parity 断言

**Files:**
- Modify: `ai-digital-life/frontend/src/shared/ipc/storage.ts` (`StorageStatus` 加字段)
- Modify: `ai-digital-life/frontend/src/mock/mock-storage.ts` (`getStatus` fabrication 补字段)
- Modify: `ai-digital-life/frontend/src/shared/ipc/__tests__/storage-parity.test.ts`（追加断言）
- Test: 同上 parity 文件

**Interfaces:**
- Consumes: Task 1 的 `defaultRoot`（camelCase）。
- Produces: 四端 `StorageStatus.defaultRoot: string`。

- [ ] **Step 1: Write the failing test.** 先读 `storage-parity.test.ts` 找到
 `getStatus` 断言位置（约 65 行，`createMockStorage().getStatus()`），追加：

```ts
expect(typeof res.data.defaultRoot).toBe('string');
```

（按该文件既有断言风格落笔：若其解包方式为 `res.data!` 或模式不同，先读后写，
只增断言不改既有。）

- [ ] **Step 2: Run test to verify it fails.**

Run: `pnpm --dir frontend run test --run src/shared/ipc/__tests__/storage-parity.test.ts`
Expected: FAIL（TS 编译期 `defaultRoot` 不存在——vitest esbuild 不做类型检查，
运行时 `undefined` → `typeof undefined !== 'string'` 照样 FAIL；两种都算红）。

- [ ] **Step 3: Write minimal implementation.**

`shared/ipc/storage.ts` 的 `StorageStatus` 加：
```ts
/** 后端默认根（`defaults.root`）：核心块"是否默认"判定的比对基准。 */
defaultRoot: string;
```

`mock-storage.ts` 的 `getStatus` data 加 `defaultRoot: root,`（与 mock 的 `root`
取同一变量——mock 默认即默认布局，自洽；`DEFAULT_MOCK_STORAGE_ROOT` 定义已存在，
不新增常量）。

`tauri-bridge`/`httpBridge` 为直通实现，无需改动（返回体由后端携带新字段；
若其 TS 侧对返回做 pick/映射——先 grep 确认，直通则不动）。

- [ ] **Step 4: Run test to verify it passes.**

Run: 同 Step 2 命令 Expected: PASS； plus `npx tsc --noEmit`
（全仓干净——mock 与类型同步的编译门）。

- [ ] **Step 5: Commit.**

```bash
git add ai-digital-life/frontend/src/shared/ipc/storage.ts ai-digital-life/frontend/src/mock/mock-storage.ts ai-digital-life/frontend/src/shared/ipc/__tests__/storage-parity.test.ts
git commit -m "feat(storage): carry defaultRoot through status and mock"
```

---

### Task 3: 前端四块 disabled（StorageSettings）

**Files:**
- Modify: `ai-digital-life/frontend/src/app/features/storage-settings/StorageSettings.tsx`
- Test: `ai-digital-life/frontend/src/app/features/storage-settings/__tests__/StorageSettings.test.tsx`（追加 9 用例：四块×默认禁用/偏离启用 + status null 全启用）

**Interfaces:**
- Consumes: Task 2 的 `status.defaultRoot`；既有 `TREE_CACHE_DEFAULTS`、
 `TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES`（`handleTerminalBudgetReset` 已用的同一常量）、
 `downloadSettings`、`isDirty`。

判定（spec §3，逐字实现）：

```tsx
// status null/loading → 全部启用（fail-open）
const coreAtDefault =
  status !== null &&
  status.mode === 'unified' &&
  status.root === status.defaultRoot &&
  !isDirty;
const treeAtDefault = treeEnabled && treeTtlMinutes === TREE_CACHE_DEFAULTS.ttlMinutes;
const budgetAtDefault =
  (useAppStore((s) => s.appInfo?.config?.terminalHistoryBudgetBytes) ??
    TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES) === TERMINAL_HISTORY_BUDGET_DEFAULT_BYTES;
const downloadAtDefault =
  downloadSettings.default_path === '' && !downloadSettings.auto_migrate_on_path_change;
```

（`treeEnabled`/`treeTtlMinutes` 为既有派生（约 1027-1028 行）；预算常量从
`handleTerminalBudgetReset` 所在同一 import 取，禁止另写 `1 << 30` 字面量；
`downloadSettings` 已订阅（约 181 行）。`status` 为既有 state（约 145 行）。）

- [ ] **Step 1: Write the failing tests.** 在 `StorageSettings.test.tsx` 追加
 （先读该文件既有 status/bridge mock 桩写法，复用其 `getStatus` mock，
 注意 `getStatus` mock 返回须补 `defaultRoot` 字段——TS 类型已要求，否则编译红）：

```tsx
it('disables all four block resets when everything is at defaults', () => {
  // mock getStatus → { mode: 'unified', root: <defaultRoot>, defaultRoot: <same>, ... }
  // config budget = 默认；downloadSettings = { default_path: '', auto_migrate: false }；
  // treeStats = { enabled: true, ttlMinutes: 15, ... }
  // 断言 4 个 data-testid 按钮 [core/tree/budget/download reset] 均 disabled
});

it('enables core reset when root differs from defaultRoot', () => { /* root 不同值 → core 按钮 enabled，其余 disabled */ });
it('enables tree reset when ttl differs', () => { /* ttl 30 → tree enabled */ });
it('enables budget reset when budget differs', () => { /* budget 2GiB → budget enabled */ });
it('enables download reset when path customized', () => { /* default_path 非空 → download enabled */ });
it('keeps resets enabled when status failed to load', () => { /* getStatus 失败 → 4 按钮均 enabled */ });
```

（data-testid 以实际为准：`tree-cache-reset`、`terminal-budget-reset`、
`download-path-reset` 已存在；core 按钮约 1341-1353 行——若无 testid 则复用其
`aria-label`（`treeResetLabel` 等既有变量）定位；9 用例 = 1 全禁用 + 4 偏离 + 1 未知 +
3（模式 per_category 视同偏离？fold 入"root differs"类——不单独列，4 偏离覆盖核心/树/预算/下载各一）…
计数：全禁用 1 + 偏离 4 + 未知 1 = 6 用例。按 6 个写。）

- [ ] **Step 2: Run tests to verify they fail.**

Run: `pnpm --dir frontend run test --run src/app/features/storage-settings/__tests__/StorageSettings.test.tsx`
Expected: FAIL（`disabled` 属性缺失）。

- [ ] **Step 3: Write minimal implementation.** 四处按钮加 `disabled`（与既有
 `disabled={busy}` 合并为 `disabled={busy || coreAtDefault}` 形式，各块取各自变量；
 不改 onClick/确认框流程）：

```tsx
disabled={busy || coreAtDefault}        // 核心（约 1348 行，与 busy 合并）
disabled={treeBusy || treeAtDefault}    // 树（约 1487 行，data-testid="tree-cache-reset"）
disabled={budgetAtDefault}              // 预算（约 1636 行 data-testid="terminal-budget-reset"；该按钮当前无 disabled——新增；busy 语义由其确认流程内部处理，不动）
disabled={downloadAtDefault}            // 下载（约 1656 行 data-testid="download-path-reset"；同理新增，不动确认框快照逻辑）
```

- [ ] **Step 4: Run tests to verify they pass.**

Run: 同 Step 2 Expected: PASS；plus `npx tsc --noEmit` + `npx eslint` 相关文件干净。

- [ ] **Step 5: Commit.**

```bash
git add ai-digital-life/frontend/src/app/features/storage-settings/StorageSettings.tsx ai-digital-life/frontend/src/app/features/storage-settings/__tests__/StorageSettings.test.tsx
git commit -m "feat(storage): disable block resets when at defaults"
```

---

### Task 4: 侧边栏聚合 + 全量门

**Files:**
- Modify: `ai-digital-life/frontend/src/app/regions/SettingsNav.tsx`（新增可选 prop）
- Modify: `ai-digital-life/frontend/src/app/regions/TitleBar.tsx` 或
 `ai-digital-life/frontend/src/app/components/settings/SettingsPanel.tsx`
 （聚合计算 + 传入；二选一：数据（config 全量 + storage status 相关）在哪里最易订阅——
 先读 `SettingsPanel` 既有订阅（`activeSettingsGroup` 等）与 `TitleBar` 的 `keybinds` 订阅，
 选订阅改动最小的一处；storage status 来自桥（异步）——复用 StorageSettings 的桥调用
 不划算，改为只在用户打开设置面板时由聚合点发一次 `getStatus`？否——YAGNI：
 storage 行 disabled 判定需要 status，而 status 只在 StorageSettings 挂载时加载。
 决策：storage 行的聚合判定**只基于 store 内已有同步数据**（config 预算 + downloadSettings），
 核心/树两块因需异步 status 而**无法在侧边栏判定 → storage 行保持常开**。）
- Test: `SettingsPanel.test.tsx`（general/workspace/shortcuts 行 disabled 行为）

**Interfaces:**
- Consumes: Task 3 的块判定常量（预算/下载定义复用；核心/树不纳入 nav 判定）。

**Ruling（与 spec §4 的差异，记录）：** spec 写"storage 行聚合四块"，但 status 为
StorageSettings 挂载态异步数据，侧边栏聚合点无此数据；为 storage 行单独发一次
`getStatus` 属于重复请求（浪费且引入 loading 竞态）。降级：storage 行保持常开
（注释说明原因），块级四按钮仍完整执行 disabled 逻辑。代价若错：用户在存储全默认时
点侧边栏存储行仍会弹组确认框——与现状一致，无回归。

- [ ] **Step 1: Write the failing tests.** 在 `SettingsPanel.test.tsx` 的
 `group reset` describe 追加（复用 `setupStore` + mockT 模板；nav 按钮
 `name` 形如 `'Reset settingsGeneral all defaults'`）：

```tsx
it('disables general nav reset when prefs equal defaults', () => {
  setupStore(); // 默认即全默认（setupStore 未覆盖则按实际补 config 全默认）
  renderPanel();
  expect(
    screen.getByRole('button', { name: 'Reset settingsGeneral all defaults' }).hasAttribute('disabled'),
  ).toBe(true);
});

it('enables general nav reset when a pref differs', () => {
  // 覆盖 language 为非默认后 render（setupStore 需支持 config 覆盖——先读其实现，不支持则直接 useAppStore.setState 补）
});
```

（shortcuts/workspace 同理各 1 个启用/禁用对，共 6 用例；storage 行不断言 disabled——
保持常开，注释说明。）

- [ ] **Step 2: Run tests to verify they fail.**

Run: `pnpm --dir frontend run test --run src/app/components/settings/SettingsPanel.test.tsx`
Expected: FAIL（prop/判定缺失）。

- [ ] **Step 3: Write minimal implementation.**

`SettingsNav.tsx`：新增可选 `disabledResetGroups?: ReadonlySet<SettingsGroupId>`，
按钮加 `disabled={disabledResetGroups?.has(group.id) ?? false}`（其余不动；
`.adl-settings-row__reset:disabled` 样式已存在）。

聚合点（按 Step 0 的订阅核查结果落笔，二选一）：
```tsx
// general：config 6 项 vs GROUP_RESET_PATCHES.general() 逐项比
// workspace：config 4 项 vs GROUP_RESET_PATCHES.workspace() 逐项比（数组用元素比对）
// shortcuts：config.keybinds 全量 vs DEFAULT_KEYBINDS（缺 key 视为 defaultKeybind；
//   'none' 与缺默认键视为 'none'——与 KeybindSettings.currentOf 同语义，禁止另起定义）
// storage：不纳入（见 Ruling，保持常开）
```

- [ ] **Step 4: Run tests + 全量门。**

Run: `pnpm --dir frontend run test --run src/app/components/settings/SettingsPanel.test.tsx`
Expected: PASS；随后 `npx tsc --noEmit` + `npx eslint .`（全 frontend）零警告；
Rust 侧重跑 `cargo test -p adl-kernel storage`（确认 Task 1 无回归）。

- [ ] **Step 5: Commit.**

```bash
git add ai-digital-life/frontend/src/app/regions/SettingsNav.tsx ai-digital-life/frontend/src/app/components/settings/SettingsPanel.test.tsx <聚合点文件>
git commit -m "feat(settings): disable nav resets when group at defaults"
```

---

## Self-Review

- Spec §1 → Task 1（两处 DTO + 单测）；§2 → Task 2（类型 + mock + parity）；
 §3 → Task 3（四块 + 6 用例 + fail-open）；§4 → Task 4（聚合 + 6 用例 + storage 行降级 Ruling）；
 §5 → 各任务 Step 4 门 + Task 4 全量门；§6 → Global Constraints（零新文案、无兼容代码、parity、红绿）。
- 无占位：每步含真实代码/命令/断言；`ad-hoc` 数值（15、1GiB、选择器）全部引用既有常量名，
 禁止字面量。
- 类型一致：`defaultRoot`（TS）↔ `default_root` serde camelCase（Rust）；
 `disabledResetGroups` prop 名全任务统一；`currentOf` 语义引用不复制。
