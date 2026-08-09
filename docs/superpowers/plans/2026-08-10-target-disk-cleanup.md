# target 磁盘空间治理实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 通过一次性全清、依赖 debug 降级、重开增量编译与双条件清理策略，根治 `ai-digital-life/target/debug` 130+ GB 磁盘占用。

**Architecture:** 三层治理——(1) `cargo clean` 一次性释放现有 131 GB；(2) `.cargo/config.toml` 对第三方依赖降 `debug=1` + 重开增量编译，使下次重建产物不再膨胀；(3) `clean-target.ps1` 统一清理脚本（双条件触发：空间 >25GB 或距上次清理 >7 天）接入 CI / closing-workflow / 文档。

**Tech Stack:** PowerShell 7、Cargo profile config、GitHub Actions（windows-latest）、Markdown 文档同步。

## Global Constraints

- 目标工作区：`ai-digital-life/`（Rust + Tauri，26 crates + src-tauri = 27 个包）
- 仅对**第三方依赖**降 `debug=1`；自己 27 个包用 `[profile.dev.package.<name>]` 白名单显式保持 `debug=2`
- 必须移除 `[profile.dev] incremental = false`（重开增量编译）
- 清理策略**双条件触发**：`target/debug` 大小 > `-Threshold`（默认 25 GB）**或** 距上次清理（`.disk-clean-stamp`）> `-RetentionDays`（默认 7 天），任一命中即清理；首次运行无 stamp = 时间条件命中
- 清理对象：`target/debug/deps/` + `target/debug/incremental/` 中 **mtime 超过保留窗口**的旧产物；7 天内活跃产物不自动删（除非 `-Full`）
- `-Full` = 执行 `cargo clean`；`-WhatIf` = 干跑，只报告不删除
- 脚本幂等：`target` 不存在 → 打印并 exit 0；删除失败（占用）→ 跳过并计数，不中断
- `.disk-clean-stamp` 写入 `ai-digital-life/.cargo/.disk-clean-stamp`，**必须加入 `.gitignore`**（本机状态，不入库）
- 技能真源 `.opencode/skills/closing-workflow/` → 同步 `.agents/skills/`、`.trae/skills/`；规则真源 `.agents/rules/` → 同步 `.opencode/rules/`、`.trae/rules/`
- `cargo alias` 无法直接运行 PS 脚本 → 全清用原生命令 `cargo clean`（alias `prune="clean"`），条件清理走脚本
- CI 在 rust job 内构建后追加清理 step（Windows runner，`powershell -File`）

---

### Task 1: clean-target.ps1 脚本 + 红绿测试

**Files:**
- Create: `ai-digital-life/.cargo/clean-target.ps1`
- Create: `ai-digital-life/.cargo/clean-target.tests.ps1`
- Modify: `ai-digital-life/.gitignore`（追加 `.cargo/.disk-clean-stamp`）

**Interfaces:**
- Produces: `clean-target.ps1` 参数 `-Threshold <double>`（默认 25）、`-RetentionDays <int>`（默认 7）、`-Full <switch>`、`-WhatIf <switch>`、`-TargetDir <string>`（默认 `ai-digital-life/target`，仅供测试注入 fake 目录）。退出码：0 = 正常完成或跳过；非 0 = 异常。

- [ ] **Step 1: 添加 `.disk-clean-stamp` 到 `.gitignore`**

在 `ai-digital-life/.gitignore` 末尾（`# TypeScript incremental build cache` 一节之后）追加大写注释块：

```gitignore
# Cargo disk-clean 时间戳（本机状态）
/.cargo/.disk-clean-stamp
```

- [ ] **Step 2: 写失败测试**

创建 `ai-digital-life/.cargo/clean-target.tests.ps1`：

