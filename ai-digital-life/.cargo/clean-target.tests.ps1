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
    param([string[]]$RunArgs)
    return & powershell -NoProfile -File $scriptTests @RunArgs 2>&1
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

    # -- S5: 时间触发执行后应写 stamp（先删 stamp 模拟首次运行） --
    Remove-Item -LiteralPath $cleanTarget -Recurse -Force
    Make-Target $cleanTarget
    if (Test-Path $stampReal) { Remove-Item -LiteralPath $stampReal -Force }
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