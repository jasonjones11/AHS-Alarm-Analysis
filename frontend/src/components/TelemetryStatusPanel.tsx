'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { TruckPosition } from '@/utils/PlaybackEngine'

interface TelemetryStatusPanelProps {
  selectedTruck: string | null
  currentPosition: TruckPosition | null
  isAutonomous: boolean // Only show for autonomous trucks
  realTimeData?: boolean // Flag to indicate if this is real-time or historical data
  className?: string
}

// Gauge component for speed display
const SpeedGauge = ({ speed, maxSpeed = 60 }: { speed: number; maxSpeed?: number }) => {
  const speedPercentage = Math.min((Math.abs(speed) / maxSpeed) * 100, 100)
  const isReverse = speed < 0
  
  return (
    <div className="relative">
      <div className="flex items-center justify-center w-24 h-24">
        {/* Outer ring */}
        <div className="absolute inset-0 rounded-full border-4 border-gray-700"></div>
        
        {/* Speed arc */}
        <svg className="absolute inset-0 w-full h-full transform -rotate-90">
          <circle
            cx="50%"
            cy="50%"
            r="36"
            fill="none"
            stroke="#374151"
            strokeWidth="6"
            strokeDasharray="226"
            strokeDashoffset="0"
          />
          <circle
            cx="50%"
            cy="50%"
            r="36"
            fill="none"
            stroke={isReverse ? "#f97316" : "#22c55e"}
            strokeWidth="6"
            strokeDasharray="226"
            strokeDashoffset={226 - (226 * speedPercentage / 100)}
            className="transition-all duration-300"
          />
        </svg>
        
        {/* Speed value */}
        <div className="text-center">
          <div className="text-lg font-bold text-white">
            {Math.abs(speed).toFixed(1)}
          </div>
          <div className="text-xs text-gray-400">KM/H</div>
          {isReverse && (
            <div className="text-xs text-orange-400">REV</div>
          )}
        </div>
      </div>
    </div>
  )
}

// Progress bar component for off-path deviation (-2m to +2m range)
const OffPathBar = ({ deviation, maxDeviation = 2 }: { deviation: number; maxDeviation?: number }) => {
  const actualDeviation = deviation || 0
  const absDeviation = Math.abs(actualDeviation)
  
  // Calculate position from center (50% = 0m deviation)
  // Range is -2 to +2, so center is at 50%
  const centerPosition = 50 // 0m deviation is at center
  const deviationPercentage = (actualDeviation / maxDeviation) * 50 // Convert to percentage from center
  const position = Math.max(0, Math.min(100, centerPosition + deviationPercentage))
  
  // Color based on deviation level for mining trucks
  const getColor = () => {
    if (absDeviation <= 0.5) return '#22c55e' // Green - on path
    if (absDeviation <= 1.0) return '#f59e0b' // Yellow - minor deviation
    if (absDeviation <= 1.5) return '#f97316' // Orange - moderate deviation
    return '#ef4444' // Red - major deviation
  }
  
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-400">Off-Path Deviation</span>
        <span className={`text-sm font-mono ${actualDeviation >= 0 ? 'text-white' : 'text-red-300'}`}>
          {actualDeviation >= 0 ? '+' : ''}{actualDeviation.toFixed(2)}m
        </span>
      </div>
      
      <div className="relative w-full bg-gray-700 rounded-full h-3">
        {/* Center line indicator */}
        <div className="absolute left-1/2 top-0 w-0.5 h-3 bg-gray-500 transform -translate-x-0.5" />
        
        {/* Deviation indicator */}
        <div
          className="absolute top-0 w-2 h-3 rounded-full transition-all duration-300 transform -translate-x-1/2"
          style={{
            left: `${position}%`,
            backgroundColor: getColor()
          }}
        />
      </div>
      
      <div className="flex justify-between text-xs text-gray-500">
        <span>-{maxDeviation}m</span>
        <span className="text-gray-400">0m</span>
        <span>+{maxDeviation}m</span>
      </div>
    </div>
  )
}

