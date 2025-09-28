/**
 * Frontend Logger Utility
 * 
 * Comprehensive logging system for frontend debugging and error tracking.
 * Logs both to console and local storage for persistent debugging.
 */

import { buildApiUrl, shouldLogToConsole, getLogLevel } from '@/config/environment'

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'success' | 'warning' | 'error' | 'debug' | 'api';
  component: string;
  action: string;
  message: string;
  data?: any;
  error?: Error | string;
  duration?: number;
}

class FrontendLogger {
  private logs: LogEntry[] = [];
  private readonly MAX_LOGS = 1000;
  private readonly STORAGE_KEY = 'mining-frontend-logs';

  constructor() {
    this.loadLogsFromStorage();
  }

  private loadLogsFromStorage() {
    try {
      // Only access localStorage in browser environment
      if (typeof window !== 'undefined' && window.localStorage) {
        const storedLogs = localStorage.getItem(this.STORAGE_KEY);
        if (storedLogs) {
          this.logs = JSON.parse(storedLogs);
        }
      }
    } catch (error) {
      console.warn('Failed to load logs from storage:', error);
    }
  }

  private saveLogsToStorage() {
    try {
      // Only access localStorage in browser environment
      if (typeof window !== 'undefined' && window.localStorage) {
        // Keep only recent logs to prevent storage bloat
        const recentLogs = this.logs.slice(-this.MAX_LOGS);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(recentLogs));
        this.logs = recentLogs;
      }
    } catch (error) {
      console.warn('Failed to save logs to storage:', error);
    }
  }

  private async saveLogToFile(entry: LogEntry) {
    try {
      // Send log entry to backend for file storage
      await fetch(buildApiUrl('/frontend-log'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(entry)
      });
    } catch (error) {
      // Silently fail - don't spam console if backend is down
    }
  }

  private createLogEntry(
    level: LogEntry['level'],
    component: string,
    action: string,
    message: string,
    data?: any,
    error?: Error | string,
    duration?: number
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      component,
      action,
      message,
      data,
      error: error instanceof Error ? error.message : error,
      duration
    };
  }

  private log(entry: LogEntry) {
    // Add to internal logs
    this.logs.push(entry);

    // Also save to backend file
    this.saveLogToFile(entry);

    // Console output with colors and formatting
    const timestamp = new Date(entry.timestamp).toLocaleTimeString();
    const prefix = `🗺️ [FRONTEND-${entry.level.toUpperCase()}] ${timestamp} ${entry.component}::${entry.action}`;
    
    switch (entry.level) {
      case 'info':
        console.log(`%c${prefix}`, 'color: #3b82f6', entry.message, entry.data || '');
        break;
      case 'success':
        console.log(`%c${prefix}`, 'color: #10b981', entry.message, entry.data || '');
        break;
      case 'warning':
        console.warn(`%c${prefix}`, 'color: #f59e0b', entry.message, entry.data || '');
        break;
      case 'error':
        console.error(`%c${prefix}`, 'color: #ef4444', entry.message, entry.error || entry.data || '');
        break;
      case 'debug':
        console.log(`%c${prefix}`, 'color: #8b5cf6', entry.message, entry.data || '');
        break;
      case 'api':
        console.log(`%c${prefix}`, 'color: #06b6d4', entry.message, entry.data || '');
        if (entry.duration) {
          console.log(`%c⚡ API Response Time: ${entry.duration.toFixed(2)}ms`, 'color: #06b6d4; font-weight: bold');
        }
        break;
    }

    // Save to storage periodically
    if (this.logs.length % 10 === 0) {
      this.saveLogsToStorage();
    }

    // Send to backend file logging (async, don't await to avoid blocking)
    this.sendToBackendLog(entry);
  }

  private async sendToBackendLog(entry: LogEntry) {
    try {
      // Only send critical errors and warnings to backend file (minimal logging)
      if (entry.level !== 'error' && entry.level !== 'warning') return;

      await fetch(buildApiUrl('/frontend-logs'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
    } catch (error) {
      // Silently ignore backend logging failures to prevent infinite loops
      // Backend might be down or CORS might be blocking
    }
  }

  info(component: string, action: string, message: string, data?: any) {
    this.log(this.createLogEntry('info', component, action, message, data));
  }

  success(component: string, action: string, message: string, data?: any, duration?: number) {
    this.log(this.createLogEntry('success', component, action, message, data, undefined, duration));
  }

  warning(component: string, action: string, message: string, data?: any) {
    this.log(this.createLogEntry('warning', component, action, message, data));
  }

  error(component: string, action: string, message: string, error?: Error | string, data?: any) {
    this.log(this.createLogEntry('error', component, action, message, data, error));
  }

  debug(component: string, action: string, message: string, data?: any) {
    this.log(this.createLogEntry('debug', component, action, message, data));
  }

  api(component: string, action: string, message: string, data?: any, duration?: number) {
    this.log(this.createLogEntry('api', component, action, message, data, undefined, duration));
  }

  // Performance tracking helper
  startTimer(component: string, action: string): () => void {
    const startTime = performance.now();
    return () => {
      const duration = performance.now() - startTime;
      this.success(component, action, `Completed in ${duration.toFixed(2)}ms`, undefined, duration);
    };
  }

  // API call tracking helper
  async trackApiCall<T>(
    component: string,
    action: string,
    apiCall: () => Promise<T>,
    requestData?: any
  ): Promise<T> {
    const startTime = performance.now();
    this.api(component, action, 'Starting API call', requestData);
    
    try {
      const result = await apiCall();
      const duration = performance.now() - startTime;
      this.api(component, action, 'API call successful', { result }, duration);
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      this.error(component, action, 'API call failed', error as Error, { requestData, duration });
      throw error;
    }
  }

  // Get logs for debugging
  getLogs(component?: string, level?: LogEntry['level'], limit?: number): LogEntry[] {
    let filteredLogs = this.logs;

    if (component) {
      filteredLogs = filteredLogs.filter(log => log.component === component);
    }

    if (level) {
      filteredLogs = filteredLogs.filter(log => log.level === level);
    }

    if (limit) {
      filteredLogs = filteredLogs.slice(-limit);
    }

    return filteredLogs;
  }

  // Export logs for analysis
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }

  // Clear logs
  clearLogs() {
    this.logs = [];
    localStorage.removeItem(this.STORAGE_KEY);
    console.log('🗑️ Frontend logs cleared');
  }

  // Get recent errors for debugging
  getRecentErrors(minutes: number = 10): LogEntry[] {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    return this.logs.filter(
      log => log.level === 'error' && new Date(log.timestamp) > cutoff
    );
  }

  // Log component lifecycle events
  componentMounted(component: string, props?: any) {
    this.debug(component, 'mount', 'Component mounted', props);
  }

  componentUnmounted(component: string) {
    this.debug(component, 'unmount', 'Component unmounted');
  }

  // Log user interactions
  userAction(component: string, action: string, details?: any) {
    this.info(component, 'user-action', `User ${action}`, details);
  }

  // Log state changes
  stateChange(component: string, stateName: string, newValue: any, oldValue?: any) {
    this.debug(component, 'state-change', `${stateName} changed`, { 
      from: oldValue, 
      to: newValue 
    });
  }
}

