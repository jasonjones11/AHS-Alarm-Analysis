'use client'

import React, { memo, useMemo } from 'react'
import { Polyline } from 'react-leaflet'
import SmoothVehicleMarker from './SmoothVehicleMarker'
import { TruckPosition } from '@/utils/PlaybackEngine'

interface VehicleInfo {
  vehicle_id: string
  vehicle_type: 'autonomous' | 'manual'
  data_points: number
  time_range: {
    start: string
    end: string
  }
}

interface SmoothVehicleLayerProps {
  positions: TruckPosition[]
  selectedVehicles: Set<string>
  truckTraceHistories: Map<string, TruckPosition[]>
  availableVehicles: VehicleInfo[]
  selectedTruck: string | null
  onSelectTruck: (vehicleId: string) => void
  onHoverTruck: (position: TruckPosition) => void
  onHoverLeave: () => void
  logger: any
}

// Helper function to calculate vehicle rotation from movement history
const calculateRotation = (traceHistory: TruckPosition[]): number => {
  if (traceHistory.length < 2) return 0
  
  const current = traceHistory[traceHistory.length - 1]
  const previous = traceHistory[traceHistory.length - 2]
  const deltaLat = current.latitude - previous.latitude
  const deltaLng = current.longitude - previous.longitude
  
  // Convert to degrees and adjust for arrow pointing up
  return Math.atan2(deltaLng, deltaLat) * (180 / Math.PI) + 90
}

// Memoized vehicle component to prevent unnecessary re-renders
const VehicleWithTrail = memo(function VehicleWithTrail({
  position,
  vehicleInfo,
  traceHistory,
  isSelected,
  rotation,
  onSelect,
  onHover,
  onHoverLeave
}: {
  position: TruckPosition
  vehicleInfo: VehicleInfo
  traceHistory: TruckPosition[]
  isSelected: boolean
  rotation: number
  onSelect: (vehicleId: string) => void
  onHover: (position: TruckPosition) => void
  onHoverLeave: () => void
}) {
  // Memoize trail path to prevent recalculation on every render
  const trailPath = useMemo(() => {
    return traceHistory.length > 1 
      ? traceHistory.map(p => [p.latitude, p.longitude] as [number, number])
      : []
  }, [traceHistory])

  return (
    <>
      {/* Trace History Trail (30-second trail behind truck) */}
      {trailPath.length > 1 && (
        <Polyline
          positions={trailPath}
          pathOptions={{
            color: vehicleInfo.vehicle_type === 'autonomous' ? '#3b82f6' : '#ef4444',
            weight: 3,
            opacity: 0.7,
            lineCap: 'round',
            lineJoin: 'round'
          }}
        />
      )}
      
      {/* Smooth Vehicle Marker */}
      <SmoothVehicleMarker
        position={position}
        vehicleType={vehicleInfo.vehicle_type}
        isSelected={isSelected}
        rotation={rotation}
        onMarkerClick={onSelect}
        onMarkerHover={onHover}
        onMarkerLeave={onHoverLeave}
      />
    </>
  )
}, (prevProps, nextProps) => {
  // Custom comparison for optimal performance
  return (
    prevProps.position.vehicle_id === nextProps.position.vehicle_id &&
    prevProps.position.latitude === nextProps.position.latitude &&
    prevProps.position.longitude === nextProps.position.longitude &&
    prevProps.position.timestamp === nextProps.position.timestamp &&
    prevProps.position.speed_kmh === nextProps.position.speed_kmh &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.rotation === nextProps.rotation &&
    prevProps.traceHistory.length === nextProps.traceHistory.length &&
    prevProps.traceHistory[prevProps.traceHistory.length - 1]?.timestamp === 
    nextProps.traceHistory[nextProps.traceHistory.length - 1]?.timestamp
  )
})

const SmoothVehicleLayer = memo(function SmoothVehicleLayer({
  positions,
  selectedVehicles,
  truckTraceHistories,
  availableVehicles,
  selectedTruck,
  onSelectTruck,
  onHoverTruck,
  onHoverLeave,
  logger
}: SmoothVehicleLayerProps) {
  
  // Process and deduplicate positions for optimal performance
  const processedVehicles = useMemo(() => {
    const vehicleMap = new Map<string, TruckPosition>()
    
    // Deduplicate positions - keep the latest for each vehicle
    positions.forEach(position => {
      const existing = vehicleMap.get(position.vehicle_id)
      if (!existing || new Date(position.timestamp) > new Date(existing.timestamp)) {
        vehicleMap.set(position.vehicle_id, position)
      }
    })
    
    // Filter to only selected vehicles and enrich with metadata
    const processed: Array<{
      position: TruckPosition
      vehicleInfo: VehicleInfo
      traceHistory: TruckPosition[]
      rotation: number
    }> = []
    
    vehicleMap.forEach((position, vehicleId) => {
      if (!selectedVehicles.has(vehicleId)) return
      
      const vehicleInfo = availableVehicles.find(v => v.vehicle_id === vehicleId)
      if (!vehicleInfo) return
      
      const traceHistory = truckTraceHistories.get(vehicleId) || []
      const rotation = calculateRotation(traceHistory)
      
      processed.push({
        position,
        vehicleInfo,
        traceHistory,
        rotation
      })
    })
    
    return processed
  }, [positions, selectedVehicles, availableVehicles, truckTraceHistories])

  // Log performance metrics for debugging
  React.useEffect(() => {
    if (processedVehicles.length > 0) {
      logger.debug('smooth-vehicles', 'Rendered vehicle markers', {
        totalPositions: positions.length,
        processedVehicles: processedVehicles.length,
        selectedCount: selectedVehicles.size,
        avgTrailLength: processedVehicles.reduce((sum, v) => sum + v.traceHistory.length, 0) / processedVehicles.length
      })
    }
  }, [processedVehicles.length, positions.length, selectedVehicles.size])

  return (
    <>
      {processedVehicles.map(({ position, vehicleInfo, traceHistory, rotation }) => (
        <VehicleWithTrail
          key={position.vehicle_id}
          position={position}
          vehicleInfo={vehicleInfo}
          traceHistory={traceHistory}
          isSelected={selectedTruck === position.vehicle_id}
          rotation={rotation}
          onSelect={onSelectTruck}
          onHover={onHoverTruck}
          onHoverLeave={onHoverLeave}
        />
      ))}
    </>
  )
}, (prevProps, nextProps) => {
  // Optimize re-renders by comparing essential props
  return (
    prevProps.positions.length === nextProps.positions.length &&
    prevProps.selectedVehicles.size === nextProps.selectedVehicles.size &&
    prevProps.selectedTruck === nextProps.selectedTruck &&
    prevProps.truckTraceHistories.size === nextProps.truckTraceHistories.size &&
    // Compare latest timestamp for all positions
    prevProps.positions.every((pos, idx) => 
      nextProps.positions[idx] && pos.timestamp === nextProps.positions[idx].timestamp
    )
  )
})

export default SmoothVehicleLayer