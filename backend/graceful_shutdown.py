"""
Graceful Shutdown Module for Mining Truck ETL System

Handles clean shutdown of the ETL system including:
- Cancelling active extraction jobs
- Closing database connections
- Cleaning up temporary files
- Proper resource cleanup
"""

import asyncio
import logging
import signal
import sys
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

class GracefulShutdown:
    """
    Manages graceful shutdown of the ETL system
    
    Handles SIGTERM, SIGINT signals and ensures clean shutdown by:
    1. Cancelling active extraction jobs
    2. Waiting for jobs to complete cleanup
    3. Closing database connections
    4. Cleaning up resources
    """
    
    def __init__(self, extractor=None, db_manager=None, resource_monitor=None):
        self.extractor = extractor
        self.db_manager = db_manager
        self.resource_monitor = resource_monitor
        self.shutdown_event = asyncio.Event()
        self.shutdown_timeout_seconds = 30
        self._signal_handlers_registered = False
        self._shutdown_in_progress = False
        
    async def setup(self):
        """Setup signal handlers for graceful shutdown"""
        if self._signal_handlers_registered:
            logger.warning("Signal handlers already registered")
            return
            
        try:
            # Register signal handlers for graceful shutdown
            loop = asyncio.get_event_loop()
            
            # Handle SIGTERM (typical Docker/systemd shutdown signal)
            if hasattr(signal, 'SIGTERM'):
                loop.add_signal_handler(
                    signal.SIGTERM, 
                    lambda: asyncio.create_task(self._signal_handler('SIGTERM'))
                )
            
            # Handle SIGINT (Ctrl+C)
            if hasattr(signal, 'SIGINT'):
                loop.add_signal_handler(
                    signal.SIGINT, 
                    lambda: asyncio.create_task(self._signal_handler('SIGINT'))
                )
            
            self._signal_handlers_registered = True
            logger.info("Graceful shutdown signal handlers registered")
            
        except Exception as e:
            logger.error(f"Failed to setup signal handlers: {e}")
            # Don't fail startup if signal handlers can't be registered
    
    async def _signal_handler(self, signal_name: str):
        """Handle shutdown signals"""
        if self._shutdown_in_progress:
            logger.warning(f"Received {signal_name} during shutdown - forcing immediate exit")
            sys.exit(1)
            
        logger.info(f"Received {signal_name} - initiating graceful shutdown")
        await self.shutdown()
    
    async def shutdown(self, timeout_seconds: Optional[int] = None):
        """
        Perform graceful shutdown of all system components
        
        Args:
            timeout_seconds: Maximum time to wait for clean shutdown
        """
        if self._shutdown_in_progress:
            logger.warning("Shutdown already in progress")
            return
            
        self._shutdown_in_progress = True
        timeout = timeout_seconds or self.shutdown_timeout_seconds
        
        try:
            logger.info("🛑 Starting graceful shutdown...")
            self.shutdown_event.set()
            
            # Phase 1: Cancel active extraction jobs
            if self.extractor:
                await self._cancel_active_jobs()
            
            # Phase 2: Wait for jobs to finish with timeout
            await self._wait_for_jobs_completion(timeout)
            
            # Phase 3: Stop resource monitoring
            if self.resource_monitor:
                await self._stop_resource_monitoring()
            
            # Phase 4: Cleanup database connections
            if self.db_manager:
                await self._cleanup_database()
            
            # Phase 5: Final resource cleanup
            await self._final_cleanup()
            
            logger.info("[SUCCESS] Graceful shutdown completed successfully")
            
        except asyncio.TimeoutError:
            logger.error(f"[TIMEOUT] Graceful shutdown timed out after {timeout}s - forcing exit")
            await self._force_cleanup()
        except Exception as e:
            logger.error(f"[ERROR] Error during graceful shutdown: {e}")
            await self._force_cleanup()
        finally:
            self._shutdown_in_progress = False
    
    async def _cancel_active_jobs(self):
        """Cancel all active extraction jobs"""
        try:
            if not hasattr(self.extractor, 'active_jobs'):
                logger.info("No active jobs to cancel")
                return
                
            active_jobs = list(self.extractor.active_jobs.items())
            if not active_jobs:
                logger.info("No active extraction jobs found")
                return
            
            logger.info(f"Cancelling {len(active_jobs)} active extraction jobs...")
            
            cancelled_count = 0
            for job_id, job in active_jobs:
                try:
                    # Check if job is actually running
                    if hasattr(job, 'status') and job.status == 'running':
                        logger.info(f"Cancelling extraction job {job_id}")
                        
                        # Call extractor's cancel method if available
                        if hasattr(self.extractor, 'cancel_job'):
                            await self.extractor.cancel_job(job_id)
                        else:
                            # Mark job as cancelled directly
                            job.status = 'cancelled'
                            job.completed_at = datetime.utcnow()
                            
                        cancelled_count += 1
                        
                except Exception as e:
                    logger.error(f"Failed to cancel job {job_id}: {e}")
            
            logger.info(f"Cancelled {cancelled_count} extraction jobs")
            
        except Exception as e:
            logger.error(f"Error cancelling active jobs: {e}")
    
    async def _wait_for_jobs_completion(self, timeout_seconds: int):
        """Wait for jobs to complete cleanup within timeout"""
        try:
            if not hasattr(self.extractor, 'active_jobs'):
                return
                
            start_time = asyncio.get_event_loop().time()
            
            while True:
                # Check if any jobs are still running
                running_jobs = []
                try:
                    for job_id, job in self.extractor.active_jobs.items():
                        if hasattr(job, 'status') and job.status == 'running':
                            running_jobs.append(job_id)
                except Exception as e:
                    logger.warning(f"Error checking job status: {e}")
                    break
                
                if not running_jobs:
                    logger.info("All extraction jobs have stopped")
                    break
                
                # Check timeout
                elapsed = asyncio.get_event_loop().time() - start_time
                if elapsed > timeout_seconds:
                    raise asyncio.TimeoutError(f"Jobs still running after {timeout_seconds}s: {running_jobs}")
                
                logger.info(f"Waiting for {len(running_jobs)} jobs to complete... ({elapsed:.1f}s/{timeout_seconds}s)")
                await asyncio.sleep(1)
                
        except asyncio.TimeoutError:
            raise
        except Exception as e:
            logger.error(f"Error waiting for job completion: {e}")
    
    async def _stop_resource_monitoring(self):
        """Stop resource monitoring"""
        try:
            if hasattr(self.resource_monitor, 'stop_monitoring'):
                logger.info("Stopping resource monitoring...")
                await self.resource_monitor.stop_monitoring()
            else:
                logger.info("Resource monitor does not support clean shutdown")
                
        except Exception as e:
            logger.error(f"Error stopping resource monitor: {e}")
    
    async def _cleanup_database(self):
        """Clean up database connections"""
        try:
            logger.info("Cleaning up database connections...")
            
            if hasattr(self.db_manager, 'cleanup'):
                # Use explicit cleanup method if available
                self.db_manager.cleanup()
            elif hasattr(self.db_manager, 'cleanup_connection_pool'):
                # Fall back to connection pool cleanup
                self.db_manager.cleanup_connection_pool()
            
            # Clean up temp files if method exists
            if hasattr(self.db_manager, 'cleanup_temp_files'):
                self.db_manager.cleanup_temp_files()
                
            logger.info("Database cleanup completed")
            
        except Exception as e:
            logger.error(f"Error during database cleanup: {e}")
    
    async def _final_cleanup(self):
        """Perform final resource cleanup"""
        try:
            logger.info("Performing final resource cleanup...")
            
            # Additional cleanup can be added here:
            # - Close file handles
            # - Clean up temporary files
            # - Send shutdown notifications
            # - Update status files
            
            logger.info("Final cleanup completed")
            
        except Exception as e:
            logger.error(f"Error during final cleanup: {e}")
    
    async def _force_cleanup(self):
        """Force cleanup when graceful shutdown fails"""
        try:
            logger.warning("Performing forced cleanup...")
            
            # Force close database connections
            if self.db_manager and hasattr(self.db_manager, 'cleanup_connection_pool'):
                try:
                    self.db_manager.cleanup_connection_pool()
                except:
                    pass
            
            # Force stop resource monitor
            if self.resource_monitor and hasattr(self.resource_monitor, 'stop_monitoring'):
                try:
                    await asyncio.wait_for(self.resource_monitor.stop_monitoring(), timeout=5)
                except:
                    pass
            
            logger.warning("Forced cleanup completed")
            
        except Exception as e:
            logger.error(f"Error during forced cleanup: {e}")
    
    def is_shutdown_requested(self) -> bool:
        """Check if shutdown has been requested"""
        return self.shutdown_event.is_set()
    
    async def wait_for_shutdown(self):
        """Wait for shutdown signal"""
        await self.shutdown_event.wait()

