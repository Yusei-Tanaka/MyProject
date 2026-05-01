# Starts HTTP server, Flask API, Node saveXML, and Node backend API; saves PIDs for easy stop.
$ErrorActionPreference = 'Stop'


$root = if ($PSScriptRoot) { $PSScriptRoot } else { (Get-Location).Path }
$jsDir = Join-Path $root "JS"
$pidFile = Join-Path $root ".start-all.pids"

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

$onWindows = $true
if ($PSVersionTable.PSEdition -eq 'Core') {
    $onWindows = $IsWindows
}

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

$http = Start-BackgroundProcess -FilePath $python -ArgumentList @("-m","http.server","8008","--bind","0.0.0.0") -WorkingDirectory $root
$api  = Start-BackgroundProcess -FilePath $python -ArgumentList @($apiScript) -WorkingDirectory $root
$nodeProc = Start-BackgroundProcess -FilePath $node -ArgumentList @($saveXmlScript) -WorkingDirectory $jsDir
$backendProc = Start-BackgroundProcess -FilePath $node -ArgumentList @($backendScript) -WorkingDirectory $root

$pidJson = [pscustomobject]@{
    http = $http.Id
    api  = $api.Id
    node = $nodeProc.Id
    backend = $backendProc.Id
} | ConvertTo-Json

Set-Content -Path $pidFile -Value $pidJson -Encoding ascii -Force

Write-Host "Started: http.server(8008) PID $($http.Id), api.py PID $($api.Id), saveXML.js PID $($nodeProc.Id), JS/server.js PID $($backendProc.Id)."
$stopHint = if ($onWindows) { ".\\stop.ps1" } else { "pwsh ./stop.ps1" }
Write-Host "Use $stopHint to stop them safely."
