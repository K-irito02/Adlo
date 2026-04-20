param(
  [Parameter(Mandatory = $true)]
  [string]$RepoRoot
)

$ErrorActionPreference = "Stop"

function Start-HiddenPowerShell {
  param(
    [Parameter(Mandatory = $true)][string]$WorkingDirectory,
    [Parameter(Mandatory = $true)][string]$Command,
    [Parameter(Mandatory = $true)][string]$StdoutPath,
    [Parameter(Mandatory = $true)][string]$StderrPath
  )

  $outDir = Split-Path -Parent $StdoutPath
  if ($outDir -and -not (Test-Path -LiteralPath $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }

  return Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    "Set-Location -LiteralPath `"$WorkingDirectory`"; $Command"
  ) -PassThru -WindowStyle Hidden -RedirectStandardOutput $StdoutPath -RedirectStandardError $StderrPath
}

function Read-State([string]$statePath) {
  if (-not (Test-Path -LiteralPath $statePath)) { return @{} }
  try {
    $raw = Get-Content -LiteralPath $statePath -Raw -ErrorAction Stop
    if ([string]::IsNullOrWhiteSpace($raw)) { return @{} }
    $obj = $raw | ConvertFrom-Json -ErrorAction Stop
    $ht = @{}
    foreach ($p in $obj.PSObject.Properties) { $ht[$p.Name] = $p.Value }
    return $ht
  } catch {
    return @{}
  }
}

function Write-State([string]$statePath, $state) {
  $dir = Split-Path -Parent $statePath
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $json = $state | ConvertTo-Json -Depth 6
  Set-Content -LiteralPath $statePath -Value $json -Encoding UTF8
}

try {
  $workDir = Join-Path $RepoRoot "ai-digital-life"
  $statePath = Join-Path $RepoRoot ".cursor/hooks/.restart-desktop-dev.state.json"
  $viteOutPath = Join-Path $RepoRoot ".cursor/hooks/desktop-vite.out.log"
  $viteErrPath = Join-Path $RepoRoot ".cursor/hooks/desktop-vite.err.log"
  $electronOutPath = Join-Path $RepoRoot ".cursor/hooks/desktop-electron.out.log"
  $electronErrPath = Join-Path $RepoRoot ".cursor/hooks/desktop-electron.err.log"

  if (-not (Test-Path -LiteralPath (Join-Path $workDir "package.json"))) { exit 0 }

  Set-Location -LiteralPath $workDir

  # 1) 启动 Vite dev server（Renderer）
  $viteProc = Start-HiddenPowerShell -WorkingDirectory $workDir -Command "npm run dev -w @ai-digital-life/desktop" -StdoutPath $viteOutPath -StderrPath $viteErrPath

  # 等待 5173 端口就绪（最长 30s）
  $ready = $false
  for ($i = 0; $i -lt 60; $i++) {
    try {
      $conn = Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue
      if ($conn) { $ready = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 500
  }

  # 2) 构建主进程与预加载脚本（确保 Electron 可启动）
  npm run build:main -w @ai-digital-life/desktop | Out-Null
  npm run build:preload -w @ai-digital-life/desktop | Out-Null

  # 3) 启动 Electron（窗口）
  # 确保 isDev 生效 + 指向本地 Vite
  $electronCommand = '$env:ELECTRON_DEV="true"; $env:ADL_RENDERER_DEV_URL="http://localhost:5173"; npm run start -w @ai-digital-life/desktop'
  $electronProc = Start-HiddenPowerShell -WorkingDirectory $workDir -Command $electronCommand -StdoutPath $electronOutPath -StderrPath $electronErrPath

  $state = Read-State $statePath
  $state["vitePid"] = $viteProc.Id
  $state["electronPid"] = $electronProc.Id
  $state["devRunnerPid"] = $PID
  $state["devStartedAtMs"] = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $state["viteReady"] = $ready
  Write-State $statePath $state

  # 保持 runner 存活，方便你后续由 Hook 统一杀掉进程树
  Wait-Process -Id $electronProc.Id
  exit 0
} catch {
  exit 0
}

