'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { useMapEvents } from 'react-leaflet'
import dynamic from 'next/dynamic'

// Dynamic imports for Leaflet components to prevent SSR issues
const Marker = dynamic(() => import('react-leaflet').then(mod => ({ default: mod.Marker })), { ssr: false })
const Polyline = dynamic(() => import('react-leaflet').then(mod => ({ default: mod.Polyline })), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then(mod => ({ default: mod.Popup })), { ssr: false })
const Tooltip = dynamic(() => import('react-leaflet').then(mod => ({ default: mod.Tooltip })), { ssr: false })

// Leaflet import for custom icons
let L: any = null
if (typeof window !== 'undefined') {
  L = require('leaflet')
}

interface DistancePoint {
  id: string
  lat: number
  lng: number
  label: string
}

interface DistanceMeasurement {
  id: string
  startPoint: DistancePoint
  endPoint: DistancePoint
  distance: number
  color: string
}

interface DistanceMeasurementToolProps {
  isActive: boolean
  onMeasurementComplete?: (measurement: DistanceMeasurement) => void
  onClearMeasurements?: () => void
  onClose?: () => void
}

// Calculate distance between two points using Haversine formula
const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371000 // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180
  const Δλ = (lng2 - lng1) * Math.PI / 180

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))

  return R * c // Distance in meters
}

// Format distance for display
const formatDistance = (meters: number): string => {
  if (meters < 1000) {
    return `${meters.toFixed(1)} m`
  } else {
    return `${(meters / 1000).toFixed(2)} km`
  }
}

