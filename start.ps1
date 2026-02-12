# Starts HTTP server, Flask API, and Node saveXML; saves PIDs for easy stop.
$ErrorActionPreference = 'Stop'

$root = "C:\Users\yuuse\MyProject"
$jsDir = Join-Path $root "JS"
$pidFile = Join-Path $root ".start-all.pids"
$python = "python"
$node = "node"

$http = Start-Process -FilePath $python -ArgumentList "-m","http.server","8008","--bind","0.0.0.0" -WorkingDirectory $root -PassThru -WindowStyle Minimized
$api  = Start-Process -FilePath $python -ArgumentList "api.py" -WorkingDirectory $root -PassThru -WindowStyle Minimized
$nodeProc = Start-Process -FilePath $node -ArgumentList ".\saveXML.js" -WorkingDirectory $jsDir -PassThru -WindowStyle Minimized

$pidJson = [pscustomobject]@{
    http = $http.Id
    api  = $api.Id
    node = $nodeProc.Id
} | ConvertTo-Json

Set-Content -Path $pidFile -Value $pidJson -Encoding ascii -Force

Write-Host "Started: http.server(8008) PID $($http.Id), api.py PID $($api.Id), saveXML.js PID $($nodeProc.Id)."
Write-Host "Use .\\stop.ps1 to stop them safely."
