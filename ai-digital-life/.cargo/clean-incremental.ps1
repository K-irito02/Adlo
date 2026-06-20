# 清理 Cargo 增量编译缓存
# 每次 cargo build / check / clippy 都会创建新的增量会话，
# Cargo 不会自动清理旧会话，导致 target/debug/incremental/ 无限增长。
#
# 本脚本保留最近 7 天的会话，删除更早的。
# 保留的会话仍可用于快速增量编译。

$incrementalDir = Join-Path $PSScriptRoot "..\target\debug\incremental"
$cutoff = (Get-Date).AddDays(-7)

if (-not (Test-Path $incrementalDir)) {
    Write-Host "incremental 目录不存在，无需清理。"
    exit 0
}

$removed = 0
$removedSize = 0

Get-ChildItem -Path $incrementalDir -Directory | ForEach-Object {
    if ($_.LastWriteTime -lt $cutoff) {
        $size = (Get-ChildItem -Path $_.FullName -Recurse -File -ErrorAction SilentlyContinue `
            | Measure-Object -Property Length -Sum).Sum
        Remove-Item -Path $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
        $removed++
        $removedSize += $size
    }
}

$removedSizeGB = [math]::Round($removedSize / 1GB, 2)
Write-Host "已删除 $removed 个旧增量会话，释放 $removedSizeGB GB"
