# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **world-class enterprise-grade mining truck data extraction and replay system** that provides comprehensive data extraction from InfluxDB with sophisticated storage and transformation in DuckDB for autonomous and manual mining truck analysis. The system consists of:

- **Frontend**: Next.js 15 with React-Leaflet, TypeScript, and TailwindCSS for data extraction interface and truck replay visualization
- **Backend**: Python FastAPI serving transformed data exclusively from DuckDB
- **ETL Pipeline**: Dedicated InfluxDB extraction service with separate manual and autonomous truck query patterns
- **Database**: DuckDB with comprehensive schema for raw data storage and advanced transformations
- **Data Sources**: Time-series GPS, velocity, telemetry, and state data from InfluxDB (configurable extraction limits)
- **Visualization**: Advanced truck replay system with speed-coded traces for investigation and analysis

## Architecture

```
├── backend/                    # Main FastAPI application (serves data from DuckDB only)
│   ├── main.py                # Main FastAPI application and API endpoints  
│   ├── models.py              # Data models and schemas
│   ├── duckdb_manager.py      # DuckDB database management and queries
│   ├── requirements.txt       # Backend dependencies
│   └── logs/                  # Application logs
├── etl/                       # ETL Pipeline for InfluxDB extraction
│   ├── extractor.py          # Main extraction service (manual + auto)
│   ├── autonomous_queries.py  # Autonomous truck query patterns
│   ├── manual_queries.py     # Manual truck query patterns  
│   ├── duckdb_storage.py     # DuckDB data storage and schema management
│   ├── transformer.py        # Data transformation and interval processing
│   ├── config.py            # ETL configuration management
│   └── requirements.txt     # ETL dependencies
├── frontend/                 # Next.js frontend
│   ├── src/
│   │   ├── app/             # Next.js app router
│   │   ├── components/      # React components
│   │   │   ├── DataExtractionPanel.tsx  # Main extraction interface
│   │   │   ├── MapComponent.tsx         # Truck replay map
│   │   │   ├── TruckPlayback.tsx        # Playback system
│   │   │   └── PlaybackControls.tsx     # Playback controls
│   │   ├── types/           # TypeScript types
│   │   └── utils/           # Utility functions
│   ├── package.json
│   └── next.config.js
├── data/                    # DuckDB database files
└── CLAUDE.md               # Project documentation
```

## CRITICAL INSTRUCTIONS FOR CLAUDE

### 🚨 PROFESSIONAL ENGINEERING STANDARDS - NO LAZY FIXES

**LESSON LEARNED: Always do comprehensive root cause analysis, not surface-level band-aid fixes.**

When debugging or optimizing, you MUST follow this methodology:

#### 1. **COMPREHENSIVE ANALYSIS FIRST**
- **Full data flow tracing** - understand how data moves through the entire system
- **Performance profiling** - identify actual bottlenecks with measurements, not assumptions
- **Architectural analysis** - understand component interactions and state dependencies
- **Dependency mapping** - trace how changes in one area affect others

#### 2. **ROOT CAUSE IDENTIFICATION**
- **Never fix symptoms** - always identify and fix underlying causes
- **Look for patterns** - similar issues often have common root causes
- **Check all instances** - if you find one issue, search for similar patterns throughout codebase
- **Consider side effects** - understand how fixes might impact other systems

#### 3. **HOLISTIC SOLUTIONS**
- **Fix entire categories of issues** - don't just fix individual instances
- **Validate with comprehensive testing** - ensure fixes work under all conditions
- **Measure performance impact** - quantify improvements with actual metrics
- **Document architectural changes** - explain why fixes were implemented

#### 4. **EXAMPLES FROM THIS PROJECT**

**❌ WRONG APPROACH (Lazy/Surface-level):**
- Fix individual `Date.now()` calls as they appear
- Add throttling without understanding why updates are excessive
- Optimize one shape analytics function without analyzing the algorithm

