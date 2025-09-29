'use client'
// Force recompilation to test shape filtering fix

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { AlarmDataPoint, TrailColorMode, getTrailColor } from '@/utils/alarmTrailColors'
import { buildApiUrl } from '@/config/environment'
import TrailColorLegend from './TrailColorLegend'
import { SpeedRange } from './SpeedSlicerComponent'
import { getShapeNameForPoint } from '@/utils/shapeUtils'
import * as GeoJSONTypes from 'geojson'

// Dynamic imports for Leaflet to prevent SSR issues
const MapContainer = dynamic(() => import('react-leaflet').then(mod => ({ default: mod.MapContainer })), { ssr: false })
const GeoJSON = dynamic(() => import('react-leaflet').then(mod => ({ default: mod.GeoJSON })), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(mod => ({ default: mod.Marker })), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then(mod => ({ default: mod.Popup })), { ssr: false })

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

// GeoJSON Layer component for mining infrastructure (from original replay app)
const GeoJSONLayer = ({ data, onBoundsCalculated }: { data: any, onBoundsCalculated?: (bounds: any) => void }) => {
  const [isClient, setIsClient] = useState(false)
  
  useEffect(() => {
    setIsClient(true)
  }, [])
  
  // Use conditional rendering instead of early return to avoid hooks violation
  return isClient ? <GeoJSONLayerClient data={data} onBoundsCalculated={onBoundsCalculated} /> : null
}

const GeoJSONLayerClient = ({ data, onBoundsCalculated }: { data: any, onBoundsCalculated?: (bounds: any) => void }) => {
  const { useMap } = require('react-leaflet')
  const map = useMap()
  
  useEffect(() => {
    let geoJsonLayer: any = null
    
    if (data) {
      // Filter out unwanted features - keep only essential mine infrastructure (EXACT COPY FROM ORIGINAL)
      const filteredData = {
        ...data,
        features: data.features?.filter((feature: any) => {
          const asiType = feature.properties?.AsiType?.toLowerCase() || ''
          
          // Remove vectorimage, pins, and AOZ shapes
          if (asiType.includes('vectorimage') || 
              asiType.includes('pindto') || 
              asiType.includes('pin') ||
              asiType.includes('aozshapedto')) {
            return false
          }
          
          // Remove line features
          if (feature.geometry?.type === 'LineString' || feature.geometry?.type === 'MultiLineString') {
            return false
          }
          
          return true
        })
      }
      
      // Add filtered GeoJSON to map with proper styling
      geoJsonLayer = L.geoJSON(filteredData, {
        style: (feature?: GeoJSONTypes.Feature) => {
          // Style infrastructure shapes to be visible
          if (feature?.geometry?.type === 'Polygon' || feature?.geometry?.type === 'MultiPolygon') {
            return {
              color: '#9ca3af',
              weight: 2,
              fillOpacity: 0,
              opacity: 0.9
            }
          }
          return {
            color: '#9ca3af',
            weight: 2,
            opacity: 0.8
          }
        },
        onEachFeature: (feature: GeoJSONTypes.Feature, layer: any) => {
          if (feature.properties) {
            // Create detailed tooltip content for mine shapes
            const props = feature.properties
            const shapeType = props.AsiType || 'Unknown Shape'
            const shapeName = props.AsiName || 'Unnamed Shape'
            // Convert speed limit from m/s to km/h with 60 km/h max
            const rawSpeedLimit = props.AsiSpeedLimit
            let speedLimit = null
            if (rawSpeedLimit && !isNaN(parseFloat(rawSpeedLimit))) {
              const speedKmh = parseFloat(rawSpeedLimit) * 3.6 // Convert m/s to km/h
              speedLimit = Math.min(speedKmh, 60).toFixed(1) // Cap at 60 km/h, one decimal
            }
            
            let tooltipContent = `
              <div class="mine-shape-tooltip">
                <div class="shape-header">${shapeName}</div>
                <div class="shape-content">
                  <div><span class="shape-label">Type:</span> ${shapeType}</div>
                  ${speedLimit ? `<div><span class="shape-label">Speed Limit:</span> ${speedLimit} km/h</div>` : ''}
                  ${props.AsiZone ? `<div><span class="shape-label">Zone:</span> ${props.AsiZone}</div>` : ''}
                  ${props.AsiArea ? `<div><span class="shape-label">Area:</span> ${props.AsiArea}</div>` : ''}
                  ${props.AsiElevation ? `<div><span class="shape-label">Elevation:</span> ${props.AsiElevation}m</div>` : ''}
                </div>
              </div>
            `
            
            layer.bindTooltip(tooltipContent, {
              permanent: false,
              direction: 'top',
              className: 'mine-shape-tooltip-container',
              opacity: 0.95,
              offset: [0, -5]
            })
            
            // Remove default Leaflet tooltip/popup styling to prevent rectangle boundary
            layer.on('mouseover', () => {
              layer.openTooltip()
            })
            layer.on('mouseout', () => {
              layer.closeTooltip()
            })
          }
        }
      }).addTo(map)
      
      // Calculate bounds for callback but don't auto-zoom to prevent unwanted zoom behavior
      const bounds = geoJsonLayer.getBounds()
      if (bounds.isValid() && onBoundsCalculated) {
        onBoundsCalculated(bounds)
      }
    }
    
    // Cleanup function to prevent memory leaks
    return () => {
      if (geoJsonLayer) {
        try {
          geoJsonLayer.remove()
          geoJsonLayer = null
        } catch (error) {
          console.error('Error cleaning up GeoJSON layer:', error)
        }
      }
    }
  }, [data, map, onBoundsCalculated])
  
  return null
}

