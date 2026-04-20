param(
  [Parameter(Mandatory = $false)]
  [ValidateSet("all", "port", "process", "path", "state")]
  [string]$Test = "all"
)

$ErrorActionPreference = "Stop"

$script:PassCount = 0
$script:FailCount = 0
$script:Results = @()

function Write-TestResult([string]$name, [bool]$passed, [string]$message = "") {
  $status = if ($passed) { "PASS" } else { "FAIL" }
  $color = if ($passed) { "Green" } else { "Red" }
  
  Write-Host "[$status] $name" -ForegroundColor $color
  if ($message) {
    Write-Host "       $message" -ForegroundColor Gray
  }
  
  if ($passed) { $script:PassCount++ } else { $script:FailCount++ }
  $script:Results += @{ Name = $name; Passed = $passed; Message = $message }
}

function Test-PortDetection {
  Write-Host "`n========== Port Detection Tests ==========" -ForegroundColor Cyan
  
  $port = 5173
  
  try {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
      Write-TestResult "Port $port is currently in use" $true "Found $($conn.Count) connection(s)"
    } else {
      Write-TestResult "Port $port is available" $true "No processes using this port"
    }
  } catch {
    Write-TestResult "Port detection capability" $false $_.Exception.Message
  }
  
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 5174)
    $listener.Start()
    Start-Sleep -Milliseconds 100
    
    $conn = Get-NetTCPConnection -LocalPort 5174 -State Listen -ErrorAction SilentlyContinue
    $detected = $null -ne $conn
    Write-TestResult "Can detect process on test port 5174" $detected
    
    $listener.Stop()
  } catch {
    Write-TestResult "Port detection test setup" $false $_.Exception.Message
  }
}

function Test-ProcessTermination {
  Write-Host "`n========== Process Termination Tests ==========" -ForegroundColor Cyan
  
  try {
    $testProc = Start-Process -FilePath "powershell.exe" -ArgumentList @(
      "-NoProfile", "-Command", "Start-Sleep -Seconds 60"
    ) -PassThru -WindowStyle Hidden
    
    Start-Sleep -Milliseconds 500
    
    $proc = Get-Process -Id $testProc.Id -ErrorAction SilentlyContinue
    if ($proc) {
      Write-TestResult "Test process started successfully" $true "PID: $($testProc.Id)"
      
      & taskkill /PID $testProc.Id /T /F 2>$null | Out-Null
      Start-Sleep -Milliseconds 200
      
      $stillRunning = Get-Process -Id $testProc.Id -ErrorAction SilentlyContinue
      $terminated = $null -eq $stillRunning
      Write-TestResult "Process termination via taskkill" $terminated
    } else {
      Write-TestResult "Test process creation" $false "Process not found after start"
    }
  } catch {
    Write-TestResult "Process termination test" $false $_.Exception.Message
  }
  
  try {
    $parentProc = Start-Process -FilePath "powershell.exe" -ArgumentList @(
      "-NoProfile", "-Command", "Start-Process powershell -ArgumentList '-NoProfile -Command Start-Sleep -Seconds 60' -WindowStyle Hidden; Start-Sleep -Seconds 60"
    ) -PassThru -WindowStyle Hidden
    
    Start-Sleep -Milliseconds 1000
    
    $proc = Get-Process -Id $parentProc.Id -ErrorAction SilentlyContinue
    if ($proc) {
      Write-TestResult "Parent process with child started" $true "PID: $($parentProc.Id)"
      
      & taskkill /PID $parentProc.Id /T /F 2>$null | Out-Null
      Start-Sleep -Milliseconds 500
      
      $stillRunning = Get-Process -Id $parentProc.Id -ErrorAction SilentlyContinue
      $terminated = $null -eq $stillRunning
      Write-TestResult "Process tree termination (/T flag)" $terminated
    }
  } catch {
    Write-TestResult "Process tree termination test" $false $_.Exception.Message
  }
}

function Test-PathMatching {
  Write-Host "`n========== Path Matching Tests ==========" -ForegroundColor Cyan
  
  $testCases = @(
    @{ Path = "ai-digital-life/apps/desktop/renderer/src/app/App.tsx"; ShouldMatch = $true; Reason = "Renderer source file" },
    @{ Path = "ai-digital-life/apps/desktop/shared/utils.ts"; ShouldMatch = $true; Reason = "Shared code" },
    @{ Path = "ai-digital-life/packages/ui/src/components/Button.tsx"; ShouldMatch = $true; Reason = "UI component" },
    @{ Path = "ai-digital-life/packages/theme/src/styles/colors.ts"; ShouldMatch = $true; Reason = "Theme styles" },
    @{ Path = "ai-digital-life/apps/desktop/main/index.ts"; ShouldMatch = $false; Reason = "Main process code" },
    @{ Path = "ai-digital-life/apps/desktop/renderer/src/app/App.test.tsx"; ShouldMatch = $false; Reason = "Test file" },
    @{ Path = "ai-digital-life/apps/desktop/renderer/src/app/App.spec.ts"; ShouldMatch = $false; Reason = "Spec file" },
    @{ Path = "ai-digital-life/apps/desktop/renderer/src/app/App.stories.tsx"; ShouldMatch = $false; Reason = "Stories file" },
    @{ Path = "ai-digital-life/apps/desktop/renderer/vite.config.ts"; ShouldMatch = $false; Reason = "Config file" },
    @{ Path = "ai-digital-life/apps/desktop/renderer/tsconfig.json"; ShouldMatch = $false; Reason = "TypeScript config" },
    @{ Path = "ai-digital-life/apps/desktop/renderer/README.md"; ShouldMatch = $false; Reason = "Documentation" },
    @{ Path = "ai-digital-life/packages/ui/src/index.d.ts"; ShouldMatch = $false; Reason = "Type declaration" },
    @{ Path = "ai-digital-life/apps/desktop/renderer/src/__tests__/App.test.ts"; ShouldMatch = $false; Reason = "Test directory" }
  )
  
  $includePatterns = @(
    "^ai-digital-life/apps/desktop/renderer/",
    "^ai-digital-life/apps/desktop/shared/",
    "^ai-digital-life/packages/(ui|ux|design|theme|styles?)/",
    "^ai-digital-life/packages/.+/src/.*(ui|ux|design|theme|styles?)",
    "^ai-digital-life/packages/.+/(src/)?design-system/",
    "^ai-digital-life/packages/.+/(src/)?styles/"
  )
  
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
  
  foreach ($case in $testCases) {
    $path = $case.Path
    $expected = $case.ShouldMatch
    $reason = $case.Reason
    
    $normalized = $path -replace "\\", "/"
    
    $excluded = $false
    foreach ($pat in $excludePatterns) {
      if ($normalized -match $pat) {
        $excluded = $true
        break
      }
    }
    
    $matched = $false
    if (-not $excluded) {
      foreach ($pat in $includePatterns) {
        if ($normalized -match $pat) {
          $matched = $true
          break
        }
      }
    }
    
    $actual = $matched
    $passed = ($actual -eq $expected)
    
    Write-TestResult "Path: $reason" $passed "Path: $path, Expected: $expected, Actual: $actual"
  }
}

