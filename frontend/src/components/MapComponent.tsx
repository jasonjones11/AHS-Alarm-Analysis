'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { TruckData, ManualVehicleData, Truck } from '@/types/truck'
import { 
  SpatialIndex, 
  LODManager, 
  PerformanceMonitor, 
  cullOutsideViewport, 
  filterByTimeWindow,
  debounce,
  throttle 
} from '@/utils/performanceOptimizations'


// Dynamic import for VehicleGaugeDashboard to prevent SSR issues
const VehicleGaugeDashboard = dynamic(() => import('./VehicleGaugeDashboard'), { ssr: false })

// Dynamic imports for Leaflet components to prevent SSR issues
const MapContainer = dynamic(() => import('react-leaflet').then(mod => ({ default: mod.MapContainer })), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(mod => ({ default: mod.TileLayer })), { ssr: false })
const GeoJSON = dynamic(() => import('react-leaflet').then(mod => ({ default: mod.GeoJSON })), { ssr: false })
// useMap hook will be imported directly when needed since it's not a component

// Dynamic import for Leaflet itself
let L: any = null
if (typeof window !== 'undefined') {
  L = require('leaflet')
}

interface PlaybackState {
  isPlaying: boolean
  currentTime: number
  speed: number
  duration: number
  startTime?: number
}

interface NotificationData {
  vehicle: string
  timestamp: string
  title: string
  message: string
  severity?: 'Critical' | 'High' | 'Medium' | 'Low'
  alarm_type?: string
  location?: {
    lat: number
    lon: number
  }
}

interface TelemetryData {
  vehicle: string
  motion_controller: string | null
  asset_activity: string | null
  haulage_state: string | null
  timestamp: string
}

interface MapComponentProps {
  trucks: Truck[];
  selectedTruck: Truck | null;
  onSelectTruck: (truck: Truck | null) => void;
  truckData: TruckData[];
  notifications: NotificationData[];
  telemetry: TelemetryData[];
  geoJsonData: any;
  loading: boolean;
  timeRange: [number, number];
  onTimeRangeChange: (timeRange: [number, number]) => void;
  colorMode: 'speed' | 'motion_controller' | 'offpath_error';
  onColorModeChange: (mode: 'speed' | 'motion_controller' | 'offpath_error') => void;
  manualVehicleData?: ManualVehicleData[];
  selectedManualVehicles?: string[];
}

const MapInitializer = ({ onMapReady }: { onMapReady: (map: any) => void }) => {
  const [isClient, setIsClient] = useState(false)
  
  useEffect(() => {
    setIsClient(true)
  }, [])
  
  if (!isClient) return null
  
  return <MapInitializerClient onMapReady={onMapReady} />
}

const MapInitializerClient = ({ onMapReady }: { onMapReady: (map: any) => void }) => {
  const { useMap } = require('react-leaflet')
  const map = useMap()
  
  useEffect(() => {
    if (map) {
      onMapReady(map)
    }
  }, [map, onMapReady])
  
  return null
}

const NotificationPins = ({ notifications, truckData, timeRange, telemetry, currentTelemetry }: { 
  notifications: NotificationData[], 
  truckData: TruckData[], 
  timeRange: [number, number],
  telemetry: TelemetryData[],
  currentTelemetry: TelemetryData | null
}) => {
  const [isClient, setIsClient] = useState(false)
  
  useEffect(() => {
    setIsClient(true)
  }, [])
  
  if (!isClient) return null
  
  return <NotificationPinsClient notifications={notifications} truckData={truckData} timeRange={timeRange} telemetry={telemetry} currentTelemetry={currentTelemetry} />
}

const NotificationPinsClient = ({ notifications, truckData, timeRange, telemetry, currentTelemetry }: { 
  notifications: NotificationData[], 
  truckData: TruckData[], 
  timeRange: [number, number],
  telemetry: TelemetryData[],
  currentTelemetry: TelemetryData | null
}) => {
  const { useMap } = require('react-leaflet')
  const map = useMap()
  
  useEffect(() => {
    // Clear existing notification markers
    map.eachLayer((layer: any) => {
      if (layer instanceof L.Marker && (layer as any)._notificationMarker) {
        map.removeLayer(layer)
      }
    })
    
    if (notifications.length === 0 || truckData.length === 0) return
    
    // Filter notifications based on time range
    const filteredNotifications = notifications.filter(notification => {
      const notificationTime = new Date(notification.timestamp).getTime()
      return notificationTime >= timeRange[0] && notificationTime <= timeRange[1]
    })
    
    if (filteredNotifications.length === 0) return
    
    // Group notifications by proximity in time and space
    const groupedNotifications = groupNearbyNotifications(filteredNotifications, truckData)
    
    groupedNotifications.forEach((group) => {
      const isCluster = group.notifications.length > 1
      const primaryNotification = group.notifications[0]
      
      // Create severity-based alarm icon with enhanced styling
      const getSeverityStyle = (severity?: string) => {
        switch (severity?.toLowerCase()) {
          case 'critical':
            return {
              gradient: '#dc2626 0%, #991b1b 100%',
              shadow: 'rgba(220, 38, 38, 0.6)',
              icon: '🚨',
              animation: 'criticalAlarm 1s infinite'
            }
          case 'high':
            return {
              gradient: '#ea580c 0%, #c2410c 100%',
              shadow: 'rgba(234, 88, 12, 0.5)',
              icon: '⚠️',
              animation: 'highAlarm 1.5s infinite'
            }
          case 'medium':
            return {
              gradient: '#ca8a04 0%, #a16207 100%',
              shadow: 'rgba(202, 138, 4, 0.4)',
              icon: '⚡',
              animation: 'mediumAlarm 2s infinite'
            }
          case 'low':
            return {
              gradient: '#16a34a 0%, #15803d 100%',
              shadow: 'rgba(22, 163, 74, 0.3)',
              icon: 'ℹ️',
              animation: 'lowAlarm 3s infinite'
            }
          default:
            return {
              gradient: '#6b7280 0%, #4b5563 100%',
              shadow: 'rgba(107, 114, 128, 0.3)',
              icon: '❓',
              animation: 'defaultAlarm 2s infinite'
            }
        }
      }
      
      const severityStyle = getSeverityStyle(primaryNotification.severity)
      const highestSeverity = isCluster 
        ? group.notifications.reduce((highest: string, notif) => {
            const severities = ['critical', 'high', 'medium', 'low']
            const currentIndex = severities.indexOf(notif.severity?.toLowerCase() || '')
            const highestIndex = severities.indexOf(highest?.toLowerCase() || '')
            return currentIndex < highestIndex ? (notif.severity || 'low') : highest
          }, 'low' as string)
        : primaryNotification.severity
      
      const clusterStyle = isCluster ? getSeverityStyle(highestSeverity) : severityStyle
      
      const notificationIcon = L.divIcon({
        html: `
          <div style="
            position: relative;
            width: ${isCluster ? '32px' : '28px'};
            height: ${isCluster ? '32px' : '28px'};
            background: linear-gradient(135deg, ${clusterStyle.gradient});
            border: 3px solid white;
            border-radius: 50%;
            box-shadow: 0 4px 12px ${clusterStyle.shadow};
            display: flex;
            align-items: center;
            justify-content: center;
            animation: ${clusterStyle.animation};
            z-index: 1000;
          ">
            <div style="
              color: white;
              font-size: ${isCluster ? '12px' : '14px'};
              font-weight: bold;
              display: flex;
              flex-direction: column;
              align-items: center;
              line-height: 1;
              text-shadow: 0 1px 2px rgba(0,0,0,0.5);
            ">
              <div>${clusterStyle.icon}</div>
              ${isCluster ? `<div style="font-size: 8px; margin-top: 1px; background: rgba(0,0,0,0.7); border-radius: 8px; padding: 1px 3px;">${group.notifications.length}</div>` : ''}
            </div>
          </div>
          
          <style>
            @keyframes criticalAlarm {
              0%, 100% { transform: scale(1); opacity: 1; }
              25% { transform: scale(1.2); opacity: 0.8; }
              50% { transform: scale(1.1); opacity: 1; }
              75% { transform: scale(1.2); opacity: 0.8; }
            }
            @keyframes highAlarm {
              0%, 100% { transform: scale(1); opacity: 1; }
              50% { transform: scale(1.15); opacity: 0.85; }
            }
            @keyframes mediumAlarm {
              0%, 100% { transform: scale(1); opacity: 1; }
              50% { transform: scale(1.1); opacity: 0.9; }
            }
            @keyframes lowAlarm {
              0%, 100% { transform: scale(1); opacity: 1; }
              50% { transform: scale(1.05); opacity: 0.95; }
            }
            @keyframes defaultAlarm {
              0%, 100% { transform: scale(1); opacity: 1; }
              50% { transform: scale(1.08); opacity: 0.9; }
            }
          </style>
        `,
        className: 'notification-pin',
        iconSize: [isCluster ? 28 : 24, isCluster ? 28 : 24],
        iconAnchor: [isCluster ? 14 : 12, isCluster ? 14 : 12]
      })
      
      // Create marker at truck position when notification occurred
      const marker = L.marker([group.position.lat, group.position.lon], { 
        icon: notificationIcon,
        zIndexOffset: 1000 + (isCluster ? 100 : 0) // Clusters appear on top
      });
      
      // Mark this as a notification marker for cleanup
      (marker as any)._notificationMarker = true
      
      // Calculate speed at notification time (if available)
      const speedAtTime = truckData.find(p => 
        Math.abs(new Date(p.timestamp).getTime() - new Date(primaryNotification.timestamp).getTime()) < 5000
      )
      
      // Create popup content
      const popupContent = isCluster ? createClusterPopup(group, speedAtTime, currentTelemetry) : createSinglePopup(primaryNotification, group.position, speedAtTime, currentTelemetry)
      
      // Add popup with notification details
      marker.bindPopup(popupContent, {
        className: 'notification-popup',
        maxWidth: isCluster ? 400 : 280,
        maxHeight: isCluster ? 500 : 300
      })
      
      marker.addTo(map)
    })
  }, [map, notifications, truckData, timeRange, telemetry, currentTelemetry])
  
  return null
}

