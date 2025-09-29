@echo off
echo =====================================
echo AHS Alarm Analysis - Package Frontend
echo =====================================
echo.

REM Set colors for output
set "INFO=[94mINFO[0m"
set "SUCCESS=[92mSUCCESS[0m"
set "ERROR=[91mERROR[0m"
set "WARN=[93mWARNING[0m"

REM Change to script directory
cd /d "%~dp0"

echo %INFO% Packaging frontend for distribution...
echo.

REM Check if build exists
if not exist "frontend\.next\standalone" (
    echo %ERROR% Frontend not built yet. Run 'build-frontend-only.bat' first.
    pause
    exit /b 1
)

REM Create clean distribution folder
echo %INFO% Creating distribution package...
if exist "frontend-dist" rmdir /s /q "frontend-dist"
mkdir "frontend-dist"

REM Copy only the necessary files from standalone application
echo %INFO% Copying standalone application files...

REM Copy essential files only
copy "frontend\.next\standalone\server.js" "frontend-dist\" > nul
copy "frontend\.next\standalone\package.json" "frontend-dist\" > nul

REM Copy node_modules (contains the bundled dependencies)
if exist "frontend\.next\standalone\node_modules" (
    xcopy "frontend\.next\standalone\node_modules" "frontend-dist\node_modules" /E /I /H /Y > nul
)

REM Copy .next folder if it exists in standalone
if exist "frontend\.next\standalone\.next" (
    xcopy "frontend\.next\standalone\.next" "frontend-dist\.next" /E /I /H /Y > nul
)

REM Copy static assets (required for Next.js)
echo %INFO% Copying static assets...
if exist "frontend\.next\static" (
    xcopy "frontend\.next\static" "frontend-dist\.next\static" /E /I /H /Y > nul
)

REM Copy public folder
echo %INFO% Copying public assets...
if exist "frontend\public" (
    xcopy "frontend\public" "frontend-dist\public" /E /I /H /Y > nul
)

REM Create simple startup script
echo %INFO% Creating startup script...
(
echo @echo off
echo echo.
echo echo =====================================
echo echo AHS Alarm Analysis Frontend
echo echo =====================================
echo echo Starting application on port 3000...
echo echo Press Ctrl+C to stop
echo echo.
echo node server.js
) > "frontend-dist\start.bat"

REM Create deployment guide
echo %INFO% Creating deployment guide...
(
echo AHS Alarm Analysis - Frontend Package
echo =====================================
echo.
echo QUICK START:
echo 1. Ensure Node.js is installed
echo 2. Double-click 'start.bat' to run the application
echo 3. Open http://localhost:3000 in your browser
echo.
echo MANUAL START:
echo Run: node server.js
echo.
echo PORT CONFIGURATION:
echo Set environment variable PORT=8080 to change port
echo Example: set PORT=8080 ^&^& node server.js
echo.
echo DEPLOYMENT:
echo This folder contains everything needed to run the application.
echo Just copy it to your server and run start.bat or node server.js
) > "frontend-dist\DEPLOYMENT.txt"

echo.
echo %SUCCESS% =======================================
echo %SUCCESS% Frontend packaging completed!
echo %SUCCESS% =======================================
echo.
echo %SUCCESS% Package location: frontend-dist\
echo.
echo %INFO% Package contents:
echo   - server.js (main application)
echo   - package.json (dependencies info)
echo   - .next\ (built application code)
echo   - public\ (static assets)
echo   - start.bat (easy startup script)
echo   - DEPLOYMENT.txt (instructions)
echo.
echo %INFO% To deploy:
echo   1. Copy the 'frontend-dist' folder to your target location
echo   2. Run 'start.bat' or 'node server.js'
echo.
echo %SUCCESS% Ready for deployment!
echo.
pause