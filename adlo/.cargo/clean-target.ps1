<#
.SYNOPSIS
统一 Cargo 磁盘护理脚本：target/debug 超过阈值即全量清理构建产物。

.DESCRIPTION
触发条件（命中即执行清理，否则跳过）：
  空间：target/debug 总大小超过 -Threshold（默认 30 GB）
不按时间窗口判断；超过阈值即执行 cargo clean 全量删除所有构建产物。
  cargo clean 为永久删除 —— 直接物理删除构建产物，不进入回收站/垃圾箱。
  dev 实例状态（DB / WebView2 profile / locator）已移出 target：
  默认保留 <adlo>/.adl-instance/；旧工作树的 target/adl-instance/ 会先迁移过去。
  确需连同 dev 状态一起删，显式加 -IncludeInstanceState。
  -Full：无视阈值强制全清。 -WhatIf：干跑，只报告不删除。

.EXAMPLE
pwsh -NoProfile -File .cargo\clean-target.ps1 -WhatIf
pwsh -NoProfile -File .cargo\clean-target.ps1
pwsh -NoProfile -File .cargo\clean-target.ps1 -IncludeInstanceState
pwsh -NoProfile -File .cargo\clean-target.ps1 -TargetDir "E:/.../slot-1/adlo/target"
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [double]$Threshold = 30,
    [switch]$Full,
    [switch]$IncludeInstanceState,
    [switch]$Force,
    [string]$TargetDir = ""
)

$ErrorActionPreference = "Continue"
$scriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $TargetDir) { $TargetDir = Join-Path $scriptRoot "..\target" }
$TargetDir = [System.IO.Path]::GetFullPath($TargetDir)
$adloRoot = Split-Path -Parent $TargetDir
$manifest = Join-Path $adloRoot "Cargo.toml"
$stateDir = Join-Path $adloRoot ".adl-instance"
$legacyStateDir = Join-Path $TargetDir "adl-instance"
$debugDir = Join-Path $TargetDir "debug"

# 参数兜底：非法值回退默认
if ($Threshold -le 0)  { $Threshold = 30 }

function Get-DirSizeGB {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return 0.0 }
    $bytes = (Get-ChildItem -LiteralPath $Path -Recurse -Force -File -ErrorAction SilentlyContinue |
        Measure-Object -Property Length -Sum).Sum
    if ($null -eq $bytes) { return 0.0 }
    return [math]::Round($bytes / 1GB, 4)
}

function Test-FileLocked {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $false }
    try {
        $stream = [System.IO.File]::Open($Path, "Open", "ReadWrite", "None")
        $stream.Close()
        return $false
    } catch {
        return $true
    }
}

if (-not (Test-Path -LiteralPath $manifest)) {
    Write-Error "找不到 Cargo.toml：$manifest（-TargetDir 必须指向 <worktree>/adlo/target）"
    exit 2
}

if (-not (Test-Path $TargetDir)) {
    Write-Host "target 目录不存在，无需清理。"
    exit 0
}

if (-not (Test-Path $debugDir)) {
    Write-Host "debug 目录不存在，跳过。"
    exit 0
}

# 进程预检：运行中的调试镜像会锁住 target/debug，边跑边删只会留下半截目录。
$locked = @()
foreach ($name in @("adlo.exe", "adl-server.exe")) {
    $exe = Join-Path $debugDir $name
    if (Test-FileLocked $exe) { $locked += $exe }
}
if ($locked.Count -gt 0 -and -not $Force) {
    Write-Host "检测到本工作树调试镜像仍被占用："
    $locked | ForEach-Object { Write-Host "  $_" }
    Write-Host "先执行 pnpm --dir adlo run dev:stop 后再清理（确需强删加 -Force）。"
    exit 2
}

$sizeGB = Get-DirSizeGB -Path $debugDir
$spaceTriggered = $sizeGB -gt $Threshold
$legacyExists = Test-Path -LiteralPath $legacyStateDir
$stateExists = Test-Path -LiteralPath $stateDir

Write-Host ("target/debug 当前大小: {0} GB  (阈值 {1} GB)" -f $sizeGB, $Threshold)
Write-Host ("触发 -> 空间超阈值({0} GB): {1}" -f $Threshold, $spaceTriggered)
if ($legacyExists) {
    Write-Host ("旧 dev 状态: {0} ({1} GB)" -f $legacyStateDir, (Get-DirSizeGB -Path $legacyStateDir))
}
if ($stateExists) {
    Write-Host ("dev 状态: {0} ({1} GB)" -f $stateDir, (Get-DirSizeGB -Path $stateDir))
}
if (-not $Full -and -not $spaceTriggered) {
    Write-Host "未达到清理条件，跳过。"
    exit 0
}

if ($WhatIfPreference) {
    Write-Host "干跑：将执行 cargo clean 全量删除所有构建产物。"
    if ($IncludeInstanceState) {
        Write-Host "干跑：-IncludeInstanceState 生效，将删除 dev 状态（含 $stateDir）。"
    } elseif ($legacyExists -and -not $stateExists) {
        Write-Host "干跑：将把旧 dev 状态迁移到 $stateDir。"
    }
    exit 0
}

if ($IncludeInstanceState) {
    Write-Host "执行 cargo clean（并删除 dev 状态）..."
} else {
    Write-Host "执行 cargo clean（保留 dev 状态）..."
}
if ($legacyExists -and -not $stateExists -and -not $IncludeInstanceState) {
    Move-Item -LiteralPath $legacyStateDir -Destination $stateDir -ErrorAction Stop
    Write-Host "已把旧 dev 状态迁移到 $stateDir"
}

& cargo clean --manifest-path $manifest
if ($LASTEXITCODE -ne 0) {
    Write-Error "cargo clean 失败，退出码 $LASTEXITCODE"
    exit $LASTEXITCODE
}

if ($IncludeInstanceState -and (Test-Path -LiteralPath $stateDir)) {
    Remove-Item -LiteralPath $stateDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "已删除 dev 状态：$stateDir"
}
if (Test-Path -LiteralPath $legacyStateDir) {
    Remove-Item -LiteralPath $legacyStateDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "cargo clean 完成。"
exit 0
