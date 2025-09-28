# AHS Alarm Analysis - Build Process Documentation

## Overview
This document details the build process, file operations, and distribution management for the AHS Alarm Analysis system with enhanced data extraction cancellation.

## Build Scripts Created

### 1. `build-backend-only.bat`
**Purpose:** Builds only the backend executable with enhanced cancellation system

**What it creates:**
- `backend\dist\ahs-backend-final.exe` (exactly this filename)

**Process:**
1. Changes to `backend\` directory
2. Runs `pip install -r requirements.txt`
3. Executes PyInstaller with `--name ahs-backend-final` flag
4. Creates executable in `backend\dist\` folder

**Output Location:** `backend\dist\ahs-backend-final.exe`

### 2. `build-frontend-only.bat`
**Purpose:** Builds only the Next.js frontend application

**What it creates:**
- `frontend\.next\` folder (compiled Next.js application)
- Updated `frontend\package-lock.json`

**Process:**
1. Changes to `frontend\` directory
2. Runs `npm install`
3. Executes `npm run build`
4. Creates `.next` build folder

**Output Location:** `frontend\.next\` folder

### 3. `update-distribution.bat`
**Purpose:** Syncs built files from development to AHS-Simple-Native distribution folder

## File Matching Logic

### Backend Executable Check
```batch
if not exist "backend\dist\ahs-backend-final.exe" (
    echo Backend not built. Running backend build first...
    call build-backend-only.bat
)
```

**Answer to your question:**
- ✅ **YES** - It specifically looks for `ahs-backend-final.exe` (exact name)
- ✅ **YES** - The backend build script creates exactly `ahs-backend-final.exe`
- ❌ **NO** - It does NOT just look for any .exe file in dist folder

### Frontend Build Check
```batch
if not exist "frontend\.next\" (
    echo Frontend not built. Running frontend build first...
    call build-frontend-only.bat
)
```

## Detailed File Operations

### update-distribution.bat Step-by-Step

#### Step 1: Prerequisites Check
```batch
# Checks for specific files/folders:
frontend\.next\                    # Frontend build folder
backend\dist\ahs-backend-final.exe # Backend executable
```

#### Step 2: Frontend Files Update
```batch
# Remove old frontend build
rmdir /S /Q "AHS-Simple-Native\frontend\.next\"

# Copy new frontend build files (entire folder structure)
robocopy "frontend\.next" "AHS-Simple-Native\frontend\.next" /E /NFL /NDL /NJH /NJS

# Copy static assets (images, icons, etc.)
robocopy "frontend\public" "AHS-Simple-Native\frontend\public" /E /NFL /NDL /NJH /NJS

# Copy configuration files
copy "frontend\package.json" "AHS-Simple-Native\frontend\"
copy "frontend\next.config.js" "AHS-Simple-Native\frontend\"
```

#### Step 3: Backend Files Update
```batch
# Copy and rename backend executable for distribution
copy "backend\dist\ahs-backend-final.exe" "AHS-Simple-Native\backend\ahs-backend.exe"
```
**Note:** The executable gets renamed from `ahs-backend-final.exe` to `ahs-backend.exe` in distribution

#### Step 4: Configuration Files Update
```batch
# Copy project configuration
copy "config.json" "AHS-Simple-Native\"

# Copy license generator utility
copy "license_generator.py" "AHS-Simple-Native\"

# Copy map data files
copy "*.geojson" "AHS-Simple-Native\"
```

#### Step 5: Documentation Update
Creates/updates `AHS-Simple-Native\README.md` with:
- Current timestamp
- Feature list
- Usage instructions

## Manual File Operations (Alternative)

If you prefer manual control instead of using `update-distribution.bat`:

### After Backend Build Only:
```cmd
# Minimum required - copy new backend with cancellation system
copy "backend\dist\ahs-backend-final.exe" "AHS-Simple-Native\backend\ahs-backend.exe"
```

### After Frontend Build Only:
```cmd
# Remove old build
rmdir /S /Q "AHS-Simple-Native\frontend\.next"

# Copy new build
xcopy "frontend\.next" "AHS-Simple-Native\frontend\.next" /E /I

# Update configuration if needed
copy "frontend\package.json" "AHS-Simple-Native\frontend\"
```

### After Both Builds:
```cmd
# Copy backend
copy "backend\dist\ahs-backend-final.exe" "AHS-Simple-Native\backend\ahs-backend.exe"

# Copy frontend
rmdir /S /Q "AHS-Simple-Native\frontend\.next"
xcopy "frontend\.next" "AHS-Simple-Native\frontend\.next" /E /I
```

## Build Workflow Recommendations

### Scenario 1: Code Changes Made
1. **Backend changes:** Run `build-backend-only.bat`
2. **Frontend changes:** Run `build-frontend-only.bat`
3. **Update distribution:** Run `update-distribution.bat`

### Scenario 2: New License Added
1. **Backend only:** Run `build-backend-only.bat` (licenses.json gets included)
2. **Update distribution:** Run `update-distribution.bat`

### Scenario 3: Quick Manual Update
1. **Build what you need:** Use individual build scripts
2. **Manual copy:** Copy specific files as shown above

## File Naming Convention

| Development Build | Distribution Name | Location |
|------------------|-------------------|----------|
| `ahs-backend-final.exe` | `ahs-backend.exe` | `AHS-Simple-Native\backend\` |
| `frontend\.next\` | `frontend\.next\` | `AHS-Simple-Native\frontend\` |
| `frontend\public\` | `frontend\public\` | `AHS-Simple-Native\frontend\` |

## Error Handling

### Build Script Errors
- All scripts check `errorlevel` after each major operation
- Scripts pause and display error messages before exiting
- Exit codes: 0 = success, 1 = failure

### Update Script Errors
- Checks for prerequisites before starting
- Uses `robocopy` error levels (8+ indicates failure)
- Stops execution if any critical copy operation fails

## Enhanced Features Included

### Backend Improvements
- ✅ 30-second InfluxDB query timeouts
- ✅ Multi-level cancellation checks
- ✅ Proper extractor instance management
- ✅ Thread-safe query termination
- ✅ Automatic connection cleanup

### Frontend Improvements
- ✅ 30% larger Epiroc logo (156x52px)
- ✅ Correct logo file path
- ✅ Improved cancellation user feedback

## Distribution Structure

After running `update-distribution.bat`, AHS-Simple-Native contains:

```
AHS-Simple-Native/
├── backend/
│   └── ahs-backend.exe          # Renamed from ahs-backend-final.exe
├── frontend/
│   ├── .next/                   # Built Next.js application
│   ├── public/                  # Static assets
│   ├── package.json             # Dependencies info
│   └── next.config.js           # Configuration
├── config.json                  # Project configuration
├── license_generator.py         # License utility
├── *.geojson                    # Map data files
├── START_TEAM.bat               # Team startup script
└── README.md                    # Updated documentation
```

## Troubleshooting

### Common Issues
1. **"Backend not found" error:** Run `build-backend-only.bat` first
2. **"Frontend not found" error:** Run `build-frontend-only.bat` first
3. **Robocopy errors:** Check file permissions and disk space
4. **PyInstaller fails:** Check Python dependencies and antivirus exclusions

### Quick Fixes
- **Missing exe:** Always check `backend\dist\ahs-backend-final.exe` exists
- **Old files:** Distribution script automatically removes old builds
- **Permissions:** Run Command Prompt as Administrator if needed

---

**Last Updated:** Build process documentation with enhanced cancellation system
**Version:** Professional-grade data extraction with proper query termination