```powershell
<#
红绿验证脚本（无需 Pester，直接 powershell -File 运行）
场景：
  S1 WhatIf 干跑不删除任何文件
  S2 时间触发（无 stamp，保留 7 天）删除 15 天前旧物、保留今天新物
  S3 空间触发（阈值远小于当前体积）删除超龄文件、保留 7 天内文件
  S4 双条件均不满足 → 打印"跳过"且不删文件、不写 stamp
  S5 全旧但超龄、时间+空间都不触发时核对 stamp 写入
  S6 -Full -WhatIf 干跑安全（只打印，不执行 cargo clean）
#>
$ErrorActionPreference = "Stop"
$scriptTests = Join-Path $PSScriptRoot "clean-target.ps1"
$tmpRoot = Join-Path ([IO.Path]::GetTempPath()) ("adl-clean-test-" + [guid]::NewGuid().ToString("N"))
$cleanTarget = Join-Path $tmpRoot "target"
$falseCount = 0

function Assert-True {
    param([bool]$Cond, [string]$Msg)
    if (-not $Cond) { Write-Host ("FAIL: " + $Msg); $script:falseCount++ }
}

function Run-Script {
    param([string[]]$Args)
    return & powershell -NoProfile -File $scriptTests @Args 2>&1
}

function Make-Target {
    param([string]$Dir)
    $deps = Join-Path $Dir "debug\deps"
    $inc  = Join-Path $Dir "debug\incremental\session-1"
    New-Item -ItemType Directory -Path $deps, $inc -Force | Out-Null
    $oldDep  = Join-Path $deps "libold-aaaa.rlib"
    $newDep  = Join-Path $deps "libnew-bbbb.rlib"
    $oldInc  = Join-Path $inc "old.dll"
    Set-Content -LiteralPath $oldDep -Value ("d" * 1MB) -NoNewline
    Set-Content -LiteralPath $newDep -Value ("n" * 1MB) -NoNewline
    Set-Content -LiteralPath $oldInc -Value ("i" * 1MB) -NoNewline
    (Get-Item $oldDep).LastWriteTime = (Get-Date).AddDays(-15)
    (Get-Item $oldInc).LastWriteTime = (Get-Date).AddDays(-15)
    # 今天：newDep 保持当前时间
}

try {
    # -- S1: WhatIf 干跑 --
    Make-Target $cleanTarget
    Run-Script @("-TargetDir", $cleanTarget, "-WhatIf") | Out-Null
    Assert-True (Test-Path (Join-Path $cleanTarget "debug\deps\libold-aaaa.rlib")) "S1 WhatIf 不应删除旧 rlib"
    Assert-True (Test-Path (Join-Path $cleanTarget "debug\deps\libnew-bbbb.rlib")) "S1 WhatIf 不应删除新 rlib"
    Assert-True (Test-Path (Join-Path $cleanTarget "debug\incremental\session-1\old.dll")) "S1 WhatIf 不应删除旧 inc"

    # -- S2: 时间触发（无 stamp，超龄删除，保留窗口内保留） --
    Remove-Item -LiteralPath $cleanTarget -Recurse -Force
    Make-Target $cleanTarget
    $out2 = Run-Script @("-TargetDir", $cleanTarget, "-Threshold", "100000", "-RetentionDays", "7")
    Assert-True (-not (Test-Path (Join-Path $cleanTarget "debug\deps\libold-aaaa.rlib"))) "S2 应删除 15 天前 rlib"
    Assert-True (-not (Test-Path (Join-Path $cleanTarget "debug\incremental\session-1\old.dll"))) "S2 应删除 15 天前 inc"
    Assert-True (Test-Path (Join-Path $cleanTarget "debug\deps\libnew-bbbb.rlib")) "S2 应保留今天 rlib"
    Assert-True (($out2 -join "`n") -match "已删除") "S2 应输出已删除信息"

    # -- S3: 空间触发（阈值 0.000001 GB ≈ 1KB，但保留窗口 7 天仍只删超龄） --
    # 重建：旧 rlib 超龄 + 新 rlib 今天；阈值极小 → 空间触发，仍保留新物
    Remove-Item -LiteralPath $cleanTarget -Recurse -Force
    Make-Target $cleanTarget
    Run-Script @("-TargetDir", $cleanTarget, "-Threshold", "0.000001", "-RetentionDays", "7") | Out-Null
    Assert-True (-not (Test-Path (Join-Path $cleanTarget "debug\deps\libold-aaaa.rlib"))) "S3 应删除旧 rlib"
    Assert-True (Test-Path (Join-Path $cleanTarget "debug\deps\libnew-bbbb.rlib")) "S3 空间触发仍保留新物"

    # -- S4: 双条件均不满足 → 跳过，文件保留，不写 stamp --
    Remove-Item -LiteralPath $cleanTarget -Recurse -Force
    Make-Target $cleanTarget
    $stampReal = Join-Path $PSScriptRoot ".disk-clean-stamp"
    if (Test-Path $stampReal) { Remove-Item -LiteralPath $stampReal -Force }
    Set-Content -LiteralPath $stampReal -Value ((Get-Date).ToString("o")) -NoNewline   # stamp=现在 → 时间不触发
    $out4 = Run-Script @("-TargetDir", $cleanTarget, "-Threshold", "100000", "-RetentionDays", "7")
    Assert-True (($out4 -join "`n") -match "跳过|未达到|未足够") "S4 应提示跳过"
    Assert-True (Test-Path (Join-Path $cleanTarget "debug\deps\libold-aaaa.rlib")) "S4 不应删除文件"
    Assert-True (Test-Path (Join-Path $cleanTarget "debug\deps\libnew-bbbb.rlib")) "S4 新物仍在"

    # -- S5: 时间触发执行后应写 stamp --
    Remove-Item -LiteralPath $cleanTarget -Recurse -Force
    Make-Target $cleanTarget
    Run-Script @("-TargetDir", $cleanTarget, "-Threshold", "100000", "-RetentionDays", "7") | Out-Null
    Assert-True (Test-Path $stampReal) "S5 清理后应写 stamp"

    # -- S6: -Full -WhatIf 干跑安全 --
    $out6 = Run-Script @("-TargetDir", $cleanTarget, "-Full", "-WhatIf")
    Assert-True (Test-Path (Join-Path $cleanTarget "debug\deps\libnew-bbbb.rlib")) "S6 Full-WhatIf 不应删除"
} finally {
    if (Test-Path $tmpRoot) { Remove-Item -LiteralPath $tmpRoot -Recurse -Force }
    $stampReal2 = Join-Path $PSScriptRoot ".disk-clean-stamp"
    if (Test-Path $stampReal2) { Remove-Item -LiteralPath $stampReal2 -Force }
}

