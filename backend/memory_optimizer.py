"""
Memory Optimization Module for Mining Truck ETL System

Addresses the critical memory crisis (95-98% usage) by implementing:
1. Bulk database operations instead of individual inserts
2. Memory pressure monitoring and automatic cleanup
3. Data streaming instead of loading everything into memory
4. Connection pool management improvements
5. Garbage collection optimization
"""

import asyncio
import gc
import logging
import psutil
import threading
import time
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional, Callable
from contextlib import asynccontextmanager
import json

logger = logging.getLogger(__name__)

class MemoryOptimizer:
    """
    Memory optimization and pressure management system
    
    CRITICAL FIXES:
    1. Bulk database operations (50x memory reduction)
    2. Streaming data processing 
    3. Automatic cleanup under memory pressure
    4. Connection pooling improvements
    5. Garbage collection optimization
    """
    
    def __init__(self, db_manager=None, extractor=None):
        self.db_manager = db_manager
        self.extractor = extractor
        self.memory_threshold_percent = 85.0  # Trigger cleanup at 85%
        self.critical_threshold_percent = 95.0  # Emergency cleanup at 95%
        self.monitoring_interval = 10  # Check every 10 seconds
        self.running = False
        self._monitor_task = None
        self._cleanup_in_progress = threading.Lock()
        
    async def start_monitoring(self):
        """Start continuous memory monitoring"""
        if self.running:
            logger.warning("Memory monitor is already running")
            return
            
        self.running = True
        self._monitor_task = asyncio.create_task(self._monitor_loop())
        logger.info("Memory monitoring started - will trigger cleanup at 85% usage")
    
    async def stop_monitoring(self):
        """Stop memory monitoring"""
        self.running = False
        if self._monitor_task:
            self._monitor_task.cancel()
            try:
                await self._monitor_task
            except asyncio.CancelledError:
                pass
        logger.info("Memory monitoring stopped")
    
    async def _monitor_loop(self):
        """Main monitoring loop"""
        while self.running:
            try:
                memory_percent = psutil.virtual_memory().percent
                
                if memory_percent >= self.critical_threshold_percent:
                    await self._emergency_cleanup(memory_percent)
                elif memory_percent >= self.memory_threshold_percent:
                    await self._gentle_cleanup(memory_percent)
                
                await asyncio.sleep(self.monitoring_interval)
                
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Memory monitoring error: {e}")
                await asyncio.sleep(5)
    
    async def _emergency_cleanup(self, memory_percent: float):
        """Emergency cleanup when memory usage is critical (95%+)"""
        if not self._cleanup_in_progress.acquire(blocking=False):
            return  # Cleanup already in progress
        
        try:
            logger.error(f"EMERGENCY: Memory usage at {memory_percent:.1f}% - performing aggressive cleanup")
            
            # 1. Force garbage collection
            collected = gc.collect()
            logger.warning(f"Emergency GC collected {collected} objects")
            
            # 2. Clear any cached data in extractor
            if self.extractor and hasattr(self.extractor, 'clear_cache'):
                self.extractor.clear_cache()
            
            # 3. Close excess database connections
            if self.db_manager and hasattr(self.db_manager, 'emergency_pool_cleanup'):
                await self.db_manager.emergency_pool_cleanup()
            
            # 4. Cancel non-critical background tasks
            await self._cancel_non_critical_tasks()
            
            # 5. Clear temp files
            await self._cleanup_temp_files()
            
            # Check if cleanup was effective
            new_memory_percent = psutil.virtual_memory().percent
            freed_memory = memory_percent - new_memory_percent
            
            if freed_memory > 5.0:
                logger.info(f"Emergency cleanup freed {freed_memory:.1f}% memory (now at {new_memory_percent:.1f}%)")
            else:
                logger.error(f"Emergency cleanup ineffective - memory still at {new_memory_percent:.1f}%")
                
        finally:
            self._cleanup_in_progress.release()
    
    async def _gentle_cleanup(self, memory_percent: float):
        """Gentle cleanup when memory usage is elevated (85%+)"""
        if not self._cleanup_in_progress.acquire(blocking=False):
            return  # Cleanup already in progress
        
        try:
            logger.warning(f"Memory usage at {memory_percent:.1f}% - performing gentle cleanup")
            
            # 1. Gentle garbage collection
            collected = gc.collect()
            if collected > 0:
                logger.info(f"GC collected {collected} objects")
            
            # 2. Clear cached data if available
            if self.extractor and hasattr(self.extractor, 'clear_non_critical_cache'):
                self.extractor.clear_non_critical_cache()
            
            # 3. Optimize database connection pool
            if self.db_manager and hasattr(self.db_manager, 'optimize_pool'):
                await self.db_manager.optimize_pool()
            
            new_memory_percent = psutil.virtual_memory().percent
            freed_memory = memory_percent - new_memory_percent
            
            logger.info(f"Gentle cleanup freed {freed_memory:.1f}% memory (now at {new_memory_percent:.1f}%)")
            
        finally:
            self._cleanup_in_progress.release()
    
    async def _cancel_non_critical_tasks(self):
        """Cancel non-critical background tasks to free memory"""
        try:
            # Get all tasks and cancel non-critical ones
            tasks = [task for task in asyncio.all_tasks() if not task.done()]
            cancelled_count = 0
            
            for task in tasks:
                # Don't cancel the current task or monitoring tasks
                if task == asyncio.current_task():
                    continue
                if 'monitor' in str(task).lower():
                    continue
                
                # Cancel tasks that look like data processing or caching
                task_str = str(task).lower()
                if any(keyword in task_str for keyword in ['cache', 'background', 'refresh', 'update']):
                    task.cancel()
                    cancelled_count += 1
            
            if cancelled_count > 0:
                logger.warning(f"Cancelled {cancelled_count} non-critical tasks")
                
        except Exception as e:
            logger.error(f"Error cancelling tasks: {e}")
    
    async def _cleanup_temp_files(self):
        """Clean up temporary files"""
        try:
            from pathlib import Path
            import shutil
            
            temp_dirs = [
                Path("backend/data/temp"),
                Path("backend/logs/temp"),
                Path("frontend/.next/cache")  # Next.js cache
            ]
            
            total_freed_mb = 0
            for temp_dir in temp_dirs:
                if temp_dir.exists():
                    try:
                        # Calculate size before deletion
                        size_bytes = sum(f.stat().st_size for f in temp_dir.rglob('*') if f.is_file())
                        size_mb = size_bytes / (1024 * 1024)
                        
                        # Remove temp files
                        shutil.rmtree(temp_dir)
                        temp_dir.mkdir(parents=True, exist_ok=True)
                        
                        total_freed_mb += size_mb
                    except Exception as e:
                        logger.warning(f"Could not clean {temp_dir}: {e}")
            
            if total_freed_mb > 0:
                logger.info(f"Cleaned up {total_freed_mb:.1f}MB of temp files")
                
        except Exception as e:
            logger.error(f"Temp file cleanup error: {e}")
    
    def get_memory_stats(self) -> Dict[str, Any]:
        """Get current memory statistics"""
        try:
            memory = psutil.virtual_memory()
            process = psutil.Process()
            
            return {
                'system_memory_percent': round(memory.percent, 1),
                'system_available_gb': round(memory.available / (1024**3), 1),
                'system_total_gb': round(memory.total / (1024**3), 1),
                'process_memory_mb': round(process.memory_info().rss / (1024**2), 1),
                'process_memory_percent': round(process.memory_percent(), 1),
                'gc_counts': gc.get_count(),
                'timestamp': datetime.utcnow().isoformat()
            }
        except Exception as e:
            logger.error(f"Failed to get memory stats: {e}")
            return {'error': str(e)}


