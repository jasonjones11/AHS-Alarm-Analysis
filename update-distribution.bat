@echo off
echo =====================================
echo AHS Alarm Analysis - Update Distribution
echo =====================================
echo.

REM Set colors for output
set "INFO=[94mINFO[0m"
set "SUCCESS=[92mSUCCESS[0m"
set "ERROR=[91mERROR[0m"
set "WARN=[93mWARNING[0m"

REM Change to script directory
cd /d "%~dp0"

echo %INFO% Updating distribution with latest builds...
echo.

REM Check if frontend is built
if not exist "frontend\.next\" (
    echo %WARN% Frontend not built. Running frontend build first...
    call build-frontend-only.bat
    if errorlevel 1 (
        echo %ERROR% Frontend build failed
        pause
        exit /b 1
    )
)

REM Check if backend is built
if not exist "backend\dist\ahs-backend-final.exe" (
    echo %WARN% Backend not built. Running backend build first...
    call build-backend-only.bat
    if errorlevel 1 (
        echo %ERROR% Backend build failed
        pause
        exit /b 1
    )
)

echo %INFO% Updating AHS-Simple-Native distribution...

REM Update frontend files
echo %INFO% Updating frontend build files...
if exist "AHS-Simple-Native\frontend\.next\" rmdir /S /Q "AHS-Simple-Native\frontend\.next\"
robocopy "frontend\.next" "AHS-Simple-Native\frontend\.next" /E /NFL /NDL /NJH /NJS
if errorlevel 8 (
    echo %ERROR% Failed to copy frontend build files
    pause
    exit /b 1
)

robocopy "frontend\public" "AHS-Simple-Native\frontend\public" /E /NFL /NDL /NJH /NJS
if errorlevel 8 (
    echo %ERROR% Failed to copy frontend public files
    pause
    exit /b 1
)

copy "frontend\package.json" "AHS-Simple-Native\frontend\" >nul
copy "frontend\next.config.js" "AHS-Simple-Native\frontend\" >nul 2>&1

REM Update backend executable
echo %INFO% Updating backend executable...
if exist "backend\dist\ahs-backend-final.exe" (
    copy "backend\dist\ahs-backend-final.exe" "AHS-Simple-Native\backend\ahs-backend.exe" >nul
    echo %SUCCESS% Backend executable updated
) else (
    echo %ERROR% Backend executable not found
    pause
    exit /b 1
)

REM Update configuration files
echo %INFO% Updating configuration files...
copy "config.json" "AHS-Simple-Native\" >nul 2>&1
copy "license_generator.py" "AHS-Simple-Native\" >nul 2>&1
copy "*.geojson" "AHS-Simple-Native\" >nul 2>&1

REM Update distribution documentation
echo %INFO% Updating distribution documentation...
echo # AHS Alarm Analysis - Distribution Package > "AHS-Simple-Native\README.md"
echo. >> "AHS-Simple-Native\README.md"
echo This is the production distribution of AHS Alarm Analysis. >> "AHS-Simple-Native\README.md"
echo Updated on %DATE% at %TIME% >> "AHS-Simple-Native\README.md"
echo. >> "AHS-Simple-Native\README.md"
echo ## Features >> "AHS-Simple-Native\README.md"
echo - Enhanced data extraction cancellation system >> "AHS-Simple-Native\README.md"
echo - Improved InfluxDB query timeout support >> "AHS-Simple-Native\README.md"
echo - Professional-grade license management >> "AHS-Simple-Native\README.md"
echo. >> "AHS-Simple-Native\README.md"
echo ## Usage >> "AHS-Simple-Native\README.md"
echo 1. Run START_TEAM.bat to start both backend and frontend >> "AHS-Simple-Native\README.md"
echo 2. Open http://localhost:3000 in your browser >> "AHS-Simple-Native\README.md"
echo 3. Enter your license key to access the application >> "AHS-Simple-Native\README.md"

echo.
echo %SUCCESS% =================================
echo %SUCCESS% Distribution updated successfully!
echo %SUCCESS% =================================
echo.
echo Distribution ready in: AHS-Simple-Native\
echo - Frontend: Built Next.js application with enhanced cancellation
echo - Backend: ahs-backend.exe with improved query termination
echo - Start script: START_TEAM.bat
echo.
echo You can now distribute the AHS-Simple-Native folder to your team.
echo.
pause