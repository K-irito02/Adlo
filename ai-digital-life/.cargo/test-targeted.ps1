<#
.SYNOPSIS
    Run targeted Rust tests based on changed files.
.DESCRIPTION
    Analyzes git changes to determine which crates were modified,
    then runs tests only for those crates. Falls back to full test
    if no specific crate can be determined.
.PARAMETER Crate
    Explicitly run tests for a specific crate (e.g., "adl-server").
.PARAMETER TestFile
    Run a specific integration test file (e.g., "workspace_all").
.PARAMETER TestName
    Run tests matching a name pattern (fuzzy match).
.PARAMETER Full
    Run full workspace tests (equivalent to cargo test --workspace).
.EXAMPLE
    .\test-targeted.ps1 -Crate adl-server
    .\test-targeted.ps1 -TestFile workspace_all
    .\test-targeted.ps1 -TestName reference_list
    .\test-targeted.ps1 -Full
#>
param(
    [string]$Crate,
    [string]$TestFile,
    [string]$TestName,
    [switch]$Full
)

$ErrorActionPreference = "Stop"

# Ensure cargo is available
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    $env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
}

if ($Full) {
    Write-Host "Running full workspace tests..." -ForegroundColor Cyan
    cargo test --workspace
    exit $LASTEXITCODE
}

if ($Crate) {
    Write-Host "Running tests for crate: $Crate" -ForegroundColor Cyan
    cargo test -p $Crate
    exit $LASTEXITCODE
}

if ($TestFile) {
    Write-Host "Running integration test file: $TestFile" -ForegroundColor Cyan
    cargo test -p adl-server --test $TestFile
    exit $LASTEXITCODE
}

if ($TestName) {
    Write-Host "Running tests matching: $TestName" -ForegroundColor Cyan
    cargo test $TestName
    exit $LASTEXITCODE
}

# Auto-detect changed crates from git
Write-Host "Detecting changed crates from git..." -ForegroundColor Yellow
$changedFiles = git diff --name-only HEAD~1 2>$null
if (-not $changedFiles) {
    Write-Host "No git changes detected. Running full test suite." -ForegroundColor Yellow
    cargo test --workspace
    exit $LASTEXITCODE
}

$crateMap = @{
    "crates/types/"       = "adl-types"
    "crates/kernel/"      = "adl-kernel"
    "crates/errors/"      = "adl-errors"
    "crates/migration/"   = "adl-migration"
    "crates/storage/"     = "adl-storage"
    "crates/workspace/"   = "adl-workspace"
    "crates/outline/"     = "adl-outline"
    "crates/pty/"         = "adl-pty"
    "crates/fs-ops/"      = "adl-fs-ops"
    "crates/change-engine/" = "adl-change-engine"
    "crates/browser/"     = "adl-browser"
    "crates/ci-status/"   = "adl-ci-status"
    "crates/credential/"  = "adl-credential"
    "crates/harness-version/" = "adl-harness-version"
    "crates/adl-logging/" = "adl-logging"
    "crates/clipboard/"   = "adl-clipboard"
    "crates/sysmon/"      = "adl-sysmon"
    "crates/server/"      = "adl-server"
    "crates/webapp-host/" = "adl-webapp-host"
    "src-tauri/"          = "ai-digital-life"
}

$affectedCrates = @()
foreach ($file in $changedFiles) {
    foreach ($prefix in $crateMap.Keys) {
        if ($file.StartsWith($prefix)) {
            $crateName = $crateMap[$prefix]
            if ($crateName -notin $affectedCrates) {
                $affectedCrates += $crateName
            }
        }
    }
}

if ($affectedCrates.Count -eq 0) {
    Write-Host "No crate-specific changes detected. Running full test suite." -ForegroundColor Yellow
    cargo test --workspace
    exit $LASTEXITCODE
}

Write-Host "Affected crates: $($affectedCrates -join ', ')" -ForegroundColor Green
foreach ($crate in $affectedCrates) {
    Write-Host "`n--- Testing $crate ---" -ForegroundColor Cyan
    cargo test -p $crate
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Tests failed for $crate" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

Write-Host "`nAll affected crate tests passed." -ForegroundColor Green
