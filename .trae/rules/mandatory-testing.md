---
description: End-of-work acceptance flow: mandatory red-green testing procedure, auto-triggered after code changes
alwaysApply: true
---

# 结束验收流程（强制红绿测试）

> 命令默认在 `adlo/` 执行；在仓库根执行时，前端命令用 `pnpm --dir adlo/frontend ...`，adlo 脚本用 `pnpm --dir adlo run ...`。

## 核心原则

任何代码变更完成后，必须自动触发结束验收流程。**主观 UI/UX 验收由用户自行完成；但 CSS 选择器、层叠关系、主题 token 或布局变更必须做机械计算样式验证（见 [desktop-ui-verification.md](desktop-ui-verification.md) 与 `ui-probe.mjs`）。**

验收**默认不打开 Tauri 桌面应用**；CSS 的计算样式验证见下方专节。桌面 E2E 是额外 opt-in 层，不属于默认验收。

---

## 触发条件

Agent 完成以下任一操作后**自动触发**结束验收流程：

| 触发场景       | 说明                             |
| -------------- | -------------------------------- |
| 代码变更完成   | 修改、新增、删除任意代码文件后   |
| Bug 修复完成   | 定位并修复问题后                 |
| 新功能实现完成 | 功能代码编写完毕                 |
| 重构完成       | 代码结构调整、模块迁移后         |
| 依赖更新       | package.json / Cargo.toml 变更后 |

用户**随时可手动请求**验收（如 "执行验收"）。

---

## 变更层级与测试范围

Agent 在触发验收时，先评估变更范围，确定测试层级：

| 层级          | 适用范围                                                                      | 测试范围                                      |
| ------------- | ----------------------------------------------------------------------------- | --------------------------------------------- |
| **L1 轻量级** | 纯文案/注释、配置文件（非 schema）、纯 CSS token 值（不改变选择器/层叠/布局） | 仅运行格式检查 + Lint                         |
| **L2 模块级** | 单个 util/Hook/组件/Rust 函数修改                                             | 格式检查 + Lint + 类型检查 + 变更模块相关测试 |
| **L3 全量级** | 架构变更、IPC 契约、Store 切片、Rust crate 核心、新增功能                     | 格式检查 + Lint + 类型检查 + 全部测试         |

**层级选择规则**：

1. Agent 通过 `git diff` / 文件变更列表评估影响范围
2. 不确定时升级到更高层级
3. 同时涉及前后端时，前后端分别按各自最高层级执行

**CSS 选择器 / 层叠 / 布局 / 主题覆盖变更不属于 L1**：至少 L2，并按下方「UI 计算样式验证」采集证据。

### UI 计算样式验证（CSS 变更的机械项）

凡修改 CSS 选择器、层叠关系、主题 token 或布局：

1. 启动 `pnpm run dev:preview`（或使用环境内置 browser 工具）。
2. 用 `node adlo/scripts/ui-probe.mjs --url <预览地址> --selector <css> --props border-radius,background-color,color,font-size` 读取计算值；亮暗两套用 `--theme light` / `--theme dark`，聚焦态用 `--focus <选择器>`，窄视口用 `--viewport 720x900`。
3. 把选择器、属性、两套值写入进度文件；计算值与预期不符先修 CSS，不要只靠截图/肉眼。
4. 若环境提供内置 browser 工具，优先用 `evaluate` 读 `getComputedStyle`；否则用 `ui-probe` / `playwright-cli`。

### 桌面 E2E（按需，不属于默认验收）

