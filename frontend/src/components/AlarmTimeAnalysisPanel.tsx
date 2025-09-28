'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { AlarmDataPoint } from '@/utils/alarmTrailColors'
import { filterAlarmsByShapes } from '@/utils/shapeUtils'
import { buildApiUrl } from '@/config/environment'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import TimeSlicerComponent, { TimeRange } from './TimeSlicerComponent'
import SpeedSlicerComponent, { SpeedRange } from './SpeedSlicerComponent'
import ShapeFilterComponent from './ShapeFilterComponent'

interface AlarmTimeAnalysisPanelProps {
  selectedVehicles: string[]
  selectedAlarmTypes: string[]
  speedRange?: SpeedRange | null
  selectedShapes?: string[]
  geoJsonData?: any
  onShapeSelectionChange?: (shapes: string[]) => void
  onClose: () => void
}

interface HourlyAlarmData {
  dateHour: string
  displayLabel: string
  alarmCount: number
  vehicles: { [vehicleId: string]: number }
  alarmTypes: { [alarmType: string]: number }
  [key: string]: any // For dynamic vehicle keys in stacked chart
}

interface VehicleAlarmSummary {
  vehicleId: string
  alarmCount: number
  color: string
}

interface TimeSliceOption {
  label: string
  hours: number
}

const TIME_SLICE_OPTIONS: TimeSliceOption[] = [
  { label: '1 Hour', hours: 1 },
  { label: '2 Hours', hours: 2 },
  { label: '4 Hours', hours: 4 },
  { label: '6 Hours', hours: 6 },
  { label: '12 Hours', hours: 12 },
  { label: '24 Hours', hours: 24 }
]

