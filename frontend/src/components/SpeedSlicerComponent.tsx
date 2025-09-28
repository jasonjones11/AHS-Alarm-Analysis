'use client'

import React, { useState, useEffect, useMemo } from 'react'

export interface SpeedRange {
  min: number
  max: number
}

interface SpeedSlicerComponentProps {
  alarmData: any[]
  onSpeedRangeChange: (speedRange: SpeedRange | null) => void
  onApplyFilter?: (speedRange: SpeedRange | null) => void
  className?: string
  disabled?: boolean
}

export default function SpeedSlicerComponent({
  alarmData,
  onSpeedRangeChange,
  onApplyFilter,
  className = '',
  disabled = false
}: SpeedSlicerComponentProps) {
  const [isEnabled, setIsEnabled] = useState(false)
  const [minSpeed, setMinSpeed] = useState(0)
  const [maxSpeed, setMaxSpeed] = useState(100)

  // Calculate the full data speed range
  const dataSpeedRange = useMemo(() => {
    if (!alarmData || alarmData.length === 0) return null

    const speeds = alarmData
      .map(point => point.speed_kmh)
      .filter(speed => speed !== null && speed !== undefined && !isNaN(speed))
    
    if (speeds.length === 0) return null

    const minSpeedVal = Math.min(...speeds)
    const maxSpeedVal = Math.max(...speeds)

    return {
      min: Math.floor(minSpeedVal),
      max: Math.ceil(maxSpeedVal),
      range: maxSpeedVal - minSpeedVal
    }
  }, [alarmData])

  // Initialize speed range when data changes
  useEffect(() => {
    if (dataSpeedRange) {
      setMinSpeed(dataSpeedRange.min)
      setMaxSpeed(dataSpeedRange.max)
    }
  }, [dataSpeedRange])

  // Handle enable/disable toggle
  const handleToggle = () => {
    const newEnabled = !isEnabled
    setIsEnabled(newEnabled)
    
    if (newEnabled && dataSpeedRange) {
      const speedRange = { min: minSpeed, max: maxSpeed }
      onSpeedRangeChange(speedRange)
      onApplyFilter?.(speedRange)
    } else {
      onSpeedRangeChange(null)
      onApplyFilter?.(null)
    }
  }

  // Handle speed range change
  const handleSpeedChange = (type: 'min' | 'max', value: number) => {
    let newMin = minSpeed
    let newMax = maxSpeed
    
    if (type === 'min') {
      newMin = Math.min(value, maxSpeed - 1) // Ensure min is less than max
      // If min would be >= max, don't update
      if (newMin >= maxSpeed) {
        return
      }
    } else {
      newMax = Math.max(value, minSpeed + 1) // Ensure max is greater than min
      // If max would be <= min, don't update
      if (newMax <= minSpeed) {
        return
      }
    }
    
    setMinSpeed(newMin)
    setMaxSpeed(newMax)
    
    if (isEnabled) {
      const speedRange = { min: newMin, max: newMax }
      onSpeedRangeChange(speedRange)
      onApplyFilter?.(speedRange)
    }
  }

  if (!dataSpeedRange) {
    return (
      <div className={`p-3 bg-gray-800 rounded-lg text-center ${className}`}>
        <span className="text-sm text-gray-400">No speed data available</span>
      </div>
    )
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header with toggle */}
      <div className="flex items-center justify-between">
        <label className="text-base font-semibold text-white flex items-center space-x-3">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={handleToggle}
            disabled={disabled}
            className="rounded bg-gray-700 border-gray-600 text-[#ffc726] focus:ring-[#ffc726] focus:ring-2"
          />
          <span>Filter by Speed</span>
        </label>
        <div className="text-xs text-gray-400">
          Range: {dataSpeedRange.min} - {dataSpeedRange.max} km/h
        </div>
      </div>

      {/* Dual-range slider */}
      {isEnabled && (
        <div className="space-y-4 p-4 bg-gray-800/50 rounded-lg border border-gray-600">
          <div className="space-y-3">
            <div className="flex justify-between text-xs text-gray-400">
              <span>{dataSpeedRange.min} km/h</span>
              <span>{dataSpeedRange.max} km/h</span>
            </div>
            
            {/* Dual-range slider container */}
            <div className="relative">
              {/* Background track */}
              <div className="h-2 bg-gray-700 rounded-lg relative">
                {/* Active range highlight */}
                <div 
                  className="absolute h-2 bg-[#ffc726] rounded-lg"
                  style={{
                    left: `${((minSpeed - dataSpeedRange.min) / (dataSpeedRange.max - dataSpeedRange.min)) * 100}%`,
                    width: `${((maxSpeed - minSpeed) / (dataSpeedRange.max - dataSpeedRange.min)) * 100}%`
                  }}
                />
              </div>
              
              {/* Min speed handle */}
              <input
                type="range"
                min={dataSpeedRange.min}
                max={dataSpeedRange.max}
                value={minSpeed}
                onChange={(e) => handleSpeedChange('min', parseInt(e.target.value))}
                disabled={disabled}
                className="absolute top-0 w-full h-2 bg-transparent appearance-none cursor-pointer range-slider"
                style={{ zIndex: 1 }}
              />
              
              {/* Max speed handle */}
              <input
                type="range"
                min={dataSpeedRange.min}
                max={dataSpeedRange.max}
                value={maxSpeed}
                onChange={(e) => handleSpeedChange('max', parseInt(e.target.value))}
                disabled={disabled}
                className="absolute top-0 w-full h-2 bg-transparent appearance-none cursor-pointer range-slider"
                style={{ zIndex: 2 }}
              />
            </div>
            
            {/* Selected range display */}
            <div className="text-center p-2 bg-gray-700/50 rounded text-sm">
              <span className="text-[#ffc726] font-semibold">
                Selected Range: {minSpeed} - {maxSpeed} km/h
              </span>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .range-slider {
          pointer-events: none;
        }
        
        .range-slider::-webkit-slider-thumb {
          appearance: none;
          height: 18px;
          width: 18px;
          border-radius: 50%;
          background: #f97316;
          cursor: pointer;
          border: 3px solid #fff;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          pointer-events: all;
          position: relative;
        }
        
        .range-slider::-webkit-slider-track {
          background: transparent;
        }
        
        .range-slider::-moz-range-thumb {
          height: 18px;
          width: 18px;
          border-radius: 50%;
          background: #f97316;
          cursor: pointer;
          border: 3px solid #fff;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          pointer-events: all;
        }
        
        .range-slider::-moz-range-track {
          background: transparent;
        }
      `}</style>
    </div>
  )
}