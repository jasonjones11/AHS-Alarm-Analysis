# AHS Alarm Analysis - Deployment Guide

This guide provides step-by-step instructions for deploying the AHS Alarm Analysis system in different environments.

## 📋 Deployment Overview

The AHS Alarm Analysis system can be deployed in multiple configurations:

1. **Development Deployment** - For testing and development
2. **Production Deployment** - For operational use
3. **Standalone Deployment** - Complete self-contained package
4. **Team Distribution** - Multi-user deployment package

---

## 🎯 Deployment Scenarios

### **Scenario 1: Single User Desktop Deployment**

**Use Case**: Individual analyst workstation
**Components**: Backend executable + Frontend standalone
**Requirements**: Windows 10/11, Node.js 18+

#### **Quick Deployment Steps:**
1. **Build Components**:
   ```bash
   .\build-backend-only.bat
   .\build-frontend-clean.bat
   ```

2. **Create Deployment Folder**:
   ```
   AHS-Alarm-Analysis/
   ├── backend/
   │   └── ahs-backend-final.exe
   ├── frontend/
   │   └── [contents of dist-frontend/]
   └── START_SYSTEM.bat
   ```

3. **Create System Startup Script** (`START_SYSTEM.bat`):
   ```batch
   @echo off
   echo Starting AHS Alarm Analysis System...
   echo.

   echo Starting Backend...
   start "AHS Backend" backend\ahs-backend-final.exe

   echo Waiting for backend to start...
   timeout /t 5 /nobreak > nul

   echo Starting Frontend...
   cd frontend
   start "AHS Frontend" start-frontend.bat
   cd ..

   echo.
   echo System Started!
   echo Backend: http://localhost:9500
   echo Frontend: http://localhost:3000
   echo.
   echo Press any key to stop both services...
   pause > nul

   echo Stopping services...
   taskkill /F /IM "ahs-backend-final.exe" > nul 2>&1
   taskkill /F /IM "node.exe" > nul 2>&1
   echo System stopped.
   ```

---

### **Scenario 2: Server Deployment**

**Use Case**: Centralized server for multiple users
**Components**: Backend service + Frontend web application
**Requirements**: Windows Server, Node.js, Service management

#### **Backend as Windows Service**