if ($falseCount -gt 0) { Write-Host "TEST FAILED: $falseCount assertion(s)"; exit 1 }
Write-Host "ALL TESTS PASSED"; exit 0
```

- [ ] **Step 3: 运行测试验证失败**

Workdir `ai-digital-life`。运行：

```powershell
powershell -NoProfile -File .cargo\clean-target.tests.ps1
```

Expected：`clean-target.ps1` 尚不存在，报错（无法找到文件 / 关键字 `clean-target.ps1`），退出码非 0。

- [ ] **Step 4: 实现 clean-target.ps1**

创建 `ai-digital-life/.cargo/clean-target.ps1`：

```powershell
<#
.SYNOPSIS
统一 Cargo 磁盘护理脚本：双条件触发清理构建产物。

.DESCRIPTION
触发条件（任一命中即执行清理，否则跳过）：
  1. 空间：target/debug 总大小超过 -Threshold（默认 25 GB）
  2. 时间：距上次清理（.disk-clean-stamp）超过 -RetentionDays（默认 7 天）；无 stamp 视为命中
清理动作：删除 target/debug/deps 与 target/debug/incremental 中 mtime 超过保留窗口的旧产物。
  -Full：执行 cargo clean 全清。 -WhatIf：干跑，只报告不删除。
第一次运行会清理全部超龄产物并写入 stamp。

.EXAMPLE
powershell -File .cargo\clean-target.ps1 -WhatIf
powershell -File .cargo\clean-target.ps1
powershell -File .cargo\clean-target.ps1 -Full
#>
[CmdletBinding()]
param(
    [double]$Threshold = 25,
    [int]$RetentionDays = 7,
    [switch]$Full,
    [switch]$WhatIf,
    [string]$TargetDir = (Join-Path $PSScriptRoot "..\target")
)

