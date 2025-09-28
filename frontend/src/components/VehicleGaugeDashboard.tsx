'use client'

import { useState, useEffect, useMemo } from 'react'
import { TruckData, AlarmData } from '@/types/truck'

// 🔢 Enhanced Logging System for Gauge Dashboard
const gaugeLogger = {
  info: (message: string, data?: any) => {
    console.log(`🔢 [GAUGE_DASHBOARD] ${message}`, data || '');
  },
  speed: (message: string, data?: any) => {
    console.log(`🚗 [GAUGE_SPEED] ${message}`, data || '');
  },
  validation: (message: string, data?: any) => {
    console.log(`✅ [GAUGE_VALIDATION] ${message}`, data || '');
  },
  debug: (message: string, data?: any) => {
    console.log(`🔍 [GAUGE_DEBUG] ${message}`, data || '');
  }
};

interface TelemetryData {
  vehicle: string
  motion_controller: string | null
  asset_activity: string | null
  haulage_state: string | null
  timestamp: string
}

interface VehicleGaugeDashboardProps {
  selectedTruck: string | null
  truckData: TruckData[]
  currentTime: number
  telemetry: TelemetryData[]
  alarms?: AlarmData[]
  isPlaying: boolean
}

interface GaugeProps {
  value: number
  min: number
  max: number
  label: string
  unit: string
  color: string
  size?: 'small' | 'medium' | 'large'
  dangerous?: number
  warning?: number
}

const Gauge = ({ value, min, max, label, unit, color, size = 'medium', dangerous, warning }: GaugeProps) => {
  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))
  const radius = size === 'small' ? 35 : size === 'large' ? 55 : 45
  const strokeWidth = size === 'small' ? 4 : size === 'large' ? 6 : 5
  const normalizedRadius = radius - strokeWidth * 2
  const circumference = normalizedRadius * 2 * Math.PI
  const strokeDasharray = `${circumference} ${circumference}`
  const strokeDashoffset = circumference - (percentage / 100) * circumference
  
  // Determine color based on value and thresholds
  let gaugeColor = color
  if (dangerous && value >= dangerous) {
    gaugeColor = '#ef4444'
  } else if (warning && value >= warning) {
    gaugeColor = '#f59e0b'
  }
  
  const sizeClass = size === 'small' ? 'w-20 h-20' : size === 'large' ? 'w-28 h-28' : 'w-24 h-24'
  const textSize = size === 'small' ? 'text-xs' : size === 'large' ? 'text-sm' : 'text-sm'
  
  return (
    <div className={`${sizeClass} relative`}>
      <svg className="w-full h-full transform -rotate-90" viewBox={`0 0 ${radius * 2} ${radius * 2}`}>
        {/* Background circle */}
        <circle
          stroke="#374151"
          fill="transparent"
          strokeWidth={strokeWidth}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        
        {/* Progress circle */}
        <circle
          stroke={gaugeColor}
          fill="transparent"
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
          style={{ strokeDashoffset }}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          className="transition-all duration-300 ease-in-out"
        />
      </svg>
      
      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className={`font-bold ${textSize} text-white`}>
          {value.toFixed(value < 10 ? 1 : 0)}
        </div>
        <div className="text-xs text-gray-400">{unit}</div>
      </div>
      
      {/* Label */}
      <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2">
        <div className="text-xs text-gray-300 text-center font-medium">{label}</div>
      </div>
    </div>
  )
}

interface StateIndicatorProps {
  label: string
  value: string | null
  type: 'motion' | 'activity' | 'haulage'
}

const StateIndicator = ({ label, value, type }: StateIndicatorProps) => {
  const getStateColor = (state: string | null, stateType: string) => {
    if (!state) return 'bg-gray-600'
    
    const stateLower = state.toLowerCase()
    
    if (stateType === 'motion') {
      if (stateLower.includes('autonomous') || stateLower.includes('auto')) return 'bg-green-500'
      if (stateLower.includes('manual') || stateLower.includes('operator')) return 'bg-blue-500'
      if (stateLower.includes('stop') || stateLower.includes('halt')) return 'bg-red-500'
      if (stateLower.includes('wait') || stateLower.includes('idle')) return 'bg-yellow-500'
    } else if (stateType === 'activity') {
      if (stateLower.includes('haul') || stateLower.includes('transport')) return 'bg-green-500'
      if (stateLower.includes('load') || stateLower.includes('dump')) return 'bg-blue-500'
      if (stateLower.includes('wait') || stateLower.includes('queue')) return 'bg-yellow-500'
      if (stateLower.includes('maintenance') || stateLower.includes('fault')) return 'bg-red-500'
    } else if (stateType === 'haulage') {
      if (stateLower.includes('loaded') || stateLower.includes('full')) return 'bg-green-500'
      if (stateLower.includes('empty') || stateLower.includes('unloaded')) return 'bg-blue-500'
      if (stateLower.includes('loading') || stateLower.includes('dumping')) return 'bg-yellow-500'
    }
    
    return 'bg-purple-500'
  }
  
  const colorClass = getStateColor(value, type)
  
  return (
    <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className="flex items-center space-x-2">
        <div className={`w-3 h-3 rounded-full ${colorClass} animate-pulse`}></div>
        <span className="text-sm text-white font-medium">
          {value || 'Unknown'}
        </span>
      </div>
    </div>
  )
}