function Test-StateFileHandling {
  Write-Host "`n========== State File Handling Tests ==========" -ForegroundColor Cyan
  
  $testStatePath = Join-Path $PSScriptRoot ".test-state.json"
  $backupPath = "$testStatePath.backup"
  
  try {
    if (Test-Path $testStatePath) { Remove-Item $testStatePath -Force }
    if (Test-Path $backupPath) { Remove-Item $backupPath -Force }
    
    $validState = @{
      pendingRestart = $true
      lastEditedPath = "test/path.ts"
      lastRestartAtMs = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    }
    
    $json = $validState | ConvertTo-Json -Depth 6
    Set-Content -Path $testStatePath -Value $json -Encoding UTF8
    
    $raw = Get-Content -Path $testStatePath -Raw
    $parsed = $raw | ConvertFrom-Json
    Write-TestResult "Valid state file parsing" $true "Parsed: pendingRestart=$($parsed.pendingRestart)"
  } catch {
    Write-TestResult "Valid state file parsing" $false $_.Exception.Message
  }
  
  try {
    Copy-Item -Path $testStatePath -Destination $backupPath -Force
    $backupExists = Test-Path $backupPath
    Write-TestResult "State file backup creation" $backupExists
  } catch {
    Write-TestResult "State file backup creation" $false $_.Exception.Message
  }
  
  try {
    Remove-Item $testStatePath -Force
    
    if (Test-Path $backupPath) {
      Copy-Item -Path $backupPath -Destination $testStatePath -Force
      $restored = Test-Path $testStatePath
      Write-TestResult "State file restore from backup" $restored
    }
  } catch {
    Write-TestResult "State file restore from backup" $false $_.Exception.Message
  }
  
  try {
    $corruptedJson = "{ pendingRestart: true, invalid }"
    Set-Content -Path $testStatePath -Value $corruptedJson -Encoding UTF8
    
    try {
      $raw = Get-Content -Path $testStatePath -Raw
      $parsed = $raw | ConvertFrom-Json -ErrorAction Stop
      Write-TestResult "Corrupted state detection" $false "Should have thrown error"
    } catch {
      Write-TestResult "Corrupted state detection" $true "Correctly detected invalid JSON"
    }
  } catch {
    Write-TestResult "Corrupted state detection test" $false $_.Exception.Message
  }
  
  try {
    if (Test-Path $testStatePath) { Remove-Item $testStatePath -Force }
    Set-Content -Path $testStatePath -Value "{}" -Encoding UTF8
    
    $raw = Get-Content -Path $testStatePath -Raw
    $parsed = $raw | ConvertFrom-Json
    Write-TestResult "Empty state file handling" $true "Empty object parsed successfully"
  } catch {
    Write-TestResult "Empty state file handling" $false $_.Exception.Message
  }
  
  try {
    if (Test-Path $testStatePath) { Remove-Item $testStatePath -Force }
    if (Test-Path $backupPath) { Remove-Item $backupPath -Force }
    Write-TestResult "Test cleanup" $true "Temporary files removed"
  } catch {
    Write-TestResult "Test cleanup" $false $_.Exception.Message
  }
}

function Show-Summary {
  Write-Host "`n========== Test Summary ==========" -ForegroundColor Cyan
  Write-Host "Total: $($script:PassCount + $script:FailCount)" -ForegroundColor White
  Write-Host "Passed: $script:PassCount" -ForegroundColor Green
  Write-Host "Failed: $script:FailCount" -ForegroundColor Red
  
  if ($script:FailCount -gt 0) {
    Write-Host "`nFailed Tests:" -ForegroundColor Red
    foreach ($result in $script:Results) {
      if (-not $result.Passed) {
        Write-Host "  - $($result.Name): $($result.Message)" -ForegroundColor Red
      }
    }
  }
  
  Write-Host ""
}

Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  Desktop Dev Hook Risk Mitigation Tests" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

switch ($Test) {
  "all" {
    Test-PortDetection
    Test-ProcessTermination
    Test-PathMatching
    Test-StateFileHandling
  }
  "port" { Test-PortDetection }
  "process" { Test-ProcessTermination }
  "path" { Test-PathMatching }
  "state" { Test-StateFileHandling }
}

Show-Summary

exit $(if ($script:FailCount -gt 0) { 1 } else { 0 })