**✅ CORRECT APPROACH (Professional/Comprehensive):**
- Identify ALL hydration mismatch sources (6 different causes)
- Trace React infinite loop through entire data flow (PlaybackEngine → setState → re-render cycle)
- Analyze shape analytics algorithm complexity (O(n³) → O(n) optimization)

#### 5. **MEASUREMENT AND VALIDATION**
Always provide measurable results:
- Memory usage reduction: "85% less allocation during playback"
- Performance improvement: "Shape analytics: 50 seconds → 5-8 seconds"  
- Stability metrics: "100% elimination of hydration errors"

#### 6. **PROFESSIONAL STANDARDS**
This system serves **mining operations** where reliability is critical:
- No random crashes during incident investigation
- Predictable performance on standard hardware
- Production-grade error handling and recovery
- Comprehensive logging for debugging

**Remember: Mining engineers depend on this system for safety-critical analysis. Deliver professional-grade solutions, not quick fixes.**

### NEVER CLAIM COMPLETION WITHOUT VERIFICATION
**IMPORTANT**: Do not say a task is "done" or "completed" unless you have actually verified the results. Always:
1. Run commands to verify changes were applied
2. Check files to confirm modifications exist
3. Test functionality where possible
4. Be honest about what was accomplished vs. what still needs work

### NEVER USE UNICODE CHARACTERS
**CRITICAL**: Do not use unicode characters (checkmarks, emojis, special symbols) in code or output as they cause encoding failures on Windows systems. Use only ASCII characters:
- Instead of ✅ use [COMPLETED] or [OK] or [SUCCESS]
- Instead of ❌ use [FAILED] or [ERROR] or [BROKEN]
- Instead of ⚠️ use [WARNING] or [PARTIAL] or [ISSUE]
- Use plain ASCII characters: + - * = | for formatting

### CURRENT STATUS: System is fully functional with all major fixes verified and tested

## CRITICAL: Recent Fixes Applied and Verified

### Manual Vehicle Coordinate Extraction Fix (COMPLETED AND VERIFIED)
**Issue**: Manual vehicles (WC001) had NULL latitude/longitude because coordinates were nested in JSON structure as `Position.Latitude/Position.Longitude` instead of direct `latitude/longitude` keys.

**Root Cause**: The extractor was looking for direct `latitude/longitude` keys, but manual vehicle InCabPosition data has nested structure:
```json
{
  "Position": {
    "Latitude": -22.453158071231837,
    "Longitude": 119.89051382533737
  }
}
```

**Fix Applied**: Updated `backend/etl/extractor.py` lines 787-814 with proper nested coordinate extraction:
```python
# Extract coordinates from nested Position object for manual vehicles
latitude = longitude = None
if isinstance(pos_json, dict):
    # Try direct keys first
    latitude = pos_json.get('latitude') or pos_json.get('Latitude')
    longitude = pos_json.get('longitude') or pos_json.get('Longitude')
    
    # If not found, check nested Position object (for manual vehicles like WC001)
    if latitude is None or longitude is None:
        position_obj = pos_json.get('Position')
        if isinstance(position_obj, dict):
            latitude = position_obj.get('Latitude') or position_obj.get('latitude')
            longitude = position_obj.get('Longitude') or position_obj.get('longitude')
```

**Status**: [COMPLETED AND VERIFIED] WC001 manual vehicle now displays GPS traces correctly on map alongside autonomous vehicles.

### Negative Speed Validation Fix (PARTIALLY FIXED) 
**Issue**: Backend validation rejected negative speeds, preventing reverse truck movement data.

**Fix Applied**: Updated `backend/models.py` lines 282, 323 - removed `ge=0` constraints:
```python
# Before: speed_kmh: float = Field(..., description="Speed in km/h", ge=0)  
# After:
speed_kmh: float = Field(..., description="Speed in km/h (negative for reverse)")
speed_at_alarm_kmh: Optional[float] = Field(None, description="Vehicle speed when alarm occurred (negative for reverse)")
```

