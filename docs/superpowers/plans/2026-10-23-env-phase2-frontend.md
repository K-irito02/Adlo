# Phase 2（前端）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 `network（网络与下载）` 与 `environment（运行环境）` 设置组、DSH 组瘦身、首次启动向导，三桥同步，前端行为与 Phase 1 后端 `/env/*` 对齐。

**Architecture:** 复用 DSH/存储组五件套（settingsGroups 注册、自有确认对话框、打开即预取、pending 跨组信号、四端桥 parity）；`network` 组 = DshSettings 上三块的整体搬迁（anchors 由 `dsh:*` 改 `network:*`）；`environment` 组 = 新组件消费 `/env/status` 聚合；向导 = 设置组行组件全屏版 + App 启动期触发。

**Tech Stack:** React 19 + Zustand 切片模式 + TypeScript strict + Vitest + i18n（TCopyContext，22 领域）+ 三桥（httpBridge / mock-bridge / tauri-bridge）+ settingsSearchIndex。

**Spec:** `docs/superpowers/specs/2026-10-23-env-dependency-management-design.md`（§6.2 向导、§7 设置组 UI、§9 双端一致性、§12 Phase 2）

## Global Constraints

- `cd ai-digital-life/frontend && npx tsc --noEmit` 零错误；`npx eslint .` 0 errors；`npx prettier --check`（或 `pnpm run format:check`）干净；`pnpm run test` 相关套件全绿；`pnpm run check:i18n` 通过。
- Commit 风格 `type(scope): summary`，scope 用 `frontend`，例 `feat(frontend): add network settings group`。
- 所有用户可见文案走 i18n key（中英 `environment.ts` / `network.ts` 新领域 + `keys.test.ts`），禁止硬编码（按钮/Tooltip/aria-label/占位符/相对时间/面包屑全在内）。
- 双端一致：浏览器模式系统级行置灰 + “仅桌面模式可用”说明（照抄智能体拦截开关模式）；mock 桥同语义演示数据；安装类按钮在浏览器模式置换为“复制给 agent”。
- 新增 IPC 方法同步实现 `tauri-bridge.ts` / `preview-bridge/` / `mock-bridge.ts`（parity 测试锁定方法集）。
- 轮询纪律：安装进行中只轮询 `/env/status` 的 `task` 段（3s 间隔，task 变 null 即停）；禁止常驻全量轮询（reg/where/netprobe 开销，Phase 1 终审 residual）。
- 模型凭据行永远只做引导（Phase 1 parked：`ciTokenConfigured` 绝不标绿/红为模型就绪）。

---

## File Structure

```
ai-digital-life/frontend/src/shared/ipc/env.ts      # NEW EnvBridge + DTO（对齐后端 camelCase）
ai-digital-life/frontend/src/shared/ipc/digital-life.ts # + env: EnvBridge
ai-digital-life/frontend/src/shared/ipc/dsh.ts      # DshVersionTaskKind 加宽（dsh-* 前缀）
ai-digital-life/frontend/src/httpBridge.ts          # + env domain（GET /env/status + 4 POST）
ai-digital-life/frontend/src/tauri-bridge/tauri-env.ts # NEW passthrough（照抄 tauri-dsh.ts）
ai-digital-life/frontend/src/mock/mock-env.ts       # NEW（照抄 mock-dsh.ts 状态流转）
ai-digital-life/frontend/src/mock-bridge.ts         # + env: mockEnv
ai-digital-life/frontend/src/shared/ipc/__tests__/env-parity.test.ts # NEW（照抄 storage-parity.test.ts 方法集用例）
ai-digital-life/frontend/src/app/stores/slices/envSlice.ts        # NEW（状态+聚合+pending消费位）
ai-digital-life/frontend/src/app/stores/actions/envActions.ts     # NEW（fetch/select/install/customPath/recheck/task轮询）
ai-digital-life/frontend/src/app/features/environment/envStatusCache.ts # NEW prefetch（照抄 storageStatusCache.ts）
ai-digital-life/frontend/src/app/features/environment/EnvironmentSettings.tsx # NEW
ai-digital-life/frontend/src/app/features/network/NetworkSettings.tsx         # NEW（DSH 三块搬迁）
ai-digital-life/frontend/src/app/features/environment/EnvWizard.tsx           # NEW 首启向导
ai-digital-life/frontend/src/app/components/settings/settingsGroups.ts  # + network/environment 注册与重置映射
ai-digital-life/frontend/src/kernel/types.ts        # SettingsGroupId += 'network' | 'environment'
ai-digital-life/frontend/src/shared/settings-reset/types.ts # GroupKey += 'network' | 'environment'
ai-digital-life/frontend/src/app/stores/slices/uiSlice.ts + uiSliceTypes.ts # 两组 pending 信号
ai-digital-life/frontend/src/app/i18n/{zh-CN,en-US}/environment.ts + network.ts # NEW
ai-digital-life/frontend/src/app/components/settings/SettingsPanel.tsx   # 三组挂载+预取+pending分支
ai-digital-life/frontend/src/app/components/settings/settingsSearchIndex.ts # 两组 BlockEntry + 守卫测试
ai-digital-life/frontend/src/app/features/dsh/DshSettings.tsx       # 瘦身（删三块，加只读摘要行）
ai-digital-life/frontend/src/app/features/dsh/DshVersionManagement.tsx # taskCancelLabel 匹配 dsh- 前缀
ai-digital-life/frontend/src/shared/settings-reset/dshReset.ts + networkReset.ts # 拆分（source/proxy 归 network）
ai-digital-life/frontend/src/app/App.tsx # 向导触发 effect（照抄 dsh 自检串行）
```

