<#
.SYNOPSIS
统一 Cargo 磁盘护理脚本：target/debug 超过阈值即全量清理构建产物。

.DESCRIPTION
触发条件（命中即执行清理，否则跳过）：
  空间：target/debug 总大小超过 -Threshold（默认 30 GB）
不按时间窗口判断；超过阈值即执行 cargo clean 全量删除所有构建产物。
  -Full：无视阈值强制全清。 -WhatIf：干跑，只报告不删除。

.EXAMPLE
powershell -File .cargo\clean-target.ps1 -WhatIf
powershell -File .cargo\clean-target.ps1
powershell -File .cargo\clean-target.ps1 -Full
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [double]$Threshold = 30,
    [switch]$Full,
    [string]$TargetDir = ""
)

$ErrorActionPreference = "Continue"
$scriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$workspaceRoot = Split-Path -Parent $scriptRoot   # ai-digital-life
if (-not $TargetDir) { $TargetDir = Join-Path $scriptRoot "..\target" }
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

if (-not (Test-Path $TargetDir)) {
    Write-Host "target 目录不存在，无需清理。"
    exit 0
}

if (-not (Test-Path $debugDir)) {
    Write-Host "debug 目录不存在，跳过。"
    exit 0
}

$sizeGB = Get-DirSizeGB -Path $debugDir
$spaceTriggered = $sizeGB -gt $Threshold

Write-Host ("target/debug 当前大小: {0} GB  (阈值 {1} GB)" -f $sizeGB, $Threshold)
Write-Host ("触发 -> 空间超阈值({0} GB): {1}" -f $Threshold, $spaceTriggered)
if (-not $Full -and -not $spaceTriggered) {
    Write-Host "未达到清理条件，跳过。"
    exit 0
}

if ($WhatIfPreference) {
    Write-Host "干跑：将执行 cargo clean 全量删除所有构建产物。"
    exit 0
}
Write-Host "执行 cargo clean ..."
& cargo clean --manifest-path (Join-Path $workspaceRoot "Cargo.toml")
if ($LASTEXITCODE -ne 0) {
    Write-Error "cargo clean 失败，退出码 $LASTEXITCODE"
    exit $LASTEXITCODE
}
Write-Host "cargo clean 完成。"
exit 0