$ErrorActionPreference = "Continue"
$workspaceRoot = Split-Path -Parent $PSScriptRoot   # ai-digital-life
$debugDir = Join-Path $TargetDir "debug"
$stampFile = Join-Path $PSScriptRoot ".disk-clean-stamp"

# 参数兜底：非法值回退默认
if ($Threshold -le 0)  { $Threshold = 25 }
if ($RetentionDays -lt 1) { $RetentionDays = 7 }

function Get-DirSizeGB {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return 0.0 }
    $bytes = (Get-ChildItem -LiteralPath $Path -Recurse -Force -File -ErrorAction SilentlyContinue |
        Measure-Object -Property Length -Sum).Sum
    if ($null -eq $bytes) { return 0.0 }
    return [math]::Round($bytes / 1GB, 2)
}

function Get-LastCleanDate {
    if (-not (Test-Path $stampFile)) { return $null }
    try { return [datetime]::Parse((Get-Content -LiteralPath $stampFile -Raw).Trim()) }
    catch { return $null }
}

function Write-Stamp {
    Set-Content -LiteralPath $stampFile -Value ((Get-Date).ToString("o")) -NoNewline -Force
}

if (-not (Test-Path $TargetDir)) {
    Write-Host "target 目录不存在，无需清理。"
    exit 0
}

if (-not (Test-Path $debugDir)) {
    Write-Host "debug 目录不存在，跳过。"
    exit 0
}

$sizeGB = Get-DirSizeGB -Path $debugDir
$lastClean = Get-LastCleanDate
$spaceTriggered = $sizeGB -gt $Threshold
$timeTriggered = ($null -eq $lastClean) -or (((Get-Date) - $lastClean).TotalDays -ge $RetentionDays)

Write-Host ("target/debug 当前大小: {0} GB  (阈值 {1} GB / 保留窗口 {2} 天)" -f $sizeGB, $Threshold, $RetentionDays)
Write-Host ("触发条件 -> 空间超阈值: {0} | 距上次清理超期: {1}" -f $spaceTriggered, $timeTriggered)
if (-not $Full -and -not $spaceTriggered -and -not $timeTriggered) {
    Write-Host "未达到清理条件，跳过。"
    exit 0
}

if ($Full) {
    if ($WhatIf) {
        Write-Host "干跑：将执行 cargo clean 全清所有构建产物。"
        exit 0
    }
    Write-Host "执行 cargo clean ..."
    & cargo clean --manifest-path (Join-Path $workspaceRoot "Cargo.toml")
    if ($LASTEXITCODE -ne 0) {
        Write-Error "cargo clean 失败，退出码 $LASTEXITCODE"
        exit $LASTEXITCODE
    }
    Write-Stamp
    Write-Host "cargo clean 完成。"
    exit 0
}

$cutoff = (Get-Date).AddDays(-$RetentionDays)
$removed = 0
$removedBytes = 0L
foreach ($sub in @("deps", "incremental")) {
    $dir = Join-Path $debugDir $sub
    if (-not (Test-Path $dir)) { continue }
    Get-ChildItem -LiteralPath $dir -Recurse -File -Force -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -lt $cutoff } |
        ForEach-Object {
            if ($WhatIf) {
                $removed++
                $removedBytes += $_.Length
            } else {
                try {
                    $len = $_.Length
                    Remove-Item -LiteralPath $_.FullName -Force -ErrorAction Stop
                    $removed++
                    $removedBytes += $len
                } catch {
                    Write-Host ("跳过占用文件: {0}" -f $_.FullName)
                }
            }
        }
}