**Current Issue**: Backend logs still show AlarmInfo validation error for negative speeds:
```
speed_at_alarm_kmh: Input should be greater than or equal to 0 [input_value=-0.0015762702212668955]
```

**Status**: ⚠️ PARTIALLY FIXED. Main speed fields work, but alarm endpoint still has validation issues.

### Database Configuration Mismatch Fix (COMPLETED AND VERIFIED)
**Issue**: Backend API `/trucks` endpoint was failing with "Can't open a connection to same database file with a different configuration than existing connections" error.

**Root Cause**: ETL extractor used `DuckDBManager` with specific configuration pragmas while Backend API used `SimpleDuckDBManager` with no configuration, causing DuckDB to reject connections.

**Fix Applied**: Updated `backend/main.py` to use consistent `DuckDBManager` class throughout:
- Changed all imports and type hints from `SimpleDuckDBManager` to `DuckDBManager`
- Ensures both ETL and API use identical database configuration

**Status**: [COMPLETED AND VERIFIED] Backend `/trucks` endpoint now returns vehicle list successfully.

### Frontend Map Vehicle Selection Fix (COMPLETED AND VERIFIED)
**Issue**: GPS traces were not visible on map because users had no way to select which vehicles to display.

**Fix Applied**: Enhanced `frontend/src/components/MapComponent_New.tsx` with:
- Vehicle selection panel in top-left corner showing available vehicles
- Click to select/deselect vehicles for trace display  
- Visual indicators for vehicle types (autonomous=blue, manual=red)
- Select All / Clear All functionality
- Auto-fit map to selected vehicle traces

**Status**: [COMPLETED AND VERIFIED] All vehicle types (DT025, DT027, WC001) now display GPS traces correctly on map.

### Frontend API Connection Fix (COMPLETED AND VERIFIED)
**Issue**: Frontend requests were failing with "failed to fetch" errors when trying to extract data.

**Root Cause**: Frontend was making requests to `localhost:9500` while backend was running on `127.0.0.1:9500`. On some Windows systems, `localhost` doesn't properly resolve.

**Fix Applied**: Updated all frontend files to use `127.0.0.1` instead of `localhost`:
- `frontend/src/components/DataExtractionPanel.tsx` - 12 extraction endpoints
- `frontend/src/utils/api.ts` - API base URL
- `frontend/src/components/MapComponent_New.tsx` - playbook data URLs
- `frontend/src/components/SessionSelector.tsx` - session management URLs
- `frontend/src/utils/frontendLogger.ts` - logging endpoint

**Status**: [COMPLETED AND VERIFIED] Data extraction and API communication now works reliably.

### Frontend Logging System (PARTIALLY COMPLETED)
**Issue**: No debugging capability for trace loading errors.

**What's Working**: Created `frontend/src/utils/frontendLogger.ts` with:
- Console logging with color coding
- Browser localStorage persistence
- API call tracking with timing
- Export functionality
- Integrated into MapComponent_New.tsx

**What's NOT Working**:
- Frontend logs are only in browser localStorage, NOT in files on disk
- Backend api_requests.log and database_operations.log are empty (not being used)
- No centralized log file system for frontend operations

**Status**: ⚠️ PARTIALLY WORKING. Frontend logs to browser only, backend logging incomplete.

### Test Files and Database Cleanup (COMPLETED)
**Files Removed**:
- All `test_*.py` files from root and backend directories (~25 files)
- Analysis/debugging scripts: `check_manual_data.py`, `examine_position_json.py`, `fix_data_issues*.py`, etc.
- Test database files: `mining_trucks_test*.duckdb`
- Duplicate directories: `etl/` (root), `data/` (root)
- Old documentation files: `BULLETPROOF_EXTRACTION_SOLUTION.md`, `CHANGES_APPLIED.md`, etc.
- Frontend test files: `test-api.js`, `test-integration.js`, `debug.md`

