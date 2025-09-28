# AHS Alarm Analysis - Development Environment

## Overview
Professional mining truck alarm analysis system with integrated license management. This is the main development environment where you make code changes before building for distribution.

## 📁 Folder Structure
```
AHS Alarm Analysis/
├── frontend/                    # Next.js frontend source (merged with license system)
├── backend/                     # FastAPI backend source code
├── etl/                         # Data extraction pipeline
├── data/                        # Database files
├── logs/                        # Application logs
├── AHS-Simple-Native/           # Distribution folder (built files only)
└── build-for-distribution.bat   # Build script for distribution
```

## 🚀 Development Workflow

### 1. Development (This Folder)
- Edit source code in `frontend/` and `backend/`
- Test changes locally before distribution

### 2. Building for Distribution
```bash
build-for-distribution.bat
```
This builds and copies files to `AHS-Simple-Native/` for team distribution.

### 3. Team Distribution
Use the `AHS-Simple-Native/` folder containing only built files (no source code).

## 🔐 Integrated License System

The application now includes a comprehensive license management system:
- **Hardware Binding**: Licenses bound to MAC addresses for security
- **Admin Dashboard**: Admin users can generate licenses for team members
- **License Status**: Real-time license information display in header
- **Expiry Management**: Automatic expiry warnings and validation
- **Secure Authentication**: Server-side license validation

### License Features:
- **Epiroc Logo**: Properly displayed (120x40px) in header
- **License Authentication**: Required before accessing main application
- **Admin Controls**: Generate and manage team licenses
- **MAC Address Discovery**: Built-in system MAC address detection

## System Features

### Alarm Analysis & Visualization
- **Hour-by-Hour Analysis**: Stacked bar charts showing alarm patterns with unique colors per truck
- **Interactive Map Display**: GPS trace visualization with speed-coded paths and alarm locations  
- **Truck Summary Dashboard**: Sorted alarm counts by vehicle with peak indicators
- **Time-based Filtering**: Configurable time slices (1-24 hours) for detailed analysis
- **Multi-Vehicle Support**: Simultaneous analysis of autonomous (DT-series) and manual (WC-series) trucks

### Data Extraction & Processing
- **InfluxDB Integration**: Direct extraction from production time-series databases
- **Real-time Progress**: Live extraction status with cancellation support
- **Production Safety**: Read-only access with configurable limits and validation
- **Bulletproof Pipeline**: Retry logic and graceful error handling

## Quick Start

### Prerequisites
- **Python 3.8+** with pip
- **Node.js 18+** with npm  
- **4GB+ RAM** recommended
- **Access to InfluxDB server** with MobiusLog database

### Installation & Startup

1. **Start Backend Services**
   ```bash
   cd backend
   pip install -r requirements.txt
   python main.py
   ```
   Backend runs on **http://127.0.0.1:9501**

2. **Start Frontend Application** (new terminal)
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Frontend runs on **http://localhost:3000**

3. **Access Application**
   Open browser to **http://localhost:3000**

## Usage Guide

### Data Extraction
1. **Configure InfluxDB**:
   - Host: InfluxDB server IP (e.g., `10.84.117.22`)
   - Port: Usually `8086`
   - Database: Usually `MobiusLog`

2. **Select Time Range**: 
   - Choose start/end times (max 30 minutes recommended)
   - Times displayed in Perth local timezone

3. **Choose Vehicles**:
   - **Autonomous Discovery**: Check "Include Autonomous" for auto-detection
   - **Manual Trucks**: Specify exact IDs (e.g., `WC001, WC007`)
   - **Specific Vehicles**: Enter IDs to override auto-discovery

4. **Monitor Extraction**: Real-time progress with detailed status updates

### Alarm Analysis

#### Hour-by-Hour Analysis
1. Select vehicles and alarm types from main filters
2. Click "Hour-by-Hour Analysis" button
3. **Truck Summary Panel**: 
   - Vehicles sorted by alarm count (highest first)
   - Unique color coding for easy identification
   - "PEAK" indicators for highest-alarm trucks
4. **Interactive Chart**:
   - Stacked bars showing alarm distribution
   - Configurable time slices (1-24 hours)
   - Hover tooltips with detailed breakdowns

#### Map Visualization
1. **Vehicle Selection**: Use GPS Traces panel to select vehicles
2. **Trace Display**: Color-coded paths by vehicle type:
   - **Blue tones**: Autonomous trucks
   - **Red tones**: Manual trucks  
3. **Interactive Tools**:
   - Distance measurement (📏 icon)
   - Auto-fit to vehicle bounds
   - Speed-coded visualization
   - Start/end markers with timestamps

