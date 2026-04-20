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

function Test-ExcludedPath([string]$p) {
  if ([string]::IsNullOrWhiteSpace($p)) { return $false }
  $pn = Normalize-PathMaybe $p
  if (-not $pn) { return $false }

  $excludePatterns = @(
    "\.test\.(ts|tsx|js|jsx)$",
    "\.spec\.(ts|tsx|js|jsx)$",
    "\.stories\.(ts|tsx|js|jsx)$",
    "/__tests__/",
    "/__mocks__/",
    "\.d\.ts$",
    "\.config\.(ts|js|mjs|cjs)$",
    "vite\.config\.",
    "vitest\.config\.",
    "tsconfig",
    "\.eslintrc",
    "\.prettierrc",
    "/node_modules/",
    "/dist/",
    "/build/",
    "\.log$",
    "\.md$",
    "README",
    "CHANGELOG",
    "LICENSE"
  )

  foreach ($pat in $excludePatterns) {
    if ($pn -match $pat) { return $true }
  }
  return $false
}

function Should-RestartForPath([string]$p) {
  if ([string]::IsNullOrWhiteSpace($p)) { return $false }
  $pn = Normalize-PathMaybe $p
  if (-not $pn) { return $false }

  if (Test-ExcludedPath $pn) { return $false }

  $includePatterns = @(
    "^ai-digital-life/apps/desktop/renderer/",
    "^ai-digital-life/apps/desktop/shared/",
    "^ai-digital-life/packages/(ui|ux|design|theme|styles?)/",
    "^ai-digital-life/packages/.+/src/.*(ui|ux|design|theme|styles?)",
    "^ai-digital-life/packages/.+/(src/)?design-system/",
    "^ai-digital-life/packages/.+/(src/)?styles/"
  )

  foreach ($pat in $includePatterns) {
    if ($pn -match $pat) { return $true }
  }
  return $false
}

function Get-StatePath([string]$repoRoot) {
  Join-Path $repoRoot ".cursor/hooks/.restart-desktop-dev.state.json"
}

function Write-Log([string]$repoRoot, [string]$message) {
  try {
    $logPath = Join-Path $repoRoot ".cursor/hooks/desktop-dev.log"
    $ts = (Get-Date).ToString("s")
    Add-Content -LiteralPath $logPath -Encoding UTF8 -Value ("[$ts] [hook] $message")
  } catch {}
}

function Backup-State([string]$statePath) {
  try {
    if (Test-Path -LiteralPath $statePath) {
      $backupPath = "$statePath.backup"
      Copy-Item -LiteralPath $statePath -Destination $backupPath -Force
    }
  } catch {}
}

function Restore-State([string]$statePath) {
  try {
    $backupPath = "$statePath.backup"
    if ((-not (Test-Path -LiteralPath $statePath)) -and (Test-Path -LiteralPath $backupPath)) {
      Copy-Item -LiteralPath $backupPath -Destination $statePath -Force
      return $true
    }
  } catch {}
  return $false
}

function Test-StateValid([string]$statePath) {
  try {
    if (-not (Test-Path -LiteralPath $statePath)) { return $true }
    $raw = Get-Content -LiteralPath $statePath -Raw -ErrorAction Stop
    if ([string]::IsNullOrWhiteSpace($raw)) { return $true }
    $obj = $raw | ConvertFrom-Json -ErrorAction Stop
    return $true
  } catch {
    return $false
  }
}

function Repair-State([string]$statePath) {
  try {
    if (Test-Path -LiteralPath $statePath) {
      Remove-Item -LiteralPath $statePath -Force
    }
    $backupPath = "$statePath.backup"
    if (Test-Path -LiteralPath $backupPath) {
      $raw = Get-Content -LiteralPath $backupPath -Raw -ErrorAction Stop
      $obj = $raw | ConvertFrom-Json -ErrorAction Stop
      Set-Content -LiteralPath $statePath -Value $raw -Encoding UTF8
      return $true
    }
    Set-Content -LiteralPath $statePath -Value "{}" -Encoding UTF8
    return $true
  } catch {
    Set-Content -LiteralPath $statePath -Value "{}" -Encoding UTF8
    return $false
  }
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
  
  try {
    $json = $state | ConvertTo-Json -Depth 6
    Set-Content -LiteralPath $statePath -Value $json -Encoding UTF8
  } catch {
    $minimal = @{
      pendingRestart = $state["pendingRestart"]
      lastEditedPath = $state["lastEditedPath"]
      lastRestartAtMs = $state["lastRestartAtMs"]
    }
    $json = $minimal | ConvertTo-Json -Depth 6
    Set-Content -LiteralPath $statePath -Value $json -Encoding UTF8
  }
}

