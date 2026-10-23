# Copies the built `adl-server` binary into the Tauri `externalBin` staging dir.
#
# Tauri resolves `bundle.externalBin: ["binaries/adl-server"]` with the pattern
# `binary-name{-target-triple}{.system-extension}`, so the staged file MUST be
# named exactly `adl-server-x86_64-pc-windows-msvc.exe`. Invoked from
# `tauri.conf.json` (`build.beforeBundleCommand`) during `cargo tauri build`.
# Fails loudly when the source binary is missing so packaging never ships a
# bundle without its engine sidecar.
#
# Usage (run from `ai-digital-life/`; hooks use that cwd too):
#   powershell -File scripts/copy-adl-server-sidecar.ps1 [-Profile release]
#
# The staged file must exist before ANY cargo build of src-tauri (dev, test,
# clippy included): tauri-build copies `externalBin` entries in its build
# script and fails the build when the file is missing. Local dev and CI stage
# it with the wrapper that also builds with a static CRT:
#   powershell -File scripts/build-stage-sidecar.ps1 -Profile debug

param(
    [ValidateSet("debug", "release")]
    [string]$Profile = "release"
)

$ErrorActionPreference = "Stop"

$WorkspaceRoot = Split-Path -Parent $PSScriptRoot            # ai-digital-life/
$Src = Join-Path $WorkspaceRoot "target\$Profile\adl-server.exe"
$DestDir = Join-Path $WorkspaceRoot "src-tauri\binaries"
$Dest = Join-Path $DestDir "adl-server-x86_64-pc-windows-msvc.exe"

if (-not (Test-Path -LiteralPath $Src)) {
    Write-Error "adl-server binary not found at $Src. Build it first: cargo build -p adl-server --profile $Profile"
    exit 1
}

if (-not (Test-Path -LiteralPath $DestDir)) {
    New-Item -ItemType Directory -Path $DestDir | Out-Null
}

Copy-Item -LiteralPath $Src -Destination $Dest -Force
Write-Host "Staged sidecar: $Dest"
