# 环境依赖管理架构

> **2026-10-23 落地**：运行环境依赖检测/宿主安装/来源选择/卸载重装 + 设置面板「网络」「环境」组 + 首启向导 + 6 份 runbook + adl-server sidecar 随包。
> 进度与审查记录见 [progress-2026-10-23-230432.md](../../root-cause-to-close/2026-10/progress-2026-10-23-230432.md)。

## 摘要

装机后 Node / Git / Bash / WebView2 缺失或版本过低、`adl-server` 未随包、dsh 强依赖本机 node，都会导致功能不可用。
本子系统提供统一的**环境依赖层**：检测六项依赖现状、可选从官方源安装宿主副本、按用户偏好选择来源、
支持卸载/重装并由前端给出可执行的 runbook。桌面端与浏览器模式共用 adl-server 的同一组 `/env/*` HTTP 路由。

## 范围与来源模型

- **六项依赖**（`adl_env::ENV_DEPS`）：`node`、`git`、`bash`、`webview2`、`adlserver`、`netprobe`。
  前端展示 7 行（上述 6 项 + `model` 凭据引导行；`net`/`model` 由 `netprobe` 状态派生，`model` 仅引导不检测值）。
- **来源偏好**（`<data>/env-sources.json`，按依赖一项 `{ mode, customPath? }`）：
  - `auto`：宿主副本优先 > 系统安装 > `none`；
  - `system` / `host`：强制单一来源，缺失即 `none`，**不静默降级**（前端提示安装）。
- **基线**（`src-tauri/resources/env-baseline.json`，随包资源）：node stable/dist 源、git stable/tag/asset/base、
  webview2 minimum，以及 node/git 资产的 `sha256` 钉死哈希；用于 `meetsBaseline` 判定、安装版本选择与下载完整性校验。
- **宿主托管来源（host source）**：应用自行下载并安装在数据目录下的副本；系统来源可为 PATH / 注册表 / 随包 / 手填路径（`origin`）。
- **下载完整性**：Git PortableGit 在执行 SFX 前用 GitHub release `digest`（或 baseline 钉死哈希）校验；Node zip 在解压前校验，钉死版本用钉死哈希，其它版本先取官方 `SHASUMS256.txt`、官方不可达才退同源清单（此时镜像仍可能同时替换 zip 与清单，属残余风险，校验失败即中止）。SFX 以隐藏窗口启动（`STARTF_USESHOWWINDOW` + `SW_HIDE`），失败仍通过任务错误/诊断单上报。

## Providers

| provider | 职责 | 可宿主安装 |
|----------|------|------------|
| `node` | 系统探测 + 官方 dist 下载解压 | 是 |
| `git` | 系统探测 + PortableGit 下载解压 | 是（PortableGit，**包含 Bash**） |
| `bash` | 宿主 PortableGit + 系统 Git for Windows / WSL / MSYS2 / 手填路径 | 随 Git 宿主副本 |
| `webview2` | 注册表/系统检测（FixedVersion 默认关闭） | 否 |
| `adlserver` | 随包 sidecar 检测与系统回退 | 否 |
| `netprobe` | registry 连通性/时延 + CI token 是否配置（只读存在性） | 否 |

## 目录布局

```
<data>/
├── env-sources.json                       # 来源偏好 + customPath
└── env-hosted/
    └── <dep>/                             # node | git
        ├── installed/<version>/           # 版本目录（含安装完成标记）
        └── selected.txt                   # 当前选中版本（semver 校验，缺失回退最新已装）
```

宿主版本由 `adl-hosted` 的 `HostedVersions` 管理：版本枚举按 semver 排序、`selected.txt` 读写校验、
撤销选中时回退到最新已装版本；换装走 `swap_into_place`（原子替换 + 残留备份告警），安装过程由 `InstallLock` 串行化。

## HTTP 路由（adl-server）

| 路由 | 说明 |
|------|------|
| `GET /env/status` | 全量快照：六依赖 + `task`（进行中任务）+ `dataDir` + `dshReady`；2s TTL，活动任务期间不触网 |
| `POST /env/install` | `{ dep, version? }`，返回 `{ started: true }`，进度经 `/env/status` 轮询 |
| `POST /env/uninstall` | `{ dep, version? }`，semver 守卫 + 选中版回退/清空，`removing` 阶段 |
| `POST /env/select-source` | `{ dep, mode }`（auto/system/host） |
| `POST /env/set-custom-path` | `{ dep, path }` 显式覆盖路径 |
| `POST /env/recheck` | `{ deps?: string[] }` 按依赖重新探测（空/缺省 = 全量）；返回合并后的 `EnvStatus`，未请求字段保持缓存原值（「基础依赖」与「系统组件」块互不联动） |

`/env/recheck` 的两个边界：

- `netprobe` 不可重检（它代表外网连通性，不是可重装的依赖），请求里出现即为 4xx `InvalidInput`；未知 dep 同样 4xx。
- 冷缓存（进程内还没有任何 `EnvStatus` 快照）会退回 `status_inner` 全量探测并写回缓存 —— 此时另一块也会一起变新，属已知耦合；有缓存后严格只合并请求的 deps。