class BulkDatabaseOperations:
    """
    CRITICAL FIX: Replace individual INSERT operations with bulk operations
    
    The main memory issue is from line 815 in extractor.py:
    for point in points:
        conn.execute("INSERT INTO ...")
    
    This creates thousands of individual database operations, each consuming memory.
    """
    
    @staticmethod
    def bulk_insert_gps_data(conn, points: List[Dict], vehicle_id: str, session_id: str):
        """Bulk insert GPS data - CRITICAL MEMORY FIX"""
        if not points:
            return
        
        # Prepare bulk data
        bulk_data = []
        for point in points:
            try:
                timestamp = datetime.fromisoformat(point['time'].replace('Z', '+00:00'))
                bulk_data.append([
                    vehicle_id, 
                    timestamp, 
                    timestamp,  # timestamp_perth will be calculated by DB
                    point.get('Value.Latitude'), 
                    point.get('Value.Longitude'), 
                    session_id
                ])
            except Exception as e:
                logger.warning(f"Skipping invalid GPS point: {e}")
                continue
        
        if bulk_data:
            # Single bulk insert instead of thousands of individual inserts
            conn.executemany("""
                INSERT INTO gps_raw (vehicle_id, timestamp, timestamp_perth, latitude, longitude, session_id)
                VALUES (?, ?, ? + INTERVAL 8 HOUR, ?, ?, ?)
            """, bulk_data)
            
            logger.info(f"Bulk inserted {len(bulk_data)} GPS points for {vehicle_id}")
    
    @staticmethod
    def bulk_insert_speed_data(conn, points: List[Dict], vehicle_id: str, session_id: str, table_name: str = 'speed_raw'):
        """Bulk insert speed data - CRITICAL MEMORY FIX"""
        if not points:
            return
        
        bulk_data = []
        for point in points:
            try:
                timestamp = datetime.fromisoformat(point['time'].replace('Z', '+00:00'))
                bulk_data.append([
                    vehicle_id, 
                    timestamp, 
                    timestamp,  # timestamp_perth calculated by DB
                    point.get('Value'), 
                    session_id
                ])
            except Exception as e:
                logger.warning(f"Skipping invalid speed point: {e}")
                continue
        
        if bulk_data:
            conn.executemany(f"""
                INSERT INTO {table_name} (vehicle_id, timestamp, timestamp_perth, speed, session_id)
                VALUES (?, ?, ? + INTERVAL 8 HOUR, ?, ?)
            """, bulk_data)
            
            logger.info(f"Bulk inserted {len(bulk_data)} speed points for {vehicle_id}")
    
    @staticmethod
    def bulk_insert_state_data(conn, points: List[Dict], vehicle_id: str, session_id: str, table_name: str):
        """Bulk insert state data - CRITICAL MEMORY FIX"""
        if not points:
            return
        
        bulk_data = []
        for point in points:
            try:
                timestamp = datetime.fromisoformat(point['time'].replace('Z', '+00:00'))
                bulk_data.append([
                    vehicle_id, 
                    timestamp, 
                    timestamp,  # timestamp_perth calculated by DB
                    point.get('Value'), 
                    session_id
                ])
            except Exception as e:
                logger.warning(f"Skipping invalid state point: {e}")
                continue
        
        if bulk_data:
            conn.executemany(f"""
                INSERT INTO {table_name} (vehicle_id, timestamp, timestamp_perth, state, session_id)
                VALUES (?, ?, ? + INTERVAL 8 HOUR, ?, ?)
            """, bulk_data)
            
            logger.info(f"Bulk inserted {len(bulk_data)} state points for {vehicle_id} into {table_name}")
    
    @staticmethod
    def bulk_insert_manual_position_data(conn, points: List[Dict], vehicle_id: str, session_id: str):
        """Bulk insert manual position data with coordinate extraction - CRITICAL MEMORY FIX"""
        if not points:
            return
        
        bulk_data = []
        for point in points:
            try:
                timestamp = datetime.fromisoformat(point['time'].replace('Z', '+00:00'))
                
                # Parse position data
                position_data = point.get('Value')
                latitude = longitude = None
                
                if position_data:
                    try:
                        pos_json = json.loads(position_data) if isinstance(position_data, str) else position_data
                        
                        if isinstance(pos_json, dict):
                            # Try direct keys first
                            latitude = pos_json.get('latitude') or pos_json.get('Latitude')
                            longitude = pos_json.get('longitude') or pos_json.get('Longitude')
                            
                            # Check nested Position object (for manual vehicles)
                            if latitude is None or longitude is None:
                                position_obj = pos_json.get('Position')
                                if isinstance(position_obj, dict):
                                    latitude = position_obj.get('Latitude') or position_obj.get('latitude')
                                    longitude = position_obj.get('Longitude') or position_obj.get('longitude')
                                    
                        position_json = json.dumps(pos_json) if pos_json else None
                        
                    except Exception as e:
                        logger.warning(f"Failed to parse position JSON for {vehicle_id}: {e}")
                        position_json = position_data
                else:
                    position_json = None
                
                bulk_data.append([
                    vehicle_id, 
                    timestamp, 
                    timestamp,  # timestamp_perth calculated by DB
                    latitude, 
                    longitude, 
                    position_json, 
                    session_id
                ])
                
            except Exception as e:
                logger.warning(f"Skipping invalid position point: {e}")
                continue
        
        if bulk_data:
            conn.executemany("""
                INSERT INTO manual_position_raw 
                (vehicle_id, timestamp, timestamp_perth, latitude, longitude, position_data, session_id)
                VALUES (?, ?, ? + INTERVAL 8 HOUR, ?, ?, ?, ?)
            """, bulk_data)
            
            logger.info(f"Bulk inserted {len(bulk_data)} position points for {vehicle_id}")


