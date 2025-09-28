"""
Mining Truck Alarm Analysis API

Direct InfluxDB alarm extraction for real-time analysis.
Focused on alarm event analysis with telemetry data correlation.
"""

import sys
if sys.platform == 'win32':
    import os
    os.environ['PYTHONIOENCODING'] = 'utf-8'
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    if hasattr(sys.stderr, 'reconfigure'):
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import json
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
import asyncio
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

# Import our modules
from alarm_extractor import AlarmDataExtractor
from alarm_config import AlarmTypeManager
from license_manager import LicenseManager
from models import (
    AlarmExtractionRequest, AlarmExtractionResponse, AlarmEvent, AlarmTelemetry,
    SuccessResponse, ErrorResponse, HealthCheckResponse, BaseModel
)

# ================================
# Global State Management
# ================================

# Store active alarm extractors and results
active_extractions: Dict[str, Dict[str, Any]] = {}
extraction_results: Dict[str, AlarmExtractionResponse] = {}

# Initialize alarm type manager (JSON file-based storage)
alarm_manager = AlarmTypeManager()

# Initialize license manager
license_manager = LicenseManager()

# ================================
# FastAPI Application Setup
# ================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management"""
    # Startup
    logging.info("[STARTUP] Mining Truck Alarm Analysis API v1.0.0")
    yield
    # Shutdown
    logging.info("[SHUTDOWN] Closing alarm analysis API")

app = FastAPI(
    title="Mining Truck Alarm Analysis API",
    description="Extract and analyze mining truck alarm events with telemetry data",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for network access
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Setup logging
# Configure logging to both console and file
import os
os.makedirs('logs', exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout),  # Console output
        logging.FileHandler('logs/backend.log', encoding='utf-8')  # File output
    ]
)
logger = logging.getLogger(__name__)

# Also log to console when running as executable
if hasattr(sys, 'frozen'):  # Running as PyInstaller executable
    print("Backend starting - logging to console and logs/backend.log")
    logging.info("Backend executable started - logging enabled")

