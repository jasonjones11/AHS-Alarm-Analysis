'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'

interface DualHandleRangeSliderProps {
  min: number
  max: number
  startValue: number
  endValue: number
  currentValue: number
  onRangeChange: (start: number, end: number) => void
  onSeek: (value: number) => void
  className?: string
  formatLabel?: (value: number) => string
  disabled?: boolean
}

export default function DualHandleRangeSlider({
  min,
  max,
  startValue,
  endValue,
  currentValue,
  onRangeChange,
  onSeek,
  className = '',
  formatLabel = (value) => value.toString(),
  disabled = false
}: DualHandleRangeSliderProps) {
  const sliderRef = useRef<HTMLDivElement>(null)
  const [isDraggingStart, setIsDraggingStart] = useState(false)
  const [isDraggingEnd, setIsDraggingEnd] = useState(false)
  const [isDraggingCurrent, setIsDraggingCurrent] = useState(false)
  const [dragOffset, setDragOffset] = useState(0)

  const range = max - min
  const startPercent = range > 0 ? ((startValue - min) / range) * 100 : 0
  const endPercent = range > 0 ? ((endValue - min) / range) * 100 : 100
  const currentPercent = range > 0 ? Math.max(0, Math.min(100, ((currentValue - min) / range) * 100)) : 0

  // Convert mouse position to slider value
  const getValueFromMouseEvent = useCallback((event: MouseEvent) => {
    if (!sliderRef.current) return min

    const rect = sliderRef.current.getBoundingClientRect()
    const x = event.clientX - rect.left
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100))
    return min + (percent / 100) * range
  }, [min, max, range])

  // Handle mouse down on start handle
  const handleStartMouseDown = useCallback((event: React.MouseEvent) => {
    if (disabled) return
    
    event.preventDefault()
    event.stopPropagation()
    setIsDraggingStart(true)
    
    const rect = sliderRef.current?.getBoundingClientRect()
    if (rect) {
      setDragOffset(event.clientX - rect.left - (rect.width * startPercent / 100))
    }
  }, [disabled, startPercent])

  // Handle mouse down on end handle  
  const handleEndMouseDown = useCallback((event: React.MouseEvent) => {
    if (disabled) return
    
    event.preventDefault()
    event.stopPropagation()
    setIsDraggingEnd(true)
    
    const rect = sliderRef.current?.getBoundingClientRect()
    if (rect) {
      setDragOffset(event.clientX - rect.left - (rect.width * endPercent / 100))
    }
  }, [disabled, endPercent])

  // Handle mouse down on current position handle
  const handleCurrentMouseDown = useCallback((event: React.MouseEvent) => {
    if (disabled) return
    
    event.preventDefault()
    event.stopPropagation()
    setIsDraggingCurrent(true)
    
    const rect = sliderRef.current?.getBoundingClientRect()
    if (rect) {
      setDragOffset(event.clientX - rect.left - (rect.width * currentPercent / 100))
    }
  }, [disabled, currentPercent])

  // Handle click on slider track
  const handleTrackClick = useCallback((event: React.MouseEvent) => {
    if (disabled || isDraggingStart || isDraggingEnd || isDraggingCurrent) return
    
    const value = getValueFromMouseEvent(event.nativeEvent)
    onSeek(Math.max(startValue, Math.min(endValue, value)))
  }, [disabled, isDraggingStart, isDraggingEnd, isDraggingCurrent, getValueFromMouseEvent, onSeek, startValue, endValue])

  // Mouse move handler
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!sliderRef.current) return

      const rect = sliderRef.current.getBoundingClientRect()
      const x = event.clientX - rect.left - dragOffset
      const percent = Math.max(0, Math.min(100, (x / rect.width) * 100))
      const value = min + (percent / 100) * range

      if (isDraggingStart) {
        const newStart = Math.max(min, Math.min(value, endValue - (range * 0.01))) // Ensure 1% minimum gap
        onRangeChange(newStart, endValue)
      } else if (isDraggingEnd) {
        const newEnd = Math.min(max, Math.max(value, startValue + (range * 0.01))) // Ensure 1% minimum gap
        onRangeChange(startValue, newEnd)
      } else if (isDraggingCurrent) {
        const clampedValue = Math.max(startValue, Math.min(endValue, value))
        onSeek(clampedValue)
      }
    }

    const handleMouseUp = () => {
      setIsDraggingStart(false)
      setIsDraggingEnd(false)
      setIsDraggingCurrent(false)
      setDragOffset(0)
    }

    if (isDraggingStart || isDraggingEnd || isDraggingCurrent) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'grabbing'
      document.body.style.userSelect = 'none'

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }
  }, [isDraggingStart, isDraggingEnd, isDraggingCurrent, dragOffset, min, max, range, startValue, endValue, onRangeChange, onSeek])

  return (
    <div className={`relative ${className}`}>
      {/* Labels */}
      <div className="flex justify-between text-xs text-gray-400 mb-2">
        <span>{formatLabel(startValue)}</span>
        <span>{formatLabel(endValue)}</span>
      </div>

      {/* Slider Container */}
      <div
        ref={sliderRef}
        className={`relative h-6 bg-gray-700 rounded-lg cursor-pointer ${disabled ? 'opacity-50' : ''}`}
        onClick={handleTrackClick}
        style={{ userSelect: 'none' }}
      >
        {/* Background Track */}
        <div className="absolute inset-0 bg-gray-700 rounded-lg" />
        
        {/* Selected Range Track */}
        <div
          className="absolute h-full bg-gradient-to-r from-blue-600 to-blue-500 rounded-lg"
          style={{
            left: `${startPercent}%`,
            width: `${Math.max(0, endPercent - startPercent)}%`
          }}
        />
        
        {/* Current Progress Track */}
        <div
          className="absolute h-full bg-blue-400 rounded-lg transition-all duration-100"
          style={{
            left: `${startPercent}%`,
            width: `${Math.max(0, Math.min(currentPercent - startPercent, endPercent - startPercent))}%`
          }}
        />

        {/* Start Handle */}
        <div
          className={`absolute w-6 h-6 -mt-0 bg-white border-2 border-blue-600 rounded-full shadow-lg cursor-grab transform -translate-x-1/2 transition-transform duration-150 ${
            isDraggingStart ? 'scale-110 cursor-grabbing shadow-xl' : 'hover:scale-105'
          } ${disabled ? 'cursor-not-allowed' : ''}`}
          style={{ left: `${startPercent}%`, top: '0px' }}
          onMouseDown={handleStartMouseDown}
          title={`Range Start: ${formatLabel(startValue)}`}
        >
          {/* Start handle inner dot */}
          <div className="absolute inset-2 bg-blue-600 rounded-full" />
        </div>

        {/* End Handle */}
        <div
          className={`absolute w-6 h-6 -mt-0 bg-white border-2 border-blue-600 rounded-full shadow-lg cursor-grab transform -translate-x-1/2 transition-transform duration-150 ${
            isDraggingEnd ? 'scale-110 cursor-grabbing shadow-xl' : 'hover:scale-105'
          } ${disabled ? 'cursor-not-allowed' : ''}`}
          style={{ left: `${endPercent}%`, top: '0px' }}
          onMouseDown={handleEndMouseDown}
          title={`Range End: ${formatLabel(endValue)}`}
        >
          {/* End handle inner dot */}
          <div className="absolute inset-2 bg-blue-600 rounded-full" />
        </div>

        {/* Current Position Handle */}
        {currentPercent >= startPercent && currentPercent <= endPercent && (
          <div
            className={`absolute w-5 h-5 bg-yellow-400 border-2 border-white rounded-full shadow-lg cursor-grab transform -translate-x-1/2 transition-transform duration-75 z-10 ${
              isDraggingCurrent ? 'scale-110 cursor-grabbing shadow-xl' : 'hover:scale-105'
            } ${disabled ? 'cursor-not-allowed' : ''}`}
            style={{ left: `${currentPercent}%`, top: '2px' }}
            onMouseDown={handleCurrentMouseDown}
            title={`Current Time: ${formatLabel(currentValue)}`}
          >
            {/* Current position pulse animation */}
            <div className="absolute inset-0 bg-yellow-400 rounded-full animate-ping opacity-20" />
          </div>
        )}

      </div>
    </div>
  )
}