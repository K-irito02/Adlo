# Builds `adl-server` with a static CRT and stages it into the Tauri
# `externalBin` directory in one step.
#
# Why `+crt-static`: the sidecar is compiled outside `tauri-build`, so it does
# not inherit Tauri's MSVC runtime handling. Without this flag the binary
# dynamically imports VCRUNTIME140.dll / api-ms-win-crt-runtime-l1-1-0.dll and
# fails on machines without the VC++ redistributable. Tauri's `externalBin`
# copies the file byte-for-byte, so the flag must be applied here.
#
# Tauri resolves `bundle.externalBin: ["binaries/adl-server"]` with the pattern
# `binary-name{-target-triple}{.system-extension}`, so the staged file MUST be
# named exactly `adl-server-x86_64-pc-windows-msvc.exe`.
#
# Hooks in `tauri.conf.json` run with cwd = the app dir (`ai-digital-life/`),
# i.e. this script lives at `scripts/build-stage-sidecar.ps1` from there.
#
# Usage (run from `ai-digital-life/`):
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-stage-sidecar.ps1 [-Profile release]
#
# The staged file must exist before ANY cargo build of src-tauri (dev, test,
# clippy included): tauri-build copies `externalBin` entries in its build
# script and fails the build when the file is missing. So local dev and CI
# must stage once first (this script does the build AND the copy).

param(
    [ValidateSet("debug", "release")]
    [string]$Profile = "release"
)

$ErrorActionPreference = "Stop"

$WorkspaceRoot = Split-Path -Parent $PSScriptRoot            # ai-digital-life/
$Manifest = Join-Path $WorkspaceRoot "Cargo.toml"
# `debug` maps to cargo's default dev profile (output dir `target/debug`);
# `--profile debug` is rejected by cargo because "debug" is reserved.
$ProfileArgs = if ($Profile -eq "release") { @("--release") } else { @() }

# Preserve any caller-provided flags (e.g. CI's `-D warnings`) and append the
# static CRT requirement.
$env:RUSTFLAGS = (@($env:RUSTFLAGS, "-C target-feature=+crt-static") |
    Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) -join " "

& cargo build -p adl-server --manifest-path $Manifest @ProfileArgs
if ($LASTEXITCODE -ne 0) {
    Write-Error "cargo build -p adl-server failed (profile: $Profile)"
    exit $LASTEXITCODE
}

$Staged = Join-Path $WorkspaceRoot "src-tauri\binaries\adl-server-x86_64-pc-windows-msvc.exe"
& (Join-Path $PSScriptRoot "copy-adl-server-sidecar.ps1") -Profile $Profile
if ($LASTEXITCODE -ne 0) {
    Write-Error "Staging the sidecar failed (profile: $Profile)"
    exit $LASTEXITCODE
}
if (-not (Test-Path -LiteralPath $Staged)) {
    Write-Error "Staged sidecar missing at $Staged"
    exit 1
}
if (-not (Test-Path -LiteralPath (Join-Path $WorkspaceRoot "target\$Profile\adl-server.exe"))) {
    Write-Error "adl-server binary not found at target\$Profile\adl-server.exe after build"
    exit 1
}

Write-Host "Built and staged sidecar: $Staged"
Write-Host "Static-CRT check (no dumpbin needed) - these must both print False:"
Write-Host "  `$s=[Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes('$Staged'))"
Write-Host "  `$s.Contains('VCRUNTIME140.dll'); `$s.Contains('api-ms-win-crt-runtime-l1-1-0.dll')"
