# AHS Alarm Analysis - Build Process Documentation

This document provides comprehensive instructions for building, packaging, and deploying the AHS Alarm Analysis system.

## 📋 Table of Contents

1. [System Overview](#system-overview)
2. [Prerequisites](#prerequisites)
3. [Quick Start](#quick-start)
4. [Build Process Details](#build-process-details)
5. [Deployment Options](#deployment-options)
6. [Troubleshooting](#troubleshooting)
7. [Development Workflow](#development-workflow)

---

## 🔧 System Overview

The AHS Alarm Analysis system consists of:

### **Backend (Python FastAPI)**
- **Purpose**: Serves alarm data exclusively from DuckDB
- **Technology**: FastAPI + PyInstaller for standalone executable
- **Output**: Single executable file (`ahs-backend-final.exe`)

### **Frontend (Next.js)**
- **Purpose**: Data extraction interface and alarm visualization
- **Technology**: Next.js 15 with React 19, TypeScript, TailwindCSS
- **Output**: Standalone Node.js application

---

## 📋 Prerequisites

### **Development Environment**
- **Python 3.8+** with pip
- **Node.js 18+** with npm
- **Windows 10/11** (for batch scripts)

### **Required Tools**
- PyInstaller (`pip install pyinstaller`)
- Git (for version control)

### **Dependencies**
All dependencies are automatically installed during the build process.

---

## 🚀 Quick Start

### **Option 1: Build Both Components**
```bash
# Build backend only
.\build-backend-only.bat

# Build frontend only
.\build-frontend-only.bat
```

### **Option 2: Clean Frontend Build with Distribution**
```bash
# Creates complete distribution package
.\build-frontend-clean.bat
```

### **Option 3: Package Existing Frontend Build**
```bash
# Package already built frontend
.\package-frontend.bat
```

---

## 🔨 Build Process Details

### **Backend Build Process** (`build-backend-only.bat`)

#### **What it does:**
1. **Installs Dependencies**: `pip install -r requirements.txt`
2. **Creates Executable**: Uses PyInstaller with optimized settings
3. **Includes Data Files**: Bundles JSON configuration files
4. **Optimizes Size**: Single-file executable with hidden imports

#### **Output:**
```
backend/
├── dist/
│   └── ahs-backend-final.exe    # Standalone executable
└── build/                        # Build artifacts (can be deleted)
```

#### **PyInstaller Configuration:**
```bash
pyinstaller --onefile --name ahs-backend-final --clean \
    --add-data "*.json;." \
    --hidden-import uvicorn.lifespan.on \
    --hidden-import uvicorn.lifespan.off \
    # ... additional hidden imports for FastAPI/Uvicorn
    main.py
```

#### **Key Features:**
- ✅ Single executable file (portable)
- ✅ No Python installation required on target
- ✅ Includes all dependencies
- ✅ FastAPI with DuckDB support

---

### **Frontend Build Process**

#### **Standard Build** (`build-frontend-only.bat`)

**Steps:**
1. **Install Dependencies**: `npm install`
2. **Production Build**: `npm run build`
3. **Creates Standalone**: Next.js standalone output

**Output:**
```
frontend/
├── .next/
│   ├── standalone/              # Self-contained application
│   │   ├── server.js           # Main server file
│   │   ├── package.json        # Runtime dependencies
│   │   └── node_modules/       # Bundled dependencies
│   └── static/                 # Static assets
└── public/                     # Public assets
```

#### **Clean Distribution Build** (`build-frontend-clean.bat`)

**Additional Features:**
- Creates `dist-frontend/` folder with everything needed
- Includes startup script (`start-frontend.bat`)
- Adds deployment instructions (`README.txt`)
- Copies only essential files (excludes source code)

**Output Structure:**
```
dist-frontend/
├── server.js                   # Main application
├── package.json               # Dependencies info
├── node_modules/              # Runtime dependencies
├── .next/                     # Built application
├── public/                    # Static assets
├── start-frontend.bat         # Windows startup script
└── README.txt                 # Deployment instructions
```

#### **Package Existing Build** (`package-frontend.bat`)

**Purpose**: Packages an existing build without rebuilding
**Output**: `frontend-dist/` folder with deployment package

---

## 🚀 Deployment Options

### **Option 1: Development Deployment**
```bash
# Backend
cd backend
python main.py

# Frontend
cd frontend
npm run dev
```

### **Option 2: Production Deployment**

#### **Backend Deployment:**
1. Copy `backend/dist/ahs-backend-final.exe` to target server
2. Run executable directly - no dependencies needed
3. Serves on `http://localhost:9500` by default

#### **Frontend Deployment:**

**Method A: Using Clean Distribution**
1. Run `.\build-frontend-clean.bat`
2. Copy entire `dist-frontend/` folder to target server
3. Ensure Node.js is installed on target
4. Run `start-frontend.bat` or `node server.js`

**Method B: Using Package Distribution**
1. Run `.\build-frontend-only.bat` then `.\package-frontend.bat`
2. Copy `frontend-dist/` folder to target server
3. Run `start.bat` or `node server.js`

---

## 📝 Configuration

### **Frontend Configuration** (`next.config.js`)
```javascript
const nextConfig = {
  output: 'standalone',              // Creates self-contained build
  transpilePackages: ['leaflet', 'react-leaflet'],
  webpack: (config) => {
    config.resolve.alias = {
      leaflet: 'leaflet/dist/leaflet.js',
    };
    return config;
  },
};
```

### **Package Configuration** (`frontend/package.json`)
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "node .next/standalone/server.js",
    "lint": "next lint"
  }
}
```

### **Backend Dependencies** (`backend/requirements.txt`)
- **FastAPI 0.104.1**: Web framework
- **Uvicorn 0.24.0**: ASGI server
- **InfluxDB 5.2.3**: Database client
- **Pandas 2.1.4**: Data processing
- **Pydantic 2.5.0**: Data validation

---

## 🐛 Troubleshooting

### **Common Backend Issues**

#### **PyInstaller Import Errors**
```bash
# Add missing hidden imports to build script
--hidden-import module_name
```

#### **DuckDB Connection Issues**
- Ensure DuckDB file permissions are correct
- Check file paths in configuration

### **Common Frontend Issues**

#### **Leaflet Build Errors**
- Already configured in `next.config.js` with transpilation
- Ensure leaflet assets are in `public/leaflet/` folder

#### **Node.js Version Issues**
- Requires Node.js 18+ for Next.js 15
- Use `node --version` to check

#### **Standalone Build Missing Files**
- Ensure `output: 'standalone'` is set in `next.config.js`
- Check that static assets are copied correctly

### **Deployment Issues**

#### **Port Conflicts**
```bash
# Frontend - Change port
set PORT=8080 && node server.js

# Backend - Modify main.py
uvicorn.run(app, host="0.0.0.0", port=9501)
```

#### **Missing Dependencies**
- Backend: All dependencies bundled in executable
- Frontend: Ensure Node.js is installed on target server

---

## 🔄 Development Workflow

### **Development Mode**
```bash
# Terminal 1 - Backend
cd backend
python main.py

# Terminal 2 - Frontend
cd frontend
npm run dev
```

### **Testing Builds Locally**
```bash
# Test backend build
.\build-backend-only.bat
backend\dist\ahs-backend-final.exe

# Test frontend build
.\build-frontend-clean.bat
cd dist-frontend
node server.js
```

### **Distribution Update Workflow**
```bash
# 1. Make code changes
# 2. Build components
.\build-backend-only.bat
.\build-frontend-clean.bat

# 3. Update existing distribution (if using AHS-Simple-Native)
.\update-distribution-frontend.bat
```

---

## 📊 Build Outputs Summary

| Build Script | Output Location | Purpose | Size |
|-------------|----------------|---------|------|
| `build-backend-only.bat` | `backend/dist/ahs-backend-final.exe` | Standalone backend | ~50MB |
| `build-frontend-only.bat` | `frontend/.next/standalone/` | Standard frontend build | ~100MB |
| `build-frontend-clean.bat` | `dist-frontend/` | Clean distribution package | ~80MB |
| `package-frontend.bat` | `frontend-dist/` | Packaged existing build | ~80MB |
| `update-distribution-frontend.bat` | `AHS-Simple-Native/frontend/` | Updates existing distribution | Variable |

---

## 🎯 Best Practices

### **For Development**
- Use `npm run dev` for frontend development with hot reload
- Use `python main.py` for backend development with auto-reload
- Test builds regularly to catch packaging issues early

### **For Production**
- Always use the clean build scripts for production deployment
- Test the standalone executables before deployment
- Keep source code separate from distribution packages
- Document any custom configuration changes

### **For Distribution**
- Include deployment instructions with packages
- Test on target environment before final deployment
- Backup existing installations before updates
- Monitor application logs for deployment issues

---

## 📞 Support

For build-related issues:
1. Check the troubleshooting section above
2. Verify all prerequisites are installed
3. Review the build script output for specific error messages
4. Test in a clean environment to isolate issues

---

**Last Updated**: 2025-01-XX
**Build System Version**: 2.0
**Compatible with**: Windows 10/11, Node.js 18+, Python 3.8+