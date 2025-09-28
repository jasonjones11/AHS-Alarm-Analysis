'use client'

import { useState, useCallback } from 'react'
import Image from 'next/image'
import { createComponentLogger } from '@/utils/frontendLogger'

// Types for vehicle data
interface VehicleInfo {
  vehicle_id: string
  vehicle_type: 'autonomous' | 'manual'
  data_points: number
  time_range: {
    start: string
    end: string
  }
}

interface GPSTracesPanelProps {
  availableVehicles: VehicleInfo[]
  selectedVehicles: Set<string>
  onVehicleToggle: (vehicleId: string) => void
  vehicleTraces: Map<string, any[]>
  loading: Set<string>
  error: string | null
  onFitMapToVehicles: () => void
}

const logger = createComponentLogger('GPSTracesPanel')

export default function GPSTracesPanel({
  availableVehicles,
  selectedVehicles,
  onVehicleToggle,
  vehicleTraces,
  loading,
  error,
  onFitMapToVehicles,
}: GPSTracesPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  // Colors for different vehicle types
  const VEHICLE_COLORS = {
    autonomous: '#2563eb', // Blue for autonomous trucks
    manual: '#dc2626',     // Red for manual vehicles
  }

  // Get vehicle info by ID
  const getVehicleInfo = useCallback((vehicleId: string) => {
    return availableVehicles.find(v => v.vehicle_id === vehicleId)
  }, [availableVehicles])

  // Toggle vehicle selection
  const toggleVehicle = useCallback(async (vehicleId: string) => {
    const isSelected = selectedVehicles.has(vehicleId)
    
    logger.userAction('toggle-vehicle', 
      `${isSelected ? 'Deselecting' : 'Selecting'} vehicle ${vehicleId}`
    )
    
    onVehicleToggle(vehicleId)
  }, [selectedVehicles, onVehicleToggle])

  return (
    <div className={`bg-gray-900 shadow-xl border border-gray-700 rounded-lg transition-all duration-300 ${isCollapsed ? 'w-12 overflow-hidden' : 'w-full'}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-700 bg-gradient-to-r from-blue-900 to-gray-900 rounded-t-lg">
        <div className="flex items-center justify-between">
          <h2 className={`font-bold text-lg text-gray-100 ${isCollapsed ? 'hidden' : 'flex items-center space-x-2'}`}>
            <Image 
              src="/icons/Haul Truck - CAT - Loaded.png" 
              alt="GPS Traces" 
              width={24} 
              height={24}
              className="filter brightness-0 invert"
            />
            <span>GPS Traces</span>
          </h2>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 hover:bg-gray-700 hover:bg-opacity-70 rounded-lg transition-colors text-gray-300 hover:text-gray-100"
          >
            {isCollapsed ? '→' : '←'}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {/* Vehicle Selection Summary */}
          <div className="p-4 border-b border-gray-700 bg-gray-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-100">Available Vehicles</h3>
              <div className="text-xs text-gray-300">
                {selectedVehicles.size} of {availableVehicles.length} selected
              </div>
            </div>
            
            {/* Quick Stats */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-gray-700 p-2 rounded">
                <div className="text-sm font-bold text-blue-400">
                  {availableVehicles.filter(v => v.vehicle_type === 'autonomous').length}
                </div>
                <div className="text-gray-300">Autonomous</div>
              </div>
              <div className="bg-gray-700 p-2 rounded">
                <div className="text-sm font-bold text-red-400">
                  {availableVehicles.filter(v => v.vehicle_type === 'manual').length}
                </div>
                <div className="text-gray-300">Manual</div>
              </div>
              <div className="bg-gray-700 p-2 rounded">
                <div className="text-sm font-bold text-green-400">
                  {vehicleTraces.size}
                </div>
                <div className="text-gray-300">Loaded</div>
              </div>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mx-4 mt-4 p-3 bg-red-900 border border-red-700 rounded-lg text-sm">
              <div className="flex items-center">
                <svg className="w-4 h-4 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-red-200">{error}</p>
              </div>
            </div>
          )}

          {/* Vehicle List */}
          <div className="p-4 bg-gray-900">
            {availableVehicles.length > 0 ? (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {availableVehicles.map(vehicle => {
                  const isSelected = selectedVehicles.has(vehicle.vehicle_id)
                  const isLoading = loading.has(vehicle.vehicle_id)
                  
                  return (
                    <div
                      key={vehicle.vehicle_id}
                      className={`flex items-center justify-between p-3 rounded cursor-pointer transition-colors ${
                        isSelected 
                          ? 'bg-blue-600 hover:bg-blue-700' 
                          : 'bg-gray-700 hover:bg-gray-600'
                      }`}
                      onClick={() => toggleVehicle(vehicle.vehicle_id)}
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${
                          vehicle.vehicle_type === 'autonomous' ? 'bg-blue-400' : 'bg-red-400'
                        }`}></div>
                        <span className="text-sm font-medium">{vehicle.vehicle_id}</span>
                        <span className="text-xs text-gray-300">
                          ({vehicle.vehicle_type})
                        </span>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {isLoading && (
                          <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
                        )}
                        <div className={`w-4 h-4 rounded border ${
                          isSelected ? 'bg-white border-white' : 'border-gray-400'
                        } flex items-center justify-center`}>
                          {isSelected && (
                            <svg className="w-2 h-2 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400 text-sm">
                No vehicles available
              </div>
            )}
            
            {/* Action Buttons */}
            {availableVehicles.length > 0 && (
              <div className="flex space-x-2 mt-4 pt-4 border-t border-gray-700">
                <button
                  onClick={() => {
                    availableVehicles.forEach(vehicle => {
                      if (!selectedVehicles.has(vehicle.vehicle_id)) {
                        toggleVehicle(vehicle.vehicle_id)
                      }
                    })
                  }}
                  className="flex-1 px-3 py-2 bg-[#86c8bc] text-[#001e32] hover:bg-[#7bb8ac] rounded text-sm transition-colors"
                  disabled={selectedVehicles.size === availableVehicles.length}
                >
                  Select All
                </button>
                <button
                  onClick={() => {
                    Array.from(selectedVehicles).forEach(vehicleId => {
                      toggleVehicle(vehicleId)
                    })
                    logger.userAction('clear-all-vehicles', 'Cleared all vehicle selections')
                  }}
                  className="flex-1 px-3 py-2 bg-[#425563] text-white hover:bg-[#556474] rounded text-sm transition-colors"
                  disabled={selectedVehicles.size === 0}
                >
                  Clear All
                </button>
              </div>
            )}
            
            {/* Fit to Traces Button */}
            {selectedVehicles.size > 0 && (
              <div className="mt-3">
                <button
                  onClick={onFitMapToVehicles}
                  className="w-full px-3 py-2 bg-green-600 hover:bg-green-700 rounded text-sm transition-colors"
                >
                  Fit Map to Traces
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}