// Helper function to group nearby notifications
const groupNearbyNotifications = (notifications: NotificationData[], truckData: TruckData[]) => {
  const TIME_THRESHOLD = 1000 // 1 second - group all notifications within the same second
  const DISTANCE_THRESHOLD = 0.0001 // ~10 meters in degrees
  
  const groups: Array<{
    notifications: NotificationData[]
    position: { lat: number; lon: number }
    timeSpan: { start: number; end: number }
  }> = []
  
  notifications.forEach((notification) => {
    const notificationTime = new Date(notification.timestamp).getTime()
    
    // Find closest truck position
    let closestPoint = truckData[0]
    let minTimeDiff = Math.abs(new Date(truckData[0].timestamp).getTime() - notificationTime)
    
    truckData.forEach((point) => {
      const timeDiff = Math.abs(new Date(point.timestamp).getTime() - notificationTime)
      if (timeDiff < minTimeDiff) {
        minTimeDiff = timeDiff
        closestPoint = point
      }
    })
    
    // Try to find existing group to add this notification to
    // Group by same second (ignoring milliseconds) and close spatial proximity
    const notificationSecond = Math.floor(notificationTime / 1000) * 1000 // Round down to the second
    
    let addedToGroup = false
    for (const group of groups) {
      const groupSecond = Math.floor(group.timeSpan.start / 1000) * 1000
      const spatialDistance = (closestPoint.lat != null && closestPoint.lon != null) ? Math.sqrt(
        Math.pow(closestPoint.lat - group.position.lat, 2) + 
        Math.pow(closestPoint.lon - group.position.lon, 2)
      ) : Infinity
      
      // Group if within the same second and close spatial proximity
      if (notificationSecond === groupSecond && spatialDistance <= DISTANCE_THRESHOLD) {
        group.notifications.push(notification)
        group.timeSpan.start = Math.min(group.timeSpan.start, notificationTime)
        group.timeSpan.end = Math.max(group.timeSpan.end, notificationTime)
        addedToGroup = true
        break
      }
    }
    
    // Create new group if notification doesn't fit in existing ones
    if (!addedToGroup && closestPoint.lat != null && closestPoint.lon != null) {
      groups.push({
        notifications: [notification],
        position: { lat: closestPoint.lat, lon: closestPoint.lon },
        timeSpan: { start: notificationTime, end: notificationTime }
      })
    }
  })
  
  return groups
}

// Helper function to create single notification popup
const createSinglePopup = (notification: NotificationData, position: { lat: number; lon: number }, speedAtTime: any, telemetry: TelemetryData | null) => {
  return `
    <div style="
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      border: 1px solid rgba(239, 68, 68, 0.5);
      border-radius: 12px;
      padding: 16px;
      color: white;
      min-width: 280px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    ">
      <div style="text-align: center; margin-bottom: 12px;">
        <div style="font-size: 24px; margin-bottom: 4px;">⚠️</div>
        <h3 style="font-weight: bold; color: #ef4444; margin: 0; font-size: 16px;">${notification.title}</h3>
        <div style="font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">NOTIFICATION</div>
      </div>
      
      <div style="border-top: 1px solid rgba(239, 68, 68, 0.2); padding-top: 12px; margin-bottom: 12px;">
        <p style="margin: 0; color: #cbd5e1; font-size: 14px; line-height: 1.4;">${notification.message}</p>
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 11px;">
        <div>
          <div style="color: #64748b; font-weight: 500;">TIME</div>
          <div style="color: #60a5fa; font-weight: bold;">${new Date(notification.timestamp).toLocaleTimeString('en-AU', { timeZone: 'Australia/Perth', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}.${new Date(notification.timestamp).getMilliseconds().toString().padStart(3, '0')}</div>
        </div>
        <div>
          <div style="color: #64748b; font-weight: 500;">SPEED</div>
          <div style="color: #34d399; font-weight: bold;">${speedAtTime ? (speedAtTime.speed_kmh || 0).toFixed(1) : 'N/A'} km/h</div>
        </div>
        <div>
          <div style="color: #64748b; font-weight: 500;">MOTION CTRL</div>
          <div style="color: #f59e0b; font-weight: bold;">${telemetry?.motion_controller || 'N/A'}</div>
        </div>
        <div>
          <div style="color: #64748b; font-weight: 500;">ACTIVITY</div>
          <div style="color: #8b5cf6; font-weight: bold;">${telemetry?.asset_activity || 'N/A'}</div>
        </div>
        <div>
          <div style="color: #64748b; font-weight: 500;">HAULAGE</div>
          <div style="color: #06b6d4; font-weight: bold;">${telemetry?.haulage_state || 'N/A'}</div>
        </div>
        <div style="grid-column: span 1;">
          <div style="color: #64748b; font-weight: 500;">LOCATION</div>
          <div style="color: #a78bfa; font-family: monospace; font-size: 10px;">
            ${position.lat != null ? position.lat.toFixed(6) : 'N/A'}, ${position.lon != null ? position.lon.toFixed(6) : 'N/A'}
          </div>
        </div>
      </div>
      
      <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(239, 68, 68, 0.2); text-align: center;">
        <div style="font-size: 10px; color: #64748b;">Mining Operations Alert System</div>
      </div>
    </div>
  `
}

// Helper function to create clustered notification popup
const createClusterPopup = (group: any, speedAtTime: any, telemetry: TelemetryData | null) => {
  const sortedNotifications = group.notifications.sort((a: NotificationData, b: NotificationData) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )
  
  const timeSpan = new Date(group.timeSpan.end).getTime() - new Date(group.timeSpan.start).getTime()
  const timeSpanText = timeSpan < 1000 ? 'Simultaneous' : `${Math.round(timeSpan/1000)}s span`
  
  const notificationItems = sortedNotifications.map((notification: NotificationData, index: number) => `
    <div style="
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: ${index < sortedNotifications.length - 1 ? '8px' : '0'};
    ">
      <div style="display: flex; justify-between; align-items: start; margin-bottom: 6px;">
        <h4 style="color: #ef4444; font-weight: bold; margin: 0; font-size: 14px;">${notification.title}</h4>
        <div style="background: rgba(96, 165, 250, 0.2); color: #60a5fa; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: bold;">
          ${new Date(notification.timestamp).toLocaleTimeString('en-AU', { timeZone: 'Australia/Perth', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}.${new Date(notification.timestamp).getMilliseconds().toString().padStart(3, '0')}
        </div>
      </div>
      <p style="margin: 0; color: #cbd5e1; font-size: 12px; line-height: 1.3;">${notification.message}</p>
    </div>
  `).join('')
  
  return `
    <div style="
      background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      border: 1px solid rgba(239, 68, 68, 0.5);
      border-radius: 12px;
      padding: 16px;
      color: white;
      min-width: 350px;
      max-width: 400px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    ">
      <div style="text-align: center; margin-bottom: 16px;">
        <div style="font-size: 28px; margin-bottom: 4px;">🚨</div>
        <h3 style="font-weight: bold; color: #ef4444; margin: 0; font-size: 18px;">Multiple Alarms Cluster</h3>
        <div style="font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 1px;">${group.notifications.length} ALERTS • ${timeSpanText}</div>
      </div>
      
      <div style="border-top: 1px solid rgba(239, 68, 68, 0.2); padding-top: 12px; margin-bottom: 12px; max-height: 250px; overflow-y: auto;">
        ${notificationItems}
      </div>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 11px; border-top: 1px solid rgba(239, 68, 68, 0.2); padding-top: 12px;">
        <div>
          <div style="color: #64748b; font-weight: 500;">SPEED</div>
          <div style="color: #34d399; font-weight: bold;">${speedAtTime ? (speedAtTime.speed_kmh || 0).toFixed(1) : 'N/A'} km/h</div>
        </div>
        <div>
          <div style="color: #64748b; font-weight: 500;">COUNT</div>
          <div style="color: #f59e0b; font-weight: bold;">${group.notifications.length} alerts</div>
        </div>
        <div>
          <div style="color: #64748b; font-weight: 500;">MOTION CTRL</div>
          <div style="color: #f59e0b; font-weight: bold;">${telemetry?.motion_controller || 'N/A'}</div>
        </div>
        <div>
          <div style="color: #64748b; font-weight: 500;">ACTIVITY</div>
          <div style="color: #8b5cf6; font-weight: bold;">${telemetry?.asset_activity || 'N/A'}</div>
        </div>
        <div>
          <div style="color: #64748b; font-weight: 500;">HAULAGE</div>
          <div style="color: #06b6d4; font-weight: bold;">${telemetry?.haulage_state || 'N/A'}</div>
        </div>
        <div style="grid-column: span 1;">
          <div style="color: #64748b; font-weight: 500;">LOCATION</div>
          <div style="color: #a78bfa; font-family: monospace; font-size: 10px;">
            ${group.position.lat != null ? group.position.lat.toFixed(6) : 'N/A'}, ${group.position.lon != null ? group.position.lon.toFixed(6) : 'N/A'}
          </div>
        </div>
      </div>
      
      <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(239, 68, 68, 0.2); text-align: center;">
        <div style="font-size: 10px; color: #64748b;">Mining Operations Alert System</div>
      </div>
    </div>
  `
}

const GeoJSONLayer = ({ data, onBoundsCalculated }: { data: any, onBoundsCalculated?: (bounds: any) => void }) => {
  const [isClient, setIsClient] = useState(false)
  
  useEffect(() => {
    setIsClient(true)
  }, [])
  
  if (!isClient) return null
  
  return <GeoJSONLayerClient data={data} onBoundsCalculated={onBoundsCalculated} />
}

const GeoJSONLayerClient = ({ data, onBoundsCalculated }: { data: any, onBoundsCalculated?: (bounds: any) => void }) => {
  const { useMap } = require('react-leaflet')
  const map = useMap()

  useEffect(() => {
    if (data) {
      // Filter out unwanted features - keep only essential mine infrastructure
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
          
          // Remove GeometryCollection with only LineString
          if (feature.geometry?.type === 'GeometryCollection') {
            const hasOnlyLines = feature.geometry.geometries?.every((geom: any) => 
              geom.type === 'LineString' || geom.type === 'MultiLineString'
            )
            if (hasOnlyLines) {
              return false
            }
          }
          
          return true
        })
      }

      // Auto-zoom to GeoJSON bounds on initial load
      const geoJsonLayer = L.geoJSON(filteredData)
      const bounds = geoJsonLayer.getBounds()
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] })
        if (onBoundsCalculated) {
          onBoundsCalculated(bounds)
        }
      }
    }
  }, [data, map, onBoundsCalculated])

  return null
}

// Manual Vehicle Playback Component
const ManualVehiclePlayback = ({ 
  manualVehicleData, 
  selectedManualVehicles, 
  mapInstance,
  playbackState,
  timeRange,
}: { 
  manualVehicleData: ManualVehicleData[], 
  selectedManualVehicles: string[], 
  mapInstance: any,
  playbackState: any,
  timeRange: [number, number],
  }) => {
  const [isClient, setIsClient] = useState(false)
  
  useEffect(() => {
    setIsClient(true)
  }, [])
  
  if (!isClient) return null
  
  return <ManualVehiclePlaybackClient 
    manualVehicleData={manualVehicleData}
    selectedManualVehicles={selectedManualVehicles}
    mapInstance={mapInstance}
    playbackState={playbackState}
    timeRange={timeRange}
  />
}