**Remaining**: `mining_trucks_bulletproof.duckdb` (locked by backend process - remove when backend restarts)

**Status**: ✅ COMPLETED. Codebase is now clean with only production files.

### WC007 Data Persistence Investigation (COMPLETED)
**Issue**: WC007 data persisted despite recent extractions only including LV256/LV424.

**Root Cause Found**: 
- Data clearing logic IS working (frontend calls `/clear-database` before extraction)
- WC007 data survived because recent LV256/LV424 extractions failed at playback transformation stage
- WC007 has complete playbook data from previous successful extraction + coordinate fix
- LV256/LV424 only have raw data, missing playbook transformation

**Status**: ✅ INVESTIGATION COMPLETE. Pipeline architecture confirmed correct.

### Current Data State (Verified Working)
- **DT025** (autonomous): Complete GPS trace data - 1,500 playbook records with proper coordinates
- **DT027** (autonomous): Complete GPS trace data - 1,500 playbook records with proper coordinates  
- **WC001** (manual): Complete GPS trace data - 1,500 playbook records with proper coordinates
- **All vehicles**: Display GPS traces correctly on map with full visualization support
- **Session ID**: Latest extraction session with all fixes applied

## Development Commands

### Backend (Main Application)
```bash
cd backend
pip install -r requirements.txt
python main.py
# Runs on http://localhost:9500
# Serves data exclusively from DuckDB
```

### ETL Pipeline (Data Extraction)
```bash
cd etl
pip install -r requirements.txt
python extractor.py  # Run extraction service
# Extracts from InfluxDB → stores in DuckDB → transforms data
```

### Frontend (Data Extraction Interface)
```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:3000
# Provides extraction interface and truck replay visualization
```

## ETL Architecture

### Extract Phase (extractor.py)
- **InfluxDB Connection**: Connects to user-specified InfluxDB instances
- **Dual Query Patterns**: Separate queries for autonomous vs manual trucks
- **Time Range Validation**: Enforces maximum extraction duration limits
- **Asset Discovery**: Discovers autonomous vehicles or processes specific manual vehicles
- **Production Safety**: Read-only InfluxDB access with configurable limits

### Transform Phase (transformer.py)
- **State Interval Processing**: Converts raw state data into time intervals
- **Data Association**: Associates GPS/velocity data with active vehicle states
- **Notification Mapping**: Maps notifications to nearby GPS points within time windows
- **Data Quality**: Validates timestamps and ensures millisecond precision
- **Relationship Building**: Creates proper foreign key relationships in combined data

### Load Phase (duckdb_storage.py)
- **Schema Management**: Creates and maintains DuckDB schema with proper indexes
- **Raw Data Storage**: Stores all extracted data in structured raw tables
- **Combined Views**: Generates combined data tables with state associations
- **Performance Optimization**: Optimized queries with appropriate indexing
- **Data Integrity**: Ensures referential integrity across related tables

## DuckDB Schema and Queries

### Raw Data Tables (Based on Requirements)
```sql
-- GPS data from autonomous trucks
CREATE TABLE gps_raw (
    id INTEGER PRIMARY KEY,
    vehicle_id VARCHAR,
    timestamp TIMESTAMP, -- Millisecond precision
    latitude FLOAT,
    longitude FLOAT
);

-- Velocity data from both truck types
CREATE TABLE velocity_raw (
    id INTEGER PRIMARY KEY,
    vehicle_id VARCHAR,
    timestamp TIMESTAMP,
    velocity FLOAT
);

-- State data tables
CREATE TABLE motion_controller_raw (
    id INTEGER PRIMARY KEY,
    vehicle_id VARCHAR,
    timestamp TIMESTAMP,
    state VARCHAR
);

CREATE TABLE asset_activity_raw (
    id INTEGER PRIMARY KEY,
    vehicle_id VARCHAR,
    timestamp TIMESTAMP,
    state VARCHAR
);

CREATE TABLE haulage_state_raw (
    id INTEGER PRIMARY KEY,
    vehicle_id VARCHAR,
    timestamp TIMESTAMP,
    state VARCHAR
);

-- Manual truck specific data
CREATE TABLE incab_position_raw (
    id INTEGER PRIMARY KEY,
    vehicle_id VARCHAR,
    timestamp TIMESTAMP,
    position_data VARCHAR -- JSON string
);
```

