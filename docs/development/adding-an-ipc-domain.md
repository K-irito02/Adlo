# 新增一个 IPC 域（端到端清单）

> 用途：新增一个跨 Rust / 四端桥接 / store / UI 的功能域时，按本清单逐项接线，避免「只接了 Tauri、浏览器模式空白」这类返工。
> 先例：`dsh`、`opencode`、`env`、`storage` 四个域。

## 1. Rust 侧

- [ ] 业务逻辑落在独立 crate（如 `crates/harness-version`），不写进 handler。
- [ ] `crates/server/src/handlers/<domain>.rs`：只做参数解析、状态读取、错误映射；返回 `Result<serde_json::Value, AppError>`。
- [ ] `handlers/mod.rs` 注册模块；`router.rs` 注册路由（`POST /<domain>/<action>` 为主）。
- [ ] 需要跨请求状态的，加到 `ServerState` 并在 `engine.rs` 与 `test_util.rs` 两处初始化。
- [ ] 只有壳层独有能力（窗口/对话框/原生 API）才加 `#[tauri::command]`，并登记 `capabilities/*.json`；纯业务一律走 HTTP 路由。

## 2. 前端契约

- [ ] `frontend/src/shared/ipc/<domain>.ts`：定义返回值类型与 `XxxBridge` 接口；每个方法写清 `@command` / `@see` 指向对应两端实现。
- [ ] `shared/ipc/index.ts` 增加 `export *`。
- [ ] `shared/ipc/digital-life.ts` 的 `DigitalLifeBridge` 增加该域字段。
- [ ] 若与既有域共享形状（如版本状态），在注释里写明复用理由；迁移时再抽通用类型。

## 3. 四端实现（缺一即双端不一致）

- [ ] `httpBridge.ts`：真实 HTTP 调用（浏览器/预览）。
- [ ] `tauri-bridge/tauri-<domain>.ts` + `tauri-bridge/index.ts`：桌面端委托 http 域。
- [ ] `mock/mock-<domain>.ts` + `mock-bridge.ts`：纯前端可用的假实现（含成功/失败路径）。
- [ ] `preview-bridge/index.ts`：按域选择 `preferHttpWhenReachable` 或 mock-only，并在注释里说明选择理由。

## 4. Store 与状态

- [ ] 共享状态才进 store：`app/stores/slices/<domain>Slice.ts` + `actions/<domain>Actions.ts`。
- [ ] 注册到 `slicedStore.ts`、`StoreState.ts`；需要持久化的字段登记到 `persisted/registry.ts`。
- [ ] 只在单个组件使用的状态留在组件内，不建 slice。

## 5. UI 与设置面板

- [ ] 功能目录放 `app/features/<domain>/`；组件不直接 import `@ai-digital-life/kernel`（从 `@shared/ipc` 取）。
- [ ] 若进设置面板：`SettingsGroupId`、`settingsGroups.ts`、`SETTINGS_COMPONENTS`、组级重置流程、搜索锚点五处同时接线。
- [ ] 锚点用 `anchorFor(group, sub)`；新增分组后跑 `settingsSearchAnchors` 与 `SettingsPanel` 测试。

## 6. 文案

- [ ] `i18n/zh-CN/<domain>.ts` 与 `en-US/<domain>.ts` 成对新增，并在两侧 `index.ts` 展开。
- [ ] 跑 `pnpm --dir ai-digital-life/frontend run check:i18n`（键必须完全对齐）。
- [ ] 同步更新 `i18n/__tests__/keys.test.ts` 的关键键清单（若该域有关键文案契约）。

## 7. 测试与契约

- [ ] 服务端：handler 级测试（非法 body、缺参数、成功路径）。
- [ ] 桥接：至少一条四端形状一致的测试（参照 `shared/ipc/__tests__/storage-parity.test.ts`）。
- [ ] 组件：注入假桥，断言用户可见行为，不测内部实现。
- [ ] 跨语言契约：固定 JSON 夹具 + Rust 序列化断言 + TS `satisfies` 断言（参照 `fixtures/harness-version-status.json`）。

## 常见漏项

- 只加 httpBridge，忘记 mock/preview → 浏览器模式报「不支持」。
- 只加前端类型，忘记 `digital-life.ts` → `window.digitalLife.<domain>` 类型缺失。
- 设置组加了导航，忘记 `SETTINGS_COMPONENTS` → 点进去空白。
- 新增分组后忘记 `RESETTABLE_GROUPS` / `getGroupResetPatch` 的差集约束 → 顶部「恢复全部默认」判定失真。
- 改了 Rust 序列化字段，没同步 TS 形状 → 运行时 `undefined`（契约测试可拦）。
