"""
Alarm Type Configuration Manager
Manages alarm types through JSON file storage
"""

import json
import os
import sys
from typing import List, Dict
from pathlib import Path

class AlarmTypeManager:
    def __init__(self, config_file: str = "alarm_types.json"):
        # Try external file first (same directory as executable), then embedded
        if getattr(sys, 'frozen', False):
            # Running as compiled executable
            executable_dir = Path(sys.executable).parent
            external_config = executable_dir / config_file
            if external_config.exists():
                self.config_file = external_config
                print(f"Using external config: {self.config_file}")
            else:
                # Fall back to embedded config
                self.config_file = Path(__file__).parent / config_file
                print(f"Using embedded config: {self.config_file}")
        else:
            # Running as Python script
            self.config_file = Path(__file__).parent / config_file
            print(f"Using script config: {self.config_file}")

        self._ensure_config_exists()
    
    def _ensure_config_exists(self):
        """Create config file with defaults if it doesn't exist"""
        if not self.config_file.exists():
            default_config = self._get_default_config()
            self._save_config(default_config)
    
    def _load_config(self) -> Dict:
        """Load configuration from JSON file"""
        try:
            with open(self.config_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading alarm config: {e}")
            return self._get_default_config()
    
    def _save_config(self, config: Dict):
        """Save configuration to JSON file"""
        try:
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(config, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"Error saving alarm config: {e}")
            raise
    
    def _get_default_config(self) -> Dict:
        """Get default configuration"""
        return {
            "default_alarm_types": [
                "Dump Bed Cannot Be Raised While Vehicle Tilted",
                "Tilt exceeded with dump bed raised",
                "Off Path",
                "Steering Restricted",
                "Bump Detected: Dump",
                "Bump Detected: Close",
                "Undocumented Error c419",
                "Failed to Drive When Commanded",
                "Slippery Conditions Caused Vehicle To Stop"
            ],
            "current_alarm_types": [
                "Dump Bed Cannot Be Raised While Vehicle Tilted",
                "Tilt exceeded with dump bed raised",
                "Off Path",
                "Steering Restricted",
                "Bump Detected: Dump",
                "Bump Detected: Close",
                "Undocumented Error c419",
                "Failed to Drive When Commanded",
                "Slippery Conditions Caused Vehicle To Stop"
            ],
            "extraction_settings": {
                "query_delay_seconds": 0.1,
                "max_points_per_query": 1000,
                "telemetry_window_seconds": 0.5,
                "description": "Configurable settings for data extraction. query_delay_seconds controls the delay between InfluxDB queries to protect server performance. Lower values = faster extraction but higher server load."
            }
        }
    
    def get_current_alarm_types(self) -> List[str]:
        """Get current alarm types list"""
        config = self._load_config()
        return config.get("current_alarm_types", [])
    
    def get_default_alarm_types(self) -> List[str]:
        """Get default alarm types list"""
        config = self._load_config()
        return config.get("default_alarm_types", [])
    
    def set_alarm_types(self, alarm_types: List[str]) -> bool:
        """Set current alarm types list"""
        try:
            config = self._load_config()
            config["current_alarm_types"] = alarm_types
            self._save_config(config)
            return True
        except Exception as e:
            print(f"Error setting alarm types: {e}")
            return False
    
    def add_alarm_type(self, alarm_type: str) -> bool:
        """Add a new alarm type to current list"""
        try:
            config = self._load_config()
            current_types = config.get("current_alarm_types", [])
            if alarm_type not in current_types:
                current_types.append(alarm_type)
                config["current_alarm_types"] = current_types
                self._save_config(config)
            return True
        except Exception as e:
            print(f"Error adding alarm type: {e}")
            return False
    
    def remove_alarm_type(self, alarm_type: str) -> bool:
        """Remove an alarm type from current list"""
        try:
            config = self._load_config()
            current_types = config.get("current_alarm_types", [])
            if alarm_type in current_types:
                current_types.remove(alarm_type)
                config["current_alarm_types"] = current_types
                self._save_config(config)
            return True
        except Exception as e:
            print(f"Error removing alarm type: {e}")
            return False
    
    def reset_to_defaults(self) -> bool:
        """Reset current alarm types to defaults"""
        try:
            config = self._load_config()
            config["current_alarm_types"] = config["default_alarm_types"].copy()
            self._save_config(config)
            return True
        except Exception as e:
            print(f"Error resetting to defaults: {e}")
            return False
    
    def get_stats(self) -> Dict:
        """Get statistics about alarm types"""
        config = self._load_config()
        current_types = config.get("current_alarm_types", [])
        default_types = config.get("default_alarm_types", [])

        return {
            "current_count": len(current_types),
            "default_count": len(default_types),
            "is_using_defaults": current_types == default_types,
            "custom_additions": [t for t in current_types if t not in default_types],
            "removed_defaults": [t for t in default_types if t not in current_types]
        }

    def get_extraction_settings(self) -> Dict:
        """Get extraction settings"""
        config = self._load_config()
        default_settings = self._get_default_config()["extraction_settings"]
        return config.get("extraction_settings", default_settings)

    def update_extraction_settings(self, settings: Dict) -> bool:
        """Update extraction settings"""
        try:
            config = self._load_config()

            # Validate required fields
            required_fields = ["query_delay_seconds", "max_points_per_query", "telemetry_window_seconds"]
            for field in required_fields:
                if field not in settings:
                    raise ValueError(f"Missing required field: {field}")

            # Validate types and ranges
            if not isinstance(settings["query_delay_seconds"], (int, float)) or settings["query_delay_seconds"] < 0:
                raise ValueError("query_delay_seconds must be a non-negative number")

            if not isinstance(settings["max_points_per_query"], int) or settings["max_points_per_query"] < 1:
                raise ValueError("max_points_per_query must be a positive integer")

            if not isinstance(settings["telemetry_window_seconds"], (int, float)) or settings["telemetry_window_seconds"] < 0:
                raise ValueError("telemetry_window_seconds must be a non-negative number")

            # Update config
            config["extraction_settings"] = settings
            self._save_config(config)
            return True
        except Exception as e:
            print(f"Error updating extraction settings: {e}")
            return False