function Get-ProcessUsingPort([int]$port) {
  try {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
      $pids = $conn.OwningProcess | Select-Object -Unique
      $processes = @()
      foreach ($pid in $pids) {
        try {
          $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
          if ($proc) { $processes += $proc }
        } catch {}
      }
      return $processes
    }
  } catch {}
  return @()
}

function Stop-ProcessSafely($proc, [string]$reason = "", [string]$repoRoot) {
  if ($null -eq $proc) { return }
  try {
    $pid = $proc.Id
    $name = $proc.ProcessName
    Write-Log $repoRoot "Stopping process $name (PID: $pid) - $reason"
    & taskkill /PID $pid /T /F 2>$null | Out-Null
    Start-Sleep -Milliseconds 100
    if (Get-Process -Id $pid -ErrorAction SilentlyContinue) {
      Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    }
    Write-Log $repoRoot "Process $name (PID: $pid) stopped successfully"
  } catch {
    Write-Log $repoRoot "Warning: Failed to stop process ${proc.ProcessName}: $($_.Exception.Message)"
  }
}

function Stop-ExistingDev($state, [string]$repoRoot) {
  $pids = @()
  foreach ($k in @("devPid", "vitePid", "electronPid", "devRunnerPid")) {
    try {
      $v = $state[$k]
      if ($v) { $pids += [int]$v }
    } catch {}
  }
  $pids = $pids | Select-Object -Unique
  
  foreach ($p in $pids) {
    try {
      $proc = Get-Process -Id $p -ErrorAction SilentlyContinue
      if ($proc) {
        Stop-ProcessSafely -proc $proc -reason "From state file" -repoRoot $repoRoot
      }
    } catch {}
  }
  
  $portProcs = Get-ProcessUsingPort -port 5173
  foreach ($proc in $portProcs) {
    Stop-ProcessSafely -proc $proc -reason "Port 5173 in use" -repoRoot $repoRoot
  }
  
  Start-Sleep -Milliseconds 500
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

  $statePath = Get-StatePath $repoRoot
  $st = Read-State $statePath
  $st["devRunnerPid"] = $p.Id
  Write-State $statePath $st
  
  Write-Log $repoRoot "Started dev runner (PID: $($p.Id))"
}

try {
  $repoRoot = (Get-Location).Path
  $stdin = Read-AllStdin
  $inputObj = Try-ParseJson $stdin
  $editedPath = Find-EditedPath $inputObj

  $statePath = Get-StatePath $repoRoot
  
  if (-not (Test-StateValid $statePath)) {
    Write-Log $repoRoot "State file corrupted, attempting repair..."
    $repaired = Repair-State $statePath
    if ($repaired) {
      Write-Log $repoRoot "State file repaired successfully"
    } else {
      Write-Log $repoRoot "State file repair failed, using empty state"
    }
  }
  
  Backup-State $statePath
  $state = Read-State $statePath
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

  if ($Mode -eq "mark") {
    if (-not (Should-RestartForPath $editedPath)) {
      Write-Log $repoRoot "mark: path not matched or excluded: $editedPath"
      exit 0
    }
    $state["pendingRestart"] = $true
    $state["pendingSinceMs"] = $now
    $state["lastEditedPath"] = $editedPath
    Write-State $statePath $state
    Write-Log $repoRoot "mark: set pendingRestart=true for: $editedPath"
    exit 0
  }

  $pending = $false
  try { $pending = [bool]$state["pendingRestart"] } catch { $pending = $false }
  if (-not $pending) {
    Write-Log $repoRoot "restartIfMarked: no pending restart"
    exit 0
  }

  $workDir = Join-Path $repoRoot "ai-digital-life"
  if (-not (Test-Path -LiteralPath (Join-Path $workDir "package.json"))) {
    Write-Log $repoRoot "restartIfMarked: package.json not found"
    exit 0
  }

  Write-Log $repoRoot ("restartIfMarked: restarting dev (lastEditedPath=" + ($state["lastEditedPath"]) + ")")
  Stop-ExistingDev $state $repoRoot

  try {
    Start-DevDetached $repoRoot
  } catch {
    Write-Log $repoRoot ("restartIfMarked: failed to start dev: " + $_.Exception.Message)
    exit 0
  }

  try { Start-Sleep -Milliseconds 2000 } catch {}
  $merged = Read-State $statePath
  $merged["lastRestartAtMs"] = $now
  $merged["pendingRestart"] = $false
  $merged["pendingSinceMs"] = $null
  $merged["lastEditedPath"] = $state["lastEditedPath"]
  Write-State $statePath $merged
  Write-Log $repoRoot "restartIfMarked: restart completed"
  exit 0
} catch {
  try {
    $repoRoot = (Get-Location).Path
    Write-Log $repoRoot ("hook crashed: " + $_.Exception.Message)
    Write-Log $repoRoot ("stack trace: " + $_.ScriptStackTrace)
  } catch {}
  exit 0
}
