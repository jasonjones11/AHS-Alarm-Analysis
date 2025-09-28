@echo off
echo =====================================
echo AHS Alarm Analysis - Frontend Build
echo =====================================
echo.

REM Set colors for output
set "INFO=[94mINFO[0m"
set "SUCCESS=[92mSUCCESS[0m"
set "ERROR=[91mERROR[0m"
set "WARN=[93mWARNING[0m"

REM Change to script directory
cd /d "%~dp0"

echo %INFO% Starting frontend build process...
echo.

REM Build Frontend
echo %INFO% Building frontend from source...
cd frontend
if errorlevel 1 (
    echo %ERROR% Failed to enter frontend directory
    pause
    exit /b 1
)

echo %INFO% Installing frontend dependencies...
call npm install
if errorlevel 1 (
    echo %ERROR% Frontend npm install failed
    pause
    exit /b 1
)

echo %INFO% Building frontend for production...
call npm run build
if errorlevel 1 (
    echo %ERROR% Frontend build failed
    pause
    exit /b 1
)

echo %SUCCESS% Frontend build completed successfully
cd ..

echo.
echo %SUCCESS% =================================
echo %SUCCESS% Frontend build completed!
echo %SUCCESS% =================================
echo.
echo Built files location: frontend\.next\
echo.
echo To deploy, copy the following to your distribution:
echo - frontend\.next\ folder (built application)
echo - frontend\public\ folder (static assets)
echo - frontend\package.json (dependencies info)
echo - frontend\next.config.js (configuration)
echo.
echo Then run 'npm install --production' in the distribution directory.
echo.
pause