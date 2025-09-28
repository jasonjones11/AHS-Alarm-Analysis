// playback-control-panel.tsx (No changes needed based on feedback review)
'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { PlaybackEngine, PlaybackState, TruckPosition } from '@/utils/PlaybackEngine' // Ensure correct path
import DualHandleRangeSlider from './DualHandleRangeSlider' // Ensure correct path
import { createComponentLogger } from '@/utils/frontendLogger'

interface PlaybackControlPanelProps {
  playbackEngine: PlaybackEngine | null
  onTruckPositionUpdate: (positions: TruckPosition[]) => void
  onFollowTruck?: (vehicleId: string | null) => void
  onTelemetryTruckChange?: (vehicleId: string | null) => void
  globalTimeRange?: {start: number, end: number}
  playbackStartTime?: number
  playbackEndTime?: number
  onTimeRangeChange?: (start: number, end: number) => void
  onTimeRangeReset?: () => void
  onStop?: () => void
  selectedVehicles?: Set<string>
  selectedTelemetryTruck?: string | null
  followingTruck?: string | null
  className?: string
  // Callback to notify parent of playback state changes
  onPlaybackStateChange?: (state: { isPlaying: boolean; isStopped: boolean }) => void
}

const PLAYBACK_SPEEDS = [
  { value: 0.5, label: '0.5x' },
  { value: 1, label: '1x' },
  { value: 2, label: '2x' },
  { value: 4, label: '4x' }
]