---

### Task 1: IPC 类型 + 三桥 `env` 域 + parity 测试

**Files:**
- Create: `ai-digital-life/frontend/src/shared/ipc/env.ts`
- Modify: `shared/ipc/digital-life.ts`（`+ env: EnvBridge`）、`shared/ipc/dsh.ts`（`DshVersionTaskKind` 加宽）、`httpBridge.ts`（`env` domain）、`tauri-bridge/tauri-env.ts`（新建，`tauri-bridge.ts` 注册）、`mock/mock-env.ts`（新建，`mock-bridge.ts` 注册）、`shared/ipc/__tests__/env-parity.test.ts`（新建）

**Interfaces:**
- Consumes: 后端 `EnvStatus`（node/git/bash/webview2/adlserver/netprobe/task/dshReady，camelCase）、五路由（`GET /env/status`，`POST /env/install|select-source|set-custom-path|recheck`）
- Produces: `EnvBridge`（供 Task 2 actions 使用，签名冻结）；加宽后的 `DshVersionTaskKind`（供 Task 6 使用）

- [ ] **Step 1: Write the failing test** — `shared/ipc/__tests__/env-parity.test.ts`（照抄 `storage-parity.test.ts` 的“方法集”用例骨架）：

```ts
import { describe, it, expect } from 'vitest';
import { httpBridge } from '../../httpBridge';
import { mockBridge } from '../../mock-bridge';
import { createTauriEnvBridge } from '../../tauri-bridge/tauri-env';

const EXPECTED = ['getStatus', 'install', 'selectSource', 'setCustomPath', 'recheck'] as const;

describe('env bridge method parity', () => {
  it('exposes the same method set on tauri / http / mock', () => {
    for (const name of EXPECTED) {
      expect(typeof (httpBridge.env as any)[name]).toBe('function');
      expect(typeof (mockBridge.env as any)[name]).toBe('function');
      expect(typeof (createTauriEnvBridge(httpBridge.env) as any)[name]).toBe('function');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ai-digital-life/frontend && npx vitest run src/shared/ipc/__tests__/env-parity.test.ts`
Expected: FAIL（`Cannot find module '../..//httpBridge'.env` / env 不存在）

- [ ] **Step 3: Write minimal implementation** — `env.ts`：

