'use client'

import React, { useState } from 'react'
import { PlaybackEngine, TruckPosition } from '@/utils/PlaybackEngine'
import PlaybackControlPanel from './PlaybackControlPanel'
import TelemetryStatusPanel from './TelemetryStatusPanel'

interface RightSidebarProps {
  // Playback Control Props
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
  selectedVehicles: Set<string>
  onPlaybackStateChange?: (state: { isPlaying: boolean; isStopped: boolean }) => void
  
  // Telemetry Props
  selectedTruck: string | null
  followingTruck: string | null
  currentTruckPositions: TruckPosition[]
}

export default function RightSidebar({
  // Playback Control
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
  onPlaybackStateChange,
  
  // Telemetry
  selectedTruck,
  followingTruck,
  currentTruckPositions
}: RightSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  
  if (isCollapsed) {
    return (
      <div className="w-12 bg-gray-900 border-l border-gray-700 flex flex-col">
        {/* Expand Button */}
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-3 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          title="Expand Controls"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div className="w-80 bg-gray-900 border-l border-gray-700 flex flex-col h-full overflow-hidden">
      {/* Header with Collapse Button */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold text-white">Playback & Telemetry</h2>
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
          title="Collapse Panel"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-6">
          
          {/* Playback Control Section */}
          {selectedVehicles.size > 0 && (
            <div>
              <h3 className="text-md font-semibold text-white mb-4 flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Playback Controls
              </h3>
              
              <PlaybackControlPanel
                playbackEngine={playbackEngine}
                onTruckPositionUpdate={onTruckPositionUpdate}
                onFollowTruck={onFollowTruck}
                onTelemetryTruckChange={onTelemetryTruckChange}
                globalTimeRange={globalTimeRange}
                playbackStartTime={playbackStartTime}
                playbackEndTime={playbackEndTime}
                onTimeRangeChange={onTimeRangeChange}
                onTimeRangeReset={onTimeRangeReset}
                onStop={onStop}
                selectedVehicles={selectedVehicles}
                selectedTelemetryTruck={selectedTruck}
                followingTruck={followingTruck}
                onPlaybackStateChange={onPlaybackStateChange}
                className="mb-4"
              />
            </div>
          )}

          {/* Telemetry Section */}
          {selectedTruck && (
            <div>
              <h3 className="text-md font-semibold text-white mb-4 flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Vehicle Telemetry
              </h3>
              
              <TelemetryStatusPanel
                selectedTruck={selectedTruck}
                currentPosition={currentTruckPositions.find(p => p.vehicle_id === selectedTruck) || null}
                isAutonomous={true}
              />
            </div>
          )}

          {/* Information when no vehicles selected */}
          {selectedVehicles.size === 0 && (
            <div className="text-center text-gray-400 py-8">
              <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <p className="text-sm">Select vehicles to enable playback controls</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}