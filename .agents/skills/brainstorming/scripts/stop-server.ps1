<#
.SYNOPSIS
  Stop the brainstorm server for a given session.
.DESCRIPTION
  Reads the PID file and kills the server process, then cleans up.
.PARAMETER SessionDir
  The session directory (screen_dir parent) to stop.
#>

param(
  [Parameter(Mandatory=$true)]
  [string]$SessionDir
)

$ErrorActionPreference = "Stop"

$StateDir = Join-Path $SessionDir "state"
$PidFile = Join-Path $StateDir "server.pid"
$StopFile = Join-Path $StateDir "server-stopped"

if (Test-Path $PidFile) {
  $serverPid = Get-Content $PidFile
  try {
    Stop-Process -Id $serverPid -Force -ErrorAction SilentlyContinue
    Write-Output "Server process $serverPid stopped"
  } catch {
    Write-Output "Process $serverPid not found (already stopped)"
  }
  Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
} else {
  Write-Output "No PID file found at $PidFile"
}

# Mark as stopped
"stopped at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath $StopFile -Encoding ascii

Write-Output "Server stopped: $SessionDir"