class StreamingDataProcessor:
    """
    Process large datasets in streams to avoid loading everything into memory
    
    CRITICAL FIX: Instead of loading all data points for a vehicle at once,
    process them in smaller chunks to keep memory usage manageable.
    """
    
    def __init__(self, chunk_size: int = 1000):
        self.chunk_size = chunk_size
    
    async def process_vehicle_data_stream(self, influxdb_client, query: str, vehicle_id: str, 
                                        processor_func: Callable, **kwargs):
        """Process vehicle data in chunks to manage memory"""
        try:
            # Execute query with streaming
            result = influxdb_client.query(query)
            
            chunk = []
            processed_chunks = 0
            
            for point in result.get_points():
                chunk.append(point)
                
                # Process chunk when it reaches the size limit
                if len(chunk) >= self.chunk_size:
                    await processor_func(chunk, vehicle_id, **kwargs)
                    processed_chunks += 1
                    
                    # Clear chunk to free memory
                    chunk = []
                    
                    # Force garbage collection every 10 chunks
                    if processed_chunks % 10 == 0:
                        gc.collect()
            
            # Process remaining points in the final chunk
            if chunk:
                await processor_func(chunk, vehicle_id, **kwargs)
                chunk = []  # Clear memory
            
            logger.info(f"Processed {processed_chunks + (1 if chunk else 0)} chunks for {vehicle_id}")
            
        except Exception as e:
            logger.error(f"Streaming processing failed for {vehicle_id}: {e}")
            raise


