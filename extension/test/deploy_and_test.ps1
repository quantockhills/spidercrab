# deploy_and_test.ps1
# Builds the Windows DLL, deploys to portable REAPER, runs integration tests.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File deploy_and_test.ps1              # full run
#   powershell -ExecutionPolicy Bypass -File deploy_and_test.ps1 -DeployOnly  # build + deploy, no tests
#   powershell -ExecutionPolicy Bypass -File deploy_and_test.ps1 -TestOnly    # tests only (REAPER already running)

param(
    [switch]$DeployOnly,
    [switch]$TestOnly,
    [switch]$SkipFrontend
)

$ErrorActionPreference = "Continue"

$REPO            = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$EXT             = "$REPO\extension"
$WDL             = "$REPO\docs\WDL\WDL"
$SDK             = "$REPO\docs\reaper-sdk\sdk"
$VCVARS          = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat"
$CLANGCL         = "C:\Program Files\LLVM\bin\clang-cl.exe"
$REAPER_PORTABLE = $PSScriptRoot
$REAPER_EXE      = "$REAPER_PORTABLE\reaper.exe"
$USERPLUGINS     = "$REAPER_PORTABLE\UserPlugins"
$DLL_SRC         = "$EXT\build\reaper-ipad-ext.dll"
$DLL_DST         = "$USERPLUGINS\reaper_spidercrab.dll"
$FRONTEND_SRC    = "$REPO\frontend\dist"
$FRONTEND_DST    = "$USERPLUGINS\frontend"
$WS_PORT         = 9224
$REAPER_TIMEOUT  = 20

function Write-Step { param($msg) Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-OK   { param($msg) Write-Host "  OK  $msg" -ForegroundColor Green }
function Write-Fail { param($msg) Write-Host " FAIL $msg" -ForegroundColor Red }

# ---- 1. Build ----
if (-not $TestOnly) {
    Write-Step "Building release DLL with clang-cl..."
    New-Item -ItemType Directory -Force "$EXT\build" | Out-Null

    $srcs = @(
        "$EXT\src\main.cpp",
        "$EXT\src\websocket_server.cpp",
        "$EXT\src\command_handler.cpp",
        "$EXT\src\sha1_utils.cpp",
        "$WDL\jnetlib\listen.cpp",
        "$WDL\jnetlib\connection.cpp",
        "$WDL\jnetlib\util.cpp",
        "$WDL\jnetlib\asyncdns.cpp",
        "$WDL\jnetlib\webserver.cpp",
        "$WDL\jnetlib\httpserv.cpp"
    )

    $q = '"'
    $srcArgs = ($srcs | ForEach-Object { $q + $_ + $q }) -join " "
    $inc = "/I${q}${SDK}${q} /I${q}$REPO\docs\WDL${q} /I${q}${WDL}${q} /I${q}${WDL}\jnetlib${q} /I${q}${WDL}\eel2${q} /I${q}${WDL}\swell${q}"
    $bat = "call ${q}${VCVARS}${q} x64`r`n${q}${CLANGCL}${q} /std:c++17 /O2 /DNDEBUG /D_WIN32 /DWDL_NO_JPEG /W3 /EHsc $inc $srcArgs /LD /Fe:${q}${DLL_SRC}${q} ws2_32.lib"
    [System.IO.File]::WriteAllText("$env:TEMP\sc_build.bat", $bat, [System.Text.Encoding]::ASCII)

    $out = cmd /c "$env:TEMP\sc_build.bat" 2>&1
    $errors = $out | Select-String "error:" | Where-Object { $_ -notmatch "^C:\\Program Files" }
    if ($errors) {
        Write-Fail "Build failed:"
        $errors | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
        exit 1
    }
    if (-not (Test-Path $DLL_SRC)) {
        Write-Fail "DLL not produced"
        exit 1
    }
    $size = [math]::Round((Get-Item $DLL_SRC).Length / 1KB, 1)
    Write-OK "Built reaper-ipad-ext.dll ($size KB)"
}

# ---- 2. Kill portable REAPER if running ----
if (-not $TestOnly) {
    $procs = Get-Process "reaper" -ErrorAction SilentlyContinue |
             Where-Object { $_.Path -like "*reaper-portable*" }
    if ($procs) {
        Write-Step "Stopping portable REAPER..."
        $procs | Stop-Process -Force
        Start-Sleep -Seconds 2
        Write-OK "Stopped"
    }
}

# ---- 3. Deploy ----
if (-not $TestOnly) {
    Write-Step "Deploying to $USERPLUGINS..."
    Copy-Item $DLL_SRC $DLL_DST -Force
    Write-OK "reaper_spidercrab.dll deployed"

    if (-not $SkipFrontend -and (Test-Path $FRONTEND_SRC)) {
        if (Test-Path $FRONTEND_DST) { Remove-Item $FRONTEND_DST -Recurse -Force }
        Copy-Item $FRONTEND_SRC $FRONTEND_DST -Recurse -Force
        Write-OK "frontend deployed"
    } elseif (-not $SkipFrontend) {
        Write-Host "  NOTE: No frontend/dist found. Run 'npm run build' in frontend/ first." -ForegroundColor Yellow
    }
}

if ($DeployOnly) {
    Write-Host "`nDeploy complete." -ForegroundColor Green
    exit 0
}

# ---- 4. Start portable REAPER ----
Write-Step "Starting portable REAPER..."
Start-Process $REAPER_EXE -WindowStyle Minimized
Write-OK "REAPER launched"

# ---- 5. Wait for WS port ----
Write-Step "Waiting for WebSocket port $WS_PORT (up to ${REAPER_TIMEOUT}s)..."
$deadline = (Get-Date).AddSeconds($REAPER_TIMEOUT)
$portOpen = $false
while ((Get-Date) -lt $deadline) {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tcp.Connect("127.0.0.1", $WS_PORT)
        $tcp.Close()
        $portOpen = $true
        break
    } catch {
        Start-Sleep -Milliseconds 500
    }
}
if (-not $portOpen) {
    Write-Fail "Port $WS_PORT never opened. Extension may have failed to load."
    Get-Process "reaper" -ErrorAction SilentlyContinue | Stop-Process -Force
    exit 1
}
Write-OK "Port $WS_PORT open"
# Give REAPER a moment to finish its startup sequence and begin calling Run()
Start-Sleep -Seconds 3

# ---- 6. Run integration tests ----
Write-Step "Running WebSocket integration tests..."
python "$PSScriptRoot\ws_integration_test.py"
$testPassed = ($LASTEXITCODE -eq 0)

# ---- 7. Kill REAPER ----
Write-Step "Stopping REAPER..."
Get-Process "reaper" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1
Write-OK "Stopped"

# ---- 8. Result ----
Write-Host ""
if ($testPassed) {
    Write-Host "ALL INTEGRATION TESTS PASSED" -ForegroundColor Green
    exit 0
} else {
    Write-Host "INTEGRATION TESTS FAILED" -ForegroundColor Red
    exit 1
}