```ts
import type { IpcResult } from './shared';
export type EnvSourceMode = 'auto' | 'system' | 'host';
export type EnvEffectiveSource = 'system' | 'host' | 'none';
export interface EnvDependencyState {
  mode: EnvSourceMode; effective: EnvEffectiveSource;
  origin: 'path' | 'registry' | 'bundled' | 'manual';
  installedVersion: string | null; baselineVersion: string;
  meetsBaseline: boolean; path: string | null; customPath?: string;
}
export interface EnvNetState {
  registryOk: boolean; registryLatencyMs: number; ciTokenConfigured: boolean;
}
export type EnvTaskKind = `env-${string}-install` | `env-${string}-uninstall` | `env-${string}-reinstall`;
export interface EnvTask { kind: EnvTaskKind; label: string; phase: 'preparing'|'installing'|'removing'|'finalizing'; done: number; total: number; cancellable: boolean; error?: string | null }
export interface EnvStatus {
  node: EnvDependencyState; git: EnvDependencyState; bash: EnvDependencyState;
  webview2: EnvDependencyState; adlserver: EnvDependencyState; net: EnvNetState;
  task: EnvTask | null; dshReady: boolean;
}
export interface EnvBridge {
  getStatus: () => Promise<IpcResult<EnvStatus>>;
  install: (dep: string, version?: string) => Promise<IpcResult<boolean>>;
  selectSource: (dep: string, mode: EnvSourceMode) => Promise<IpcResult<boolean>>;
  setCustomPath: (dep: string, path: string) => Promise<IpcResult<boolean>>;
  recheck: (dep?: string) => Promise<IpcResult<boolean>>;
}
```

`digital-life.ts` 加 `env: EnvBridge`；`dsh.ts:96` 改为 `export type DshVersionTaskKind = 'install' | 'uninstall' | 'reinstall' | `dsh-${'install' | 'uninstall' | 'reinstall'}`;`（parked label 修复的前置；旧字面量保留，旧调用方零改）。`httpBridge.ts` 加 `env` domain（`getStatus: GET /env/status`，其余 POST 传参）；`tauri-env.ts` 照抄 `tauri-dsh.ts` 透传；`mock-env.ts` 照抄 `mock-dsh.ts`（固定七段可用数据 + task null，`install` 返回 ok:true 并可置 task 演示态）。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/ipc/__tests__/env-parity.test.ts && npx tsc --noEmit`
Expected: PASS + 零错误

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/shared/ipc ai-digital-life/frontend/src/httpBridge.ts ai-digital-life/frontend/src/tauri-bridge ai-digital-life/frontend/src/mock-bridge.ts ai-digital-life/frontend/src/mock
git commit -m "feat(frontend): add env bridge types and tri-bridge parity"
```

---

### Task 2: env store（slice + actions + prefetch 缓存）

**Files:**
- Create: `ai-digital-life/frontend/src/app/stores/slices/envSlice.ts`、`app/stores/actions/envActions.ts`、`app/features/environment/envStatusCache.ts`
- Modify: `slicedStore.ts`（合并 slice，如现有 27 切片做法）、`StoreState.ts`（类型）、`useAppActions.ts`（如需暴露——先读现有 dshActions 挂载方式，照抄）

**Interfaces:**
- Consumes: Task 1 `EnvBridge`（经 `window.digitalLife.env`，照抄 `dshActions.ts:39` 取法）
- Produces: `fetchEnvStatus(silent?: boolean)`、`selectEnvSource(dep, mode)`、`installEnvDep(dep, version?)`、`setEnvCustomPath(dep, path)`、`recheckEnv(dep?)`、`pollEnvTaskWhileRunning()`（3s，只在 task 非空时轮询 `getStatus`，task 变 null 即停；注释写明“全量 status 开销，禁止常驻轮询”）、`envWizardDone/envWizardSkippedAt`（persisted registry，见 Task 8 读写；本任务只定义字段+读写器）

- [ ] **Step 1: Write the failing test** — `envSlice`/`envActions` 行为单测（vitest，mock `window.digitalLife.env`，照抄 `dshActions.test.ts:303-355` 桩法）：

```ts
it('fetchEnvStatus writes status and clears pending on ok', async () => {
  (window as any).digitalLife.env.getStatus.mockResolvedValue({ ok: true, data: fakeStatus() });
  await (actions as any).fetchEnvStatus();
  expect(useAppStore.getState().envStatus?.dshReady).toBe(false);
});
it('install failure surfaces toast and keeps old status', async () => { /* toast called, status untouched */ });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/stores/actions/__tests__/envActions.test.ts`
Expected: FAIL（无此文件/模块）