$freedGB = [math]::Round($removedBytes / 1GB, 2)
if ($WhatIf) {
    Write-Host ("干跑：将删除 {0} 个旧产物，预计释放 {1} GB" -f $removed, $freedGB)
} else {
    Write-Host ("已删除 {0} 个旧产物，释放 {1} GB" -f $removed, $freedGB)
    Write-Stamp
    $afterGB = Get-DirSizeGB -Path $debugDir
    if ($afterGB -gt $Threshold) {
        Write-Host ("清理后 target/debug 仍为 {0} GB（> 阈值 {1} GB）。多为近 {2} 天内活跃产物，如需全清请运行: powershell -File .cargo\clean-target.ps1 -Full" -f $afterGB, $Threshold, $RetentionDays)
    }
}
exit 0
```

- [ ] **Step 5: 运行测试验证通过**

Workdir `ai-digital-life`。运行：

```powershell
powershell -NoProfile -File .cargo\clean-target.tests.ps1
```

Expected：`ALL TESTS PASSED`，退出码 0。

- [ ] **Step 6: 删除旧脚本并提交**

删除 `ai-digital-life/.cargo/clean-incremental.ps1`（被新脚本取代）：

```powershell
Remove-Item -LiteralPath .cargo\clean-incremental.ps1 -Force
```

提交：

```bash
git add ai-digital-life/.cargo/clean-target.ps1 ai-digital-life/.cargo/clean-target.tests.ps1 ai-digital-life/.cargo/clean-incremental.ps1 ai-digital-life/.gitignore
git commit -m "feat: add dual-condition cargo clean-target script"
```

---

### Task 2: config.toml 源头降级 + 重开增量编译

**Files:**
- Modify: `ai-digital-life/.cargo/config.toml`（全文替换）

**Interfaces:**
- Consumes: Task 1 的 `clean-target.ps1`（名称引用）
- Produces: 生效的 `[profile.dev.package."*"] debug=1` + 27 行白名单 `debug=2`；移除 `incremental=false`；alias `prune`

- [ ] **Step 1: 全文替换 config.toml**

将 `ai-digital-life/.cargo/config.toml` 替换为：

```toml
# Cargo 工作区配置
#
# 磁盘治理（见 ai-digital-life/AGENTS.md#磁盘空间管理）：
# - 清理脚本（双条件触发：空间 >25GB 或距上次清理 >7 天）：
#     powershell -File .cargo/clean-target.ps1
# - 全清所有构建产物（下次需完整重建）：
#     cargo clean

[alias]
# 清理所有构建产物，然后完整重建
rebuild = "clean && build"
# 全清入口（cargo alias 无法运行 PS 脚本，条件清理请用 clean-target.ps1）
prune = "clean"

[profile.dev]
# 增量编译会话由 clean-target.ps1 按保留窗口清理，重新启用增量编译以加速开发迭代
#（2026-07-18 曾因 rustc 1.96 ICE 关闭，1.97.1 已修复）

# 第三方依赖：仅保留行号级调试信息，PDB 体积缩至 ~1/10
#（请勿删除 —— target/debug 曾达 130+ GB，97 GB 为依赖全量 debug 类型的 .pdb）
[profile.dev.package."*"]
debug = 1
opt-level = 1

# 白名单：自己的 crate 保留全量调试信息（debug=2，可断点调试查变量类型）
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

（27 行白名单：26 crates + src-tauri 包名 `ai-digital-life`，与 spec 白名单逐字一致）

- [ ] **Step 2: 验证 Cargo 配置可解析**

Workdir `ai-digital-life`。运行：

```powershell
cargo metadata --no-deps --format-version 1
```

Expected：退出码 0，输出 JSON 中 profile/dev/debug 相关字段正常（不报 `[profile.dev.package]` 未知或 TOML 解析错误）。

- [ ] **Step 3: 提交**

```bash
git add ai-digital-life/.cargo/config.toml
git commit -m "chore: shrink debug profiles for deps, keep own crates at debug 2"
```

---

### Task 3: 一次性全清 + 重建验证

**Files:**
- 无源码变更（纯清理与验证）

**Interfaces:**
- Consumes: Task 2 的 config（重建产物应为缩小后体积）

- [ ] **Step 1: 全清**

Workdir `ai-digital-life`。运行：

```powershell
cargo clean
```

Expected：`target/` 目录被清空（约释放 131 GB）；`Get-ChildItem target` 为空或仅有元数据。

- [ ] **Step 2: 全量重建并观察 PDB 体积**

Workdir `ai-digital-life`。运行：

```powershell
cargo build --workspace
cargo test --workspace --no-run 2>&1 | Select-Object -Last 5
```

