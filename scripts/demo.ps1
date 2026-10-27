param(
    [ValidateSet("start", "stop", "restart", "status")]
    [string]$Action = "status"
)

$ErrorActionPreference = "Continue"
$repo = Split-Path -Parent $PSScriptRoot
$taskName = "FrontedgeDemo"
$port = 8000
$log = Join-Path $env:TEMP "frontedge-demo.log"
$launcher = Join-Path $env:TEMP "frontedge-demo.cmd"

function Get-DemoPid {
    $connection = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($connection) { return [int]$connection.OwningProcess }
    return 0
}

function Stop-Demo {
    $null = schtasks /End /TN $taskName 2>$null
    $processId = Get-DemoPid
    if ($processId -gt 0) {
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
}

function Start-Demo {
    Stop-Demo
    $uv = (Get-Command uv -ErrorAction Stop).Source
    $lines = @(
        "@echo off",
        "cd /d `"$repo`"",
        "`"$uv`" run --package frontedge-demo-ml demo-ml >> `"$log`" 2>&1"
    )
    Set-Content -LiteralPath $launcher -Value $lines -Encoding ASCII -ErrorAction Stop
    $null = schtasks /Create /TN $taskName /TR "`"$launcher`"" /SC DAILY /ST 23:59 /F 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "schtasks /Create failed with exit code $LASTEXITCODE"
    }
    $null = schtasks /Run /TN $taskName 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "schtasks /Run failed with exit code $LASTEXITCODE"
    }
    for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$port/frontedge/api/meta" -TimeoutSec 2
            if ($response.StatusCode -eq 200) {
                Write-Output "demo: 200"
                return
            }
        } catch {
            # The server is still starting.
        }
        Start-Sleep -Seconds 1
    }
    throw "demo did not start; see $log"
}

switch ($Action) {
    "start" { Start-Demo }
    "stop" {
        Stop-Demo
        Write-Output "demo: stopped"
    }
    "restart" { Start-Demo }
    "status" {
        $processId = Get-DemoPid
        if ($processId -gt 0) {
            Write-Output "demo: running (pid $processId)"
        } else {
            Write-Output "demo: stopped"
        }
    }
}
