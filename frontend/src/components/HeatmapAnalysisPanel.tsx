'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { AlarmDataPoint } from '@/utils/alarmTrailColors'
import { getShapeNameForPoint, filterAlarmsByShapes } from '@/utils/shapeUtils'
import { buildApiUrl } from '@/config/environment'
import TimeSlicerComponent, { TimeRange } from './TimeSlicerComponent'
import SpeedSlicerComponent, { SpeedRange } from './SpeedSlicerComponent'
import ShapeFilterComponent from './ShapeFilterComponent'

// Dynamic imports for Leaflet to prevent SSR issues
const MapContainer = dynamic(() => import('react-leaflet').then(mod => ({ default: mod.MapContainer })), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(mod => ({ default: mod.TileLayer })), { ssr: false })
const GeoJSON = dynamic(() => import('react-leaflet').then(mod => ({ default: mod.GeoJSON })), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(mod => ({ default: mod.Marker })), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then(mod => ({ default: mod.Popup })), { ssr: false })

// Custom Canvas Heatmap Layer Component
const CanvasHeatmapLayer = ({ map, heatmapPoints, gridSize }: { map: any, heatmapPoints: HeatmapPoint[], gridSize: number }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const redrawHeatmap = useCallback(() => {
    if (!map || !canvasRef.current || heatmapPoints.length === 0) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Get map container size
    const mapSize = map.getSize()
    canvas.width = mapSize.x
    canvas.height = mapSize.y

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Create gradient for heatmap colors with improved visibility
    const createRadialGradient = (x: number, y: number, radius: number, intensity: number) => {
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius)
      
      // Even higher alpha values for maximum visibility on dark background
      const baseAlpha = Math.min(1.0, 0.8 + intensity * 0.2)
      const edgeAlpha = Math.min(0.8, 0.5 + intensity * 0.3)
      
      if (intensity <= 0.25) {
        // Bright cyan/blue for low intensity - more focused gradient
        gradient.addColorStop(0, `rgba(0, 255, 255, ${baseAlpha})`)
        gradient.addColorStop(0.5, `rgba(0, 220, 255, ${edgeAlpha})`)
        gradient.addColorStop(0.8, `rgba(0, 180, 255, ${edgeAlpha * 0.4})`)
        gradient.addColorStop(1, `rgba(0, 150, 255, 0)`)
      } else if (intensity <= 0.5) {
        // Bright green - more focused gradient
        gradient.addColorStop(0, `rgba(50, 255, 50, ${baseAlpha})`)
        gradient.addColorStop(0.5, `rgba(100, 255, 50, ${edgeAlpha})`)
        gradient.addColorStop(0.8, `rgba(150, 255, 50, ${edgeAlpha * 0.4})`)
        gradient.addColorStop(1, `rgba(200, 255, 50, 0)`)
      } else if (intensity <= 0.75) {
        // Bright yellow/orange - more focused gradient
        gradient.addColorStop(0, `rgba(255, 255, 50, ${baseAlpha})`)
        gradient.addColorStop(0.5, `rgba(255, 220, 50, ${edgeAlpha})`)
        gradient.addColorStop(0.8, `rgba(255, 180, 50, ${edgeAlpha * 0.4})`)
        gradient.addColorStop(1, `rgba(255, 150, 50, 0)`)
      } else {
        // Bright red/orange for high intensity - more focused gradient
        gradient.addColorStop(0, `rgba(255, 100, 50, ${baseAlpha})`)
        gradient.addColorStop(0.5, `rgba(255, 150, 50, ${edgeAlpha})`)
        gradient.addColorStop(0.8, `rgba(255, 200, 100, ${edgeAlpha * 0.4})`)
        gradient.addColorStop(1, `rgba(255, 220, 150, 0)`)
      }

      return gradient
    }

    // Draw heatmap points
    heatmapPoints.forEach(point => {
      try {
        // Convert lat/lng to pixel coordinates
        const pixelPoint = map.latLngToContainerPoint([point.lat, point.lng])

        // Calculate smaller radius for more precise location visualization
        const zoom = map.getZoom()
        const gridSizeFactor = Math.max(0.3, 1.0 / (gridSize * 8000)) // Tighter factor for smaller radii
        const baseRadius = Math.max(15, (40 - zoom * 1.5) * gridSizeFactor) // Much smaller base radius
        const radius = baseRadius * (0.5 + point.intensity * 1.0) // Reduced multiplier

        // Create and apply gradient
        const gradient = createRadialGradient(pixelPoint.x, pixelPoint.y, radius, point.intensity)
        ctx.fillStyle = gradient

        // Draw circle with gradient
        ctx.beginPath()
        ctx.arc(pixelPoint.x, pixelPoint.y, radius, 0, 2 * Math.PI)
        ctx.fill()

        // Draw alarm count text on hotspot with modern styling
        if (point.alarmCount > 0) {
          ctx.fillStyle = '#ffffff'
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)'
          ctx.lineWidth = 3
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'

          // Modern font with better sizing
          const fontSize = Math.max(12, Math.min(18, zoom + (point.alarmCount > 10 ? 3 : 1)))
          ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`

          // Add subtle shadow effect
          ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
          ctx.shadowBlur = 4
          ctx.shadowOffsetX = 1
          ctx.shadowOffsetY = 1

          // Draw text with modern stroke and fill
          ctx.strokeText(point.alarmCount.toString(), pixelPoint.x, pixelPoint.y)
          ctx.fillText(point.alarmCount.toString(), pixelPoint.x, pixelPoint.y)

          // Reset shadow for next draws
          ctx.shadowColor = 'transparent'
          ctx.shadowBlur = 0
          ctx.shadowOffsetX = 0
          ctx.shadowOffsetY = 0
        }
      } catch (error) {
        console.warn('Error drawing heatmap point:', error)
      }
    })
  }, [map, heatmapPoints, gridSize])

  useEffect(() => {
    redrawHeatmap()
    
    if (map) {
      // Redraw on map events
      const handleMapEvent = () => {
        setTimeout(redrawHeatmap, 50) // Small delay for smooth interaction
      }
      
      map.on('zoom', handleMapEvent)
      map.on('move', handleMapEvent)
      map.on('resize', handleMapEvent)
      
      return () => {
        map.off('zoom', handleMapEvent)
        map.off('move', handleMapEvent)
        map.off('resize', handleMapEvent)
      }
    }
  }, [map, redrawHeatmap])

  // Position canvas overlay
  const canvasStyle: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    pointerEvents: 'none',
    zIndex: 200,
    mixBlendMode: 'screen' // Screen blend mode for better visibility on dark backgrounds
  }

  return <canvas ref={canvasRef} style={canvasStyle} />
}

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


interface HeatmapAnalysisPanelProps {
  selectedVehicles: string[]
  selectedAlarmTypes: string[]
  speedRange?: SpeedRange | null
  selectedShapes?: string[]
  geoJsonData: any
  onShapeSelectionChange?: (shapes: string[]) => void
  onClose: () => void
}

interface HeatmapPoint {
  lat: number
  lng: number
  intensity: number
  alarmCount: number
  vehicleTypes: { [vehicleId: string]: number }
  alarmTypes: { [alarmType: string]: number }
}

interface ShapeAlarmSummary {
  shapeName: string
  alarmCount: number
  vehicles: Set<string>
  alarmTypes: { [type: string]: number }
}

interface GridCell {
  lat: number
  lng: number
  latMax: number
  lngMax: number
  alarmCount: number
  vehicles: Set<string>
  alarmTypes: { [type: string]: number }
}

export default function HeatmapAnalysisPanel({
  selectedVehicles: initialVehicles,
  selectedAlarmTypes: initialAlarmTypes,
  speedRange,
  selectedShapes = [],
  geoJsonData,
  onShapeSelectionChange,
  onClose
}: HeatmapAnalysisPanelProps) {
  const [alarmData, setAlarmData] = useState<AlarmDataPoint[]>([])
  const [filteredAlarmData, setFilteredAlarmData] = useState<AlarmDataPoint[]>([])
  const [heatmapPoints, setHeatmapPoints] = useState<HeatmapPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState<TimeRange | null>(null)
  const [localSpeedRange, setLocalSpeedRange] = useState<SpeedRange | null>(speedRange || null)
  const [gridSize, setGridSize] = useState<number>(0.0002) // Grid cell size in degrees - smaller default
  const [mapInstance, setMapInstance] = useState<any>(null)
  const [shapeAlarmSummary, setShapeAlarmSummary] = useState<ShapeAlarmSummary[]>([])
  const [selectedShapeForHighlight, setSelectedShapeForHighlight] = useState<string | null>(null)
  
  // Use filters from main page
  const [selectedVehicles] = useState<string[]>(initialVehicles || [])
  const [selectedAlarmTypes] = useState<string[]>(initialAlarmTypes || [])

  // Handle map resize when panel opens
  useEffect(() => {
    if (mapInstance && mapInstance._container) {
      setTimeout(() => {
        try {
          mapInstance.invalidateSize()
        } catch (error) {
          console.warn('Map invalidateSize failed:', error)
        }
      }, 100)
    }
  }, [mapInstance, heatmapPoints])

  // Calculate shape alarm summaries
  useEffect(() => {
    if (!geoJsonData || filteredAlarmData.length === 0) {
      setShapeAlarmSummary([])
      return
    }

    const shapeMap = new Map<string, ShapeAlarmSummary>()

    filteredAlarmData.forEach(alarm => {
      if (alarm.latitude === null || alarm.longitude === null) return
      const shapeName = getShapeNameForPoint(alarm.latitude, alarm.longitude, geoJsonData)
      if (!shapeName) return

      if (!shapeMap.has(shapeName)) {
        shapeMap.set(shapeName, {
          shapeName,
          alarmCount: 0,
          vehicles: new Set(),
          alarmTypes: {}
        })
      }

      const summary = shapeMap.get(shapeName)!
      summary.alarmCount += 1
      summary.vehicles.add(alarm.vehicle_id)
      
      if (!summary.alarmTypes[alarm.alarm_type]) {
        summary.alarmTypes[alarm.alarm_type] = 0
      }
      summary.alarmTypes[alarm.alarm_type] += 1
    })

    // Convert to array and sort by alarm count
    const shapeSummaries = Array.from(shapeMap.values()).sort((a, b) => b.alarmCount - a.alarmCount)
    setShapeAlarmSummary(shapeSummaries)
  }, [filteredAlarmData, geoJsonData])

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
      
      for (const vehicleId of selectedVehicles) {
        if (!vehicleId) continue
        
        try {
          // Try the main data endpoint that other components use
          const response = await fetch(buildApiUrl(`/data/${vehicleId}`))
          if (response.ok) {
            const result = await response.json()
            const vehicleAlarms = result.data as AlarmDataPoint[]
            
            
            // Filter by selected alarm types and ensure we have coordinates
            const filteredAlarms = vehicleAlarms.filter(alarm => {
              const hasCoords = alarm.latitude !== null && alarm.longitude !== null && 
                               !isNaN(alarm.latitude) && !isNaN(alarm.longitude)
              const typeMatch = selectedAlarmTypes.length === 0 || selectedAlarmTypes.includes(alarm.alarm_type)
              return hasCoords && typeMatch
            })
            
            allAlarms.push(...filteredAlarms)
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

  // Handle shape click for highlighting alarm points
  const handleShapeClick = useCallback((shapeName: string) => {
    if (selectedShapeForHighlight === shapeName) {
      // If same shape is clicked again, deselect it
      setSelectedShapeForHighlight(null)
    } else {
      // Select new shape
      setSelectedShapeForHighlight(shapeName)
    }
  }, [selectedShapeForHighlight])

  // Generate heatmap points from alarm data (for leaflet.heat format)
  const generateHeatmapPoints = useCallback(() => {
    if (filteredAlarmData.length === 0) {
      setHeatmapPoints([])
      return
    }

    // Create grid cells for aggregation
    const gridCells: { [key: string]: GridCell } = {}
    
    filteredAlarmData.forEach(alarm => {
      if (alarm.latitude === null || alarm.longitude === null) return
      
      // Calculate grid cell coordinates
      const cellLat = Math.floor(alarm.latitude / gridSize) * gridSize
      const cellLng = Math.floor(alarm.longitude / gridSize) * gridSize
      const cellKey = `${cellLat.toFixed(6)}_${cellLng.toFixed(6)}`
      
      if (!gridCells[cellKey]) {
        gridCells[cellKey] = {
          lat: cellLat,
          lng: cellLng,
          latMax: cellLat + gridSize,
          lngMax: cellLng + gridSize,
          alarmCount: 0,
          vehicles: new Set(),
          alarmTypes: {}
        }
      }
      
      const cell = gridCells[cellKey]
      cell.alarmCount++
      cell.vehicles.add(alarm.vehicle_id)
      cell.alarmTypes[alarm.alarm_type] = (cell.alarmTypes[alarm.alarm_type] || 0) + 1
    })

    // Convert to format suitable for both display and leaflet.heat
    const maxAlarmCount = Math.max(...Object.values(gridCells).map(cell => cell.alarmCount))
    
    const points: HeatmapPoint[] = Object.values(gridCells).map(cell => ({
      lat: cell.lat + gridSize / 2, // Center of cell
      lng: cell.lng + gridSize / 2,
      intensity: Math.min(1.0, cell.alarmCount / Math.max(1, maxAlarmCount * 0.7)), // Scale for better visibility
      alarmCount: cell.alarmCount,
      vehicleTypes: Array.from(cell.vehicles).reduce((acc, vehicle) => {
        acc[vehicle] = 1
        return acc
      }, {} as { [vehicleId: string]: number }),
      alarmTypes: cell.alarmTypes
    }))

    setHeatmapPoints(points)
  }, [filteredAlarmData, gridSize])

  // Load alarm data when selections change
  useEffect(() => {
    loadAlarmData()
  }, [loadAlarmData])

  // Generate heatmap when filtered data changes
  useEffect(() => {
    generateHeatmapPoints()
  }, [generateHeatmapPoints])


  return (
    <div className="bg-[#425563] rounded-lg shadow-2xl w-full max-w-[95vw] h-[95vh] flex flex-col border-2 border-black/50">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-[#425563] border-b-2 border-black/50 shadow-lg relative rounded-t-lg">
        <div className="absolute inset-0 bg-gradient-to-r from-[#425563] via-[#4a5f6f] to-[#425563] rounded-t-lg"></div>
        <div className="relative z-10 flex items-center justify-between w-full">
          <div>
            <h2 className="text-xl font-bold text-[#ffc726] flex items-center space-x-2 drop-shadow-md">
              <div className="p-1 bg-[#ffc726]/20 rounded border border-[#ffc726]/30">
                <svg className="w-4 h-4 text-[#ffc726]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <span>Heatmap Analysis</span>
            </h2>
            <p className="text-[#ffc726] text-sm mt-1 drop-shadow-sm">
              Spatial analysis by location ({selectedVehicles.length} vehicles, {selectedAlarmTypes.length === 0 ? 'all' : selectedAlarmTypes.length} alarm types)
            </p>
            {selectedAlarmTypes.length > 0 && (
              <div className="text-xs text-[#ffc726]/90 mt-1 drop-shadow-sm">
                <span className="text-[#ffc726] opacity-75">Analyzing:</span> {selectedAlarmTypes.join(', ')}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-800/80 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors border border-gray-600 shadow-md"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex min-h-0">
        {/* Main Map Area - Maximum Space */}
        <div className="flex-1 flex flex-col min-h-0">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mx-auto mb-4"></div>
                <span className="text-gray-400">Loading alarm data...</span>
              </div>
            </div>
          )}

          {error && (
            <div className="m-6">
              <div className="bg-red-900/50 border border-red-700 rounded-lg p-6">
                <div className="flex items-center">
                  <svg className="w-6 h-6 text-red-400 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-red-200">{error}</p>
                </div>
              </div>
            </div>
          )}

          {!loading && !error && selectedVehicles.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center py-12">
                <svg className="w-20 h-20 mx-auto mb-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 113 16.382V7.618a1 1 0 01.553-.894L9 4l6 3 6-3v13l-6 3-6-3z" />
                </svg>
                <h3 className="text-xl font-bold text-white mb-2">Select Vehicles for Heatmap</h3>
                <p className="text-gray-400 mb-4">Choose vehicles and alarm types to analyze spatial patterns.</p>
              </div>
            </div>
          )}

          {!loading && !error && heatmapPoints.length > 0 && (
            <div className="flex-1 bg-gray-800 overflow-hidden">
              <div className="h-full relative">
                <MapContainer
                  center={[-22.4, 119.8]}
                  zoom={13}
                  style={{ 
                    height: '100%', 
                    width: '100%', 
                    backgroundColor: '#1e293b'
                  }}
                  className="leaflet-container"
                  zoomControl={true}
                  ref={setMapInstance}
                  whenReady={() => {
                    setTimeout(() => {
                      if (mapInstance) {
                        mapInstance.invalidateSize()
                      }
                    }, 100)
                  }}
                >
                  {/* Background GeoJSON with proper filtering */}
                  {geoJsonData && (
                    <GeoJSON
                      data={geoJsonData}
                      filter={(feature) => {
                        const asiType = feature?.properties?.AsiType || feature?.properties?.type || ''
                        return asiType !== 'VectorImageDto_V1' && 
                               asiType !== 'AOZ' && 
                               asiType !== 'AozShapeDto_V1' &&
                               asiType !== 'ImageDto_V1' &&
                               asiType !== 'PinDto_V1' &&
                               !asiType.includes('Vector') &&
                               !asiType.includes('Image') &&
                               !asiType.includes('Pin')
                      }}
                      style={{
                        fillColor: '#444444',
                        weight: 1,
                        opacity: 0.6,
                        color: '#666666',
                        fillOpacity: 0.5
                      }}
                      onEachFeature={(feature, layer) => {
                        const shapeName = feature?.properties?.AsiName || feature?.properties?.name || 'Unnamed'
                        const shapeType = feature?.properties?.AsiType || feature?.properties?.type || 'Unknown'
                        // Convert speed limit from m/s to km/h with 60 km/h max
                        const rawSpeedLimit = feature?.properties?.AsiSpeedLimit || feature?.properties?.speedLimit
                        let speedLimit = 'N/A'
                        if (rawSpeedLimit && !isNaN(parseFloat(rawSpeedLimit))) {
                          const speedKmh = parseFloat(rawSpeedLimit) * 3.6 // Convert m/s to km/h
                          speedLimit = Math.min(speedKmh, 60).toFixed(1) + ' km/h' // Cap at 60 km/h, one decimal
                        }
                        
                        layer.bindTooltip(`${shapeName}<br/>Type: ${shapeType}<br/>Speed Limit: ${speedLimit}`, {
                          permanent: false,
                          direction: 'top',
                          className: 'heatmap-tooltip-white'
                        })
                      }}
                    />
                  )}

                  {/* Alarm Point Markers - show only for selected shape */}
                  {selectedShapeForHighlight && filteredAlarmData
                    .filter(alarm => {
                      if (alarm.latitude === null || alarm.longitude === null) return false
                      const shapeName = getShapeNameForPoint(alarm.latitude, alarm.longitude, geoJsonData)
                      return shapeName === selectedShapeForHighlight
                    })
                    .map((alarm, index) => (
                      <Marker 
                        key={`alarm-${alarm.vehicle_id}-${alarm.timestamp}-${index}`}
                        position={[alarm.latitude!, alarm.longitude!]}
                        icon={L?.divIcon({
                          html: `<div style="
                            width: 12px; 
                            height: 12px; 
                            border-radius: 50%; 
                            background: ${alarm.alarm_type === 'Off Path' ? '#ff4444' : '#ff9900'}; 
                            border: 2px solid white;
                            box-shadow: 0 0 4px rgba(0,0,0,0.5);
                          "></div>`,
                          className: 'alarm-point-marker',
                          iconSize: [16, 16],
                          iconAnchor: [8, 8],
                        })}
                      >
                        <Popup>
                          <div className="text-sm">
                            <div className="font-semibold text-gray-800">{alarm.alarm_title}</div>
                            <div className="text-gray-600">Vehicle: {alarm.vehicle_id}</div>
                            <div className="text-gray-600">Time: {new Date(alarm.timestamp).toLocaleString()}</div>
                            <div className="text-gray-600">Speed: {alarm.speed_kmh !== null ? `${alarm.speed_kmh.toFixed(1)} km/h` : 'N/A'}</div>
                            {alarm.off_path_error_m !== null && (
                              <div className="text-gray-600">Off Path: {alarm.off_path_error_m.toFixed(2)} m</div>
                            )}
                          </div>
                        </Popup>
                      </Marker>
                    ))
                  }

                </MapContainer>
                
                {/* Canvas Heatmap Overlay */}
                {mapInstance && heatmapPoints.length > 0 && (
                  <CanvasHeatmapLayer map={mapInstance} heatmapPoints={heatmapPoints} gridSize={gridSize} />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Side Controls Panel */}
        <div className="w-[332px] flex-shrink-0 bg-[#001e32] p-4 overflow-y-auto border-l border-gray-700">
          {/* Shape Alarm Summary - MOVED TO TOP */}
          {!loading && !error && shapeAlarmSummary.length > 0 && (
            <div className="space-y-3 mb-6">
              <label className="text-sm font-semibold text-white">Alarms by Shape Area</label>
              <p className="text-xs text-gray-400">Click on a shape to highlight its alarm points on the map</p>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {shapeAlarmSummary.map((shape, index) => (
                  <div 
                    key={shape.shapeName} 
                    onClick={() => handleShapeClick(shape.shapeName)}
                    className={`p-3 rounded-lg border cursor-pointer transition-all duration-200 hover:border-orange-400 ${
                      selectedShapeForHighlight === shape.shapeName 
                        ? 'bg-orange-500/20 border-orange-400 shadow-lg' 
                        : 'bg-gray-800/50 border-gray-600 hover:bg-gray-800/70'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="text-sm font-semibold text-white truncate flex-1 mr-2">
                        {shape.shapeName}
                      </div>
                      <div className="text-lg font-bold text-orange-400">
                        {shape.alarmCount}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400 mb-1">
                      {shape.vehicles.size} vehicle{shape.vehicles.size !== 1 ? 's' : ''}
                    </div>
                    <div className="text-xs text-gray-300">
                      {Object.entries(shape.alarmTypes)
                        .sort(([,a], [,b]) => b - a)
                        .slice(0, 3)
                        .map(([type, count]) => `${type}: ${count}`)
                        .join(', ')}
                      {Object.keys(shape.alarmTypes).length > 3 && '...'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Analysis Summary - MOVED TO SECOND */}
          {!loading && !error && heatmapPoints.length > 0 && (
            <div className="space-y-3 mb-6">
              <label className="text-sm font-semibold text-white">Analysis Summary</label>
              <div className="space-y-2">
                <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/20 p-3 rounded-lg border border-blue-500/30">
                  <div className="text-2xl font-bold text-blue-400">{filteredAlarmData.length}</div>
                  <div className="text-sm text-blue-300">Total Alarms</div>
                </div>
                {filteredAlarmData.length !== alarmData.length && (
                  <div className="text-xs text-gray-400 text-center mt-2 p-2 bg-gray-800/30 rounded">
                    Filtered: {filteredAlarmData.length}/{alarmData.length} alarms
                    {timeRange && localSpeedRange && " (time + speed)"}
                    {timeRange && !localSpeedRange && " (time only)"}
                    {!timeRange && localSpeedRange && " (speed only)"}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Time Range Control - THIRD */}
          <div className="space-y-2 mb-6">
            <label className="text-sm font-semibold text-white">Time Range</label>
            {alarmData.length > 0 ? (
              <TimeSlicerComponent
                alarmData={alarmData}
                onTimeRangeChange={handleTimeRangeChange}
                disabled={loading}
                className="bg-gray-700/30"
              />
            ) : (
              <div className="text-sm text-gray-400 p-3 bg-gray-800 rounded-lg text-center">
                Load data to enable time filtering
              </div>
            )}
          </div>

          {/* Speed Range Control - FOURTH */}
          <div className="space-y-2 mb-6">
            <label className="text-sm font-semibold text-white">Speed Range</label>
            {alarmData.length > 0 ? (
              <SpeedSlicerComponent
                alarmData={alarmData}
                onSpeedRangeChange={(newSpeedRange) => {
                  setLocalSpeedRange(newSpeedRange)
                }}
                disabled={loading}
                className="bg-gray-700/30"
              />
            ) : (
              <div className="text-sm text-gray-400 p-3 bg-gray-800 rounded-lg text-center">
                Load data to enable speed filtering
              </div>
            )}
          </div>

          {/* Shape Filter Control - FIFTH */}
          {geoJsonData && onShapeSelectionChange && alarmData.length > 0 && (
            <div className="space-y-2 mb-6">
              <ShapeFilterComponent
                selectedShapes={selectedShapes}
                alarmData={alarmData}
                geoJsonData={geoJsonData}
                onShapeSelectionChange={onShapeSelectionChange}
                className="bg-gray-700/30"
              />
            </div>
          )}

          {/* Grid Resolution Control - MOVED TO LAST */}
          <div className="space-y-2 mb-6">
            <label className="text-sm font-semibold text-white">Grid Resolution</label>
            <select
              value={gridSize}
              onChange={(e) => setGridSize(parseFloat(e.target.value))}
              className="w-full px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-600 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 focus:outline-none transition-colors"
            >
              <option value={0.0001}>Ultra Fine (10m)</option>
              <option value={0.0002}>Super Fine (20m)</option>
              <option value={0.0005}>Very Fine (50m)</option>
              <option value={0.001}>Fine (100m)</option>
              <option value={0.002}>Medium (200m)</option>
              <option value={0.005}>Coarse (500m)</option>
              <option value={0.01}>Very Coarse (1km)</option>
            </select>
            <div className="text-xs text-gray-400">
              Points: {heatmapPoints.length}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}