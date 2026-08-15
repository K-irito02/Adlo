# target 磁盘空间治理设计

日期：2026-08-10
状态：已批准
关联：AI 数字生命项目治理工作区（Rust + Tauri 工作区）

## 背景与目标

项目根目录占用异常庞大（131.52 GB），其中 99.4%（130.78 GB）来自 `ai-digital-life/target/debug`：

| 目录/文件 | 大小 | 说明 |
|---|---|---|
| `target/debug/deps` | 125.94 GB | 主力 |
| └ `.pdb`（Windows 调试符号） | 97.45 GB / 805 个 | 每个约 300MB |
| └ `.rlib` | 13.22 GB / 1402 个 | |
| └ `.exe`（测试二进制） | 12.51 GB / 702 个 | |
| └ `.rmeta` | 2.38 GB / 3257 个 | |
| `target/debug/incremental` | 2.42 GB | 因 `incremental=false` 积累少 |
| 其余（build/.fingerprint 等） | ~1.4 GB | |

**根因**：`[profile.dev]` 默认 `debug=2`（全量类型调试信息）为每个 exe/测试二进制生成约 300MB 的 `.pdb`；26 个 workspace crate + 629 个测试，每次构建/测试对不同 profile（build/test/clippy）保留各自 hash 产物，cargo 从不自动回收。现有 `clean-incremental.ps1` 只清 `incremental/`（且因 `incremental=false` 基本失效）。

**关键事实**：`deps/` 中 94%（114.62 GB）是最近 7 天内写入的活跃产物，非历史积垢 → 按 mtime 清理只能安全释放约 11 GB；要根治必须同时从源头削减 PDB 体积。

## 目标

1. 一次性释放 target 空间（全清方案）
2. 从源头减小占用（依赖 debug 降级）
3. 重开增量编译并配套"双条件"清理策略（空间阈值 > 25GB 或距上次清理 > 7 天）

## 范围

在 `ai-digital-life/` 工作区内实施：

| 涉及文件 | 变更 |
|---|---|
| `target/debug` | 一次性 `cargo clean`（释放约 131 GB） |
| `.cargo/config.toml` | 新增 profile debug 白名单、删除 `incremental=false`、alias |
| `.cargo/clean-incremental.ps1` | 升级为 `clean-target.ps1`（双条件触发） |
| `.github/workflows/quality-gates.yml`（根仓库） | 新增 disk-clean job |
| `.opencode/skills/closing-workflow/` | 收尾流程加入磁盘护理检查项 |
| `AGENTS.md`（根 + ai-digital-life） | 重写磁盘空间管理章节 |
| `.agents/rules/dev-rules.md` | 补充清理规范 |

## 组件设计

### 组件 1：一次性全清

在 `ai-digital-life/` 执行 `cargo clean`，释放 `target/` 全部构建产物（含 131 GB）。接受一次全量重建成本（已知晓）；重建后产物体积因组件 2 的 profile 配置生效而显著减小。

### 组件 2：源头降级（`.cargo/config.toml`）

**依赖降级 + 自己保留全量调试**（白名单方案，27 个包）：

```toml
[profile.dev.package."*"]
debug = 1
opt-level = 1

# 白名单：自己的 crate 保留 debug=2（断点调试查变量类型）
[profile.dev.package.ad-server]
debug = 2
[profile.dev.package.adl-agent-runtime]
debug = 2
[profile.dev.package.adl-browser]
debug = 2
[profile.dev.package.adl-change-engine]
debug = 2
[profile.dev.package.adl-ci-status]
debug = 2
[profile.dev.package.adl-command]
debug = 2
[profile.dev.package.adl-context]
debug = 2
[profile.dev.package.adl-conversation]
debug = 2
[profile.dev.package.adl-credential]
debug = 2
[profile.dev.package.adl-errors]
debug = 2
[profile.dev.package.adl-fs-ops]
debug = 2
[profile.dev.package.adl-kernel]
debug = 2
[profile.dev.package.adl-logging]
debug = 2
[profile.dev.package.adl-lsp-client]
debug = 2
[profile.dev.package.adl-mcp-client]
debug = 2
[profile.dev.package.adl-migration]
debug = 2
[profile.dev.package.adl-model-gateway]
debug = 2
[profile.dev.package.adl-outline]
debug = 2
[profile.dev.package.adl-pty]
debug = 2
[profile.dev.package.adl-storage]
debug = 2
[profile.dev.package.adl-subagent]
debug = 2
[profile.dev.package.adl-task]
debug = 2
[profile.dev.package.adl-tools]
debug = 2
[profile.dev.package.adl-types]
debug = 2
[profile.dev.package.adl-workspace]
debug = 2
[profile.dev.package.ai-digital-life]
debug = 2
```

