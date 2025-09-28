'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import { apiClient } from '@/utils/api'
import TimeSlicerComponent, { TimeRange } from './TimeSlicerComponent'
import {
  extractShapesFromGeoJSON,
  processVehicleShapeAnalytics,
  processMultipleVehiclesShapeAnalytics,
  defaultShapeAnalyticsConfig
} from '@/utils/shapeAnalytics'
import type {
  ShapeAnalyticsResult,
  ShapeAnalyticsProgress,
  ShapeAnalyticsConfig,
  ShapeInfo
} from '@/types/shapeAnalytics'

// Dynamic imports for Leaflet to prevent SSR issues
const MapContainer = dynamic(() => import('react-leaflet').then(mod => ({ default: mod.MapContainer })), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(mod => ({ default: mod.TileLayer })), { ssr: false })
const GeoJSON = dynamic(() => import('react-leaflet').then(mod => ({ default: mod.GeoJSON })), { ssr: false })

// Leaflet import
let L: any = null
if (typeof window !== 'undefined') {
  L = require('leaflet')
  
  // Fix for default markers in Next.js
  delete (L.Icon.Default.prototype as any)._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: '/leaflet/marker-icon-2x.png',
    iconUrl: '/leaflet/marker-icon.png',
    shadowUrl: '/leaflet/marker-shadow.png',
  })
}

interface ShapeAnalyticsPanelProps {
  isOpen: boolean
  onClose: () => void
  selectedVehicleId: string | null
  onVehicleChange: (vehicleId: string) => void
  availableVehicles: Array<{vehicle_id: string; vehicle_type: string}>
  geoJsonData: any // Map data from uploaded file
}