const ManualVehiclePlaybackClient = ({ 
  manualVehicleData, 
  selectedManualVehicles, 
  mapInstance,
  playbackState,
  timeRange,
}: { 
  manualVehicleData: ManualVehicleData[], 
  selectedManualVehicles: string[], 
  mapInstance: any,
  playbackState: any,
  timeRange: [number, number],
  }) => {
  const { useMap } = require('react-leaflet')
  const map = useMap()
  const vehiclesRef = useRef<Map<string, {
    id: string
    path: ManualVehicleData[]
    marker: any
    currentPosition: { lat: number; lng: number } | null
    trail: any
    trailPositions: Array<{ lat: number; lng: number; speed: number; timestamp: number }>
    speedSegments: Array<{ segment: any; timestamp: number }>
    staticTraceSegments: any[]
    currentSpeed: number
  }>>(new Map())

  // Speed-based color coding for manual vehicles (always speed-based, ignores color mode)
  const getManualVehicleSpeedColor = (speedKmh: number): string => {
    if (speedKmh > 30) {
      return '#fb923c' // Orange for >30 km/h (manual vehicle theme)
    } else if (speedKmh >= 5) {
      return '#fbbf24' // Yellow for 5-30 km/h
    } else {
      return '#f87171' // Light red for <5 km/h
    }
  }

  // Get appropriate icon based on manual vehicle asset class
  const getManualVehicleIcon = useCallback((vehicleId: string): string => {
    const vehicleIdUpper = vehicleId.toUpperCase()
    
    // Extract asset class from vehicle ID
    if (vehicleIdUpper.includes('LV') || vehicleIdUpper.startsWith('LV')) {
      return '/icons/LV.png'
    } else if (vehicleIdUpper.includes('DZ') || vehicleIdUpper.includes('DOZER')) {
      return '/icons/Dozer.png'
    } else if (vehicleIdUpper.includes('WC') || vehicleIdUpper.includes('WATER')) {
      return '/icons/Water Cart.png'
    } else if (vehicleIdUpper.includes('GR') || vehicleIdUpper.includes('GRADER')) {
      return '/icons/Grader.png'
    } else if (vehicleIdUpper.includes('EX') || vehicleIdUpper.includes('EXCAVATOR')) {
      return '/icons/Excavator.png'
    } else if (vehicleIdUpper.includes('LR') || vehicleIdUpper.includes('LOADER')) {
      return '/icons/Loader.png'
    } else {
      // Default to Water Cart for unknown manual vehicles
      return '/icons/Water Cart.png'
    }
  }, [])

  const createManualVehicleIcon = useCallback((vehicleId: string, isMoving: boolean = false): any => {
    const pulseClass = isMoving ? '' : 'stopped-manual-vehicle-pulse'
    const glowIntensity = isMoving ? '0.6' : '0.4'
    const vehicleIcon = getManualVehicleIcon(vehicleId)
    
    const html = `
      <div style="position: relative; width: 40px; height: 40px; pointer-events: none;">
        <!-- Manual Vehicle Label -->
        <div style="
          position: absolute;
          top: -20px;
          left: 50%;
          transform: translateX(-50%);
          background: linear-gradient(135deg, #ea580c 0%, #dc2626 100%);
          border: 1px solid rgba(234, 88, 12, 0.8);
          border-radius: 6px;
          padding: 2px 6px;
          font-size: 8px;
          font-weight: 700;
          color: #ffffff;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          white-space: nowrap;
          letter-spacing: 0.3px;
          z-index: 10;
        ">
          ${vehicleId}
        </div>
        
        <!-- GPS Accuracy Ring -->
        <div style="
          position: absolute;
          top: 0;
          left: 0;
          width: 40px;
          height: 40px;
          background: radial-gradient(circle, rgba(234, 88, 12, ${glowIntensity}) 0%, rgba(234, 88, 12, 0.1) 70%, transparent 100%);
          border-radius: 50%;
          animation: ${isMoving ? 'manualGpsRing 2s infinite' : 'none'};
        " class="${!isMoving ? pulseClass : ''}">
          <!-- Manual Vehicle Core -->
          <div style="
            position: absolute;
            top: 4px;
            left: 4px;
            width: 32px;
            height: 32px;
            background: linear-gradient(145deg, #ea580c 0%, #dc2626 100%);
            border-radius: 50%;
            border: 2px solid rgba(255,255,255,0.9);
            box-shadow: 
              0 3px 12px rgba(234, 88, 12, 0.4),
              inset 0 1px 0 rgba(255,255,255,0.3);
          ">
            <!-- Manual Vehicle Icon -->
            <div style="
              position: absolute;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              width: 20px;
              height: 20px;
              background-image: url('${vehicleIcon}');
              background-size: contain;
              background-repeat: no-repeat;
              background-position: center;
              filter: brightness(0) invert(1);
            "></div>
            
            <!-- Status Indicator -->
            <div style="
              position: absolute;
              top: -2px;
              right: -2px;
              width: 10px;
              height: 10px;
              background: ${isMoving ? 'linear-gradient(45deg, #10b981, #34d399)' : 'linear-gradient(45deg, #f59e0b, #fbbf24)'};
              border: 1px solid white;
              border-radius: 50%;
              box-shadow: 0 1px 3px rgba(0,0,0,0.3);
              animation: ${isMoving ? 'statusPulse 1s infinite' : 'gentleStatusPulse 2s infinite'};
            "></div>
          </div>
        </div>
      </div>
      
      <style>
        @keyframes manualGpsRing {
          0% { transform: scale(0.9); opacity: 0.8; }
          50% { transform: scale(1.1); opacity: 0.4; }
          100% { transform: scale(1.3); opacity: 0; }
        }
        .stopped-manual-vehicle-pulse {
          animation: gentlePulse 2s infinite ease-in-out;
        }
      </style>
    `

    return L.divIcon({
      html: html,
      className: 'manual-vehicle-marker',
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    })
  }, [getManualVehicleIcon])

  const interpolatePosition = useCallback((from: ManualVehicleData, to: ManualVehicleData, progress: number) => {
    // Validate coordinates to prevent NaN errors
    const fromLat = typeof from.lat === 'number' && !isNaN(from.lat) ? from.lat : null
    const fromLon = typeof from.lon === 'number' && !isNaN(from.lon) ? from.lon : null
    const toLat = typeof to.lat === 'number' && !isNaN(to.lat) ? to.lat : null
    const toLon = typeof to.lon === 'number' && !isNaN(to.lon) ? to.lon : null
    
    // If any coordinate is invalid, return null to skip this position
    if (fromLat === null || fromLon === null || toLat === null || toLon === null) {
      console.warn('Invalid coordinates in MapComponent interpolatePosition:', { from, to })
      return null
    }
    
    return {
      lat: fromLat + (toLat - fromLat) * progress,
      lng: fromLon + (toLon - fromLon) * progress
    }
  }, [])

  const findPositionAtTime = useCallback((path: ManualVehicleData[], currentTime: number) => {
    if (path.length === 0) return null
    if (path.length === 1) {
      const singlePoint = path[0]
      if (typeof singlePoint.lat === 'number' && !isNaN(singlePoint.lat) &&
          typeof singlePoint.lon === 'number' && !isNaN(singlePoint.lon)) {
        return { 
          position: { lat: singlePoint.lat, lng: singlePoint.lon }, 
          isMoving: false,
          speed: singlePoint.speed_kmh || 0
        }
      } else {
        console.warn('Invalid coordinates in single point for manual vehicle:', singlePoint)
        return null
      }
    }

    // Find the correct segment for interpolation
    for (let i = 0; i < path.length - 1; i++) {
      const currentPoint = path[i]
      const nextPoint = path[i + 1]
      const currentPointTime = new Date(currentPoint.timestamp).getTime()
      const nextPointTime = new Date(nextPoint.timestamp).getTime()
      
      if (currentTime >= currentPointTime && currentTime <= nextPointTime) {
        const progress = nextPointTime > currentPointTime 
          ? (currentTime - currentPointTime) / (nextPointTime - currentPointTime)
          : 0
        
        const position = interpolatePosition(currentPoint, nextPoint, progress)
        
        // If position interpolation failed, skip this data point
        if (!position) {
          console.warn(`Skipping invalid position for manual vehicle at ${new Date(currentTime).toLocaleTimeString()}`)
          continue
        }
        
        const speed = (currentPoint.speed_kmh || 0) + ((nextPoint.speed_kmh || 0) - (currentPoint.speed_kmh || 0)) * progress
        const isMoving = speed > 1.0 && progress > 0.05 && progress < 0.95
        
        return { position, isMoving, speed }
      }
    }

    // Handle edge cases with coordinate validation
    if (currentTime < new Date(path[0].timestamp).getTime()) {
      const firstPoint = path[0]
      if (typeof firstPoint.lat === 'number' && !isNaN(firstPoint.lat) &&
          typeof firstPoint.lon === 'number' && !isNaN(firstPoint.lon)) {
        return { 
          position: { lat: firstPoint.lat, lng: firstPoint.lon }, 
          isMoving: false,
          speed: firstPoint.speed_kmh || 0
        }
      } else {
        console.warn('Invalid coordinates in first point for manual vehicle:', firstPoint)
        return null
      }
    }

    // Show last point with coordinate validation
    const lastPoint = path[path.length - 1]
    if (typeof lastPoint.lat === 'number' && !isNaN(lastPoint.lat) &&
        typeof lastPoint.lon === 'number' && !isNaN(lastPoint.lon)) {
      return { 
        position: { lat: lastPoint.lat, lng: lastPoint.lon }, 
        isMoving: false,
        speed: lastPoint.speed_kmh || 0
      }
    } else {
      console.warn('Invalid coordinates in last point for manual vehicle:', lastPoint)
      return null
    }
  }, [interpolatePosition])

  const createStaticTraces = useCallback((vehicle: any) => {
    // Clear existing static traces
    vehicle.staticTraceSegments.forEach((segment: L.Polyline) => {
      map.removeLayer(segment)
    })
    vehicle.staticTraceSegments = []

    // Filter vehicle path data based on time range
    const filteredPath = vehicle.path.filter((point: ManualVehicleData) => {
      const pointTime = new Date(point.timestamp).getTime()
      return pointTime >= timeRange[0] && pointTime <= timeRange[1]
    })

    // Create static trace segments for the filtered time range
    for (let i = 0; i < filteredPath.length - 1; i++) {
      const currentPoint = filteredPath[i]
      const nextPoint = filteredPath[i + 1]
      
      // Use speed from data (already in km/h)
      const speed = (currentPoint.speed_kmh + nextPoint.speed_kmh) / 2
      const trailColor = getManualVehicleSpeedColor(speed)
      
      const segment = L.polyline(
        [[currentPoint.lat, currentPoint.lon], [nextPoint.lat, nextPoint.lon]], 
        {
          color: trailColor,
          weight: 3,
          opacity: 0.7,
          smoothFactor: 1,
          lineCap: 'round',
          lineJoin: 'round',
          className: 'manual-vehicle-static-trace'
        }
      )
      segment.addTo(map)
      vehicle.staticTraceSegments.push(segment)
    }
  }, [map, timeRange, getManualVehicleSpeedColor])

  const initializeManualVehicles = useCallback(() => {
    // Clear existing vehicles
    vehiclesRef.current.forEach((vehicle) => {
      if (vehicle.marker) {
        map.removeLayer(vehicle.marker)
      }
      vehicle.speedSegments.forEach(segmentData => {
        map.removeLayer(segmentData.segment)
      })
      vehicle.staticTraceSegments.forEach(segment => {
        map.removeLayer(segment)
      })
    })
    vehiclesRef.current.clear()

    // Group manual vehicle data by vehicle
    const vehicleGroups = manualVehicleData.reduce((groups, data) => {
      if (selectedManualVehicles.includes(data.vehicle)) {
        if (!groups[data.vehicle]) {
          groups[data.vehicle] = []
        }
        groups[data.vehicle].push(data)
      }
      return groups
    }, {} as Record<string, ManualVehicleData[]>)

    // Create markers for each selected manual vehicle
    Object.entries(vehicleGroups).forEach(([vehicleId, path]) => {
      const sortedPath = path.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      
      if (sortedPath.length > 0) {
        const initialPosition = sortedPath[0]
        const icon = createManualVehicleIcon(vehicleId, false)
        
        const marker = L.marker([initialPosition.lat, initialPosition.lon], { 
          icon,
          interactive: true,
          zIndexOffset: 500 // Below trucks but above other elements
        })
        
        // Add tooltip
        marker.bindTooltip(`
          <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border: 1px solid rgba(234, 88, 12, 0.5); border-radius: 8px; padding: 8px; color: white; font-size: 11px; box-shadow: 0 4px 12px rgba(0,0,0,0.4);">
            <div style="font-weight: bold; color: #fb923c; margin-bottom: 4px;">🚗 ${vehicleId}</div>
            <div style="font-size: 10px; color: #cbd5e1;">
              <div>Type: <span style="color: #fb923c;">Manual Vehicle</span></div>
              <div>Speed: <span style="color: #a78bfa;">${initialPosition.speed_kmh != null ? initialPosition.speed_kmh.toFixed(1) : 'N/A'}km/h</span></div>
              <div>Points: <span style="color: #fbbf24;">${sortedPath.length}</span></div>
              <div>Lat: <span style="color: #a78bfa;">${initialPosition.lat != null ? initialPosition.lat.toFixed(6) : 'N/A'}</span></div>
              <div>Lng: <span style="color: #a78bfa;">${initialPosition.lon != null ? initialPosition.lon.toFixed(6) : 'N/A'}</span></div>
            </div>
          </div>
        `, {
          permanent: false,
          direction: 'top',
          offset: [0, -20],
          className: 'manual-vehicle-tooltip'
        })
        
        marker.addTo(map)

        const vehicleState = {
          id: vehicleId,
          path: sortedPath,
          marker: marker,
          currentPosition: { lat: initialPosition.lat, lng: initialPosition.lon },
          trail: null,
          trailPositions: [], // Start empty, will be initialized when playback starts
          speedSegments: [],
          staticTraceSegments: [],
          currentSpeed: initialPosition.speed_kmh || 0
        }
        
        vehiclesRef.current.set(vehicleId, vehicleState)
        
        // Create initial static traces only if not playing
        if (!playbackState.isPlaying) {
          createStaticTraces(vehicleState)
        }
      }
    })
  }, [map, manualVehicleData, selectedManualVehicles, createManualVehicleIcon, playbackState.isPlaying, createStaticTraces])

  const updateManualVehiclePositions = useCallback((currentTime: number, isPlaying: boolean) => {
    vehiclesRef.current.forEach((vehicle) => {
      if (!vehicle.marker || vehicle.path.length === 0) return

      const result = findPositionAtTime(vehicle.path, currentTime)
      if (!result) return

      const { position, isMoving, speed } = result
      
      // Validate position before updating marker
      if (!position || typeof position.lat !== 'number' || typeof position.lng !== 'number' ||
          isNaN(position.lat) || isNaN(position.lng)) {
        console.warn(`Invalid position for manual vehicle ${vehicle.id}:`, position)
        return
      }
      
      // Update marker position
      vehicle.marker.setLatLng([position.lat, position.lng])
      vehicle.currentPosition = position
      vehicle.currentSpeed = speed
      
      // Update marker icon
      const newIcon = createManualVehicleIcon(vehicle.id, isMoving)
      vehicle.marker.setIcon(newIcon)
      
      // Update tooltip
      vehicle.marker.setTooltipContent(`
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border: 1px solid rgba(234, 88, 12, 0.5); border-radius: 8px; padding: 8px; color: white; font-size: 11px; box-shadow: 0 4px 12px rgba(0,0,0,0.4);">
          <div style="font-weight: bold; color: #fb923c; margin-bottom: 4px;">🚗 ${vehicle.id}</div>
          <div style="font-size: 10px; color: #cbd5e1;">
            <div>Type: <span style="color: #fb923c;">Manual Vehicle</span></div>
            <div>Status: <span style="color: ${isMoving ? '#34d399">Moving' : '#fbbf24">Stationary'}</span></div>
            <div>Speed: <span style="color: #a78bfa;">${speed != null ? speed.toFixed(1) : 'N/A'}km/h</span></div>
            <div>Lat: <span style="color: #a78bfa;">${position.lat != null ? position.lat.toFixed(6) : 'N/A'}</span></div>
            <div>Lng: <span style="color: #a78bfa;">${position.lng != null ? position.lng.toFixed(6) : 'N/A'}</span></div>
          </div>
        </div>
      `)
      
      // TRAIL GENERATION during playback - Build trails from actual data points that have been passed
      if (isPlaying) {
        // Find all data points that have occurred up to the current playback time
        const passedPoints = vehicle.path.filter(point => 
          new Date(point.timestamp).getTime() <= currentTime
        )
        
        // Clear existing trail segments first
        vehicle.speedSegments.forEach(segmentData => {
          map.removeLayer(segmentData.segment)
        })
        vehicle.speedSegments = []
        
        // Create trail segments from the passed data points (last 45 seconds worth)
        const trailDurationMs = 45000
        const trailStartTime = currentTime - trailDurationMs
        const trailPoints = passedPoints.filter(point => 
          new Date(point.timestamp).getTime() >= trailStartTime
        )
        
        // Create segments between consecutive trail points
        for (let i = 0; i < trailPoints.length - 1; i++) {
          const currentPoint = trailPoints[i]
          const nextPoint = trailPoints[i + 1]
          
          // Calculate distance for movement threshold
          const distance = Math.sqrt(
            Math.pow((nextPoint.lat - currentPoint.lat) * 111000, 2) + 
            Math.pow((nextPoint.lon - currentPoint.lon) * 111000, 2)
          )
          
          // Only create segment if there's meaningful movement
          if (distance > 0.5) {
            const averageSpeed = ((currentPoint.speed_kmh || 0) + (nextPoint.speed_kmh || 0)) / 2
            const trailColor = getManualVehicleSpeedColor(averageSpeed)
            
            const segment = L.polyline(
              [[currentPoint.lat, currentPoint.lon], [nextPoint.lat, nextPoint.lon]], 
              {
                color: trailColor,
                weight: 3,
                opacity: 0.7,
                smoothFactor: 0.5,
                lineCap: 'round', 
                lineJoin: 'round',
                interactive: false,
                bubblingMouseEvents: false
              }
            )
            segment.addTo(map)
            
            vehicle.speedSegments.push({
              segment: segment,
              timestamp: new Date(nextPoint.timestamp).getTime()
            })
          }
        }
        
        console.log(`🚗 Manual vehicle ${vehicle.id}: ${trailPoints.length} trail points, ${vehicle.speedSegments.length} segments`)
      }
    })
  }, [findPositionAtTime, createManualVehicleIcon, getManualVehicleSpeedColor, map])

  // Initialize manual vehicles when data changes
  useEffect(() => {
    if (manualVehicleData.length > 0 && selectedManualVehicles.length > 0) {
      initializeManualVehicles()
    }

    return () => {
      // Cleanup
      vehiclesRef.current.forEach((vehicle) => {
        if (vehicle.marker) {
          map.removeLayer(vehicle.marker)
        }
        vehicle.speedSegments.forEach(segmentData => {
          map.removeLayer(segmentData.segment)
        })
        vehicle.staticTraceSegments.forEach(segment => {
          map.removeLayer(segment)
        })
      })
      vehiclesRef.current.clear()
    }
  }, [manualVehicleData, selectedManualVehicles, initializeManualVehicles, map])

  // Handle play/pause state changes
  useEffect(() => {
    if (playbackState.isPlaying) {
      // Clear static traces when starting playback
      vehiclesRef.current.forEach((vehicle) => {
        vehicle.staticTraceSegments.forEach(segment => {
          map.removeLayer(segment)
        })
        vehicle.staticTraceSegments = []
        
        console.log(`🚗 Starting playback for manual vehicle ${vehicle.id} at time ${new Date(playbackState.currentTime).toLocaleTimeString()}`)
      })
    } else {
      // Clear animation trails when stopping
      vehiclesRef.current.forEach((vehicle) => {
        vehicle.speedSegments.forEach(segmentData => {
          map.removeLayer(segmentData.segment)
        })
        vehicle.speedSegments = []
        
        console.log(`🚗 Stopping playback for manual vehicle ${vehicle.id}`)
      })
      
      // Create static traces when stopping
      vehiclesRef.current.forEach((vehicle) => {
        createStaticTraces(vehicle)
      })
    }
  }, [playbackState.isPlaying, map, createStaticTraces])

  // Update positions when time changes manually (scrubbing)
  useEffect(() => {
    if (!playbackState.isPlaying) {
      updateManualVehiclePositions(playbackState.currentTime, false)
    }
  }, [playbackState.currentTime, playbackState.isPlaying, updateManualVehiclePositions])

  // Update static traces when time range changes
  useEffect(() => {
    if (!playbackState.isPlaying && vehiclesRef.current.size > 0) {
      vehiclesRef.current.forEach((vehicle) => {
        createStaticTraces(vehicle)
      })
    }
  }, [timeRange, createStaticTraces, playbackState.isPlaying])

  // Update positions during playback (this will be called by the same animation loop as TruckPlayback)
  useEffect(() => {
    if (playbackState.isPlaying) {
      updateManualVehiclePositions(playbackState.currentTime, true)
    }
  }, [playbackState.currentTime, playbackState.isPlaying, updateManualVehiclePositions])

  return null
}