export default function AlarmTimeAnalysisPanel({
  selectedVehicles,
  selectedAlarmTypes,
  speedRange,
  selectedShapes = [],
  geoJsonData,
  onShapeSelectionChange,
  onClose
}: AlarmTimeAnalysisPanelProps) {
  const [alarmData, setAlarmData] = useState<AlarmDataPoint[]>([])
  const [filteredAlarmData, setFilteredAlarmData] = useState<AlarmDataPoint[]>([])
  const [hourlyData, setHourlyData] = useState<HourlyAlarmData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [timeSlice, setTimeSlice] = useState<number>(1)
  const [timeRange, setTimeRange] = useState<TimeRange | null>(null)
  const [localSpeedRange, setLocalSpeedRange] = useState<SpeedRange | null>(speedRange || null)
  const [vehicleSummary, setVehicleSummary] = useState<VehicleAlarmSummary[]>([])


  // Load all alarm data
  const loadAlarmData = useCallback(async () => {
    if (selectedVehicles.length === 0) {
      setAlarmData([])
      setFilteredAlarmData([])
      return
    }

    setLoading(true)
    setError(null)
    
    try {
      const allAlarms: AlarmDataPoint[] = []
      const vehicleSet = new Set<string>()
      const alarmTypeSet = new Set<string>()
      
      for (const vehicleId of selectedVehicles) {
        if (!vehicleId) continue // Skip undefined/empty vehicle IDs
        
        try {
          const response = await fetch(buildApiUrl(`/data/${vehicleId}`))
          if (response.ok) {
            const result = await response.json()
            const vehicleAlarms = result.data as AlarmDataPoint[]
            
            // Filter by selected alarm types
            const filteredAlarms = selectedAlarmTypes.length === 0 
              ? vehicleAlarms 
              : vehicleAlarms.filter(alarm => selectedAlarmTypes.includes(alarm.alarm_type))
            
            allAlarms.push(...filteredAlarms)
            
            // Track unique vehicles and alarm types from actual data
            filteredAlarms.forEach(alarm => {
              if (alarm.vehicle_id) vehicleSet.add(alarm.vehicle_id)
              if (alarm.alarm_type) alarmTypeSet.add(alarm.alarm_type)
            })
          }
        } catch (err) {
          console.warn(`Error loading data for ${vehicleId}:`, err)
        }
      }
      
      setAlarmData(allAlarms)
      setFilteredAlarmData(allAlarms) // Initially show all data
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      console.error('Failed to load alarm data:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedVehicles, selectedAlarmTypes])

  // Combined filtering function for time and speed
  const applyFilters = useCallback(() => {
    if (alarmData.length === 0) {
      setFilteredAlarmData([])
      return
    }

    let filtered = [...alarmData]

    // Apply time range filter
    if (timeRange) {
      filtered = filtered.filter(alarm => {
        const alarmTime = new Date(alarm.timestamp)
        return alarmTime >= timeRange.start && alarmTime <= timeRange.end
      })
    }

    // Apply speed range filter
    if (localSpeedRange) {
      filtered = filtered.filter(alarm => {
        const speed = alarm.speed_kmh
        return speed !== null && speed !== undefined && speed >= localSpeedRange.min && speed <= localSpeedRange.max
      })
    }

    // Apply shape filter
    if (selectedShapes.length > 0 && geoJsonData) {
      filtered = filterAlarmsByShapes(filtered, selectedShapes, geoJsonData)
    }

    setFilteredAlarmData(filtered)
  }, [alarmData, timeRange, localSpeedRange, selectedShapes, geoJsonData])

  // Handle time range changes from time slicer
  const handleTimeRangeChange = useCallback((newTimeRange: TimeRange | null) => {
    setTimeRange(newTimeRange)
  }, [])

  // Apply filters whenever dependencies change
  useEffect(() => {
    applyFilters()
  }, [applyFilters])

  // Process alarm data into hourly chunks with stacked vehicle data
  const processHourlyData = useCallback(() => {
    if (filteredAlarmData.length === 0) {
      setHourlyData([])
      return
    }

    // Sort alarms by timestamp
    const sortedAlarms = [...filteredAlarmData].sort((a, b) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )

    // Get time range
    const startTime = new Date(sortedAlarms[0].timestamp)
    const endTime = new Date(sortedAlarms[sortedAlarms.length - 1].timestamp)
    
    // Round start time down to nearest time slice
    const sliceMs = timeSlice * 60 * 60 * 1000
    const roundedStart = new Date(Math.floor(startTime.getTime() / sliceMs) * sliceMs)
    
    // Generate time buckets
    const buckets: { [key: string]: HourlyAlarmData } = {}
    let currentTime = new Date(roundedStart)
    
    while (currentTime <= endTime) {
      const dateHour = currentTime.toISOString()
      const displayLabel = timeSlice === 1 
        ? currentTime.toLocaleString('en-AU', { 
            timeZone: 'Australia/Perth',
            month: 'short', 
            day: '2-digit', 
            hour: '2-digit', 
            minute: '2-digit' 
          })
        : `${currentTime.toLocaleString('en-AU', { 
            timeZone: 'Australia/Perth',
            month: 'short', 
            day: '2-digit', 
            hour: '2-digit' 
          })} - ${new Date(currentTime.getTime() + sliceMs - 1).toLocaleString('en-AU', { 
            timeZone: 'Australia/Perth',
            hour: '2-digit' 
          })}`
      
      const bucket: HourlyAlarmData = {
        dateHour,
        displayLabel,
        alarmCount: 0,
        vehicles: {},
        alarmTypes: {}
      }
      
      // Initialize vehicle counts for stacked chart
      selectedVehicles.forEach(vehicleId => {
        bucket[vehicleId] = 0
      })
      
      buckets[dateHour] = bucket
      currentTime = new Date(currentTime.getTime() + sliceMs)
    }

    // Fill buckets with alarm data
    sortedAlarms.forEach(alarm => {
      const alarmTime = new Date(alarm.timestamp)
      const bucketTime = new Date(Math.floor(alarmTime.getTime() / sliceMs) * sliceMs)
      const bucketKey = bucketTime.toISOString()
      
      if (buckets[bucketKey]) {
        buckets[bucketKey].alarmCount++
        buckets[bucketKey].vehicles[alarm.vehicle_id] = (buckets[bucketKey].vehicles[alarm.vehicle_id] || 0) + 1
        buckets[bucketKey].alarmTypes[alarm.alarm_type] = (buckets[bucketKey].alarmTypes[alarm.alarm_type] || 0) + 1
        
        // Update vehicle-specific count for stacked chart
        if (selectedVehicles.includes(alarm.vehicle_id)) {
          buckets[bucketKey][alarm.vehicle_id] = (buckets[bucketKey][alarm.vehicle_id] || 0) + 1
        }
      }
    })

    // Convert to array and filter out empty buckets for cleaner visualization
    const hourlyArray = Object.values(buckets)
      .filter(bucket => bucket.alarmCount > 0)
      .sort((a, b) => new Date(a.dateHour).getTime() - new Date(b.dateHour).getTime())

    setHourlyData(hourlyArray)
  }, [filteredAlarmData, timeSlice, selectedVehicles])

  // Load alarm data when selections change
  useEffect(() => {
    loadAlarmData()
  }, [loadAlarmData])

  // Process hourly data when filtered data or time slice changes
  useEffect(() => {
    processHourlyData()
  }, [processHourlyData])

  // Generate unique colors for each vehicle with maximum contrast
  const generateUniqueColors = (vehicleIds: string[]): { [vehicleId: string]: string } => {
    // Carefully selected high-contrast colors with maximum visual distinction
    // Colors chosen to be as different as possible in hue, saturation, and brightness
    const colorPalette = [
      '#FF0000',  // Bright Red
      '#00FF00',  // Bright Green  
      '#0000FF',  // Bright Blue
      '#FFFF00',  // Bright Yellow
      '#FF00FF',  // Bright Magenta
      '#00FFFF',  // Bright Cyan
      '#FF8000',  // Bright Orange
      '#8000FF',  // Bright Purple
      '#FF0080',  // Hot Pink
      '#80FF00',  // Lime Green
      '#0080FF',  // Sky Blue
      '#FF8080',  // Light Red
      '#80FF80',  // Light Green
      '#8080FF',  // Light Blue
      '#FFFF80',  // Light Yellow
      '#FF80FF',  // Light Magenta
      '#80FFFF',  // Light Cyan
      '#FFB366',  // Light Orange
      '#B366FF',  // Light Purple
      '#FF66B3',  // Light Pink
      '#B3FF66',  // Light Lime
      '#66B3FF',  // Light Sky Blue
      '#800000',  // Dark Red
      '#008000',  // Dark Green
      '#000080',  // Dark Blue
      '#808000',  // Dark Yellow/Olive
      '#800080',  // Dark Magenta
      '#008080',  // Dark Cyan/Teal
      '#804000',  // Brown
      '#400080',  // Dark Purple
      '#804040',  // Dark Pink/Brown
      '#408040',  // Dark Lime
      '#404080',  // Dark Sky Blue
      '#C0C0C0',  // Silver
      '#808080',  // Gray
      '#400000',  // Maroon
      '#004000',  // Dark Forest Green
      '#000040',  // Navy
      '#404000',  // Dark Olive
      '#400040'   // Dark Purple/Maroon
    ]
    
    const colors: { [vehicleId: string]: string } = {}
    vehicleIds.forEach((vehicleId, index) => {
      colors[vehicleId] = colorPalette[index % colorPalette.length]
    })
    return colors
  }

  const vehicleColors = generateUniqueColors(selectedVehicles)

  // Custom tooltip for the stacked bar chart
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as HourlyAlarmData
      return (
        <div className="bg-gray-800 p-3 rounded-lg border border-gray-600 shadow-lg">
          <p className="text-white font-semibold mb-2">{label}</p>
          <p className="text-blue-400 mb-2">
            <span className="font-medium">Total Alarms: {data.alarmCount}</span>
          </p>
          
          <div className="space-y-1">
            <p className="text-gray-300 text-sm font-medium">By Vehicle:</p>
            {selectedVehicles.map(vehicleId => {
              const count = data[vehicleId] || 0
              if (count > 0) {
                return (
                  <div key={vehicleId} className="flex justify-between text-xs">
                    <span className="text-gray-300">{vehicleId}:</span>
                    <span className="text-white font-medium">{count}</span>
                  </div>
                )
              }
              return null
            }).filter(Boolean)}
          </div>
        </div>
      )
    }
    return null
  }

  return (
    <div className="bg-[#425563] rounded-xl shadow-2xl w-full max-w-[95vw] h-[95vh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700 flex-shrink-0 bg-[#ffc726]">
        <div>
          <h2 className="text-xl font-bold text-[#425563] flex items-center space-x-2">
            <div className="p-2 bg-orange-500/20 rounded-lg">
              <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span>Hour-by-Hour Alarm Analysis</span>
          </h2>
          <p className="text-[#425563] text-sm mt-1">
            Stacked analysis by truck ({selectedVehicles.length} vehicles, {selectedAlarmTypes.length === 0 ? 'all' : selectedAlarmTypes.length} alarm types)
          </p>
          {selectedAlarmTypes.length > 0 && (
            <div className="text-xs text-[#425563] mt-1">
              <span className="text-[#425563]">Analyzing:</span> {selectedAlarmTypes.join(', ')}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>


      {/* Content */}
      <div className="flex-1 flex min-h-0">
        {/* Main Chart Area */}
        <div className="flex-1 flex flex-col p-4">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto mb-4"></div>
                <span className="text-gray-400">Loading alarm data...</span>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-900/50 border border-red-700 rounded-lg p-6 mb-6">
              <div className="flex items-center">
                <svg className="w-6 h-6 text-red-400 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-red-200">{error}</p>
              </div>
            </div>
          )}

          {!loading && !error && selectedVehicles.length === 0 && (
            <div className="text-center py-12">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <h3 className="text-lg font-bold text-white mb-2">Select Vehicles for Analysis</h3>
              <p className="text-gray-400 mb-4">Use the main page filters to select vehicles and alarm types.</p>
            </div>
          )}

          {!loading && !error && hourlyData.length > 0 && (
            <div className="flex-1 bg-gray-800 rounded-lg p-3 min-h-0">
              <h3 className="text-lg font-bold text-white mb-3">
                Stacked Alarm Analysis by {timeSlice} Hour{timeSlice !== 1 ? 's' : ''}
              </h3>
              <div className="h-full" style={{ minHeight: '400px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis 
                      dataKey="displayLabel" 
                      stroke="#9CA3AF"
                      tick={{ fill: '#9CA3AF', fontSize: 11 }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis 
                      stroke="#9CA3AF"
                      tick={{ fill: '#9CA3AF', fontSize: 11 }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend 
                      wrapperStyle={{ paddingTop: '20px' }}
                      iconType="rect"
                    />
                    {selectedVehicles.map((vehicleId) => (
                      <Bar 
                        key={vehicleId}
                        dataKey={vehicleId}
                        stackId="trucks"
                        fill={vehicleColors[vehicleId]}
                        name={vehicleId}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
        
        {/* Right Side Panel */}
        <div className="w-[332px] bg-[#001e32] border-l border-gray-600 flex-shrink-0 flex flex-col overflow-hidden">
          {/* Truck Summary */}
          <div className="p-3 border-b border-gray-600">
            <h4 className="text-sm font-semibold text-white mb-3">Truck Alarm Summary</h4>
            {selectedVehicles.length > 0 && (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {selectedVehicles
                  .map(vehicleId => ({
                    vehicleId,
                    alarmCount: filteredAlarmData.filter(alarm => alarm.vehicle_id === vehicleId).length
                  }))
                  .sort((a, b) => b.alarmCount - a.alarmCount) // Sort by alarm count descending
                  .map(({ vehicleId, alarmCount }) => (
                    <div key={vehicleId} className="flex items-center justify-between p-2 bg-gray-700/50 rounded-lg">
                      <div className="flex items-center space-x-2">
                        <div 
                          className="w-4 h-4 rounded-full border border-gray-400"
                          style={{ backgroundColor: vehicleColors[vehicleId] }}
                        ></div>
                        <span className="text-white text-sm font-medium">{vehicleId}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-white text-sm font-bold">{alarmCount}</span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
          
          {/* Summary Stats */}
          <div className="p-3 border-b border-gray-600">
            <h4 className="text-sm font-semibold text-white mb-3">Overall Summary</h4>
            <div className="space-y-3">
              <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/20 p-3 rounded-lg border border-blue-500/30">
                <div className="text-xl font-bold text-blue-400">{filteredAlarmData.length}</div>
                <div className="text-xs text-blue-300 font-medium">Total Alarms</div>
              </div>
              <div className="bg-gradient-to-br from-green-500/10 to-green-600/20 p-3 rounded-lg border border-green-500/30">
                <div className="text-xl font-bold text-green-400">{selectedVehicles.length}</div>
                <div className="text-xs text-green-300 font-medium">Vehicles</div>
              </div>
              <div className="bg-gradient-to-br from-purple-500/10 to-purple-600/20 p-3 rounded-lg border border-purple-500/30">
                <div className="text-xl font-bold text-purple-400">{selectedAlarmTypes.length || 'All'}</div>
                <div className="text-xs text-purple-300 font-medium">Alarm Types</div>
              </div>
              <div className="bg-gradient-to-br from-orange-500/10 to-orange-600/20 p-3 rounded-lg border border-orange-500/30">
                <div className="text-xl font-bold text-orange-400">{hourlyData.length > 0 ? Math.max(...hourlyData.map(d => d.alarmCount)) : 0}</div>
                <div className="text-xs text-orange-300 font-medium">Max Rate</div>
                <div className="text-xs text-gray-400">per {timeSlice}h</div>
              </div>
            </div>
          </div>
          
          {/* Time Controls */}
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-300 block mb-2">Time Slice:</label>
              <select
                value={timeSlice}
                onChange={(e) => setTimeSlice(parseInt(e.target.value))}
                className="w-full px-3 py-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none transition-colors text-sm"
              >
                {TIME_SLICE_OPTIONS.map((option) => (
                  <option key={option.hours} value={option.hours}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Time Slicer Component */}
            {alarmData.length > 0 && (
              <div>
                <label className="text-sm font-medium text-gray-300 block mb-2">Time Range:</label>
                <TimeSlicerComponent
                  alarmData={alarmData}
                  onTimeRangeChange={handleTimeRangeChange}
                  disabled={loading}
                  className="bg-gray-700/30"
                />
              </div>
            )}

            {/* Speed Slicer Component */}
            {alarmData.length > 0 && (
              <div>
                <SpeedSlicerComponent
                  alarmData={alarmData}
                  onSpeedRangeChange={(newSpeedRange) => {
                    setLocalSpeedRange(newSpeedRange)
                  }}
                  disabled={loading}
                  className="bg-gray-700/30 mt-4"
                />
              </div>
            )}

            {/* Shape Filter Component */}
            {geoJsonData && onShapeSelectionChange && alarmData.length > 0 && (
              <div className="mt-4">
                <ShapeFilterComponent
                  selectedShapes={selectedShapes}
                  alarmData={alarmData}
                  geoJsonData={geoJsonData}
                  onShapeSelectionChange={onShapeSelectionChange}
                  className="bg-gray-700/30"
                />
              </div>
            )}
            
            {filteredAlarmData.length !== alarmData.length && (
              <div className="text-xs text-gray-400 p-2 bg-gray-700 rounded">
                Filtered: {filteredAlarmData.length}/{alarmData.length} alarms
                {timeRange && localSpeedRange && " (time + speed)"}
                {timeRange && !localSpeedRange && " (time only)"}
                {!timeRange && localSpeedRange && " (speed only)"}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}