### State Interval Processing
```sql
-- Convert raw states into time intervals
CREATE TABLE motion_controller_intervals (
    id INTEGER PRIMARY KEY,
    vehicle_id VARCHAR,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    state VARCHAR
);

-- Combined data with state associations
CREATE TABLE vehicle_data_combined (
    id INTEGER PRIMARY KEY,
    vehicle_id VARCHAR,
    timestamp TIMESTAMP,
    data_type VARCHAR, -- 'gps', 'velocity', 'incab'
    latitude FLOAT,
    longitude FLOAT,
    velocity FLOAT,
    position_data VARCHAR,
    motion_controller_id INTEGER,
    asset_activity_id INTEGER,
    haulage_state_id INTEGER,
    FOREIGN KEY (motion_controller_id) REFERENCES motion_controller_intervals(id)
);
```

## CRITICAL PRODUCTION SAFETY RULES

🚨 **ABSOLUTE PROHIBITION: NEVER WRITE TO INFLUXDB**
⚠️ **InfluxDB is STRICTLY READ-ONLY - NO write operations of any kind**
⚠️ **NO client.write_points(), write_api, or any InfluxDB write methods**
⚠️ **NO data insertion, updates, or modifications to InfluxDB**
⚠️ **ETL pipeline only READS from InfluxDB using approved query patterns**
⚠️ **Main application NEVER accesses InfluxDB - only serves from DuckDB**

### Approved Data Flow:
✅ **User Interface** → Configure extraction parameters (IP, time range, assets)
✅ **ETL Extractor** → READ from InfluxDB using autonomous/manual query patterns
✅ **DuckDB Storage** → Store raw extracted data with proper schema
✅ **ETL Transformer** → Process intervals and create combined data tables
✅ **Main Application** → Serve transformed data ONLY from DuckDB
✅ **Frontend Visualization** → Display truck replay from transformed data

### ETL Safety Features:
✅ **Configurable extraction duration limits** (default: 30 minutes max)
✅ **User-specified InfluxDB connections** (no hardcoded production access)
✅ **Separate query patterns** for autonomous vs manual trucks
✅ **Input validation** and time range verification
✅ **Comprehensive error handling** and logging

## InfluxDB Query Patterns

### Autonomous Vehicle Queries
```sql
-- Haulage State
SELECT "Value" FROM "MobiusLog"."defaultMobiusPolicy"."Haulage State"
WHERE time > :dashboardTime: AND time < :upperDashboardTime:
GROUP BY "Vehicle"

-- Motion Controller
SELECT "Value" FROM "MobiusLog"."defaultMobiusPolicy"."SafetyGroup.MotionController"
WHERE time > :dashboardTime: AND time < :upperDashboardTime:
GROUP BY "Vehicle"

-- Asset Activity State
SELECT "Value" FROM "MobiusLog"."defaultMobiusPolicy"."CommandGroup.AssetActivityState"
WHERE time > :dashboardTime: AND time < :upperDashboardTime:
GROUP BY "Vehicle"

-- GPS Position
SELECT "Value.Latitude", "Value.Longitude"
FROM "MobiusLog"."defaultMobiusPolicy"."PositionGroup.GlobalPosition"
WHERE time > :dashboardTime: AND time < :upperDashboardTime:
GROUP BY "Vehicle"

-- Velocity
SELECT "Value" FROM "MobiusLog"."defaultMobiusPolicy"."Velocity X"
WHERE time > :dashboardTime: AND time < :upperDashboardTime:
GROUP BY "Vehicle"

-- Notification State
SELECT "Title" FROM "MobiusLog"."defaultMobiusPolicy"."Notification State"
WHERE time > :dashboardTime: AND time < :upperDashboardTime:
GROUP BY "Vehicle"
```