- [ ] **Step 3: Write minimal implementation** — 照抄 `dshActions.ts` 三段式（取桥 → 调 → 写 store/toast）+ `dshSlice.ts` 状态形（`envStatus: EnvStatus | null`、`envBusy: boolean`、`envBlocksAtDefault` 聚合、`networkGroupResetPending/environmentGroupResetPending` 消费位——pending 的置位在 uiSlice，见 Task 4；slice 只读）；`envStatusCache.ts` 照抄 `storageStatusCache.ts`（`getCachedEnvStatus/setCachedEnvStatus/resetEnvSettingsCache/prefetchEnvSettings`，fail-open：失败不抛）；`installEnvDep` 成功后启动 `pollEnvTaskWhileRunning`（`setInterval` 3s → `getStatus` → task null 即 `clearInterval` + 终态刷新 + toast；组件卸载时清——调用方在 useEffect 返回里清，照抄 DshVersionManagement 的 task 轮询处置）。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/stores/actions/__tests__/envActions.test.ts && npx tsc --noEmit`
Expected: PASS + 零错误

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/stores ai-digital-life/frontend/src/app/features/environment/envStatusCache.ts
git commit -m "feat(frontend): add env store slice actions and prefetch cache"
```

---

### Task 3: i18n 新领域（environment + network）

**Files:**
- Create: `ai-digital-life/frontend/src/app/i18n/zh-CN/environment.ts`、`en-US/environment.ts`、`zh-CN/network.ts`、`en-US/network.ts`
- Modify: `i18n/zh-CN/index.ts`、`en-US/index.ts`（注册领域，照抄 dsh.ts 注册）、`i18n/__tests__/keys.test.ts`（如为全量 key 表，追加两领域；先读其结构）

**Interfaces:**
- Consumes: Task 5/7 的文案需求（本任务先建最小键集：组标题、状态灯、来源三态、Bash 三选一、按钮、引导；Task 5/7 用到缺键时各自补 key+单测，不回头改本任务）
- Produces: `settingsEnvironment`、`settingsNetwork` 等 labelKey（供 Task 4 注册）；键命名空间 `environment.*` / `network.*`

- [ ] **Step 1: Write the failing test** — 在 `keys.test.ts` 追加（先读其断言风格，照抄 dsh 领域段落）：中英 key 集对等 + `settingsEnvironment`/`settingsNetwork` 存在。

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/i18n/__tests__/keys.test.ts`
Expected: FAIL（缺新领域）

- [ ] **Step 3: Write minimal implementation** — 最小键集（组标题/副标题/状态：就绪/需安装/需手动/缺失/版本过低；来源：自动检测/系统安装/宿主内置；Bash：Git 自带/WSL/MSYS2/手动路径；按钮：安装/切换/卸载/重装/重新检测/复制给 agent/前往配置；引导：webview2 下载页/adlserver 重装/dsh 凭据去向；wizard：欢迎/检测中/跳过/进入应用）。中文在前，英文对等；无硬编码中文散落 JSX（本任务只建字典）。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/i18n/__tests__/keys.test.ts && pnpm run check:i18n`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/i18n
git commit -m "feat(frontend): add environment and network i18n domains"
```

**Ruling（记账，偏离 spec §12 字面）**：DSH 旧键（`dshSettingsSource` 等）不迁移领域——key 只是标识符，搬迁破坏搜索索引/tests 且零收益；NetworkSettings 复用 dsh 域旧 key，新文案才用 network 域。

---

### Task 4: 设置注册表 + 面板接线 + 搜索索引

**Files:**
- Modify: `kernel/types.ts`（`SettingsGroupId += 'network' | 'environment'`）、`components/settings/settingsGroups.ts`（`SETTINGS_GROUPS` 在 dsh 后追加 network、environment；`RESET_ALL_GROUP_LABEL_KEYS` += 两组；`getGroupResetPatch` 对两组返回 null；`RESETTABLE_GROUPS` += 两组）、`shared/settings-reset/types.ts`（`GroupKey += 'network' | 'environment'`）、`stores/slices/uiSlice.ts` + `uiSliceTypes.ts`（`networkGroupResetPending/environmentGroupResetPending` + request/consume，照抄 dsh 四行）、`components/settings/SettingsPanel.tsx`（group→组件映射 += network/environment；打开即 `prefetchEnvSettings()`；`handleRequestResetGroup` 对两组分支置 pending；聚合初始化/校正段落照抄 storage/dsh 注释体例）、`components/settings/settingsSearchIndex.ts`（两组 BlockEntry：network 复用源/代理/测试三锚点文案 key；environment 按七依赖行登记）

**Interfaces:**
- Consumes: Task 3 labelKey
- Produces: 可导航的两空组（组件占位先返回 null + TODO？不——No Placeholders 规则：本任务只做到注册与接线，组件在 Task 5/7 到达；面板映射用懒加载 `lazy()` 指向尚不存在文件会炸 tsc……正确做法：本任务同时创建两组件的最小空壳（只渲染 SettingsHeader + 空卡片，均走 i18n），Task 5/7 填充。空壳测试：挂载断言标题存在。

- [ ] **Step 1: Write the failing test** — `settingsGroups.test.ts` 追加（照抄“单注册表”用例体例）：`RESETTABLE_GROUPS ⊇ keys(GROUP_RESET_PATCHES)` 差集恰为 storage/browser/dsh/network/environment；`getGroupResetPatch('network'|'environment') === null`。`settingsSearchAnchors.test.tsx` 追加两组锚点存在断言（组件空壳带 `data-settings-anchor`）。

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/components/settings/settingsGroups.test.ts`
Expected: FAIL（缺新组）

