$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$PidFile = Join-Path $ProjectRoot "cache\proxy.pid"
$CombinedLog = Join-Path $ProjectRoot "combined.log"
$ErrorLog = Join-Path $ProjectRoot "error.log"
$Port = 7777

function Ensure-CacheDirectory {
    $cacheDir = Join-Path $ProjectRoot "cache"
    if (-not (Test-Path $cacheDir)) {
        New-Item -ItemType Directory -Path $cacheDir | Out-Null
    }
}

function Get-ProxyProcessFromPort {
    $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $connection) {
        return $null
    }

    $cimProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)" -ErrorAction SilentlyContinue
    if (-not $cimProcess -or $cimProcess.Name -ne "node.exe" -or $cimProcess.CommandLine -notlike "*dist/index.js*") {
        return $null
    }

    try {
        return Get-Process -Id $connection.OwningProcess -ErrorAction Stop
    } catch {
        return $null
    }
}

function Get-TrackedProcess {
    if (-not (Test-Path $PidFile)) {
        return Get-ProxyProcessFromPort
    }

    $rawPid = (Get-Content $PidFile -Raw).Trim()
    if (-not $rawPid) {
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
        return $null
    }

    try {
        return Get-Process -Id ([int]$rawPid) -ErrorAction Stop
    } catch {
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
        return Get-ProxyProcessFromPort
    }
}

function Get-Health {
    try {
        return Invoke-RestMethod -Uri "http://localhost:$Port/health" -Method Get -TimeoutSec 2
    } catch {
        return $null
    }
}

function Start-Proxy {
    Ensure-CacheDirectory
    $process = Get-TrackedProcess
    if ($process) {
        Write-Host "Servicio ya iniciado (PID $($process.Id))"
        return
    }

    $distEntry = Join-Path $ProjectRoot "dist\index.js"
    if (-not (Test-Path $distEntry)) {
        Write-Error "No existe dist\index.js. Ejecuta npm run build primero."
    }

    if (-not (Test-Path $CombinedLog)) {
        New-Item -ItemType File -Path $CombinedLog | Out-Null
    }

    if (-not (Test-Path $ErrorLog)) {
        New-Item -ItemType File -Path $ErrorLog | Out-Null
    }

    $started = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory $ProjectRoot -RedirectStandardOutput $CombinedLog -RedirectStandardError $ErrorLog -PassThru
    Start-Sleep -Seconds 2
    $started.Refresh()

    $running = Get-ProxyProcessFromPort

    if (-not $running -and $started.HasExited) {
        Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
        Write-Error "No se pudo iniciar el proxy."
    }

    if (-not $running) {
        $running = $started
    }

    Set-Content -Path $PidFile -Value $running.Id
    Write-Host "Servicio iniciado (PID $($running.Id))"
}

function Stop-Proxy {
    $process = Get-TrackedProcess
    if (-not $process) {
        Write-Host "Servicio no está activo"
        return
    }

    Stop-Process -Id $process.Id -Force
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    Write-Host "Servicio detenido"
}

function Show-Status {
    $process = Get-TrackedProcess
    $health = Get-Health

    if ($process) {
        Write-Host "Proceso activo: PID $($process.Id)"
    } else {
        Write-Host "Proceso activo: no"
    }

    if ($health) {
        $health | ConvertTo-Json -Depth 5
    } else {
        Write-Host "Health check: sin respuesta en http://localhost:$Port/health"
    }
}

function Show-Logs {
    param([bool]$ClearLogs)

    if ($ClearLogs) {
        Set-Content -Path $CombinedLog -Value ""
        Set-Content -Path $ErrorLog -Value ""
    }

    if (-not (Test-Path $CombinedLog)) {
        New-Item -ItemType File -Path $CombinedLog | Out-Null
    }

    Get-Content -Path $CombinedLog -Wait
}

function Uninstall-Proxy {
    Stop-Proxy
    Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
    Write-Host "Instalación de Windows limpiada"
}

$command = if ($args.Count -gt 0) { $args[0] } else { "help" }

switch ($command) {
    "start" { Start-Proxy }
    "stop" { Stop-Proxy }
    "restart" { Stop-Proxy; Start-Proxy }
    "status" { Show-Status }
    "logs" { Show-Logs -ClearLogs ($args.Count -gt 1 -and $args[1] -eq "--clear") }
    "uninstall" { Uninstall-Proxy }
    default {
        Write-Host "Uso: npm run proxy:start|proxy:stop|proxy:restart|proxy:logs|proxy:uninstall o npm run status"
    }
}
