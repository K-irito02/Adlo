# 运行环境依赖管理设计（2026-10-23）

> 方案 A（统一环境框架）。已与用户逐节确认：§1 来源模型 → §2 后端框架（含通用层提取修正案）
> → §3 安装包与向导分工 → §4 设置组 UI（含 network 独立成组修正案）→ §5 runbook 与兜底。

## 1. 背景

用户下载安装本应用后，若本机缺少 Node.js / Git / Bash / WebView2，或版本过低，
助手、Git 面板、终端等功能不可用。现状：

- WebView2 靠 Tauri 默认 `downloadBootstrapper`，`tauri.conf.json` 未显式配置，
  国内用户装机期连不上微软 CDN 则应用起不来。
- `adl-server` 引擎定位只认开发机 `target/`（`src-tauri/src/adl_server.rs:40`），
  未随包（无 `externalBin`/`resources`），装机后业务功能降级为 system-only。
- dsh 的运行/安装强依赖本机 `node` + `npm`
 （`crates/server/src/handlers/dsh.rs:556`、`crates/dsh-version/src/install.rs:103`），
  无“宿主内置 Node”选项；Bash 探测只认 Git 的 `bash.exe`
 （`crates/pty/src/shell_resolver.rs:106`），无 WSL/MSYS2 选择。
- DSH 组内“下载源 / 代理 / 测试连接”三项语义实为全局网络属性，
  却挂在 dsh 名下；未来依赖安装、浏览器内下载都要复用。

## 2. 目标

- 用户装完即用：安装包保持轻量；装机期（NSIS）补系统级依赖，
  首次启动向导补用户级依赖；缺失/过低时自动装稳定版。
- 装后可在新设置组查看、管理全部运行环境依赖（来源切换、安装/卸载/重装、
  手动路径、agent 引导兜底）。
- dsh 那套已验证流程（版本目录 + `selected.txt` + 原子替换 + 安装锁 +
  进程托管 + 进度流）提取为通用可复用层。

## 3. 非目标

- 不做全随包离线发行版（dsh 装完约 0.7GB，此路不可行；企业离线分支以后再议）。
- 不改动用户已有的系统级安装（升级/卸载只动宿主托管副本；WebView2 Evergreen
  由微软更新，本应用不动）。
- 不代填、不读取模型凭据内容（只做“已配/未配”状态 + 引导）。
- 不替用户安装 WSL 发行版（超出应用职责，进 runbook 由 agent/用户手动做）。
- 未发布阶段：重构直接改，不留向后兼容层、不做数据迁移。

## 4. 依赖清单与来源模型

### 4.1 统一状态结构

```ts
type SourceMode = 'auto' | 'system' | 'host';       // 用户偏好
type EffectiveSource = 'system' | 'host' | 'none';  // 实际生效
interface DependencyState {
  mode: SourceMode; effective: EffectiveSource;
  origin: 'path' | 'registry' | 'bundled' | 'manual'; // 系统项细分来路
  installedVersion: string | null; baselineVersion: string;
  meetsBaseline: boolean; path: string | null; customPath?: string;
}
```

手动填路径 = `mode: 'system' + origin: 'manual'`，不新增第四态。

### 4.2 来源矩阵

| 依赖 | 自动 | 系统 | 宿主内置 | 手动路径 | 版本基线 |
|---|---|---|---|---|---|
| Node.js | ✅ | PATH `node` | ✅ 官方便携包 → `env-hosted/node/<v>/` | ✅ | LTS 主版本（基线文件定） |
| Git | ✅ | PATH `git` | ✅ MinGit 便携版 | ✅ | 近期稳定版（如 ≥2.4x） |
| Bash | ✅ | 三选一：Git 自带 / WSL / MSYS2 | ✅ 随 MinGit 共生（不单独装） | ✅ 填 `bash.exe` | 无独立基线，跟提供方 |
| WebView2 | ✅ | Evergreen（注册表探测） | ⚠️ FixedVersion（默认关闭，仅离线/企业场景） | 官网引导（只读） | `minimumWebview2Version`（匹配 `ICoreWebView2_15` 需求） |
| adl-server | — | — | 随包 `externalBin`（无切换） | — | 与应用版本一致 |
| dsh | 已有版本管理组 | —— | —— | —— | 新组仅显示前置就绪（Node 是否 OK） |
| 网络+凭据 | — | — | — | — | 只读三灯：registry 通 / 模型 API 通 / 凭据已配 + 引导 |