- [ ] **Step 3: Write minimal implementation** — 按 Files 逐项改；ResetAll `ORDER` 不动（network 不进全自动序列？不——Ruling 见下）；两组件空壳 `NetworkSettings.tsx` / `EnvironmentSettings.tsx`（Header + 空 card + 正确 anchor，消费各自 pending 信号清零——照抄 DshSettings 的 `consumeXGroupReset` 挂载行为，避免侧边栏 pending 悬空）。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/components/settings/ && npx tsc --noEmit`
Expected: PASS + 零错误

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/kernel ai-digital-life/frontend/src/app/components/settings ai-digital-life/frontend/src/app/stores/slices ai-digital-life/frontend/src/shared/settings-reset ai-digital-life/frontend/src/app/features/network ai-digital-life/frontend/src/app/features/environment/EnvironmentSettings.tsx
git commit -m "feat(frontend): register network and environment settings groups"
```

**Ruling（记账，ResetAll 范围）**：network 加入 ResetAll ORDER（接在 dsh 后；其重置=源/代理回自动，无下载无安装，沿袭旧“dsh 重置含源/代理”的不变量）；environment 不进 ResetAll 自动序列（避免批量操作改动用户工具链；其组级重置仅侧边栏自助）。`resetAllSettings.ts` 的 ORDER 改动在本任务 Step 3 内一并做 + 对应用例更新。

---

### Task 5: NetworkSettings（三块搬迁）+ 重置拆分

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/network/NetworkSettings.tsx`
- Create: `ai-digital-life/frontend/src/shared/settings-reset/networkReset.ts` + `networkReset.test.ts`（从 `dshReset.ts` 拆出源/代理恢复逻辑；`dshReset.ts` 缩为版本来源重置，同步改 `dshReset.test.ts`）
- Modify: `SettingsPanel.tsx`（network 映射由空壳换实装——如 Task 4 用直接 import 则改引入；pending 消费位由空壳迁入实装）

**Interfaces:**
- Consumes: Task 2（saveSourceConfig/testSource 经 actions？DshSettings 现调 `window.digitalLife.dsh.*` 直调+防抖——搬迁保持调用路径不变，只换文件位置；Task 3 key（复用 dsh 域旧 key，不新增））
- Produces: 三块 UI（source/proxy/test，anchors 改 `anchorFor('network', …)`，`data-settings-anchor` 同步改；搜索索引 Task 4 已按 network 登记——本任务保证 DOM 锚点与索引一致）

- [ ] **Step 1: Write the failing test** — 新建 `NetworkSettings.test.tsx`（照抄 `DshSettings.test.tsx` 三块用例：源切换落盘、代理切换、测试连接按钮态；桥 mock 复用既有 `dsh` 桥桩——因为调用的仍是 dsh 桥方法）。

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/features/network/NetworkSettings.test.tsx`
Expected: FAIL（无此文件）