// State indicator component
const StateIndicator = ({ 
  label, 
  value, 
  type 
}: { 
  label: string
  value: string | null | undefined
  type: 'motion' | 'activity' | 'haulage'
}) => {
  const getStatusColor = (value: string | null | undefined, type: string) => {
    if (!value || value === 'UNKNOWN') return 'bg-gray-600'
    
    switch (type) {
      case 'motion':
        switch (value) {
          case 'FORWARD': return 'bg-green-600'
          case 'REVERSE': return 'bg-orange-600'
          case 'STOPPED': return 'bg-red-600'
          default: return 'bg-gray-600'
        }
      case 'activity':
        switch (value) {
          case 'HAULING': return 'bg-green-600'
          case 'LOADING': return 'bg-blue-600'
          case 'DUMPING': return 'bg-orange-600'
          case 'POSITIONING': return 'bg-purple-600'  // Added for mining operations
          case 'IDLE': return 'bg-gray-600'
          default: return 'bg-gray-600'
        }
      case 'haulage':
        switch (value) {
          case 'LOADED': return 'bg-green-600'
          case 'EMPTY': return 'bg-orange-600'
          case 'LOADING': return 'bg-blue-600'
          case 'DUMPING': return 'bg-purple-600'
          default: return 'bg-gray-600'
        }
      default:
        return 'bg-gray-600'
    }
  }

  const displayValue = value && value !== 'UNKNOWN' ? value : 'N/A'
  const statusColor = getStatusColor(value, type)

  return (
    <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
      <div className="flex items-center space-x-3">
        <div className={`w-3 h-3 rounded-full ${statusColor}`} />
        <span className="text-sm text-gray-300">{label}</span>
      </div>
      <span className="text-sm font-medium text-white capitalize">
        {displayValue.toLowerCase()}
      </span>
    </div>
  )
}

