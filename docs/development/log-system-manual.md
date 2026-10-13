# 日志系统操作手册

> 面向 **人类开发者** 与 **AI agent** 的日志控制完整指南。
> 三条读者路径：想快速跑起来 → [1. 快速开始](#1-快速开始)；想知道全部参数 → [2. CLI 参数与优先级](#2-cli-参数与优先级)；想让 agent 自己核实 → [6. Agent 核实配方](#6-agent-核实配方)。

## 0. 一句话概括

「日志级别 / 终端日志模式 / 调试日志模式」三个设置项，既可**在 设置 → 通用 里改**（持久化，重启保留），也可**用终端命令在启动时临时覆盖**（`session-only`，不写配置文件，重启即失效）。

---

## 1. 快速开始

### 1.1 只是想启动

```powershell
cd ai-digital-life
pnpm dev:tauri      # Tauri 桌面应用
pnpm dev:preview    # 浏览器模式（含真实后端 adl-server）
pnpm dev:browser    # 浏览器模式（纯前端，无后端）
pnpm dev:both       # 桌面 + 浏览器同时起（双端一致性验证）
```

### 1.2 启动时临时调高日志（排查问题最常用）

```powershell
# Tauri 桌面：开最详细日志 + 每次启动一个独立日志文件
pnpm dev:tauri -- --log-level trace --terminal-log-mode multi

# 浏览器模式：同上
pnpm dev:preview -- --log-level trace --terminal-log-mode multi

# 只想改级别（最省事）
pnpm dev:tauri -- --log-level debug
```

> **注意 `--` 不能省**：`--` 之后的参数才会被本项目的启动脚本消费；写成 `pnpm dev:tauri --log-level trace`（无 `--`）时 pnpm 会自己吃掉该参数。

### 1.3 启动后怎么确认生效

终端会打印两行自证信息：

```
[ADL-LOG] logger ready level=trace prefix="terminal-logs" dir=<仓库根>\.adl-logs
[ADL-CLI] level=trace terminal=multi debug=- (session override, not persisted)
```

- `logger ready`：本次实际的级别与日志文件前缀
- `[ADL-CLI]`：命令行覆盖已生效；`-` 表示该字段未覆盖（沿用配置文件值）；括号里那句是「不落盘」的明示

---

## 2. CLI 参数与优先级

### 2.1 全部参数

| flag | 等价环境变量 | 取值 | 说明 |
|------|--------------|------|------|
| `--log-level <level>` | `ADL_LOG_LEVEL` | `error` / `warn` / `info` / `debug` / `trace` | 日志详细程度 |
| `--terminal-log-mode <mode>` | `ADL_TERMINAL_LOG_MODE` | `overwrite` / `append` / `multi` | 后端 tracing 日志的写入方式 |
| `--debug-log-mode <mode>` | `ADL_DEBUG_LOG_MODE` | `overwrite` / `append` / `multi` | 前端调试日志的写入方式 |
| `--log-mode <mode>`（简写） | `ADL_CLI_LOG_MODE` | `overwrite` / `append` / `multi` | **同时**设置上面两个模式 |

- 取值**大小写不敏感**（`TRACE` 与 `trace` 等价；手写 `config.json` 同理，`"INFO"` 照收，不会导致整份配置加载失败）
- 非法取值会打印 `[ADL-CLI] ignoring invalid …` 并**忽略该项**（不会阻断启动）
- 缺值（如 `--log-level --log-mode multi`）同样只告警并跳过
- 重复 flag 取**最后一次**（与 Rust 侧一致）
- 不要把日志 flag 透传给 `cargo tauri dev`：日志 flag 只转 `ADL_*` 环境变量（唯一通道）；`--` 后的其余参数（如 vite 的 `--host`/`--port`）由启动脚本管理，透传可能与脚本拼装的参数冲突（端口以脚本打印的实际地址为准）

### 2.2 优先级（高 → 低）

```
CLI flag  >  ADL_* 环境变量  >  config.json  >  内置默认值
```

另有 `RUST_LOG` 作为**硬顶**（不参与上式排序）：它是 `tracing` 生态的标准
环境变量，接管**基础过滤**；多层 filter 按 AND 语义组合 —— `RUST_LOG=error`
会同时掐掉 stdout 层和文件层低于 error 的一切事件，**CLI `--log-level trace`
也无法将其顶开**。想要运行期调高级别，先 unset `RUST_LOG`。
- CLI flag 会先转成 `ADL_*` 环境变量再被读取 —— 因此**直接设环境变量等价于传 flag**：

```powershell
$env:ADL_LOG_LEVEL = 'trace'
$env:ADL_TERMINAL_LOG_MODE = 'multi'
pnpm dev:tauri
```

### 2.3 `session-only` 的确切含义

- 覆盖值**只作用于本次进程**，**不会写回 `config.json`**
- 关闭应用后，下次启动回到 设置 → 通用 里的持久化值
- 这样设计的理由：一次性调试不应污染用户设置
- 若希望**持久**，请在 设置 → 通用 里改，或用 HTTP/IPC（见 §5）

### 2.4 级别语义（重要）

| 层 | 受 `--log-level` 控制的方式 |
|----|------------------------------|
| **终端（stdout）** | 严格按所选级别输出 |
| **日志文件** | 取 `max(所选级别, debug)` —— 即**下限恒为 `debug`** |

为什么文件层有下限：日志文件的价值在事后尸检（post-mortem）。即使你把控制台调到 `error` 保持安静，文件里仍保留 `debug` 级细节；反之 `--log-level trace` 会让文件也升到 `trace`。

### 2.5 环境变量一览

| 变量 | 用途 |
|------|------|
| `ADL_LOG_LEVEL` / `ADL_TERMINAL_LOG_MODE` / `ADL_DEBUG_LOG_MODE` | 与同名 flag 等价 |
| `ADL_CLI_LOG_MODE` | `--log-mode` 简写的等价变量（同时设两个模式） |
| `RUST_LOG` | 基础过滤的**硬顶**（设了就掐住两层，CLI 也顶不开；运行期调高前先 unset） |

环境变量还有一个隐藏好处：**shell 派生的 adl-server 子进程会继承它**，所以一条环境变量可同时覆盖两个后端进程（详见 §4.4）。

---

## 3. 三种写入模式

| 模式 | 固定文件行为 | 额外会话文件 | 适用场景 |
|------|--------------|--------------|----------|
| `overwrite`（默认） | 每次写入**覆盖** | 无 | 日常开发，只关心最近一次 |
| `append` | 每次写入**追加** | 无 | 想保留同一文件内的连续历史 |
| `multi` | 写入固定文件 | **同时**写 `{前缀}-YYYY-MM-DD_HHMMSS.txt` | 需要按会话切分、逐次排查 |

- 会话文件自动保留最近 **30 个**，超出时清理最旧的
- `multi` 是排查"多次复现"的首选：每次启动一个新文件，互不污染

---

## 4. 日志文件落点（务必看清有两个目录）

> 这是最容易踩的坑：**开发态下不同进程写不同的 `.adl-logs/` 目录**。

| 进程 / 模式 | 目录 | 文件名 |
|-------------|------|--------|
| Tauri 桌面壳 | `<仓库根>/.adl-logs/` | `terminal-logs*.txt`（壳 tracing）、`debug-logs*.txt`（壳调试日志） |
| 浏览器前端（dev preview service） | `<仓库根>/.adl-logs/` | `debug-logs-browser*.txt`（与壳的 `debug-logs*.txt` **分名**，避免双端并行时互相覆盖） |
| adl-server 后端引擎 | `<仓库根>/ai-digital-life/.adl-logs/` | `adl-server-logs*.txt` |

- 之所以是两个目录：各自用编译期 `CARGO_MANIFEST_DIR` 上推两级推导 dev 项目根
- `*.txt` 表示固定名文件；`multi` 模式另有 `*-<时间戳>.txt` 会话文件
- **release 构建不写 `.adl-logs`**，统一落 `<数据根>/logs/`
- 检索提示：`.adl-logs/` 已被 `.gitignore` 排除，`Glob`/`Grep` **找不到**它，必须用 `LS` / `Read` 绝对路径

### 4.1 常见组合示例

```powershell
# 仓库根（按你的实际检出路径替换 <仓库根>）
$RepoRoot = (git rev-parse --show-toplevel).Trim()

# 列出两处日志目录（按时间倒序）
Get-ChildItem "$RepoRoot\.adl-logs" |
  Sort-Object LastWriteTime -Descending | Select-Object -First 10 Name, Length, LastWriteTime
Get-ChildItem "$RepoRoot\ai-digital-life\.adl-logs" |
  Sort-Object LastWriteTime -Descending | Select-Object -First 10 Name, Length, LastWriteTime

# 只看关键的日志开关事件
Select-String -Path "$RepoRoot\.adl-logs\terminal-logs.txt" `
  -Pattern "ADL-LOG|ADL-CLI|ADL-SETTINGS"
```

---

## 5. 运行时修改（不重启）

除了启动时覆盖，三项设置也可在运行中修改。

### 5.1 通过界面（推荐给人类）

设置 → **通用** → 日志级别 / 终端日志模式 / 调试日志模式。

- **Tauri 桌面**：立即对**壳**生效并落盘；同时转发给 adl-server（**仅运行时**，不重复落盘）
- **浏览器模式**：经 `POST /app/preferences`，落盘并立即对 adl-server 生效
- **会话覆盖锁定**：若某字段正被 CLI/env 覆盖（如 `--log-level trace` 启动后在 UI
  改级别），运行期**保持 CLI 值**、仅落盘，前端弹顶部提示"下次启动生效"
  —— 下次无覆盖启动时落盘值生效。落盘失败会回滚运行期并报错。
  - 壳与 server 各自按自己进程的 env 计算锁定（正常经同一 env 继承而一致；
    双端 flag 传得不一致时以各自进程为准）。

### 5.2 通过 HTTP（推荐给 agent / 脚本）

后端（adl-server）提供三个路由：

| 路由 | 方法 | 语义 | 是否落盘 |
|------|------|------|----------|
| `/app/info` | GET | 读取当前 `AppInfo`（含三个设置的当前值） | — |
| `/app/preferences` | POST | 应用偏好补丁（含日志三项），落盘 | ✅ 写 `config.json` |
| `/app/log-settings` | POST | **仅运行时**应用日志三项 | ❌ 不落盘 |

```powershell
# 查询当前设置（端口见启动日志 "listening on 127.0.0.1:<port>"）
curl "http://127.0.0.1:<port>/app/info"

# 仅运行时切到 trace + 追加（不影响 config.json）
curl -X POST "http://127.0.0.1:<port>/app/log-settings" `
  -H "Content-Type: application/json" `
  -d "{\"logLevel\":\"trace\",\"terminalLogMode\":\"append\"}"

# 持久化修改（写 config.json）
curl -X POST "http://127.0.0.1:<port>/app/preferences" `
  -H "Content-Type: application/json" -d "{\"logLevel\":\"debug\"}"
```

### 5.3 生效留痕

运行期修改成功后会写一行（便于事后核对到底改没改）：

```
[ADL-LOG] log level changed level=trace
[ADL-LOG] terminal log mode changed mode=multi
[ADL-SETTINGS] runtime log settings applied level=Some(Trace) terminal=Some(Multi) debug=None
```

---

## 6. Agent 核实配方

> agent 的目标通常是：**证明某个设置真的生效了**，而不是"看起来改了"。

### 6.1 标准三步

1. **记录基线**：先记下改动前两处日志目录的最新文件与行数
2. **发起变更**：启动带 flag，或调用 `/app/log-settings`
3. **取证比对**：读对应文件，断言出现预期标记

### 6.2 关键标记速查

| 标记 | 出现时机 | 含义 |
|------|----------|------|
| `[ADL-LOG] logger ready level=… prefix=… dir=…` | 进程启动 | 本次实际级别 / 文件前缀 / 目录 |
| `[ADL-CLI] level=… terminal=… debug=… (session override, not persisted)` | 有 CLI/env 覆盖时 | 覆盖已生效且**未落盘** |
| `[ADL-LOG] log level changed level=…` | 运行期改级别 | 级别热切换成功 |
| `[ADL-LOG] terminal log mode changed mode=…` | 运行期改终端模式 | 模式热切换成功 |
| `[ADL-SETTINGS] runtime log settings applied level=… terminal=… debug=…` | 运行期改任一设置 | 汇总留痕（`None` = 本次未改该字段） |

### 6.3 判别性验证（推荐做法）

不要只看"有没有新日志"，要看**级别是否真的过滤**：

```powershell
# 用 error 级跑一次 → stdout 里应几乎没有 INFO
$env:ADL_LOG_LEVEL='error';  cargo run -p adl-server -- --port 0 --data-dir $env:TEMP\adl-err
# 用 trace 级跑一次 → stdout 里应出现大量 INFO
$env:ADL_LOG_LEVEL='trace';  cargo run -p adl-server -- --port 0 --data-dir $env:TEMP\adl-trace
```

（2026-10-11 快照，仅供量级参考：`error` 下 stdout 几乎无 INFO；`trace` 下大量 INFO。）

### 6.4 常用断言片段

```powershell
$dir = Join-Path (git rev-parse --show-toplevel).Trim() '.adl-logs'

# 1) 启动行是否体现本次覆盖
Select-String -Path "$dir\terminal-logs.txt" -Pattern "\[ADL-CLI\]" -SimpleMatch

# 2) multi 模式是否真的产生了新会话文件（时间戳新于测试开始）
Get-ChildItem "$dir" -Filter "terminal-logs-*.txt" |
  Where-Object { $_.LastWriteTime -gt (Get-Date).AddMinutes(-5) }

# 3) append 模式是否只增不减（前后行数单调不减）
(Get-Content "$dir\debug-logs.txt").Count
```

### 6.5 agent 注意事项

- **必须用绝对路径** `LS`/`Read`，`Glob`/`Grep` 会因 `.gitignore` 看不到日志
- 只分析**最新**文件（同名固定文件直接读；`*-<时间戳>` 会话文件按 `LastWriteTime` 取最新）
- 别忘了**两处目录**：壳/浏览器在 `<仓库根>/.adl-logs/`，adl-server 在 `<仓库根>/ai-digital-life/.adl-logs/`
- 覆盖是 `session-only`：重启后回到配置文件值，**不要**把"重启后变回去了"误判为 bug

---

## 7. 三种运行模式的差异

| 能力 | `dev:tauri` | `dev:preview` | `dev:browser` |
|------|-------------|---------------|---------------|
| 后端 adl-server | 由壳派生 | ✅ 独立启动 | ❌ 无 |
| `--log-level` / `--terminal-log-mode` | ✅ 作用于壳 + server | ✅ 作用于 server | ⚠️ **无后端可作用**（忽略） |
| `--debug-log-mode` | ✅ | ✅ | ✅（经 `VITE_ADL_DEBUG_LOG_MODE`） |
| 后端日志文件 | `adl-server-logs*` + 壳 `terminal-logs*` | `adl-server-logs*` | 无 |

> 想验证"日志级别 / 终端模式"请用 `dev:tauri` 或 `dev:preview`。`dev:browser` 没有后端，只有前端调试日志可调。
>
> 后端不可达时的行为（用户决策 2026-10-12）：`app` 域（设置/配置）**失败即失败**，
> 以错误卡响亮呈现，不回退 mock；其它业务域仍可能回退预览/mock 实现，这些回退会
> 记录在 `debug-logs-browser*.txt` 中（`[adl-bridge] … falls back to the preview/mock
> implementation`），设置面板同时显示"未连接后端"离线标识。

---

## 8. 架构速览

```
crates/adl-logging/            # 统一日志 crate
  ├── manager.rs               # LogManager: init / set_mode / set_log_level / apply_change
  │                            #   LevelGate 过滤器（stdout=level, file=max(level,debug)）
  │                            #   按进程前缀分文件：terminal-logs* / adl-server-logs*
  ├── overrides.rs             # LogOverrides(CLI/env, session-only) + LogSettingsChange(运行期)
  ├── config.rs                # LogConfig(terminal/debug 模式 + log_level)
  ├── mode.rs                  # LogMode + LogTarget
  └── session.rs               # SessionTracker（multi 会话文件 + 保留最近 30）
```

- **终端日志**：Rust `tracing::{info,warn,error,debug,trace}!` → 终端 + 日志文件
- **调试日志**：前端 `console.*` 拦截 → 内存环形缓冲（最近 1000 条，3s 防抖）→ 写文件
- **前端调试日志的模式解析链**：`VITE_ADL_DEBUG_LOG_MODE`（CLI/env 注入）→ `appInfo.config.debugLogMode`（用户设置）→ 默认 `overwrite`

---

## 9. 故障排查

### Q: 传了 `--log-level trace` 但日志没变详细
1. 看启动行有没有 `[ADL-CLI] level=trace …`。没有 → 参数没被消费（**检查是否漏了 `--`**）
2. 有启动行但仍不详细 → 确认看的是**正确的文件**（两处目录！后端是 `adl-server-logs*`）
3. 若设过 `RUST_LOG`，它是**硬顶**：先 unset 再重测（CLI 顶不开它）

### Q: `pnpm dev:tauri -- --log-level trace` 报 `cargo run … unexpected argument '--log-level'`
日志 flag **只经环境变量**传递，不再作为 argv 透传给 `cargo tauri dev`。若仍复现，检查启动脚本是否为当前版本。

### Q: 浏览器模式界面空白（只有"复制调试日志"按钮）
浏览器模式语义为**失败即失败**：`app` 域不再回退 mock，`getInfo` 失败即以错误卡呈现。

排查：看 `debug-logs-browser*.txt`。
- 出现 `[adl-bridge] using ad-server at http://127.0.0.1:<端口>` → 已连上后端 ✅
- 出现 `… at http://127.0.0.1:61234 is not reachable` → 常见原因之一：该页面来自**未注入 `VITE_ADL_SERVER_URL` 的 Vite 实例**（如浏览器打开的是上次遗留的 5173，而不是脚本本次打印的地址）

### Q: 用 `Y` 中断后，右下角不断弹出"网络错误"卡片
后端退出后，轮询类调用会持续失败。去重键为 `(silent, scope, code, 归一化 detail)`：
端口/时间戳/attempt 计数等易变片段会被剥离后再比较，内容相同**或仅易变片段不同**
的错误只提示一张卡片，并附"×N"计数（命中时更新；卡片展示首次上报的原文，
不会更新为最新 detail）。若仍看到多张**归一化后仍不同**的卡片，
那是不同故障源，需要按模块单独排查。

### Q: `.adl-logs/terminal-logs.txt` 为空
先确认文件层过滤器未被 `RUST_LOG` 收紧到 `error` 以上；若仍为空，按文件写入权限方向排查（如 `OpenOptions` 是否带写权限）。

### Q: 日志里出现 `[2m` `[32m` 之类的乱码
ANSI 颜色码。文件层已 `.with_ansi(false)`；若仍出现请检查该层是否确实调用了它。

### Q: 时间戳不是北京时间
应为 CST（UTC+8），格式 `YYYY-MM-DDTHH:MM:SS.mmm`。若为 UTC 请检查是否误用了 `Utc::now()`。

### Q: multi 模式会话文件太多
自动保留最近 30 个，可在 `crates/adl-logging/src/session.rs` 的 `MAX_SESSIONS` 调整。

---

## 10. 附：完整示例（人类 + agent 都能照抄）

```powershell
# 场景：怀疑补丁预览有问题，需要最详细日志 + 逐次会话文件
cd ai-digital-life
pnpm dev:tauri -- --log-level trace --terminal-log-mode multi

# 启动后终端应出现：
#   [ADL-LOG] logger ready level=trace prefix="terminal-logs" dir=<仓库根>\.adl-logs
#   [ADL-CLI] level=trace terminal=multi debug=- (session override, not persisted)

# 复现问题后，读最新会话文件（注意：后端日志在另一个目录）
$RepoRoot = (git rev-parse --show-toplevel).Trim()
Get-ChildItem "$RepoRoot\.adl-logs" -Filter "terminal-logs-*.txt" |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1 |
  ForEach-Object { Get-Content $_.FullName -Tail 50 }
```

```powershell
# 场景：agent 需要在不重启的前提下把后端调到 trace
# 1) 从启动日志拿端口
#    [ad-server] listening on 127.0.0.1:56709
# 2) 仅运行时切换（不污染 config.json）
curl -X POST "http://127.0.0.1:56709/app/log-settings" `
  -H "Content-Type: application/json" -d "{\"logLevel\":\"trace\"}"
# 3) 读 <仓库根>\ai-digital-life\.adl-logs\adl-server-logs.txt 断言出现：
#    [ADL-SETTINGS] runtime log settings applied level=Some(Trace) terminal=None debug=None
```
