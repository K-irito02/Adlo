param(
  [Parameter(Mandatory = $false)]
  [ValidateSet("mark", "restartIfMarked")]
  [string]$Mode = "mark"
)

$ErrorActionPreference = "Stop"

function Read-AllStdin {
  try {
    if (-not [Console]::IsInputRedirected) { return "" }
    return [Console]::In.ReadToEnd()
  } catch {
    return ""
  }
}

function Try-ParseJson([string]$text) {
  if ([string]::IsNullOrWhiteSpace($text)) { return $null }
  try { $text | ConvertFrom-Json -ErrorAction Stop } catch { $null }
}

function Get-StringValue($obj, [string[]]$keys) {
  foreach ($k in $keys) {
    try {
      $prop = $obj.PSObject.Properties[$k]
      if ($null -ne $prop) {
        $v = $prop.Value
        if ($v -is [string] -and -not [string]::IsNullOrWhiteSpace($v)) { return $v }
      }
    } catch {}
  }
  return $null
}

function Find-EditedPath($inputObj) {
  if ($null -eq $inputObj) { return $null }

  $direct = Get-StringValue $inputObj @("path", "filePath", "filepath", "file_path", "filename", "fileName")
  if ($direct) { return $direct }

  try {
    $args = $inputObj.arguments
    if ($args) {
      $nested = Get-StringValue $args @("path", "filePath", "filepath", "file_path", "filename", "fileName")
      if ($nested) { return $nested }
    }
  } catch {}

  return $null
}

function Normalize-PathMaybe([string]$p) {
  if ([string]::IsNullOrWhiteSpace($p)) { return $null }
  ($p.Trim() -replace "\\", "/")
}

function Should-RestartForPath([string]$p) {
  if ([string]::IsNullOrWhiteSpace($p)) { return $false }
  $pn = Normalize-PathMaybe $p
  if (-not $pn) { return $false }

  $patterns = @(
    "^ai-digital-life/apps/desktop/renderer/",
    "^ai-digital-life/apps/desktop/shared/",
    "^ai-digital-life/packages/.+/src/.*(ui|ux|design|theme|styles?)",
    "^ai-digital-life/packages/.+/(src/)?design-system/",
    "^ai-digital-life/packages/.+/(src/)?styles/"
  )

  foreach ($pat in $patterns) {
    if ($pn -match $pat) { return $true }
  }
  return $false
}

function Get-StatePath([string]$repoRoot) {
  Join-Path $repoRoot ".cursor/hooks/.restart-desktop-dev.state.json"
}

function Read-State([string]$statePath) {
  if (-not (Test-Path -LiteralPath $statePath)) { return @{} }
  try {
    $raw = Get-Content -LiteralPath $statePath -Raw -ErrorAction Stop
    $obj = Try-ParseJson $raw
    if ($null -ne $obj) {
      $ht = @{}
      try {
        foreach ($p in $obj.PSObject.Properties) {
          $ht[$p.Name] = $p.Value
        }
      } catch {}
      return $ht
    }
  } catch {}
  return @{}
}

function Write-State([string]$statePath, $state) {
  $dir = Split-Path -Parent $statePath
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $json = $state | ConvertTo-Json -Depth 6
  Set-Content -LiteralPath $statePath -Value $json -Encoding UTF8
}

function Stop-ExistingDev($state) {
  $pids = @()
  foreach ($k in @("devPid", "vitePid", "electronPid", "devRunnerPid")) {
    try {
      $v = $state[$k]
      if ($v) { $pids += [int]$v }
    } catch {}
  }
  $pids = $pids | Select-Object -Unique
  foreach ($p in $pids) {
    try { & taskkill /PID $p /T /F | Out-Null } catch { try { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } catch {} }
  }
}

function Start-DevDetached([string]$repoRoot) {
  $runner = Join-Path $repoRoot ".cursor/hooks/desktop-dev-runner.ps1"
  if (-not (Test-Path -LiteralPath $runner)) { throw "missing runner script" }

  $p = Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $runner,
    "-RepoRoot",
    $repoRoot
  ) -PassThru -WindowStyle Hidden

  # 先把 runnerPid 写进去，便于后续 kill
  $statePath = Get-StatePath $repoRoot
  $st = Read-State $statePath
  $st["devRunnerPid"] = $p.Id
  Write-State $statePath $st
}

function Append-Log([string]$repoRoot, [string]$message) {
  try {
    $logPath = Join-Path $repoRoot ".cursor/hooks/desktop-dev.log"
    $ts = (Get-Date).ToString("s")
    Add-Content -LiteralPath $logPath -Encoding UTF8 -Value ("[$ts] $message")
  } catch {}
}

try {
  $repoRoot = (Get-Location).Path
  $stdin = Read-AllStdin
  $inputObj = Try-ParseJson $stdin
  $editedPath = Find-EditedPath $inputObj

  $statePath = Get-StatePath $repoRoot
  $state = Read-State $statePath
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

  if ($Mode -eq "mark") {
    if (-not (Should-RestartForPath $editedPath)) { exit 0 }
    $state["pendingRestart"] = $true
    $state["pendingSinceMs"] = $now
    $state["lastEditedPath"] = $editedPath
    Write-State $statePath $state
    exit 0
  }

  $pending = $false
  try { $pending = [bool]$state["pendingRestart"] } catch { $pending = $false }
  if (-not $pending) { exit 0 }

  $workDir = Join-Path $repoRoot "ai-digital-life"
  if (-not (Test-Path -LiteralPath (Join-Path $workDir "package.json"))) { exit 0 }

  Append-Log $repoRoot ("restartIfMarked: restarting dev (lastEditedPath=" + ($state["lastEditedPath"]) + ")")
  Stop-ExistingDev $state

  try {
    Start-DevDetached $repoRoot
  } catch {
    Append-Log $repoRoot ("restartIfMarked: failed to start dev: " + $_.Exception.Message)
    exit 0
  }

  # runner 会在启动后写入 vite/electron PID；这里避免覆盖掉 runner 写入的字段
  try { Start-Sleep -Milliseconds 2000 } catch {}
  $merged = Read-State $statePath
  $merged["lastRestartAtMs"] = $now
  $merged["pendingRestart"] = $false
  $merged["pendingSinceMs"] = $null
  $merged["lastEditedPath"] = $state["lastEditedPath"]
  Write-State $statePath $merged
  exit 0
} catch {
  try {
    $repoRoot = (Get-Location).Path
    Append-Log $repoRoot ("hook crashed: " + $_.Exception.Message)
  } catch {}
  exit 0
}