Expected：编译成功。检查新产物 PDB 体积：

```powershell
Get-ChildItem target\debug\deps\*.pdb | Measure-Object -Property Length -Sum | ForEach-Object { "{0:N2} GB" -f ($_.Sum / 1GB) }
```

Expected：PDB 总量远小于清理前的 97 GB（依赖 debug=1 生效，预期个位数至 ~20 GB 量级）。

- [ ] **Step 3: 记录稳态占用**

```powershell
Get-ChildItem target\debug -Recurse -File | Measure-Object Length -Sum | ForEach-Object { "debug total: {0:N2} GB" -f ($_.Sum/1GB) }
```

Expected：数值写入提交说明（记录治理前后对比，供 AGENTS.md 更新用）。

- [ ] **Step 4: 提交（无代码变更，通常无提交）**

若仅有 target 产物变化，**不提交**（target 已被 `.gitignore` 排除）。此 Step 为检查清单，无 git 命令。

---

### Task 4: CI workflow 追加清理 step

**Files:**
- Modify: `.github/workflows/quality-gates.yml`（rust job 末尾追加 step）

**Interfaces:**
- Consumes: Task 1 的 `clean-target.ps1`
- Produces: CI 构建产物保留窗口内回收，防止 CI 累积

- [ ] **Step 1: 在 rust job 内追加清理 step**

在 `quality-gates.yml` 的 rust job 中 `cargo test` step 之后追加：

```yaml
      - name: Disk cleanup (dual-condition)
        run: powershell -NoProfile -File .cargo\clean-target.ps1
```

Expected：位于 `defaults.run.working-directory: ai-digital-life` 下，路径 `.cargo\clean-target.ps1` 正确。

- [ ] **Step 2: 校验 YAML**

运行任意 YAML 校验（如 `python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/quality-gates.yml'))"` 或 VS Code 校验插件）。Expected：无解析错误。

- [ ] **Step 3: 提交**

```bash
git add .github/workflows/quality-gates.yml
git commit -m "ci: run disk-clean script after build"
```

---

### Task 5: closing-workflow 技能更新（三目录同步）

**Files:**
- Modify: `.opencode/skills/closing-workflow/SKILL.md`（真源）
- Sync: `.agents/skills/closing-workflow/SKILL.md`、`.trae/skills/closing-workflow/SKILL.md`

**Interfaces:**
- Consumes: Task 1 的 `clean-target.ps1`
- Produces: 收尾流程使用新脚本 + 双条件检查

- [ ] **Step 1: 更新真源 SKILL.md 磁盘检查块**

在 `.opencode/skills/closing-workflow/SKILL.md` 的 **Step 0 → 磁盘空间（可选）**，将原文：

```markdown
### 磁盘空间（可选）

```powershell
Get-ChildItem "ai-digital-life\src-tauri\target\debug\incremental" -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum | ForEach-Object { "{0:N2} GB" -f ($_.Sum / 1GB) }
```

超过 10 GB 时提醒用户运行 `ai-digital-life\.cargo\clean-incremental.ps1`。
```

替换为：

```markdown
### 磁盘空间（可选）

```powershell
powershell -File "ai-digital-life\.cargo\clean-target.ps1" -WhatIf
```

脚本按双条件触发（`ai-digital-life/target/debug` 超过 25 GB，或距上次清理超过 7 天），`-WhatIf` 干跑报告预计释放量后询问用户是否执行：

```powershell
powershell -File "ai-digital-life\.cargo\clean-target.ps1"
```

空间仍过大时全清：

```powershell
ai-digital-life> cargo clean
```

> `.trae/skills/`、`.agents/skills/` 的 `closing-workflow/SKILL.md` 为同步副本，修改真源后需同步。
```

- [ ] **Step 2: 同步到 `.agents/skills/` 与 `.trae/skills/`**

```powershell
Copy-Item ".opencode\skills\closing-workflow\SKILL.md" ".agents\skills\closing-workflow\SKILL.md" -Force
Copy-Item ".opencode\skills\closing-workflow\SKILL.md" ".trae\skills\closing-workflow\SKILL.md" -Force
```