已确认的三条判定：Bash 不独立安装；WebView2 宿主内置默认关闭；
基线由 `env-baseline.json`（随包内置、可在线刷新）定义，非写死。

> Bash 宿主来源实现口径：复用 Git 的宿主托管目录，
> 即 `env-hosted/git/<selected>/bin/bash.exe`（MinGit 自带），bash provider
> 不设独立托管目录；`resolve` 时读 git provider 的选中版本。

## 5. 后端设计

### 5.1 通用托管层 `adl-hosted`（从 dsh 提取，修正案）

从 `dsh-version` / `webapp-host` / `dsh-bundle` 提取与 dsh 无关的通用能力，
按新职责重命名（旧名仅 dsh 特有者保留）：

- `HostedVersions`：`<root>/<name>/installed/<v>/` + `selected.txt` 布局管理、
  完整性判定（marker 文件存在性）、剩余最高版本回落。
- `AtomicSwap`：`installed/.tmp-<v>-<nonce>` → 原子改名 → 清旧版；失败清 tmp 保旧版。
- `InstallLock`：`Arc<AsyncMutex<()>>` 串行化（照抄 `dsh_version_lock` 模式）。
- `ProcHost`：`spawn_capturing`（stdout marker 捕获 + drain 防阻塞 + `.cmd` 回退）
  与端口就绪轮询（从 `webapp-host` 泛化，marker 参数化）。
- `ProgressTask`：安装进度 task 流（复用 `version-task` 进度模型）。
- `adopt`：一次性预置包收编语义（从 `dsh-bundle` 泛化：detect → move/copy →
  删源，单副本不变式）。

dsh 侧保留特有逻辑：registry catalog 查询、运行中指纹探测、3080 端口策略、
`dsh` 可执行探测（`where dsh`）。`dsh-version` 改为依赖 `adl-hosted`。

### 5.2 新 crate `adl-env`（低层，不依赖高层 crate）

```rust
trait DependencyProvider {
  fn key(&self) -> &'static str;
  fn detect(&self) -> Detection;                       // 系统/现存探测
  async fn install(&self, v: &str, sink: Progress) -> Result<Installed, AppError>;
  async fn uninstall(&self, v: &str) -> Result<(), AppError>;
  fn set_custom_path(&self, p: &Path) -> Result<Validated, AppError>;
  fn resolve(&self, mode: SourceMode, sys: &Detection, host: &HostState) -> EffectiveState;
}
```

- providers：`node | git | bash | webview2 | adlserver | netprobe`。
- 迁移复用：Node 安装复用既有 npm 流程；Bash 探测复用
  `pty/shell_resolver.rs` 三路 + 补“宿主 MinGit”一路；WebView2 探测复用
  `wry::webview_version()` + 注册表读版本。
- 托管布局：`<数据根>/env-hosted/<name>/<version>/` + `selected.txt`，
  与 dsh-versions 同构；Node 便携包 / MinGit 解压即用，无需提权。
- 配置：新文件 `env-sources.json`（每依赖一个 `version_source`），与 dsh 的
  `download-sources.json` 并列，互不污染。
- `adl-server` 随包：`tauri.conf.json` 加 `externalBin`（对三元组命名），
  `adl_server.rs` 改相对 `current_exe()` 解析；找不到保留 system-only 降级。

### 5.3 API 面（`crates/server`）

- `GET /env/status`：七项聚合，一次拉取供设置组 + 向导共用。
- `POST /env/install`：走 `ProgressTask` 进度流（与 version-task 同模型）。
- `/env/select-source`、`/env/set-custom-path`（服务端即时校验）、`/env/recheck`。
- 双端同步：`httpBridge` + `mock-bridge` + tauri 透传实现；新增 IPC 进
  `capabilities/*.json` 白名单（禁 `all`/`**` 通配）。
- `env-baseline.json` 以 Tauri resource 随包，启动加载，支持在线刷新
  （失败用内置）。

## 6. 安装包与首次启动向导

### 6.1 NSIS 侧只做系统级（`bundle.windows`）

- `webviewInstallMode: embedBootstrapper`（+约 2MB，安装包保持轻量；
  有网静默装好，无网跳过由应用内向导兜底）。`offlineInstaller`（+150MB）
  留作企业离线发行版分支。