# Context manager for automatic shutdown handling
class ShutdownManager:
    """Context manager that ensures graceful shutdown"""
    
    def __init__(self, extractor=None, db_manager=None, resource_monitor=None):
        self.shutdown_handler = GracefulShutdown(extractor, db_manager, resource_monitor)
    
    async def __aenter__(self):
        await self.shutdown_handler.setup()
        return self.shutdown_handler
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if not self.shutdown_handler._shutdown_in_progress:
            await self.shutdown_handler.shutdown()

# Decorator for shutdown-aware functions
def shutdown_aware(shutdown_handler):
    """Decorator that makes functions aware of shutdown signals"""
    def decorator(func):
        async def wrapper(*args, **kwargs):
            if shutdown_handler.is_shutdown_requested():
                logger.info(f"Skipping {func.__name__} due to shutdown request")
                return None
            return await func(*args, **kwargs)
        return wrapper
    return decorator

# Example usage
async def example_startup():
    """Example of how to use graceful shutdown in your application"""
    
    # Initialize your components
    extractor = None  # Your extractor instance
    db_manager = None  # Your database manager
    resource_monitor = None  # Your resource monitor
    
    # Setup graceful shutdown
    async with ShutdownManager(extractor, db_manager, resource_monitor) as shutdown:
        logger.info("Application started with graceful shutdown support")
        
        # Your main application logic here
        try:
            while not shutdown.is_shutdown_requested():
                # Do your work
                await asyncio.sleep(1)
                
        except KeyboardInterrupt:
            logger.info("Received keyboard interrupt")
        
        logger.info("Application shutting down...")
        
    logger.info("Application shutdown complete")

if __name__ == "__main__":
    # Example usage
    asyncio.run(example_startup())