效果预期：`.pdb` 体积降至原来的约 1/5~1/10，builder 链接耗时下降。

**注意**：cargo 的 `package."*"` 通配符匹配包括全局 workspace，必须靠显式白名单覆盖回 `debug=2` 才能实现"仅依赖降级"。

### 组件 3：重开增量编译（`.cargo/config.toml`）

删除 `[profile.dev] incremental = false`（该配置原为规避 rustc 1.96 ICE，注释说明 1.97.1 已修复并验证）。重开增量编译以加快开发迭代；增量会话的积累由组件 4 的清理脚本控制。

### 组件 4：统一清理脚本 `clean-target.ps1`

升级现有 `clean-incremental.ps1` 为 `ai-digital-life/.cargo/clean-target.ps1`（真源脚本），统一磁盘护理：

| 能力 | 说明 |
|---|---|
| 双条件触发 | 计算 `target/debug` 总大小：超过 `-Threshold 25`（GB）→ 触发；或距上次清理（`.disk-clean-stamp`）超过 `-RetentionDays 7` → 触发。**首次运行无 stamp 文件视为需要清理**（触发时间周期） |
| 清理动作 | 默认删除 `deps/` + `incremental/` 中 **mtime 超过 `-RetentionDays` 的旧产物**（不触发重建、安全）；若清理后仍超阈值 → 报告并提示 `-Full` |
| `-Full` | 执行 `cargo clean`（全清，激进） |
| `-WhatIf` / 干跑 | 只报告预估释放量与将删文件数，不实际删除 |
| 时间戳记账 | 清理完成写 `ai-digital-life/.cargo/.disk-clean-stamp`（记录最后清理时间） |
| 幂等 | 重复运行安全；`target` 不存在时优雅退出（exit 0） |
| 错误处理 | 删除失败（文件占用）用 `-ErrorAction SilentlyContinue` 跳过并计数，不中断；阈值参数非法 → 报错退出用默认值 |

### 组件 5：集成入口（"所有相应位置"）

| 入口 | 接入方式 |
|---|---|
| CI（`.github/workflows/quality-gates.yml`） | 新增 `disk-clean` job：Windows runner 在构建后运行 `clean-target.ps1`（双条件触发），防止 CI 自身累积 |
| closing-workflow 技能 | 收尾步骤列表加入"运行磁盘护理脚本"检查项 |
| AGENTS.md（根 + ai-digital-life） | 重写"磁盘空间管理"章节：双条件策略、25GB 阈值、7 天保留窗口、推荐流程 |
| `.agents/rules/dev-rules.md` | 补充清理规范 |
| 手动 | `powershell -File .cargo\clean-target.ps1`（含 `-WhatIf` 干跑） |

## 数据流

构建/CI 完成 →（CI job / 手动 / closing-workflow）→ `clean-target.ps1` → 计算 `target/debug` 大小 + 读取 `.disk-clean-stamp` → 命中空间阈值（>25GB）或时间周期（>7 天）→ 删除 7 天以上旧产物（或 `-Full`）→ 写 stamp → 报告释放量。

## 错误处理

- 脚本幂等，重复运行安全；`-WhatIf` 无副作用
- `target` 不存在 → 优雅退出 exit 0
- 删除失败（文件占用）→ 跳过并计数，不中断
- 阈值/保留天数参数非法 → 报错退出并用默认值（25 / 7）

## 测试

- `clean-target.ps1 -WhatIf` 干跑：断言释放量预估值与实测一致、**未实际删除任何文件**
- 构造迷你 fake-target 目录：验证双条件矩阵（>25G / >7 天 / 均不满足）、时间戳记账、`-Full` 分支
- 验证 `config.toml` 修改后 `cargo build`/`cargo test` 正常、PDB 体积下降
- CI（本地验证脚本 Windows 上 exit code 正确）

## 明确不做（YAGNI）

- 不新增 Rust crate 做磁盘工具（无先例，纯 PowerShell 够用）
- 不自动删除 7 天内活跃产物（除非 `-Full`）
- 不引入定时任务/常驻服务

## 验收标准

- 一次性清理后 `target/` 释放回约 1~2 GB 基线（`cargo clean` 后为空目录）
- 全量重建后 `target/debug` 稳态体积远小于清理前的 130 GB（预期个位数 GB 级）
- `clean-target.ps1 -WhatIf` 与真实执行行为一致且安全
- 双条件触发（>25GB 或 >7 天）均验证生效
- 增量编译重新启用，开发迭代正常；`incremental/` 积累由脚本控制
- 根与子 AGENTS.md、dev-rules.md、closing-workflow 文档同步更新