# 宿主托管 OpenCode CLI 使用独立会话数据库

**状态**: 已接受（2026-11-02）

## 背景

OpenCode CLI 与 OpenCode Desktop 共用全局数据目录 `~/.local/share/opencode/`，默认数据库为
`opencode.db`。两者的版本线不同：npm `opencode-ai` 当前 latest 为 1.19.5，而 OpenCode Desktop
2.2.5 自带更新的 CLI 与数据库 schema（使用 `session_v2`，没有 `session` 表）。

应用内托管的 1.19.5 在启动时只接受两种数据库：空库，或包含 `session` 表的旧库；否则直接抛
`Database is not empty and has no session table`。因此当用户本机已有更高版本的 OpenCode Desktop 时，
托管 CLI 无法启动（`--version` 仍正常，因为不打开数据库）。

## 决策

当 OpenCode 的版本来源解析为**宿主托管**、且「新终端窗口自动启用」开启时，除把托管目录前置到
PATH 外，还为新终端会话注入：

```
OPENCODE_DB = <harnesses>/opencode/managed/v<包线>/opencode.db
```

- 只在托管版本实际生效时注入；来源为系统安装、未安装或关闭注入时清空该变量。
- 按**包线**（1.x → `v1`，2.x → `v2`）分目录，而不是按 semver major：两个包线的预发布
  版本号都是 `0.0.0-beta-*`（major 0），按 major 会把 1.x 与 2.x 的 beta 塞进同一个库。
  安装时把包名写入 `installed/<version>/.adl-package`，后续按该标记路由；没有标记的旧安装
  回退到「major >= 2 → v2」。
- 2.x 额外隔离 `XDG_DATA_HOME` / `XDG_STATE_HOME`，并由 PATH 中的 `opencode` 包装脚本强制
  `--standalone`：2.x CLI 默认连接后台 service，且桌面版也通过 state 目录发现同一个 service；
  包装后托管 CLI 只运行自己的私人 server，不接管桌面版服务。
- 同时注入 `OPENCODE_DISABLE_AUTOUPDATE=1`，阻止 TUI 内 `/update` 原地替换托管二进制；
  版本升级统一走应用设置（见 ADR-0011）。
- 用户已在环境中显式设置 `OPENCODE_DB` 时保留用户值（`env_add` 阶段跳过同名键）；
  变量存在但为空（`OPENCODE_DB=`）按未设置处理，避免托管 CLI 拿到空路径失败。
  `XDG_DATA_HOME` / `XDG_STATE_HOME` 是隔离手段，**强制覆盖**用户值（否则 2.x 会退回与桌面版
  相同的数据目录）；`OPENCODE_DISABLE_AUTOUPDATE` 同样强制为 `1`，避免用户设 `0` 后 TUI
  原地替换托管二进制。
- 不写系统/用户环境变量，只影响新会话；已打开的终端保持原环境。
- 托管数据库目录由服务端在刷新注入时创建（SQLite 不会自动创建父目录）。

## 理由

- 直接消除跨产品/跨版本的数据库 schema 冲突，托管版本必定能启动。
- 不读写用户的 `~/.local/share/opencode/opencode.db`，不会破坏 OpenCode Desktop 的会话或认证数据。
- 与本项目既有的「托管版本不污染用户机器」原则一致（见 ADR-0005）。

## 影响

- 托管版本与 OpenCode Desktop 不共享会话数据库；托管版本的会话独立保存。
- 登录凭据：1.19.5 使用 `<数据根>/opencode/auth.json`（与桌面版存放在其数据库中的认证不同），
  首次使用可能需要在终端里执行 `opencode auth login`。
- 托管数据库在同一包线内跨托管版本共享；1.x / 2.x 各自独立（跨包线切换不迁移历史）。
  若未来托管版本升级迁移了 schema，再回退到同线更旧的托管版本仍可能不兼容。
  真出现时再评估 per-version 数据库或版本回退守卫。

## Considered Options

- **不隔离，只检测并提示**：用户仍无法使用托管版本，`opencode` 启动失败；不解决核心诉求。
- **接入 OpenCode Desktop 的 2.2.5 CLI**：可共享现有登录/会话，但依赖桌面版私有目录布局，
  且需要 `opencode` 名称 shim，属于新功能，本次不做。
- **只隔离 `OPENCODE_DB`（1.x 的做法）**：对 1.x 已足够（冲突只在数据库 schema）；2.x 还会
  通过 state 目录发现桌面版的 background service，因此对 2.x 接受更大的代价——额外隔离
  `XDG_DATA_HOME` / `XDG_STATE_HOME`（日志/快照/凭据随之隔离），以切断 service 发现路径。