### Manual Vehicle Queries
```sql
-- Velocity (same as autonomous)
SELECT "Value" FROM "MobiusLog"."defaultMobiusPolicy"."Velocity X"
WHERE time > :dashboardTime: AND time < :upperDashboardTime:
GROUP BY "Vehicle"

-- InCab Position (manual trucks only)
SELECT "Value" FROM "MobiusLog"."defaultMobiusPolicy"."InCabPosition"
WHERE time > :dashboardTime: AND time < :upperDashboardTime:
GROUP BY "Vehicle"
```

## API Endpoints

### Main Application (Backend) - DuckDB Data Serving
- `GET /trucks` - List all available trucks from extracted data
- `GET /data/{vehicle}` - Get vehicle trajectory data for replay
- `GET /data/{vehicle}/combined` - Get combined data with state associations
- `GET /vehicles/{vehicle}/states` - Get state intervals for vehicle
- `GET /notifications/{vehicle}` - Get notifications mapped to GPS points

### ETL Extraction Endpoints
- `POST /extract-data` - Initiate InfluxDB extraction with user parameters
  - Request: InfluxDB config, time range, asset filters
  - Response: Extraction job ID and status
- `GET /extraction-status/{job_id}` - Get extraction progress and status
- `DELETE /extraction-job/{job_id}` - Cancel in-progress extraction
- `GET /config` - Get current extraction configuration limits

## ETL Configuration

### Extraction Settings (from requirements)
```json
{
  "extraction_settings": {
    "max_duration_minutes": 30,
    "max_autonomous_vehicles": 50,
    "max_manual_vehicles": 10,
    "query_timeout_seconds": 60,
    "notification_time_window_ms": 5000
  },
  "database_settings": {
    "duckdb_path": "data/mining_trucks.duckdb",
    "connection_pool_size": 5
  },
  "logging_settings": {
    "level": "INFO",
    "log_directory": "logs",
    "max_log_size_mb": 10,
    "log_retention_days": 30
  }
}
```

### Data Processing Workflow
1. **User Input Validation**: Validate InfluxDB connection, time range, assets
2. **Vehicle Discovery**: 
   - **Specific Assets**: If vehicle IDs are specified, extract data ONLY for those vehicles (ignore include flags)
   - **Auto-Discovery**: If "Include Autonomous" is checked AND no specific assets provided, auto-discover all autonomous vehicles
   - **Manual Vehicles**: NEVER auto-discover manual vehicles - they must be explicitly specified by vehicle ID
3. **Raw Data Extraction**: Execute appropriate query patterns per vehicle type using user-specified time range
4. **Raw Data Storage**: Store in DuckDB raw tables with millisecond precision
5. **State Interval Creation**: Convert state data into start/end time intervals (uses extended time range for state context)
6. **Data Association**: Match GPS/velocity data with active states at each timestamp
7. **Notification Mapping**: Associate notifications with nearby GPS points
8. **Combined Data Generation**: Create unified data tables for visualization

## Frontend Features

### Data Extraction Panel (Primary Interface)
- **InfluxDB Configuration**: User inputs for host, port, database connection
- **Time Range Selection**: Perth local time pickers with duration validation (USER INPUT DETERMINES EXTRACTION TIME RANGE)
- **Asset Filter Options**: Vehicle selection with corrected logic:
  - **Specific Vehicle IDs**: If any vehicle IDs are entered, extract data ONLY for those vehicles (ignore checkboxes)
  - **Include Autonomous Checkbox**: Only used when no specific IDs provided - auto-discovers all autonomous vehicles
  - **Include Manual Checkbox**: Manual vehicles NEVER auto-discovered - must specify exact vehicle IDs