# ================================
# Exception Handlers
# ================================

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle validation errors and log them"""
    logger.error(f"Validation error for {request.method} {request.url}: {exc.errors()}")
    logger.error(f"Request body: {await request.body()}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": str(exc.body)}
    )

# ================================
# Utility Functions
# ================================

def create_extraction_job(request: AlarmExtractionRequest) -> str:
    """Create a new extraction job and return job ID"""
    job_id = str(uuid.uuid4())
    
    active_extractions[job_id] = {
        'status': 'pending',
        'message': 'Extraction job created',
        'progress': 0,
        'start_time': datetime.utcnow(),
        'request': request,
        'alarm_events': [],
        'current_operation': 'Initializing alarm extraction'
    }
    
    logger.info(f"Created extraction job {job_id}")
    return job_id

async def run_alarm_extraction(job_id: str):
    """Run alarm extraction in background"""
    try:
        job_data = active_extractions[job_id]
        request = job_data['request']
        
        # Update status
        active_extractions[job_id].update({
            'status': 'running',
            'message': 'Connecting to InfluxDB...',
            'progress': 10,
            'current_operation': 'Establishing InfluxDB connection'
        })
        
        # Initialize alarm extractor with custom alarm types and extraction settings
        custom_types = alarm_manager.get_current_alarm_types()
        extraction_settings = alarm_manager.get_extraction_settings()

        extractor = AlarmDataExtractor(
            host=request.influxdb_config.host,
            port=request.influxdb_config.port,
            database=request.influxdb_config.database,
            custom_alarm_types=custom_types,
            query_delay=extraction_settings.get('query_delay_seconds', 0.1),
            max_points_per_query=extraction_settings.get('max_points_per_query', 1000),
            telemetry_window=extraction_settings.get('telemetry_window_seconds', 0.5)
        )

        
        # Connect to InfluxDB
        if not extractor.connect():
            raise Exception("Failed to connect to InfluxDB")
        
        active_extractions[job_id].update({
            'message': 'Connected to InfluxDB, extracting alarm events...',
            'progress': 20,
            'current_operation': 'Extracting alarm events from time range'
        })
        
        try:
            # Extract alarm events
            start_time = time.time()

            alarm_events_raw = extractor.extract_alarm_events(
                start_time=request.time_range.start,
                end_time=request.time_range.end,
                selected_alarms=request.alarm_filter.selected_alarms,
                selected_vehicles=request.alarm_filter.selected_vehicles,
                max_hours=30.0
            )
            
            extraction_time = time.time() - start_time
            
            # Convert raw events to Pydantic models
            alarm_events = []
            for event_raw in alarm_events_raw:
                telemetry = AlarmTelemetry(
                    latitude=event_raw.get('latitude'),
                    longitude=event_raw.get('longitude'),
                    speed_kmh=event_raw.get('speed_kmh'),
                    off_path_error_m=event_raw.get('off_path_error_m'),
                    pitch_min_deg=event_raw.get('pitch_min_deg'),
                    pitch_max_deg=event_raw.get('pitch_max_deg'),
                    roll_min_deg=event_raw.get('roll_min_deg'),
                    roll_max_deg=event_raw.get('roll_max_deg')
                )
                
                alarm_event = AlarmEvent(
                    alarm_type=event_raw['alarm_type'],
                    vehicle=event_raw['vehicle'],
                    timestamp=event_raw['timestamp'],
                    title=event_raw['title'],
                    telemetry=telemetry
                )
                alarm_events.append(alarm_event)
            
            # Create summary statistics
            unique_vehicles = list(set(event['vehicle'] for event in alarm_events_raw))
            alarm_types_found = list(set(event['alarm_type'] for event in alarm_events_raw))
            
            summary = {
                'total_events': len(alarm_events),
                'unique_vehicles': len(unique_vehicles),
                'vehicles': unique_vehicles,
                'alarm_types_found': alarm_types_found,
                'time_range': f"{(request.time_range.end - request.time_range.start).total_seconds() / 3600:.1f} hours",
                'extraction_duration': f"{extraction_time:.1f} seconds"
            }
            
            # Create final response
            response = AlarmExtractionResponse(
                status="success",
                message=f"Successfully extracted {len(alarm_events)} alarm events",
                alarm_events=alarm_events,
                summary=summary,
                extraction_time=extraction_time
            )
            
            # Store result and update job status
            extraction_results[job_id] = response
            active_extractions[job_id].update({
                'status': 'completed',
                'message': f'Completed: {len(alarm_events)} alarm events extracted',
                'progress': 100,
                'alarm_events': alarm_events,
                'summary': summary,
                'current_operation': 'Alarm extraction completed successfully'
            })

            # Cleanup extractor instance
            try:
                extractor.disconnect()
            except Exception as e:
                logger.warning(f"Error disconnecting extractor after completion: {e}")
            
            logger.info(f"Extraction job {job_id} completed successfully: {len(alarm_events)} events")
            
        finally:
            extractor.disconnect()
            
    except Exception as e:
        error_msg = f"Extraction failed: {str(e)}"
        logger.error(f"Job {job_id} failed: {error_msg}")
        
        active_extractions[job_id].update({
            'status': 'failed',
            'message': error_msg,
            'current_operation': f'Failed: {str(e)}'
        })

        # Cleanup extractor instance on failure
        try:
            extractor.disconnect()
        except Exception as cleanup_error:
            logger.warning(f"Error disconnecting extractor after failure: {cleanup_error}")

# ================================
# API Endpoints
# ================================

@app.get("/")
async def root():
    """Health check endpoint"""
    try:
        return {
            "status": "healthy",
            "message": "Mining Truck Alarm Analysis API is running",
            "timestamp": datetime.utcnow().isoformat(),
            "version": "1.0.0",
            "active_extractions": len(active_extractions)
        }
    except Exception as e:
        logger.error(f"Health check error: {e}")
        return {"status": "error", "message": str(e)}

@app.post("/extract-data", response_model=Dict[str, str])
async def extract_alarm_data(
    request: AlarmExtractionRequest
):
    """Start alarm data extraction"""
    try:
        logger.info(f"Received extraction request: {request}")

        # Validate request
        if not request.alarm_filter.selected_alarms:
            raise HTTPException(
                status_code=400,
                detail="At least one alarm type must be selected"
            )

        # Create extraction job
        job_id = create_extraction_job(request)
        logger.info(f"Created extraction job {job_id}")

        # Start truly async extraction using asyncio.create_task
        import asyncio
        asyncio.create_task(run_alarm_extraction(job_id))
        logger.info(f"Started async extraction task for job {job_id}")

        return {
            "status": "started",
            "job_id": job_id,
            "message": "Alarm extraction started successfully"
        }
        
    except Exception as e:
        logger.error(f"Failed to start extraction: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to start extraction: {str(e)}")

@app.get("/extract/{job_id}")
async def get_extraction_status(job_id: str):
    """Get extraction job status"""
    if job_id not in active_extractions:
        raise HTTPException(status_code=404, detail="Extraction job not found")
    
    job_data = active_extractions[job_id]
    
    return {
        "status": job_data.get('status', 'unknown'),
        "message": job_data.get('message', ''),
        "progress": job_data.get('progress', 0),
        "current_operation": job_data.get('current_operation', ''),
        "alarm_events_found": len(job_data.get('alarm_events', [])),
        "vehicles_found": len(set(event.vehicle for event in job_data.get('alarm_events', []))),
        "data_points_extracted": len(job_data.get('alarm_events', []))  # For compatibility with frontend
    }


@app.get("/results/{job_id}", response_model=AlarmExtractionResponse)
async def get_extraction_results(job_id: str):
    """Get extraction results"""
    if job_id not in extraction_results:
        raise HTTPException(status_code=404, detail="Extraction results not found")
    
    return extraction_results[job_id]

@app.get("/trucks")
async def get_available_trucks():
    """Get available trucks from recent extractions"""
    # For alarm analysis, we return vehicles from recent extraction results
    all_vehicles = set()
    
    for result in extraction_results.values():
        if result.summary and 'vehicles' in result.summary:
            all_vehicles.update(result.summary['vehicles'])
    
    vehicles = [
        {
            "vehicle_id": vehicle,
            "vehicle_type": "autonomous"  # All alarm analysis vehicles are autonomous
        }
        for vehicle in sorted(all_vehicles)
    ]
    
    return {
        "vehicles": vehicles,
        "count": len(vehicles),
        "status": "success"
    }

@app.get("/data/{vehicle_id}")
async def get_vehicle_alarm_data(vehicle_id: str):
    """Get alarm data for specific vehicle"""
    vehicle_alarms = []
    
    # Collect alarms for this vehicle from all extraction results
    for result in extraction_results.values():
        for event in result.alarm_events:
            if event.vehicle == vehicle_id:
                # Convert to format compatible with existing map component
                alarm_data = {
                    "vehicle_id": event.vehicle,
                    "timestamp": event.timestamp.isoformat(),
                    "latitude": event.telemetry.latitude,
                    "longitude": event.telemetry.longitude,
                    "speed_kmh": event.telemetry.speed_kmh,
                    "alarm_type": event.alarm_type,
                    "alarm_title": event.title,
                    "off_path_error_m": event.telemetry.off_path_error_m,
                    "pitch_deg": event.telemetry.pitch_max_deg,  # Use max for single value
                    "roll_deg": event.telemetry.roll_max_deg     # Use max for single value
                }
                vehicle_alarms.append(alarm_data)
    
    return {
        "data": sorted(vehicle_alarms, key=lambda x: x["timestamp"]),
        "count": len(vehicle_alarms),
        "vehicle_id": vehicle_id
    }

@app.get("/alarms/{vehicle_id}")
async def get_vehicle_alarms(vehicle_id: str):
    """Get alarm-specific data for vehicle"""
    vehicle_alarms = []
    
    for result in extraction_results.values():
        for event in result.alarm_events:
            if event.vehicle == vehicle_id:
                vehicle_alarms.append({
                    "alarm_id": f"{event.vehicle}_{event.timestamp.isoformat()}",
                    "alarm_type": event.alarm_type,
                    "timestamp": event.timestamp.isoformat(),
                    "vehicle_id": event.vehicle,
                    "location": {
                        "latitude": event.telemetry.latitude,
                        "longitude": event.telemetry.longitude
                    },
                    "telemetry": {
                        "speed_kmh": event.telemetry.speed_kmh,
                        "off_path_error_m": event.telemetry.off_path_error_m,
                        "pitch_deg": event.telemetry.pitch_max_deg,
                        "roll_deg": event.telemetry.roll_max_deg
                    },
                    "title": event.title,
                    "severity": "warning"  # Default severity for alarm analysis
                })
    
    return {
        "alarms": sorted(vehicle_alarms, key=lambda x: x["timestamp"]),
        "count": len(vehicle_alarms),
        "vehicle_id": vehicle_id
    }

@app.delete("/clear-database")
async def clear_extraction_data():
    """Clear stored extraction data"""
    global active_extractions, extraction_results
    
    cleared_extractions = len(active_extractions)
    cleared_results = len(extraction_results)
    
    active_extractions.clear()
    extraction_results.clear()
    
    return {
        "status": "success",
        "message": f"Cleared {cleared_extractions} active extractions and {cleared_results} stored results",
        "total_records_cleared": cleared_extractions + cleared_results
    }

@app.delete("/clear-logs")
async def clear_logs():
    """Clear application logs"""
    import os
    import glob

    try:
        logs_cleared = 0

        # Clear logs in the backend/logs directory
        logs_dir = os.path.join(os.path.dirname(__file__), 'logs')
        if os.path.exists(logs_dir):
            log_files = glob.glob(os.path.join(logs_dir, '*.log'))
            for log_file in log_files:
                try:
                    # Clear the file content instead of deleting to avoid permission issues
                    with open(log_file, 'w') as f:
                        f.write('')
                    logs_cleared += 1
                    logger.info(f"Cleared log file: {log_file}")
                except Exception as e:
                    logger.warning(f"Could not clear log file {log_file}: {e}")

        # Clear any root level log files
        root_log_files = glob.glob(os.path.join(os.path.dirname(__file__), '*.log'))
        for log_file in root_log_files:
            try:
                with open(log_file, 'w') as f:
                    f.write('')
                logs_cleared += 1
                logger.info(f"Cleared root log file: {log_file}")
            except Exception as e:
                logger.warning(f"Could not clear root log file {log_file}: {e}")

        message = f"Successfully cleared {logs_cleared} log files"
        logger.info(f"LOG CLEARING: {message}")

        return {
            "status": "success",
            "message": message,
            "files_cleared": logs_cleared
        }

    except Exception as e:
        error_msg = f"Failed to clear logs: {str(e)}"
        logger.error(f"LOG CLEARING ERROR: {error_msg}")
        return {
            "status": "error",
            "message": error_msg,
            "files_cleared": 0
        }

@app.post("/frontend-log")
async def save_frontend_log(log_data: dict):
    """Save frontend log entry to file"""
    try:
        import os
        os.makedirs('logs', exist_ok=True)

        with open('logs/frontend.log', 'a', encoding='utf-8') as f:
            timestamp = log_data.get('timestamp', '')
            level = log_data.get('level', 'info').upper()
            component = log_data.get('component', 'unknown')
            action = log_data.get('action', 'unknown')
            message = log_data.get('message', '')

            f.write(f"{timestamp} - FRONTEND-{level} - {component}::{action} - {message}\n")

        return {"status": "success"}
    except Exception as e:
        logging.error(f"Failed to save frontend log: {e}")
        return {"status": "error", "message": str(e)}

# ================================
# Alarm Type Management Endpoints
# ================================

@app.get("/alarm-types")
async def get_alarm_types():
    """Get current list of configured alarm types"""
    try:
        current_types = alarm_manager.get_current_alarm_types()
        default_types = alarm_manager.get_default_alarm_types()
        stats = alarm_manager.get_stats()
        
        return {
            "status": "success",
            "data": {
                "current_alarm_types": current_types,
                "default_alarm_types": default_types,
                "is_using_defaults": stats["is_using_defaults"],
                "total_count": len(current_types),
                "stats": stats
            }
        }
    except Exception as e:
        logger.error(f"Error getting alarm types: {e}")
        return {
            "status": "error",
            "message": f"Failed to get alarm types: {str(e)}"
        }

@app.get("/alarm-types/defaults")
async def get_default_alarm_types():
    """Get factory default alarm types"""
    try:
        default_types = alarm_manager.get_default_alarm_types()
        return {
            "status": "success",
            "data": {
                "default_alarm_types": default_types,
                "count": len(default_types)
            }
        }
    except Exception as e:
        logger.error(f"Error getting default alarm types: {e}")
        return {
            "status": "error",
            "message": f"Failed to get default alarm types: {str(e)}"
        }

@app.post("/alarm-types")
async def set_alarm_types(request: Dict[str, List[str]]):
    """Set custom alarm types list"""
    try:
        alarm_types = request.get("alarm_types", [])
        
        if not isinstance(alarm_types, list):
            raise HTTPException(status_code=400, detail="alarm_types must be a list")
        
        # Validate alarm types
        valid_types = []
        for alarm_type in alarm_types:
            if isinstance(alarm_type, str) and len(alarm_type.strip()) > 0:
                valid_types.append(alarm_type.strip())
        
        if not valid_types:
            raise HTTPException(status_code=400, detail="No valid alarm types provided")
        
        # Update alarm types using manager
        success = alarm_manager.set_alarm_types(valid_types)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to save alarm types to configuration")
        
        logger.info(f"Updated alarm types: {len(valid_types)} types configured")
        
        return {
            "status": "success",
            "message": f"Successfully configured {len(valid_types)} alarm types",
            "data": {
                "alarm_types": valid_types,
                "count": len(valid_types)
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to set alarm types: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to set alarm types: {str(e)}")

@app.post("/alarm-types/add")
async def add_alarm_type(request: Dict[str, str]):
    """Add a new alarm type to the current list"""
    try:
        alarm_type = request.get("alarm_type", "").strip()
        
        if not alarm_type:
            raise HTTPException(status_code=400, detail="alarm_type is required")
        
        # Check if already exists
        current_types = alarm_manager.get_current_alarm_types()
        if alarm_type in current_types:
            raise HTTPException(status_code=409, detail=f"Alarm type '{alarm_type}' already exists")
        
        # Add using manager
        success = alarm_manager.add_alarm_type(alarm_type)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to add alarm type to configuration")
        
        logger.info(f"Added new alarm type: '{alarm_type}'")
        updated_types = alarm_manager.get_current_alarm_types()
        
        return {
            "status": "success",
            "message": f"Successfully added alarm type: '{alarm_type}'",
            "data": {
                "alarm_types": updated_types,
                "count": len(updated_types)
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to add alarm type: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to add alarm type: {str(e)}")

@app.delete("/alarm-types/{alarm_type}")
async def remove_alarm_type(alarm_type: str):
    """Remove an alarm type from the current list"""
    try:
        alarm_type = alarm_type.strip()
        
        # Check if exists
        current_types = alarm_manager.get_current_alarm_types()
        if not current_types:
            raise HTTPException(status_code=404, detail="No alarm types configured")
        
        if alarm_type not in current_types:
            raise HTTPException(status_code=404, detail=f"Alarm type '{alarm_type}' not found")
        
        # Remove using manager
        success = alarm_manager.remove_alarm_type(alarm_type)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to remove alarm type from configuration")
        
        logger.info(f"Removed alarm type: '{alarm_type}'")
        updated_types = alarm_manager.get_current_alarm_types()
        
        return {
            "status": "success",
            "message": f"Successfully removed alarm type: '{alarm_type}'",
            "data": {
                "alarm_types": updated_types,
                "count": len(updated_types)
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to remove alarm type: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to remove alarm type: {str(e)}")

@app.post("/alarm-types/reset")
async def reset_alarm_types():
    """Reset alarm types to factory defaults"""
    try:
        # Reset to defaults using manager
        success = alarm_manager.reset_to_defaults()
        if not success:
            raise HTTPException(status_code=500, detail="Failed to reset alarm types to defaults")
        
        logger.info("Reset alarm types to factory defaults")
        default_types = alarm_manager.get_default_alarm_types()
        
        return {
            "status": "success",
            "message": "Successfully reset alarm types to factory defaults",
            "data": {
                "alarm_types": default_types,
                "count": len(default_types),
                "is_using_defaults": True
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to reset alarm types: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to reset alarm types: {str(e)}")

# ================================
# Extraction Settings Endpoints
# ================================

@app.get("/extraction-settings")
async def get_extraction_settings():
    """Get current extraction settings"""
    try:
        settings = alarm_manager.get_extraction_settings()
        return {
            "status": "success",
            "data": {
                "extraction_settings": settings
            }
        }
    except Exception as e:
        logger.error(f"Error getting extraction settings: {e}")
        return {
            "status": "error",
            "message": f"Failed to get extraction settings: {str(e)}"
        }

@app.post("/extraction-settings")
async def update_extraction_settings(request: Dict):
    """Update extraction settings"""
    try:
        settings = request.get("extraction_settings", {})

        if not isinstance(settings, dict):
            raise HTTPException(status_code=400, detail="extraction_settings must be a dictionary")

        # Update settings using manager
        success = alarm_manager.update_extraction_settings(settings)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to save extraction settings to configuration")

        logger.info(f"Updated extraction settings: {settings}")

        return {
            "status": "success",
            "message": "Successfully updated extraction settings",
            "data": {
                "extraction_settings": settings
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update extraction settings: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update extraction settings: {str(e)}")

# ================================
# License Management Endpoints
# ================================

@app.post("/validate-license")
async def validate_license(request: Dict[str, str]):
    """Validate a license key"""
    try:
        license_key = request.get("license_key", "").strip()
        if not license_key:
            raise HTTPException(status_code=400, detail="License key is required")

        validation = license_manager.validate_license(license_key)

        return {
            "status": "success" if validation["valid"] else "error",
            "message": validation["reason"],
            "data": {
                "valid": validation["valid"],
                "user_type": validation.get("user_type", "regular"),
                "expires": validation.get("expires"),
                "mac_bound": validation.get("mac_bound"),
                "name": validation.get("name", "Unknown User")
            }
        }

    except Exception as e:
        logger.error(f"License validation error: {e}")
        raise HTTPException(status_code=500, detail=f"License validation failed: {str(e)}")

@app.get("/license-info")
async def get_license_info(license_key: str):
    """Get detailed license information (admin only)"""
    try:
        # Check if request is from admin
        admin_validation = license_manager.validate_license(license_key)
        if not admin_validation.get("valid") or admin_validation.get("user_type") != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")

        # Return all licenses for admin
        licenses = license_manager.list_all_licenses()

        return {
            "status": "success",
            "data": {
                "licenses": licenses,
                "total_count": len(licenses)
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting license info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get license info: {str(e)}")

@app.post("/generate-license")
async def generate_license(request: Dict[str, str], admin_key: str):
    """Generate a new license key (admin only)"""
    try:
        # Validate admin access
        admin_validation = license_manager.validate_license(admin_key)
        if not admin_validation.get("valid") or admin_validation.get("user_type") != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")

        name = request.get("name", "").strip()
        mac_address = request.get("mac_address", "").strip()
        expiry_date = request.get("expiry_date", "").strip()
        user_id = request.get("user_id", "").strip()

        if not all([name, mac_address, expiry_date]):
            raise HTTPException(status_code=400, detail="Name, MAC address, and expiry date are required")

        # Generate license key
        license_key = license_manager.generate_license_key(name, mac_address, expiry_date, user_id or None)

        # Add to license database
        success = license_manager.add_license(license_key, name, mac_address, expiry_date)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to add license to database")

        logger.info(f"Generated new license for {name}: {license_key}")

        return {
            "status": "success",
            "message": f"License generated for {name}",
            "data": {
                "license_key": license_key,
                "name": name,
                "mac_address": mac_address,
                "expiry_date": expiry_date
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"License generation error: {e}")
        raise HTTPException(status_code=500, detail=f"License generation failed: {str(e)}")

@app.get("/system-info")
async def get_system_info():
    """Get system MAC addresses for license binding"""
    try:
        mac_addresses = license_manager.get_machine_mac_addresses()

        return {
            "status": "success",
            "data": {
                "mac_addresses": mac_addresses,
                "primary_mac": mac_addresses[0] if mac_addresses else None,
                "total_adapters": len(mac_addresses)
            }
        }

    except Exception as e:
        logger.error(f"Error getting system info: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get system info: {str(e)}")

# ================================
# Data Export Endpoints
# ================================

class ExportRequest(BaseModel):
    """Request model for CSV export"""
    vehicle_ids: Optional[List[str]] = None
    alarm_types: Optional[List[str]] = None
    geo_json_data: Optional[Dict[str, Any]] = None

def point_in_polygon(point_lat: float, point_lon: float, polygon_coords: List[List[float]]) -> bool:
    """Check if a point is inside a polygon using ray casting algorithm"""
    x, y = point_lon, point_lat
    n = len(polygon_coords)
    inside = False

    p1x, p1y = polygon_coords[0]
    for i in range(1, n + 1):
        p2x, p2y = polygon_coords[i % n]
        if y > min(p1y, p2y):
            if y <= max(p1y, p2y):
                if x <= max(p1x, p2x):
                    if p1y != p2y:
                        xinters = (y - p1y) * (p2x - p1x) / (p2y - p1y) + p1x
                    if p1x == p2x or x <= xinters:
                        inside = not inside
        p1x, p1y = p2x, p2y

    return inside

def find_shape_name(lat: float, lon: float, geo_json_data: Dict[str, Any]) -> str:
    """Find which shape (AsiName) contains the given coordinates"""
    if not geo_json_data or not lat or not lon:
        return ''

    try:
        features = geo_json_data.get('features', [])
        for feature in features:
            geometry = feature.get('geometry', {})
            properties = feature.get('properties', {})

            if geometry.get('type') == 'Polygon':
                coords = geometry.get('coordinates', [[]])
                if coords and len(coords) > 0:
                    # Check if point is in this polygon
                    if point_in_polygon(lat, lon, coords[0]):
                        # Return AsiName or fallback to other name properties
                        return (properties.get('AsiName') or
                               properties.get('Name') or
                               properties.get('name') or
                               'Unnamed Shape')

            elif geometry.get('type') == 'MultiPolygon':
                multi_coords = geometry.get('coordinates', [])
                for polygon_coords in multi_coords:
                    if polygon_coords and len(polygon_coords) > 0:
                        if point_in_polygon(lat, lon, polygon_coords[0]):
                            return (properties.get('AsiName') or
                                   properties.get('Name') or
                                   properties.get('name') or
                                   'Unnamed Shape')

        return ''  # Point not found in any shape

    except Exception as e:
        logger.warning(f"Error finding shape name for coordinates ({lat}, {lon}): {e}")
        return ''

@app.get("/export-data")
async def get_export_data(
    vehicle_ids: Optional[str] = None,
    alarm_types: Optional[str] = None
):
    """Get alarm data for export (processed by frontend)"""
    try:
        # Parse parameters
        selected_vehicles = []
        if vehicle_ids:
            selected_vehicles = [v.strip() for v in vehicle_ids.split(',') if v.strip()]

        selected_alarms = []
        if alarm_types:
            selected_alarms = [a.strip() for a in alarm_types.split(',') if a.strip()]

        logger.info(f"Export data request: {len(selected_vehicles)} vehicles, {len(selected_alarms)} alarms")

        # Collect all alarm events that match filters
        filtered_events = []

        for result in extraction_results.values():
            for event in result.alarm_events:
                # Filter by vehicle if specified
                if selected_vehicles and event.vehicle not in selected_vehicles:
                    continue

                # Filter by alarm type if specified
                if selected_alarms and event.alarm_type not in selected_alarms:
                    continue

                # Create event data for frontend processing
                event_data = {
                    'timestamp': event.timestamp.isoformat(),
                    'vehicle': event.vehicle,
                    'alarm_type': event.alarm_type,
                    'speed_kmh': event.telemetry.speed_kmh,
                    'off_path_error_m': event.telemetry.off_path_error_m,
                    'pitch_max_deg': event.telemetry.pitch_max_deg,
                    'roll_max_deg': event.telemetry.roll_max_deg,
                    'latitude': event.telemetry.latitude,
                    'longitude': event.telemetry.longitude
                }
                filtered_events.append(event_data)

        # Sort by timestamp
        filtered_events.sort(key=lambda x: x['timestamp'])

        logger.info(f"Returning {len(filtered_events)} alarm events for export")
        return filtered_events

    except Exception as e:
        logger.error(f"Error getting export data: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get export data: {str(e)}")

# ================================
# Application Entry Point
# ================================

if __name__ == "__main__":
    uvicorn.run(
        app,  # Direct app reference instead of "main:app"
        host="0.0.0.0",  # Allow connections from any IP
        port=9501,
        reload=False,  # Production mode - no reload
        log_level="info"
    )