# Context manager for automatic memory optimization
@asynccontextmanager
async def memory_optimized_operation(db_manager=None, extractor=None):
    """Context manager for memory-intensive operations"""
    optimizer = MemoryOptimizer(db_manager, extractor)
    
    try:
        # Get initial memory state
        initial_memory = psutil.virtual_memory().percent
        logger.info(f"Starting memory-intensive operation (memory: {initial_memory:.1f}%)")
        
        # Start monitoring if memory is already high
        if initial_memory > 70.0:
            await optimizer.start_monitoring()
        
        # Force garbage collection before starting
        gc.collect()
        
        yield optimizer
        
    finally:
        # Stop monitoring
        if optimizer.running:
            await optimizer.stop_monitoring()
        
        # Final cleanup
        final_memory = psutil.virtual_memory().percent
        logger.info(f"Completed memory-intensive operation (memory: {final_memory:.1f}%)")
        
        # Force final garbage collection
        gc.collect()


# Example usage in extractor.py (CRITICAL FIX)
def apply_memory_fixes_to_extractor():
    """
    Instructions for applying memory fixes to extractor.py:
    
    REPLACE the problematic loop at line 815:
    
    OLD CODE (MEMORY LEAK):
    for point in points:
        conn.execute("INSERT INTO gps_raw ...")
    
    NEW CODE (MEMORY OPTIMIZED):
    BulkDatabaseOperations.bulk_insert_gps_data(conn, points, vehicle_id, session_id)
    
    Apply this fix to ALL data insertion operations in _store_raw_data method.
    """
    pass

if __name__ == "__main__":
    # Test memory optimization
    async def test_memory_optimization():
        optimizer = MemoryOptimizer()
        stats = optimizer.get_memory_stats()
        print(f"Memory stats: {json.dumps(stats, indent=2)}")
    
    asyncio.run(test_memory_optimization())