// Create custom marker icon for measurement points
const createMeasurementIcon = (label: string, color: string = '#ff6b35') => {
  if (!L) return null

  return L.divIcon({
    className: 'distance-measurement-marker',
    html: `
      <div style="
        position: relative;
        width: 24px;
        height: 24px;
        background: ${color};
        border: 3px solid white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: bold;
        color: white;
        text-shadow: 0 1px 2px rgba(0,0,0,0.8);
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        cursor: pointer;
      ">
        ${label}
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12]
  })
}

export default function DistanceMeasurementTool({ 
  isActive, 
  onMeasurementComplete,
  onClearMeasurements,
  onClose
}: DistanceMeasurementToolProps) {
  const [measurements, setMeasurements] = useState<DistanceMeasurement[]>([])
  const [pendingPoint, setPendingPoint] = useState<DistancePoint | null>(null)
  const [measurementCounter, setMeasurementCounter] = useState(1)

  // Generate colors for different measurements
  const getNextColor = (index: number): string => {
    const colors = ['#ff6b35', '#f7931e', '#42a5f5', '#66bb6a', '#ab47bc', '#ef5350']
    return colors[index % colors.length]
  }

  // Handle map clicks for measurement
  const mapEvents = useMapEvents({
    click: (e) => {
      if (!isActive) return

      const { lat, lng } = e.latlng

      if (!pendingPoint) {
        // First click - set start point
        const startPoint: DistancePoint = {
          id: `point-${Math.floor(lat * 1000000)}-${Math.floor(lng * 1000000)}-start`,
          lat,
          lng,
          label: 'A'
        }
        setPendingPoint(startPoint)
      } else {
        // Second click - complete measurement
        const endPoint: DistancePoint = {
          id: `point-${Math.floor(lat * 1000000)}-${Math.floor(lng * 1000000)}-end`,
          lat,
          lng,
          label: 'B'
        }

        const distance = calculateDistance(pendingPoint.lat, pendingPoint.lng, lat, lng)
        const color = getNextColor(measurements.length)

        const newMeasurement: DistanceMeasurement = {
          id: `measurement-${measurementCounter}`,
          startPoint: pendingPoint,
          endPoint,
          distance,
          color
        }

        setMeasurements(prev => [...prev, newMeasurement])
        setPendingPoint(null)
        setMeasurementCounter(prev => prev + 1)
        
        onMeasurementComplete?.(newMeasurement)
      }
    }
  })

  // Clear measurements when tool is deactivated
  useEffect(() => {
    if (!isActive) {
      setPendingPoint(null)
    }
  }, [isActive])

  // Clear all measurements
  const handleClearAll = useCallback(() => {
    setMeasurements([])
    setPendingPoint(null)
    setMeasurementCounter(1)
    onClearMeasurements?.()
  }, [onClearMeasurements])

  // Remove specific measurement
  const removeMeasurement = useCallback((measurementId: string) => {
    setMeasurements(prev => prev.filter(m => m.id !== measurementId))
  }, [])

  if (!isActive && measurements.length === 0 && !pendingPoint) {
    return null
  }

  return (
    <>
      {/* Pending point (first click) */}
      {pendingPoint && (
        <Marker
          position={[pendingPoint.lat, pendingPoint.lng]}
          icon={createMeasurementIcon(pendingPoint.label, '#ff6b35')}
        >
          <Popup>
            <div className="text-center p-2">
              <div className="font-bold text-orange-600">Start Point</div>
              <div className="text-xs text-gray-600 mt-1">
                Click another point to measure distance
              </div>
            </div>
          </Popup>
        </Marker>
      )}

      {/* Completed measurements */}
      {measurements.map((measurement) => (
        <React.Fragment key={measurement.id}>
          {/* Start point marker */}
          <Marker
            position={[measurement.startPoint.lat, measurement.startPoint.lng]}
            icon={createMeasurementIcon(measurement.startPoint.label, measurement.color)}
          >
            <Popup>
              <div className="text-center p-2">
                <div className="font-bold" style={{ color: measurement.color }}>
                  Start Point ({measurement.startPoint.label})
                </div>
                <div className="text-sm mt-1">
                  Distance: <strong>{formatDistance(measurement.distance)}</strong>
                </div>
                <button
                  onClick={() => removeMeasurement(measurement.id)}
                  className="mt-2 px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                >
                  Remove
                </button>
              </div>
            </Popup>
          </Marker>

          {/* End point marker */}
          <Marker
            position={[measurement.endPoint.lat, measurement.endPoint.lng]}
            icon={createMeasurementIcon(measurement.endPoint.label, measurement.color)}
          >
            <Popup>
              <div className="text-center p-2">
                <div className="font-bold" style={{ color: measurement.color }}>
                  End Point ({measurement.endPoint.label})
                </div>
                <div className="text-sm mt-1">
                  Distance: <strong>{formatDistance(measurement.distance)}</strong>
                </div>
                <button
                  onClick={() => removeMeasurement(measurement.id)}
                  className="mt-2 px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                >
                  Remove
                </button>
              </div>
            </Popup>
          </Marker>

          {/* Distance line */}
          <Polyline
            positions={[
              [measurement.startPoint.lat, measurement.startPoint.lng],
              [measurement.endPoint.lat, measurement.endPoint.lng]
            ]}
            pathOptions={{
              color: measurement.color,
              weight: 3,
              opacity: 0.8,
              dashArray: '10, 5'
            }}
          >
            <Tooltip
              permanent
              direction="center"
              className="distance-tooltip"
            >
              <div className="font-bold text-white bg-gray-900 px-2 py-1 rounded shadow-lg border border-gray-600">
                {formatDistance(measurement.distance)}
              </div>
            </Tooltip>
            <Popup>
              <div className="text-center p-2">
                <div className="font-bold" style={{ color: measurement.color }}>
                  Distance Measurement
                </div>
                <div className="text-lg font-bold mt-1">
                  {formatDistance(measurement.distance)}
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  {measurement.startPoint.label} to {measurement.endPoint.label}
                </div>
                <button
                  onClick={() => removeMeasurement(measurement.id)}
                  className="mt-2 px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                >
                  Remove
                </button>
              </div>
            </Popup>
          </Polyline>
        </React.Fragment>
      ))}

      {/* Measurement Tool UI */}
      {isActive && (
        <div className="fixed top-24 right-4 bg-gray-900 border border-gray-700 rounded-lg p-4 z-[999] max-w-xs shadow-2xl">
          <div className="text-white">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-orange-400">Distance Tool</h3>
              <div className="flex items-center space-x-2">
                {measurements.length > 0 && (
                  <button
                    onClick={handleClearAll}
                    className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                  >
                    Clear All
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="px-2 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700"
                  title="Close Distance Tool"
                >
                  ✕
                </button>
              </div>
            </div>
            
            <div className="text-sm text-gray-300 mb-3">
              {pendingPoint ? (
                <div className="text-orange-400">
                  📍 Click second point to measure distance
                </div>
              ) : (
                <div>
                  📏 Click two points on the map to measure distance
                </div>
              )}
            </div>

            {/* Active measurements list */}
            {measurements.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-gray-400">Measurements:</div>
                {measurements.map((measurement) => (
                  <div
                    key={measurement.id}
                    className="flex items-center justify-between text-xs bg-gray-800 rounded p-2"
                  >
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: measurement.color }}
                      />
                      <span>
                        {measurement.startPoint.label} → {measurement.endPoint.label}
                      </span>
                    </div>
                    <div className="font-bold text-white">
                      {formatDistance(measurement.distance)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Custom CSS for markers and tooltips */}
      <style jsx global>{`
        .distance-measurement-marker {
          background: transparent !important;
          border: none !important;
        }
        
        .distance-measurement-marker:hover {
          transform: scale(1.1);
          transition: transform 0.2s ease;
        }
        
        .distance-tooltip {
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
        }
        
        .distance-tooltip::before {
          display: none !important;
        }
      `}</style>
    </>
  )
}