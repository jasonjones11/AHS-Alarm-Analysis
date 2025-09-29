@echo off
echo =====================================
echo Update Distribution - Frontend Only
echo =====================================
echo.

REM Set colors for output
set "INFO=[94mINFO[0m"
set "SUCCESS=[92mSUCCESS[0m"
set "ERROR=[91mERROR[0m"
set "WARN=[93mWARNING[0m"

REM Change to script directory
cd /d "%~dp0"

echo %INFO% Updating frontend in AHS-Simple-Native distribution...
echo.

REM Check if source build exists
if not exist "frontend\.next\standalone\server.js" (
    echo %ERROR% Frontend not built yet. Run 'build-frontend-only.bat' first.
    pause
    exit /b 1
)

REM Check if distribution folder exists
if not exist "AHS-Simple-Native" (
    echo %ERROR% Distribution folder 'AHS-Simple-Native' not found.
    pause
    exit /b 1
)

REM Backup and clear old frontend
echo %INFO% Clearing old frontend from distribution...
if exist "AHS-Simple-Native\frontend" rmdir /s /q "AHS-Simple-Native\frontend"
mkdir "AHS-Simple-Native\frontend"

REM Copy built frontend files
echo %INFO% Copying built frontend to distribution...

REM Copy essential standalone files
copy "frontend\.next\standalone\server.js" "AHS-Simple-Native\frontend\" > nul
copy "frontend\.next\standalone\package.json" "AHS-Simple-Native\frontend\" > nul

REM Copy node_modules if exists
if exist "frontend\.next\standalone\node_modules" (
    echo %INFO% Copying dependencies...
    xcopy "frontend\.next\standalone\node_modules" "AHS-Simple-Native\frontend\node_modules" /E /I /H /Y > nul
)

REM Create .next folder structure in distribution
mkdir "AHS-Simple-Native\frontend\.next" > nul 2>&1

REM Copy .next folder from standalone if exists
if exist "frontend\.next\standalone\.next" (
    xcopy "frontend\.next\standalone\.next" "AHS-Simple-Native\frontend\.next" /E /I /H /Y > nul
)

REM Copy static assets
echo %INFO% Copying static assets...
if exist "frontend\.next\static" (
    xcopy "frontend\.next\static" "AHS-Simple-Native\frontend\.next\static" /E /I /H /Y > nul
)

REM Copy public assets
echo %INFO% Copying public assets...
if exist "frontend\public" (
    xcopy "frontend\public" "AHS-Simple-Native\frontend\public" /E /I /H /Y > nul
)

echo.
echo %SUCCESS% =======================================
echo %SUCCESS% Frontend distribution updated!
echo %SUCCESS% =======================================
echo.
echo %INFO% Updated files in: AHS-Simple-Native\frontend\
echo %INFO% You can now run START_TEAM.bat from AHS-Simple-Native\
echo.
pause