1. **Install NSSM** (Non-Sucking Service Manager):
   - Download from https://nssm.cc/
   - Extract to `C:\nssm\`

2. **Create Backend Service**:
   ```batch
   # Install service
   C:\nssm\nssm.exe install "AHS-Backend" "C:\AHS-System\backend\ahs-backend-final.exe"

   # Configure service
   C:\nssm\nssm.exe set "AHS-Backend" DisplayName "AHS Alarm Analysis Backend"
   C:\nssm\nssm.exe set "AHS-Backend" Description "Mining truck alarm analysis backend service"
   C:\nssm\nssm.exe set "AHS-Backend" Start SERVICE_AUTO_START

   # Start service
   net start "AHS-Backend"
   ```

#### **Frontend as Service**

1. **Create Frontend Service**:
   ```batch
   C:\nssm\nssm.exe install "AHS-Frontend" "C:\Program Files\nodejs\node.exe"
   C:\nssm\nssm.exe set "AHS-Frontend" AppParameters "server.js"
   C:\nssm\nssm.exe set "AHS-Frontend" AppDirectory "C:\AHS-System\frontend"
   C:\nssm\nssm.exe set "AHS-Frontend" DisplayName "AHS Alarm Analysis Frontend"
   C:\nssm\nssm.exe set "AHS-Frontend" Start SERVICE_AUTO_START

   # Set environment variables
   C:\nssm\nssm.exe set "AHS-Frontend" AppEnvironmentExtra "PORT=3000"

   # Start service
   net start "AHS-Frontend"
   ```

---

### **Scenario 3: Team Distribution Package**

**Use Case**: Distributable package for mining engineering teams
**Output**: Complete self-contained team distribution

#### **Creating Team Distribution**

1. **Build All Components**:
   ```bash
   .\build-backend-only.bat
   .\build-frontend-clean.bat
   ```

2. **Create Team Package Structure**:
   ```
   AHS-Alarm-Analysis-Team/
   ├── backend/
   │   └── ahs-backend-final.exe
   ├── frontend/
   │   ├── server.js
   │   ├── package.json
   │   ├── .next/
   │   ├── public/
   │   └── node_modules/
   ├── data/                           # DuckDB files location
   ├── START_TEAM.bat                  # Main startup script
   ├── INSTALL_NODEJS.bat              # Node.js installer helper
   ├── TEAM_README.txt                 # Team instructions
   └── documentation/
       ├── BUILD_PROCESS.md
       ├── DEPLOYMENT_GUIDE.md
       └── USER_MANUAL.md
   ```

3. **Create Team Startup Script** (`START_TEAM.bat`):
   ```batch
   @echo off
   title AHS Alarm Analysis - Team Edition
   color 0A

   echo ===============================================
   echo AHS Alarm Analysis - Mining Truck Data System
   echo ===============================================
   echo.

   REM Check if Node.js is installed
   node --version >nul 2>&1
   if errorlevel 1 (
       echo [ERROR] Node.js is not installed!
       echo.
       echo Please install Node.js 18+ from: https://nodejs.org
       echo Or run INSTALL_NODEJS.bat (if available)
       echo.
       pause
       exit /b 1
   )

   echo [INFO] Node.js detected:
   node --version
   echo.

   echo [INFO] Starting AHS Alarm Analysis System...
   echo.

   REM Start Backend
   echo [INFO] Starting Backend Service...
   start "AHS Backend" /MIN backend\ahs-backend-final.exe

   REM Wait for backend
   echo [INFO] Waiting for backend to initialize...
   timeout /t 8 /nobreak > nul

   REM Start Frontend
   echo [INFO] Starting Frontend Application...
   cd frontend
   start "AHS Frontend" node server.js
   cd ..

   echo.
   echo [SUCCESS] System Started Successfully!
   echo.
   echo ===============================================
   echo    Access the application at:
   echo    http://localhost:3000
   echo ===============================================
   echo.
   echo [INFO] The system is now running in the background.
   echo [INFO] Close this window to stop both services.
   echo.
   echo Press Ctrl+C to stop the system...

   REM Wait for user interrupt
   :wait_loop
   timeout /t 10 /nobreak > nul
   goto wait_loop
   ```

---

### **Scenario 4: Portable USB Deployment**

**Use Case**: Portable system for field analysis
**Requirements**: Minimal dependencies, runs from USB drive

#### **USB Package Structure**:
```
USB-AHS-Analysis/
├── portable-runtime/
│   ├── node.exe                    # Portable Node.js
│   └── required-dlls/
├── system/
│   ├── backend/
│   ├── frontend/
│   └── data/
├── RUN_PORTABLE.bat                # Portable launcher
└── PORTABLE_README.txt
```

#### **Portable Launcher** (`RUN_PORTABLE.bat`):
```batch
@echo off
set "CURRENT_DIR=%~dp0"
set "NODE_PATH=%CURRENT_DIR%portable-runtime"
set "PATH=%NODE_PATH%;%PATH%"

echo Starting AHS Alarm Analysis (Portable Mode)...
echo.

REM Check portable Node.js
if not exist "%NODE_PATH%\node.exe" (
    echo [ERROR] Portable Node.js not found!
    echo Please ensure portable-runtime\node.exe exists.
    pause
    exit /b 1
)

REM Start Backend
start "AHS Backend" "%CURRENT_DIR%system\backend\ahs-backend-final.exe"

REM Wait and start Frontend
timeout /t 5 /nobreak > nul
cd "%CURRENT_DIR%system\frontend"
start "AHS Frontend" "%NODE_PATH%\node.exe" server.js

echo System running from USB drive!
echo Access at: http://localhost:3000
pause
```

---

## 🔧 Configuration Management

### **Environment Variables**

#### **Backend Configuration**:
```bash
# Database path
set DUCKDB_PATH=C:\AHS-Data\mining_trucks.duckdb

# Server settings
set HOST=0.0.0.0
set PORT=9500

# Logging
set LOG_LEVEL=INFO
set LOG_FILE=C:\AHS-Logs\backend.log
```

#### **Frontend Configuration**:
```bash
# Server port
set PORT=3000

# API endpoint
set NEXT_PUBLIC_API_URL=http://localhost:9500

# Environment
set NODE_ENV=production
```

### **Network Configuration**

#### **Firewall Rules** (Windows Server):
```batch
# Allow Backend port
netsh advfirewall firewall add rule name="AHS Backend" dir=in action=allow protocol=TCP localport=9500