默认验收仍在 CLI + jsdom 内完成，**不启动真实应用**。桌面-only 改动（原生窗口/面板、真实 IPC、Tauri 插件）或用户明确要求时，额外跑桌面 E2E；命令与前置见 [commands.md](commands.md#测试命令)，流程/用例规则/排障见技能 `desktop-e2e-wdio`。

该套件 **不进** `check:all`，不替代 vitest / Rust 测试与视觉验收（视觉见 [desktop-ui-verification.md](desktop-ui-verification.md)）。

---

## 测试材料管理

### 材料检查

验收前检查材料是否充足：

1. 新代码是否被现有测试覆盖？
2. 现有 mock/fixture 是否覆盖新增代码的类型定义？
3. 边界路径（空值、异常、极值）是否有测试？

### 自动生成规则

材料不足时 Agent 自动生成；规则：

```
生成材料时必须同时满足：
├─ ① 基于真实类型定义 — 使用代码中实际的 TS 类型/Rust 结构体生成数据
├─ ② 覆盖常规路径 — 正常业务逻辑路径的数据
├─ ③ 覆盖边界路径 — 边界值、空值、异常值
├─ ④ 基于真实场景 — 模拟实际使用中的操作流和数据流
└─ ❌ 禁止：仅为了通过测试而裁剪数据字段、简化逻辑、回避复杂路径
```

### 异步拉取后读 store 的用例

effect / action 若先 `await` 拉取数据再读 store（如打开下载卡片先 `fetchDownloads()` 再取 ids 刷新文件状态），必须有一条**冷启动**用例：store 初始为空，拉取完成后断言后续调用使用的是新拉取到的数据。只有「store 已有数据」的温路径用例不算覆盖——渲染快照里的 ids 在拉取前就为空的缺陷不会被温路径发现。

### 询问机制

以下情况 Agent 必须向用户询问，而不是自行生成：

- 需要外部服务/API 的 mock 数据（如模型网关响应格式）
- 涉及业务领域知识的复杂数据编排
- 无法从现有类型定义推断出合理测试数据

---

## 验收执行流程

### 步骤顺序

按依赖关系组织，先轻量后重量，前后端可并行执行：

```
步骤 1（并行）：
├── 前端组：
│   ├── ① ESLint 检测并修复：    pnpm --dir frontend run lint:fix
│   ├── ② Prettier 格式化：       pnpm --dir frontend run format
│   └── ③ TypeScript 类型检查：  pnpm --dir frontend run typecheck
│
└── 后端组（Rust）：
    ├── ① rustfmt 格式化：         cargo fmt --all
    ├── ② clippy 检测并修复：      pnpm run stage:sidecar && cargo clippy --workspace --all-targets --fix -- -D warnings
    └── ③ 编译检查：               pnpm run cargo:check

步骤 2（并行）：前端 `pnpm --dir frontend run test`；Rust `pnpm run cargo:test`。

步骤 3（可选）：前端 `pnpm --dir frontend run coverage`；Rust `cargo llvm-cov --workspace`（仅收集，不设硬性门禁）。
```

### 受影响测试优先执行

日常开发无需执行全量测试；只跑受影响的测试：前端 `pnpm --dir frontend run test -- <pattern>`（或 `check:changed`），Rust `cargo test -p <crate> [filter]`；命令清单见 [commands.md](commands.md#测试命令)。

**执行策略**：

1. **L1 变更**（文案/样式）：仅 lint + format，跳过测试
2. **L2 变更**（单模块）：仅运行受影响 crate/vitest 文件
3. **L3 变更**（架构/跨模块）：先运行受影响的多个 crate / 测试文件
4. **合并前 / 发布打包 Tauri 前**：全量测试 + 双端验证

**全量审批**：第 4 步（以及任何 `check:full`、`cargo test --workspace`、`cargo tauri build`）执行前**必须通知用户并取得批准**，不得自行全量。日常开发只跑受影响测试（前端 `pnpm check:changed` 或 `vitest related`，Rust `cargo test -p <crate>`）。

### 关于修复

ESLint、Prettier、Clippy、rustfmt 四个工具先**检测并自动修复**（写入文件），然后再次运行验证修复结果。修复后如果产生了代码变更，重新执行步骤 1 中的类型检查和编译检查。

### 修复约束

ESLint/Clippy 的 `--fix` 自动修复和任何人工修复必须遵守以下约束：

| 约束     | 要求                                                                                                     |
| -------- | -------------------------------------------------------------------------------------------------------- |
| 核心原则 | 所有修改不得破坏现有功能效果以及 UI/UX                                                                   |
| 影响评估 | 修复前识别涉及模块与依赖，评估影响范围                                                                   |
| 风险把控 | 确保修复不会破坏现有功能效果以及 UI/UX；确保修复是经充分论证的正向改进，能提升性能、安全、可维护性或体验 |
| 最小变更 | 仅修复工具报告的问题，不做无关的代码变更                                                                 |
| 验证     | 修复后重新运行类型检查和测试确认无回归                                                                   |

---

## 审查期测试强度（判断项）

以下不是“有没有测试”，而是“测试能不能抓住回归”，供实现与审查双方自检：

| 场景                                         | 最低强度                                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 计时 / 防闪烁（延迟、最短展示、去抖）        | 用 fake timers **跨过阈值两侧**断言；断言“不应出现”时也要越过阈值再断，否则永远为真                                 |
| 资源生命周期（缓存淘汰、worker、object URL） | 断言 dispose/destroy 被调用；覆盖“解析完成时组件已卸载 / 已被新请求取代”的路径                                      |
| 缓存命中                                     | 同时断言“未重复解析/渲染”**且**“越过延迟窗口后仍无加载占位”                                                         |
| 仅 DOM 的交互（双击、触屏、焦点）            | 用事件级别测试（必要时自造 `pointerType`），不要只测回调                                                            |
| 回归修复                                     | 以修复前的代码/数据形态作输入，先在修复前跑一次确认会红；不得预置修复后的状态（否则测试空转，审查时按“无测试”处理） |
| 分支切换 / 竞态                              | 模拟“旧请求晚于新文档返回”，断言旧结果不落到新视图                                                                  |

> 测试标题与注释用词汇表规范词（空态 / 加载占位 / 加载宽限），不要用“空状态”兼指“内容被清空”。

### 行为 / UI 用例的变异自检

新增或修改行为/UI 用例后，先自己做一次变异，再交给审查：

1. 删除或反转被测实现（或把关键分支改成相反值），运行该用例，确认**变红**；不变红说明断言没有约束到行为。
2. jsdom 观察不到的属性（`position: sticky`、像素宽度、真实层叠/滚动位置）不得写进用例标题，也不得作为断言依据；改用可观测的 DOM 状态（`data-*`、class、顺序），或标注为真实渲染验证项（见下文「jsdom 与真实浏览器的断言边界」）。
3. 同一断言在多处重复（例如两个用例都断言同一包含关系）时，保留一处，另一处改为该用例真正新增的契约。

---

### 测试临时目录隔离（硬性）

测试创建的临时目录必须**进程唯一**：用 `uuid` 或 `std::process::id()` + 计数器拼目录名；禁止固定名（`temp_dir().join("my-test")`）。并发跑同一 crate 的测试时（例如 `check:changed` 与手动 `cargo test` 同时进行），固定名目录会被两个进程互删，watcher/DB 类用例会挂起或偶发失败。`check-source-hygiene` 对新增行里的固定名临时目录给出 warning（存量逐步清理）。

---

## 覆盖率收集

覆盖率工具配置后自动可用，但**不设硬性门禁**（仅参考，不作验收通过条件）：前端 `@vitest/coverage-v8`（lcov + text），Rust `cargo llvm-cov`（lcov + html）。

---

## 结果处理

### 通过

所有步骤成功 → ✅ 验收通过，标记任务完成。

### 失败

测试失败时按以下流程处理：

```
1. 记录失败 — 记录失败的步骤、错误信息、失败测试名称
2. 分析原因 — 区分"实现 bug"与"测试过时"
   ├─ 实现 bug → 修复实现代码
   └─ 测试过时 → 更新测试（同步到当前实现）
3. 修复问题 — 遵循修复约束（见上）
4. 重新验证 — 从步骤 1 重新执行完整流程
5. 升级机制 — 修复尝试 3 次仍失败 → 向用户报告并等待指示
```

### Flaky Test 处理

| 判定                           | 处理                                                     |
| ------------------------------ | -------------------------------------------------------- |
| 连续运行 5 次，偶发失败 ≤ 2 次 | 标记为 flaky，记录日志，不阻塞验收                       |
| 连续运行 5 次，失败 > 2 次     | 视为真实失败，按失败流程处理                             |
| 已知 flaky test                | 在 `adlo/frontend/scripts/flaky-tests.json` 登记；`pnpm --dir frontend run test:flaky` 单独运行，`check:changed` 自动加 `--exclude` |

---

## 禁止行为

- ❌ 跳过验收流程直接标记完成
- ❌ 只运行部分测试忽略失败
- ❌ 类型检查有错误仍继续
- ❌ 故意简化测试材料使其通过测试
- ❌ 使用 `requestAnimationFrame` 等异步包装绕过检测
- ❌ 修复工具报告的问题时引入无关代码变更

---

## 相关文件

- [quality-gates.md](./quality-gates.md) — 质量门禁
- [dev-rules.md](./dev-rules.md) — 代理交互与执行规则
- [error-handling.md](./error-handling.md) — 错误处理

---

## jsdom 与真实浏览器的断言边界

`jsdom` 不实现浏览器的**焦点修正**与布局引擎，因此以下断言在 jsdom 中"恒真/恒假"，会形成假信心：

| 断言类型                                  | jsdom 表现             | 真实浏览器（Chromium/WebView2）  |
| ----------------------------------------- | ---------------------- | -------------------------------- |
| 元素 `disabled` 后焦点去向                | 焦点**仍停留**在元素上 | 焦点被移到 `<body>`（模态框外）  |
| `dialog.contains(document.activeElement)` | 恒真（不会失焦）       | `disabled` 后恒假                |
| `Tab` 是否逃出模态框                      | 无焦点遍历顺序语义     | 按可聚焦元素集合真实遍历         |
| `pointer-events: none` / `opacity` 计算值 | 需真实样式表加载       | 需把 `styles/index.css` 全量注入 |

**规则：**

1. **焦点/键盘可达性/模态框契约**类的断言，必须在真实 Chromium 中验证（Playwright，`channel: msedge` 与 WebView2 同引擎）；jsdom 只用于锁「属性存在与否」与逻辑分支
2. 验证真实浏览器行为时：注入**完整** `styles/index.css`（缺少某个 region 文件会因 `z-index`/定位缺失产生误报）、用 esbuild/vite 打包真实组件而非重写简化版
3. 结论必须附实测输出（`activeElement` 等计算值），不得仅凭 jsdom 通过即宣称"无障碍正确"

> 不要只凭 jsdom 断言：禁用且已聚焦的元素在真实 Chromium / WebView2 会把焦点交给 `<body>`；需要不可重复点击时用 `aria-disabled` + `pointer-events:none`。

### 异步渲染断言（等内容，不等容器）

`render` 返回后容器即存在，但数据（快照/轮询/测量）尚未落定：以容器存在（`querySelector` 非空、`toBeTruthy`）作为 `waitFor` 同步点是竞态——单文件跑必过，并发跑偶发红。同步点必须落在**可见内容**上（`findByText` / `findByRole` / 业务文案 `getByText`）。

### 设置卡片行律收边锁

行律契约（`styles/components/settings.css:257`，`:first-child`/`:last-child` 收边假定行是卡片直接子元素）：测量尺、portal 挂载点等非行空 div 不得出现在卡片内末位，否则末行分隔线去不掉。结构测试必须锁定 `card.lastElementChild` 即末行本身（例：`HarnessVersionCard.structure.test.tsx`「页脚行为末行断言 + sizer 在卡外」）。