## System Architecture

### Component Structure
```
├── backend/           # Python FastAPI services
│   ├── main.py       # Main API server (port 9501)  
│   ├── database/     # DuckDB management
│   ├── etl/          # InfluxDB extraction pipeline
│   └── models.py     # Data schemas
├── frontend/         # Next.js React application
│   ├── src/app/      # Application routes
│   ├── src/components/
│   │   ├── AlarmTimeAnalysisPanel.tsx  # Hour-by-hour analysis
│   │   ├── DataExtractionPanel.tsx     # Extraction interface
│   │   └── MapComponent.tsx            # GPS visualization
│   └── package.json
└── data/            # DuckDB database storage
```

### Data Flow
1. **Extract**: Connect to user-specified InfluxDB → Pull raw alarm/GPS data
2. **Transform**: Process into 1-second intervals → Associate alarms with locations
3. **Store**: Save in local DuckDB with proper indexing
4. **Analyze**: Generate time-based aggregations and vehicle summaries
5. **Visualize**: Interactive charts and maps for investigation

## Configuration

### Backend Settings
Create `backend/.env`:
```
BACKEND_PORT=9501
DATABASE_PATH=data/mining_alarms.duckdb
LOG_LEVEL=INFO
EXTRACTION_TIMEOUT=1800
```

### Frontend Settings  
Create `frontend/.env.local`:
```
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:9501
```

### ETL Limits
Edit `backend/etl_config.json`:
```json
{
  "extraction_settings": {
    "max_duration_minutes": 30,
    "max_autonomous_vehicles": 50, 
    "max_manual_vehicles": 10
  }
}
```

## Troubleshooting

### Common Issues

**"Failed to fetch" during extraction**
- Verify backend running on correct port (9501)
- Check InfluxDB connectivity and credentials
- Ensure sufficient disk space for database

**Missing alarm data or GPS traces**
- Confirm vehicle IDs are exact (case-sensitive)
- Check extraction logs for data availability
- Verify time range contains actual vehicle activity

**Hour-by-hour analysis shows no data**
- Ensure vehicles are selected in main interface
- Check alarm type filters (or clear for all types)
- Verify extraction completed successfully

**Map not displaying vehicles**
- Use vehicle selection panel (top-left of map)
- Click vehicle names to toggle visibility
- Check browser console for JavaScript errors

### Performance Guidelines
- **Extraction Speed**: ~3-5 minutes for 30 minutes of 10-vehicle data
- **Memory Usage**: ~1.5GB during extraction, ~800MB normal operation
- **Database Growth**: ~75MB per hour of multi-vehicle alarm data
- **Concurrent Jobs**: Maximum 3 simultaneous extractions

## Safety & Security

### Production Safety
- **Read-Only InfluxDB**: Never writes to production databases
- **User-Controlled Access**: All connections specified by operators
- **Local Processing**: All data remains on local system
- **Input Validation**: Comprehensive time range and vehicle ID checks
- **Resource Protection**: Configurable limits prevent system overload

### Data Security
- No automatic network connections
- Local database storage only
- User-specified InfluxDB credentials
- Session-based data organization
- Clear database functionality for cleanup

## API Reference

### Alarm Data Endpoints
- `GET /data/{vehicle_id}` - Get alarm history for vehicle
- `POST /extract-data` - Start new extraction job
- `GET /extract/{job_id}` - Check extraction progress
- `DELETE /extract/{job_id}` - Cancel active extraction

### Vehicle Management
- `GET /trucks` - List available vehicles in database
- `GET /vehicles/{vehicle_id}/playback` - GPS trace data
- `DELETE /clear-database` - Clear all extracted data

### System Status
- `GET /health` - System health and version
- `GET /stats` - Database statistics and storage usage

## Distribution Notes

This system is designed for deployment in mining operations environments:

- **Standalone Operation**: No external dependencies during analysis
- **Configurable Limits**: Prevents resource exhaustion on target hardware  
- **Professional UI**: Clean interface suitable for operations centers
- **Comprehensive Logging**: Detailed audit trail for troubleshooting
- **Error Recovery**: Graceful handling of network and data issues

For technical support or deployment assistance, consult the development team with specific error logs and system configuration details.

## Version Information

**Current Release**: Enhanced alarm analysis with unique truck identification
- Hour-by-hour stacked analysis with distinct color coding
- Sorted truck summaries showing peak performers
- Improved visual distinction for multi-vehicle analysis
- Enhanced extraction pipeline with better error handling