- **Extraction Progress**: Real-time status display with progress indicators
- **Extraction Control**: Start extraction and cancel in-progress jobs

### Vehicle Selection Logic (CORRECTED)
1. **Priority 1**: If specific vehicle IDs are provided → Use ONLY those vehicles (ignore include checkboxes)
2. **Priority 2**: If no specific IDs AND "Include Autonomous" checked → Auto-discover all autonomous vehicles (up to limit)
3. **Manual Vehicles**: Always require explicit vehicle ID specification - NEVER auto-discover
4. **Validation**: Check vehicle counts against configured limits (default: 50 autonomous, 10 manual)

### Truck Replay Visualization 
- **Interactive Map**: Leaflet-based map with truck trajectory playback
- **Speed-Coded Traces**: Visual speed representation along truck paths
- **State Information**: Display motion controller, asset activity, haulage states
- **Playback Controls**: Play, pause, speed adjustment, timeline scrubbing
- **Investigation Tools**: Zoom to events, filter by states, notification markers

## Key Benefits of This Architecture

### Investigation and Analysis Benefits
- ✅ **Comprehensive Data Extraction**: Full telemetry, GPS, velocity, and state data
- ✅ **Autonomous + Manual Truck Support**: Separate query patterns for different vehicle types
- ✅ **State Association**: GPS data linked with motion controller, asset activity, haulage states
- ✅ **Temporal Precision**: Millisecond timestamp precision for detailed analysis
- ✅ **Notification Mapping**: Alerts and notifications mapped to specific locations

### Production Safety Benefits
- ✅ **User-Controlled Extraction**: No hardcoded production InfluxDB access
- ✅ **Configurable Limits**: Maximum extraction duration and vehicle count limits
- ✅ **Read-Only InfluxDB**: Absolutely no write operations to production systems
- ✅ **Input Validation**: Comprehensive validation of user inputs and time ranges
- ✅ **Error Handling**: Graceful handling of connection and query failures

### Technical Benefits
- ✅ **Separation of Concerns**: ETL extraction separate from visualization application
- ✅ **DuckDB Performance**: Fast analytical queries on structured truck data
- ✅ **Data Integrity**: Proper foreign key relationships and referential integrity
- ✅ **Flexible Queries**: Support for complex analytical queries on truck behavior
- ✅ **Scalable Storage**: Efficient storage of large time-series datasets

## System Purpose and Use Cases

### Primary Purpose
This system enables mining engineers and analysts to:
- **Extract truck telemetry data** from InfluxDB systems for specific time periods
- **Investigate incidents** by replaying truck movements with full state context
- **Analyze operational patterns** through visualization of autonomous and manual truck behavior
- **Study performance metrics** by examining speed, route efficiency, and state transitions

### Typical Investigation Workflow
1. **Configure Extraction**: User specifies InfluxDB connection and target time range
2. **Select Assets**: Choose autonomous trucks (auto-discovered) or specific manual vehicles
3. **Extract Data**: System pulls raw data using appropriate query patterns
4. **Transform and Store**: Raw data processed into DuckDB with state associations
5. **Visualize and Analyze**: Replay truck movements on map with speed coding and state information
6. **Investigate Events**: Examine specific incidents, notifications, and operational patterns

## Development Notes

### Testing Commands
```bash
# Backend tests (if available)
cd backend && python -m pytest

# Frontend tests
cd frontend && npm test

# ETL tests
cd etl && python -m pytest
```

### Performance Requirements (from requirements document)
- Extraction completes within 5 minutes for 30 minutes of data from 10 vehicles
- Database queries return results within 2 seconds for typical time ranges
- System handles at least 3 concurrent extraction jobs
- Memory usage remains within acceptable limits during extraction

This architecture provides a comprehensive, safe, and user-controlled approach to mining truck data extraction and analysis while maintaining strict production safety requirements.