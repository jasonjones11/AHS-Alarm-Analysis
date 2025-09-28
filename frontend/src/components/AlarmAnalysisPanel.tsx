'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { buildApiUrl } from '@/config/environment'
import SpeedSlicerComponent, { SpeedRange } from './SpeedSlicerComponent'
import ShapeFilterComponent from './ShapeFilterComponent'
import { getShapeNameForPoint } from '@/utils/shapeUtils'

interface Vehicle {
  vehicle_id: string
  vehicle_type: 'autonomous' | 'manual'
}

interface AlarmData {
  vehicle_id: string
  timestamp: string
  latitude: number | null
  longitude: number | null
  speed_kmh: number
  alarm_type: string
  alarm_title: string
  off_path_error_m: number | null
  pitch_deg: number
  roll_deg: number
}

interface AlarmAnalysisPanelProps {
  onVehicleSelectionChange: (vehicleIds: string[]) => void
  onAlarmTypeSelectionChange: (alarmTypes: string[]) => void
  onTrailColorModeChange: (mode: 'speed' | 'off_path' | 'pitch' | 'roll') => void
  onSpeedRangeChange?: (speedRange: SpeedRange | null) => void
  onShapeSelectionChange?: (shapes: string[]) => void
  selectedVehicles: string[]
  selectedAlarmTypes: string[]
  speedRange?: SpeedRange | null
  selectedShapes?: string[]
  trailColorMode: 'speed' | 'off_path' | 'pitch' | 'roll'
  geoJsonData?: any
}

// Default alarm types (fallback if API fails)
const DEFAULT_ALARM_TYPES = [
  "Dump Bed Cannot Be Raised While Vehicle Tilted",
  "Tilt exceeded with dump bed raised",
  "Off Path",
  "Steering Restricted",
  "Bump Detected: Dump",
  "Bump Detected: Close", 
  "Undocumented Error c419",
  "Failed to Drive When Commanded",
  "Slippery Conditions Caused Vehicle To Stop"
]

