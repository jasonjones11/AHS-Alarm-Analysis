"""
Resource Monitoring Module for Mining Truck ETL System

Monitors system resources (CPU, memory, disk) during extraction operations
to prevent resource exhaustion and provide early warning of potential issues.
"""

import asyncio
import logging
import psutil
import shutil
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, Optional, Callable
from dataclasses import dataclass

logger = logging.getLogger(__name__)

@dataclass
class ResourceLimits:
    """Configuration for resource monitoring limits"""
    min_disk_space_gb: float = 10.0
    max_memory_percent: float = 80.0
    max_cpu_percent: float = 90.0
    check_interval_seconds: int = 30
    temp_directory: str = "data/temp"

class ResourceMonitor:
    """
    System resource monitor for ETL operations
    
    Provides real-time monitoring of:
    - Disk space availability
    - Memory usage
    - CPU utilization
    - Temporary file growth
    """
    
    def __init__(self, limits: Optional[ResourceLimits] = None, 
                 on_warning: Optional[Callable] = None,
                 on_critical: Optional[Callable] = None):
        self.limits = limits or ResourceLimits()
        self.on_warning = on_warning
        self.on_critical = on_critical
        self.running = False
        self._monitor_task = None
        self._lock = threading.Lock()
        self._last_stats = {}
        
    async def start_monitoring(self):
        """Start resource monitoring in background"""
        if self.running:
            logger.warning("Resource monitor is already running")
            return
            
        with self._lock:
            self.running = True
            self._monitor_task = asyncio.create_task(self._monitor_loop())
            
        logger.info(f"Resource monitoring started (check interval: {self.limits.check_interval_seconds}s)")
    
    async def stop_monitoring(self):
        """Stop resource monitoring"""
        with self._lock:
            self.running = False
            
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
                
        logger.info("Resource monitoring stopped")
    
    async def _monitor_loop(self):
        """Main monitoring loop"""
        while self.running:
            try:
                await self.check_resources()
                await asyncio.sleep(self.limits.check_interval_seconds)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Resource monitoring error: {e}")
                await asyncio.sleep(5)  # Brief pause before retry
    
    async def check_resources(self) -> Dict[str, Any]:
        """
        Check all system resources and return status
        
        Returns:
            Dict with resource status and warnings
        """
        try:
            # Check disk space
            disk_status = self._check_disk_space()
            
            # Check memory usage
            memory_status = self._check_memory()
            
            # Check CPU usage
            cpu_status = self._check_cpu()
            
            # Check temporary files
            temp_status = self._check_temp_files()
            
            # Aggregate status
            status = {
                'timestamp': datetime.utcnow().isoformat(),
                'disk': disk_status,
                'memory': memory_status,
                'cpu': cpu_status,
                'temp_files': temp_status,
                'overall_status': self._determine_overall_status([
                    disk_status, memory_status, cpu_status, temp_status
                ])
            }
            
            # Store for comparison
            self._last_stats = status
            
            # Trigger callbacks if needed
            await self._handle_resource_alerts(status)
            
            return status
            
        except Exception as e:
            logger.error(f"Failed to check resources: {e}")
            return {
                'timestamp': datetime.utcnow().isoformat(),
                'error': str(e),
                'overall_status': 'error'
            }
    
    def _check_disk_space(self) -> Dict[str, Any]:
        """Check available disk space"""
        try:
            # Check main disk space
            disk_usage = shutil.disk_usage(Path.cwd())
            free_gb = disk_usage.free / (1024 ** 3)
            total_gb = disk_usage.total / (1024 ** 3)
            used_percent = ((total_gb - free_gb) / total_gb) * 100
            
            # Determine status
            if free_gb < self.limits.min_disk_space_gb:
                status = 'critical'
                message = f"Critically low disk space: {free_gb:.1f}GB free (need {self.limits.min_disk_space_gb}GB)"
            elif free_gb < self.limits.min_disk_space_gb * 2:
                status = 'warning'
                message = f"Low disk space: {free_gb:.1f}GB free"
            else:
                status = 'ok'
                message = f"{free_gb:.1f}GB available"
            
            return {
                'status': status,
                'message': message,
                'free_gb': round(free_gb, 1),
                'total_gb': round(total_gb, 1),
                'used_percent': round(used_percent, 1)
            }
            
        except Exception as e:
            return {
                'status': 'error',
                'message': f"Could not check disk space: {e}",
                'error': str(e)
            }
    
    def _check_memory(self) -> Dict[str, Any]:
        """Check system memory usage"""
        try:
            memory = psutil.virtual_memory()
            
            # Determine status
            if memory.percent > self.limits.max_memory_percent:
                status = 'critical'
                message = f"High memory usage: {memory.percent:.1f}%"
            elif memory.percent > self.limits.max_memory_percent * 0.8:
                status = 'warning'
                message = f"Elevated memory usage: {memory.percent:.1f}%"
            else:
                status = 'ok'
                message = f"Memory usage: {memory.percent:.1f}%"
            
            return {
                'status': status,
                'message': message,
                'used_percent': round(memory.percent, 1),
                'available_gb': round(memory.available / (1024 ** 3), 1),
                'total_gb': round(memory.total / (1024 ** 3), 1)
            }
            
        except Exception as e:
            return {
                'status': 'error',
                'message': f"Could not check memory: {e}",
                'error': str(e)
            }
    
    def _check_cpu(self) -> Dict[str, Any]:
        """Check CPU usage"""
        try:
            # Get CPU usage over 1 second interval
            cpu_percent = psutil.cpu_percent(interval=1)
            
            # Determine status
            if cpu_percent > self.limits.max_cpu_percent:
                status = 'critical'
                message = f"High CPU usage: {cpu_percent:.1f}%"
            elif cpu_percent > self.limits.max_cpu_percent * 0.8:
                status = 'warning'
                message = f"Elevated CPU usage: {cpu_percent:.1f}%"
            else:
                status = 'ok'
                message = f"CPU usage: {cpu_percent:.1f}%"
            
            return {
                'status': status,
                'message': message,
                'cpu_percent': round(cpu_percent, 1),
                'cpu_count': psutil.cpu_count()
            }
            
        except Exception as e:
            return {
                'status': 'error',
                'message': f"Could not check CPU: {e}",
                'error': str(e)
            }
    
    def _check_temp_files(self) -> Dict[str, Any]:
        """Check temporary file usage"""
        try:
            temp_dir = Path(self.limits.temp_directory)
            
            if not temp_dir.exists():
                return {
                    'status': 'ok',
                    'message': 'Temp directory does not exist',
                    'size_mb': 0,
                    'file_count': 0
                }
            
            # Calculate temp directory size
            total_size = sum(f.stat().st_size for f in temp_dir.rglob('*') if f.is_file())
            size_mb = total_size / (1024 ** 2)
            file_count = len(list(temp_dir.rglob('*')))
            
            # Determine status (warning if temp files > 1GB)
            if size_mb > 1024:
                status = 'warning'
                message = f"Large temp directory: {size_mb:.1f}MB ({file_count} files)"
            elif size_mb > 100:
                status = 'info'
                message = f"Temp directory: {size_mb:.1f}MB ({file_count} files)"
            else:
                status = 'ok'
                message = f"Temp directory: {size_mb:.1f}MB"
            
            return {
                'status': status,
                'message': message,
                'size_mb': round(size_mb, 1),
                'file_count': file_count,
                'path': str(temp_dir)
            }
            
        except Exception as e:
            return {
                'status': 'error',
                'message': f"Could not check temp files: {e}",
                'error': str(e)
            }
    
    def _determine_overall_status(self, statuses: list) -> str:
        """Determine overall system status from individual checks"""
        status_priority = {
            'critical': 4,
            'error': 3,
            'warning': 2,
            'info': 1,
            'ok': 0
        }
        
        max_priority = 0
        overall_status = 'ok'
        
        for status_dict in statuses:
            if isinstance(status_dict, dict):
                status = status_dict.get('status', 'ok')
                priority = status_priority.get(status, 0)
                if priority > max_priority:
                    max_priority = priority
                    overall_status = status
        
        return overall_status
    
    async def _handle_resource_alerts(self, status: Dict[str, Any]):
        """Handle resource alerts by calling appropriate callbacks"""
        overall_status = status.get('overall_status', 'ok')
        
        try:
            if overall_status == 'critical' and self.on_critical:
                await self._safe_callback(self.on_critical, status)
            elif overall_status in ['warning', 'info'] and self.on_warning:
                await self._safe_callback(self.on_warning, status)
                
        except Exception as e:
            logger.error(f"Error in resource alert callback: {e}")
    
    async def _safe_callback(self, callback: Callable, status: Dict[str, Any]):
        """Safely execute callback without breaking monitoring"""
        try:
            if asyncio.iscoroutinefunction(callback):
                await callback(status)
            else:
                callback(status)
        except Exception as e:
            logger.error(f"Callback execution failed: {e}")
    
    def get_current_status(self) -> Dict[str, Any]:
        """Get the most recent resource status"""
        return self._last_stats.copy() if self._last_stats else {}
    
    def cleanup_temp_files(self) -> Dict[str, Any]:
        """Clean up temporary files and return cleanup summary"""
        try:
            temp_dir = Path(self.limits.temp_directory)
            
            if not temp_dir.exists():
                return {'status': 'ok', 'message': 'Temp directory does not exist'}
            
            # Calculate size before cleanup
            size_before = sum(f.stat().st_size for f in temp_dir.rglob('*') if f.is_file())
            file_count_before = len(list(temp_dir.rglob('*')))
            
            # Remove all files
            shutil.rmtree(temp_dir)
            temp_dir.mkdir(parents=True, exist_ok=True)
            
            size_mb = size_before / (1024 ** 2)
            
            logger.info(f"Cleaned up temp directory: {size_mb:.1f}MB, {file_count_before} files removed")
            
            return {
                'status': 'ok',
                'message': f"Cleaned up {size_mb:.1f}MB from temp directory",
                'size_cleaned_mb': round(size_mb, 1),
                'files_removed': file_count_before
            }
            
        except Exception as e:
            logger.error(f"Failed to cleanup temp files: {e}")
            return {
                'status': 'error',
                'message': f"Cleanup failed: {e}",
                'error': str(e)
            }

# Convenience function for one-time resource check
async def check_system_resources(limits: Optional[ResourceLimits] = None) -> Dict[str, Any]:
    """
    Perform a one-time system resource check
    
    Args:
        limits: Resource limits configuration
        
    Returns:
        Dict with current resource status
    """
    monitor = ResourceMonitor(limits)
    return await monitor.check_resources()

# Example usage with callbacks
async def resource_warning_handler(status: Dict[str, Any]):
    """Example warning handler"""
    logger.warning(f"Resource warning: {status['overall_status']}")
    
    # Log specific issues
    for component, details in status.items():
        if isinstance(details, dict) and details.get('status') in ['warning', 'info']:
            logger.warning(f"{component.upper()}: {details['message']}")

async def resource_critical_handler(status: Dict[str, Any]):
    """Example critical resource handler"""
    logger.error(f"CRITICAL resource issue: {status['overall_status']}")
    
    # Log all critical issues
    for component, details in status.items():
        if isinstance(details, dict) and details.get('status') == 'critical':
            logger.error(f"{component.upper()}: {details['message']}")
    
    # Could trigger emergency actions here:
    # - Cancel running extractions
    # - Clean up temp files
    # - Send alerts
    # - Reduce batch sizes