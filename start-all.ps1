# Starts the HTTP server, Flask API, and Node saver in separate background processes.
$ErrorActionPreference = 'Stop'

$root = "C:\Users\yuuse\MyProject"
$jsDir = Join-Path $root "JS"
$python = "python"
$node = "node"

# HTTP server (serves from repo root)
Start-Process -FilePath $python -ArgumentList "-m","http.server","8008","--bind","0.0.0.0" -WorkingDirectory $root -WindowStyle Minimized

# Flask API
Start-Process -FilePath $python -ArgumentList "api.py" -WorkingDirectory $root -WindowStyle Minimized

# Node saveXML
Start-Process -FilePath $node -ArgumentList ".\saveXML.js" -WorkingDirectory $jsDir -WindowStyle Minimized

Write-Host "Started: http.server on 8008, api.py, and JS/saveXML.js (each in its own window)."
Write-Host "To stop them, close the spawned windows or run 'Stop-Process -Name python,node' carefully."