export default function AlarmAnalysisPanel({
  onVehicleSelectionChange,
  onAlarmTypeSelectionChange,
  onTrailColorModeChange,
  onSpeedRangeChange,
  onShapeSelectionChange,
  selectedVehicles,
  selectedAlarmTypes,
  speedRange,
  selectedShapes = [],
  trailColorMode,
  geoJsonData
}: AlarmAnalysisPanelProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [vehicleAlarmCounts, setVehicleAlarmCounts] = useState<Record<string, Record<string, number>>>({})
  const [availableAlarmTypes, setAvailableAlarmTypes] = useState<string[]>(DEFAULT_ALARM_TYPES)
  const [allAlarmData, setAllAlarmData] = useState<AlarmData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [totalSelectedAlarmCount, setTotalSelectedAlarmCount] = useState<number>(0)

  // Load available alarm types from API
  const loadAlarmTypes = useCallback(async () => {
    try {
      const response = await fetch(buildApiUrl('/alarm-types'))
      if (response.ok) {
        const result = await response.json()
        if (result.status === 'success' && result.data?.current_alarm_types) {
          setAvailableAlarmTypes(result.data.current_alarm_types)
        }
      } else {
        console.warn('Failed to load alarm types from API, using defaults')
        setAvailableAlarmTypes(DEFAULT_ALARM_TYPES)
      }
    } catch (error) {
      console.warn('Failed to load alarm types from API, using defaults:', error)
      setAvailableAlarmTypes(DEFAULT_ALARM_TYPES)
    }
  }, [])

  // Load available vehicles from extraction
  const loadVehicles = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const apiUrl = buildApiUrl('/trucks')
      console.log('🔍 AlarmAnalysisPanel: Attempting to fetch from:', apiUrl)
      console.log('🌐 Current window location:', window.location.href)
      const response = await fetch(apiUrl)
      if (!response.ok) {
        throw new Error(`Failed to load vehicles: ${response.statusText}`)
      }
      
      const result = await response.json()
      setVehicles(result.vehicles || [])
      
      // Load alarm counts for each vehicle and collect all alarm data
      const alarmCounts: Record<string, Record<string, number>> = {}
      const allAlarmsTemp: AlarmData[] = []
      
      for (const vehicle of result.vehicles) {
        try {
          const alarmResponse = await fetch(buildApiUrl(`/data/${vehicle.vehicle_id}`))
          if (alarmResponse.ok) {
            const alarmData = await alarmResponse.json()
            const counts: Record<string, number> = {}
            
            alarmData.data.forEach((alarm: AlarmData) => {
              counts[alarm.alarm_type] = (counts[alarm.alarm_type] || 0) + 1
              allAlarmsTemp.push(alarm) // Collect all alarm data
            })
            
            alarmCounts[vehicle.vehicle_id] = counts
          }
        } catch (err) {
          console.warn(`Failed to load alarms for ${vehicle.vehicle_id}:`, err)
        }
      }
      
      setVehicleAlarmCounts(alarmCounts)
      setAllAlarmData(allAlarmsTemp)
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      console.error('Failed to load vehicles:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAlarmTypes()
    loadVehicles()
  }, [loadAlarmTypes, loadVehicles])

  const handleVehicleToggle = useCallback((vehicleId: string) => {
    const newSelection = selectedVehicles.includes(vehicleId)
      ? selectedVehicles.filter(id => id !== vehicleId)
      : [...selectedVehicles, vehicleId]
    
    onVehicleSelectionChange(newSelection)
  }, [selectedVehicles, onVehicleSelectionChange])

  const handleAlarmTypeToggle = useCallback((alarmType: string) => {
    const newSelection = selectedAlarmTypes.includes(alarmType)
      ? selectedAlarmTypes.filter(type => type !== alarmType)
      : [...selectedAlarmTypes, alarmType]
    
    onAlarmTypeSelectionChange(newSelection)
  }, [selectedAlarmTypes, onAlarmTypeSelectionChange])

  const handleSelectAllVehicles = useCallback(() => {
    onVehicleSelectionChange(vehicles.map(v => v.vehicle_id))
  }, [vehicles, onVehicleSelectionChange])

  const handleClearAllVehicles = useCallback(() => {
    onVehicleSelectionChange([])
  }, [onVehicleSelectionChange])

  const handleSelectAllAlarms = useCallback(() => {
    onAlarmTypeSelectionChange([...availableAlarmTypes])
  }, [onAlarmTypeSelectionChange, availableAlarmTypes])

  const handleClearAllAlarms = useCallback(() => {
    onAlarmTypeSelectionChange([])
  }, [onAlarmTypeSelectionChange])

  const getVehicleAlarmCount = useCallback((vehicleId: string) => {
    const counts = vehicleAlarmCounts[vehicleId] || {}
    return Object.values(counts).reduce((sum, count) => sum + count, 0)
  }, [vehicleAlarmCounts])

  const getAlarmTypeCount = useCallback((alarmType: string) => {
    return Object.values(vehicleAlarmCounts).reduce((total, vehicleCounts) => {
      return total + (vehicleCounts[alarmType] || 0)
    }, 0)
  }, [vehicleAlarmCounts])

  // Calculate total selected alarm count whenever selections change
  useEffect(() => {
    if (allAlarmData.length === 0) {
      setTotalSelectedAlarmCount(0)
      return
    }

    // Filter alarm data based on current selections and filters
    let filteredAlarms = allAlarmData.filter(alarm => {
      // Filter by selected vehicles
      if (selectedVehicles.length > 0 && !selectedVehicles.includes(alarm.vehicle_id)) {
        return false
      }

      // Filter by selected alarm types
      if (selectedAlarmTypes.length > 0 && !selectedAlarmTypes.includes(alarm.alarm_type)) {
        return false
      }

      // Filter by speed range
      if (speedRange && alarm.speed_kmh !== null) {
        if (alarm.speed_kmh < speedRange.min || alarm.speed_kmh > speedRange.max) {
          return false
        }
      }

      // Filter by selected shapes
      if (selectedShapes && selectedShapes.length > 0 && geoJsonData && alarm.latitude && alarm.longitude) {
        const shapeName = getShapeNameForPoint(alarm.latitude, alarm.longitude, geoJsonData)
        if (!shapeName || !selectedShapes.includes(shapeName)) {
          return false
        }
      }

      return true
    })

    setTotalSelectedAlarmCount(filteredAlarms.length)
  }, [selectedVehicles, selectedAlarmTypes, speedRange, selectedShapes, geoJsonData, allAlarmData])

  if (loading) {
    return (
      <div className="w-80 bg-gray-800 p-4 shadow-lg">
        <div className="text-center text-gray-300">Loading alarm analysis data...</div>
      </div>
    )
  }

  return (
    <div className="w-full bg-gray-800 p-4 shadow-lg max-h-full overflow-y-auto">
      {/* Error Display */}
      {error && (
        <div className="bg-red-600 text-white p-2 rounded mb-4 text-sm">
          {error}
        </div>
      )}

      {/* Color By Selector */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-white mb-3">Color by</h3>
        <div className="grid grid-cols-2 gap-2">
          {[
            { mode: 'speed' as const, label: 'Speed', color: 'bg-blue-600' },
            { mode: 'off_path' as const, label: 'Off Path', color: 'bg-orange-600' },
            { mode: 'pitch' as const, label: 'Pitch', color: 'bg-green-600' },
            { mode: 'roll' as const, label: 'Roll', color: 'bg-purple-600' }
          ].map(({ mode, label, color }) => (
            <button
              key={mode}
              onClick={() => onTrailColorModeChange(mode)}
              className={`px-4 py-3 rounded text-sm transition-colors ${
                trailColorMode === mode
                  ? 'bg-[#ffc726] text-[#001e32]'
                  : 'bg-gray-600 hover:bg-gray-500 text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Vehicle Selection */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold text-white">Vehicles ({vehicles.length})</h3>
          <div className="flex space-x-2">
            <button
              onClick={handleSelectAllVehicles}
              className="px-2 py-1 bg-[#86c8bc] text-[#001e32] text-xs rounded hover:bg-[#7bb8ac]"
            >
              All
            </button>
            <button
              onClick={handleClearAllVehicles}
              className="px-2 py-1 bg-[#425563] text-white text-xs rounded hover:bg-[#556474]"
            >
              Clear
            </button>
          </div>
        </div>
        
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {vehicles.map(vehicle => {
            const alarmCount = getVehicleAlarmCount(vehicle.vehicle_id)
            const isSelected = selectedVehicles.includes(vehicle.vehicle_id)
            
            return (
              <div
                key={vehicle.vehicle_id}
                onClick={() => handleVehicleToggle(vehicle.vehicle_id)}
                className="flex items-center justify-between p-2 rounded cursor-pointer transition-colors bg-gray-700 text-gray-300 hover:bg-gray-600"
              >
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}} // Handled by div click
                    className="w-4 h-4"
                  />
                  <span className="font-medium text-base">{vehicle.vehicle_id}</span>
                </div>
                <div className="text-sm">
                  <span className="bg-gray-800 px-2 py-1 rounded">
                    {alarmCount} alarms
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Alarm Type Selection */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold text-white">Alarm Types</h3>
          <div className="flex space-x-2">
            <button
              onClick={handleSelectAllAlarms}
              className="px-2 py-1 bg-[#86c8bc] text-[#001e32] text-xs rounded hover:bg-[#7bb8ac]"
            >
              All
            </button>
            <button
              onClick={handleClearAllAlarms}
              className="px-2 py-1 bg-[#425563] text-white text-xs rounded hover:bg-[#556474]"
            >
              Clear
            </button>
          </div>
        </div>
        
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {availableAlarmTypes.map(alarmType => {
            const alarmCount = getAlarmTypeCount(alarmType)
            const isSelected = selectedAlarmTypes.includes(alarmType)
            
            return (
              <div
                key={alarmType}
                onClick={() => handleAlarmTypeToggle(alarmType)}
                className="flex items-center justify-between p-2 rounded cursor-pointer transition-colors bg-gray-700 text-gray-300 hover:bg-gray-600"
              >
                <div className="flex items-center space-x-3 flex-1">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}} // Handled by div click
                    className="w-4 h-4"
                  />
                  <span className="text-sm" title={alarmType}>
                    {alarmType}
                  </span>
                </div>
                <div className="text-sm ml-2">
                  <span className="bg-gray-800 px-2 py-1 rounded">
                    {alarmCount}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Speed Filter */}
      {allAlarmData.length > 0 && (
        <div className="border-t border-gray-600 pt-4">
          <SpeedSlicerComponent
            alarmData={allAlarmData}
            onSpeedRangeChange={onSpeedRangeChange || (() => {})}
            className="mb-4"
          />
        </div>
      )}

      {/* Shape Filter */}
      {geoJsonData && onShapeSelectionChange && allAlarmData.length > 0 && (
        <div className="border-t border-gray-600 pt-4">
          <ShapeFilterComponent
            selectedShapes={selectedShapes}
            alarmData={allAlarmData}
            geoJsonData={geoJsonData}
            onShapeSelectionChange={onShapeSelectionChange}
            className="mb-4"
          />
        </div>
      )}

      {/* Summary */}
      <div className="border-t border-gray-600 pt-4">
        <div className="text-sm text-gray-300 space-y-2">
          <div className="flex justify-between">
            <span>Selected Vehicles:</span>
            <span className="font-semibold">{selectedVehicles.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Selected Alarm Types:</span>
            <span className="font-semibold">{selectedAlarmTypes.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Selected Alarm Count:</span>
            <span className="font-semibold text-yellow-400">{totalSelectedAlarmCount.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span>Trail Color Mode:</span>
            <span className="font-semibold capitalize">{trailColorMode.replace('_', ' ')}</span>
          </div>
          <div className="flex justify-between">
            <span>Total Vehicles:</span>
            <span className="font-semibold">{vehicles.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Total Alarms:</span>
            <span className="font-semibold">
              {Object.values(vehicleAlarmCounts).reduce((total, vehicleCounts) => 
                total + Object.values(vehicleCounts).reduce((sum, count) => sum + count, 0), 0
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}