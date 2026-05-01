# Stops processes started by start.ps1 using stored PIDs.
$ErrorActionPreference = 'Stop'

$root = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$pidFile = Join-Path $root ".start-all.pids"

$onWindows = $true
if ($PSVersionTable.PSEdition -eq 'Core') {
    $onWindows = $IsWindows
}

$ids = @()
if (Test-Path $pidFile) {
    $data = Get-Content -Path $pidFile -Raw | ConvertFrom-Json
    $ids += @($data.http, $data.api, $data.node, $data.backend)
}

# Fallback: find matching processes by command line if pid file missing/stale.
if ($onWindows) {
    $procs = Get-CimInstance Win32_Process | Where-Object {
        $_.CommandLine -like "*http.server*8008*" -or
        $_.CommandLine -like "*api.py*" -or
        $_.CommandLine -like "*saveXML.js*" -or
        $_.CommandLine -like "*JS\\server.js*" -or
        $_.CommandLine -like "*JS/server.js*"
    }
    $ids += $procs.ProcessId
} else {
    $psLines = & ps -ax -o pid= -o command=
    foreach ($line in $psLines) {
        if ($line -match "http\.server\s+8008" -or
            $line -match "api\.py" -or
            $line -match "saveXML\.js" -or
            $line -match "JS/server\.js") {
            $ids += ($line -split "\s+", 2)[0]
        }
    }
}

$ids = $ids | Where-Object { $_ } | Sort-Object -Unique

if (-not $ids) {
    Write-Warning "No target PIDs found. Nothing to stop."
    return
}

foreach ($id in $ids) {
    try {
        Stop-Process -Id $id -ErrorAction SilentlyContinue
        Write-Host "Stopped PID $id"
    } catch {
        Write-Warning "Could not stop PID ${id}: $($_.Exception.Message)"
    }
}

Remove-Item $pidFile -ErrorAction SilentlyContinue
Write-Host "Done."
