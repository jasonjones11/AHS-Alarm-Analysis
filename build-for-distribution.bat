@echo off
echo =====================================
echo AHS Alarm Analysis Distribution Build
echo =====================================
echo.

REM Set colors for output
set "INFO=[94mINFO[0m"
set "SUCCESS=[92mSUCCESS[0m"
set "ERROR=[91mERROR[0m"
set "WARN=[93mWARNING[0m"

REM Change to script directory
cd /d "%~dp0"

echo %INFO% Starting distribution build process...
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

REM Build Backend
echo.
echo %INFO% Building backend executable...
cd backend
if errorlevel 1 (
    echo %ERROR% Failed to enter backend directory
    pause
    exit /b 1
)

echo %INFO% Installing backend dependencies...
pip install -r requirements.txt
if errorlevel 1 (
    echo %WARN% Backend pip install had issues, continuing...
)

echo %INFO% Building backend executable with PyInstaller...
pyinstaller --onefile --name ahs-backend-distribution --clean ^
    --add-data "*.json;." ^
    --hidden-import uvicorn.lifespan.on ^
    --hidden-import uvicorn.lifespan.off ^
    --hidden-import uvicorn.protocols.websockets.auto ^
    --hidden-import uvicorn.protocols.http.auto ^
    --hidden-import uvicorn.protocols.http.h11_impl ^
    --hidden-import uvicorn.protocols.http.httptools_impl ^
    --hidden-import uvicorn.protocols.websockets.websockets_impl ^
    --hidden-import uvicorn.protocols.websockets.wsproto_impl ^
    --hidden-import uvicorn.loops.auto ^
    --hidden-import uvicorn.loops.asyncio ^
    main.py

if errorlevel 1 (
    echo %ERROR% Backend build failed
    pause
    exit /b 1
)

echo %SUCCESS% Backend build completed successfully
cd ..

REM Sync to Distribution Folder
echo.
echo %INFO% Syncing built files to AHS-Simple-Native distribution folder...

REM Copy built frontend to distribution
echo %INFO% Copying frontend build...
if exist "AHS-Simple-Native\frontend\" rmdir /S /Q "AHS-Simple-Native\frontend\"
mkdir "AHS-Simple-Native\frontend"
robocopy "frontend\.next" "AHS-Simple-Native\frontend\.next" /E /NFL /NDL /NJH /NJS
robocopy "frontend\public" "AHS-Simple-Native\frontend\public" /E /NFL /NDL /NJH /NJS
copy "frontend\package.json" "AHS-Simple-Native\frontend\"
copy "frontend\next.config.js" "AHS-Simple-Native\frontend\" 2>nul

REM Copy backend executable to distribution
echo %INFO% Copying backend executable...
if exist "backend\dist\ahs-backend-distribution.exe" (
    copy "backend\dist\ahs-backend-distribution.exe" "AHS-Simple-Native\backend\"
    echo %SUCCESS% Backend executable copied
) else (
    echo %ERROR% Backend executable not found
    pause
    exit /b 1
)

REM Copy essential configuration files
echo %INFO% Copying configuration files...
copy "config.json" "AHS-Simple-Native\" 2>nul
copy "license_generator.py" "AHS-Simple-Native\" 2>nul
copy "*.geojson" "AHS-Simple-Native\" 2>nul

REM Update distribution documentation
echo %INFO% Updating distribution documentation...
echo # AHS Alarm Analysis - Distribution Package > "AHS-Simple-Native\README.md"
echo. >> "AHS-Simple-Native\README.md"
echo This is the production distribution of AHS Alarm Analysis. >> "AHS-Simple-Native\README.md"
echo Built on %DATE% at %TIME% >> "AHS-Simple-Native\README.md"
echo. >> "AHS-Simple-Native\README.md"
echo ## Usage >> "AHS-Simple-Native\README.md"
echo 1. Run START.ps1 to start both backend and frontend >> "AHS-Simple-Native\README.md"
echo 2. Open http://localhost:3000 in your browser >> "AHS-Simple-Native\README.md"
echo 3. Enter your license key to access the application >> "AHS-Simple-Native\README.md"

echo.
echo %SUCCESS% =================================
echo %SUCCESS% Distribution build completed successfully!
echo %SUCCESS% =================================
echo.
echo Built files are ready in: AHS-Simple-Native\
echo - Frontend: Built Next.js application
echo - Backend: ahs-backend-distribution.exe
echo - Start script: START.ps1
echo.
echo You can now distribute the AHS-Simple-Native folder to your team.
echo.
pause