export default function ShapeAnalyticsPanel({
  isOpen,
  onClose,
  selectedVehicleId,
  onVehicleChange,
  availableVehicles,
  geoJsonData
}: ShapeAnalyticsPanelProps) {
  const [analyticsResults, setAnalyticsResults] = useState<ShapeAnalyticsResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<ShapeAnalyticsProgress | null>(null)
  const [config, setConfig] = useState<ShapeAnalyticsConfig>(defaultShapeAnalyticsConfig)
  const [shapes, setShapes] = useState<ShapeInfo[]>([])
  const [rawVehicleData, setRawVehicleData] = useState<any[]>([])
  const [filteredVehicleData, setFilteredVehicleData] = useState<any[]>([])
  const [timeRange, setTimeRange] = useState<TimeRange | null>(null)
  const [colorMode, setColorMode] = useState<'speed' | 'offpath'>('speed')
  const [highlightedShapeId, setHighlightedShapeId] = useState<string | null>(null)
  const [mapInstance, setMapInstance] = useState<any>(null)
  
  // Handle map resize when panel opens or layout changes
  useEffect(() => {
    if (mapInstance && isOpen) {
      setTimeout(() => {
        mapInstance.invalidateSize()
      }, 100)
      // Additional resize after a longer delay to ensure full layout
      setTimeout(() => {
        mapInstance.invalidateSize()
      }, 500)
    }
  }, [mapInstance, isOpen, geoJsonData, selectedVehicleId, analyticsResults])
  
  // Collapsible section states
  const [expandedSections, setExpandedSections] = useState<{
    [shapeId: string]: {
      speed: boolean
      offpath: boolean
      motionController: boolean
      distance: boolean
      dwellTime: boolean
    }
  }>({})

  const toggleSection = (shapeId: string, section: 'speed' | 'offpath' | 'motionController' | 'distance' | 'dwellTime') => {
    setExpandedSections(prev => ({
      ...prev,
      [shapeId]: {
        ...prev[shapeId],
        [section]: !prev[shapeId]?.[section]
      }
    }))
  }

  // Combine multiple vehicle shape analytics results into a single result
  const combineShapeAnalyticsResults = (results: ShapeAnalyticsResult[], vehicleIds: string[]): ShapeAnalyticsResult => {
    if (results.length === 0) {
      throw new Error('No results to combine')
    }

    // Combine all shapes data
    const combinedShapes: { [shapeId: string]: any } = {}
    let totalProcessingTime = 0
    let totalPointsProcessed = 0

    results.forEach(result => {
      totalProcessingTime += result.processing_time_ms
      totalPointsProcessed += result.total_points_processed

      result.shapes.forEach(shapeData => {
        const shapeId = shapeData.shape_id
        
        if (!combinedShapes[shapeId]) {
          combinedShapes[shapeId] = {
            shape_id: shapeId,
            shape_name: shapeData.shape_name,
            shape_type: shapeData.shape_type,
            total_vehicle_points: 0,
            speed_analytics: {
              avg_speed: 0,
              max_speed: 0,
              min_speed: Infinity,
              speed_distribution: {}
            },
            offpath_analytics: {
              avg_offpath: 0,
              max_absolute_offpath: 0,
              total_points_with_offpath: 0,
              offpath_frequency: 0,
              offpath_severity: {
                low: 0,
                medium: 0,
                high: 0
              }
            },
            motion_controller_time: {},
            distance_analytics: {
              total_distance_km: 0,
              distance_distribution: {}
            },
            dwell_time: {
              total_time_seconds: 0,
              entry_count: 0,
              average_visit_duration_seconds: 0,
              max_continuous_time_seconds: 0
            }
          }
        }

        const combined = combinedShapes[shapeId]
        
        // Combine points
        combined.total_vehicle_points += shapeData.total_vehicle_points

        // Combine speed analytics (weighted average)
        const totalPoints = combined.total_vehicle_points
        const newPoints = shapeData.total_vehicle_points
        const existingWeight = (totalPoints - newPoints) / totalPoints
        const newWeight = newPoints / totalPoints

        if (totalPoints > 0) {
          combined.speed_analytics.avg_speed = 
            (combined.speed_analytics.avg_speed * existingWeight) + 
            (shapeData.speed_analytics.avg_speed * newWeight)
        } else {
          combined.speed_analytics.avg_speed = shapeData.speed_analytics.avg_speed
        }

        combined.speed_analytics.max_speed = Math.max(combined.speed_analytics.max_speed, shapeData.speed_analytics.max_speed)
        combined.speed_analytics.min_speed = Math.min(combined.speed_analytics.min_speed, shapeData.speed_analytics.min_speed)

        // Combine speed distribution
        Object.entries(shapeData.speed_analytics.speed_distribution).forEach(([range, count]) => {
          combined.speed_analytics.speed_distribution[range] = (combined.speed_analytics.speed_distribution[range] || 0) + count
        })

        // Combine offpath analytics
        if (totalPoints > 0) {
          combined.offpath_analytics.avg_offpath = 
            (combined.offpath_analytics.avg_offpath * existingWeight) + 
            (shapeData.offpath_analytics.avg_offpath * newWeight)
        } else {
          combined.offpath_analytics.avg_offpath = shapeData.offpath_analytics.avg_offpath
        }

        combined.offpath_analytics.max_absolute_offpath = Math.max(combined.offpath_analytics.max_absolute_offpath, shapeData.offpath_analytics.max_absolute_offpath)
        combined.offpath_analytics.total_points_with_offpath += shapeData.offpath_analytics.total_points_with_offpath
        combined.offpath_analytics.offpath_frequency = combined.total_vehicle_points > 0 ? 
          (combined.offpath_analytics.total_points_with_offpath / combined.total_vehicle_points) * 100 : 0
        
        // Combine offpath severity
        Object.entries(shapeData.offpath_analytics.offpath_severity).forEach(([level, count]) => {
          combined.offpath_analytics.offpath_severity[level as keyof typeof combined.offpath_analytics.offpath_severity] += count
        })

        // Combine motion controller time
        Object.entries(shapeData.motion_controller_time).forEach(([state, data]: [string, any]) => {
          if (!combined.motion_controller_time[state]) {
            combined.motion_controller_time[state] = { duration_seconds: 0, percentage: 0 }
          }
          combined.motion_controller_time[state].duration_seconds += data.duration_seconds
        })

        // Combine distance analytics
        combined.distance_analytics.total_distance_km += shapeData.distance_analytics.total_distance_km

        // Combine dwell time
        combined.dwell_time.total_time_seconds += shapeData.dwell_time.total_time_seconds
        combined.dwell_time.entry_count += shapeData.dwell_time.entry_count
        combined.dwell_time.max_continuous_time_seconds = Math.max(
          combined.dwell_time.max_continuous_time_seconds, 
          shapeData.dwell_time.max_continuous_time_seconds
        )
      })
    })

    // Recalculate percentages for motion controller time
    Object.values(combinedShapes).forEach((shapeData: any) => {
      const totalDuration = Object.values(shapeData.motion_controller_time).reduce((sum: number, data: any) => sum + data.duration_seconds, 0)
      Object.values(shapeData.motion_controller_time).forEach((data: any) => {
        data.percentage = totalDuration > 0 ? (data.duration_seconds / totalDuration) * 100 : 0
      })

      // Recalculate average dwell time
      if (shapeData.dwell_time.entry_count > 0) {
        shapeData.dwell_time.average_visit_duration_seconds = shapeData.dwell_time.total_time_seconds / shapeData.dwell_time.entry_count
      }

      // Fix min values if no data
      if (shapeData.speed_analytics.min_speed === Infinity) shapeData.speed_analytics.min_speed = 0
    })

    return {
      vehicle_id: 'ALL_AUTONOMOUS',
      vehicle_type: 'combined',
      total_shapes_analyzed: Object.keys(combinedShapes).length,
      total_points_processed: totalPointsProcessed,
      processing_time_ms: totalProcessingTime,
      shapes: Object.values(combinedShapes)
    }
  }

  // Handle time range changes from time slicer
  const handleTimeRangeChange = useCallback((newTimeRange: TimeRange | null) => {
    setTimeRange(newTimeRange)
    
    if (!newTimeRange || rawVehicleData.length === 0) {
      setFilteredVehicleData(rawVehicleData)
      return
    }

    // Filter vehicle data by time range
    const filtered = rawVehicleData.filter(point => {
      const pointTime = new Date(point.timestamp)
      return pointTime >= newTimeRange.start && pointTime <= newTimeRange.end
    })

    setFilteredVehicleData(filtered)
  }, [rawVehicleData])

  // Update filtered data when raw data changes
  useEffect(() => {
    if (!timeRange) {
      setFilteredVehicleData(rawVehicleData)
    } else {
      handleTimeRangeChange(timeRange)
    }
  }, [rawVehicleData, timeRange, handleTimeRangeChange])

  // Process analytics with existing raw data and provided time filter
  const processAnalyticsWithTimeFilter = useCallback(async (providedTimeRange?: TimeRange | null) => {
    if (!selectedVehicleId || rawVehicleData.length === 0) return

    // Use provided time range or fall back to current state
    const filterTimeRange = providedTimeRange !== undefined ? providedTimeRange : timeRange

    setLoading(true)
    setError(null)
    setProgress(null)

    try {
      // Create vehicle data structure with time filtering applied
      const vehicleDataArray = [{
        id: selectedVehicleId,
        type: availableVehicles.find(v => v.vehicle_id === selectedVehicleId)?.vehicle_type || 'unknown',
        data: rawVehicleData.filter(point => {
          if (!filterTimeRange) return true
          const pointTime = new Date(point.timestamp)
          return pointTime >= filterTimeRange.start && pointTime <= filterTimeRange.end
        })
      }]

      // Determine if we should enable sampling for large datasets
      const totalPoints = vehicleDataArray.reduce((sum, v) => sum + v.data.length, 0)
      const analysisConfig = {
        ...config,
        enable_sampling: totalPoints > config.max_points_threshold
      }

      if (analysisConfig.enable_sampling) {
        console.log(`Large dataset detected (${totalPoints} points). Enabling sampling at ${(analysisConfig.sample_rate * 100).toFixed(1)}% rate.`)
      }

      // Process shape analytics
      const results = await processMultipleVehiclesShapeAnalytics(
        vehicleDataArray,
        shapes,
        analysisConfig,
        (progressUpdate) => {
          setProgress(progressUpdate)
        }
      )

      // For single vehicle analysis, just set the results directly
      setAnalyticsResults(results)
      setProgress(null)

    } catch (err) {
      setError(`Failed to calculate shape analytics: ${err}`)
      console.error('Shape analytics error:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedVehicleId, rawVehicleData, timeRange, shapes, config, availableVehicles])

  // Extract shapes when geoJsonData changes
  useEffect(() => {
    if (geoJsonData) {
      const extractedShapes = extractShapesFromGeoJSON(geoJsonData)
      setShapes(extractedShapes)
      setError(null)
    } else {
      setShapes([])
    }
  }, [geoJsonData])

  // Load analytics data when vehicle is selected
  const loadShapeAnalytics = useCallback(async (vehicleIds: string[]) => {
    if (!geoJsonData || shapes.length === 0) {
      setError('No map data available. Please upload a map first.')
      return
    }

    if (vehicleIds.length === 0) {
      setError('Please select at least one vehicle for analysis.')
      return
    }

    setLoading(true)
    setError(null)
    setProgress(null)
    setAnalyticsResults([])

    try {
      // Load vehicle data for selected vehicles
      const vehicleDataPromises = vehicleIds.map(async (vehicleId) => {
        const playbackData = await fetch(`http://127.0.0.1:9500/vehicles/${vehicleId}/playback`).then(r => r.json()).catch(() => ({ data: [] }))
        return {
          id: vehicleId,
          type: availableVehicles.find(v => v.vehicle_id === vehicleId)?.vehicle_type || 'unknown',
          data: playbackData.data || []
        }
      })

      const vehicleDataArray = await Promise.all(vehicleDataPromises)
      
      // Check for empty data
      const validVehicles = vehicleDataArray.filter(v => v.data.length > 0)
      if (validVehicles.length === 0) {
        setError('No vehicle data found for selected vehicles.')
        setLoading(false)
        return
      }

      // Store raw data for time slicing
      const allRawData = validVehicles.flatMap(v => v.data)
      setRawVehicleData(allRawData)

      // Use filtered data for analytics (or raw data if no filter)
      const dataToAnalyze = filteredVehicleData.length > 0 ? validVehicles.map(vehicle => ({
        ...vehicle,
        data: vehicle.data.filter((point: any) => {
          if (!timeRange) return true
          const pointTime = new Date(point.timestamp)
          return pointTime >= timeRange.start && pointTime <= timeRange.end
        })
      })) : validVehicles

      // Determine if we should enable sampling for large datasets
      const totalPoints = dataToAnalyze.reduce((sum, v) => sum + v.data.length, 0)
      const analysisConfig = {
        ...config,
        enable_sampling: totalPoints > config.max_points_threshold
      }

      if (analysisConfig.enable_sampling) {
        console.log(`Large dataset detected (${totalPoints} points). Enabling sampling at ${(analysisConfig.sample_rate * 100).toFixed(1)}% rate.`)
      }

      // Process shape analytics
      const results = await processMultipleVehiclesShapeAnalytics(
        dataToAnalyze,
        shapes,
        analysisConfig,
        (progressUpdate) => {
          setProgress(progressUpdate)
        }
      )

      // If analyzing all autonomous vehicles, combine the results
      if (selectedVehicleId === 'ALL_AUTONOMOUS') {
        const autonomousVehicleIds = availableVehicles.filter(v => v.vehicle_type === 'autonomous').map(v => v.vehicle_id)
        const combinedResult = combineShapeAnalyticsResults(results, autonomousVehicleIds)
        setAnalyticsResults([combinedResult])
      } else {
        setAnalyticsResults(results)
      }
      setProgress(null)

    } catch (err) {
      setError(`Failed to calculate shape analytics: ${err}`)
      console.error('Shape analytics error:', err)
      console.error('Error stack:', err instanceof Error ? err.stack : 'No stack trace')
    } finally {
      setLoading(false)
    }
  }, [geoJsonData, shapes, availableVehicles, config])

  // Handle vehicle selection (single or all autonomous)
  useEffect(() => {
    if (selectedVehicleId === 'ALL_AUTONOMOUS') {
      const autonomousVehicles = availableVehicles.filter(v => v.vehicle_type === 'autonomous').map(v => v.vehicle_id)
      if (autonomousVehicles.length > 0) {
        loadShapeAnalytics(autonomousVehicles)
      }
    } else if (selectedVehicleId) {
      loadShapeAnalytics([selectedVehicleId])
    }
  }, [selectedVehicleId, loadShapeAnalytics, availableVehicles])


  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds.toFixed(1)}s`
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    if (minutes < 60) return `${minutes}m ${remainingSeconds.toFixed(0)}s`
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    return `${hours}h ${remainingMinutes}m`
  }

  const formatDistance = (km: number) => {
    if (km < 1) return `${(km * 1000).toFixed(0)}m`
    return `${km.toFixed(2)}km`
  }

  const getVehicleIcon = (vehicleId: string) => {
    const id = vehicleId.toUpperCase()
    if (id.startsWith('DT') || id.startsWith('AT')) {
      return '/icons/Haul Truck - CAT - Loaded.png'
    } else if (id.startsWith('LV')) {
      return '/icons/LV.png'
    } else if (id.includes('DZ') || id.includes('DOZER')) {
      return '/icons/Dozer.png'
    } else if (id.includes('WC') || id.includes('WATER')) {
      return '/icons/Water Cart.png'
    } else if (id.includes('GR') || id.includes('GRADER')) {
      return '/icons/Grader.png'
    } else if (id.includes('EX') || id.includes('EXCAVATOR')) {
      return '/icons/Excavator.png'
    } else if (id.includes('LR') || id.includes('LOADER')) {
      return '/icons/Loader.png'
    }
    return '/icons/Water Cart.png'
  }

  // Get color for shape based on analytics
  const getShapeColor = (shapeId: string): string => {
    if (!analyticsResults.length) return '#666666' // Default gray

    const shapeData = analyticsResults[0].shapes.find(s => s.shape_id === shapeId)
    if (!shapeData) return '#666666'

    if (colorMode === 'speed') {
      const speed = shapeData.speed_analytics.avg_speed
      if (speed === 0) return '#666666'        // Gray - no data
      if (speed < 5) return '#ff0000'          // Red - very slow
      if (speed < 15) return '#ff8800'         // Orange - slow
      if (speed < 25) return '#ffff00'         // Yellow - moderate
      if (speed < 35) return '#88ff00'         // Light green - good
      return '#00ff00'                         // Green - fast
    } else {
      const offpath = Math.abs(shapeData.offpath_analytics.avg_offpath)
      if (offpath === 0) return '#666666'      // Gray - no data
      if (offpath > 1.2) return '#ff0000'      // Red - high deviation (abs >1.2m)
      if (offpath >= 0.8) return '#ff8800'     // Orange - moderate deviation (abs 0.8-1.2m)
      return '#00ff00'                         // Green - good (abs <0.8m)
    }
  }

  // Get opacity for shape (highlighted vs normal)
  const getShapeOpacity = (shapeId: string): number => {
    if (highlightedShapeId === null) return 0.6
    return highlightedShapeId === shapeId ? 0.9 : 0.3
  }

  if (!isOpen) return null

  // Show error if no map data
  if (!geoJsonData) {
    return (
      <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center space-x-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V7.618a1 1 0 01.553-.894L9 4l6 3 6-3v13l-6 3-6-3z" />
                </svg>
              </div>
              <span>Shape Analytics Dashboard</span>
            </h2>
            <p className="text-gray-400 mt-1">Vehicle performance analysis by map shapes</p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* No Map Data Message */}
        <div className="flex-1 p-6 flex items-center justify-center">
          <div className="text-center py-12">
            <svg className="w-20 h-20 mx-auto mb-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V7.618a1 1 0 01.553-.894L9 4l6 3 6-3v13l-6 3-6-3z" />
            </svg>
            <h3 className="text-xl font-bold text-white mb-2">No Map Data Available</h3>
            <p className="text-gray-400 mb-4">Upload a map file (.geojson) to enable shape analytics.</p>
            <p className="text-gray-500 text-sm">Use the "Upload Map" button in the header to get started.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-[95vw] h-[90vh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-gray-700">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center space-x-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V7.618a1 1 0 01.553-.894L9 4l6 3 6-3v13l-6 3-6-3z" />
              </svg>
            </div>
            <span>Shape Analytics Dashboard</span>
          </h2>
          <p className="text-gray-400 mt-1">Vehicle performance analysis by map shapes ({shapes.length} shapes available)</p>
        </div>
        <button
          onClick={onClose}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Vehicle Selection and Time Slicer - Side by Side */}
      <div className="p-6 bg-gradient-to-r from-gray-800 to-gray-700 border-b border-gray-700">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Vehicle Selection */}
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-300 mb-2">Select Vehicle</label>
              <select
                value={selectedVehicleId || ''}
                onChange={(e) => onVehicleChange(e.target.value)}
                className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none transition-colors"
              >
                <option value="">Choose a vehicle for shape analysis...</option>
                {availableVehicles.filter(v => v.vehicle_type === 'autonomous').length > 1 && (
                  <option value="ALL_AUTONOMOUS">All Autonomous Trucks Combined</option>
                )}
                {availableVehicles?.map((vehicle, index) => (
                  <option key={`${vehicle.vehicle_id}-${vehicle.vehicle_type}-${index}`} value={vehicle.vehicle_id}>
                    {vehicle.vehicle_id} ({vehicle.vehicle_type === 'autonomous' ? 'Autonomous' : 'Manual'})
                  </option>
                )) || null}
              </select>
            </div>
            {selectedVehicleId && (
              <div className="flex items-center space-x-3">
                {selectedVehicleId === 'ALL_AUTONOMOUS' ? (
                  <div className="flex items-center space-x-2">
                    <div className="p-2 bg-blue-500/20 rounded-lg">
                      <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-white">All Autonomous Trucks</div>
                      <div className="text-sm text-gray-400">
                        Combined analysis of {availableVehicles.filter(v => v.vehicle_type === 'autonomous').length} vehicles
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <Image
                      src={getVehicleIcon(selectedVehicleId)}
                      alt={selectedVehicleId}
                      width={48}
                      height={48}
                      className="filter brightness-0 invert"
                    />
                    <div>
                      <div className="text-lg font-bold text-white">{selectedVehicleId}</div>
                      <div className="text-sm text-gray-400">
                        {availableVehicles?.find(v => v.vehicle_id === selectedVehicleId)?.vehicle_type === 'autonomous' ? 'Autonomous Vehicle' : 'Manual Vehicle'}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Time Slicer */}
          {rawVehicleData.length > 0 && (
            <div className="flex flex-col justify-center">
              <TimeSlicerComponent
                alarmData={rawVehicleData}
                onTimeRangeChange={handleTimeRangeChange}
                onApplyFilter={processAnalyticsWithTimeFilter}
                disabled={loading}
                className=""
              />
            </div>
          )}
          
        </div>
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Column - Map */}
        <div className="w-1/2 border-r border-gray-700 relative flex flex-col min-h-0">
          {geoJsonData && (
            <>
              {/* Compact Control Panel */}
              <div className="absolute top-2 left-2 right-2 z-[1000] flex justify-between items-start space-x-2">
                {/* Color Mode Selector - Compact */}
                <div className="bg-gray-800/95 backdrop-blur-sm rounded-lg p-2 flex-shrink-0 shadow-lg">
                  <div className="text-xs font-medium text-white mb-1">Color By:</div>
                  <div className="flex space-x-1">
                    <button
                      onClick={() => setColorMode('speed')}
                      className={`px-2 py-1 text-xs rounded ${
                        colorMode === 'speed' 
                          ? 'bg-blue-500 text-white' 
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      Speed
                    </button>
                    <button
                      onClick={() => setColorMode('offpath')}
                      className={`px-2 py-1 text-xs rounded ${
                        colorMode === 'offpath' 
                          ? 'bg-blue-500 text-white' 
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      }`}
                    >
                      Off-path
                    </button>
                  </div>
                </div>

                {/* Compact Legend */}
                <div className="bg-gray-800/95 backdrop-blur-sm rounded-lg p-2 flex-shrink-0 shadow-lg">
                  <div className="text-xs font-medium text-white mb-1">
                    {colorMode === 'speed' ? 'Speed (km/h)' : 'Off-path (m)'}
                  </div>
                  <div className="flex items-center space-x-3 text-xs">
                    {colorMode === 'speed' ? (
                      <>
                        <div className="flex items-center space-x-1">
                          <div className="w-3 h-2 bg-red-500"></div>
                          <span className="text-gray-300">&lt;5</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <div className="w-3 h-2 bg-orange-500"></div>
                          <span className="text-gray-300">5-15</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <div className="w-3 h-2 bg-yellow-500"></div>
                          <span className="text-gray-300">15-25</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <div className="w-3 h-2 bg-lime-500"></div>
                          <span className="text-gray-300">25-35</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <div className="w-3 h-2 bg-green-500"></div>
                          <span className="text-gray-300">&gt;35</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center space-x-1">
                          <div className="w-3 h-2 bg-green-500"></div>
                          <span className="text-gray-300">&lt;0.8m</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <div className="w-3 h-2 bg-orange-500"></div>
                          <span className="text-gray-300">0.8-1.2m</span>
                        </div>
                        <div className="flex items-center space-x-1">
                          <div className="w-3 h-2 bg-red-500"></div>
                          <span className="text-gray-300">&gt;1.2m</span>
                        </div>
                      </>
                    )}
                    <div className="flex items-center space-x-1">
                      <div className="w-3 h-2 bg-gray-500"></div>
                      <span className="text-gray-300">No data</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Map */}
              <div className="absolute inset-0 w-full h-full">
                <MapContainer
                  center={[-22.4, 119.8]}
                  zoom={13}
                  style={{ height: '100%', width: '100%' }}
                  className="rounded-none"
                  zoomControl={false}
                  ref={setMapInstance}
                  whenReady={() => {
                    // Force resize when map is ready
                    setTimeout(() => {
                      if (mapInstance) {
                        mapInstance.invalidateSize()
                      }
                    }, 100)
                  }}
                >
                  <GeoJSON
                    data={geoJsonData}
                    filter={(feature) => {
                      const asiType = feature?.properties?.AsiType || feature?.properties?.type || ''
                      // Filter out unwanted shape types like main map does
                      return asiType !== 'VectorImageDto_V1' && 
                             asiType !== 'AOZ' && 
                             asiType !== 'AozShapeDto_V1' &&
                             asiType !== 'ImageDto_V1' &&
                             !asiType.includes('Vector') &&
                             !asiType.includes('Image')
                    }}
                    style={(feature) => {
                      const shapeId = feature?.properties?.AsiID || feature?.properties?.id || ''
                      return {
                        fillColor: getShapeColor(shapeId),
                        weight: highlightedShapeId === shapeId ? 3 : 1,
                        opacity: 1,
                        color: highlightedShapeId === shapeId ? '#ffffff' : '#333333',
                        fillOpacity: getShapeOpacity(shapeId)
                      }
                    }}
                    onEachFeature={(feature, layer) => {
                      const shapeId = feature?.properties?.AsiID || feature?.properties?.id || ''
                      const shapeName = feature?.properties?.AsiName || feature?.properties?.name || 'Unnamed'
                      
                      layer.on('click', () => {
                        setHighlightedShapeId(highlightedShapeId === shapeId ? null : shapeId)
                      })
                      
                      layer.bindTooltip(shapeName, {
                        permanent: false,
                        direction: 'top'
                      })
                    }}
                  />
                </MapContainer>
              </div>
            </>
          )}
          
          {!geoJsonData && (
            <div className="flex items-center justify-center h-full bg-gray-800">
              <div className="text-center">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 113 16.382V7.618a1 1 0 01.553-.894L9 4l6 3 6-3v13l-6 3-6-3z" />
                </svg>
                <h3 className="text-lg font-bold text-white mb-2">No Map Data</h3>
                <p className="text-gray-400">Upload a map file to see shape visualization.</p>
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Analytics */}
        <div className="w-1/2 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-6">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <span className="text-gray-400 block mb-2">Calculating shape analytics...</span>
              {progress && (
                <div className="text-sm text-gray-500">
                  <div>Processing: {progress.current_shape}</div>
                  <div>Progress: {progress.percentage.toFixed(1)}%</div>
                  {progress.estimated_remaining_ms > 0 && (
                    <div>Estimated time remaining: {Math.ceil(progress.estimated_remaining_ms / 1000)}s</div>
                  )}
                </div>
              )}
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

        {analyticsResults.length > 0 && !loading && (
          <div className="space-y-6">
            {analyticsResults.map((result) => (
              <div key={result.vehicle_id} className="space-y-4">
                {/* Vehicle Summary */}
                <div className="bg-gray-800 rounded-lg p-6">
                  <h3 className="text-xl font-bold text-white mb-4 flex items-center space-x-2">
                    <Image
                      src={getVehicleIcon(result.vehicle_id)}
                      alt={result.vehicle_id}
                      width={24}
                      height={24}
                      className="filter brightness-0 invert"
                    />
                    <span>{result.vehicle_id} Shape Analytics</span>
                  </h3>
                  
                  <div className="grid grid-cols-4 gap-4 mb-4">
                    <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/20 p-4 rounded-lg border border-blue-500/30">
                      <div className="text-2xl font-bold text-blue-400 mb-1">{result.shapes.length}</div>
                      <div className="text-sm text-blue-300 font-medium">Shapes Visited</div>
                      <div className="text-xs text-gray-400">of {shapes.length} total</div>
                    </div>
                    <div className="bg-gradient-to-br from-green-500/10 to-green-600/20 p-4 rounded-lg border border-green-500/30">
                      <div className="text-2xl font-bold text-green-400 mb-1">{result.total_points_processed.toLocaleString()}</div>
                      <div className="text-sm text-green-300 font-medium">Points Analyzed</div>
                      <div className="text-xs text-gray-400">GPS data points</div>
                    </div>
                    <div className="bg-gradient-to-br from-purple-500/10 to-purple-600/20 p-4 rounded-lg border border-purple-500/30">
                      <div className="text-2xl font-bold text-purple-400 mb-1">{(result.processing_time_ms / 1000).toFixed(1)}s</div>
                      <div className="text-sm text-purple-300 font-medium">Processing Time</div>
                      <div className="text-xs text-gray-400">calculation duration</div>
                    </div>
                    <div className="bg-gradient-to-br from-yellow-500/10 to-yellow-600/20 p-4 rounded-lg border border-yellow-500/30">
                      <div className="text-2xl font-bold text-yellow-400 mb-1">{result.vehicle_type}</div>
                      <div className="text-sm text-yellow-300 font-medium">Vehicle Type</div>
                      <div className="text-xs text-gray-400">operation mode</div>
                    </div>
                  </div>
                </div>

                {/* Shape Analytics */}
                {result.shapes.map((shapeData) => (
                  <div key={shapeData.shape_id} className="bg-gray-800 rounded-lg p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h4 
                        className="text-lg font-bold text-white cursor-pointer hover:text-blue-400 transition-colors flex items-center space-x-2"
                        onClick={() => setHighlightedShapeId(
                          highlightedShapeId === shapeData.shape_id ? null : shapeData.shape_id
                        )}
                      >
                        <span>{shapeData.shape_name}</span>
                        {highlightedShapeId === shapeData.shape_id && (
                          <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </h4>
                      <div className="flex items-center space-x-2">
                        <span className="px-2 py-1 bg-gray-700 text-gray-300 text-xs rounded-full">
                          {shapeData.shape_type}
                        </span>
                        <span className="px-2 py-1 bg-blue-500/20 text-blue-300 text-xs rounded-full">
                          {shapeData.total_vehicle_points} points
                        </span>
                      </div>
                    </div>

                    {/* Quick Stats */}
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div className="text-center">
                        <div className="text-xl font-bold text-green-400">{shapeData.speed_analytics.avg_speed.toFixed(1)}</div>
                        <div className="text-xs text-gray-400">Avg Speed (km/h)</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-red-400">{shapeData.offpath_analytics.avg_offpath.toFixed(2)}</div>
                        <div className="text-xs text-gray-400">Avg Offpath (m)</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-purple-400">{formatDuration(shapeData.dwell_time.total_time_seconds)}</div>
                        <div className="text-xs text-gray-400">Total Time</div>
                      </div>
                    </div>

                    {/* Expandable Sections */}
                    <div className="space-y-2">
                      {/* Speed Analytics */}
                      <div>
                        <button
                          onClick={() => toggleSection(shapeData.shape_id, 'speed')}
                          className="w-full flex items-center justify-between text-gray-400 hover:text-white transition-colors p-2 rounded hover:bg-gray-700"
                        >
                          <span className="text-sm font-medium">Speed Analysis</span>
                          <svg 
                            className={`w-4 h-4 transition-transform ${expandedSections[shapeData.shape_id]?.speed ? 'rotate-90' : ''}`}
                            fill="none" 
                            stroke="currentColor" 
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                        {expandedSections[shapeData.shape_id]?.speed && (
                          <div className="bg-gray-700/50 rounded-lg p-4 mt-2">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <div className="text-sm text-gray-400 mb-1">Speed Statistics</div>
                                <div className="space-y-1">
                                  <div className="flex justify-between">
                                    <span className="text-gray-300">Average:</span>
                                    <span className="text-green-400 font-mono">{shapeData.speed_analytics.avg_speed.toFixed(1)} km/h</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-300">Maximum:</span>
                                    <span className="text-red-400 font-mono">{shapeData.speed_analytics.max_speed.toFixed(1)} km/h</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-300">Minimum:</span>
                                    <span className="text-blue-400 font-mono">{shapeData.speed_analytics.min_speed.toFixed(1)} km/h</span>
                                  </div>
                                </div>
                              </div>
                              <div>
                                <div className="text-sm text-gray-400 mb-1">Speed Distribution</div>
                                <div className="space-y-1">
                                  {Object.entries(shapeData.speed_analytics.speed_distribution).map(([range, count]) => (
                                    <div key={range} className="flex justify-between">
                                      <span className="text-gray-300">{range} km/h:</span>
                                      <span className="text-yellow-400 font-mono">{count}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Motion Controller */}
                      {Object.keys(shapeData.motion_controller_time).length > 0 && (
                        <div>
                          <button
                            onClick={() => toggleSection(shapeData.shape_id, 'motionController')}
                            className="w-full flex items-center justify-between text-gray-400 hover:text-white transition-colors p-2 rounded hover:bg-gray-700"
                          >
                            <span className="text-sm font-medium">Motion Controller States</span>
                            <svg 
                              className={`w-4 h-4 transition-transform ${expandedSections[shapeData.shape_id]?.motionController ? 'rotate-90' : ''}`}
                              fill="none" 
                              stroke="currentColor" 
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </button>
                          {expandedSections[shapeData.shape_id]?.motionController && (
                            <div className="bg-gray-700/50 rounded-lg p-4 mt-2">
                              <div className="space-y-2">
                                {Object.entries(shapeData.motion_controller_time)
                                  .sort(([, a], [, b]) => b.duration_seconds - a.duration_seconds)
                                  .map(([state, data]) => (
                                    <div key={state} className="flex justify-between items-center">
                                      <span className="text-gray-300">{state}</span>
                                      <div className="text-right">
                                        <div className="text-purple-400 font-mono">{formatDuration(data.duration_seconds)}</div>
                                        <div className="text-xs text-gray-400">{data.percentage.toFixed(1)}%</div>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {!selectedVehicleId && !loading && !error && (
          <div className="text-center py-12">
            <svg className="w-20 h-20 mx-auto mb-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 113 16.382V7.618a1 1 0 01.553-.894L9 4l6 3 6-3v13l-6 3-6-3z" />
            </svg>
            <h3 className="text-xl font-bold text-white mb-2">Select a Vehicle for Shape Analysis</h3>
            <p className="text-gray-400 mb-4">Choose a vehicle from the dropdown above to analyze performance by map shapes.</p>
            <p className="text-gray-500 text-sm">{shapes.length} shapes available for analysis</p>
          </div>
        )}
          </div>
          {/* End Right Column Scrollable Content */}
        </div>
        {/* End Right Column */}
      </div>
      {/* End Main Content */}
    </div>
  )
}