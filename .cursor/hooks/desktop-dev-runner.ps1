param(
  [Parameter(Mandatory = $true)]
  [string]$RepoRoot
)

$ErrorActionPreference = "Stop"

function Write-Log([string]$message) {
  try {
    $logPath = Join-Path $RepoRoot ".cursor/hooks/desktop-dev.log"
    $ts = (Get-Date).ToString("s")
    Add-Content -LiteralPath $logPath -Encoding UTF8 -Value ("[$ts] [runner] $message")
  } catch {}
}

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
      Write-Log "Restored state from backup"
    }
  } catch {}
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

function Stop-ProcessSafely($proc, [string]$reason = "") {
  if ($null -eq $proc) { return }
  try {
    $pid = $proc.Id
    $name = $proc.ProcessName
    Write-Log "Stopping process $name (PID: $pid) - $reason"
    & taskkill /PID $pid /T /F 2>$null | Out-Null
    Start-Sleep -Milliseconds 100
    if (Get-Process -Id $pid -ErrorAction SilentlyContinue) {
      Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    }
    Write-Log "Process $name (PID: $pid) stopped successfully"
  } catch {
    Write-Log "Warning: Failed to stop process ${proc.ProcessName}: $($_.Exception.Message)"
  }
}

function Stop-ProcessesByPort([int]$port) {
  $processes = Get-ProcessUsingPort -port $port
  foreach ($proc in $processes) {
    Stop-ProcessSafely -proc $proc -reason "Port $port is in use"
  }
  return ($processes.Count -gt 0)
}

function Stop-ProcessesByName([string[]]$names, [string]$workDir) {
  foreach ($name in $names) {
    try {
      $procs = Get-Process -Name $name -ErrorAction SilentlyContinue
      foreach ($proc in $procs) {
        try {
          $path = $proc.Path
          if ($path -and $path.StartsWith($workDir, [System.StringComparison]::OrdinalIgnoreCase)) {
            Stop-ProcessSafely -proc $proc -reason "Orphaned process in work directory"
          }
        } catch {}
      }
    } catch {}
  }
}

function Stop-AllDevProcesses([string]$workDir, [string]$statePath) {
  Write-Log "Starting comprehensive process cleanup..."
  
  $state = Read-State $statePath
  
  foreach ($k in @("devPid", "vitePid", "electronPid", "devRunnerPid")) {
    try {
      $v = $state[$k]
      if ($v) {
        $proc = Get-Process -Id ([int]$v) -ErrorAction SilentlyContinue
        if ($proc) {
          Stop-ProcessSafely -proc $proc -reason "From state file ($k)"
        }
      }
    } catch {}
  }
  
  $portCleared = Stop-ProcessesByPort -port 5173
  if ($portCleared) {
    Write-Log "Cleared processes using port 5173"
  }
  
  Stop-ProcessesByName -names @("node", "electron") -workDir $workDir
  
  Start-Sleep -Milliseconds 500
  
  $remaining = Get-ProcessUsingPort -port 5173
  if ($remaining.Count -gt 0) {
    Write-Log "Warning: Port 5173 still in use after cleanup"
    return $false
  }
  
  Write-Log "Process cleanup completed successfully"
  return $true
}

function Test-PortAvailable([int]$port, [int]$timeoutMs = 5000) {
  $start = Get-Date
  while (((Get-Date) - $start).TotalMilliseconds -lt $timeoutMs) {
    $proc = Get-ProcessUsingPort -port $port
    if ($proc.Count -eq 0) { return $true }
    Start-Sleep -Milliseconds 200
  }
  return $false
}