# Allow Frontend port
netsh advfirewall firewall add rule name="AHS Frontend" dir=in action=allow protocol=TCP localport=3000
```

#### **Proxy Configuration** (IIS/Apache):
```
# IIS URL Rewrite for Frontend
<rewrite>
  <rules>
    <rule name="AHS Frontend" stopProcessing="true">
      <match url=".*" />
      <action type="Rewrite" url="http://localhost:3000/{R:0}" />
    </rule>
  </rules>
</rewrite>
```

---

## 🚀 Update Procedures

### **Update Deployment Process**

#### **For Team Distributions**:
1. **Build New Version**:
   ```bash
   .\build-backend-only.bat
   .\build-frontend-clean.bat
   ```

2. **Update Existing Installation**:
   ```bash
   # Stop services
   taskkill /F /IM "ahs-backend-final.exe"
   taskkill /F /IM "node.exe"

   # Backup data
   xcopy "AHS-System\data" "AHS-Backup-%DATE%" /E /I

   # Update backend
   copy "backend\dist\ahs-backend-final.exe" "AHS-System\backend\"

   # Update frontend
   .\update-distribution-frontend.bat

   # Restart services
   START_TEAM.bat
   ```

#### **For Server Deployments**:
```batch
# Stop services
net stop "AHS-Backend"
net stop "AHS-Frontend"

# Update files
# ... copy new executables ...

# Start services
net start "AHS-Backend"
net start "AHS-Frontend"
```

---

## 🛡️ Security Considerations

### **Network Security**
- **Backend**: Runs on localhost:9500 by default
- **Frontend**: Runs on localhost:3000 by default
- **Database**: Local DuckDB files (file system security)

### **Production Hardening**
1. **Change Default Ports**
2. **Enable HTTPS** (reverse proxy)
3. **Restrict File Permissions**
4. **Regular Security Updates**

### **Data Security**
- DuckDB files contain sensitive mining data
- Ensure proper file permissions (administrator access only)
- Consider encryption for sensitive deployments

---

## 📊 Monitoring and Maintenance

### **Health Checks**

#### **Backend Health**:
```bash
curl http://localhost:9500/
# Should return: {"message": "Mining Truck Data API", "status": "healthy"}
```

#### **Frontend Health**:
```bash
curl http://localhost:3000/
# Should return: HTML page
```

### **Log Locations**
- **Backend Logs**: Console output (redirect to file for services)
- **Frontend Logs**: Browser console + server console
- **System Logs**: Windows Event Viewer (for services)

### **Maintenance Tasks**
1. **Regular Data Cleanup**: Old DuckDB files
2. **Log Rotation**: Prevent log files from growing too large
3. **Dependency Updates**: Security patches
4. **Performance Monitoring**: Memory and CPU usage

---

## 🐛 Troubleshooting Deployment Issues

### **Common Issues**

#### **Backend Won't Start**
```bash
# Check if DuckDB file is accessible
dir "data\mining_trucks.duckdb"

# Check port availability
netstat -an | findstr :9500

# Test executable directly
backend\ahs-backend-final.exe
```

#### **Frontend Won't Start**
```bash
# Check Node.js version
node --version

# Check dependencies
cd frontend && npm list

# Test server file
node server.js
```

#### **Can't Access Application**
1. **Check Services**: Both backend and frontend running
2. **Check Ports**: No conflicts on 9500/3000
3. **Check Firewall**: Ports allowed through firewall
4. **Check URLs**: Correct localhost addresses

---

## 📞 Deployment Support

### **Pre-Deployment Checklist**
- [ ] Prerequisites installed (Node.js, Python for dev)
- [ ] All components built successfully
- [ ] Target environment tested
- [ ] Network configuration verified
- [ ] Security settings configured
- [ ] Backup procedures in place

### **Post-Deployment Verification**
- [ ] Backend health check passes
- [ ] Frontend loads correctly
- [ ] Data extraction works
- [ ] Map visualization functions
- [ ] Export functionality works
- [ ] Performance acceptable

---

**Last Updated**: 2025-01-XX
**Deployment Guide Version**: 2.0
**Compatible Environments**: Windows 10/11, Windows Server 2019/2022