> 环境依赖**不是 Tauri command**，因此不新增 `capabilities/*.json` 权限；桌面壳 `tauri-env.ts` 只是把调用转发到同一组 HTTP 端点。

## 前端表面

- **设置面板「网络」组**（`features/network/`）：源/代理/测试连接，自 DSH 组搬迁，行为不变。
- **设置面板「环境」组**（`features/environment/`）：5 依赖行（基础 3 + 系统 2；向导另含 net/model 引导行）、顶部聚合条、
  「复制给 agent」（Markdown 诊断单：上下文 + 未就绪项优先的状态明细 + JSON 代码块 + runbook + 回复格式）、卸载/重装
  （仅 host 来源；git 重装仅限基线版）。行级刷新覆盖 node/git/bash/webview2/adlserver；「基础依赖」与
  「系统组件」两个块各自带「刷新」块按钮，只重检本块 deps。
- **首启环境准备**（`FirstRunProvisioningWizard`）：五项任务清单（Node.js / Git / Bash / DSH「Web 形态」/ OpenCode CLI），不可跳过；每项首次 + 3 次重试，失败跳过并继续，结束后可「再次尝试」失败项。Node/Git/Bash 始终安装宿主托管；DSH/OpenCode 优先系统安装，否则装最新正式版（无正式版退预发布版）。有失败项时记录续接状态，环境组显示续接横幅。
- **runbook**：唯一真源 `features/environment/runbooks/`（`?raw` 内联，前端与桌面同源），
  `docs/runbooks/README.md` 仅作索引；固定五段：症状 / 检测命令 / 安装步骤 / 装后回填 / 回滚。

## 依赖目录注入（进程级 PATH）

- **生效范围**：只改 `adl-server` 进程的 PATH；新终端会话、`spawn_node_direct("node")`（dsh 宿主拉起）与内部 `git` 子进程继承；既有 PTY 不回溯。
- **注入集合**（`adl_env::path_env::path_dirs`）：
  - node/git `host`：宿主选中版本的 bin（node 版本目录；git `<版本>/cmd`）。
  - node/git `system`/`custom`：已保存指定路径的父目录；未填则无注入（系统 PATH 已可用）。
  - node/git `auto`：宿主优先，其次指定路径（与 `resolve()`/ADR-0007 一致）。
  - bash：宿主 PortableGit 的 `bin/`（随 Git host 生效）；指定路径时注入其父目录。
- **刷新时机**：启动、install 成功、uninstall 成功、select-source、set-custom-path；`env_path` 用 `APPLIED` 记录上一轮目录，切换来源时先摘除再加新目录；`join_paths` 失败保留原 PATH 并告警，不记为已应用。
- **限制**：内置 bash 终端的 shell 选择器仍优先固定 Git for Windows / WSL 路径，指定路径主要影响通过 PATH 解析的 bash；指定路径以“文件存在”为准，若随后损坏不会自动回退。
- **就绪口径**：环境组聚合、诊断单标题与「全部可检测项已就绪」只统计 5 个版本依赖 + 网络连通（可检测项）；模型凭据为引导项，不参与计数。决策见 [ADR-0012](../../adr/0012-env-dependency-path-injection.md)。

## 打包与 staging

- `adl-server` 作为 Tauri `externalBin` 随包：`bundle.externalBin = ["binaries/adl-server"]`，
  暂存文件名为 `binaries/adl-server-<target-triple>.exe`，安装后运行时名为 `adl-server.exe`（Tauri 剥离 triple）。
- `scripts/build-stage-sidecar.ps1` 以 `+crt-static` 构建并暂存（静态 CRT，避免缺 VC++ 运行库），
  `pnpm run stage:sidecar` 预置；`cargo:check` / `cargo:clippy` / `cargo:test` 均先跑 staging，
  CI 同样在构建前暂存。任何 `src-tauri` 的 cargo 构建都要求该文件已存在。
- `webviewInstallMode` 使用 `embedBootstrapper`；WebView2 FixedVersion 默认关闭（仅系统检测）。

## 约束

1. **宿主 Git = PortableGit，包含 Bash**；Bash 也可来自系统完整 Git for Windows / WSL / MSYS2 / 手填路径。
2. **强制来源不降级**：`system`/`host` 缺失时返回 `none`，由前端引导安装，不偷偷回退。
3. **HTTP 单真源**：桌面与浏览器共用 `/env/*`，避免双端逻辑分叉；新增端点须同步 `tauri-env.ts` / `httpBridge` / mock。
4. **卸载安全**：只处理宿主目录内 semver 合法版本，防目录穿越；卸载后选中版回退或清空。
5. **未发布阶段无兼容层**：不保留旧配置/旧安装布局的迁移或重导出代码。
6. **UI 文本全部走 i18n**；不新增可复用 UI 模式（复用既有 settings-group 行 chrome）。