interface AlarmIndicatorProps {
  alarms: AlarmData[]
  currentTime: number
}

const AlarmIndicator = ({ alarms, currentTime }: AlarmIndicatorProps) => {
  // Find recent alarms (within last 5 minutes of playback time)
  const recentAlarms = useMemo(() => {
    const fiveMinutesAgo = currentTime - (5 * 60 * 1000)
    return alarms.filter(alarm => {
      const alarmTime = new Date(alarm.timestamp).getTime()
      return alarmTime >= fiveMinutesAgo && alarmTime <= currentTime
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }, [alarms, currentTime])
  
  const criticalCount = recentAlarms.filter(a => a.severity === 'Critical').length
  const highCount = recentAlarms.filter(a => a.severity === 'High').length
  const mediumCount = recentAlarms.filter(a => a.severity === 'Medium').length
  const lowCount = recentAlarms.filter(a => a.severity === 'Low').length
  
  const latestAlarm = recentAlarms[0]
  
  return (
    <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
      <div className="text-xs text-gray-400 mb-2">Active Alarms (5 min)</div>
      
      {recentAlarms.length === 0 ? (
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
          <span className="text-sm text-green-400">All Clear</span>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-1">
            {criticalCount > 0 && (
              <div className="text-center">
                <div className="text-red-400 text-xs font-bold">{criticalCount}</div>
                <div className="text-red-400 text-xs">Critical</div>
              </div>
            )}
            {highCount > 0 && (
              <div className="text-center">
                <div className="text-orange-400 text-xs font-bold">{highCount}</div>
                <div className="text-orange-400 text-xs">High</div>
              </div>
            )}
            {mediumCount > 0 && (
              <div className="text-center">
                <div className="text-yellow-400 text-xs font-bold">{mediumCount}</div>
                <div className="text-yellow-400 text-xs">Medium</div>
              </div>
            )}
            {lowCount > 0 && (
              <div className="text-center">
                <div className="text-blue-400 text-xs font-bold">{lowCount}</div>
                <div className="text-blue-400 text-xs">Low</div>
              </div>
            )}
          </div>
          
          {latestAlarm && (
            <div className="text-xs text-gray-300 border-t border-gray-600 pt-2">
              <div className="font-medium text-red-400">{latestAlarm.notification_title}</div>
              <div className="text-gray-400 truncate">{latestAlarm.message}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}


export default function VehicleGaugeDashboard({
  selectedTruck,
  truckData,
  currentTime,
  telemetry,
  alarms = [],
  isPlaying
}: VehicleGaugeDashboardProps) {
  const [isVisible, setIsVisible] = useState(true)
  
  // Get current data point based on playback time
  const currentData = useMemo(() => {
    if (!truckData.length || !currentTime) {
      gaugeLogger.debug('No truck data or current time', { 
        hasData: !!truckData.length, 
        currentTime, 
        truck: selectedTruck 
      });
      return null;
    }
    
    // Find the closest data point to current playback time
    let closest = truckData[0]
    let minDiff = Math.abs(new Date(truckData[0].timestamp).getTime() - currentTime)
    
    for (const point of truckData) {
      const diff = Math.abs(new Date(point.timestamp).getTime() - currentTime)
      if (diff < minDiff) {
        minDiff = diff
        closest = point
      }
    }
    
    // Validate speed data
    if (closest && selectedTruck) {
      const speedValidation = {
        hasSpeed: closest.speed_kmh !== undefined && closest.speed_kmh !== null,
        speedValue: closest.speed_kmh,
        speedMs: closest.speed_ms,
        timeDiff: `${minDiff}ms`,
        dataPoint: closest.timestamp
      };
      
      gaugeLogger.validation(`Speed data validation for ${selectedTruck}`, speedValidation);
      
      if (speedValidation.hasSpeed) {
        gaugeLogger.speed(`Speed update for ${selectedTruck}: ${closest.speed_kmh!.toFixed(1)} km/h (currentData)`);
      }
    }
    
    return closest
  }, [truckData, currentTime, selectedTruck])
  
  // Get current telemetry based on playback time
  const currentTelemetry = useMemo(() => {
    if (!telemetry.length || !currentTime) return null
    
    let closest = telemetry[0]
    let minDiff = Math.abs(new Date(telemetry[0].timestamp).getTime() - currentTime)
    
    for (const telem of telemetry) {
      const diff = Math.abs(new Date(telem.timestamp).getTime() - currentTime)
      if (diff < minDiff) {
        minDiff = diff
        closest = telem
      }
    }
    
    return closest
  }, [telemetry, currentTime])
  
  if (!selectedTruck || !currentData) {
    if (selectedTruck && !currentData) {
      gaugeLogger.debug(`No current data for selected truck ${selectedTruck}`, {
        truckDataLength: truckData.length,
        currentTime: new Date(currentTime).toISOString()
      });
    }
    return null
  }
  
  // Enhanced speed validation and logging
  const speed = currentData.speed_kmh || 0
  const offpathError = Math.abs(currentData.offpath_error || 0)
  
  // Additional speed validation logging
  if (speed === 0 && currentData.speed_kmh !== 0) {
    gaugeLogger.debug(`Speed fallback for ${selectedTruck}`, {
      originalSpeed: currentData.speed_kmh,
      fallbackSpeed: speed,
      hasSpeedMs: !!currentData.speed_ms
    });
  }
  
  return (
    <div className={`absolute top-6 right-6 z-10 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl shadow-2xl border border-gray-700 backdrop-blur-lg transition-all duration-300 ${
      isVisible ? 'w-80 h-auto opacity-100' : 'w-16 h-16 opacity-90'
    }`}>
      {!isVisible ? (
        <div className="flex items-center justify-center h-full">
          <button
            onClick={() => setIsVisible(true)}
            className="p-3 text-white hover:text-blue-400 transition-colors"
            title="Show Dashboard"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className={`w-3 h-3 rounded-full ${isPlaying ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`}></div>
              <h3 className="text-white font-bold text-sm">Vehicle Dashboard</h3>
              <div className="bg-blue-600 text-white px-2 py-1 rounded text-xs font-medium">
                {selectedTruck}
              </div>
            </div>
            <button
              onClick={() => setIsVisible(false)}
              className="p-1 text-gray-400 hover:text-white transition-colors"
              title="Hide Dashboard"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
          </div>
          
          {/* Main Gauges */}
          <div className="flex justify-center space-x-6 mb-6">
            <Gauge
              value={speed}
              min={0}
              max={60}
              label="Speed"
              unit="km/h"
              color="#22c55e"
              size="large"
              warning={40}
              dangerous={50}
            />
            <Gauge
              value={offpathError}
              min={0}
              max={5}
              label="Off-Path"
              unit="m"
              color="#3b82f6"
              size="medium"
              warning={2}
              dangerous={3.5}
            />
          </div>
          
          {/* State Indicators */}
          <div className="grid grid-cols-1 gap-3 mb-4">
            <StateIndicator
              label="Motion Controller"
              value={currentTelemetry?.motion_controller ?? null}
              type="motion"
            />
            <StateIndicator
              label="Asset Activity"
              value={currentTelemetry?.asset_activity ?? null}
              type="activity"
            />
            <StateIndicator
              label="Haulage State"
              value={currentTelemetry?.haulage_state ?? null}
              type="haulage"
            />
          </div>
          
          {/* Alarm Indicator */}
          <AlarmIndicator alarms={alarms} currentTime={currentTime} />
          
          {/* Timestamp */}
          <div className="mt-3 text-xs text-gray-400 text-center bg-gray-800/50 rounded px-2 py-1">
            <span className="font-mono">
              {new Date(currentTime).toLocaleTimeString('en-AU', {
                timeZone: 'Australia/Perth',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
              })}
            </span>
            <span className="mx-2">•</span>
            <span>{new Date(currentTime).toLocaleDateString('en-AU', { timeZone: 'Australia/Perth' })}</span>
          </div>
        </div>
      )}
    </div>
  )
}