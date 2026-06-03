# 第 31-32 轮重构经验教训

> 日期：2026-06-04 | 来源：重构洞察 2026-06-03 执行 + 浏览器控制台报错修复

## React 19 iframe 事件系统陷阱

**问题**：跨源 iframe 加载时控制台报 `SecurityError: Failed to read a named property '$$typeof' from 'Window'`，随后触发 React 内部 `Error: Should not already be working` 不变量违例。

**根因**：React 19 使用 `listenToNonDelegatedEvent("load", domElement)`（`react-dom-client.development.js:20684`）在 iframe 元素上注册内联原生 `load` 监听器。跨源时 React 事件处理尝试访问 `contentWindow` 的非允许属性（`$$typeof`），抛出 SecurityError，污染 React 内部状态机，导致后续 render 时触发 `performWorkOnRoot` 的不变量违例。

**修复**：移除 iframe 的 React `onLoad` prop，改用 `useEffect` + 原生 `addEventListener("load", handler)` 绕过 React 事件系统。

**教训**：React 19 对 `<iframe>` 的 `load` 事件使用非委托监听（`non-delegated`），跨源场景下 React 事件系统自身会抛出错误且无法被业务代码的 `try/catch` 阻止，必须脱离 React 事件系统才能根治。

## Rust 依赖删除需检查完全限定路径

**问题**：删除 `crates/browser/Cargo.toml` 的 `tracing` 依赖后编译失败，显示 `cannot find macro tracing::info!`。

**根因**：`tracing::info!()` 使用**完全限定路径**而非 `use tracing;`，常规 `rg "use tracing"` 搜索无法匹配。

**经验**：删除 Rust crate 依赖前，必须同时搜索：
- `use <crate>` 导入语句
- `#![...]` 属性宏（如 `#![feature(...)]`）
- `<crate>::` 完全限定路径用法
- `#[derive(...)]` 宏（如 serde 的 Serialize/Deserialize）

## Windows 下 TypeScript 文件名大小写一致性

**问题**：`tsc --noEmit` 报 `TS1261: File name 'browserslice.ts' differs from already included file name 'browserSlice.ts' only in casing.`

**根因**：实际文件名是 `browserSlice.ts`（大写 S），但 3 个 `.tsx` 文件使用全小写 `./slices/browserslice` 导入路径。Windows 大小写不敏感文件系统下正常解析，但 TypeScript 5.x 严格模式会检测并报错。

**修复**：全局替换所有 `browserslice` → `browserSlice`（12 个 `.ts` + 3 个 `.tsx` 文件）。

**经验**：Windows 开发环境下运行 `tsc --noEmit` 可提前发现此类问题，避免 CI 在 Linux（大小写敏感）上失败。

## Error AppError 错误枚举职责划分

**问题**：`crates/errors/src/lib.rs` 缺少 `Timeout`、`RateLimit`、`AuthError` 变体，所有错误通过 `anyhow` 映射为 `InternalError`，前端无法区分错误种类。

**修复**：新增三个变体，并在 `CommandError::from` 中做精细映射；同时修复 `CommandError::Display` 从 debug `{:?}` 改为 display `{}`。

**经验**：错误枚举应覆盖常见的业务错误种类（超时、限流、鉴权）而非将所有异常折叠为 `InternalError`，否则前端无法做差异化处理。

## 未使用 Rust 依赖清理清单

涉及 6 个 crate，共移除 15 条未使用依赖：

| Crate | 移除 |
|-------|------|
| `workspace` | chrono, regex |
| `conversation` | serde_json, chrono, uuid, tracing |
| `task` | serde, chrono, uuid, tracing |
| `change-engine` | serde, serde_json, uuid, chrono, tracing |
| `fs-ops` | notify, tokio, tracing, serde, serde_json |
| `model-gateway` | chrono, uuid, tracing |

保留 `tracing` 在 `browser`（完全限定路径使用）。

## CSS transition:all 检测与修复

**问题**：`browser-panel.css` 4 处 `transition: all` 违反 CSS 架构规则，造成不必要的布局和绘制触发。

**修复**：替换为 `transition: background, border-color, color var(--duration-150) ...` 等精确属性。

**经验**：`transition: all` 应被自动化工具或 CI lint 捕获。CSS 架构规范（仅 `transform` 和 `opacity` 可动画）在 `css-architecture.md` 中已有规定。