- [ ] **Step 3: Write minimal implementation** — 以 `DshSettings.tsx` 第 601–790 行三块 JSX + 其 state/防抖/测试/重置逻辑为搬迁单元（按 `data-settings-anchor` 与 `SettingsHeader` 标题定位块边界，不按行号硬切）：整块移动，`anchorFor('dsh',…)` → `anchorFor('network',…)`；`dshBlocksAtDefault` 拆分为 `networkBlocksAtDefault`（源/代理）留本文件、`dshBlocksAtDefault` 缩为版本来源；`executeDshResetPlan` 源/代理部分迁入 `executeNetworkResetPlan`，dsh 侧保留版本来源重置；组级重置 pending 由 `dshGroupResetPending` 改 `networkGroupResetPending`（DshSettings 不再消费 dsh 的源/代理 pending）。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/features/network src/app/features/dsh/DshSettings.test.tsx && npx tsc --noEmit`
Expected: PASS（DshSettings 旧三块用例在本任务同步删除/迁移，不允许残留失败）

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/network ai-digital-life/frontend/src/shared/settings-reset ai-digital-life/frontend/src/app/components/settings/SettingsPanel.tsx
git commit -m "feat(frontend): extract network settings group from DSH"
```

---

### Task 6: DshSettings 瘦身 + 摘要行 + taskCancelLabel 修复（parked）

**Files:**
- Modify: `DshSettings.tsx`（删源/代理/测试三块及专属 state/防抖/测试逻辑；保留版本来源下拉 + `DshVersionManagement`；顶部加只读摘要行“当前源：{registry}（延迟 {ms}）［前往修改］”→ 跳转 network 组（`setActiveSettingsGroup('network')`，照抄 shortcuts 跳转）；`dshBlocksAtDefault` 只含版本来源）、`DshVersionManagement.tsx`（`taskCancelLabel` 匹配 `dsh-uninstall`/`dsh-reinstall`，kind 类型已在 Task 1 加宽）、`DshSettings.test.tsx` + `DshVersionManagement.test.tsx`（删迁移走的用例；加摘要行跳转 + cancel 标签用例：task kind `dsh-uninstall` 显示 `dshCancelUninstall`）

**Interfaces:**
- Consumes: Task 1 加宽类型；Task 5 搬迁完成面
- Produces: DSH 组终态（版本管理 + 摘要）；关闭 Phase 1 parked label 项

- [ ] **Step 1: Write the failing test** — `DshVersionManagement.test.tsx` 追加：

```tsx
it('取消按钮按 dsh- 前缀 kind 显示专属文案', async () => {
  // versionTask = { kind: 'dsh-uninstall', ... } 时按钮文案为 dshCancelUninstall（此前回退为通用）
});
```

（先读既有 task 行用例的 task 桩构造，照抄其 `versionTask` 注入方式。）

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/features/dsh/DshVersionManagement.test.tsx`
Expected: FAIL（`dsh-uninstall` 落到通用文案分支）

- [ ] **Step 3: Write minimal implementation** — `taskCancelLabel` 改为匹配 `'dsh-uninstall'`/`'dsh-reinstall'`（保留对旧 `'uninstall'`/`'reinstall'` 的兼容分支？不——后端已永远发 `dsh-*`（Phase 1 Task 6），旧分支是死代码，删掉；未发布阶段禁兼容代码）。DshSettings 删块 + 摘要行（读 `sourceStatus` 的 registry/latency，只读；失败/未知时显示“—”fail-open）。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/features/dsh/ && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/dsh
git commit -m "feat(frontend): slim DSH settings and fix task cancel labels"
```

---

