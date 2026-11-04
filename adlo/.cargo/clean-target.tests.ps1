<#
红绿验证脚本（无需 Pester，直接 powershell -File 运行）
场景（当前策略：仅空间阈值触发全量清理，不再按时间窗口）：
  S1 未超阈值 → 打印"跳过"，不删除任何文件
  S2 超阈值 + -WhatIf → 打印"将执行 cargo clean"，不删除任何文件
  S3 -Full -WhatIf → 干跑安全（只打印，不执行 cargo clean 删除）
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
    param([string[]]$RunArgs)
    return & powershell -NoProfile -File $scriptTests @RunArgs 2>&1
}

function Make-Target {
    param([string]$Dir)
    $deps = Join-Path $Dir "debug\deps"
    New-Item -ItemType Directory -Path $deps -Force | Out-Null
    $dep = Join-Path $deps "libsample-aaaa.rlib"
    Set-Content -LiteralPath $dep -Value ("d" * 1MB) -NoNewline
}

try {
    # -- S1: 未超阈值（阈值极大）→ 跳过，不删除 --
    Make-Target $cleanTarget
    $out1 = Run-Script @("-TargetDir", $cleanTarget, "-Threshold", "100000")
    Assert-True (($out1 -join "`n") -match "跳过|未达到") "S1 应提示跳过"
    Assert-True (Test-Path (Join-Path $cleanTarget "debug\deps\libsample-aaaa.rlib")) "S1 不应删除文件"

    # -- S2: 超阈值 + -WhatIf → 打印将执行 cargo clean，不删除 --
    Remove-Item -LiteralPath $cleanTarget -Recurse -Force
    Make-Target $cleanTarget
    $out2 = Run-Script @("-TargetDir", $cleanTarget, "-Threshold", "0.000001", "-WhatIf")
    Assert-True (($out2 -join "`n") -match "cargo clean") "S2 应提示将执行 cargo clean"
    Assert-True (Test-Path (Join-Path $cleanTarget "debug\deps\libsample-aaaa.rlib")) "S2 干跑不应删除"

    # -- S3: -Full -WhatIf → 干跑安全，不删除 --
    $out3 = Run-Script @("-TargetDir", $cleanTarget, "-Full", "-WhatIf")
    Assert-True (($out3 -join "`n") -match "cargo clean") "S3 应提示将执行 cargo clean"
    Assert-True (Test-Path (Join-Path $cleanTarget "debug\deps\libsample-aaaa.rlib")) "S3 Full-WhatIf 不应删除"
} finally {
    if (Test-Path $tmpRoot) { Remove-Item -LiteralPath $tmpRoot -Recurse -Force }
}

if ($falseCount -gt 0) { Write-Host "TEST FAILED: $falseCount assertion(s)"; exit 1 }
Write-Host "ALL TESTS PASSED"; exit 0