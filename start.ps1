# Starts HTTP server, Flask API, Node saveXML, and Node backend API; saves PIDs for easy stop.
$ErrorActionPreference = 'Stop'


$root = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$jsDir = Join-Path $root "JS"
$pidFile = Join-Path $root ".start-all.pids"
$stopScript = Join-Path $root "stop.ps1"
$requiredServices = @("http", "api", "node", "backend")
$staticPort = 8008

# Determine OS early for use in messages and process checks
$onWindows = $true
if ($PSVersionTable.PSEdition -eq 'Core') {
    $onWindows = $IsWindows
}

# Check if processes are already running by checking the PID file
if (Test-Path $pidFile) {
    try {
        $pids = Get-Content -Path $pidFile -Raw | ConvertFrom-Json
        $runningProcs = @()
        $missingServices = @()

        foreach ($service in $requiredServices) {
            $id = $pids.$service
            if ($id -and (Get-Process -Id $id -ErrorAction SilentlyContinue)) {
                $runningProcs += [pscustomobject]@{
                    Name = $service
                    Id   = [int]$id
                }
            } else {
                $missingServices += $service
            }
        }

        if ($runningProcs.Count -eq $requiredServices.Count) {
            Write-Host 'Servers seem to be already running.' -ForegroundColor Yellow
            $runningProcs | ForEach-Object { Write-Host ("  - {0} (PID: {1})" -f $_.Name, $_.Id) }
            $stopHint = if ($onWindows) { '.\stop.ps1' } else { 'pwsh ./stop.ps1' }
            Write-Host ("To stop them, run: {0}" -f $stopHint)
            return # Exit the script
        }

        if ($runningProcs.Count -gt 0) {
            Write-Warning "Detected partial running state. Performing cleanup before restart."
            $runningProcs | ForEach-Object { Write-Host ("  - running: {0} (PID: {1})" -f $_.Name, $_.Id) }
            if ($missingServices.Count -gt 0) {
                Write-Host ("  - missing: {0}" -f ($missingServices -join ", "))
            }

            if (Test-Path $stopScript) {
                try {
                    & $stopScript
                } catch {
                    Write-Warning ("Cleanup by stop.ps1 failed: {0}" -f $_.Exception.Message)
                }
            }
        } else {
            Write-Warning 'Found a stale PID file (.start-all.pids) but target processes were not running. Deleting it and continuing.'
        }

        if (Test-Path $pidFile) {
            Remove-Item $pidFile -Force
        }
    } catch {
        Write-Warning ("Failed to read PID file (.start-all.pids). Deleting it and continuing. Error: {0}" -f $_.Exception.Message)
        if (Test-Path $pidFile) {
            Remove-Item $pidFile -Force
        }
    }
}

$pythonCmd = Get-Command python3 -ErrorAction SilentlyContinue
if (-not $pythonCmd) {
    $pythonCmd = Get-Command python -ErrorAction SilentlyContinue
}
if (-not $pythonCmd) {
    throw "Python not found on PATH. Install Python 3 and ensure 'python3' or 'python' is available."
}
$python = $pythonCmd.Source

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    throw "Node.js not found on PATH. Install Node.js and ensure 'node' is available."
}
$node = $nodeCmd.Source

$xamppApacheStart = "C:\xampp\apache_start.bat"

if ($onWindows -and (Test-Path $xamppApacheStart)) {
    Start-Process -FilePath $xamppApacheStart -WindowStyle Minimized
}

$clientConfigScript = Join-Path (Join-Path $root "scripts") "generate-client-config.js"
& $node $clientConfigScript

function Start-BackgroundProcess {
    param(
        [string]$FilePath,
        [string[]]$ArgumentList,
        [string]$WorkingDirectory
    )

    if ($onWindows) {
        return Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -WorkingDirectory $WorkingDirectory -PassThru -WindowStyle Minimized
    }

    return Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -WorkingDirectory $WorkingDirectory -PassThru
}

$apiScript = Join-Path $root "api.py"
$saveXmlScript = Join-Path $jsDir "saveXML.js"
$backendScript = Join-Path (Join-Path $root "JS") "server.js"

$http = Start-BackgroundProcess -FilePath $python -ArgumentList @("-m", "http.server", "$staticPort", "--bind", "0.0.0.0") -WorkingDirectory $root
$api  = Start-BackgroundProcess -FilePath $python -ArgumentList @($apiScript) -WorkingDirectory $root
$nodeProc = Start-BackgroundProcess -FilePath $node -ArgumentList @($saveXmlScript) -WorkingDirectory $jsDir
$backendProc = Start-BackgroundProcess -FilePath $node -ArgumentList @($backendScript) -WorkingDirectory $root

Start-Sleep -Seconds 2

$startedProcs = @(
    [pscustomobject]@{ Name = "http"; Proc = $http },
    [pscustomobject]@{ Name = "api"; Proc = $api },
    [pscustomobject]@{ Name = "node"; Proc = $nodeProc },
    [pscustomobject]@{ Name = "backend"; Proc = $backendProc }
)

$failedStarts = @()
foreach ($started in $startedProcs) {
    if (-not (Get-Process -Id $started.Proc.Id -ErrorAction SilentlyContinue)) {
        $failedStarts += $started.Name
    }
}

if ($failedStarts.Count -gt 0) {
    foreach ($started in $startedProcs) {
        if (Get-Process -Id $started.Proc.Id -ErrorAction SilentlyContinue) {
            try {
                Stop-Process -Id $started.Proc.Id -ErrorAction SilentlyContinue
            } catch {
                Write-Warning ("Failed to stop partially started process {0} (PID: {1})." -f $started.Name, $started.Proc.Id)
            }
        }
    }

    $failedList = $failedStarts -join ", "
    throw ("Failed to start: {0}. Possible causes include port conflicts or runtime errors. Check each process log/output and retry." -f $failedList)
}

$pidJson = [pscustomobject]@{
    http = $http.Id
    api  = $api.Id
    node = $nodeProc.Id
    backend = $backendProc.Id
} | ConvertTo-Json

Set-Content -Path $pidFile -Value $pidJson -Encoding ascii -Force

Write-Host "Started: http.server($staticPort) PID $($http.Id), api.py PID $($api.Id), saveXML.js PID $($nodeProc.Id), JS/server.js PID $($backendProc.Id)."
$stopHint = if ($onWindows) { '.\stop.ps1' } else { 'pwsh ./stop.ps1' }
Write-Host ("Use {0} to stop them safely." -f $stopHint)