### Task 7: EnvironmentSettings（七依赖行 + 聚合条）

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/environment/EnvironmentSettings.tsx`（替换 Task 4 空壳）
- Modify: `SettingsPanel.tsx`（如为 lazy 引入则无须改）

**Interfaces:**
- Consumes: Task 2 actions/store/cache；i18n environment 域；Task 3 key
- Produces: §7.2 四段式行 ×7（Node/Git/Bash/WebView2/adlserver/net+凭据；Bash 在 system 下三选一；WebView2 FixedVersion 开关收高级折叠；模型凭据行只读+“去 dsh 侧配置”引导，**绝不**把 `ciTokenConfigured` 标成模型就绪——Phase 1 parked 红线）、顶部聚合条（`n/N 就绪` + 重测 + 复制全部）、`[复制给 agent]`（payload = `{ dep, statusJson, baseline, copyContext }`，runbook 全文 Phase 3 追加；按钮文案注明“含诊断 JSON”）

- [ ] **Step 1: Write the failing test** — `EnvironmentSettings.test.tsx`：挂载（mock `window.digitalLife.env.getStatus` 返回七段 fixture）断言七行渲染 + Bash 三选一出现 + 模型行无红绿灯（只有引导链接）+ 复制按钮把 JSON 写剪贴板（mock clipboard，断言 payload 含 dep key 与 statusJson）；来源切换调用 `selectSource`；安装按钮走 ConfirmDialog（照抄 DshVersionManagement 确认态两段点击）。

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/features/environment/EnvironmentSettings.test.tsx`
Expected: FAIL（空壳无行）

- [ ] **Step 3: Write minimal implementation** — 行组件 `EnvDepRow`（props: depKey/status/actions/busy）：状态行（版本/路径/来源标签）+ 操作行（来源下拉；安装/切换/卸载/重装按钮经 ConfirmDialog；手动路径输入失焦即调 `setEnvCustomPath`，失败 toast 不保存——服务端已校验，前端只透传错误）+ 兜底层（复制给 agent + 官方外链）。Node/Git/Bash 可操作；WebView2/adlserver 只读；net+凭据只读（三灯：registry 通/模型 API 通（`registryOk` 复用？不——模型 API 通无后端信号，显示“随 dsh 状态”引导；`ciTokenConfigured` 显示为“凭据存储可用”，**不是**模型已配——文案必须写清楚）+ 去配置引导）。浏览器模式：系统级行 + 安装按钮置灰 + 说明（`isTauri` 分支，照抄 openMethod 开关模式）。安装中行显示 task 进度（读 `status.task`，`done/total` + 阶段文案，扫光样式复用 dsh 任务行 CSS 类如有）。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/features/environment/ && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/environment
git commit -m "feat(frontend): add environment settings group UI"
```

---

### Task 8: 首启向导 EnvWizard + App 触发 + 持久化

**Files:**
- Create: `ai-digital-life/frontend/src/app/features/environment/EnvWizard.tsx`
- Modify: `envSlice.ts`（`envWizardDone: boolean` + `envWizardSkippedAt: number | null`，persisted registry `defineEntry`，照抄 terminal `defaultTerminalProfile` 注册体例）、`App.tsx`（启动 effect：`fetchEnvStatus(silent)` 后若 `!envWizardDone` 且非浏览器模式？不——浏览器模式也展示（只检测+引导），触发条件同 spec；向导为全屏 overlay，`overlayHidden` 逻辑外独立 `showEnvWizard` state）、`EnvironmentSettings.tsx`（顶部：若 `envWizardSkippedAt` 且仍有未就绪项，显示 resume 横幅“上次跳过了 N 项［继续向导］”）

**Interfaces:**
- Consumes: Task 2 actions/store；Task 7 行组件（复用 `EnvDepRow` 精简版：状态+主操作按钮，去掉手动路径/高级；向导内手动路径入口保留为链接跳设置组）
- Produces: 四步向导（欢迎→检测中→逐项卡片→完成；可跳过记 `skippedAt`；断网降级：安装按钮变复制+手动后重测；Node 就绪才放行 dsh 入口提示）

- [ ] **Step 1: Write the failing test** — `EnvWizard.test.tsx`：`envWizardDone=false` + status 有缺项 → 向导渲染欢迎步；点跳过 → `envWizardDone=true` + `envWizardSkippedAt` 非空；全就绪 → 不渲染（返回 null）；断网 fixture（net.registryOk=false）→ 安装按钮被复制按钮替代。

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/app/features/environment/EnvWizard.test.tsx`
Expected: FAIL（无此文件）