- `bundleVCRuntime: true`（MSVC 运行时顺手配）。
- Node/Git **不进 NSIS**：用户级工具无需提权（提权装会污染全机 PATH）；
  NSIS 脚本难调试，版本比对写两遍必漂移。NSIS 只读注册表做 WebView2 粗检
  （有/无），精细版本比对留给 Rust。

### 6.2 首次启动向导（应用内全屏页，复用 CenterEntry 模式）

- 触发：`env.json` 无 `wizardDone` 标记，或基线升级致某项低于新基线，
  或用户从设置组点“重新检查环境”。
- 四步：欢迎（说明事项、约需流量/时间）→ 检测中（一次 `/env/status`）→
  逐项卡片（✅就绪 / ⬇️下载安装带进度 / 🔧需手动-agent引导 / ✏️填路径）→
  完成（Node 就绪才放行 dsh 相关入口）。
- 可跳过：不阻塞进应用，未完成项记账（标题栏小红点 + 下次提醒）。
- 断网降级：只检测+展示，安装按钮变为“复制给 agent”与“手动安装后重测”。
- dsh 不在向导内安装（已有版本管理组）；向导只保证其前置（Node + 网络）
  就绪并提示去向。
- 向导卡片 = 设置组行组件全量版，同一套 `/env/*` 接口、同一份 i18n key。
- 浏览器模式：无 NSIS 段，向导退化为检测展示 + 引导（不调安装接口，
  mock 桥同语义）。

## 7. 设置组 UI

### 7.1 新增 `network（网络与下载）` 组（修正案）

- 把 DSH 组“下载源 / 代理 / 测试连接”三块整体搬迁至 `NetworkSettings.tsx`
  （含防抖落盘、竞态防护、i18n key 迁移）；DSH 组原位留只读摘要行
  “当前源：npmmirror（延迟 120ms）［前往修改］”。
- `dshGroupResetPending` 拆分为两组各自 pending（照抄 storage/dsh/browser
  自有流程先例）；`settingsSearchIndex` 锚点同步迁移。
- environment 组与后续浏览器下载、更新通道复用同一后端配置，不重复 UI。

### 7.2 新增 `environment（运行环境）` 组

- 注册：`SETTINGS_GROUPS` 末尾追加（dsh → network → environment），
  “先连网、再备环境”，与向导流程同序；`RESETTABLE_GROUPS` +
  `environmentGroupResetPending` + 搜索锚点同步加入。
- 行结构（每依赖一块，统一四段式）：块头（名称+状态灯+块级恢复默认）→
  状态行（版本/路径/来源标签）→ 操作行（来源三态下拉；Bash 在“系统”下
  展开 Git自带/WSL/MSYS2 三选一；安装/切换/卸载/重装经自有 ConfirmDialog，
  忙态禁用；手动路径失焦即校验）→ 兜底层（`[复制给 agent]` + 官方下载外链）。
- 特殊行：WebView2 / adl-server 只读（版本+状态+引导），FixedVersion 开关
  收进“高级”折叠区（默认关）；网络+凭据只读三灯 + “去 dsh 侧配置”引导。
- 顶部聚合条：`n/N 就绪` + `[重新检测]` + `[复制全部给 agent]`；
  SettingsPanel 打开即 `prefetchEnvironmentSettings()`（照抄存储组预取）。
- 组级“恢复默认”= 来源全回自动 + 清空手动路径，**不卸载**已装版本。
- 约束继承：全部文案 i18n key（新 `environment.ts` / `network.ts` 中英领域 +
  key 测试）；浏览器模式系统级行置灰 + “仅桌面模式可用”（照抄智能体
  拦截开关模式）；禁止硬编码文本。

## 8. agent runbook 与兜底

- `docs/runbooks/env-<name>.md` 共 6 份（node / git-bash / webview2 /
  adlserver / net-download / model-credential），固定五段：
  症状 → 检测命令（精确到注册表路径/`--version`）→ 安装步骤（官方 release
  链接 + 哈希校验要求）→ 装后回填 → 回滚；头部 frontmatter 机器可读
  （dep key、基线版本、检测命令）。
- “复制给 agent”拼装包 = `{ dep, statusJson, baseline, runbook全文, 数据目录 }`。
  **agent 不直接写配置**：agent 只把软件装好（系统安装或解压到指定位置），
  用户回组点“重新检测”自动收编（`adopt` 语义）或“从路径导入”；
  `env-sources.json` 写操作永远走本应用命令/接口。
