# Disables MyProject auto-start entries in Windows Startup folder, Run registry keys, and Scheduled Tasks.
$ErrorActionPreference = 'Stop'

$patterns = @(
    'MyProject',
    'start.ps1',
    'start-all.ps1',
    'saveXML.js',
    'JS\\server.js',
    'api.py'
)

function Test-MatchAny {
    param([string]$Text)
    if (-not $Text) { return $false }
    foreach ($p in $patterns) {
        if ($Text -match [regex]::Escape($p)) { return $true }
    }
    return $false
}

$removed = @()

# 1) Startup folders (current user + all users)
$startupDirs = @(
    [Environment]::GetFolderPath('Startup'),
    "$env:ProgramData\Microsoft\Windows\Start Menu\Programs\Startup"
) | Select-Object -Unique

foreach ($dir in $startupDirs) {
    if (-not (Test-Path $dir)) { continue }
    Get-ChildItem -Path $dir -File -Force -ErrorAction SilentlyContinue | ForEach-Object {
        $name = $_.Name
        $path = $_.FullName
        if (Test-MatchAny $name -or Test-MatchAny $path) {
            Remove-Item -Path $path -Force -ErrorAction SilentlyContinue
            $removed += "Startup: $path"
        }
    }
}

# 2) Run registry keys
$runKeys = @(
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run',
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Run'
)

foreach ($key in $runKeys) {
    if (-not (Test-Path $key)) { continue }
    $props = Get-ItemProperty -Path $key
    foreach ($property in $props.PSObject.Properties) {
        if ($property.Name -like 'PS*') { continue }
        $valueText = [string]$property.Value
        if (Test-MatchAny $property.Name -or Test-MatchAny $valueText) {
            Remove-ItemProperty -Path $key -Name $property.Name -ErrorAction SilentlyContinue
            $removed += "RunKey: $key :: $($property.Name)"
        }
    }
}

# 3) Scheduled tasks (disable + unregister if action matches)
$tasks = Get-ScheduledTask -ErrorAction SilentlyContinue
foreach ($task in $tasks) {
    $actionText = ($task.Actions | ForEach-Object { "$(($_.Execute) -as [string]) $(($_.Arguments) -as [string])" }) -join ' ; '
    if (Test-MatchAny $task.TaskName -or Test-MatchAny $task.TaskPath -or Test-MatchAny $actionText) {
        try {
            Disable-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath -ErrorAction SilentlyContinue | Out-Null
            Unregister-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath -Confirm:$false -ErrorAction SilentlyContinue
            $removed += "Task: $($task.TaskPath)$($task.TaskName)"
        } catch {
            Write-Warning "Could not remove task $($task.TaskPath)$($task.TaskName): $($_.Exception.Message)"
        }
    }
}

if ($removed.Count -eq 0) {
    Write-Host 'No MyProject auto-start entries found.'
} else {
    Write-Host 'Removed auto-start entries:'
    $removed | ForEach-Object { Write-Host " - $_" }
}
