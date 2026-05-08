# Stops processes started by start.ps1 using stored PIDs.
$ErrorActionPreference = 'Stop'

$root = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$pidFile = Join-Path $root ".start-all.pids"

$onWindows = $true
if ($PSVersionTable.PSEdition -eq 'Core') {
    $onWindows = $IsWindows
}

function Get-PortNumber {
    param(
        [string]$RawValue,
        [int]$Fallback
    )
    $trimmed = "$RawValue".Trim()
    $parsed = 0
    if ([int]::TryParse($trimmed, [ref]$parsed) -and $parsed -gt 0 -and $parsed -le 65535) {
        return $parsed
    }
    return $Fallback
}

function Get-AppPorts {
    param([string]$RootPath)

    $ports = [ordered]@{
        frontend = 8008
        backend = 3000
        saveXml = 3005
        flask   = 8000
    }
    $envFile = Join-Path $RootPath ".env"
    if (-not (Test-Path $envFile)) {
        return $ports
    }

    foreach ($line in Get-Content -Path $envFile) {
        if ($line -match '^\s*#') { continue }
        if ($line -match '^\s*$') { continue }

        if ($line -match '^\s*PORT\s*=\s*(.+?)\s*$') {
            $ports.backend = Get-PortNumber -RawValue $Matches[1] -Fallback $ports.backend
            continue
        }
        if ($line -match '^\s*SAVE_XML_PORT\s*=\s*(.+?)\s*$') {
            $ports.saveXml = Get-PortNumber -RawValue $Matches[1] -Fallback $ports.saveXml
            continue
        }
        if ($line -match '^\s*FLASK_API_PORT\s*=\s*(.+?)\s*$') {
            $ports.flask = Get-PortNumber -RawValue $Matches[1] -Fallback $ports.flask
        }
    }

    return $ports
}

function Get-ListeningPidsByPort {
    param([int]$Port)

    if ($Port -le 0) {
        return @()
    }

    $portSuffix = ":$Port"
    $pidMatches = @()

    try {
        $lines = netstat -ano -p tcp
        foreach ($line in $lines) {
            if ($line -notmatch 'LISTENING') { continue }
            $normalized = ($line -replace '\s+', ' ').Trim()
            $parts = $normalized -split ' '
            if ($parts.Count -lt 5) { continue }

            $localAddress = $parts[1]
            $pidText = $parts[4]
            if ($localAddress -notlike "*$portSuffix") { continue }

            $foundPid = 0
            if ([int]::TryParse($pidText, [ref]$foundPid) -and $foundPid -gt 0) {
                $pidMatches += $foundPid
            }
        }
    } catch {
        Write-Warning ("Failed to inspect port {0}: {1}" -f $Port, $_.Exception.Message)
    }

    return $pidMatches | Sort-Object -Unique
}

$ids = @()
if (Test-Path $pidFile) {
    try {
        $data = Get-Content -Path $pidFile -Raw | ConvertFrom-Json
        $ids += @($data.http, $data.api, $data.node, $data.backend)
    } catch {
        Write-Warning ("Failed to parse PID file (.start-all.pids): {0}" -f $_.Exception.Message)
    }
}

# Fallback: find matching processes by command line if pid file missing/stale.
if ($onWindows) {
    try {
        $procs = Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
            $_.CommandLine -like "*http.server*8008*" -or
            $_.CommandLine -like "*api.py*" -or
            $_.CommandLine -like "*saveXML.js*" -or
            $_.CommandLine -like "*JS\\server.js*" -or
            $_.CommandLine -like "*JS/server.js*"
        }
        $ids += $procs.ProcessId
    } catch {
        Write-Warning ("Get-CimInstance was not available: {0}" -f $_.Exception.Message)
    }

    $ports = Get-AppPorts -RootPath $root
    foreach ($name in $ports.Keys) {
        $port = [int]$ports[$name]
        $ids += Get-ListeningPidsByPort -Port $port
    }
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

$normalizedIds = @()
foreach ($candidate in $ids) {
    if ($null -eq $candidate) { continue }
    $normalized = 0
    if ([int]::TryParse("$candidate", [ref]$normalized) -and $normalized -gt 0) {
        $normalizedIds += $normalized
    }
}
$ids = $normalizedIds | Sort-Object -Unique

if (-not $ids) {
    Write-Warning "No target PIDs found. Nothing to stop."
    return
}

foreach ($id in $ids) {
    try {
        if (Get-Process -Id $id -ErrorAction SilentlyContinue) {
            Stop-Process -Id $id -Force -ErrorAction Stop
            Start-Sleep -Milliseconds 100
            if (Get-Process -Id $id -ErrorAction SilentlyContinue) {
                Write-Warning "PID $id is still running after stop attempt."
            } else {
                Write-Host "Stopped PID $id"
            }
        }
    } catch {
        Write-Warning "Could not stop PID ${id}: $($_.Exception.Message)"
    }
}

Remove-Item $pidFile -ErrorAction SilentlyContinue
Write-Host "Done."
