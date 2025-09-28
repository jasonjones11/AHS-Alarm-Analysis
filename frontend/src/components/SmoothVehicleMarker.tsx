'use client'

import React, { useEffect, useRef, memo } from 'react'
import { Marker, Popup } from 'react-leaflet'
import { TruckPosition } from '@/utils/PlaybackEngine'

// Leaflet import
let L: any = null
if (typeof window !== 'undefined') {
  L = require('leaflet')
}

interface SmoothVehicleMarkerProps {
  position: TruckPosition
  vehicleType: 'autonomous' | 'manual'
  isSelected: boolean
  rotation: number
  onMarkerClick: (vehicleId: string) => void
  onMarkerHover: (position: TruckPosition) => void
  onMarkerLeave: () => void
}

// Memoized component to prevent unnecessary re-renders
const SmoothVehicleMarker = memo(function SmoothVehicleMarker({
  position,
  vehicleType,
  isSelected,
  rotation,
  onMarkerClick,
  onMarkerHover,
  onMarkerLeave
}: SmoothVehicleMarkerProps) {
  const markerRef = useRef<any>(null)
  const previousPositionRef = useRef<[number, number] | null>(null)
  const animationRef = useRef<number | null>(null)
  
  // Create vehicle icon only once and reuse
  const vehicleIcon = React.useMemo(() => {
    if (!L) return null
    
    return L.divIcon({
      className: 'custom-smooth-vehicle-marker',
      html: `
        <div class="smooth-vehicle-marker ${vehicleType}" style="
          width: 32px;
          height: 32px;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          transform-origin: center center;
        ">
          <!-- Vehicle Name Label -->
          <div class="vehicle-label" style="
            position: absolute;
            top: -25px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(30, 41, 59, 0.95);
            color: white;
            padding: 2px 6px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: bold;
            white-space: nowrap;
            border: 1px solid ${vehicleType === 'autonomous' ? '#3b82f6' : '#ef4444'};
            z-index: 1000;
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            ${isSelected ? 'background: rgba(59, 130, 246, 0.95);' : ''}
          ">
            ${position.vehicle_id}
          </div>
          
          <!-- Main Circular Icon -->
          <div class="vehicle-icon" style="
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background-color: ${vehicleType === 'autonomous' ? '#3b82f6' : '#ef4444'};
            border: 2px solid white;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            z-index: 999;
            transform: rotate(${rotation}deg);
            transition: transform 0.2s ease-out, box-shadow 0.2s ease;
            ${isSelected ? 'box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.5), 0 2px 8px rgba(0,0,0,0.3);' : ''}
          ">
            <!-- Directional Arrow -->
            <div style="
              width: 0;
              height: 0;
              border-left: 6px solid transparent;
              border-right: 6px solid transparent;
              border-bottom: 10px solid white;
            "></div>
          </div>
          
          <!-- Status Dot -->
          <div class="status-dot" style="
            position: absolute;
            top: 2px;
            right: 2px;
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: #10b981;
            border: 1px solid white;
            z-index: 1001;
            ${(position.speed_kmh || 0) > 1 ? 'animation: pulse 2s infinite;' : ''}
          "></div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16]
    })
  }, [vehicleType, position.vehicle_id, rotation, isSelected, position.speed_kmh || 0])

  // Smooth position animation synchronized with PlaybackEngine updates
  useEffect(() => {
    const marker = markerRef.current
    if (!marker || !L) return

    const newPosition: [number, number] = [position.latitude, position.longitude]
    
    // Direct position update for smooth playback - no additional animation needed
    // The PlaybackEngine already handles interpolation between data points
    marker.setLatLng(newPosition)
    previousPositionRef.current = newPosition

    // Cleanup any existing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
  }, [position.latitude, position.longitude])

  // Update icon rotation and selection state without recreating the marker
  useEffect(() => {
    const marker = markerRef.current
    if (!marker || !vehicleIcon) return

    // Update the icon with new rotation and selection state
    marker.setIcon(vehicleIcon)
  }, [vehicleIcon])

  if (!L || !vehicleIcon) return null

  return (
    <Marker
      ref={markerRef}
      position={[position.latitude, position.longitude]}
      icon={vehicleIcon}
      eventHandlers={{
        click: () => onMarkerClick(position.vehicle_id),
        mouseover: () => onMarkerHover(position),
        mouseout: onMarkerLeave
      }}
    >
      <Popup>
        <div className="text-sm">
          <div className="flex items-center mb-2">
            <div className={`w-4 h-4 rounded-full mr-2 ${
              vehicleType === 'autonomous' ? 'bg-blue-500' : 'bg-red-500'
            }`}></div>
            <strong>{position.vehicle_id}</strong>
            <span className="ml-2 text-xs text-gray-500">({vehicleType})</span>
          </div>
          <div>Speed: {(position.speed_kmh || 0).toFixed(1)} km/h</div>
          <div>Time: {new Date(position.timestamp).toLocaleString('en-AU', {
            timeZone: 'Australia/Perth',
            hour12: false
          })}</div>
          {position.states?.motion_controller && (
            <div>Motion: {position.states.motion_controller}</div>
          )}
          {position.states?.asset_activity && (
            <div>Activity: {position.states.asset_activity}</div>
          )}
          {position.states?.haulage_state && (
            <div>Haulage: {position.states.haulage_state}</div>
          )}
          {position.offpath_deviation !== undefined && (
            <div className={position.offpath_deviation > 0 ? "text-yellow-600" : "text-green-600"}>
              Off-path: {position.offpath_deviation.toFixed(2)} m
            </div>
          )}
        </div>
      </Popup>
      
      {/* CSS for animations */}
      <style jsx global>{`
        @keyframes pulse {
          0% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.2);
            opacity: 0.8;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
        
        .custom-smooth-vehicle-marker {
          background: transparent !important;
          border: none !important;
        }
        
        .smooth-vehicle-marker {
          transition: all 0.1s ease-out;
        }
        
        .smooth-vehicle-marker:hover .vehicle-icon {
          transform: scale(1.1) rotate(${rotation}deg);
        }
        
        .smooth-vehicle-marker:hover .vehicle-label {
          background: rgba(59, 130, 246, 0.95) !important;
        }
      `}</style>
    </Marker>
  )
}, (prevProps, nextProps) => {
  // Custom comparison for memo - only re-render if these specific props change
  return (
    prevProps.position.vehicle_id === nextProps.position.vehicle_id &&
    prevProps.position.latitude === nextProps.position.latitude &&
    prevProps.position.longitude === nextProps.position.longitude &&
    prevProps.position.timestamp === nextProps.position.timestamp &&
    (prevProps.position.speed_kmh || 0) === (nextProps.position.speed_kmh || 0) &&
    prevProps.vehicleType === nextProps.vehicleType &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.rotation === nextProps.rotation
  )
})

export default SmoothVehicleMarker