- 手动路径即时校验：Node/Git 跑 `--version` 比基线；Bash 查文件存在+可执行；
  WebView2 读注册表版本；不通过不保存，错误文案给下一步（不说术语）。
- 提权分级：用户级（env-hosted/MinGit/Node 便携包）可静默做；系统级
  （WebView2 per-machine、全机 Git/Node）向导单列“需要管理员权限”步骤。
- 审计回滚：每次安装/切换/卸载写结构化日志（跟随 `<root>/logs`）；卸载宿主
  版本二次确认并自动回落剩余最高版本（照抄 dsh 卸载语义）。

## 9. 双端一致性

- 桌面 Tauri：全部能力可用。
- 浏览器模式：WebView2 / adl-server / 安装类按钮置灰 + 说明（只读检测展示）；
  runbook 与手动路径同样可用（修的是用户本机）；mock 桥同语义演示数据。
- 新增 IPC 方法同步实现 `tauri-bridge.ts` / `preview-bridge/` / `mock-bridge.ts`。

## 10. 测试

- Rust（离线）：`resolve` 三态 × 四种可用性组合；探测 mock（PATH/注册表桩）；
  `adopt` 单副本不变式；原子替换失败保旧版；安装参数构造（registry/proxy/
  版本）；`--version` 校验逻辑；DTO camelCase。
- 前端（vitest）：来源三态切换与持久化；effective=system 隐藏管理项；
  三灯/忙态/toast；`[复制给 agent]` 拼装包格式；i18n key 全覆盖（含 network/
  environment 新领域）；搜索锚点可达。
- 手动（Tauri 桌面）：全新机流程（删数据目录 → 装机 → 首启向导全绿）；
  断网降级；提权步骤；卸载回落；network 组搬迁后 DSH 组摘要跳转。

## 11. 风险与已接受代价

- dsh 体积（~0.7GB）决定全随包不可行：大件注定按需下载（已接受）。
- embedBootstrapper 在完全断网装机时 WebView2 装不上：由向导兜底 + runbook，
  不阻塞应用安装（已接受）。
- FixedVersion 默认关闭：企业离线场景需手动开高级开关（已接受）。
- `adl-hosted` 提取触及 dsh 运行路径：以现有 Rust 单测 + dsh 手动回归为门。
- 基线文件在线刷新失败：静默用内置基线（已接受）。

## 12. 分期建议（实现计划拆分口径）

本 spec 体量超出单一实现计划，按依赖顺序拆三期，每期独立可验证：

- **Phase 1（后端 + 打包）**：`adl-hosted` 提取 + `adl-env` + `/env/*` 接口 +
  `adl-server` 随包 + NSIS（embedBootstrapper + VC++）+ `env-baseline.json`。
  验收：全新数据目录下 `/env/status` 七项状态正确。
- **Phase 2（前端）**：network 组拆分 + environment 组 + 首次启动向导 +
  三桥 parity + i18n。验收：双端红绿测试。
- **Phase 3（兜底 + 回归）**：6 份 runbook + “复制给 agent”拼装 +
  全量回归（含 dsh 路径手动回归）。

## 13. 影响文件清单（实现时以计划为准）

- 新增：`ai-digital-life/crates/adl-hosted/`、`ai-digital-life/crates/adl-env/`、
  `ai-digital-life/frontend/src/app/features/environment/EnvironmentSettings.tsx`、
  `ai-digital-life/frontend/src/app/features/network/NetworkSettings.tsx`、
  `docs/runbooks/env-*.md`（6 份）、`env-baseline.json`。
- 改动：`crates/dsh-version`、`crates/webapp-host`、`crates/dsh-bundle`
  （迁入 `adl-hosted`）、`crates/pty/shell_resolver.rs`（补宿主 MinGit 一路）、
  `crates/server`（`/env/*` 路由 + state）、`src-tauri`（`adl_server.rs` 解析、
  `tauri.conf.json` windows 段、`capabilities/*.json`）、`settingsGroups.ts`、
  `SettingsPanel.tsx`（预取+pending）、`DshSettings.tsx`（三块搬迁+摘要行）、
  `settingsSearchIndex.ts`、i18n `zh-CN`/`en-US`（`environment.ts`/`network.ts` +
  dsh 键迁移）、三桥实现与 parity 测试。
