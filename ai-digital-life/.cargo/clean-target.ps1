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
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [double]$Threshold = 25,
    [int]$RetentionDays = 7,
    [switch]$Full,
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
    return [math]::Round($bytes / 1GB, 4)
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
    if ($WhatIfPreference) {
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
            if ($WhatIfPreference) {
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
if ($WhatIfPreference) {
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