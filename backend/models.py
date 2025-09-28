"""
Comprehensive Pydantic Models for Mining Truck ETL System

Production-ready data models with proper validation, type hints, and documentation
for all API requests and responses.
"""

from pydantic import BaseModel, Field, validator, root_validator
from typing import List, Optional, Dict, Any, Union, Literal
from datetime import datetime, timezone
from enum import Enum
import re

# ================================
# Enums for Type Safety
# ================================

class VehicleType(str, Enum):
    """Vehicle type enumeration"""
    AUTONOMOUS = "autonomous"
    MANUAL = "manual"

class ExtractionStatus(str, Enum):
    """Extraction job status enumeration"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class AlarmSeverity(str, Enum):
    """Alarm severity levels"""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"

class DataSourceType(str, Enum):
    """Data source type for responses"""
    RAW_DATA = "raw_data"
    PLAYBACK_DATA = "playback_data"
    COMBINED_DATA = "combined_data"

# ================================
# Configuration Models
# ================================

class InfluxDBConfig(BaseModel):
    """InfluxDB connection configuration with validation"""
    host: str = Field(..., description="InfluxDB host IP address or hostname", min_length=1, max_length=255)
    port: int = Field(8086, description="InfluxDB port", ge=1, le=65535)
    database: str = Field("MobiusLog", description="InfluxDB database name", min_length=1, max_length=64)
    username: Optional[str] = Field(None, description="InfluxDB username (if authentication required)")
    password: Optional[str] = Field(None, description="InfluxDB password (if authentication required)")
    ssl: bool = Field(False, description="Use SSL connection")
    timeout: int = Field(60, description="Query timeout in seconds", ge=5, le=300)

    @validator('host')
    def validate_host(cls, v):
        """Validate host format (IP address or hostname)"""
        # Basic validation for IP or hostname
        if not re.match(r'^[a-zA-Z0-9.-]+$', v):
            raise ValueError('Host must be a valid IP address or hostname')
        return v.strip()

    class Config:
        json_schema_extra = {
            "example": {
                "host": "10.84.117.22",
                "port": 8086,
                "database": "MobiusLog",
                "ssl": False,
                "timeout": 60
            }
        }

class TimeRange(BaseModel):
    """Time range for data extraction with comprehensive validation"""
    start: datetime = Field(..., description="Start time for data extraction (ISO format)")
    end: datetime = Field(..., description="End time for data extraction (ISO format)")

    @validator('start', 'end', pre=True)
    def parse_datetime(cls, v):
        """Parse datetime strings to datetime objects"""
        if isinstance(v, str):
            # Handle various ISO formats
            v = v.replace('Z', '+00:00')  # Convert Z suffix to timezone offset
            try:
                return datetime.fromisoformat(v)
            except ValueError:
                raise ValueError(f'Invalid datetime format: {v}. Use ISO format (e.g., "2024-01-15T10:30:00Z")')
        return v

    @validator('end')
    def validate_time_range(cls, v, values):
        """Validate that end time is after start time and within limits"""
        if 'start' in values:
            start = values['start']
            if v <= start:
                raise ValueError('End time must be after start time')
            
            duration_hours = (v - start).total_seconds() / 3600
            if duration_hours > 30:  # Alarm analysis limit
                raise ValueError(f'Time range cannot exceed 30 hours (got {duration_hours:.1f} hours)')
            
            if duration_hours < 0.002:  # Minimum 6 seconds (0.002 hours)
                raise ValueError('Time range must be at least 6 seconds')
        
        return v

    @property
    def duration_minutes(self) -> float:
        """Get duration in minutes"""
        return (self.end - self.start).total_seconds() / 60

    def to_utc(self) -> tuple[datetime, datetime]:
        """Convert to UTC timestamps for InfluxDB queries"""
        start_utc = self.start.astimezone(timezone.utc) if self.start.tzinfo else self.start.replace(tzinfo=timezone.utc)
        end_utc = self.end.astimezone(timezone.utc) if self.end.tzinfo else self.end.replace(tzinfo=timezone.utc)
        return start_utc, end_utc

    class Config:
        json_schema_extra = {
            "example": {
                "start": "2024-01-15T10:00:00Z",
                "end": "2024-01-15T10:30:00Z"
            }
        }

class AssetFilter(BaseModel):
    """Asset filtering configuration with validation"""
    include_autonomous: bool = Field(False, description="Include all autonomous trucks (DT prefix)")
    include_manual: bool = Field(False, description="Include all manual trucks")
    specific_assets: List[str] = Field(default_factory=list, description="Specific asset IDs to include")

    @validator('specific_assets')
    def validate_asset_ids(cls, v):
        """Validate asset ID format and limits"""
        if len(v) > 100:  # Reasonable limit
            raise ValueError('Too many specific assets (max 100 allowed)')
        
        validated_assets = []
        for asset_id in v:
            if not asset_id or not isinstance(asset_id, str):
                raise ValueError('Asset IDs must be non-empty strings')
            
            asset_id = asset_id.strip().upper()
            if len(asset_id) > 20:
                raise ValueError(f'Asset ID too long: {asset_id} (max 20 characters)')
            
            if not re.match(r'^[A-Z0-9_-]+$', asset_id):
                raise ValueError(f'Invalid asset ID format: {asset_id} (use alphanumeric, underscore, dash only)')
            
            validated_assets.append(asset_id)
        
        return validated_assets

    @root_validator(skip_on_failure=True)
    def validate_filter_criteria(cls, values):
        """Ensure at least one filter criterion is specified"""
        include_autonomous = values.get('include_autonomous', False)
        include_manual = values.get('include_manual', False)
        specific_assets = values.get('specific_assets', [])
        
        if not (include_autonomous or include_manual or specific_assets):
            raise ValueError('At least one filter criterion must be specified')
        
        return values

    class Config:
        json_schema_extra = {
            "example": {
                "include_autonomous": True,
                "include_manual": False,
                "specific_assets": ["DT059", "DT060"]
            }
        }

# ================================
# Request Models
# ================================

class DataExtractionRequest(BaseModel):
    """Complete data extraction request with full validation"""
    influxdb_config: InfluxDBConfig = Field(..., description="InfluxDB connection configuration")
    time_range: TimeRange = Field(..., description="Time range for data extraction")
    asset_filter: AssetFilter = Field(..., description="Asset filtering criteria")
    session_name: Optional[str] = Field(None, description="Optional session name for identification", max_length=100)

    @validator('session_name')
    def validate_session_name(cls, v):
        """Validate session name format"""
        if v is not None:
            v = v.strip()
            if not re.match(r'^[a-zA-Z0-9_\s-]+$', v):
                raise ValueError('Session name can only contain letters, numbers, spaces, underscores, and dashes')
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "influxdb_config": {
                    "host": "10.84.117.22",
                    "port": 8086,
                    "database": "MobiusLog"
                },
                "time_range": {
                    "start": "2024-01-15T10:00:00Z",
                    "end": "2024-01-15T10:30:00Z"
                },
                "asset_filter": {
                    "include_autonomous": True,
                    "specific_assets": ["DT059"]
                },
                "session_name": "Morning Test Run"
            }
        }

class PlaybackDataRequest(BaseModel):
    """Request for vehicle playback data"""
    vehicle_id: str = Field(..., description="Vehicle ID to get playback data for", min_length=1, max_length=20)
    session_id: Optional[str] = Field(None, description="Specific session ID (optional)")
    limit: Optional[int] = Field(None, description="Maximum number of data points to return", ge=1, le=100000)
    start_time: Optional[datetime] = Field(None, description="Filter data from this time (optional)")
    end_time: Optional[datetime] = Field(None, description="Filter data until this time (optional)")

    @validator('vehicle_id')
    def validate_vehicle_id(cls, v):
        """Validate vehicle ID format"""
        v = v.strip().upper()
        if not re.match(r'^[A-Z0-9_-]+$', v):
            raise ValueError('Invalid vehicle ID format')
        return v

class AlarmQueryRequest(BaseModel):
    """Request for vehicle alarm data"""
    vehicle_id: str = Field(..., description="Vehicle ID", min_length=1, max_length=20)
    session_id: Optional[str] = Field(None, description="Specific session ID (optional)")
    severity: Optional[AlarmSeverity] = Field(None, description="Filter by alarm severity")
    limit: Optional[int] = Field(None, description="Maximum number of alarms to return", ge=1, le=1000)

# ================================
# Response Models
# ================================

class VehicleInfo(BaseModel):
    """Vehicle information in responses"""
    vehicle_id: str = Field(..., description="Vehicle identifier")
    vehicle_type: VehicleType = Field(..., description="Vehicle type (autonomous or manual)")
    data_points: int = Field(..., description="Total number of data points available", ge=0)
    time_range: Dict[str, Optional[str]] = Field(..., description="Time range of available data")
    session_id: Optional[str] = Field(None, description="Session ID for this data")

    class Config:
        json_schema_extra = {
            "example": {
                "vehicle_id": "DT059",
                "vehicle_type": "autonomous",
                "data_points": 15420,
                "time_range": {
                    "start": "2024-01-15T10:00:00Z",
                    "end": "2024-01-15T10:30:00Z"
                },
                "session_id": "abc123-def456"
            }
        }

class VehicleListResponse(BaseModel):
    """Response for vehicle list endpoint"""
    vehicles: List[VehicleInfo] = Field(..., description="List of available vehicles")
    count: int = Field(..., description="Total number of vehicles", ge=0)
    status: str = Field("success", description="Response status")
    message: Optional[str] = Field(None, description="Additional information")
    data_source: DataSourceType = Field(..., description="Source of the data")

class PlaybackDataPoint(BaseModel):
    """Individual playback data point"""
    vehicle_id: str = Field(..., description="Vehicle identifier")
    timestamp: datetime = Field(..., description="Data point timestamp")
    latitude: float = Field(..., description="GPS latitude", ge=-90, le=90)
    longitude: float = Field(..., description="GPS longitude", ge=-180, le=180)
    speed_kmh: float = Field(..., description="Speed in km/h (negative for reverse)")
    offpath_deviation: Optional[float] = Field(None, description="Offpath deviation in meters")
    states: Optional[Dict[str, Optional[str]]] = Field(None, description="Vehicle state information")
    notifications: Optional[str] = Field(None, description="Notifications at this time")
    position_data: Optional[Dict[str, Any]] = Field(None, description="Additional position data for manual vehicles")

    class Config:
        json_schema_extra = {
            "example": {
                "vehicle_id": "DT059",
                "timestamp": "2024-01-15T10:15:30Z",
                "latitude": -31.8755,
                "longitude": 116.2245,
                "speed_kmh": 25.5,
                "offpath_deviation": 1.2,
                "states": {
                    "motion_controller": "FORWARD",
                    "asset_activity": "HAULING",
                    "haulage_state": "LOADED"
                }
            }
        }

class PlaybackDataResponse(BaseModel):
    """Response for vehicle playback data"""
    vehicle_id: str = Field(..., description="Vehicle identifier")
    vehicle_type: VehicleType = Field(..., description="Vehicle type")
    data: List[PlaybackDataPoint] = Field(..., description="Playback data points")
    count: int = Field(..., description="Number of data points returned", ge=0)
    session_id: Optional[str] = Field(None, description="Session ID for this data")
    time_range: Dict[str, Optional[str]] = Field(..., description="Actual time range of returned data")
    status: str = Field("success", description="Response status")

class AlarmInfo(BaseModel):
    """Alarm/notification information"""
    vehicle_id: str = Field(..., description="Vehicle identifier")
    timestamp: datetime = Field(..., description="Alarm timestamp")
    alarm_type: str = Field(..., description="Type of alarm")
    message: str = Field(..., description="Alarm message")
    severity: AlarmSeverity = Field(..., description="Alarm severity level")
    location: Optional[Dict[str, float]] = Field(None, description="GPS location when alarm occurred")
    speed_at_alarm_kmh: Optional[float] = Field(None, description="Vehicle speed when alarm occurred (negative for reverse)")
    states: Optional[Dict[str, Optional[str]]] = Field(None, description="Vehicle states when alarm occurred")

class AlarmListResponse(BaseModel):
    """Response for vehicle alarms"""
    vehicle_id: str = Field(..., description="Vehicle identifier")
    alarms: List[AlarmInfo] = Field(..., description="List of alarms")
    count: int = Field(..., description="Number of alarms returned", ge=0)
    statistics: Optional[Dict[str, Dict[str, int]]] = Field(None, description="Alarm statistics")
    status: str = Field("success", description="Response status")

class ExtractionJobStatus(BaseModel):
    """Comprehensive extraction job status"""
    job_id: str = Field(..., description="Extraction job identifier")
    session_id: str = Field(..., description="Data session identifier")
    status: ExtractionStatus = Field(..., description="Current job status")
    message: str = Field(..., description="Status message")
    progress: float = Field(..., description="Progress percentage", ge=0, le=100)
    started_at: Optional[datetime] = Field(None, description="Job start time")
    completed_at: Optional[datetime] = Field(None, description="Job completion time")
    error_details: Optional[str] = Field(None, description="Error details if failed")
    
    # Vehicle processing info
    vehicles_found: int = Field(0, description="Number of vehicles found", ge=0)
    vehicles_processed: int = Field(0, description="Number of vehicles processed", ge=0)
    current_vehicle: Optional[str] = Field(None, description="Currently processing vehicle")
    current_operation: Optional[str] = Field(None, description="Current operation description")
    current_measurement: Optional[str] = Field(None, description="Current measurement being extracted")
    
    # Data extraction counts
    data_points_extracted: int = Field(0, description="Total data points extracted", ge=0)
    raw_data_counts: Optional[Dict[str, int]] = Field(None, description="Breakdown by measurement type")
    
    # Performance metrics
    extraction_rate: Optional[float] = Field(None, description="Data points per second", ge=0)
    estimated_completion: Optional[datetime] = Field(None, description="Estimated completion time")

    @validator('progress')
    def validate_progress(cls, v):
        """Ensure progress is within valid range"""
        return max(0.0, min(100.0, v))

class ExtractionJobResponse(BaseModel):
    """Response for starting extraction job"""
    status: str = Field("started", description="Job start status")
    job_id: str = Field(..., description="Extraction job identifier")
    session_id: str = Field(..., description="Data session identifier")
    message: str = Field(..., description="Success message")
    estimated_duration_minutes: Optional[float] = Field(None, description="Estimated duration", ge=0)

class SystemLimitsResponse(BaseModel):
    """Response for system configuration limits"""
    max_extraction_duration_minutes: int = Field(..., description="Maximum extraction duration", ge=1)
    max_autonomous_vehicles: int = Field(..., description="Maximum autonomous vehicles per extraction", ge=1)
    max_manual_vehicles: int = Field(..., description="Maximum manual vehicles per extraction", ge=1)
    max_concurrent_extractions: int = Field(..., description="Maximum concurrent extraction jobs", ge=1)
    query_timeout_seconds: int = Field(..., description="InfluxDB query timeout", ge=5)
    data_retention_days: int = Field(..., description="Data retention period", ge=1)

class HealthCheckResponse(BaseModel):
    """Health check response"""
    status: Literal["healthy", "unhealthy"] = Field(..., description="System health status")
    database: Literal["connected", "disconnected"] = Field(..., description="Database connection status")
    timestamp: datetime = Field(..., description="Health check timestamp")
    version: str = Field("2.0.0", description="API version")
    uptime_seconds: Optional[float] = Field(None, description="System uptime in seconds", ge=0)
    active_extractions: Optional[int] = Field(None, description="Number of active extraction jobs", ge=0)

class ErrorResponse(BaseModel):
    """Standard error response"""
    error: str = Field(..., description="Error type")
    message: str = Field(..., description="Error message")
    details: Optional[str] = Field(None, description="Additional error details")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Error timestamp")
    request_id: Optional[str] = Field(None, description="Request identifier for tracking")

    class Config:
        json_schema_extra = {
            "example": {
                "error": "ValidationError",
                "message": "Invalid time range: end time must be after start time",
                "timestamp": "2024-01-15T10:30:00Z"
            }
        }

# ================================
# Database Statistics Models
# ================================

class DatabaseStatsResponse(BaseModel):
    """Database statistics response"""
    table_counts: Dict[str, int] = Field(..., description="Record counts by table")
    total_vehicles: int = Field(..., description="Total unique vehicles", ge=0)
    total_data_points: int = Field(..., description="Total data points across all tables", ge=0)
    database_size_mb: Optional[float] = Field(None, description="Database file size in MB", ge=0)
    oldest_data: Optional[datetime] = Field(None, description="Timestamp of oldest data")
    newest_data: Optional[datetime] = Field(None, description="Timestamp of newest data")
    active_sessions: int = Field(..., description="Number of active data sessions", ge=0)
    status: str = Field("success", description="Response status")

# ================================
# Utility Response Models
# ================================

class SuccessResponse(BaseModel):
    """Generic success response"""
    status: str = Field("success", description="Operation status")
    message: str = Field(..., description="Success message")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Response timestamp")
    data: Optional[Dict[str, Any]] = Field(None, description="Additional response data")

class SessionInfo(BaseModel):
    """Data session information"""
    session_id: str = Field(..., description="Session identifier")
    session_name: Optional[str] = Field(None, description="Human-readable session name")
    created_at: datetime = Field(..., description="Session creation time")
    vehicle_count: int = Field(..., description="Number of vehicles in session", ge=0)
    data_points: int = Field(..., description="Total data points in session", ge=0)
    time_range: Dict[str, Optional[str]] = Field(..., description="Time range of session data")
    extraction_duration: Optional[float] = Field(None, description="Extraction duration in minutes", ge=0)

class SessionListResponse(BaseModel):
    """Response for session list endpoint"""
    sessions: List[SessionInfo] = Field(..., description="List of available sessions")
    count: int = Field(..., description="Total number of sessions", ge=0)
    status: str = Field("success", description="Response status")

# ================================
# Alarm Analysis Models
# ================================

class AlarmFilter(BaseModel):
    """Alarm filter configuration for extraction"""
    selected_alarms: List[str] = Field(..., description="List of alarm types to extract", min_items=1)
    include_autonomous: bool = Field(True, description="Include all autonomous vehicles with alarms")
    selected_vehicles: Optional[List[str]] = Field(None, description="Specific vehicles to include (if not all)")
    
    @validator('selected_alarms')
    def validate_alarm_types(cls, v):
        """Validate that alarm types are not empty strings"""
        if not all(alarm.strip() for alarm in v):
            raise ValueError('Alarm types cannot be empty strings')
        return [alarm.strip() for alarm in v]

class AlarmExtractionRequest(BaseModel):
    """Request model for alarm data extraction"""
    influxdb_config: InfluxDBConfig = Field(..., description="InfluxDB connection configuration")
    time_range: TimeRange = Field(..., description="Time range for alarm extraction")
    alarm_filter: AlarmFilter = Field(..., description="Alarm types and vehicle filters")
    
    class Config:
        json_schema_extra = {
            "example": {
                "influxdb_config": {
                    "host": "10.84.126.5",
                    "port": 8086,
                    "database": "MobiusLog"
                },
                "time_range": {
                    "start": "2024-01-15T08:00:00Z",
                    "end": "2024-01-15T16:00:00Z"
                },
                "alarm_filter": {
                    "selected_alarms": ["Off Path", "Tilt exceeded with dump bed raised"],
                    "include_autonomous": True
                }
            }
        }

class AlarmTelemetry(BaseModel):
    """Telemetry data associated with an alarm event"""
    latitude: Optional[float] = Field(None, description="GPS latitude coordinate")
    longitude: Optional[float] = Field(None, description="GPS longitude coordinate")
    speed_kmh: Optional[float] = Field(None, description="Vehicle speed in km/h")
    off_path_error_m: Optional[float] = Field(None, description="Off-path error distance in meters")
    pitch_min_deg: Optional[float] = Field(None, description="Minimum pitch angle in degrees")
    pitch_max_deg: Optional[float] = Field(None, description="Maximum pitch angle in degrees")
    roll_min_deg: Optional[float] = Field(None, description="Minimum roll angle in degrees")
    roll_max_deg: Optional[float] = Field(None, description="Maximum roll angle in degrees")

class AlarmEvent(BaseModel):
    """Single alarm event with telemetry data"""
    alarm_type: str = Field(..., description="Type of alarm that occurred")
    vehicle: str = Field(..., description="Vehicle ID where alarm occurred")
    timestamp: datetime = Field(..., description="Timestamp when alarm occurred")
    title: str = Field(..., description="Full alarm title from InfluxDB")
    telemetry: AlarmTelemetry = Field(..., description="Associated telemetry data")

class AlarmExtractionResponse(BaseModel):
    """Response model for alarm extraction"""
    status: str = Field("success", description="Extraction status")
    message: str = Field(..., description="Extraction result message")
    alarm_events: List[AlarmEvent] = Field([], description="List of extracted alarm events")
    summary: Dict[str, Any] = Field(default_factory=dict, description="Extraction summary statistics")
    extraction_time: float = Field(..., description="Extraction duration in seconds")
    
    class Config:
        json_schema_extra = {
            "example": {
                "status": "success",
                "message": "Successfully extracted 12 alarm events",
                "alarm_events": [
                    {
                        "alarm_type": "Off Path",
                        "vehicle": "DT025",
                        "timestamp": "2024-01-15T10:30:00Z",
                        "title": "Vehicle Off Path - Speed Reduced",
                        "telemetry": {
                            "latitude": -22.453158,
                            "longitude": 119.890514,
                            "speed_kmh": 15.2,
                            "off_path_error_m": 2.5,
                            "pitch_min_deg": -1.2,
                            "pitch_max_deg": 1.8,
                            "roll_min_deg": -0.5,
                            "roll_max_deg": 0.8
                        }
                    }
                ],
                "summary": {
                    "total_events": 12,
                    "unique_vehicles": 3,
                    "alarm_types_found": ["Off Path", "Tilt exceeded with dump bed raised"],
                    "time_range": "8 hours"
                },
                "extraction_time": 45.2
            }
        }