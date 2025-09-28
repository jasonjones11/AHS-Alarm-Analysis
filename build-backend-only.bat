@echo off
echo =====================================
echo AHS Alarm Analysis - Backend Build
echo =====================================
echo.

REM Set colors for output
set "INFO=[94mINFO[0m"
set "SUCCESS=[92mSUCCESS[0m"
set "ERROR=[91mERROR[0m"
set "WARN=[93mWARNING[0m"

REM Change to script directory
cd /d "%~dp0"

echo %INFO% Starting backend build process...
echo.

REM Build Backend
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
pyinstaller --onefile --name ahs-backend-final --clean ^
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

echo.
echo %SUCCESS% =================================
echo %SUCCESS% Backend build completed!
echo %SUCCESS% =================================
echo.
echo Backend executable: backend\dist\ahs-backend-final.exe
echo.
echo You can now use this executable in your distribution.
echo.
pause