双命令在仓库根执行。Expected：三文件内容一致（`Compare-Object` 无差异）。

- [ ] **Step 3: 提交**

```bash
git add .opencode/skills/closing-workflow/SKILL.md .agents/skills/closing-workflow/SKILL.md .trae/skills/closing-workflow/SKILL.md
git commit -m "docs: update closing-workflow disk cleanup to clean-target"
```

---

### Task 6: AGENTS.md 更新（根 + 子工作区）

**Files:**
- Modify: `AGENTS.md`（根，磁盘空间章节）
- Modify: `ai-digital-life/AGENTS.md`（磁盘空间管理章节）

**Interfaces:**
- Consumes: Task 1 脚本名、Task 2 配置、Task 3 实测数据
- Produces: 治理策略文档化

- [ ] **Step 1: 更新根 AGENTS.md 磁盘章节**

将根 `AGENTS.md` 的「## 磁盘空间」小节（含 `clean-incremental.ps1` 的一句）整体替换为：

```markdown
## 磁盘空间

`ai-digital-life/target/debug` 曾因依赖 `debug=2` 全量调试符号累积至 **130+ GB**（`.pdb` 97 GB），现已治理：第三方依赖 `debug=1`（自己 crate 白名单保留 `debug=2` 可断点调试）。

**清理策略（双条件触发，见 [ai-digital-life/AGENTS.md#磁盘空间管理](./ai-digital-life/AGENTS.md#磁盘空间管理)）：**
- 空间条件：`ai-digital-life/target/debug` 超过 25 GB
- 时间条件：距上次清理超过 7 天（首次运行视为命中）

任一命中即运行 `ai-digital-life/.cargo/clean-target.ps1`（`-WhatIf` 干跑预览，`-Full` 全清 `cargo clean`）。`cargo prune` 为 `cargo clean` 别名。
```

- [ ] **Step 2: 更新子 AGENTS.md 磁盘空间管理章节**

将 `ai-digital-life/AGENTS.md` 的「## 磁盘空间管理」整节（第 170-186 行，含 `clean-incremental.ps1` 引用）替换为：

```markdown
## 磁盘空间管理

### target/debug 成因与现状

`target/debug/deps` 曾达 **~126 GB**：`.pdb`（Windows 调试符号）97 GB 为主力 —— `[profile.dev]` 默认 `debug=2`（全量类型调试信息）为每个 exe/测试二进制生成约 300MB PDB。已通过 `.cargo/config.toml` 治理：

- 第三方依赖 `debug=1`（行号级）+ `opt-level=1`
- 自己 27 个包 `[profile.dev.package.X]` 白名单保留 `debug=2`（可断点查变量类型）
- 重开增量编译（`incremental=false` 已移除，ICE 于 1.97.1 修复）

### 清理策略（双条件触发）

| 条件 | 阈值 | 说明 |
|------|------|------|
| 空间 | `target/debug` > 25 GB | 即使 7 天内也触发（防井喷） |
| 时间 | 距上次清理 > 7 天 | 首次运行无 `.disk-clean-stamp` 视为命中 |

清理对象：`target/debug/deps` + `incremental` 中 mtime 超过保留窗口（默认 7 天）的旧产物，**不触发重建**；7 天内活跃产物不自动删。

### 预防措施

```powershell
# 干跑预览预计释放量（不实际删除）
powershell -File .cargo\clean-target.ps1 -WhatIf

# 执行条件清理（超 25GB 或超 7 天时生效）
powershell -File .cargo\clean-target.ps1

# 全清所有构建产物（下次编译需完整重建；连续大改后空间仍爆可执行）
cargo clean
# 或等价别名
cargo prune
```

时间戳记于 `.cargo/.disk-clean-stamp`（已入 `.gitignore`）。相关文件：`.cargo/config.toml`（alias `rebuild` = `clean && build`、`prune` = `clean`）。
```

- [ ] **Step 3: 校验无残留引用**

Grep 整个仓库确认无 `clean-incremental.ps1` / `incremental = false` 残留（docs/superpowers 的历史 spec/plan 除外，二者允许保留）：