function Wait-PortReady([int]$port, [int]$timeoutMs = 30000) {
  $start = Get-Date
  while (((Get-Date) - $start).TotalMilliseconds -lt $timeoutMs) {
    $proc = Get-ProcessUsingPort -port $port
    if ($proc.Count -gt 0) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Test-NpmCommand([string]$cmd, [string]$workDir) {
  try {
    Push-Location $workDir
    $result = npm $cmd 2>&1
    Pop-Location
    return $LASTEXITCODE -eq 0
  } catch {
    Pop-Location
    return $false
  }
}

try {
  $workDir = Join-Path $RepoRoot "ai-digital-life"
  $statePath = Join-Path $RepoRoot ".cursor/hooks/.restart-desktop-dev.state.json"
  $viteOutPath = Join-Path $RepoRoot ".cursor/hooks/desktop-vite.out.log"
  $viteErrPath = Join-Path $RepoRoot ".cursor/hooks/desktop-vite.err.log"
  $electronOutPath = Join-Path $RepoRoot ".cursor/hooks/desktop-electron.out.log"
  $electronErrPath = Join-Path $RepoRoot ".cursor/hooks/desktop-electron.err.log"

  if (-not (Test-Path -LiteralPath (Join-Path $workDir "package.json"))) {
    Write-Log "Error: package.json not found in $workDir"
    exit 1
  }

  Set-Location -LiteralPath $workDir

  Restore-State $statePath
  Backup-State $statePath

  Write-Log "Starting dev environment..."

  $cleanupOk = Stop-AllDevProcesses -workDir $workDir -statePath $statePath
  if (-not $cleanupOk) {
    Write-Log "Warning: Could not fully clean up processes, proceeding anyway..."
  }

  $portAvailable = Test-PortAvailable -port 5173 -timeoutMs 5000
  if (-not $portAvailable) {
    Write-Log "Error: Port 5173 is still in use after cleanup attempts"
    $state = Read-State $statePath
    $state["lastError"] = "Port 5173 in use"
    $state["lastErrorAtMs"] = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    Write-State $statePath $state
    exit 1
  }

  Write-Log "Starting Vite dev server on port 5173..."
  $viteProc = Start-HiddenPowerShell -WorkingDirectory $workDir -Command "npm run dev -w @ai-digital-life/desktop" -StdoutPath $viteOutPath -StderrPath $viteErrPath
  Write-Log "Vite process started (PID: $($viteProc.Id))"

  $viteReady = Wait-PortReady -port 5173 -timeoutMs 30000
  if (-not $viteReady) {
    Write-Log "Error: Vite failed to start within 30 seconds"
    Stop-ProcessSafely -proc (Get-Process -Id $viteProc.Id -ErrorAction SilentlyContinue) -reason "Vite startup timeout"
    $state = Read-State $statePath
    $state["lastError"] = "Vite startup timeout"
    $state["lastErrorAtMs"] = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    Write-State $statePath $state
    exit 1
  }
  Write-Log "Vite dev server is ready on port 5173"

  Write-Log "Building main process..."
  npm run build:main -w @ai-digital-life/desktop 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Log "Error: Failed to build main process"
    $state = Read-State $statePath
    $state["lastError"] = "Main process build failed"
    $state["lastErrorAtMs"] = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    Write-State $statePath $state
    exit 1
  }

  Write-Log "Building preload script..."
  npm run build:preload -w @ai-digital-life/desktop 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Log "Error: Failed to build preload script"
    $state = Read-State $statePath
    $state["lastError"] = "Preload build failed"
    $state["lastErrorAtMs"] = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    Write-State $statePath $state
    exit 1
  }

  Write-Log "Starting Electron..."
  $electronCommand = '$env:ELECTRON_DEV="true"; $env:ADL_RENDERER_DEV_URL="http://localhost:5173"; npm run start -w @ai-digital-life/desktop'
  $electronProc = Start-HiddenPowerShell -WorkingDirectory $workDir -Command $electronCommand -StdoutPath $electronOutPath -StderrPath $electronErrPath
  Write-Log "Electron process started (PID: $($electronProc.Id))"

  $state = Read-State $statePath
  $state["vitePid"] = $viteProc.Id
  $state["electronPid"] = $electronProc.Id
  $state["devRunnerPid"] = $PID
  $state["devStartedAtMs"] = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $state["viteReady"] = $true
  $state["lastError"] = $null
  $state["lastErrorAtMs"] = $null
  Write-State $statePath $state

  Write-Log "Dev environment started successfully. Waiting for Electron to exit..."

  Wait-Process -Id $electronProc.Id -ErrorAction SilentlyContinue
  Write-Log "Electron process exited"
  exit 0
} catch {
  Write-Log "Fatal error: $($_.Exception.Message)"
  Write-Log "Stack trace: $($_.ScriptStackTrace)"
  exit 1
}