// Create singleton instance
export const frontendLogger = new FrontendLogger();

// Helper function to create component-specific logger
export function createComponentLogger(componentName: string) {
  return {
    info: (action: string, message: string, data?: any) => 
      frontendLogger.info(componentName, action, message, data),
    success: (action: string, message: string, data?: any, duration?: number) => 
      frontendLogger.success(componentName, action, message, data, duration),
    warning: (action: string, message: string, data?: any) => 
      frontendLogger.warning(componentName, action, message, data),
    error: (action: string, message: string, error?: Error | string, data?: any) => 
      frontendLogger.error(componentName, action, message, error, data),
    debug: (action: string, message: string, data?: any) => 
      frontendLogger.debug(componentName, action, message, data),
    api: (action: string, message: string, data?: any, duration?: number) => 
      frontendLogger.api(componentName, action, message, data, duration),
    startTimer: (action: string) => frontendLogger.startTimer(componentName, action),
    trackApiCall: <T>(action: string, apiCall: () => Promise<T>, requestData?: any) => 
      frontendLogger.trackApiCall(componentName, action, apiCall, requestData),
    mounted: (props?: any) => frontendLogger.componentMounted(componentName, props),
    unmounted: () => frontendLogger.componentUnmounted(componentName),
    userAction: (action: string, details?: any) => 
      frontendLogger.userAction(componentName, action, details),
    stateChange: (stateName: string, newValue: any, oldValue?: any) => 
      frontendLogger.stateChange(componentName, stateName, newValue, oldValue)
  };
}

// Export for debugging in browser console
if (typeof window !== 'undefined') {
  (window as any).frontendLogger = frontendLogger;
  console.log('🗺️ Frontend Logger available as window.frontendLogger');
  console.log('Use frontendLogger.getLogs() to view logs or frontendLogger.exportLogs() to export');
}