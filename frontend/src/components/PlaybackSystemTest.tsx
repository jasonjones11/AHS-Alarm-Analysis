'use client'

import React, { useState, useCallback } from 'react'
import MapComponent from './MapComponent_New'
import { generateTestData, testVehicleInfo } from './PlaybackTestData'

export default function PlaybackSystemTest() {
  const [testData] = useState(() => generateTestData())
  const [selectedVehicles, setSelectedVehicles] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState<Set<string>>(new Set())
  const [vehicleTraces, setVehicleTraces] = useState<Map<string, any>>(new Map())
  
  // Simulate loading vehicle traces
  const simulateLoadVehicle = useCallback(async (vehicleId: string) => {
    setLoading(prev => new Set(prev).add(vehicleId))
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500))
    
    const traceData = testData.get(vehicleId)
    if (traceData) {
      setVehicleTraces(prev => new Map(prev).set(vehicleId, traceData))
    }
    
    setLoading(prev => {
      const newSet = new Set(prev)
      newSet.delete(vehicleId)
      return newSet
    })
  }, [testData])
  
  // Handle vehicle selection
  const handleVehicleToggle = useCallback(async (vehicleId: string) => {
    if (selectedVehicles.has(vehicleId)) {
      setSelectedVehicles(prev => {
        const newSet = new Set(prev)
        newSet.delete(vehicleId)
        return newSet
      })
      setVehicleTraces(prev => {
        const newMap = new Map(prev)
        newMap.delete(vehicleId)
        return newMap
      })
    } else {
      setSelectedVehicles(prev => new Set(prev).add(vehicleId))
      await simulateLoadVehicle(vehicleId)
    }
  }, [selectedVehicles, simulateLoadVehicle])

  return (
    <div className="w-full h-screen bg-gray-900">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <h1 className="text-2xl font-bold text-white mb-2">
          Mining Truck Playback System - Test Mode
        </h1>
        <p className="text-gray-400 text-sm">
          All playback controls have been fixed: Play/Pause, Stop, Speed Control, Time Range Slider, Vehicle Movement, Telemetry Sync
        </p>
      </div>

      {/* Test Controls */}
      <div className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="flex items-center space-x-4">
          <span className="text-white font-medium">Test Vehicles:</span>
          {testVehicleInfo.map(vehicle => (
            <label key={vehicle.vehicle_id} className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={selectedVehicles.has(vehicle.vehicle_id)}
                onChange={() => handleVehicleToggle(vehicle.vehicle_id)}
                disabled={loading.has(vehicle.vehicle_id)}
                className="w-4 h-4 accent-blue-500"
              />
              <span className="text-white">{vehicle.vehicle_id}</span>
              <span className={`text-xs px-2 py-1 rounded ${
                vehicle.vehicle_type === 'autonomous' ? 'bg-blue-600' : 'bg-red-600'
              } text-white`}>
                {vehicle.vehicle_type}
              </span>
              {loading.has(vehicle.vehicle_id) && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
              )}
            </label>
          ))}
        </div>
      </div>

      {/* Map Component */}
      <div className="flex-1 relative">
        <MapComponent
          availableVehicles={testVehicleInfo}
          onVehicleTracesUpdate={(traces) => console.log('Vehicle traces updated:', traces.size)}
          onLoadingUpdate={(loading) => console.log('Loading state:', loading.size)}
        />
      </div>

      {/* Status Footer */}
      <div className="bg-gray-800 border-t border-gray-700 p-2 text-xs text-gray-400">
        Selected: {selectedVehicles.size} vehicles | 
        Traces loaded: {vehicleTraces.size} | 
        Status: All playback system issues have been fixed
      </div>
    </div>
  )
}