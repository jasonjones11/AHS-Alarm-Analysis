'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { convertLocalInputToTimestamp, getPerthTimezoneInfo } from '@/utils/timeUtils';
import { createComponentLogger } from '@/utils/frontendLogger';
import { buildApiUrl } from '@/config/environment';

import { ExtractedData, ExtractedDataWithMeta } from '@/types/truck';

interface DataExtractionPanelProps {
  onExtractionComplete: (data: ExtractedDataWithMeta) => void;
  previouslyExtractedData: ExtractedDataWithMeta | null;
  onSkipToMap?: () => void;
}

interface ExtractionStatus {
  status: 'pending' | 'running' | 'completed' | 'failed';
  message: string;
  progress: number;
  trucks_found: number;
  data_points_extracted: number;
  error_details?: string;
  extracted_data?: ExtractedData;
  current_operation?: string;
  current_vehicle?: string;
  current_measurement?: string;
  vehicles_processed?: number;
  total_vehicles?: number;
  table_breakdown?: {
    gps_positions: number;
    velocity_data: number;
    offpath_errors: number;
    motion_controller_states: number;
    asset_activity_states: number;
    haulage_states: number;
  };
}

export default function DataExtractionPanel({ onExtractionComplete, previouslyExtractedData, onSkipToMap }: DataExtractionPanelProps) {
  // Create logger for this component
  const logger = createComponentLogger('DataExtractionPanel');

  // All useState hooks must be called in the same order every time
  const [influxHost, setInfluxHost] = useState('10.84.126.5');
  const [influxPort, setInfluxPort] = useState(8086);
  const [influxDatabase, setInfluxDatabase] = useState('MobiusLog');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [selectedAlarms, setSelectedAlarms] = useState<string[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionStatus, setExtractionStatus] = useState<ExtractionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load alarm types from API (from alarm_types.json configuration)
  const [availableAlarmTypes, setAvailableAlarmTypes] = useState<string[]>([
    // Fallback defaults while loading from API
    "Dump Bed Cannot Be Raised While Vehicle Tilted",
    "Tilt exceeded with dump bed raised",
    "Off Path",
    "Steering Restricted",
    "Bump Detected: Dump",
    "Bump Detected: Close",
    "Undocumented Error c419",
    "Failed to Drive When Commanded",
    "Slippery Conditions Caused Vehicle To Stop"
  ]);

  // Load alarm types from backend API
  const loadAlarmTypesFromAPI = useCallback(async () => {
    try {
      const response = await fetch(buildApiUrl('/alarm-types'))
      if (response.ok) {
        const result = await response.json()
        if (result.status === 'success' && result.data?.current_alarm_types) {
          setAvailableAlarmTypes(result.data.current_alarm_types)
          console.log('[DataExtraction] Loaded alarm types from API:', result.data.current_alarm_types)
        }
      }
    } catch (error) {
      console.warn('[DataExtraction] Failed to load alarm types from API, using defaults:', error)
    }
  }, [])

  // Load alarm types on component mount
  useEffect(() => {
    loadAlarmTypesFromAPI()
  }, [loadAlarmTypesFromAPI])

  // Set default time range (2 hours ending now) in Perth time for alarm analysis
  useEffect(() => {
    // Get current UTC time
    const nowUTC = new Date();
    
    // Perth is UTC+8 (AWST), so add 8 hours to UTC to get Perth time
    const perthOffset = 8; // hours
    const perthNow = new Date(nowUTC.getTime() + (perthOffset * 60 * 60 * 1000));
    const twoHoursAgo = new Date(perthNow.getTime() - 2 * 60 * 60 * 1000);
    
    // Format for datetime-local input (YYYY-MM-DDTHH:MM)
    const formatDateTime = (date: Date) => {
      return date.toISOString().slice(0, 16);
    };
    
    setEndTime(formatDateTime(perthNow));
    setStartTime(formatDateTime(twoHoursAgo));
    
    // Debug logging for time verification
    console.log('Perth time initialized - Start:', formatDateTime(twoHoursAgo), 'End:', formatDateTime(perthNow));
  }, []);

  // Cleanup extraction on browser close/refresh
  useEffect(() => {
    const handleBeforeUnload = async (event: BeforeUnloadEvent) => {
      if (isExtracting) {
        event.preventDefault();
        event.returnValue = 'Data extraction is in progress. Leaving will stop the extraction interface.';
        return event.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isExtracting]);

  const getDurationHours = (): number => {
    if (!startTime || !endTime) return 0;
    const start = new Date(startTime);
    const end = new Date(endTime);
    return (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  };

  const validateExtractionRequest = (): boolean => {
    if (!startTime || !endTime) {
      setError('Both start and end times are required');
      return false;
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationHours = getDurationHours();

    if (durationHours <= 0) {
      setError('End time must be after start time');
      return false;
    }

    if (durationHours > 30) {
      setError('Time range cannot exceed 30 hours for alarm analysis');
      return false;
    }

    if (selectedAlarms.length === 0) {
      setError('Please select at least one alarm type to analyze');
      return false;
    }

    return true;
  };


  const startExtraction = async () => {
    setError(null);
    
    // Validate extraction request before proceeding
    const validationResult = validateExtractionRequest();
    if (!validationResult) {
      return;
    }

    setIsExtracting(true);
    // Immediately show progress panel when extraction starts
    setExtractionStatus({
      status: 'pending',
      message: 'Preparing data extraction...',
      progress: 0,
      trucks_found: 0,
      data_points_extracted: 0,
      current_operation: 'Initializing extraction process'
    });

    try {
      // Step 1: Clear existing database data to prevent duplication and ensure clean playback
      console.log('🗑️ Step 1: Clearing existing database data before extraction...');
      setExtractionStatus(prev => prev ? {
        ...prev,
        message: 'Clearing existing database data...',
        progress: 2,
        current_operation: 'Database cleanup in progress'
      } : null);
      
      const clearResponse = await fetch(buildApiUrl('/clear-database'), {
        method: 'DELETE',
      });
      
      if (!clearResponse.ok) {
        throw new Error('Failed to clear existing database data');
      }
      
      const clearResult = await clearResponse.json();
      console.log('✅ Database cleared successfully:', clearResult);
      console.log(`🗑️ Removed ${clearResult.total_records_cleared?.toLocaleString() || 0} existing records`);
      
      setExtractionStatus(prev => prev ? {
        ...prev,
        message: 'Database cleared - preparing fresh extraction...',
        progress: 5,
        current_operation: 'Ready to start extraction'
      } : null);
      
      // Brief pause to show cleanup completed
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Step 2: Start fresh extraction
      console.log('🚀 Step 2: Starting fresh data extraction...');

      const extractionRequest = {
        influxdb_config: {
          host: influxHost,
          port: influxPort,
          database: influxDatabase
        },
        time_range: {
          // Convert local input to proper timestamp format for backend
          start: convertLocalInputToTimestamp(startTime),
          end: convertLocalInputToTimestamp(endTime)
        },
        alarm_filter: {
          selected_alarms: selectedAlarms,
          include_autonomous: true  // Always extract for all autonomous vehicles
        }
      };

      // DETAILED LOGGING of what frontend is sending
      console.log('🚀 FRONTEND SENDING ALARM EXTRACTION REQUEST:');
      console.log('====================================');
      console.log('Raw startTime input:', startTime);
      console.log('Raw endTime input:', endTime);
      console.log('Converted start:', convertLocalInputToTimestamp(startTime));
      console.log('Converted end:', convertLocalInputToTimestamp(endTime));
      
      // ALARM SELECTION LOGIC EXPLANATION
      console.log('🚨 ALARM ANALYSIS LOGIC:');
      console.log('- selected_alarms:', extractionRequest.alarm_filter.selected_alarms, 
        '(will find events for these alarm types)');
      console.log('- include_autonomous:', extractionRequest.alarm_filter.include_autonomous,
        '(will extract telemetry for all autonomous vehicles with alarms)');
      console.log('- alarm count:', selectedAlarms.length, 'out of', availableAlarmTypes.length, 'available types');
      
      console.log('Full request object:', JSON.stringify(extractionRequest, null, 2));
      console.log('====================================');

      const response = await fetch(buildApiUrl('/extract-data'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(extractionRequest)
      });

      if (!response.ok) {
        // Try to get detailed error message from response
        let errorMessage = `Extraction failed: ${response.statusText}`;
        try {
          const errorData = await response.json();
          if (errorData.detail) {
            // Handle validation errors array
            if (Array.isArray(errorData.detail)) {
              const validationErrors = errorData.detail.map((err: any) => 
                `${err.loc?.join('.')} - ${err.msg || err.message || 'Validation error'}`
              ).join('; ');
              errorMessage = `Validation Error: ${validationErrors}`;
            } else if (typeof errorData.detail === 'string') {
              errorMessage = `Error: ${errorData.detail}`;
            } else {
              errorMessage = `Error: ${JSON.stringify(errorData.detail)}`;
            }
          } else if (errorData.message) {
            errorMessage = `Error: ${errorData.message}`;
          }
        } catch (parseError) {
          // If we can't parse the error, use the status text
          console.warn('Could not parse error response:', parseError);
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log('✅ Extraction started successfully:', result);
      
      // Use job_id from the response (not extraction_id)
      const jobId = result.job_id;
      console.log('EXTRACTION: Got job ID from backend:', jobId);
      logger.info('startExtraction', 'Got extraction ID', { jobId });
      
      // Update status to show extraction is starting
      // Set initial status with estimated vehicle count to show progress context
      const estimatedVehicles = 10; // Estimate for autonomous trucks (alarm analysis discovers all trucks)
      
      setExtractionStatus({
        status: 'running',
        message: 'Extraction in progress...',
        progress: 5,
        trucks_found: estimatedVehicles,
        data_points_extracted: 0,
        current_operation: 'Connecting to InfluxDB and discovering vehicles',
        vehicles_processed: 0,
        total_vehicles: estimatedVehicles
      });
      
      console.log('EXTRACTION: About to start polling for job:', jobId);
      // Start polling immediately without delay
      pollExtractionStatus(jobId);
      console.log('EXTRACTION: Polling function called');

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setIsExtracting(false);
    }
  };

  // Extract the skip data extraction logic into a separate function
  const handleSkipExtraction = async () => {
    console.log('🗺️ Skip extraction - loading existing data from DuckDB');
    setIsExtracting(true);
    setError(null);
    
    try {
      // Fetch available trucks from DuckDB
      const response = await fetch(buildApiUrl('/trucks'));
      if (!response.ok) {
        throw new Error('Failed to fetch existing truck data');
      }
      
      const trucksData = await response.json();
      console.log('Existing trucks data:', trucksData);
      
      if (trucksData.vehicles && trucksData.vehicles.length > 0) {
        // Create ExtractedData format from DuckDB vehicles  
        const extractedData: ExtractedData = {};
        
        // For each vehicle, fetch its trajectory data (prefer optimized snapshots)
        for (const truck of trucksData.vehicles) {
          try {
            // First try optimized 1-second snapshots for better performance
            let dataResponse = await fetch(buildApiUrl(`/snapshots/${truck.vehicle_id}`));
            let useSnapshots = false;
            
            if (dataResponse.ok) {
              const snapshotData = await dataResponse.json();
              if (snapshotData.data && snapshotData.data.length > 0) {
                extractedData[truck.vehicle_id] = snapshotData.data;
                useSnapshots = true;
                console.log(`🚀 Loaded ${snapshotData.data.length} optimized snapshots for ${truck.vehicle_id} (95% faster)`);
              }
            }
            
            // Fallback to regular data if snapshots not available
            if (!useSnapshots) {
              dataResponse = await fetch(buildApiUrl(`/data/${truck.vehicle_id}`));
              if (dataResponse.ok) {
                const vehicleData = await dataResponse.json();
                if (vehicleData.data && vehicleData.data.length > 0) {
                  extractedData[truck.vehicle_id] = vehicleData.data;
                  console.log(`✅ Loaded ${vehicleData.data.length} raw data points for ${truck.vehicle_id}`);
                }
              }
            }
            
            // Also fetch alarm data for this vehicle
            try {
              const alarmResponse = await fetch(buildApiUrl(`/alarms/${truck.vehicle_id}`));
              if (alarmResponse.ok) {
                const alarmData = await alarmResponse.json();
                if (alarmData.alarms && alarmData.alarms.length > 0) {
                  // Store alarm data in a separate property for map visualization
                  const extractedDataWithMeta = extractedData as ExtractedDataWithMeta;
                  if (!extractedDataWithMeta.alarms) extractedDataWithMeta.alarms = {};
                  extractedDataWithMeta.alarms[truck.vehicle_id] = alarmData.alarms;
                  console.log(`🚨 Loaded ${alarmData.alarms.length} alarms for ${truck.vehicle_id}`);
                }
              }
            } catch (alarmErr) {
              console.warn(`Failed to load alarms for ${truck.vehicle_id}:`, alarmErr);
            }
            
          } catch (err) {
            console.warn(`Failed to load data for ${truck.vehicle_id}:`, err);
          }
        }
        
        // Add user time range metadata for correct playback duration
        const dataWithMetadata: ExtractedDataWithMeta = {
          ...extractedData
        };
        dataWithMetadata.metadata = {
          userTimeRange: {
            start: convertLocalInputToTimestamp(startTime),
            end: convertLocalInputToTimestamp(endTime)
          }
        };
        
        console.log(`🗺️ Successfully loaded existing data for ${Object.keys(extractedData).length} vehicles`);
        console.log(`🕒 Playback will use user time range: ${convertLocalInputToTimestamp(startTime)} to ${convertLocalInputToTimestamp(endTime)}`);
        onExtractionComplete(dataWithMetadata);
      } else {
        console.log('No existing vehicle data found in DuckDB');
        onExtractionComplete({});
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load existing data';
      console.error('Error loading existing data:', errorMessage);
      setError(`Failed to load existing data: ${errorMessage}`);
    } finally {
      setIsExtracting(false);
    }
  };

  const pollExtractionStatus = async (extractionId: string) => {
    console.log('POLLING: Starting for extraction', extractionId);
    
    let pollCount = 0;
    let pollTimer: NodeJS.Timeout;
    
    const poll = () => {
      // Clear any existing timer
      if (pollTimer) clearTimeout(pollTimer);
      
      pollCount++;
      console.log('POLLING: Attempt', pollCount, 'for', extractionId);
      
      fetch(buildApiUrl(`/extract/${extractionId}`), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })
        .then(response => {
          console.log('POLLING: Response', response.status, response.statusText);
          if (!response.ok) {
            return response.text().then(text => {
              throw new Error(`Status ${response.status}: ${text}`);
            });
          }
          return response.json();
        })
        .then(rawStatus => {
          console.log('POLLING: Raw status received:', rawStatus);
          
          const status: ExtractionStatus = {
            status: rawStatus.status || 'running',
            message: rawStatus.message || 'Processing...',
            progress: rawStatus.progress || 0,
            trucks_found: rawStatus.vehicles_found || 0,
            data_points_extracted: rawStatus.data_points_extracted || 0,
            error_details: rawStatus.error_details,
            current_operation: rawStatus.current_operation || 'Processing vehicles',
            current_vehicle: rawStatus.current_vehicle,
            current_measurement: rawStatus.current_measurement,
            vehicles_processed: rawStatus.vehicles_processed || 0,
            total_vehicles: rawStatus.vehicles_found || 0
          };
          
          console.log('POLLING: Mapped status:', {
            status: status.status,
            progress: status.progress,
            current_operation: status.current_operation,
            vehicles_processed: status.vehicles_processed,
            total_vehicles: status.total_vehicles
          });
          
          setExtractionStatus(status);

          if (status.status === 'completed' || status.status === 'failed') {
            console.log('POLLING: Extraction finished with status:', status.status);
            logger.info('polling', 'Extraction finished', { status: status.status });
            setIsExtracting(false);
            if (status.status === 'failed') {
              setError(status.error_details || 'Extraction failed');
            }
          } else if (pollCount < 600) {
            // Continue polling more frequently to catch intermediate states
            console.log('POLLING: Scheduling next poll in 500ms');
            pollTimer = setTimeout(poll, 500);
          } else {
            console.error('POLLING: Max attempts reached');
            logger.error('polling', 'Polling timeout - max attempts reached');
            setIsExtracting(false);
            setError('Polling timeout - extraction may still be running.');
          }
        })
        .catch(err => {
          console.error('POLLING: Error occurred:', err.message);
          if (pollCount < 600) {
            console.log('POLLING: Retrying in 1000ms due to error');
            pollTimer = setTimeout(poll, 1000);
          } else {
            console.error('POLLING: Max attempts reached after error');
            logger.error('polling', 'Polling failed after max attempts', err);
            setIsExtracting(false);
            setError('Polling failed - extraction may still be running.');
          }
        });
    };
    
    // Start polling immediately - no delay for first poll
    console.log('POLLING: Starting first poll immediately for', extractionId);
    poll();
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-[#425563] rounded-lg shadow-2xl border-2 border-black/50 font-raleway">
      <div className="px-6 py-4 border-b-2 border-black/50 bg-[#425563] rounded-t-lg shadow-lg relative">
        <div className="absolute inset-0 bg-gradient-to-r from-[#425563] via-[#4a5f6f] to-[#425563] rounded-t-lg"></div>
        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#ffc726] flex items-center space-x-3 drop-shadow-md">
              <div className="p-1 bg-[#ffc726]/20 rounded border border-[#ffc726]/30">
                <svg className="w-4 h-4 text-[#ffc726]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </div>
              <span>Extract New Data</span>
            </h2>
            <p className="text-[#ffc726] text-sm mt-2 drop-shadow-sm">Analyze alarm events with telemetry data (GPS, speed, pitch, roll) from InfluxDB</p>
            </div>
          </div>
        </div>
      </div>
      <div className="p-6 space-y-6">
        
        {/* InfluxDB Configuration */}
        <div className="space-y-4 bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h3 className="text-lg font-semibold text-gray-200 flex items-center space-x-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            <span>InfluxDB Configuration</span>
          </h3>
          <div className="max-w-md">
            <label htmlFor="influx-host" className="block text-sm font-medium text-gray-300 mb-1">Host IP Address</label>
            <input
              id="influx-host"
              type="text"
              value={influxHost}
              onChange={(e) => setInfluxHost(e.target.value)}
              placeholder="10.84.126.5"
              disabled={isExtracting}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-600 disabled:opacity-50 text-gray-100 placeholder-gray-400"
            />
            <p className="text-xs text-gray-400 mt-1">Port: 8086 | Database: MobiusLog</p>
          </div>
        </div>

        {/* Time Range Configuration */}
        <div className="space-y-4 bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h3 className="text-lg font-semibold text-gray-200 flex items-center space-x-2">
            <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
            <span>Time Range</span>
            <span className="text-xs text-white bg-[#b7312c] px-2 py-1 rounded">Max 30 hours</span>
            {startTime && endTime && (
              <span className={`text-xs px-2 py-1 rounded ${
                getDurationHours() > 30 
                  ? 'text-red-300 bg-red-900' 
                  : 'text-gray-400 bg-gray-700'
              }`}>
                Duration: {getDurationHours().toFixed(1)}h
              </span>
            )}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="start-time" className="block text-sm font-medium text-gray-300 mb-1">Start Time</label>
              <input
                id="start-time"
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={isExtracting}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-600 disabled:opacity-50 text-gray-100"
              />
              <p className="text-xs text-gray-400 mt-1">Perth local time ({getPerthTimezoneInfo().abbreviation})</p>
            </div>
            <div>
              <label htmlFor="end-time" className="block text-sm font-medium text-gray-300 mb-1">End Time</label>
              <input
                id="end-time"
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                disabled={isExtracting}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-600 disabled:opacity-50 text-gray-100"
              />
              <p className="text-xs text-gray-400 mt-1">Perth local time ({getPerthTimezoneInfo().abbreviation})</p>
            </div>
          </div>
        </div>

        {/* Alarm Selection */}
        <div className="space-y-4 bg-gray-800 rounded-lg p-4 border border-gray-700">
          <h3 className="text-lg font-semibold text-gray-200 flex items-center space-x-2">
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            <span>Alarm Types to Analyze</span>
            <span className="text-xs text-white bg-[#425563] px-2 py-1 rounded">
              {selectedAlarms.length} selected
            </span>
          </h3>
          <div className="space-y-3">
            <div className="flex items-center space-x-3 mb-3">
              <button
                onClick={() => setSelectedAlarms(availableAlarmTypes)}
                disabled={isExtracting}
                className="px-3 py-1 text-xs bg-[#86c8bc] text-[#001e32] rounded hover:bg-[#7bb8ac] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Select All
              </button>
              <button
                onClick={() => setSelectedAlarms([])}
                disabled={isExtracting}
                className="px-3 py-1 text-xs bg-[#425563] text-white rounded hover:bg-[#556474] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clear All
              </button>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-2">
              {availableAlarmTypes.map((alarmType, index) => (
                <div key={index} className="flex items-start space-x-3 bg-gray-700 p-2 rounded-md">
                  <input
                    type="checkbox"
                    id={`alarm-${index}`}
                    checked={selectedAlarms.includes(alarmType)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedAlarms([...selectedAlarms, alarmType]);
                      } else {
                        setSelectedAlarms(selectedAlarms.filter(a => a !== alarmType));
                      }
                    }}
                    disabled={isExtracting}
                    className="w-4 h-4 text-red-600 bg-gray-600 border-gray-500 rounded focus:ring-red-500 focus:ring-2 mt-0.5"
                  />
                  <label htmlFor={`alarm-${index}`} className="text-sm text-gray-200 cursor-pointer leading-tight">
                    {alarmType}
                  </label>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              System will extract telemetry data (GPS, speed, pitch, roll, off-path error) for all autonomous vehicles at timestamps when selected alarms occurred.
            </p>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="border border-red-500 bg-red-900 bg-opacity-50 rounded-md p-4">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-red-500 rounded-full"></div>
              <p className="text-red-200 text-sm font-medium">
                {error}
              </p>
            </div>
          </div>
        )}

        {/* Extraction Status */}
        {extractionStatus && (() => {
          console.log('Rendering extraction status UI:', extractionStatus.status, extractionStatus.progress);
          return (
            <div className="space-y-3 bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-gray-200 flex items-center space-x-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                  <span>Extraction Progress</span>
                </h4>
                <span className="text-sm text-blue-400 capitalize bg-blue-900 px-2 py-1 rounded">
                  {extractionStatus.status}
                </span>
              </div>
            
            <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-[#ffc726] to-[#ffb000] h-3 rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                style={{ width: `${extractionStatus.progress}%` }}
              >
                {extractionStatus.progress > 20 && (
                  <span className="text-xs text-[#425563] font-semibold">
                    {extractionStatus.progress}%
                  </span>
                )}
              </div>
            </div>
            
            <div className="text-sm text-gray-300 space-y-2">
              <p className="text-gray-200">{extractionStatus.message}</p>
              
              {/* Detailed progress information */}
              {extractionStatus.current_operation && (
                <div className="bg-[#425563] bg-opacity-50 rounded-md p-2 border border-[#425563] border-opacity-50">
                  <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-[#ffc726] rounded-full animate-pulse"></div>
                    <span className="text-[#ffc726] font-medium">{extractionStatus.current_operation}</span>
                  </div>
                  {extractionStatus.current_vehicle && (
                    <div className="text-xs text-gray-200 mt-1 ml-4">
                      Vehicle: {extractionStatus.current_vehicle}
                    </div>
                  )}
                  {extractionStatus.current_measurement && (
                    <div className="text-xs text-gray-200 mt-1 ml-4">
                      Extracting: {extractionStatus.current_measurement}
                    </div>
                  )}
                  {extractionStatus.vehicles_processed !== undefined && extractionStatus.total_vehicles && (
                    <div className="text-xs text-gray-200 mt-1 ml-4">
                      Progress: {extractionStatus.vehicles_processed}/{extractionStatus.total_vehicles} vehicles
                    </div>
                  )}
                </div>
              )}
              
              {extractionStatus.trucks_found > 0 && (
                <div className="flex items-center space-x-4 text-gray-400">
                  <span className="flex items-center space-x-1">
                    <Image 
                      src="/icons/Haul Truck - CAT - Loaded.png" 
                      alt="Trucks" 
                      width={14} 
                      height={14}
                      className="filter brightness-0 invert opacity-60"
                    />
                    <span>{extractionStatus.trucks_found} trucks</span>
                  </span>
                  <span>•</span>
                  <span>{extractionStatus.data_points_extracted.toLocaleString()} data points</span>
                </div>
              )}
            </div>
          </div>
        )})()}

        {/* Three Buttons in One Row at Bottom */}
        <div className="space-y-3">
          {!isExtracting ? (
            <div className="space-y-4">
              {/* Main Start Button - Full Width */}
              <button
                onClick={startExtraction}
                disabled={getDurationHours() > 30 || getDurationHours() <= 0 || selectedAlarms.length === 0}
                className="w-full py-4 px-6 text-lg font-semibold text-[#425563] bg-gradient-to-r from-[#ffc726] to-[#ffb000] hover:from-[#ffb000] hover:to-[#ff9500] disabled:from-gray-600 disabled:to-gray-500 disabled:cursor-not-allowed rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl disabled:shadow-none flex items-center justify-center space-x-3"
              >
                <span>🚨</span>
                <span>
                  {getDurationHours() > 30
                    ? 'Duration exceeds 30 hour limit'
                    : getDurationHours() <= 0
                      ? 'Invalid time range'
                      : selectedAlarms.length === 0
                        ? 'Please select alarm types'
                        : 'Start Data Extraction'
                  }
                </span>
              </button>

              {/* Two Buttons in One Row */}
              <div className="flex gap-3">
                {/* Skip Data Extraction Button */}
                <button
                  onClick={handleSkipExtraction}
                  disabled={isExtracting}
                  className="flex-1 py-3 px-4 text-sm font-medium text-[#425563] bg-gradient-to-r from-[#ffc726] to-[#ffb000] hover:from-[#ffb000] hover:to-[#ff9500] disabled:from-gray-600 disabled:to-gray-500 disabled:text-gray-400 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg disabled:shadow-none flex items-center justify-center space-x-2 border border-[#ffc726] disabled:border-gray-500"
                >
                  <span>🗄️</span>
                  <span>
                    {isExtracting
                      ? 'Loading...'
                      : 'Skip Extraction'
                    }
                  </span>
                  {isExtracting && (
                    <div className="w-4 h-4 border-2 border-purple-300 border-t-transparent rounded-full animate-spin"></div>
                  )}
                </button>

                {/* Clear Logs Button */}
                <button
                  onClick={async () => {
                    console.log('🗑️ Clearing backend logs...');
                    try {
                      const response = await fetch(buildApiUrl('/clear-logs'), {
                        method: 'DELETE',
                      });

                      if (!response.ok) {
                        throw new Error('Failed to clear logs');
                      }

                      const result = await response.json();
                      console.log('✅ Logs cleared successfully:', result);
                      alert(`✅ ${result.message}`);
                    } catch (err) {
                      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
                      console.error('❌ Error clearing logs:', errorMessage);
                      alert(`❌ Failed to clear logs: ${errorMessage}`);
                    }
                  }}
                  className="flex-1 py-3 px-4 text-sm font-medium text-[#001e32] bg-[#ffc726] hover:bg-[#ffb000] rounded-lg transition-all duration-200 flex items-center justify-center space-x-2 border border-[#ffc726] font-raleway shadow-md hover:shadow-lg"
                >
                  <span>🗑️</span>
                  <span>Clear Logs</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <button
                disabled
                className="w-full py-4 px-6 text-lg font-semibold text-[#001e32] bg-gradient-to-r from-[#86c8bc] to-[#7bb8ac] rounded-lg flex items-center justify-center space-x-3 opacity-90"
              >
                <Image 
                  src="/icons/Haul Truck - CAT - Loaded.png" 
                  alt="Mining Truck" 
                  width={20} 
                  height={20}
                  className="filter brightness-0 saturate-0" style={{filter: 'brightness(0) saturate(100%) invert(7%) sepia(40%) saturate(4770%) hue-rotate(182deg) brightness(99%) contrast(102%)'}}
                />
                <span>Extracting Data...</span>
                <div className="w-4 h-4 border-2 border-[#001e32] border-t-transparent rounded-full animate-spin"></div>
              </button>
              
            </div>
          )}
        </div>

        {/* Success Message */}
        {extractionStatus?.status === 'completed' && (
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="flex items-start space-x-3">
              <div className="w-6 h-6 bg-[#86c8bc] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                <span className="text-[#001e32] text-sm font-bold">✓</span>
              </div>
              <div className="text-gray-200 w-full">
                <p className="font-semibold text-gray-200 mb-3">Data extraction completed successfully!</p>
                
                {/* Summary */}
                <div className="text-sm space-y-2 mb-4">
                  <div className="flex items-center space-x-4 text-gray-200">
                    <span className="flex items-center space-x-1">
                      <Image 
                        src="/icons/Haul Truck - CAT - Loaded.png" 
                        alt="Trucks" 
                        width={14} 
                        height={14}
                        className="filter brightness-0 invert opacity-80"
                      />
                      <span>{extractionStatus.trucks_found} trucks found</span>
                    </span>
                    <span>•</span>
                    <span>{extractionStatus.data_points_extracted.toLocaleString()} total data points</span>
                  </div>
                  
                  {/* Table Breakdown */}
                  {extractionStatus.table_breakdown && (
                    <div className="bg-[#425563] bg-opacity-50 rounded-md p-3 mt-3">
                      <p className="font-medium text-white mb-2">Data Points by Table:</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-400">GPS Positions:</span>
                          <span className="text-gray-200 font-mono">{extractionStatus.table_breakdown.gps_positions.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Velocity Data:</span>
                          <span className="text-gray-200 font-mono">{extractionStatus.table_breakdown.velocity_data.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Offpath Errors:</span>
                          <span className="text-gray-200 font-mono">{extractionStatus.table_breakdown.offpath_errors.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Motion Controller:</span>
                          <span className="text-gray-200 font-mono">{extractionStatus.table_breakdown.motion_controller_states.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Asset Activity:</span>
                          <span className="text-gray-200 font-mono">{extractionStatus.table_breakdown.asset_activity_states.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Haulage States:</span>
                          <span className="text-gray-200 font-mono">{extractionStatus.table_breakdown.haulage_states.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <p className="text-[#86c8bc] mt-2">✅ Ready for visualization and analysis</p>
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => {
                  console.log('🗺️ Extraction completed, moving to map view...');
                  
                  // Create minimal data structure with user time range for map view
                  const dataWithMetadata: ExtractedDataWithMeta = {
                    metadata: {
                      userTimeRange: {
                        start: convertLocalInputToTimestamp(startTime),
                        end: convertLocalInputToTimestamp(endTime)
                      }
                    }
                  } as ExtractedDataWithMeta;
                  
                  console.log(`🗺️ Moving to map view with time range: ${convertLocalInputToTimestamp(startTime)} to ${convertLocalInputToTimestamp(endTime)}`);
                  onExtractionComplete(dataWithMetadata);
                }}
                className="bg-[#ffc726] text-[#425563] px-6 py-3 rounded-md shadow-lg hover:bg-[#ffb000] transition-colors duration-200 font-semibold flex items-center space-x-2"
              >
                <span>🗺️</span>
                <span>Continue to Main Page</span>
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}