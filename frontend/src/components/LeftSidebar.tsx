'use client'

import React, { useState } from 'react'
import TrailColorModeSelector, { ColorMode } from './TrailColorModeSelector'

interface LeftSidebarProps {
  // Vehicle Control Props
  selectedVehicles: Set<string>
  onVehicleSelectionChange: (vehicles: Set<string>) => void
  availableVehicles: { vehicle_id: string; vehicle_type: string }[]
  onSelectAll: () => void
  onClearAll: () => void
  onFitToTraces: () => void
  
  // Trail Color Props
  colorMode: ColorMode
  showAlarms: boolean
  alarmFilter: string
  availableAlarmTypes: string[]
  opacity: number
  onColorModeChange: (mode: ColorMode) => void
  onShowAlarmsChange: (show: boolean) => void
  onAlarmFilterChange: (filter: string) => void
  onOpacityChange: (opacity: number) => void
}

export default function LeftSidebar({
  // Vehicle Control
  selectedVehicles,
  onVehicleSelectionChange,
  availableVehicles,
  onSelectAll,
  onClearAll,
  onFitToTraces,
  
  // Trail Color
  colorMode,
  showAlarms,
  alarmFilter,
  availableAlarmTypes,
  opacity,
  onColorModeChange,
  onShowAlarmsChange,
  onAlarmFilterChange,
  onOpacityChange
}: LeftSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  
  if (isCollapsed) {
    return (
      <div className="w-12 bg-gray-900 border-r border-gray-700 flex flex-col">
        {/* Expand Button */}
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-3 text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          title="Expand Sidebar"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div className="w-80 bg-gray-900 border-r border-gray-700 flex flex-col h-full overflow-hidden">
      {/* Header with Collapse Button */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold text-white">Vehicle Selection</h2>
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
          title="Collapse Sidebar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-6">
          
          {/* Vehicle Control Section */}
          <div>
            <h3 className="text-md font-semibold text-white mb-4 flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Vehicle Selection
            </h3>
            
            <div className="space-y-4">
              {/* Control Buttons */}
              <div className="flex space-x-2">
                <button
                  onClick={onSelectAll}
                  className="flex-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                >
                  Select All
                </button>
                <button
                  onClick={onClearAll}
                  className="flex-1 px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white text-sm rounded transition-colors"
                >
                  Clear All
                </button>
              </div>
              
              <button
                onClick={onFitToTraces}
                disabled={selectedVehicles.size === 0}
                className="w-full px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-sm rounded transition-colors"
              >
                Fit to Selected Traces
              </button>

              {/* Vehicle List */}
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {availableVehicles.map((vehicle) => (
                  <label
                    key={vehicle.vehicle_id}
                    className="flex items-center space-x-3 p-2 bg-gray-800 rounded hover:bg-gray-700 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedVehicles.has(vehicle.vehicle_id)}
                      onChange={(e) => {
                        const newSelection = new Set(selectedVehicles)
                        if (e.target.checked) {
                          newSelection.add(vehicle.vehicle_id)
                        } else {
                          newSelection.delete(vehicle.vehicle_id)
                        }
                        onVehicleSelectionChange(newSelection)
                      }}
                      className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                    />
                    <div className="flex items-center space-x-2">
                      <div className={`w-3 h-3 rounded-full ${
                        vehicle.vehicle_type === 'autonomous' ? 'bg-blue-500' : 'bg-red-500'
                      }`} />
                      <span className="text-white text-sm">{vehicle.vehicle_id}</span>
                      <span className="text-xs text-gray-400">({vehicle.vehicle_type === 'autonomous' ? 'Auto' : 'Manual'})</span>
                    </div>
                  </label>
                ))}
              </div>
              
              {/* Selection Summary */}
              <div className="text-sm text-gray-400 bg-gray-800 rounded p-2">
                {selectedVehicles.size} of {availableVehicles.length} vehicles selected
              </div>
            </div>
          </div>

          {/* Trail Color Section */}
          <div>
            <h3 className="text-md font-semibold text-white mb-4 flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m-9 0h10a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2zM9 12l2 2 4-4" />
              </svg>
              Trail Colors & Display
            </h3>
            
            <TrailColorModeSelector
              colorMode={colorMode}
              showAlarms={showAlarms}
              alarmFilter={alarmFilter}
              availableAlarmTypes={availableAlarmTypes}
              opacity={opacity}
              onColorModeChange={onColorModeChange}
              onShowAlarmsChange={onShowAlarmsChange}
              onAlarmFilterChange={onAlarmFilterChange}
              onOpacityChange={onOpacityChange}
            />
          </div>
        </div>
      </div>
    </div>
  )
}