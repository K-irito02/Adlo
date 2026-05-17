<#
.SYNOPSIS
  Start the brainstorm server and output connection info.
.DESCRIPTION
  Starts server on a random high port, outputs JSON with URL.
  Each session gets its own directory to avoid conflicts.
.PARAMETER ProjectDir
  Store session files under <path>/.superpowers/brainstorm/ instead of temp.
.PARAMETER BindAddress
  Host/interface to bind (default: 127.0.0.1). Use 0.0.0.0 in remote/containerized environments.
.PARAMETER UrlHost
  Hostname shown in returned URL JSON (default: same as -BindAddress).
.PARAMETER Foreground
  Run server in the current terminal (no backgrounding).
#>

param(
  [string]$ProjectDir = "",
  [string]$BindAddress = "127.0.0.1",
  [string]$UrlHost = "",
  [switch]$Foreground = $false
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not $UrlHost) {
  if ($BindAddress -eq "127.0.0.1" -or $BindAddress -eq "localhost") {
    $UrlHost = "localhost"
  } else {
    $UrlHost = $BindAddress
  }
}

# Generate unique session directory
$SessionId = "$PID-$(Get-Date -Format 'yyyyMMdd-HHmmss')"

if ($ProjectDir) {
  $SessionDir = Join-Path $ProjectDir ".superpowers\brainstorm\$SessionId"
} else {
  $SessionDir = Join-Path $env:TEMP "brainstorm-$SessionId"
}

$StateDir = Join-Path $SessionDir "state"
$ContentDir = Join-Path $SessionDir "content"
$PidFile = Join-Path $StateDir "server.pid"
$LogFile = Join-Path $StateDir "server.log"

# Create fresh session directory
New-Item -ItemType Directory -Path $ContentDir -Force | Out-Null
New-Item -ItemType Directory -Path $StateDir -Force | Out-Null

# Kill any existing server
if (Test-Path $PidFile) {
  $oldPid = Get-Content $PidFile
  try { Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue } catch {}
  Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

Set-Location $ScriptDir

# Resolve owner PID (parent of this PowerShell process)
$OwnerPid = (Get-CimInstance Win32_Process -Filter "ProcessId=$PID" | Select-Object -ExpandProperty ParentProcessId)

$env:BRAINSTORM_DIR = $SessionDir
$env:BRAINSTORM_HOST = $BindAddress
$env:BRAINSTORM_URL_HOST = $UrlHost
$env:BRAINSTORM_OWNER_PID = "$OwnerPid"

if ($Foreground) {
  # Foreground mode
  "$PID" | Out-File -FilePath $PidFile -Encoding ascii
  & node server.cjs
  exit $LASTEXITCODE
} else {
  # Background mode - start server in a new PowerShell process
  $startInfo = @{
    FilePath = "node"
    ArgumentList = @("server.cjs")
    WorkingDirectory = $ScriptDir
    WindowStyle = "Hidden"
    RedirectStandardOutput = $LogFile
    RedirectStandardError = "$LogFile.err"
    PassThru = $true
  }
  $process = Start-Process @startInfo
  $process.Id | Out-File -FilePath $PidFile -Encoding ascii

  # Wait for server-started message (check log file)
  $timeout = 50  # 5 seconds
  for ($i = 0; $i -lt $timeout; $i++) {
    Start-Sleep -Milliseconds 100
    if (Test-Path $LogFile) {
      $log = Get-Content $LogFile -Raw
      if ($log -match '"type":"server-started"') {
        # Extract the JSON line
        $match = [regex]::Match($log, '\{"type":"server-started".*?\}')
        if ($match.Success) {
          Write-Output $match.Value
          exit 0
        }
      }
    }
  }

  Write-Output '{"error": "Server failed to start within 5 seconds"}'
  exit 1
}