export default function MapComponent({
  truckData,
  notifications,
  telemetry,
  geoJsonData,
  selectedTruck,
  loading,
  timeRange,
  onTimeRangeChange,
  colorMode,
  onColorModeChange,
  manualVehicleData = [],
  selectedManualVehicles = []
}: MapComponentProps) {
  const [center] = useState<[number, number]>([-23.4321, 119.1234])
  const [mapInstance, setMapInstance] = useState<any>(null)
  const [initialBounds, setInitialBounds] = useState<any>(null)
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    isPlaying: false,
    currentTime: 0,
    speed: 1,
    duration: 0,
    startTime: 0
  })
  const [currentTruckData, setCurrentTruckData] = useState<any>(null)
  const [currentTelemetry, setCurrentTelemetry] = useState<TelemetryData | null>(null)
  const [currentSpeed, setCurrentSpeed] = useState<number>(0)
  const [currentOffPathError, setCurrentOffPathError] = useState<number>(0)
  const [isTrackingMode, setIsTrackingMode] = useState(false)
  const [trackingSmooth, setTrackingSmooth] = useState(true)
  const hasUserInteractedRef = useRef(false)
  const trackingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Performance optimization instances
  const spatialIndexRef = useRef(new SpatialIndex())
  const lodManagerRef = useRef(new LODManager())
  const perfMonitorRef = useRef(new PerformanceMonitor())
  const [currentZoom, setCurrentZoom] = useState(13)
  const [performanceStats, setPerformanceStats] = useState({ fps: 60, frameTime: 16.67 })

  const handlePlaybackStateChange = useCallback((newState: Partial<PlaybackState>) => {
    setPlaybackState(prev => {
      const updated = { ...prev, ...newState }
      if (JSON.stringify(prev) === JSON.stringify(updated)) {
        return prev
      }
      return updated
    })
  }, [])

  // Truck icon logic based on truck ID
  const getTruckIcon = useCallback((truckId: string) => {
    if (truckId.includes('CAT')) return '/icons/Haul Truck - CAT - Loaded.png'
    if (truckId.includes('Hitachi')) return '/icons/Haul Truck - Hitachi - Loaded.png'
    if (truckId.startsWith('DT')) return '/icons/Haul Truck - CAT - Loaded.png' // Default for DT series
    return '/icons/Haul Truck - CAT - Loaded.png' // Default truck icon
  }, [])
  
  // Truck tracking camera functionality
  const followTruckCamera = useCallback((lat: number, lon: number, smooth: boolean = true) => {
    if (!mapInstance || hasUserInteractedRef.current) return
    
    if (smooth) {
      // Smooth camera transition
      mapInstance.flyTo([lat, lon], Math.max(mapInstance.getZoom(), 16), {
        duration: 0.5,
        easeLinearity: 0.25
      })
    } else {
      // Instant camera movement
      mapInstance.setView([lat, lon], Math.max(mapInstance.getZoom(), 16))
    }
  }, [mapInstance])
  
  // Handle tracking mode toggle
  const toggleTrackingMode = useCallback(() => {
    setIsTrackingMode(prev => {
      const newMode = !prev
      if (newMode) {
        // Reset user interaction flag when enabling tracking
        hasUserInteractedRef.current = false
        
        // If there's current truck data, immediately center on it
        if (currentTruckData?.lat && currentTruckData?.lon) {
          followTruckCamera(currentTruckData.lat, currentTruckData.lon, true)
        }
      }
      return newMode
    })
  }, [currentTruckData, followTruckCamera])
  
  // Disable tracking when user interacts with map
  const handleUserInteraction = useCallback(() => {
    if (isTrackingMode) {
      hasUserInteractedRef.current = true
      
      // Clear any existing timeout
      if (trackingTimeoutRef.current) {
        clearTimeout(trackingTimeoutRef.current)
      }
      
      // Re-enable tracking after 5 seconds of no interaction
      trackingTimeoutRef.current = setTimeout(() => {
        hasUserInteractedRef.current = false
      }, 5000)
    }
  }, [isTrackingMode])

  // Optimized data processing with spatial indexing and LOD
  const optimizedTruckData = useMemo(() => {
    if (!truckData.length) return truckData
    
    // Record performance
    perfMonitorRef.current.recordFrame()
    
    // Apply Level of Detail based on zoom
    const simplificationFactor = lodManagerRef.current.getSimplificationFactor(currentZoom)
    const simplifiedData = lodManagerRef.current.simplifyPath(truckData, simplificationFactor)
    
    // Filter by time window for better performance during playback
    const timeFilteredData = filterByTimeWindow(simplifiedData, playbackState.currentTime)
    
    // Update spatial index
    spatialIndexRef.current.insert(timeFilteredData)
    
    return timeFilteredData
  }, [truckData, currentZoom, playbackState.currentTime])
  
  // Debounced performance stats update
  const updatePerformanceStats = useMemo(() => 
    debounce(() => {
      const stats = perfMonitorRef.current.getStats()
      setPerformanceStats({
        fps: Math.round(stats.fps),
        frameTime: Math.round(stats.avgFrameTime * 100) / 100
      })
    }, 1000)
  , [])
  
  // Monitor zoom changes for LOD
  const handleZoomChange = useCallback(throttle((zoom: number) => {
    setCurrentZoom(zoom)
    updatePerformanceStats()
  }, 100), [updatePerformanceStats])
  
  // Setup map event listeners for performance monitoring
  useEffect(() => {
    if (mapInstance) {
      const onZoom = () => handleZoomChange(mapInstance.getZoom())
      const onMove = () => updatePerformanceStats()
      
      mapInstance.on('zoom', onZoom)
      mapInstance.on('move', onMove)
      
      return () => {
        mapInstance.off('zoom', onZoom)
        mapInstance.off('move', onMove)
      }
    }
  }, [mapInstance, handleZoomChange, updatePerformanceStats])

  // Follow truck camera when data updates and tracking is enabled
  useEffect(() => {
    if (isTrackingMode && currentTruckData && currentTruckData.lat && currentTruckData.lon && playbackState.isPlaying) {
      followTruckCamera(currentTruckData.lat, currentTruckData.lon, trackingSmooth)
    }
  }, [isTrackingMode, currentTruckData, playbackState.isPlaying, followTruckCamera, trackingSmooth])
  
  // Setup map interaction listeners for tracking mode
  useEffect(() => {
    if (mapInstance && isTrackingMode) {
      mapInstance.on('zoomstart', handleUserInteraction)
      mapInstance.on('dragstart', handleUserInteraction)
      mapInstance.on('click', handleUserInteraction)
      
      return () => {
        mapInstance.off('zoomstart', handleUserInteraction)
        mapInstance.off('dragstart', handleUserInteraction)
        mapInstance.off('click', handleUserInteraction)
      }
    }
  }, [mapInstance, isTrackingMode, handleUserInteraction])

  const handleTruckDataUpdate = useCallback((truckId: string, data: any) => {
    if (truckId === selectedTruck?.id) {
      // ENHANCED DEBUGGING: Log speed gauge data reception
      console.log(`🎯 SPEED GAUGE DEBUG - Received data for ${truckId}:`)
      console.log(`   Raw data.speed: ${data.speed}`)
      console.log(`   Raw data.speed type: ${typeof data.speed}`)
      console.log(`   Current selectedTruck?.id: ${selectedTruck?.id}`)
      console.log(`   IDs match: ${truckId === selectedTruck?.id}`)
      
      setCurrentTruckData(data)
      
      // Use pre-extracted offpath error values from DataExtractionPanel
      if (data.offPathError !== undefined && data.offPathError !== null) {
        const actualOffPathError = Math.abs(data.offPathError)
        setCurrentOffPathError(actualOffPathError)
      }
      
      // Update speed from TruckPlayback data which uses pre-extracted speed
      if (data.speed !== undefined && data.speed !== null) {
        const speedValue = Math.max(0, data.speed)
        console.log(`🎯 SPEED GAUGE - Setting currentSpeed to: ${speedValue}km/h`)
        setCurrentSpeed(speedValue)
      } else {
        console.log(`🚨 SPEED GAUGE - Received undefined/null speed for ${truckId}`)
      }
    } else {
      console.log(`🔄 SPEED GAUGE - Ignoring data for ${truckId} (selected: ${selectedTruck?.id})`)
    }
  }, [selectedTruck])

  // Update current telemetry based on playback time with state persistence
  useEffect(() => {
    if (telemetry.length > 0 && playbackState.currentTime > 0) {
      // Find the most recent telemetry state at or before the current playback time
      // States persist until the next state change (last value carry forward)
      const currentPlaybackTime = playbackState.currentTime
      
      // Sort telemetry by timestamp to ensure proper order
      const sortedTelemetry = [...telemetry].sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      )
      
      // Find the most recent state for each telemetry field at or before current time
      let activeStates = {
        motion_controller: null as string | null,
        asset_activity: null as string | null,
        haulage_state: null as string | null,
        timestamp: null as string | null,
        vehicle: telemetry[0].vehicle
      }
      
      sortedTelemetry.forEach((point) => {
        const pointTime = new Date(point.timestamp).getTime()
        
        // Only consider states at or before the current playback time
        if (pointTime <= currentPlaybackTime) {
          // Update each field with the most recent value (last value carry forward)
          if (point.motion_controller !== null) {
            activeStates.motion_controller = point.motion_controller
            activeStates.timestamp = point.timestamp // Update timestamp when any field changes
          }
          if (point.asset_activity !== null) {
            activeStates.asset_activity = point.asset_activity
            activeStates.timestamp = point.timestamp
          }
          if (point.haulage_state !== null) {
            activeStates.haulage_state = point.haulage_state
            activeStates.timestamp = point.timestamp
          }
        }
      })
      
      // Only update if we found valid states
      if (activeStates.timestamp) {
        setCurrentTelemetry(activeStates as TelemetryData)
      }
    } else if (telemetry.length > 0) {
      // If no playback time set, use the latest telemetry
      const latestTelemetry = telemetry.reduce((latest, current) => 
        new Date(current.timestamp).getTime() > new Date(latest.timestamp).getTime() ? current : latest
      )
      setCurrentTelemetry(latestTelemetry)
    }
  }, [telemetry, playbackState.currentTime])

  // Update current speed based on playback time - using pre-extracted Velocity X data
  useEffect(() => {
    if (truckData.length > 0 && playbackState.currentTime > 0) {
      // Find the truck data point closest to the current playback time
      let closestPoint = truckData[0]
      let minTimeDiff = Math.abs(new Date(truckData[0].timestamp).getTime() - playbackState.currentTime)
      
      truckData.forEach((point) => {
        const timeDiff = Math.abs(new Date(point.timestamp).getTime() - playbackState.currentTime)
        if (timeDiff < minTimeDiff) {
          minTimeDiff = timeDiff
          closestPoint = point
        }
      })
      
      // Use pre-extracted Velocity X speed data (already converted to km/h in DataExtractionPanel)
      const actualSpeed = closestPoint.speed_kmh || 0
      
      setCurrentSpeed(Math.max(0, actualSpeed)) // Ensure non-negative speed
    } else if (truckData.length > 0) {
      // If no playback time set, use most recent speed data point
      const latestPoint = truckData[truckData.length - 1]
      const latestSpeed = latestPoint.speed_kmh || 0
      setCurrentSpeed(latestSpeed)
    }
  }, [truckData, playbackState.currentTime, selectedTruck])

  // Handle auto-zoom for playback mode - ONLY ONCE when truck data changes
  useEffect(() => {
    if (typeof window === 'undefined' || !L) return
    
    if (selectedTruck) {
      hasUserInteractedRef.current = false
    }
    
    if (truckData.length > 0 && mapInstance && !hasUserInteractedRef.current) {
      const validCoords = truckData.filter(d => d.lat != null && d.lon != null && !isNaN(d.lat) && !isNaN(d.lon))
      const lats = validCoords.map(d => d.lat!)
      const lngs = validCoords.map(d => d.lon!)
      
      if (lats.length > 0 && lngs.length > 0) {
        const bounds = L.latLngBounds(
          [Math.min(...lats), Math.min(...lngs)],
          [Math.max(...lats), Math.max(...lngs)]
        )
        
        if (bounds.isValid()) {
          setTimeout(() => {
            mapInstance.fitBounds(bounds, { padding: [50, 50] })
          }, 100)
        }
      }
    } else if (!selectedTruck && initialBounds && mapInstance && !hasUserInteractedRef.current) {
      // Auto-zoom to center of mine when no truck is selected
      setTimeout(() => {
        mapInstance.fitBounds(initialBounds, { padding: [50, 50] })
      }, 100)
    }
  }, [truckData, selectedTruck, mapInstance, initialBounds])

  // Track user interactions to prevent auto-zoom interference
  useEffect(() => {
    if (mapInstance) {
      const handleUserInteraction = () => {
        hasUserInteractedRef.current = true
      }

      mapInstance.on('zoomstart', handleUserInteraction)
      mapInstance.on('dragstart', handleUserInteraction)

      return () => {
        mapInstance.off('zoomstart', handleUserInteraction)
        mapInstance.off('dragstart', handleUserInteraction)
      }
    }
  }, [mapInstance])
  
  // Calculate min and max timestamps from truck data
  const timeExtent = truckData.length > 0 ? {
    min: Math.min(...truckData.map(d => new Date(d.timestamp).getTime())),
    max: Math.max(...truckData.map(d => new Date(d.timestamp).getTime()))
  } : { min: Date.now(), max: Date.now() }

  // World-Class Mining Operations Digital Display
  const MiningOperationsGaugeCluster = ({ 
    speed = 0, 
    offPathError = 0, 
    maxSpeed = 80, 
    maxOffPath = 2.0 
  }: { 
    speed: number; 
    offPathError: number;
    maxSpeed?: number;
    maxOffPath?: number;
  }) => {
    const speedPercentage = Math.min(speed / maxSpeed, 1)
    const offPathPercentage = Math.min(offPathError / maxOffPath, 1)
    
    // Professional mining operations color coding
    const getSpeedColor = (currentSpeed: number) => {
      if (currentSpeed >= 30) return '#10b981' // Emerald Green - Optimal Speed
      if (currentSpeed >= 5) return '#f59e0b' // Amber - Moderate Speed
      return '#ef4444' // Red - Slow/Stationary
    }
    
    const getOffPathColor = (error: number) => {
      if (error <= 0.8) return '#10b981' // Emerald Green - On Path
      if (error <= 1.2) return '#f59e0b' // Amber - Slight Deviation
      return '#ef4444' // Red - Significant Deviation
    }
    
    const speedColor = getSpeedColor(speed)
    const offPathColor = getOffPathColor(offPathError)
    
    return (
      <div className="flex flex-col items-center space-y-6">
        {/* Premium Mining Operations Digital Display */}
        <div className="flex space-x-6">
          {/* Speed Display - Enterprise Grade */}
          <div className="relative group">
            <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-600/50 rounded-3xl p-8 text-center shadow-2xl backdrop-blur-xl">
              {/* Speed Value */}
              <div 
                className="text-6xl font-semibold text-white leading-none tracking-tight transition-all duration-500"
                style={{ 
                  fontFamily: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
                  textShadow: `0 0 30px ${speedColor}60, 0 0 60px ${speedColor}30, 0 4px 8px rgba(0,0,0,0.5)`,
                  color: speedColor,
                  fontWeight: 600
                }}
                onClick={() => {
                  // DEBUGGING: Click gauge to log current speed state
                  console.log(`🎯 SPEED GAUGE DISPLAY - Current speed state: ${speed} (type: ${typeof speed})`)
                }}
              >
                {speed != null ? speed.toFixed(0) : '--'}
              </div>
              
              {/* Unit Label */}
              <div 
                className="text-sm font-medium tracking-[0.2em] mt-3 uppercase"
                style={{ 
                  color: '#94a3b8',
                  fontFamily: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
                  letterSpacing: '0.2em',
                  fontWeight: 500
                }}
              >
                SPEED (KM/H)
              </div>
              
              {/* Premium Status Indicator */}
              <div 
                className="absolute -top-3 -right-3 w-6 h-6 rounded-full border-3 border-slate-900 shadow-2xl transition-all duration-300 group-hover:scale-110"
                style={{ 
                  backgroundColor: speedColor,
                  boxShadow: `0 0 20px ${speedColor}80, 0 0 40px ${speedColor}40, inset 0 2px 0 rgba(255,255,255,0.4)`
                }}
              >
                <div 
                  className="absolute inset-1 rounded-full animate-pulse"
                  style={{ backgroundColor: `${speedColor}40` }}
                ></div>
              </div>
            </div>
          </div>
          
          {/* Off Path Error Display - Enterprise Grade */}
          <div className="relative group">
            <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-600/50 rounded-3xl p-8 text-center shadow-2xl backdrop-blur-xl">
              {/* Off Path Error Value */}
              <div 
                className="text-5xl font-semibold text-white leading-none tracking-tight transition-all duration-500"
                style={{ 
                  fontFamily: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
                  textShadow: `0 0 30px ${offPathColor}60, 0 0 60px ${offPathColor}30, 0 4px 8px rgba(0,0,0,0.5)`,
                  color: offPathColor,
                  fontWeight: 600
                }}
              >
                {offPathError != null ? offPathError.toFixed(2) : '--'}
              </div>
              
              {/* Unit Label */}
              <div 
                className="text-sm font-medium tracking-[0.2em] mt-3 uppercase"
                style={{ 
                  color: '#94a3b8',
                  fontFamily: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
                  letterSpacing: '0.2em',
                  fontWeight: 500
                }}
              >
                DEVIATION (M)
              </div>
              
              {/* Premium Status Indicator */}
              <div 
                className="absolute -top-3 -right-3 w-6 h-6 rounded-full border-3 border-slate-900 shadow-2xl transition-all duration-300 group-hover:scale-110"
                style={{ 
                  backgroundColor: offPathColor,
                  boxShadow: `0 0 20px ${offPathColor}80, 0 0 40px ${offPathColor}40, inset 0 2px 0 rgba(255,255,255,0.4)`
                }}
              >
                <div 
                  className="absolute inset-1 rounded-full animate-pulse"
                  style={{ backgroundColor: `${offPathColor}40` }}
                ></div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Enterprise Progress Indicators */}
        <div className="flex space-x-8">
          {/* Speed Progress Indicator */}
          <div className="flex flex-col items-center space-y-3">
            <div className="relative w-40 h-3 bg-slate-800/80 rounded-full overflow-hidden shadow-inner border border-slate-700/50">
              <div 
                className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-700/50 to-transparent"
                style={{ opacity: 0.3 }}
              ></div>
              <div 
                className="h-full rounded-full transition-all duration-1000 ease-out relative overflow-hidden"
                style={{
                  width: `${speedPercentage * 100}%`,
                  backgroundColor: speedColor,
                  boxShadow: `0 0 15px ${speedColor}80, inset 0 1px 0 rgba(255,255,255,0.4)`
                }}
              >
                <div 
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse"
                ></div>
              </div>
            </div>
            <span 
              className="text-xs font-medium tracking-wider uppercase"
              style={{ 
                color: '#64748b',
                fontFamily: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
                fontWeight: 500
              }}
            >
              SPEED STATUS
            </span>
          </div>
          
          {/* Deviation Progress Indicator */}
          <div className="flex flex-col items-center space-y-3">
            <div className="relative w-40 h-3 bg-slate-800/80 rounded-full overflow-hidden shadow-inner border border-slate-700/50">
              <div 
                className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-700/50 to-transparent"
                style={{ opacity: 0.3 }}
              ></div>
              <div 
                className="h-full rounded-full transition-all duration-1000 ease-out relative overflow-hidden"
                style={{
                  width: `${offPathPercentage * 100}%`,
                  backgroundColor: offPathColor,
                  boxShadow: `0 0 15px ${offPathColor}80, inset 0 1px 0 rgba(255,255,255,0.4)`
                }}
              >
                <div 
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse"
                ></div>
              </div>
            </div>
            <span 
              className="text-xs font-medium tracking-wider uppercase"
              style={{ 
                color: '#64748b',
                fontFamily: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
                fontWeight: 500
              }}
            >
              PATH PRECISION
            </span>
          </div>
        </div>
      </div>
    )
  }

  useEffect(() => {
    if (typeof window !== 'undefined' && L) {
      delete (L.Icon.Default.prototype as any)._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      })
    }
  }, [])

  const [isClient, setIsClient] = useState(false)
  
  useEffect(() => {
    setIsClient(true)
  }, [])
  
  if (!isClient) {
    return (
      <div className="relative w-full h-full bg-slate-900 flex items-center justify-center">
        <div className="text-white text-lg">Loading map...</div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full bg-slate-900">
      {/* Enterprise Loading Indicator */}
      {loading && (
        <div className="absolute top-6 right-6 z-10 bg-gradient-to-br from-slate-800 to-slate-900 p-4 rounded-xl shadow-2xl border border-slate-700 backdrop-blur-lg">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <div className="w-5 h-5 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <div className="absolute inset-0 w-5 h-5 border-3 border-blue-300 border-b-transparent rounded-full animate-spin animation-delay-150" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-white">Loading Truck Data</span>
              <span className="text-xs text-slate-400">Fetching real-time telemetry</span>
            </div>
          </div>
        </div>
      )}

      {/* Modern Control Panel */}
      {selectedTruck && truckData.length > 0 && (
        <div className="absolute top-6 right-6 z-10 bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-2xl w-[400px]">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className={`w-3 h-3 rounded-full ${playbackState.isPlaying ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'}`}></div>
              <h3 className="text-white font-semibold text-lg">Control Panel</h3>
            </div>
            <button
              onClick={() => onTimeRangeChange([timeExtent.min, timeExtent.max])}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Reset
            </button>
          </div>

          {/* Truck Tracking Mode */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-slate-300 text-sm font-medium">Camera Tracking</span>
              <span className="text-slate-400 text-xs">Follow truck movement</span>
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={toggleTrackingMode}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                  isTrackingMode
                    ? 'bg-green-600 text-white shadow-lg'
                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                }`}
              >
                <div className="text-lg">🎯</div>
                <span className="text-sm font-medium">
                  {isTrackingMode ? 'Tracking Active' : 'Enable Tracking'}
                </span>
                {isTrackingMode && !hasUserInteractedRef.current && (
                  <div className="w-2 h-2 bg-green-300 rounded-full animate-pulse"></div>
                )}
              </button>
              
              {isTrackingMode && (
                <button
                  onClick={() => setTrackingSmooth(!trackingSmooth)}
                  className={`px-3 py-2 rounded-lg text-xs transition-colors ${
                    trackingSmooth
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                  title={trackingSmooth ? 'Smooth camera transitions' : 'Instant camera movement'}
                >
                  {trackingSmooth ? '🎬 Smooth' : '⚡ Instant'}
                </button>
              )}
            </div>
            
            {isTrackingMode && hasUserInteractedRef.current && (
              <div className="mt-2 text-xs text-yellow-400 bg-yellow-400/10 rounded px-2 py-1">
                ⏸️ Tracking paused - Move detected (auto-resume in 5s)
              </div>
            )}
          </div>

          {/* Color Mode Selector */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-slate-300 text-sm font-medium">Trail Color Mode</span>
              <span className="text-slate-400 text-xs">Choose visualization type</span>
            </div>
            
            <div className="grid grid-cols-3 gap-2 bg-slate-800/50 rounded-lg p-1">
              <button
                onClick={() => onColorModeChange('speed')}
                className={`px-3 py-2 text-sm rounded-md transition-all duration-200 flex flex-col items-center space-y-1 ${
                  colorMode === 'speed'
                    ? 'bg-green-600 text-white shadow-lg'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                <div className="text-lg">🚗</div>
                <span className="text-xs">Speed</span>
              </button>
              
              <button
                onClick={() => onColorModeChange('motion_controller')}
                className={`px-3 py-2 text-sm rounded-md transition-all duration-200 flex flex-col items-center space-y-1 ${
                  colorMode === 'motion_controller'
                    ? 'bg-orange-600 text-white shadow-lg'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                <div className="text-lg">🎛️</div>
                <span className="text-xs">Motion</span>
              </button>
              
              <button
                onClick={() => onColorModeChange('offpath_error')}
                className={`px-3 py-2 text-sm rounded-md transition-all duration-200 flex flex-col items-center space-y-1 ${
                  colorMode === 'offpath_error'
                    ? 'bg-red-600 text-white shadow-lg'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                <div className="text-lg">📍</div>
                <span className="text-xs">Off Path</span>
              </button>
            </div>
            
            {/* Color Legend */}
            <div className="mt-3 bg-slate-800/30 rounded-lg p-3">
              <div className="text-xs text-slate-400 mb-2">Color Legend:</div>
              {colorMode === 'speed' && (
                <div className="flex items-center space-x-4 text-xs">
                  <div className="flex items-center space-x-1">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-slate-300">&gt;30 km/h</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                    <span className="text-slate-300">5-30 km/h</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <span className="text-slate-300">&lt;5 km/h</span>
                  </div>
                </div>
              )}
              {colorMode === 'motion_controller' && (
                <div className="flex items-center space-x-4 text-xs">
                  <div className="flex items-center space-x-1">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-slate-300">None</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                    <span className="text-slate-300">Speed Limit Enforcer</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <span className="text-slate-300">Others</span>
                  </div>
                </div>
              )}
              {colorMode === 'offpath_error' && (
                <div className="flex items-center space-x-4 text-xs">
                  <div className="flex items-center space-x-1">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-slate-300">0-0.8m</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                    <span className="text-slate-300">0.8-1.2m</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <span className="text-slate-300">&gt;1.2m</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Playback Controls */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-slate-300 text-sm font-medium">Playback</span>
              <span className="text-slate-400 text-sm">{playbackState.speed}x speed</span>
            </div>
            
            <div className="flex items-center justify-between">
              {/* Transport Controls */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handlePlaybackStateChange({ isPlaying: false, currentTime: playbackState.startTime || 0 })}
                  className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
                  title="Restart"
                >
                  <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>

                <button
                  onClick={() => handlePlaybackStateChange({ isPlaying: !playbackState.isPlaying })}
                  className="p-4 bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors shadow-lg"
                  title={playbackState.isPlaying ? "Pause" : "Play"}
                >
                  {playbackState.isPlaying ? (
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>

                <button
                  onClick={() => handlePlaybackStateChange({ isPlaying: false })}
                  className="p-3 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
                  title="Stop"
                >
                  <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="2"/>
                  </svg>
                </button>
              </div>

              {/* Speed Controls */}
              <div className="flex items-center space-x-1 bg-slate-800/50 rounded-lg p-1">
                {[0.5, 1, 2, 4].map((speed) => (
                  <button
                    key={speed}
                    onClick={() => handlePlaybackStateChange({ speed })}
                    className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                      playbackState.speed === speed
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-300 hover:text-white hover:bg-slate-700'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Time Range Control */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-slate-300 text-sm font-medium">Time Range</span>
              <span className="text-slate-400 text-sm">{Math.round((timeRange[1] - timeRange[0]) / 60000)}min</span>
            </div>
            
            {/* Sleek Range Slider */}
            <div className="relative h-6 mb-4">
              {/* Background track */}
              <div className="absolute top-2.5 w-full h-1 bg-slate-700 rounded-full"></div>
              
              {/* Active range */}
              <div 
                className="absolute top-2.5 h-1 bg-blue-500 rounded-full"
                style={{
                  left: `${((timeRange[0] - timeExtent.min) / (timeExtent.max - timeExtent.min)) * 100}%`,
                  width: `${((timeRange[1] - timeRange[0]) / (timeExtent.max - timeExtent.min)) * 100}%`
                }}
              />
              
              {/* Start thumb */}
              <div
                className="absolute top-1 w-4 h-4 bg-blue-500 rounded-full border-2 border-white cursor-pointer hover:bg-blue-400 transition-colors shadow-lg"
                style={{
                  left: `calc(${((timeRange[0] - timeExtent.min) / (timeExtent.max - timeExtent.min)) * 100}% - 8px)`,
                  zIndex: 10
                }}
                onMouseDown={(e) => {
                  const rect = e.currentTarget.parentElement!.getBoundingClientRect()
                  const handleMouseMove = (event: MouseEvent) => {
                    const percent = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
                    const newValue = timeExtent.min + percent * (timeExtent.max - timeExtent.min)
                    if (newValue < timeRange[1]) {
                      onTimeRangeChange([newValue, timeRange[1]])
                    }
                  }
                  const handleMouseUp = () => {
                    document.removeEventListener('mousemove', handleMouseMove)
                    document.removeEventListener('mouseup', handleMouseUp)
                  }
                  document.addEventListener('mousemove', handleMouseMove)
                  document.addEventListener('mouseup', handleMouseUp)
                }}
              />
              
              {/* End thumb */}
              <div
                className="absolute top-1 w-4 h-4 bg-blue-500 rounded-full border-2 border-white cursor-pointer hover:bg-blue-400 transition-colors shadow-lg"
                style={{
                  left: `calc(${((timeRange[1] - timeExtent.min) / (timeExtent.max - timeExtent.min)) * 100}% - 8px)`,
                  zIndex: 11
                }}
                onMouseDown={(e) => {
                  const rect = e.currentTarget.parentElement!.getBoundingClientRect()
                  const handleMouseMove = (event: MouseEvent) => {
                    const percent = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
                    const newValue = timeExtent.min + percent * (timeExtent.max - timeExtent.min)
                    if (newValue > timeRange[0]) {
                      onTimeRangeChange([timeRange[0], newValue])
                    }
                  }
                  const handleMouseUp = () => {
                    document.removeEventListener('mousemove', handleMouseMove)
                    document.removeEventListener('mouseup', handleMouseUp)
                  }
                  document.addEventListener('mousemove', handleMouseMove)
                  document.addEventListener('mouseup', handleMouseUp)
                }}
              />
            </div>

            {/* Current Playback Time Display (like movie players) */}
            <div className="flex justify-center mb-3">
              <div className="bg-slate-800/70 px-4 py-2 rounded-xl border border-slate-600/50 shadow-lg">
                <div className="flex items-center space-x-2">
                  <span className="text-slate-400 text-xs font-medium">CURRENT TIME</span>
                  <span className="font-mono text-lg text-white font-semibold">
                    {new Date(playbackState.currentTime).toLocaleTimeString('en-AU', { timeZone: 'Australia/Perth', hour12: false })}
                  </span>
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                </div>
                <div className="text-center text-slate-500 text-xs mt-1">
                  {new Date(playbackState.currentTime).toLocaleDateString()}
                </div>
              </div>
            </div>

            {/* Time Range Display */}
            <div className="flex justify-between text-sm">
              <div className="bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-700/50">
                <span className="text-slate-500 text-xs block">START</span>
                <span className="font-mono text-blue-300">{new Date(timeRange[0]).toLocaleTimeString('en-AU', { timeZone: 'Australia/Perth', hour12: false })}</span>
              </div>
              <div className="bg-slate-800/50 px-3 py-1.5 rounded-lg border border-slate-700/50">
                <span className="text-slate-500 text-xs block">END</span>
                <span className="font-mono text-blue-300">{new Date(timeRange[1]).toLocaleTimeString('en-AU', { timeZone: 'Australia/Perth', hour12: false })}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Map Container */}
      <MapContainer
        center={center}
        zoom={15}
        minZoom={5}
        maxZoom={25}
        style={{ 
          height: '100%', 
          width: '100%', 
          backgroundColor: '#0f172a'
        }}
        className="z-0"
        zoomControl={true}
        dragging={true}
        touchZoom={true}
        doubleClickZoom={true}
        scrollWheelZoom={true}
        boxZoom={true}
        keyboard={true}
        closePopupOnClick={false}
      >
        
        <MapInitializer onMapReady={setMapInstance} />
        
        {/* No tile layer - only show GeoJSON mine infrastructure */}
        
        {/* Mine Infrastructure Layer */}
        {geoJsonData && (
          <>
            <GeoJSONLayer data={geoJsonData} onBoundsCalculated={setInitialBounds} />
            
            {/* AOZ Background Layer - more visible without map tiles */}
            <GeoJSON
              data={geoJsonData}
              filter={(feature) => {
                const asiType = feature.properties?.AsiType?.toLowerCase() || ''
                return asiType.includes('aoz') && !asiType.includes('aozshapedto')
              }}
              style={(feature) => ({
                fillColor: 'rgba(255, 215, 0, 0.08)',
                weight: 1,
                opacity: 0.4,
                color: '#ffd700',
                fillOpacity: 0.08
              })}
              interactive={false}
            />
            
            {/* Main Infrastructure Shapes - clean enterprise styling */}
            <GeoJSON
              data={geoJsonData}
              filter={(feature) => {
                const asiType = feature.properties?.AsiType?.toLowerCase() || ''
                
                // Filter out unwanted features
                if (asiType.includes('vectorimage') || 
                    asiType.includes('aoz') || 
                    asiType.includes('aozshapedto') ||
                    asiType.includes('pindto') || 
                    asiType.includes('pin')) {
                  return false
                }
                
                // Filter out line features
                if (feature.geometry?.type === 'LineString' || feature.geometry?.type === 'MultiLineString') {
                  return false
                }
                
                // Filter out GeometryCollection with only LineString
                if (feature.geometry?.type === 'GeometryCollection') {
                  const hasOnlyLines = feature.geometry.geometries?.every((geom: any) => 
                    geom.type === 'LineString' || geom.type === 'MultiLineString'
                  )
                  if (hasOnlyLines) {
                    return false
                  }
                }
                return true
              }}
              style={(feature) => ({
                fillColor: 'rgba(148, 163, 184, 0.25)',
                weight: 2,
                opacity: 0.8,
                color: '#94a3b8',
                fillOpacity: 0.25
              })}
              onEachFeature={(feature, layer) => {
                // Enterprise-grade hover interactions
                layer.on({
                  mouseover: (e) => {
                    const target = e.target
                    if (target.setStyle) {
                      target.setStyle({
                        weight: 2,
                        color: '#3b82f6',
                        fillOpacity: 0.25,
                        fillColor: 'rgba(59, 130, 246, 0.2)'
                      })
                      if (target.bringToFront) {
                        target.bringToFront()
                      }
                    }
                  },
                  mouseout: (e) => {
                    const target = e.target
                    if (target.setStyle) {
                      target.setStyle({
                        weight: 1,
                        color: '#64748b',
                        fillOpacity: 0.15,
                        fillColor: 'rgba(148, 163, 184, 0.15)'
                      })
                    }
                  },
                  click: (e) => {
                    e.originalEvent?.stopPropagation()
                    
                    const target = e.target
                    if (target.setStyle) {
                      target.setStyle({
                        weight: 3,
                        color: '#0ea5e9',
                        fillOpacity: 0.3,
                        fillColor: 'rgba(14, 165, 233, 0.25)'
                      })
                    }
                    
                    // Enterprise popup with infrastructure info
                    const props = feature.properties || {}
                    const shapeName = props.AsiName || props.Name || props.name || 'Infrastructure'
                    const shapeType = props.AsiType || props.Type || props.type || 'Unknown'
                    // Convert speed limit from m/s to km/h with 60 km/h max
                    const rawSpeedLimit = props.AsiSpeedLimit || props.SpeedLimit || props.speedLimit || props.speed_limit
                    let speedLimit = 'N/A'
                    if (rawSpeedLimit && !isNaN(parseFloat(rawSpeedLimit))) {
                      const speedKmh = parseFloat(rawSpeedLimit) * 3.6 // Convert m/s to km/h
                      speedLimit = Math.min(speedKmh, 60).toFixed(1) + ' km/h' // Cap at 60 km/h, one decimal
                    }
                    
                    const popupContent = `
                      <div class="p-4 bg-gradient-to-br from-slate-800 to-slate-900 text-white rounded-lg border border-slate-600">
                        <h4 class="font-bold mb-2 text-blue-300 text-lg">${shapeName}</h4>
                        <div class="space-y-2 text-sm">
                          <div class="flex justify-between">
                            <span class="text-slate-400">Type:</span>
                            <span class="font-medium">${shapeType}</span>
                          </div>
                          <div class="flex justify-between">
                            <span class="text-slate-400">Speed Limit:</span>
                            <span class="font-medium text-yellow-300">${speedLimit}</span>
                          </div>
                        </div>
                      </div>
                    `
                    L.popup({
                      className: 'enterprise-popup'
                    })
                      .setLatLng(e.latlng)
                      .setContent(popupContent)
                      .openOn(e.target._map)
                  }
                })
              }}
            />
          </>
        )}


        {/* Manual Vehicle Playback */}
        {manualVehicleData.length > 0 && selectedManualVehicles.length > 0 && (
          <ManualVehiclePlayback 
            manualVehicleData={manualVehicleData}
            selectedManualVehicles={selectedManualVehicles}
            mapInstance={mapInstance}
            playbackState={playbackState}
            timeRange={timeRange}
                  />
        )}

        {/* Notification Pins */}
        {notifications.length > 0 && truckData.length > 0 && (
          <NotificationPins 
            notifications={notifications}
            truckData={truckData}
            timeRange={timeRange}
            telemetry={telemetry}
            currentTelemetry={currentTelemetry}
          />
        )}

      </MapContainer>

      {/* Playback controls are now integrated into the unified control panel above */}

      {/* World-Class Mining Operations Status Panel */}
      {selectedTruck && (
        <div className="absolute bottom-6 left-6 z-10 bg-gradient-to-br from-slate-900/98 via-slate-800/95 to-slate-900/98 p-5 rounded-2xl shadow-2xl border border-slate-600/30 backdrop-blur-2xl max-w-md">
          {/* Premium Header with Enterprise Branding */}
          <div className="flex items-center mb-4">
            <div className="relative mr-3">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-xl border border-blue-400/20">
                <Image 
                  src={getTruckIcon(selectedTruck.id)} 
                  alt="Mining Truck" 
                  width={24} 
                  height={24}
                  className="filter brightness-0 invert"
                />
                <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-slate-900 transition-all duration-300 ${
                  currentTruckData?.isMoving 
                    ? 'bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50' 
                    : 'bg-amber-500 shadow-lg shadow-amber-500/50'
                }`}>
                  <div className={`absolute inset-0.5 rounded-full animate-pulse ${
                    currentTruckData?.isMoving ? 'bg-emerald-400/60' : 'bg-amber-400/60'
                  }`}></div>
                </div>
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-2 mb-1">
                <Image 
                  src={getTruckIcon(selectedTruck.id)} 
                  alt="Mining Truck Icon" 
                  width={16} 
                  height={16}
                  className="filter brightness-0 invert opacity-80"
                />
                <h3 
                  className="text-xl font-black text-white tracking-wide"
                  style={{ 
                    fontFamily: '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif',
                    textShadow: '0 2px 4px rgba(0,0,0,0.5)'
                  }}
                >
                  UNIT {selectedTruck?.id}
                </h3>
              </div>
              <div 
                className="text-xs font-bold tracking-wider uppercase"
                style={{ 
                  color: '#64748b',
                  fontFamily: '"Inter", system-ui, sans-serif',
                  letterSpacing: '0.15em'
                }}
              >
                {currentTruckData?.isMoving ? 'ACTIVE OPERATION' : 'STANDBY MODE'}
              </div>
            </div>
          </div>
          
          {/* World-Class Digital Gauge Cluster */}
          <div className="text-center mb-4">
            <h4 
              className="text-xs font-bold tracking-wider mb-3 uppercase flex items-center justify-center space-x-2"
              style={{ 
                color: '#3b82f6',
                fontFamily: '"Inter", system-ui, sans-serif',
                letterSpacing: '0.2em'
              }}
            >
              <Image 
                src={getTruckIcon(selectedTruck.id)} 
                alt="Mining Truck Status" 
                width={14} 
                height={14}
                className="filter brightness-0 invert opacity-90"
              />
              <span>REAL-TIME TELEMETRY</span>
            </h4>
            <MiningOperationsGaugeCluster speed={currentSpeed} offPathError={currentOffPathError} />
          </div>

          {/* Enterprise Telemetry Status */}
          {currentTelemetry && (
            <div className="border-t border-slate-700/30 pt-4">
              <h4 
                className="text-xs font-bold tracking-wider mb-3 uppercase"
                style={{ 
                  color: '#3b82f6',
                  fontFamily: '"Inter", system-ui, sans-serif',
                  letterSpacing: '0.2em'
                }}
              >
                OPERATIONAL STATUS
              </h4>
              <div className="space-y-2">
                <div className="flex justify-between items-center py-1.5 px-2.5 bg-slate-800/50 rounded-lg border border-slate-700/30">
                  <span 
                    className="text-xs font-bold tracking-wide uppercase"
                    style={{ 
                      color: '#94a3b8',
                      fontFamily: '"Inter", system-ui, sans-serif'
                    }}
                  >
                    MOTION CONTROL
                  </span>
                  <span 
                    className="text-xs font-black px-2 py-1 rounded-md"
                    style={{ 
                      color: '#f59e0b',
                      backgroundColor: 'rgba(245, 158, 11, 0.15)',
                      fontFamily: '"JetBrains Mono", monospace',
                      border: '1px solid rgba(245, 158, 11, 0.3)'
                    }}
                  >
                    {currentTelemetry.motion_controller || 'NONE'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1.5 px-2.5 bg-slate-800/50 rounded-lg border border-slate-700/30">
                  <span 
                    className="text-xs font-bold tracking-wide uppercase"
                    style={{ 
                      color: '#94a3b8',
                      fontFamily: '"Inter", system-ui, sans-serif'
                    }}
                  >
                    ASSET STATUS
                  </span>
                  <span 
                    className="text-xs font-black px-2 py-1 rounded-md"
                    style={{ 
                      color: '#8b5cf6',
                      backgroundColor: 'rgba(139, 92, 246, 0.15)',
                      fontFamily: '"JetBrains Mono", monospace',
                      border: '1px solid rgba(139, 92, 246, 0.3)'
                    }}
                  >
                    {currentTelemetry.asset_activity || 'UNKNOWN'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1.5 px-2.5 bg-slate-800/50 rounded-lg border border-slate-700/30">
                  <span 
                    className="text-xs font-bold tracking-wide uppercase"
                    style={{ 
                      color: '#94a3b8',
                      fontFamily: '"Inter", system-ui, sans-serif'
                    }}
                  >
                    HAULAGE MODE
                  </span>
                  <span 
                    className="text-xs font-black px-2 py-1 rounded-md"
                    style={{ 
                      color: '#06b6d4',
                      backgroundColor: 'rgba(6, 182, 212, 0.15)',
                      fontFamily: '"JetBrains Mono", monospace',
                      border: '1px solid rgba(6, 182, 212, 0.3)'
                    }}
                  >
                    {currentTelemetry.haulage_state || 'IDLE'}
                  </span>
                </div>
              </div>
              <div className="text-center mt-3 pt-2 border-t border-slate-700/20">
                <span 
                  className="text-xs font-medium"
                  style={{ 
                    color: '#64748b',
                    fontFamily: '"Inter", system-ui, sans-serif'
                  }}
                >
                  Last Updated: {currentTelemetry.timestamp ? new Date(currentTelemetry.timestamp).toLocaleTimeString('en-AU', { timeZone: 'Australia/Perth', hour12: false }) : 'No Data'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Real-time Vehicle Gauge Dashboard */}
      {selectedTruck && truckData.length > 0 && (
        <VehicleGaugeDashboard
          selectedTruck={selectedTruck.id}
          truckData={truckData}
          currentTime={playbackState.currentTime}
          telemetry={telemetry}
          alarms={notifications.filter(n => n.alarm_type).map(n => ({
            vehicle: n.vehicle,
            timestamp: n.timestamp,
            alarm_type: n.alarm_type || 'notification',
            message: n.message,
            severity: n.severity || 'Low',
            notification_title: n.title,
            location: n.location,
            speed_at_alarm_kmh: 0,
            states: {
              motion_controller: undefined,
              haulage_state: undefined,
              asset_activity: undefined
            }
          }))}
          isPlaying={playbackState.isPlaying}
        />
      )}
    </div>
  )
}