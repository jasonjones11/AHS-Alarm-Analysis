#!/usr/bin/env python3
"""
Mining Truck Alarm Analysis - Lightweight Data Extractor
Simple, InfluxDB-safe alarm extraction with rate limiting
"""

import time
import logging
import threading
import signal
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any, Callable
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from influxdb import InfluxDBClient
import pandas as pd

class AlarmDataExtractor:
    """Lightweight alarm data extractor with InfluxDB protection"""
    
    def __init__(self, host: str, port: int = 8086, database: str = "MobiusLog", custom_alarm_types: List[str] = None, query_delay: float = 0.1, max_points_per_query: int = 1000, telemetry_window: float = 0.5):
        self.host = host
        self.port = port
        self.database = database
        self.client = None
        self.deg_factor = 0.0174444  # Radian to degree conversion
        self.cancelled = False
        self.query_timeout = 10  # Reduced to 10 seconds for better responsiveness
        self.thread_pool = ThreadPoolExecutor(max_workers=1)  # Single worker for InfluxDB queries

        # Default alarm types for autonomous trucks (can be overridden)
        self.DEFAULT_ALARM_TYPES = [
            "Dump Bed Cannot Be Raised While Vehicle Tilted",
            "Tilt exceeded with dump bed raised",
            "Off Path",
            "Steering Restricted",
            "Bump Detected: Dump",
            "Bump Detected: Close",
            "Undocumented Error c419",
            "Failed to Drive When Commanded",
            "Slippery Conditions Caused Vehicle To Stop"
        ]

        # Use custom alarm types if provided, otherwise use defaults
        self.ALARM_TYPES = custom_alarm_types if custom_alarm_types is not None else self.DEFAULT_ALARM_TYPES.copy()

        # Performance optimization settings to protect InfluxDB
        # Configurable rate limiting - adjust based on InfluxDB server capacity
        self.query_delay = query_delay  # Configurable delay between queries
        self.max_points_per_query = max_points_per_query  # Limit data points per telemetry query
        self.telemetry_window = telemetry_window  # Time window for telemetry data (seconds)
        
        logging.basicConfig(level=logging.INFO)
        self.logger = logging.getLogger(__name__)
    
    def connect(self) -> bool:
        """Connect to InfluxDB server with timeout support"""
        try:
            # Create client with timeout support
            self.client = InfluxDBClient(
                host=self.host,
                port=self.port,
                timeout=self.query_timeout
            )
            self.client.switch_database(self.database)

            # Test connection
            self._execute_query_with_cancellation("SHOW MEASUREMENTS LIMIT 1", "connection_test")
            self.logger.info(f"Connected to InfluxDB at {self.host}:{self.port}")
            return True

        except Exception as e:
            self.logger.error(f"Failed to connect to InfluxDB: {e}")
            return False

    def cancel(self):
        """Cancel the current extraction"""
        self.cancelled = True
        self.logger.info("Extraction cancellation requested")

    def is_cancelled(self) -> bool:
        """Check if extraction has been cancelled"""
        return self.cancelled

    def _execute_query_with_cancellation(self, query: str, query_name: str = "query"):
        """
        Execute InfluxDB query with proper cancellation support
        Returns result or raises exception if cancelled
        """
        if self.cancelled:
            raise Exception(f"Extraction cancelled before {query_name}")

        def run_query():
            return self.client.query(query)

        try:
            # Submit query to thread pool with timeout
            future = self.thread_pool.submit(run_query)

            # Wait for result with timeout, checking cancellation every 2 seconds
            timeout_interval = 2  # Check every 2 seconds
            total_timeout = self.query_timeout

            for elapsed in range(0, total_timeout, timeout_interval):
                if self.cancelled:
                    future.cancel()
                    raise Exception(f"Extraction cancelled during {query_name}")

                try:
                    result = future.result(timeout=timeout_interval)
                    return result
                except FutureTimeoutError:
                    # Continue waiting, will check cancellation in next iteration
                    continue

            # Final timeout - one last attempt
            if not self.cancelled:
                return future.result(timeout=1)
            else:
                future.cancel()
                raise Exception(f"Extraction cancelled during {query_name}")

        except FutureTimeoutError:
            raise Exception(f"Query timeout after {total_timeout}s: {query_name}")
        except Exception as e:
            if self.cancelled or "cancelled" in str(e).lower():
                raise Exception(f"Extraction cancelled during {query_name}")
            raise
    
    def disconnect(self):
        """Close InfluxDB connection and cleanup thread pool"""
        if self.client:
            self.client.close()
            self.logger.info("InfluxDB connection closed")

        # Shutdown thread pool gracefully
        if hasattr(self, 'thread_pool'):
            self.thread_pool.shutdown(wait=False)  # Don't wait for running queries
            self.logger.info("Thread pool shutdown")

    def _query_with_cancellation(self, query: str, query_name: str = "query"):
        """Execute InfluxDB query with cancellation support"""
        if self.cancelled:
            raise Exception(f"Extraction cancelled before {query_name}")

        try:
            self.logger.debug(f"Executing {query_name}...")
            result = self._execute_query_with_cancellation(query, query_name)

            if self.cancelled:
                raise Exception(f"Extraction cancelled during {query_name}")

            return result

        except Exception as e:
            if self.cancelled:
                raise Exception(f"Extraction cancelled during {query_name}")
            raise e
    
    def extract_alarm_events(self,
                           start_time: datetime,
                           end_time: datetime,
                           selected_alarms: List[str],
                           selected_vehicles: Optional[List[str]] = None,
                           max_hours: float = 30.0,
                           cancellation_check=None) -> List[Dict[str, Any]]:
        """
        Extract alarm events with robust cancellation support
        Returns list of alarm events with basic telemetry
        """

        # Reset cancellation state for new extraction
        self.cancelled = False

        # Validate time range
        duration_hours = (end_time - start_time).total_seconds() / 3600
        if duration_hours > max_hours:
            raise ValueError(f"Time range ({duration_hours:.1f}h) exceeds maximum {max_hours}h")

        if not self.client:
            raise RuntimeError("Not connected to InfluxDB")

        self.logger.info(f"Extracting alarms for {duration_hours:.1f} hours")

        try:
            # Step 1: Get alarm timestamps with cancellation support
            alarm_events = self._get_alarm_timestamps_with_cancellation(
                start_time, end_time, selected_alarms, selected_vehicles, cancellation_check
            )

            if not alarm_events:
                self.logger.warning("No alarm events found in time range")
                return []

            self.logger.info(f"Found {len(alarm_events)} alarm events")

            # Step 2: Enrich with telemetry data
            enriched_events = []
            for i, event in enumerate(alarm_events):
                # Check for cancellation from both internal state and external callback
                if self.cancelled or (cancellation_check and cancellation_check()):
                    self.logger.info("Extraction cancelled by user")
                    raise Exception("Extraction cancelled by user")

                self.logger.info(f"Processing event {i+1}/{len(alarm_events)}: {event['vehicle']} at {event['timestamp']}")

                # Get telemetry for this specific timestamp with cancellation support
                telemetry = self._get_telemetry_at_timestamp_with_cancellation(
                    event['vehicle'], event['timestamp'], cancellation_check
                )

                # Combine alarm info with telemetry
                enriched_event = {
                    **event,
                    **telemetry
                }
                enriched_events.append(enriched_event)

                # Rate limiting to protect InfluxDB
                time.sleep(self.query_delay)

            self.logger.info(f"Successfully extracted {len(enriched_events)} alarm events with telemetry")
            return enriched_events

        except Exception as e:
            if self.cancelled or "cancelled" in str(e).lower():
                self.logger.info("Extraction was cancelled")
                raise Exception("Extraction cancelled by user")
            raise e
    
    def _get_alarm_timestamps(self, 
                            start_time: datetime,
                            end_time: datetime,
                            selected_alarms: List[str],
                            selected_vehicles: Optional[List[str]]) -> List[Dict[str, Any]]:
        """Get alarm timestamps from InfluxDB notifications"""
        
        # Build time filter
        start_str = start_time.strftime('%Y-%m-%dT%H:%M:%SZ')
        end_str = end_time.strftime('%Y-%m-%dT%H:%M:%SZ')
        
        # Build alarm filter - search for any of the selected alarms in Title
        alarm_conditions = []
        for alarm in selected_alarms:
            if alarm in self.ALARM_TYPES:
                alarm_conditions.append(f'"Title" =~ /.*{alarm.replace(" ", ".*")}.*/')
        
        if not alarm_conditions:
            return []
        
        alarm_filter = " OR ".join(alarm_conditions)
        
        # Build vehicle filter
        vehicle_filter = ""
        if selected_vehicles:
            vehicle_conditions = [f'"Vehicle" = \'{vehicle}\'' for vehicle in selected_vehicles]
            vehicle_filter = f' AND ({" OR ".join(vehicle_conditions)})'
        
        # Query for alarm notifications
        query = f'''
        SELECT "Title", "Vehicle", time
        FROM "MobiusLog"."defaultMobiusPolicy"."Notification State"
        WHERE time >= '{start_str}' AND time < '{end_str}'
        AND ({alarm_filter}){vehicle_filter}
        ORDER BY time DESC
        '''
        
        try:
            result = self._execute_query_with_cancellation(query, "alarm_events_query")
            points = list(result.get_points())
            
            alarm_events = []
            for point in points:
                # Determine alarm type from title
                alarm_type = self._classify_alarm(point.get('Title', ''))
                if alarm_type:
                    alarm_events.append({
                        'alarm_type': alarm_type,
                        'vehicle': point.get('Vehicle'),
                        'timestamp': datetime.fromisoformat(point['time'].replace('Z', '+00:00')),
                        'title': point.get('Title', '')
                    })
            
            return alarm_events
            
        except Exception as e:
            self.logger.error(f"Failed to get alarm timestamps: {e}")
            return []
    
    def _classify_alarm(self, title: str) -> Optional[str]:
        """Classify alarm title into predefined alarm types"""
        title_lower = title.lower()
        
        for alarm_type in self.ALARM_TYPES:
            # Simple keyword matching
            keywords = alarm_type.lower().split()
            if all(keyword in title_lower for keyword in keywords):
                return alarm_type
        
        return None
    
    def _get_telemetry_at_timestamp(self, vehicle: str, timestamp: datetime) -> Dict[str, Any]:
        """Get telemetry data for specific vehicle at specific timestamp"""
        
        # Create optimized time window around timestamp
        start_time = timestamp - timedelta(seconds=self.telemetry_window)
        end_time = timestamp + timedelta(seconds=self.telemetry_window)
        start_str = start_time.strftime('%Y-%m-%dT%H:%M:%S.%fZ')
        end_str = end_time.strftime('%Y-%m-%dT%H:%M:%S.%fZ')
        
        telemetry_data = {
            'latitude': None,
            'longitude': None,
            'speed_kmh': None,           # Maximum absolute speed during alarm event
            'off_path_error_m': None,   # Maximum absolute off-path deviation during alarm event
            'steering_command': None,
            'throttle_command': None,
            'pitch_deg': None,          # Maximum absolute pitch deviation during alarm event
            'pitch_min_deg': None,      # Original min pitch for reference
            'pitch_max_deg': None,      # Original max pitch for reference
            'roll_deg': None,           # Maximum absolute roll deviation during alarm event
            'roll_min_deg': None,       # Original min roll for reference
            'roll_max_deg': None        # Original max roll for reference
        }
        
        # GPS Position
        try:
            gps_query = f'''
            SELECT "Value.Latitude", "Value.Longitude"
            FROM "MobiusLog"."defaultMobiusPolicy"."PositionGroup.GlobalPosition"
            WHERE time >= '{start_str}' AND time < '{end_str}' AND "Vehicle" = '{vehicle}'
            LIMIT 1
            '''
            result = self._execute_query_with_cancellation(gps_query, f"GPS_query_{vehicle}")
            points = list(result.get_points())
            if points:
                telemetry_data['latitude'] = points[0].get('Value.Latitude')
                telemetry_data['longitude'] = points[0].get('Value.Longitude')
            
            time.sleep(self.query_delay)  # Rate limiting
            
        except Exception as e:
            self.logger.warning(f"Failed to get GPS for {vehicle}: {e}")
        
        # Speed - Get maximum absolute speed during alarm event
        try:
            speed_query = f'''
            SELECT "Value"
            FROM "MobiusLog"."defaultMobiusPolicy"."Velocity X"
            WHERE time >= '{start_str}' AND time < '{end_str}' AND "Vehicle" = '{vehicle}'
            ORDER BY time DESC
            LIMIT {self.max_points_per_query}
            '''
            result = self._execute_query_with_cancellation(speed_query, f"speed_query_{vehicle}")
            points = list(result.get_points())
            if points:
                # Get maximum absolute speed (m/s) and convert to km/h
                speed_values = [abs(p.get('Value', 0)) for p in points if 'Value' in p and p.get('Value') is not None]
                if speed_values:
                    max_speed_ms = max(speed_values)
                    telemetry_data['speed_kmh'] = round(max_speed_ms * 3.6, 2)
                    self.logger.debug(f"Speed: Found {len(speed_values)} readings, max = {max_speed_ms:.2f} m/s")
            
            time.sleep(self.query_delay)
            
        except Exception as e:
            self.logger.warning(f"Failed to get speed for {vehicle}: {e}")
        
        # Off Path Error - Get maximum absolute deviation during alarm event
        try:
            offpath_query = f'''
            SELECT "Value"
            FROM "MobiusLog"."defaultMobiusPolicy"."Off Path Error"
            WHERE time >= '{start_str}' AND time < '{end_str}' AND "Vehicle" = '{vehicle}'
            ORDER BY time DESC
            LIMIT {self.max_points_per_query}
            '''
            result = self._execute_query_with_cancellation(offpath_query, f"offpath_query_{vehicle}")
            points = list(result.get_points())
            if points:
                # Get maximum absolute off-path deviation
                offpath_values = [abs(p.get('Value', 0)) for p in points if 'Value' in p and p.get('Value') is not None]
                if offpath_values:
                    telemetry_data['off_path_error_m'] = round(max(offpath_values), 2)
                    self.logger.debug(f"Off-path: Found {len(offpath_values)} readings, max = {max(offpath_values):.2f} m")
            
            time.sleep(self.query_delay)
            
        except Exception as e:
            self.logger.warning(f"Failed to get off-path error for {vehicle}: {e}")
        
        # Pitch and Roll
        self._get_attitude_data(vehicle, start_str, end_str, telemetry_data)
        
        return telemetry_data
    
    def _get_attitude_data(self, vehicle: str, start_str: str, end_str: str, telemetry_data: Dict):
        """Get pitch and roll data with absolute maximum calculation for alarm analysis"""
        
        # Pitch - Get maximum absolute pitch during alarm event
        try:
            pitch_query = f'''
            SELECT "Value"
            FROM "MobiusLog"."defaultMobiusPolicy"."Attitude Pitch"
            WHERE time >= '{start_str}' AND time < '{end_str}' AND "Vehicle" = '{vehicle}'
            ORDER BY time DESC
            LIMIT {self.max_points_per_query}
            '''
            result = self._execute_query_with_cancellation(pitch_query, f"pitch_query_{vehicle}")
            pitch_points = list(result.get_points())
            
            if pitch_points:
                pitch_values = [p['Value'] / self.deg_factor for p in pitch_points if 'Value' in p and p.get('Value') is not None]
                if pitch_values:
                    # Get maximum absolute pitch (most extreme deviation from level)
                    abs_pitch_values = [abs(pitch) for pitch in pitch_values]
                    max_abs_pitch = max(abs_pitch_values)
                    
                    # Store both the maximum absolute value and the original min/max for context
                    telemetry_data['pitch_deg'] = round(max_abs_pitch, 2)  # Maximum absolute deviation
                    telemetry_data['pitch_min_deg'] = round(min(pitch_values), 2)  # Original min for reference
                    telemetry_data['pitch_max_deg'] = round(max(pitch_values), 2)  # Original max for reference
                    self.logger.debug(f"Pitch: Found {len(pitch_values)} readings, max absolute = {max_abs_pitch:.2f}°")
            
            time.sleep(self.query_delay)
            
        except Exception as e:
            self.logger.warning(f"Failed to get pitch for {vehicle}: {e}")
        
        # Roll - Get maximum absolute roll during alarm event
        try:
            roll_query = f'''
            SELECT "Value"
            FROM "MobiusLog"."defaultMobiusPolicy"."Attitude Roll"
            WHERE time >= '{start_str}' AND time < '{end_str}' AND "Vehicle" = '{vehicle}'
            ORDER BY time DESC
            LIMIT {self.max_points_per_query}
            '''
            result = self._execute_query_with_cancellation(roll_query, f"roll_query_{vehicle}")
            roll_points = list(result.get_points())
            
            if roll_points:
                roll_values = [r['Value'] / self.deg_factor for r in roll_points if 'Value' in r and r.get('Value') is not None]
                if roll_values:
                    # Get maximum absolute roll (most extreme deviation from level)
                    abs_roll_values = [abs(roll) for roll in roll_values]
                    max_abs_roll = max(abs_roll_values)
                    
                    # Store both the maximum absolute value and the original min/max for context
                    telemetry_data['roll_deg'] = round(max_abs_roll, 2)  # Maximum absolute deviation
                    telemetry_data['roll_min_deg'] = round(min(roll_values), 2)  # Original min for reference
                    telemetry_data['roll_max_deg'] = round(max(roll_values), 2)  # Original max for reference
                    self.logger.debug(f"Roll: Found {len(roll_values)} readings, max absolute = {max_abs_roll:.2f}°")
            
            time.sleep(self.query_delay)
            
        except Exception as e:
            self.logger.warning(f"Failed to get roll for {vehicle}: {e}")

    def get_available_vehicles(self, start_time: datetime, end_time: datetime) -> List[str]:
        """Get list of autonomous vehicles active in time range"""
        
        start_str = start_time.strftime('%Y-%m-%dT%H:%M:%SZ')
        end_str = end_time.strftime('%Y-%m-%dT%H:%M:%SZ')
        
        try:
            # Get vehicles from GPS data (autonomous trucks have GPS)
            query = f'''
            SHOW TAG VALUES FROM "PositionGroup.GlobalPosition" WITH KEY = "Vehicle"
            WHERE time >= '{start_str}' AND time < '{end_str}'
            '''
            result = self._execute_query_with_cancellation(query, "available_vehicles_query")
            points = list(result.get_points())
            
            vehicles = [point['value'] for point in points if point.get('value')]
            vehicles.sort()
            
            self.logger.info(f"Found {len(vehicles)} autonomous vehicles in time range")
            return vehicles
            
        except Exception as e:
            self.logger.error(f"Failed to get available vehicles: {e}")
            return []
    
    def get_alarm_types(self) -> List[str]:
        """Get current list of configured alarm types"""
        return self.ALARM_TYPES.copy()
    
    def get_default_alarm_types(self) -> List[str]:
        """Get default alarm types (factory defaults)"""
        return self.DEFAULT_ALARM_TYPES.copy()
    
    def set_alarm_types(self, alarm_types: List[str]) -> bool:
        """Set custom alarm types for analysis"""
        if not isinstance(alarm_types, list):
            self.logger.error("Alarm types must be provided as a list")
            return False
        
        if not alarm_types:
            self.logger.warning("Empty alarm types list provided, using defaults")
            self.ALARM_TYPES = self.DEFAULT_ALARM_TYPES.copy()
            return True
        
        # Validate alarm types (basic validation)
        valid_types = []
        for alarm_type in alarm_types:
            if isinstance(alarm_type, str) and len(alarm_type.strip()) > 0:
                valid_types.append(alarm_type.strip())
            else:
                self.logger.warning(f"Invalid alarm type ignored: {alarm_type}")
        
        if valid_types:
            self.ALARM_TYPES = valid_types
            self.logger.info(f"Updated alarm types: {len(valid_types)} types configured")
            return True
        else:
            self.logger.error("No valid alarm types provided")
            return False
    
    def add_alarm_type(self, alarm_type: str) -> bool:
        """Add a new alarm type to the current list"""
        if not isinstance(alarm_type, str) or len(alarm_type.strip()) == 0:
            self.logger.error("Invalid alarm type provided")
            return False
        
        alarm_type = alarm_type.strip()
        if alarm_type in self.ALARM_TYPES:
            self.logger.warning(f"Alarm type '{alarm_type}' already exists")
            return False
        
        self.ALARM_TYPES.append(alarm_type)
        self.logger.info(f"Added new alarm type: '{alarm_type}'")
        return True
    
    def remove_alarm_type(self, alarm_type: str) -> bool:
        """Remove an alarm type from the current list"""
        if not isinstance(alarm_type, str):
            self.logger.error("Invalid alarm type provided")
            return False
        
        if alarm_type in self.ALARM_TYPES:
            self.ALARM_TYPES.remove(alarm_type)
            self.logger.info(f"Removed alarm type: '{alarm_type}'")
            return True
        else:
            self.logger.warning(f"Alarm type '{alarm_type}' not found in current list")
            return False
    
    def reset_to_defaults(self) -> bool:
        """Reset alarm types to factory defaults"""
        self.ALARM_TYPES = self.DEFAULT_ALARM_TYPES.copy()
        self.logger.info("Reset alarm types to factory defaults")
        return True

    def _get_alarm_timestamps_with_cancellation(self,
                                              start_time: datetime,
                                              end_time: datetime,
                                              selected_alarms: List[str],
                                              selected_vehicles: Optional[List[str]],
                                              cancellation_check=None) -> List[Dict[str, Any]]:
        """Get alarm timestamps from InfluxDB notifications with cancellation support"""

        # Check for cancellation before starting
        if self.cancelled or (cancellation_check and cancellation_check()):
            raise Exception("Extraction cancelled before alarm timestamp query")

        # Build time filter
        start_str = start_time.strftime('%Y-%m-%dT%H:%M:%SZ')
        end_str = end_time.strftime('%Y-%m-%dT%H:%M:%SZ')

        # Build alarm filter - search for any of the selected alarms in Title
        alarm_conditions = []
        for alarm in selected_alarms:
            if alarm in self.ALARM_TYPES:
                alarm_conditions.append(f'"Title" =~ /.*{alarm.replace(" ", ".*")}.*/')

        if not alarm_conditions:
            return []

        alarm_filter = " OR ".join(alarm_conditions)

        # Build vehicle filter
        vehicle_filter = ""
        if selected_vehicles:
            vehicle_conditions = [f'"Vehicle" = \'{vehicle}\'' for vehicle in selected_vehicles]
            vehicle_filter = f' AND ({" OR ".join(vehicle_conditions)})'

        # Query for alarm notifications
        query = f'''
        SELECT "Title", "Vehicle", time
        FROM "MobiusLog"."defaultMobiusPolicy"."Notification State"
        WHERE time >= '{start_str}' AND time < '{end_str}'
        AND ({alarm_filter}){vehicle_filter}
        ORDER BY time DESC
        '''

        try:
            # Use cancellation-aware query method
            result = self._query_with_cancellation(query, "alarm timestamps query")
            points = list(result.get_points())

            # Check for cancellation after query
            if self.cancelled or (cancellation_check and cancellation_check()):
                raise Exception("Extraction cancelled after alarm timestamp query")

            alarm_events = []
            for point in points:
                # Check for cancellation during processing
                if self.cancelled or (cancellation_check and cancellation_check()):
                    raise Exception("Extraction cancelled during alarm timestamp processing")

                # Determine alarm type from title
                alarm_type = self._classify_alarm(point.get('Title', ''))
                if alarm_type:
                    alarm_events.append({
                        'alarm_type': alarm_type,
                        'vehicle': point.get('Vehicle'),
                        'timestamp': datetime.fromisoformat(point['time'].replace('Z', '+00:00')),
                        'title': point.get('Title', '')
                    })

            return alarm_events

        except Exception as e:
            if self.cancelled or "cancelled" in str(e).lower():
                raise Exception("Extraction cancelled during alarm timestamp retrieval")
            self.logger.error(f"Failed to get alarm timestamps: {e}")
            return []

    def _get_telemetry_at_timestamp_with_cancellation(self, vehicle: str, timestamp: datetime, cancellation_check=None) -> Dict[str, Any]:
        """Get telemetry data for specific vehicle at specific timestamp with cancellation support"""

        # Check for cancellation before starting
        if self.cancelled or (cancellation_check and cancellation_check()):
            raise Exception("Extraction cancelled before telemetry query")

        # Create optimized time window around timestamp
        start_time = timestamp - timedelta(seconds=self.telemetry_window)
        end_time = timestamp + timedelta(seconds=self.telemetry_window)
        start_str = start_time.strftime('%Y-%m-%dT%H:%M:%S.%fZ')
        end_str = end_time.strftime('%Y-%m-%dT%H:%M:%S.%fZ')

        telemetry_data = {
            'latitude': None,
            'longitude': None,
            'speed_kmh': None,
            'off_path_error_m': None,
            'steering_command': None,
            'throttle_command': None,
            'pitch_deg': None,
            'pitch_min_deg': None,
            'pitch_max_deg': None,
            'roll_deg': None,
            'roll_min_deg': None,
            'roll_max_deg': None
        }

        # GPS Position with cancellation
        try:
            if self.cancelled or (cancellation_check and cancellation_check()):
                raise Exception("Extraction cancelled before GPS query")

            gps_query = f'''
            SELECT "Value.Latitude", "Value.Longitude"
            FROM "MobiusLog"."defaultMobiusPolicy"."PositionGroup.GlobalPosition"
            WHERE time >= '{start_str}' AND time < '{end_str}' AND "Vehicle" = '{vehicle}'
            LIMIT 1
            '''
            result = self._query_with_cancellation(gps_query, f"GPS query for {vehicle}")
            points = list(result.get_points())

            if points:
                telemetry_data['latitude'] = points[0].get('Value.Latitude')
                telemetry_data['longitude'] = points[0].get('Value.Longitude')

            time.sleep(self.query_delay)  # Rate limiting

        except Exception as e:
            if self.cancelled or "cancelled" in str(e).lower():
                raise Exception("Extraction cancelled during GPS telemetry query")
            self.logger.warning(f"Failed to get GPS for {vehicle}: {e}")

        # Speed with cancellation
        try:
            if self.cancelled or (cancellation_check and cancellation_check()):
                raise Exception("Extraction cancelled before speed query")

            speed_query = f'''
            SELECT "Value"
            FROM "MobiusLog"."defaultMobiusPolicy"."Velocity X"
            WHERE time >= '{start_str}' AND time < '{end_str}' AND "Vehicle" = '{vehicle}'
            '''
            result = self._query_with_cancellation(speed_query, f"speed query for {vehicle}")
            points = list(result.get_points())

            if points:
                # Get maximum absolute speed during alarm event
                speed_values = [abs(float(point.get('Value', 0))) for point in points if point.get('Value') is not None]
                if speed_values:
                    telemetry_data['speed_kmh'] = max(speed_values) * 3.6  # Convert m/s to km/h

            time.sleep(self.query_delay)

        except Exception as e:
            if self.cancelled or "cancelled" in str(e).lower():
                raise Exception("Extraction cancelled during speed telemetry query")
            self.logger.warning(f"Failed to get speed for {vehicle}: {e}")

        # Off Path Error with cancellation
        try:
            if self.cancelled or (cancellation_check and cancellation_check()):
                raise Exception("Extraction cancelled before off-path query")

            offpath_query = f'''
            SELECT "Value"
            FROM "MobiusLog"."defaultMobiusPolicy"."Off Path Error"
            WHERE time >= '{start_str}' AND time < '{end_str}' AND "Vehicle" = '{vehicle}'
            ORDER BY time DESC
            LIMIT {self.max_points_per_query}
            '''
            result = self._query_with_cancellation(offpath_query, f"off-path query for {vehicle}")
            points = list(result.get_points())

            if points:
                # Get maximum absolute off-path deviation
                offpath_values = [abs(p.get('Value', 0)) for p in points if 'Value' in p and p.get('Value') is not None]
                if offpath_values:
                    telemetry_data['off_path_error_m'] = round(max(offpath_values), 2)
                    self.logger.debug(f"Off-path: Found {len(offpath_values)} readings, max = {max(offpath_values):.2f} m")

            time.sleep(self.query_delay)

        except Exception as e:
            if self.cancelled or "cancelled" in str(e).lower():
                raise Exception("Extraction cancelled during off-path telemetry query")
            self.logger.warning(f"Failed to get off-path error for {vehicle}: {e}")

        # Pitch data with cancellation
        try:
            if self.cancelled or (cancellation_check and cancellation_check()):
                raise Exception("Extraction cancelled before pitch query")

            pitch_query = f'''
            SELECT "Value"
            FROM "MobiusLog"."defaultMobiusPolicy"."Attitude Pitch"
            WHERE time >= '{start_str}' AND time < '{end_str}' AND "Vehicle" = '{vehicle}'
            ORDER BY time DESC
            LIMIT {self.max_points_per_query}
            '''
            result = self._query_with_cancellation(pitch_query, f"pitch query for {vehicle}")
            pitch_points = list(result.get_points())

            if pitch_points:
                pitch_values = [p['Value'] / self.deg_factor for p in pitch_points if 'Value' in p and p.get('Value') is not None]
                if pitch_values:
                    # Get maximum absolute pitch (most extreme deviation from level)
                    abs_pitch_values = [abs(pitch) for pitch in pitch_values]
                    max_abs_pitch = max(abs_pitch_values)
                    telemetry_data['pitch_deg'] = round(max_abs_pitch, 2)
                    telemetry_data['pitch_min_deg'] = round(min(pitch_values), 2)
                    telemetry_data['pitch_max_deg'] = round(max(pitch_values), 2)
                    self.logger.debug(f"Pitch: Found {len(pitch_values)} readings, max absolute = {max_abs_pitch:.2f}°")

            time.sleep(self.query_delay)

        except Exception as e:
            if self.cancelled or "cancelled" in str(e).lower():
                raise Exception("Extraction cancelled during pitch telemetry query")
            self.logger.warning(f"Failed to get pitch for {vehicle}: {e}")

        # Roll data with cancellation
        try:
            if self.cancelled or (cancellation_check and cancellation_check()):
                raise Exception("Extraction cancelled before roll query")

            roll_query = f'''
            SELECT "Value"
            FROM "MobiusLog"."defaultMobiusPolicy"."Attitude Roll"
            WHERE time >= '{start_str}' AND time < '{end_str}' AND "Vehicle" = '{vehicle}'
            ORDER BY time DESC
            LIMIT {self.max_points_per_query}
            '''
            result = self._query_with_cancellation(roll_query, f"roll query for {vehicle}")
            roll_points = list(result.get_points())

            if roll_points:
                roll_values = [p['Value'] / self.deg_factor for p in roll_points if 'Value' in p and p.get('Value') is not None]
                if roll_values:
                    # Get maximum absolute roll (most extreme deviation from level)
                    abs_roll_values = [abs(roll) for roll in roll_values]
                    max_abs_roll = max(abs_roll_values)
                    telemetry_data['roll_deg'] = round(max_abs_roll, 2)
                    telemetry_data['roll_min_deg'] = round(min(roll_values), 2)
                    telemetry_data['roll_max_deg'] = round(max(roll_values), 2)
                    self.logger.debug(f"Roll: Found {len(roll_values)} readings, max absolute = {max_abs_roll:.2f}°")

            time.sleep(self.query_delay)

        except Exception as e:
            if self.cancelled or "cancelled" in str(e).lower():
                raise Exception("Extraction cancelled during roll telemetry query")
            self.logger.warning(f"Failed to get roll for {vehicle}: {e}")

        return telemetry_data