- [ ] **Step 3: Write minimal implementation** — 全屏 overlay（复用 ConfirmDialog 的 modal 层级/CS 类如有，否则新建 `adl-env-wizard` 样式跟随设计 token，禁止硬编码色值）；步骤机（`'welcome'|'detecting'|'items'|'done'`）；detecting 调一次 `fetchEnvStatus`；items 复用 Task 7 `EnvDepRow`（prop `compact` 隐藏手动路径与高级区）；跳过按钮（secondary，写 skippedAt + 关）；完成按钮（Node 就绪才启用？不——可跳过哲学：完成恒可点，未就绪项仅提示；关闭写 `envWizardDone=true`）。App.tsx effect 放在 dsh 自检 effect 之后（串行：先 dsh 自检，再 env 拉取，再判向导，避免闪烁）。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/app/features/environment/ && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add ai-digital-life/frontend/src/app/features/environment/EnvWizard.tsx ai-digital-life/frontend/src/app/stores/slices/envSlice.ts ai-digital-life/frontend/src/app/App.tsx ai-digital-life/frontend/src/app/features/environment/EnvironmentSettings.tsx
git commit -m "feat(frontend): add first-run environment wizard"
```

---

### Task 9: 集成测试 + 手动 QA 门（human-owned 步骤）

**Files:** 无新增（验证任务；发现问题则修完再合入，不开新需求；`settingsSearchAnchors.test.tsx` 等既有文件若需补断言，在本任务内改）

- [ ] **Step 1: Run automated gates**

Run: `cd ai-digital-life/frontend && npx tsc --noEmit && npx eslint . && pnpm run check:i18n && pnpm run test`
Expected: 零错误 / 0 errors / 通过 / 全绿。若红：属 Phase 2 回归则修（小修直接修，大修回退到对应任务开 fix round）；属既有失败先留档后修，不堆新逻辑。

- [ ] **Step 2: Verify search-anchor guard**

Run: `npx vitest run src/app/components/settings/settingsSearchAnchors.test.tsx`
Expected: PASS（network/environment 锚点 + 行标记双断言；新增行文案已核对组件确实渲染该 key——评审级人工核对，在报告列出核对清单）

- [ ] **Step 3: Manual dual-mode QA（HUMAN-OWNED，subagent 不执行）**

Desktop（Tauri）：全新数据目录启动 → 首启向导四步全绿（含跳过记账/resume 横幅）→ network 组三块可用（源切换/代理/测试连接）→ environment 七行（来源切换/安装小依赖或 mock 演练/手动路径校验失败与成功/复制 agent 载荷检查剪贴板）→ DSH 组摘要跳转 → 断网降级展示。
Browser：同流程走 mock 桥，系统级行置灰 + 安装按钮变复制 agent。
Expected: 双端一致（除置灰项）；记录偏差即修。

- [ ] **Step 4: Commit**（若 Step 1–2 有修，补提交；全绿则无提交，门已过）

```bash
git log --oneline -3  # 确认 Phase 2 tasks 已合入，无额外提交
```

---

## Self-Review

**1. Spec coverage:** §7.1 network 拆分 → Task 4/5；§7.2 environment → Task 7（四段式/聚合条/预取/约束继承全覆盖；`[复制给 agent]` 载荷不含 runbook 全文——Phase 3 追加，此处载荷契约已冻结）；§6.2 向导 → Task 8（四步/可跳过记账/断网降级/dsh 不在向导内）；§9 双端 → Task 7 置灰 + Task 9 browser 模式；§4 模型凭据只读 → Task 7 引导行（`ciTokenConfigured` 显示为“凭据存储可用”，绝不冒充模型就绪）；parked taskCancelLabel → Task 6；§5 runbook → Phase 3（本计划只冻结复制载荷）。

**2. Placeholder scan:** 无 TBD/TODO；无“类似 Task N”（Task 5 明确按 anchor 字符串搬迁；Task 7 行结构逐项列出）；测试断言具体（button 文案 key、payload 字段）。

**3. Type consistency:** `EnvBridge`（Task 1）→ Task 2 actions 调用签名一致（dep/version/mode/path）；`EnvStatus` 七段 + task + dshReady → Task 7 行渲染与 Task 2 `dshReady` 读取一致；`SourceMode` 三态 → Task 7 下拉选项一致；`ENV_DEPS` 六键与行 key 一致；`DshVersionTaskKind` 加宽 → Task 6 label 匹配一致；pending 信号名（Task 4）→ Task 5/7 消费一致。

---

Plan complete and saved to `docs/superpowers/plans/2026-10-23-env-phase2-frontend.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
