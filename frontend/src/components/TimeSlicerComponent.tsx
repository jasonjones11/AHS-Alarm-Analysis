'use client'

import React, { useState, useEffect, useMemo } from 'react'

export interface TimeRange {
  start: Date
  end: Date
}

interface TimeSlicerComponentProps {
  alarmData: any[]
  onTimeRangeChange: (timeRange: TimeRange | null) => void
  onApplyFilter?: (timeRange: TimeRange | null) => void
  className?: string
  disabled?: boolean
}

export default function TimeSlicerComponent({
  alarmData,
  onTimeRangeChange,
  onApplyFilter,
  className = '',
  disabled = false
}: TimeSlicerComponentProps) {
  const [isEnabled, setIsEnabled] = useState(false)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')

  // Calculate the full data time range
  const dataTimeRange = useMemo(() => {
    if (!alarmData || alarmData.length === 0) return null

    const timestamps = alarmData
      .map(point => new Date(point.timestamp).getTime())
      .filter(time => !isNaN(time))
    
    if (timestamps.length === 0) return null

    const minTime = Math.min(...timestamps)
    const maxTime = Math.max(...timestamps)

    return {
      start: new Date(minTime),
      end: new Date(maxTime),
      duration: maxTime - minTime
    }
  }, [alarmData])

  // Format datetime for input field (YYYY-MM-DDTHH:MM)
  const formatDateTimeLocal = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  // Initialize time inputs when data changes
  useEffect(() => {
    if (dataTimeRange && !startTime && !endTime) {
      setStartTime(formatDateTimeLocal(dataTimeRange.start))
      setEndTime(formatDateTimeLocal(dataTimeRange.end))
    }
  }, [dataTimeRange, startTime, endTime])

  // Apply filter manually when user clicks apply button
  const applyTimeFilter = () => {
    if (!isEnabled || disabled) {
      const nullRange = null
      onTimeRangeChange(nullRange)
      if (onApplyFilter) {
        onApplyFilter(nullRange) // Pass the time range directly
      }
      return
    }

    if (startTime && endTime) {
      const start = new Date(startTime)
      const end = new Date(endTime)
      
      if (start < end) {
        const newTimeRange = { start, end }
        onTimeRangeChange(newTimeRange)
        // Trigger analytics recalculation with the exact time range
        if (onApplyFilter) {
          onApplyFilter(newTimeRange) // Pass the time range directly
        }
      }
    }
  }

  // Clear filter
  const clearTimeFilter = () => {
    const nullRange = null
    onTimeRangeChange(nullRange)
    // Trigger analytics recalculation with full data
    if (onApplyFilter) {
      onApplyFilter(nullRange) // Pass null directly to clear filter
    }
  }

  // Handle toggle
  const handleToggle = () => {
    const newEnabled = !isEnabled
    setIsEnabled(newEnabled)
    if (!newEnabled) {
      onTimeRangeChange(null)
    }
  }

  if (!dataTimeRange) {
    return (
      <div className={`bg-gray-700/50 rounded-lg p-4 ${className}`}>
        <div className="text-center text-gray-400">
          <div className="text-sm">Time Slicer</div>
          <div className="text-xs mt-1">No data available for time filtering</div>
        </div>
      </div>
    )
  }

  const formatDuration = (ms: number) => {
    const minutes = Math.floor(ms / 60000)
    const hours = Math.floor(minutes / 60)
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`
    }
    return `${minutes}m`
  }

  return (
    <div className={`bg-gray-700/50 rounded-lg p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-sm font-medium text-white flex items-center space-x-2">
            <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Time Slicer</span>
          </div>
          <div className="text-xs text-gray-400 mt-1">
            Full range: {formatDuration(dataTimeRange.duration)} ({dataTimeRange.start.toLocaleTimeString('en-AU', {timeZone: 'Australia/Perth'})} - {dataTimeRange.end.toLocaleTimeString('en-AU', {timeZone: 'Australia/Perth'})})
          </div>
        </div>
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={handleToggle}
            disabled={disabled}
            className="rounded bg-gray-600 border-gray-500 text-blue-500 focus:ring-blue-500 focus:ring-2 disabled:opacity-50"
          />
          <span className="text-sm text-gray-300">Enable</span>
        </label>
      </div>

      {/* Time Range Controls */}
      {isEnabled && !disabled && (
        <div className="space-y-3">
          {/* Custom Time Range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Start Time</label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                min={formatDateTimeLocal(dataTimeRange.start)}
                max={formatDateTimeLocal(dataTimeRange.end)}
                className="w-full px-3 py-2 bg-gray-600 text-white text-xs rounded border border-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">End Time</label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                min={formatDateTimeLocal(dataTimeRange.start)}
                max={formatDateTimeLocal(dataTimeRange.end)}
                className="w-full px-3 py-2 bg-gray-600 text-white text-xs rounded border border-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-2">
            <button
              onClick={applyTimeFilter}
              disabled={!startTime || !endTime}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50 text-white text-sm rounded transition-colors"
            >
              Apply Filter
            </button>
            <button
              onClick={clearTimeFilter}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded transition-colors"
            >
              Clear
            </button>
          </div>

          {/* Selected Range Info */}
          {startTime && endTime && (
            <div className="text-xs text-gray-400 text-center">
              Selected: {formatDuration(new Date(endTime).getTime() - new Date(startTime).getTime())} 
              ({new Date(startTime).toLocaleTimeString('en-AU', {timeZone: 'Australia/Perth'})} - {new Date(endTime).toLocaleTimeString('en-AU', {timeZone: 'Australia/Perth'})})
            </div>
          )}
        </div>
      )}

      {/* Disabled State */}
      {disabled && (
        <div className="text-center text-xs text-gray-500 py-2">
          Time slicer disabled during calculation
        </div>
      )}
    </div>
  )
}