export default function TelemetryStatusPanel({
  selectedTruck,
  currentPosition,
  isAutonomous,
  realTimeData = false,
  className = ''
}: TelemetryStatusPanelProps) {
  const [lastUpdateTime, setLastUpdateTime] = useState<string>('')
  
  // Simulate realistic telemetry states for mining trucks when backend data is null
  const simulateStatesFromSpeed = (speed: number) => {
    const absSpeed = Math.abs(speed)
    
    // Motion controller based on speed
    let motion_controller = 'STOPPED'
    if (speed > 0.5) motion_controller = 'FORWARD'
    else if (speed < -0.5) motion_controller = 'REVERSE'
    
    // Asset activity based on speed patterns (typical mining truck operations)
    let asset_activity = 'IDLE'
    if (absSpeed > 15) asset_activity = 'HAULING'  // Moving fast = hauling
    else if (absSpeed > 5) asset_activity = 'LOADING'  // Medium speed = loading/positioning
    else if (absSpeed > 1) asset_activity = 'POSITIONING'  // Slow movement
    
    // Haulage state based on speed and patterns
    let haulage_state = 'EMPTY'
    if (absSpeed > 20) haulage_state = 'LOADED'  // High speed suggests loaded
    else if (absSpeed < 2 && absSpeed > 0.1) haulage_state = 'LOADING'  // Very slow = loading
    
    return {
      motion_controller,
      asset_activity, 
      haulage_state
    }
  }

  // Update timestamp when position changes - use playback time, not current time
  useEffect(() => {
    if (currentPosition) {
      // Use the position timestamp for playback time synchronization
      const positionDate = new Date(currentPosition.timestamp)
      setLastUpdateTime(positionDate.toLocaleTimeString('en-AU', { 
        hour12: false,
        timeZone: 'Australia/Perth'
      }))
    }
  }, [currentPosition])

  // Format timestamp for display
  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp)
      return date.toLocaleString('en-AU', {
        timeZone: 'Australia/Perth',
        hour12: false,
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    } catch {
      return 'Invalid timestamp'
    }
  }

  // Don't show panel if no truck selected or if it's a manual truck
  if (!selectedTruck || !isAutonomous) {
    return (
      <div className={`bg-gray-900 border border-gray-700 rounded-lg p-4 ${className}`}>
        <div className="text-center text-gray-400">
          {!selectedTruck 
            ? 'Select an autonomous truck to view telemetry' 
            : 'Telemetry panel only available for autonomous trucks'
          }
        </div>
      </div>
    )
  }

  if (!currentPosition) {
    return (
      <div className={`bg-gray-900 border border-gray-700 rounded-lg p-4 ${className}`}>
        <div className="text-center">
          <div className="text-lg font-semibold text-white mb-2">
            {selectedTruck}
          </div>
          <div className="text-gray-400">No telemetry data available</div>
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-gray-900 border border-gray-700 rounded-lg shadow-xl ${className}`}>
      {/* Header */}
      <div className="border-b border-gray-700 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">{selectedTruck}</h3>
            <p className="text-sm text-gray-400">Autonomous Truck Telemetry</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400">Playback Time</div>
            <div className="text-sm text-white font-mono">{lastUpdateTime}</div>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Vehicle Telemetry Section */}
        <div>
          <h4 className="text-sm font-medium text-gray-300 mb-4 uppercase tracking-wide">
            Vehicle Telemetry
          </h4>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Speed Gauge */}
            <div className="flex flex-col items-center">
              <SpeedGauge speed={currentPosition.speed_kmh} />
            </div>

            {/* Off-Path Deviation */}
            <div className="space-y-2">
              <OffPathBar deviation={currentPosition.offpath_deviation || 0} />
            </div>
          </div>
        </div>

        {/* Vehicle States Section */}
        <div>
          <h4 className="text-sm font-medium text-gray-300 mb-4 uppercase tracking-wide">
            Telemetry Status
          </h4>
          
          <div className="space-y-3">
            <StateIndicator
              label="Motion Controller"
              value={currentPosition.states?.motion_controller || simulateStatesFromSpeed(currentPosition.speed_kmh).motion_controller}
              type="motion"
            />
            <StateIndicator
              label="Asset Activity"
              value={currentPosition.states?.asset_activity || simulateStatesFromSpeed(currentPosition.speed_kmh).asset_activity}
              type="activity"
            />
            <StateIndicator
              label="Haulage State"
              value={currentPosition.states?.haulage_state || simulateStatesFromSpeed(currentPosition.speed_kmh).haulage_state}
              type="haulage"
            />
          </div>
        </div>

        {/* Position Information */}
        <div>
          <h4 className="text-sm font-medium text-gray-300 mb-4 uppercase tracking-wide">
            Position Data
          </h4>
          
          <div className="bg-gray-800 rounded-lg p-3 space-y-2">
            <div className="flex justify-between">
              <span className="text-sm text-gray-400">Timestamp:</span>
              <span className="text-sm text-white font-mono">
                {formatTimestamp(currentPosition.timestamp)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-400">Latitude:</span>
              <span className="text-sm text-white font-mono">
                {currentPosition.latitude.toFixed(6)}°
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-400">Longitude:</span>
              <span className="text-sm text-white font-mono">
                {currentPosition.longitude.toFixed(6)}°
              </span>
            </div>
          </div>
        </div>

        
        {/* Simulated Data Notice */}
        {!currentPosition?.states?.motion_controller && (
          <div className="bg-yellow-900 border border-yellow-700 rounded-lg p-3 mt-4">
            <div className="flex items-center space-x-2">
              <svg className="w-4 h-4 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-xs text-yellow-200">
                *States are simulated from vehicle speed patterns while telemetry data is not available from the backend.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}