interface AlarmMapComponentProps {
  selectedVehicles: string[]
  selectedAlarmTypes: string[]
  speedRange?: SpeedRange | null
  selectedShapes?: string[]
  trailColorMode: TrailColorMode
  geoJsonData?: any
}

export default function AlarmMapComponent({
  selectedVehicles,
  selectedAlarmTypes,
  speedRange,
  selectedShapes = [],
  trailColorMode,
  geoJsonData
}: AlarmMapComponentProps) {
  const [alarmData, setAlarmData] = useState<Record<string, AlarmDataPoint[]>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mapRef = useRef<any>(null)

  // Load alarm data for selected vehicles
  const loadAlarmData = useCallback(async () => {
    if (selectedVehicles.length === 0) {
      setAlarmData({})
      return
    }

    setLoading(true)
    setError(null)
    
    try {
      const vehicleData: Record<string, AlarmDataPoint[]> = {}
      
      for (const vehicleId of selectedVehicles) {
        try {
          const response = await fetch(buildApiUrl(`/data/${vehicleId}`))
          if (response.ok) {
            const result = await response.json()
            
            // Filter by selected alarm types
            const filteredData = result.data.filter((alarm: AlarmDataPoint) =>
              selectedAlarmTypes.length === 0 || selectedAlarmTypes.includes(alarm.alarm_type)
            )
            
            vehicleData[vehicleId] = filteredData
          } else {
            console.warn(`Failed to load data for ${vehicleId}:`, response.statusText)
          }
        } catch (err) {
          console.warn(`Error loading data for ${vehicleId}:`, err)
        }
      }
      
      setAlarmData(vehicleData)
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      console.error('Failed to load alarm data:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedVehicles, selectedAlarmTypes, selectedShapes])

  useEffect(() => {
    loadAlarmData()
  }, [loadAlarmData])

  // Excluded AsiTypes that should not be considered for filtering (same as in AsiTypeFilterComponent)
  const excludedAsiTypes = [
    'PinDto_V1',
    'ReferenceShapeDto_V1',
    'VectorImageDto_V1',
    'RoughRoadShapeDto_V1',
    'AozShapeDto_V1'
    // Removed 'ObstacleShapeDto_V1' - maybe this was blocking dump areas
  ]

  // Helper function to check if alarm should be shown based on selected AsiTypes  
  // Uses point-in-polygon to check if alarm coordinates fall within selected shape types
  const shouldShowAlarm = useCallback((alarm: AlarmDataPoint): boolean => {
    // If no shapes are selected, show all alarms
    if (selectedShapes.length === 0) return true
    
    // If no GeoJSON data or invalid coordinates, show all alarms
    if (!geoJsonData?.features || !isValidCoordinate(alarm.latitude, alarm.longitude)) return true

    // Get the shape name for this alarm point
    const shapeName = getShapeNameForPoint(alarm.latitude!, alarm.longitude!, geoJsonData)
    
    // Show alarm if it's within any of the selected shapes
    return shapeName !== null && selectedShapes.includes(shapeName)
  }, [selectedShapes, geoJsonData])

  // Helper function to validate coordinates
  const isValidCoordinate = (lat: number | null, lng: number | null): boolean => {
    return lat !== null && lng !== null && 
           !isNaN(lat) && !isNaN(lng) && 
           isFinite(lat) && isFinite(lng) &&
           lat >= -90 && lat <= 90 &&
           lng >= -180 && lng <= 180
  }

  // Simple point-in-polygon check for different geometry types
  const isPointInShape = (lat: number, lng: number, geometry: any): boolean => {
    if (!geometry || !geometry.coordinates) return false
    
    try {
      if (geometry.type === 'Polygon') {
        return pointInPolygon(lat, lng, geometry.coordinates[0])
      } else if (geometry.type === 'MultiPolygon') {
        for (const polygon of geometry.coordinates) {
          if (pointInPolygon(lat, lng, polygon[0])) {
            return true
          }
        }
      }
    } catch (error) {
      console.warn('Error in point-in-shape check:', error)
    }
    return false
  }

  // Ray casting algorithm for point-in-polygon with tolerance
  const pointInPolygon = (lat: number, lng: number, polygon: number[][]): boolean => {
    let inside = false
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][1], yi = polygon[i][0] // Note: GeoJSON is [lng, lat]
      const xj = polygon[j][1], yj = polygon[j][0]
      
      if (((yi > lat) !== (yj > lat)) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
        inside = !inside
      }
    }
    
    // If not inside, check if point is very close to polygon boundary (tolerance for precision issues)
    if (!inside) {
      const tolerance = 0.0001 // ~10 meters tolerance
      for (let i = 0; i < polygon.length - 1; i++) {
        const x1 = polygon[i][1], y1 = polygon[i][0]
        const x2 = polygon[i + 1][1], y2 = polygon[i + 1][0]
        
        const distance = Math.abs((y2 - y1) * lng - (x2 - x1) * lat + x2 * y1 - y2 * x1) / 
                        Math.sqrt(Math.pow(y2 - y1, 2) + Math.pow(x2 - x1, 2))
        
        if (distance < tolerance) {
          console.log(`  Point is within tolerance (${distance.toFixed(6)}) of polygon boundary`)
          return true
        }
      }
    }
    
    return inside
  }

  // Create alarm markers
  const alarmMarkers = useMemo(() => {
    const markers: React.JSX.Element[] = []
    
    Object.entries(alarmData).forEach(([vehicleId, alarms]) => {
      alarms.forEach((alarm, index) => {
        if (isValidCoordinate(alarm.latitude, alarm.longitude)) {
          // Apply alarm type filtering
          if (selectedAlarmTypes.length > 0 && !selectedAlarmTypes.includes(alarm.alarm_type)) {
            return // Skip this alarm if it doesn't match selected alarm types
          }

          // Apply speed filtering
          if (speedRange) {
            const speed = alarm.speed_kmh
            if (speed === null || speed === undefined || speed < speedRange.min || speed > speedRange.max) {
              return // Skip this alarm if it doesn't match speed filter
            }
          }

          // Apply AsiType (shape) filtering based on alarm's AsiName
          if (!shouldShowAlarm(alarm)) {
            return // Skip this alarm if it doesn't match selected AsiTypes
          }
          
          const color = getTrailColor(alarm, trailColorMode)
          
          // Create custom icon based on alarm type and color
          let iconHtml = `
            <div style="
              background-color: ${color};
              width: 20px;
              height: 20px;
              border-radius: 50%;
              border: 2px solid white;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 10px;
              font-weight: bold;
              color: white;
              text-shadow: 1px 1px 1px rgba(0,0,0,0.7);
            ">
              ${alarm.alarm_type === 'Off Path' ? 'OP' : 
                alarm.alarm_type === 'Steering Restricted' ? 'SR' :
                alarm.alarm_type.substring(0, 2).toUpperCase()}
            </div>
          `
          
          // Create tooltip content
          const tooltipContent = `
            <div class="modern-alarm-tooltip">
              <div class="tooltip-header">${alarm.alarm_type}</div>
              <div class="tooltip-content">
                <div><span class="tooltip-label">Vehicle:</span> ${alarm.vehicle_id}</div>
                <div><span class="tooltip-label">Time:</span> ${new Date(alarm.timestamp).toLocaleString()}</div>
                <div><span class="tooltip-label">Speed:</span> ${alarm.speed_kmh !== null ? alarm.speed_kmh.toFixed(1) : 'N/A'} km/h</div>
                ${alarm.off_path_error_m !== null ? `<div><span class="tooltip-label">Off Path:</span> ${alarm.off_path_error_m.toFixed(2)} m</div>` : ''}
                <div><span class="tooltip-label">Pitch:</span> ${alarm.pitch_deg !== null ? alarm.pitch_deg.toFixed(2) : 'N/A'}°</div>
                <div><span class="tooltip-label">Roll:</span> ${alarm.roll_deg !== null ? alarm.roll_deg.toFixed(2) : 'N/A'}°</div>
              </div>
            </div>
          `

          const marker = L?.marker([alarm.latitude!, alarm.longitude!], {
            icon: L?.divIcon({
              html: iconHtml,
              className: 'alarm-marker',
              iconSize: [20, 20],
              iconAnchor: [10, 10],
              popupAnchor: [0, -10]
            })
          }).bindTooltip(tooltipContent, {
            permanent: false,
            direction: 'top',
            offset: [0, -10],
            className: 'modern-alarm-tooltip-container',
            opacity: 0.95
          })

          markers.push(
            <Marker
              key={`${vehicleId}-${index}-${alarm.alarm_type}-${alarm.timestamp}`}
              position={[alarm.latitude!, alarm.longitude!]}
              icon={L?.divIcon({
                html: iconHtml,
                className: 'alarm-marker',
                iconSize: [20, 20],
                iconAnchor: [10, 10],
                popupAnchor: [0, -10]
              })}
              eventHandlers={{
                add: (e) => {
                  // Bind the custom tooltip when marker is added to map
                  e.target.bindTooltip(tooltipContent, {
                    permanent: false,
                    direction: 'top',
                    offset: [0, -10],
                    className: 'modern-alarm-tooltip-container',
                    opacity: 0.95
                  })
                }
              }}
            />
          )
        }
      })
    })
    
    return markers
  }, [alarmData, trailColorMode, speedRange, selectedShapes, geoJsonData, shouldShowAlarm, selectedAlarmTypes])

  // No trail lines - only alarm markers as requested

  // Auto-fit map to show all alarm points
  const fitMapToAlarms = useCallback(() => {
    if (!mapRef.current || Object.keys(alarmData).length === 0) return

    const map = mapRef.current
    const validPositions: [number, number][] = []
    
    Object.values(alarmData).forEach(alarms => {
      alarms.forEach(alarm => {
        if (isValidCoordinate(alarm.latitude, alarm.longitude)) {
          validPositions.push([alarm.latitude!, alarm.longitude!])
        }
      })
    })
    
    if (validPositions.length > 0) {
      const bounds = L.latLngBounds(validPositions)
      map.fitBounds(bounds, { padding: [20, 20] })
    }
  }, [alarmData])

  // Auto-fit disabled to prevent map jumping when filters change
  // useEffect(() => {
  //   if (Object.keys(alarmData).length > 0) {
  //     setTimeout(fitMapToAlarms, 500) // Small delay to ensure map is ready
  //   }
  // }, [alarmData, fitMapToAlarms])

  // Get all alarm data points for legend statistics
  const allAlarmPoints = useMemo(() => {
    return Object.values(alarmData).flat()
  }, [alarmData])

  // Filter alarm points based on current selections and filters for legend statistics
  const filteredAlarmPoints = useMemo(() => {
    if (allAlarmPoints.length === 0) return []

    return allAlarmPoints.filter(alarm => {
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
  }, [allAlarmPoints, selectedVehicles, selectedAlarmTypes, speedRange, selectedShapes, geoJsonData])

  return (
    <div className="flex-1 relative bg-[#1f2937]" style={{ minHeight: '400px', height: '100%' }}>
      {/* Loading overlay */}
      {loading && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[500] bg-blue-600 text-white px-4 py-2 rounded-lg">
          Loading alarm data...
        </div>
      )}
      
      {/* Error overlay */}
      {error && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[500] bg-red-600 text-white px-4 py-2 rounded-lg">
          Error: {error}
        </div>
      )}
      
      {/* Map Controls */}
      <div className="absolute top-4 right-4 z-[400] flex flex-col space-y-2">
        {/* Fit Map Button */}
        <button
          onClick={fitMapToAlarms}
          className="bg-gray-800 text-white p-2 rounded-md hover:bg-gray-700 transition-colors shadow-md"
          title="Fit map to alarms"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
        
        {/* Zoom Controls */}
        <div className="flex flex-col bg-gray-800 rounded-md shadow-md overflow-hidden">
          <button
            onClick={() => mapRef.current?.setZoom(mapRef.current.getZoom() + 1)}
            className="text-white p-2 hover:bg-gray-700 transition-colors border-b border-gray-600"
            title="Zoom in"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            onClick={() => mapRef.current?.setZoom(mapRef.current.getZoom() - 1)}
            className="text-white p-2 hover:bg-gray-700 transition-colors"
            title="Zoom out"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Map */}
      <MapContainer
        center={[-22.45, 119.88]} // Default center for mining area
        zoom={15}
        className="w-full h-full mining-map"
        ref={mapRef}
        style={{
          backgroundColor: '#1f2937',
          position: 'relative',
          zIndex: 1,
          minHeight: '100%',
          height: '100%'
        }}
        zoomControl={false}
      >
        {/* No tile layer - only show GeoJSON mine infrastructure and alarm markers */}
        
        {/* Mine Infrastructure Layer - using custom filtering from original replay app */}
        {geoJsonData && (
          <GeoJSONLayer 
            data={geoJsonData}
            onBoundsCalculated={(bounds) => {
              // Optional: could use bounds for initial map positioning
            }}
          />
        )}
        
        {/* Alarm markers only - no trail lines */}
        {alarmMarkers}
      </MapContainer>
      
      {/* Legend */}
      <TrailColorLegend
        mode={trailColorMode}
        dataPoints={filteredAlarmPoints}
        className="absolute bottom-4 left-4 z-[400] max-w-64"
      />
      
    </div>
  )
}