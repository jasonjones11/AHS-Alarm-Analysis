'use client'

import React, { useState, useCallback } from 'react'

export type ColorMode = 'speed' | 'offpath' | 'states' | 'solid'

export interface ColorModeSettings {
  mode: ColorMode
  showAlarms: boolean
  alarmFilter: string  // 'all' or specific alarm message
  opacity: number
}

interface TrailColorModeSelectorProps {
  colorMode: ColorMode
  showAlarms: boolean
  alarmFilter: string
  availableAlarmTypes: string[]  // Dynamic list of alarm messages
  opacity: number
  onColorModeChange: (mode: ColorMode) => void
  onShowAlarmsChange: (show: boolean) => void
  onAlarmFilterChange: (filter: string) => void
  onOpacityChange: (opacity: number) => void
  className?: string
}

// Color coding specifications from requirements
export const COLOR_CODING = {
  speed: {
    high: { threshold: 30, color: '#22c55e', label: '>30 km/h' },    // Green
    medium: { threshold: 10, color: '#f97316', label: '10-30 km/h' }, // Orange  
    low: { threshold: 0, color: '#ef4444', label: '<10 km/h' }        // Red
  },
  offpath: {
    good: { threshold: 0.8, color: '#22c55e', label: '0-0.8m' },      // Green
    warning: { threshold: 1.2, color: '#f97316', label: '0.8-1.2m' }, // Orange
    danger: { threshold: Infinity, color: '#ef4444', label: '>1.2m' } // Red
  },
  states: {
    motion_controller: {
      'none': '#22c55e',                    // Green for none
      'Speed Limit Enforcer': '#f97316',   // Orange for Speed Limit Enforcer  
      'FORWARD': '#ef4444',                // Red for everything else
      'REVERSE': '#ef4444', 
      'STOPPED': '#ef4444',
      'UNKNOWN': '#ef4444'
    },
    asset_activity: {
      'HAULING': '#22c55e',
      'LOADING': '#3b82f6',
      'DUMPING': '#f97316',
      'IDLE': '#6b7280',
      'UNKNOWN': '#6b7280'
    },
    haulage_state: {
      'LOADED': '#22c55e',
      'EMPTY': '#f97316',
      'LOADING': '#3b82f6',
      'DUMPING': '#8b5cf6',
      'UNKNOWN': '#6b7280'
    }
  }
}

/**
 * Get color for a data point based on selected mode
 */