```powershell
rg -n "clean-incremental" --glob '!docs/superpowers/**'
```

Expected：无输出（或仅文档历史文件）。

- [ ] **Step 4: 提交**

```bash
git add AGENTS.md ai-digital-life/AGENTS.md
git commit -m "docs: document dual-condition target disk cleanup"
```

---

### Task 7: dev-rules 补充清理规范（真源 + 双副本同步）

**Files:**
- Modify: `.agents/rules/dev-rules.md`（真源追加小节）
- Sync: `.opencode/rules/dev-rules.md`、`.trae/rules/dev-rules.md`

**Interfaces:**
- Consumes: Task 1 脚本、Task 6 策略
- Produces: 行为规则强制收尾时检查磁盘

- [ ] **Step 1: 真源追加磁盘清理规范**

在 `.agents/rules/dev-rules.md` 末尾「## 相关文件」小节之前追加：

```markdown
## 磁盘清理与 target 治理

`ai-digital-life/target/debug` 依赖全量 debug 符号曾膨胀至 130+ GB。遵循以下规范：

1. 收尾流程（closing-workflow Step 0）执行 `powershell -File "ai-digital-life\.cargo\clean-target.ps1" -WhatIf` 干跑检查
2. 双条件触发：`target/debug` 超 25 GB **或** 距上次清理超 7 天 → 执行清理脚本（非 `-Full` 不触发重建）
3. 手动全清使用 `cargo clean`（或 `cargo prune` 别名 = `clean &&`）
4. 禁用空泛的 `cargo clean` 作为日常习惯 —— 优先条件清理，保留 7 天窗口内增量能力
5. 清理时间戳 `.cargo/.disk-clean-stamp` 不入库
```

- [ ] **Step 2: 同步到 `.opencode/rules/` 与 `.trae/rules/`**

```powershell
Copy-Item ".agents\rules\dev-rules.md" ".opencode\rules\dev-rules.md" -Force
Copy-Item ".agents\rules\dev-rules.md" ".trae\rules\dev-rules.md" -Force
```

Expected：三文件一致（`Compare-Object` 无差异）。

- [ ] **Step 3: 提交**

```bash
git add .agents/rules/dev-rules.md .opencode/rules/dev-rules.md .trae/rules/dev-rules.md
git commit -m "docs: add disk cleanup rules to dev-rules"
```

---

## Self-Review

**Spec 覆盖核对：**

| Spec 要求 | 对应任务 |
|---|---|
| 一次性全清释放 131 GB | Task 3 Step 1 |
| 依赖 debug=1 + 27 包白名单 debug=2 | Task 2 |
| 重开增量编译（移除 incremental=false） | Task 2 |
| 双条件触发脚本（>25GB 或 >7 天） | Task 1 |
| stamp 记账 + 首次运行视为命中 | Task 1（`Get-LastCleanDate`/`Write-Stamp`） |
| 幂等 / target 不存在 exit 0 / 占用跳过 | Task 1 实现 |
| `-WhatIf` / `-Full` | Task 1 |
| CI 接入 | Task 4 |
| closing-workflow 接入 | Task 5 |
| AGENTS.md（根+子） | Task 6 |
| dev-rules 清理规范 | Task 7 |
| 白名单与 spec 逐字一致 | Task 2 代码块 |

**占位符扫描：** 无 TBD/TODO/「implement later」；所有步骤含完整代码与命令。

**类型/签名一致性：** `clean-target.ps1` 参数 `-Threshold/-RetentionDays/-Full/-WhatIf/-TargetDir` 在 Task 1 定义，Task 1/4/5/6/7 引用名称一致；`clean-incremental.ps1` → `clean-target.ps1` 全部改名一致；`prune = "clean"` 别名在 Task 2 定义、Task 6/7 引用一致。

## Execution Handoff

完成后续步骤（写入完成后执行）：
1. `powershell -NoProfile -File ai-digital-life\.cargo\clean-target.tests.ps1` 全绿
2. 校验 `Compare-Object` 确认技能/规则三目录一致
3. Task 3 重建命令由实施者执行并记录稳态体积