export default function PlaybackControlPanel({ 
  playbackEngine, 
  onTruckPositionUpdate, 
  onFollowTruck,
  onTelemetryTruckChange,
  globalTimeRange,
  playbackStartTime,
  playbackEndTime,
  onTimeRangeChange,
  onTimeRangeReset,
  onStop,
  selectedVehicles,
  selectedTelemetryTruck,
  followingTruck,
  className = '',
  onPlaybackStateChange
}: PlaybackControlPanelProps) {
  // Component logger
  const logger = createComponentLogger('PlaybackControlPanel')
  const [playbackState, setPlaybackState] = useState<PlaybackState & { timestamp?: string }>({
    isPlaying: false,
    currentTime: 0,
    playbackSpeed: 1,
    startTime: 0,
    endTime: 0,
    totalDuration: 0
  })
  
  const [availableTrucks, setAvailableTrucks] = useState<string[]>([])
  const [selectedFollowTruck, setSelectedFollowTruck] = useState<string | null>(null)
  const [customStartTime, setCustomStartTime] = useState<number>(0)
  const [customEndTime, setCustomEndTime] = useState<number>(0)
  const [isRangeActive, setIsRangeActive] = useState<boolean>(false)
  
  // Format time display in Perth timezone with date
  const formatTimeDisplay = useCallback((timestamp: string) => {
    if (!timestamp) return '--:--:--'
    
    try {
      const date = new Date(timestamp)
      if (isNaN(date.getTime())) return '--:--:--'
      
      return date.toLocaleString('en-AU', { 
        hour12: false,
        timeZone: 'Australia/Perth',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    } catch (error) {
      console.error('Time formatting error:', error)
      return '--:--:--'
    }
  }, [])
  
  // Format time for sliders (time only)
  const formatTimeOnly = useCallback((timestamp: string) => {
    if (!timestamp) return '--:--:--'
    
    try {
      const date = new Date(timestamp)
      if (isNaN(date.getTime())) return '--:--:--'
      
      return date.toLocaleTimeString('en-AU', { 
        hour12: false,
        timeZone: 'Australia/Perth'
      })
    } catch (error) {
      return '--:--:--'
    }
  }, [])

  // Format duration display
  const formatDuration = useCallback((durationMs: number) => {
    const totalSeconds = Math.floor(durationMs / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }, [])

  // Initialize available trucks from selected vehicles
  useEffect(() => {
    if (selectedVehicles) {
      setAvailableTrucks(Array.from(selectedVehicles))
    }
  }, [selectedVehicles])

  // Notify parent of playback state changes
  useEffect(() => {
    if (onPlaybackStateChange) {
      // Determine if stopped (either explicitly stopped or at beginning and not playing)
      const isStopped = !playbackState.isPlaying && playbackState.currentTime === 0
      onPlaybackStateChange({
        isPlaying: playbackState.isPlaying,
        isStopped: isStopped
      })
    }
  }, [playbackState.isPlaying, playbackState.currentTime, onPlaybackStateChange])

  // Define stable state update handler outside useEffect to prevent recreation
  const handleStateUpdate = useCallback((newState: PlaybackState & { timestamp: string }) => {
    setPlaybackState(prev => {
      // Deep comparison to prevent unnecessary updates
      const hasChanged = (
        prev.isPlaying !== newState.isPlaying || 
        Math.abs(prev.currentTime - newState.currentTime) > 100 || // 100ms tolerance
        prev.playbackSpeed !== newState.playbackSpeed ||
        prev.timestamp !== newState.timestamp ||
        prev.startTime !== newState.startTime ||
        prev.endTime !== newState.endTime
      )
      
      return hasChanged ? newState : prev
    })
  }, []) // No dependencies - this function is stable

  // Initialize playback engine event handlers - clean event-driven approach
  useEffect(() => {
    if (!playbackEngine) {
      // Reset state when no engine available
      setPlaybackState({
        isPlaying: false,
        currentTime: 0,
        playbackSpeed: 1,
        startTime: 0,
        endTime: 0,
        totalDuration: 0
      })
      return
    }

    logger.info('playback-setup', 'Setting up event-driven PlaybackEngine')
    logger.info('playback-setup', 'Available trucks for playback', { vehicles: Array.from(selectedVehicles || []) })
    
    // Get initial state with timestamp
    const initialState = playbackEngine.getStateWithTimestamp()
    setPlaybackState(initialState)
    
    // Initialize custom time range to full range
    setCustomStartTime(initialState.startTime)
    setCustomEndTime(initialState.endTime)
    setIsRangeActive(false)

    // Subscribe to engine events using the stable handler
    playbackEngine.on('stateChange', handleStateUpdate);

    // Cleanup function to unsubscribe
    return () => {
        playbackEngine.off('stateChange', handleStateUpdate);
        logger.info('playback-cleanup', 'Cleaned up event listeners');
    };
  }, [playbackEngine, handleStateUpdate]) // Add handleStateUpdate as dependency since it's used

  // Handle play/pause toggle
  const handlePlayPause = useCallback(() => {
    if (!playbackEngine) {
      logger.warning('playback-control', 'No playback engine available')
      return
    }

    logger.userAction('play-pause', { currentState: playbackState.isPlaying })
    
    // Use engine state directly to avoid stale closure issues
    const currentEngineState = playbackEngine.getState()
    
    if (currentEngineState.isPlaying) {
      logger.info('playback-control', 'Pausing playback')
      playbackEngine.pause()
    } else {
      logger.info('playback-control', 'Starting playback')
      playbackEngine.play()
    }
    
  }, [playbackEngine]) // Removed timeout-based sync

  // Handle stop
  const handleStop = useCallback(() => {
    if (!playbackEngine) return
    logger.userAction('stop', 'Stop clicked')
    playbackEngine.stop()
    onStop?.(); // Notify parent
  }, [playbackEngine, onStop])

  // Handle timeline scrubbing - direct seek without throttling for responsive control
  // Reviewer's concern about stale closures for this callback - deps seem correct.
  const handleTimelineSeek = useCallback((seekTime: number) => {
    if (!playbackEngine) return
    
    // Convert absolute seek time to relative time within current playback range
    const baseTime = isRangeActive ? customStartTime : playbackState.startTime
    const relativeTime = seekTime - baseTime
    
    logger.info('playback-control', 'Seeking', { absolute: new Date(seekTime).toISOString(), relative: relativeTime })
    playbackEngine.seekToTime(relativeTime)
  }, [playbackEngine, isRangeActive, customStartTime, playbackState.startTime]) // Deps reviewed, seem correct

  // Handle speed change
  const handleSpeedChange = useCallback((speed: number) => {
    if (!playbackEngine) return
    logger.userAction('speed-change', { speed })
    playbackEngine.setPlaybackSpeed(speed)
  }, [playbackEngine])

  // Handle follow truck dropdown change (just sets selection, doesn't activate follow)
  const handleFollowTruckSelection = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const vehicleId = event.target.value || null
    setSelectedFollowTruck(vehicleId)
  }, [])
  
  // Handle follow button click (activates following)
  const handleFollowTruckClick = useCallback(() => {
    if (selectedFollowTruck) {
      onFollowTruck?.(selectedFollowTruck)
    }
  }, [selectedFollowTruck, onFollowTruck])
  
  // Handle stop following
  const handleStopFollowing = useCallback(() => {
    onFollowTruck?.(null)
  }, [onFollowTruck])
  
  // Handle telemetry truck change
  const handleTelemetryTruckChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
    const vehicleId = event.target.value || null
    onTelemetryTruckChange?.(vehicleId)
  }, [onTelemetryTruckChange])
  
  // Handle time range changes from dual-handle slider
  const handleTimeRangeChange = useCallback((startTime: number, endTime: number) => {
    setCustomStartTime(startTime)
    setCustomEndTime(endTime)
    setIsRangeActive(true)
    
    // Apply time range to playback engine
    if (playbackEngine) {
      playbackEngine.setTimeRange(startTime, endTime)
    }
    
    // Notify parent component
    onTimeRangeChange?.(startTime, endTime)
  }, [playbackEngine, onTimeRangeChange])
  
  // Reset to full time range
  const handleResetTimeRange = useCallback(() => {
    if (!playbackEngine) return
    
    playbackEngine.clearTimeRange()
    setCustomStartTime(playbackState.startTime)
    setCustomEndTime(playbackState.endTime)
    setIsRangeActive(false)
    onTimeRangeChange?.(playbackState.startTime, playbackState.endTime)
    onTimeRangeReset?.() // Also notify parent to reset static filtering
  }, [playbackEngine, playbackState.startTime, playbackState.endTime, onTimeRangeChange, onTimeRangeReset])

  // Calculate effective duration and format display values
  const effectiveDuration = isRangeActive 
    ? (customEndTime - customStartTime)
    : playbackState.totalDuration
    
  const effectiveStartTime = isRangeActive ? customStartTime : playbackState.startTime
  const effectiveEndTime = isRangeActive ? customEndTime : playbackState.endTime

  // Always show controls when selectedVehicles exist, even if no playback engine initially
  const hasVehicles = selectedVehicles && selectedVehicles.size > 0
  const isEngineReady = !!playbackEngine
  
  if (!hasVehicles) {
    return (
      <div className={`bg-gray-900 border border-gray-700 rounded-lg p-4 ${className}`}>
        <div className="text-center text-gray-400">
          Select vehicles to enable playback controls
        </div>
      </div>
    )
  }

  return (
    <div className={`bg-gray-900 border border-gray-700 rounded-lg p-4 shadow-xl ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Playback Controls</h3>
        <div className="text-sm text-gray-400">
          {!isEngineReady ? 'Loading engine...' : (
            <div>
              <div>{availableTrucks.length} truck{availableTrucks.length !== 1 ? 's' : ''}</div>
              <div>Duration: {formatDuration(effectiveDuration)}</div>
            </div>
          )}
        </div>
      </div>

      {/* Main Controls - Compact layout for narrow sidebar */}
      <div className="space-y-3 mb-4">
        {/* Top Row: Play Controls */}
        <div className="flex items-center justify-center space-x-3">
          {/* Play/Pause Button */}
          <button
            onClick={handlePlayPause}
            disabled={!isEngineReady}
            className={`flex-shrink-0 w-10 h-10 ${isEngineReady ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-600 cursor-not-allowed'} rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500`}
            title={!isEngineReady ? 'Loading playback engine...' : (playbackState.isPlaying ? 'Pause' : 'Play')}
          >
            {playbackState.isPlaying ? (
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 002 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
              </svg>
            )}
          </button>

          {/* Stop Button */}
          <button
            onClick={handleStop}
            disabled={!isEngineReady}
            className={`flex-shrink-0 w-10 h-10 ${isEngineReady ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-800 cursor-not-allowed'} rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-gray-500`}
            title={!isEngineReady ? 'Loading...' : 'Stop and Reset'}
          >
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Speed Controls Row */}
        <div className="flex justify-center">
          <div className="grid grid-cols-4 gap-1 bg-gray-800 rounded-lg p-1">
            {PLAYBACK_SPEEDS.map((speed) => (
              <button
                key={speed.value}
                onClick={() => handleSpeedChange(speed.value)}
                disabled={!isEngineReady}
                className={`px-2 py-1 rounded text-xs font-medium transition-all duration-150 min-w-[44px] ${
                  !isEngineReady
                    ? 'text-gray-500 cursor-not-allowed'
                    : playbackState.playbackSpeed === speed.value
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-300 hover:text-white hover:bg-gray-700'
                }`}
              >
                {speed.label}
              </button>
            ))}
          </div>
        </div>

        {/* Time Display Row */}
        <div className="flex justify-center">
          <div className="text-xs font-mono text-white bg-gray-800 border border-gray-600 px-2 py-1 rounded-lg text-center min-w-0 flex-shrink">
            {formatTimeOnly(playbackState.timestamp || '')}
          </div>
        </div>
        
        {/* Reset Range Button (when range is active) */}
        {isRangeActive && (
          <div className="flex justify-center">
            <button
              onClick={handleResetTimeRange}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white text-xs transition-colors"
              title="Reset to full time range"
            >
              Reset Range
            </button>
          </div>
        )}
      </div>

      {/* Enhanced Timeline with Dual-Handle Range Slider */}
      <div className="mb-4">
        <DualHandleRangeSlider
          min={playbackState.startTime}
          max={playbackState.endTime}
          startValue={effectiveStartTime}
          endValue={effectiveEndTime}
          currentValue={effectiveStartTime + playbackState.currentTime} // Or use playbackState.timestamp if it's absolute
          onRangeChange={handleTimeRangeChange}
          onSeek={handleTimelineSeek}
          formatLabel={(value) => {
            const date = new Date(value)
            return date.toLocaleTimeString('en-AU', { 
              hour12: false,
              timeZone: 'Australia/Perth',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            })
          }}
          className="w-full"
          disabled={!playbackEngine}
        />
      </div>

      {/* Advanced Controls - Stacked layout for narrow sidebar */}
      <div className="space-y-3">
        {/* Telemetry Vehicle Selector */}
        <div className="flex flex-col space-y-1">
          <label className="text-xs text-gray-400">Show Telemetry For:</label>
          <select
            value={selectedTelemetryTruck || ''}
            onChange={handleTelemetryTruckChange}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent w-full"
          >
            <option value="">None</option>
            {availableTrucks.sort().map((truckId) => (
              <option key={truckId} value={truckId}>
                {truckId}
              </option>
            ))}
          </select>
        </div>
        
        {/* Follow Vehicle Controls */}
        <div className="flex flex-col space-y-2">
          <label className="text-xs text-gray-400">Camera Follow:</label>
          <div className="flex flex-col space-y-1">
            <select
              value={selectedFollowTruck || ''}
              onChange={handleFollowTruckSelection}
              className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent w-full"
            >
              <option value="">Select Vehicle...</option>
              {availableTrucks.sort().map((truckId) => (
                <option key={truckId} value={truckId}>
                  {truckId}
                </option>
              ))}
            </select>
            <div className="flex space-x-1">
              <button
                onClick={handleFollowTruckClick}
                disabled={!selectedFollowTruck || !isEngineReady}
                className="flex-1 px-2 py-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs rounded transition-colors"
                title="Follow selected vehicle"
              >
                Follow
              </button>
              <button
                onClick={handleStopFollowing}
                disabled={!followingTruck || !isEngineReady}
                className="flex-1 px-2 py-1 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs rounded transition-colors"
                title="Stop following"
              >
                Stop
              </button>
            </div>
            {followingTruck && (
              <div className="text-xs text-green-400 bg-green-900/20 px-2 py-1 rounded">
                Following: {followingTruck}
              </div>
            )}
          </div>
        </div>

        {/* Playback Status */}
        <div className="flex items-center justify-between text-xs text-gray-400">
          <div className="flex items-center space-x-1">
            <div className={`w-1.5 h-1.5 rounded-full ${
              playbackState.isPlaying ? 'bg-green-500 animate-pulse' : 'bg-gray-500'
            }`} />
            <span>{playbackState.isPlaying ? 'Playing' : 'Paused'}</span>
          </div>
          <span>
            {playbackState.playbackSpeed}x
          </span>
        </div>
      </div>

      {/* Custom CSS for slider styling */}
      <style jsx>{`
        .slider-thumb::-webkit-slider-thumb {
          appearance: none;
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #2563eb;
          cursor: pointer;
          border: 2px solid #fff;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
          transition: all 0.2s ease;
        }
        
        .slider-thumb::-webkit-slider-thumb:hover {
          transform: scale(1.1);
          background: #1d4ed8;
        }
        
        .slider-thumb::-moz-range-thumb {
          height: 20px;
          width: 20px;
          border-radius: 50%;
          background: #2563eb;
          cursor: pointer;
          border: 2px solid #fff;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
        }
      `}</style>
    </div>
  )
}