export const getTrailColor = (
  mode: ColorMode,
  speed?: number,
  offpathDeviation?: number,
  states?: {
    motion_controller?: string
    asset_activity?: string  
    haulage_state?: string
  },
  opacity: number = 1
): string => {
  let baseColor = '#3b82f6' // Default blue

  switch (mode) {
    case 'speed':
      if (speed !== undefined) {
        if (speed > COLOR_CODING.speed.high.threshold) {
          baseColor = COLOR_CODING.speed.high.color
        } else if (speed > COLOR_CODING.speed.medium.threshold) {
          baseColor = COLOR_CODING.speed.medium.color
        } else {
          baseColor = COLOR_CODING.speed.low.color
        }
      }
      break

    case 'offpath':
      if (offpathDeviation !== undefined) {
        const absDeviation = Math.abs(offpathDeviation)
        if (absDeviation <= COLOR_CODING.offpath.good.threshold) {
          baseColor = COLOR_CODING.offpath.good.color
        } else if (absDeviation <= COLOR_CODING.offpath.warning.threshold) {
          baseColor = COLOR_CODING.offpath.warning.color  
        } else {
          baseColor = COLOR_CODING.offpath.danger.color
        }
      }
      break

    case 'states':
      // Use motion_controller as primary state for coloring
      if (states?.motion_controller) {
        const motionState = states.motion_controller.toLowerCase() // Make case-insensitive
        
        // Debug logging to see what state values we're getting
        if (typeof window !== 'undefined' && Math.random() < 0.01) { // Log 1% of the time to avoid spam
          console.log('Motion Controller State Debug:', {
            original: states.motion_controller,
            lowercase: motionState,
            isNone: motionState === 'none',
            isSpeedLimit: motionState === 'speed limit enforcer',
            speed: speed,
            mode: mode
          })
        }
        
        if (motionState === 'none') {
          baseColor = COLOR_CODING.states.motion_controller['none'] // Green
        } else if (motionState === 'speed limit enforcer') {
          baseColor = COLOR_CODING.states.motion_controller['Speed Limit Enforcer'] // Orange
        } else {
          // Everything else is red
          baseColor = '#ef4444'
        }
        
        // Additional debug for orange colors specifically
        if (typeof window !== 'undefined' && baseColor === '#f97316') {
          console.warn('Orange color assigned for motion controller state:', {
            motionState: motionState,
            original: states.motion_controller,
            baseColor: baseColor
          })
        }
      } else {
        // If no motion_controller state, default to red (unknown)
        baseColor = '#ef4444'
      }
      break

    case 'solid':
    default:
      baseColor = '#3b82f6' // Blue for solid mode
      break
  }

  // Convert hex to rgba with opacity
  const hex = baseColor.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

export default function TrailColorModeSelector({
  colorMode,
  showAlarms,
  alarmFilter,
  availableAlarmTypes,
  opacity,
  onColorModeChange,
  onShowAlarmsChange,
  onAlarmFilterChange,
  onOpacityChange,
  className = ''
}: TrailColorModeSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  // Remove internal state - use props directly to avoid sync issues
  
  // Debug logging for prop changes
  React.useEffect(() => {
    console.log('[TrailColorModeSelector] Props updated:', {
      showAlarms,
      alarmFilter,
      availableAlarmTypesCount: availableAlarmTypes.length,
      timestamp: new Date().toISOString()
    })
  }, [showAlarms, alarmFilter, availableAlarmTypes])

  const colorModes = [
    {
      id: 'solid' as ColorMode,
      label: 'Solid',
      icon: (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm2 2v8h10V6H5z" clipRule="evenodd" />
        </svg>
      ),
      description: 'Single color for all traces'
    },
    {
      id: 'speed' as ColorMode,
      label: 'Speed',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12l2 2 4-4" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v2M12 16v2M6 12h2M16 12h2" />
        </svg>
      ),
      description: 'Color by vehicle speed'
    },
    {
      id: 'offpath' as ColorMode,
      label: 'Off-Path',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12h18M3 8h18M3 16h18" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M7 4v16M17 4v16" strokeDasharray="2,2" />
        </svg>
      ),
      description: 'Color by path deviation'
    },
    {
      id: 'states' as ColorMode,
      label: 'Motion Controller',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
      description: 'Color by motion controller state'
    }
  ]

  const handleModeChange = useCallback((mode: ColorMode) => {
    onColorModeChange(mode)
  }, [onColorModeChange])

  const handleOpacityChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newOpacity = parseFloat(event.target.value)
    onOpacityChange(newOpacity)
  }, [onOpacityChange])

  return (
    <div className={`bg-gray-900 border border-gray-700 rounded-lg shadow-xl ${className}`}>
      {/* Header */}
      <div 
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-800 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-2">
          <span className="text-lg">🎨</span>
          <span className="font-semibold text-white">Trail Colors</span>
          <span className="text-sm text-gray-400 capitalize">({colorMode})</span>
        </div>
        <svg 
          className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-gray-700 p-3 space-y-4">
          {/* Color Mode Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Color Mode
            </label>
            <div className="grid grid-cols-2 gap-2">
              {colorModes.map((mode) => (
                <button
                  key={mode.id}
                  onClick={() => handleModeChange(mode.id)}
                  className={`p-3 rounded-lg border transition-all duration-200 text-left ${
                    colorMode === mode.id
                      ? 'border-[#ffc726] bg-[#ffc726]/20 shadow-sm'
                      : 'border-gray-600 hover:border-gray-500 hover:bg-gray-800'
                  }`}
                >
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="text-gray-300">{mode.icon}</span>
                    <span className="font-medium text-white">{mode.label}</span>
                  </div>
                  <p className="text-xs text-gray-400">{mode.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Color Legend for Current Mode */}
          <div className="bg-gray-800 rounded-lg p-3">
            <div className="text-sm font-medium text-gray-300 mb-2">Color Legend</div>
            
            {colorMode === 'speed' && (
              <div className="space-y-1">
                {Object.entries(COLOR_CODING.speed).map(([key, config]) => (
                  <div key={key} className="flex items-center space-x-2">
                    <div 
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: config.color }}
                    />
                    <span className="text-xs text-gray-400">{config.label}</span>
                  </div>
                ))}
              </div>
            )}

            {colorMode === 'offpath' && (
              <div className="space-y-1">
                {Object.entries(COLOR_CODING.offpath).map(([key, config]) => (
                  <div key={key} className="flex items-center space-x-2">
                    <div 
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: config.color }}
                    />
                    <span className="text-xs text-gray-400">{config.label}</span>
                  </div>
                ))}
              </div>
            )}

            {colorMode === 'states' && (
              <div className="space-y-2">
                <div className="text-xs text-gray-500 font-medium">Motion Controller</div>
                <div className="space-y-1 ml-2">
                  <div className="flex items-center space-x-2">
                    <div 
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: COLOR_CODING.states.motion_controller['none'] }}
                    />
                    <span className="text-xs text-gray-400">None</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div 
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: COLOR_CODING.states.motion_controller['Speed Limit Enforcer'] }}
                    />
                    <span className="text-xs text-gray-400">Speed Limit Enforcer</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <div 
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: '#ef4444' }}
                    />
                    <span className="text-xs text-gray-400">Others</span>
                  </div>
                </div>
              </div>
            )}

            {colorMode === 'solid' && (
              <div className="flex items-center space-x-2">
                <div className="w-4 h-4 rounded bg-blue-500" />
                <span className="text-xs text-gray-400">All trails in blue</span>
              </div>
            )}
          </div>

          {/* Trail Opacity Slider */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Trail Opacity ({Math.round(opacity * 100)}%)
            </label>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.1"
              value={opacity}
              onChange={handleOpacityChange}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider-thumb"
            />
          </div>

          {/* Alarm Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-300">Show Alarm Pins</label>
              <p className="text-xs text-gray-400">Display alarm markers on map</p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                
                const newValue = !showAlarms
                console.log('[TrailColorModeSelector] Show alarms toggle clicked:', { 
                  currentValue: showAlarms,
                  newValue,
                  timestamp: new Date().toISOString()
                })
                
                // Call parent callback immediately - no internal state
                onShowAlarmsChange(newValue)
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#ffc726] focus:ring-offset-2 focus:ring-offset-gray-900 ${
                showAlarms ? 'bg-[#ffc726]' : 'bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  showAlarms ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Alarm Filter Dropdown - Only show when alarms are enabled */}
          {showAlarms && availableAlarmTypes.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-300">Filter Alarms</label>
              <select
                value={alarmFilter}
                onChange={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  
                  const newFilter = e.target.value
                  console.log('[TrailColorModeSelector] Alarm filter changed:', { 
                    currentFilter: alarmFilter,
                    newFilter,
                    timestamp: new Date().toISOString()
                  })
                  
                  // Call parent callback immediately - no internal state
                  onAlarmFilterChange(newFilter)
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-full bg-gray-700 border border-gray-600 text-white text-sm rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#ffc726] focus:border-[#ffc726] cursor-pointer"
              >
                <option value="all">All Alarms ({availableAlarmTypes.length} types)</option>
                {availableAlarmTypes.map((alarmType) => (
                  <option key={alarmType} value={alarmType}>
                    {alarmType}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Custom CSS for slider */}
      <style jsx>{`
        .slider-thumb::-webkit-slider-thumb {
          appearance: none;
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #ffc726;
          cursor: pointer;
          border: 2px solid #fff;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
        }

        .slider-thumb::-moz-range-thumb {
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #ffc726;
          cursor: pointer;
          border: 2px solid #fff;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
        }
      `}</style>
    </div>
  )
}