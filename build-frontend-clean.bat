@echo off
echo =====================================
echo AHS Alarm Analysis - Clean Frontend Build
echo =====================================
echo.

REM Set colors for output
set "INFO=[94mINFO[0m"
set "SUCCESS=[92mSUCCESS[0m"
set "ERROR=[91mERROR[0m"
set "WARN=[93mWARNING[0m"

REM Change to script directory
cd /d "%~dp0"

echo %INFO% Starting clean frontend build process...
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
echo.

REM Create clean distribution folder
echo %INFO% Creating clean distribution folder...
cd ..
if exist "dist-frontend" rmdir /s /q "dist-frontend"
mkdir "dist-frontend"

REM Copy only necessary files from standalone application
echo %INFO% Copying standalone application files...

REM Copy essential files only (exclude src folder)
copy "frontend\.next\standalone\server.js" "dist-frontend\" > nul
if errorlevel 1 (
    echo %ERROR% Failed to copy server.js
    pause
    exit /b 1
)

copy "frontend\.next\standalone\package.json" "dist-frontend\" > nul
if errorlevel 1 (
    echo %ERROR% Failed to copy package.json
    pause
    exit /b 1
)

REM Copy node_modules (contains the bundled dependencies)
if exist "frontend\.next\standalone\node_modules" (
    echo %INFO% Copying bundled dependencies...
    xcopy "frontend\.next\standalone\node_modules" "dist-frontend\node_modules" /E /I /H /Y > nul
    if errorlevel 1 (
        echo %ERROR% Failed to copy dependencies
        pause
        exit /b 1
    )
)

REM Copy .next folder if it exists in standalone
if exist "frontend\.next\standalone\.next" (
    xcopy "frontend\.next\standalone\.next" "dist-frontend\.next" /E /I /H /Y > nul
)

REM Copy static assets
echo %INFO% Copying static assets...
xcopy "frontend\.next\static" "dist-frontend\.next\static" /E /I /H /Y
if errorlevel 1 (
    echo %ERROR% Failed to copy static assets
    pause
    exit /b 1
)

REM Copy public folder
echo %INFO% Copying public assets...
xcopy "frontend\public" "dist-frontend\public" /E /I /H /Y
if errorlevel 1 (
    echo %ERROR% Failed to copy public assets
    pause
    exit /b 1
)

REM Create startup script
echo %INFO% Creating startup script...
echo @echo off > "dist-frontend\start-frontend.bat"
echo echo Starting AHS Alarm Analysis Frontend... >> "dist-frontend\start-frontend.bat"
echo node server.js >> "dist-frontend\start-frontend.bat"
echo pause >> "dist-frontend\start-frontend.bat"

REM Create deployment instructions
echo %INFO% Creating deployment instructions...
echo AHS Alarm Analysis - Frontend Distribution > "dist-frontend\README.txt"
echo ============================================== >> "dist-frontend\README.txt"
echo. >> "dist-frontend\README.txt"
echo This folder contains the complete frontend application ready for deployment. >> "dist-frontend\README.txt"
echo. >> "dist-frontend\README.txt"
echo DEPLOYMENT INSTRUCTIONS: >> "dist-frontend\README.txt"
echo 1. Copy this entire folder to your target server >> "dist-frontend\README.txt"
echo 2. Ensure Node.js is installed on the target server >> "dist-frontend\README.txt"
echo 3. Run 'start-frontend.bat' to start the application >> "dist-frontend\README.txt"
echo    OR run 'node server.js' directly >> "dist-frontend\README.txt"
echo. >> "dist-frontend\README.txt"
echo The application will start on port 3000 by default. >> "dist-frontend\README.txt"
echo You can set the PORT environment variable to change this. >> "dist-frontend\README.txt"
echo. >> "dist-frontend\README.txt"
echo FOLDER CONTENTS: >> "dist-frontend\README.txt"
echo - server.js: Main application server >> "dist-frontend\README.txt"
echo - package.json: Dependencies information >> "dist-frontend\README.txt"
echo - public/: Static assets (images, icons, etc.) >> "dist-frontend\README.txt"
echo - .next/: Built application code >> "dist-frontend\README.txt"
echo - start-frontend.bat: Windows startup script >> "dist-frontend\README.txt"

echo.
echo %SUCCESS% =======================================
echo %SUCCESS% Clean frontend build completed!
echo %SUCCESS% =======================================
echo.
echo %SUCCESS% Distribution folder created: dist-frontend\
echo.
echo %INFO% The 'dist-frontend' folder contains EVERYTHING needed for deployment:
echo   - Complete standalone Next.js application
echo   - All static assets and public files
echo   - Startup script (start-frontend.bat)
echo   - Deployment instructions (README.txt)
echo.
echo %INFO% To deploy:
echo   1. Copy the entire 'dist-frontend' folder to your target server
echo   2. Run 'start-frontend.bat' or 'node server.js' on the target server
echo.
echo %WARN% Make sure Node.js is installed on the target server!
echo.
pause