'use client'

import React, { useMemo, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

// Dynamic imports for Leaflet components to prevent SSR issues
const Marker = dynamic(() => import('react-leaflet').then(mod => ({ default: mod.Marker })), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then(mod => ({ default: mod.Popup })), { ssr: false })

// Leaflet import for custom icons
let L: any = null
if (typeof window !== 'undefined') {
  L = require('leaflet')
}

export interface AlarmData {
  vehicle_id: string
  timestamp: string
  alarm_type: string
  message: string
  severity: 'info' | 'warning' | 'error' | 'critical'
  location?: {
    latitude: number
    longitude: number
  }
  speed_at_alarm_kmh?: number
  states?: {
    motion_controller?: string
    asset_activity?: string
    haulage_state?: string
  }
}

interface ClusteredAlarm {
  id: string
  latitude: number
  longitude: number
  alarms: AlarmData[]
  timestamp: string // Representative timestamp
}

interface AlarmPinLayerProps {
  alarms: AlarmData[]
  showAlarms: boolean
  clusterRadius?: number // Meters within which to cluster alarms
  timeClusterSeconds?: number // Seconds within which to cluster alarms
}

// Single alarm color - distinct from truck colors (trucks use blue #3b82f6 and red #ef4444)
const ALARM_COLOR = '#f59e0b' // Amber yellow - distinct from both truck colors

// Custom alarm marker icons - GPS pin style with triangles
const createAlarmIcon = (count: number = 1) => {
  if (!L) return null

  const isCluster = count > 1
  const size = isCluster ? 20 : 16 // Smaller than vehicle icons (vehicle icons are typically 24px)

  return L.divIcon({
    className: 'custom-alarm-icon',
    html: `
      <div class="alarm-pin ${isCluster ? 'clustered' : ''}" 
           style="
             position: relative;
             width: ${size}px;
             height: ${size}px;
             display: flex;
             align-items: center;
             justify-content: center;
           ">
        <!-- GPS Pin shape with triangle pointer -->
        <div style="
          position: relative;
          width: ${size}px;
          height: ${size}px;
          background-color: ${ALARM_COLOR};
          border: 2px solid white;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          box-shadow: 0 2px 4px rgba(0,0,0,0.3);
        "></div>
        <!-- Icon inside the pin -->
        <div style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -60%);
          font-size: ${isCluster ? '10px' : '8px'};
          color: white;
          font-weight: bold;
          text-shadow: 0 1px 2px rgba(0,0,0,0.5);
        ">${isCluster ? count : '⚠'}</div>
        ${isCluster ? `<div style="
          position: absolute;
          bottom: -6px;
          right: -6px;
          background: white;
          color: ${ALARM_COLOR};
          border-radius: 50%;
          width: 12px;
          height: 12px;
          font-size: 8px;
          font-weight: bold;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 1px 2px rgba(0,0,0,0.2);
        ">⚠</div>` : ''}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size * 0.3, size * 0.9], // Point of the pin
    popupAnchor: [0, -size]
  })
}

// Calculate distance between two points in meters
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371000 // Earth's radius in meters
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// Cluster alarms by proximity and time
const clusterAlarms = (
  alarms: AlarmData[], 
  clusterRadius: number, 
  timeClusterSeconds: number
): ClusteredAlarm[] => {
  const clustered: ClusteredAlarm[] = []
  const used = new Set<number>()

  alarms.forEach((alarm, index) => {
    if (used.has(index) || !alarm.location) return

    const cluster: AlarmData[] = [alarm]
    const alarmTime = new Date(alarm.timestamp).getTime()
    used.add(index)

    // Find nearby alarms within radius and time window
    alarms.forEach((otherAlarm, otherIndex) => {
      if (used.has(otherIndex) || !otherAlarm.location || index === otherIndex) return

      const otherTime = new Date(otherAlarm.timestamp).getTime()
      const timeDiff = Math.abs(alarmTime - otherTime) / 1000 // Convert to seconds

      if (timeDiff <= timeClusterSeconds) {
        const distance = calculateDistance(
          alarm.location!.latitude,
          alarm.location!.longitude,
          otherAlarm.location!.latitude,
          otherAlarm.location!.longitude
        )

        if (distance <= clusterRadius) {
          cluster.push(otherAlarm)
          used.add(otherIndex)
        }
      }
    })

    // Use centroid for cluster position
    const avgLat = cluster.reduce((sum, a) => sum + a.location!.latitude, 0) / cluster.length
    const avgLon = cluster.reduce((sum, a) => sum + a.location!.longitude, 0) / cluster.length

    // Use most recent timestamp
    const mostRecent = cluster.reduce((prev, curr) => 
      new Date(curr.timestamp).getTime() > new Date(prev.timestamp).getTime() ? curr : prev
    )

    clustered.push({
      id: `cluster-${index}-${cluster.length}`,
      latitude: avgLat,
      longitude: avgLon,
      alarms: cluster.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
      timestamp: mostRecent.timestamp
    })
  })

  return clustered
}

// Format timestamp for display
const formatTimestamp = (timestamp: string): string => {
  try {
    const date = new Date(timestamp)
    return date.toLocaleString('en-AU', {
      timeZone: 'Australia/Perth',
      hour12: false,
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  } catch {
    return 'Invalid timestamp'
  }
}

// Alarm popup content
const AlarmPopupContent = ({ cluster }: { cluster: ClusteredAlarm }) => {
  const isMultiple = cluster.alarms.length > 1

  return (
    <div className="alarm-popup min-w-[280px] max-w-[320px]">
      <div className="bg-gray-900 rounded-lg p-3 text-white">
        {/* Header */}
        <div className="border-b border-gray-700 pb-2 mb-3">
          {isMultiple ? (
            <>
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-white">
                  Multiple Alarms ({cluster.alarms.length})
                </h4>
                <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-600">
                  ALARM
                </span>
              </div>
              <p className="text-sm text-gray-400 mt-1">
                Clustered alarms in close proximity
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-white">
                  {cluster.alarms[0].vehicle_id}
                </h4>
                <span className="px-2 py-1 rounded text-xs font-medium bg-yellow-600">
                  ALARM
                </span>
              </div>
              <p className="text-sm text-gray-400">
                {cluster.alarms[0].alarm_type}
              </p>
            </>
          )}
        </div>

        {/* Alarm Details */}
        <div className="space-y-3 max-h-60 overflow-y-auto">
          {cluster.alarms.map((alarm, index) => (
            <div key={`${alarm.vehicle_id}-${alarm.timestamp}-${index}`} 
                 className={`${isMultiple ? 'border-l-4 border-yellow-500 pl-3 py-2' : ''}`}>
              
              {isMultiple && (
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-white text-sm">{alarm.vehicle_id}</span>
                  <span className="text-xs text-gray-400">
                    ⚠ alarm
                  </span>
                </div>
              )}

              <div className="space-y-1 text-sm">
                <div className="text-gray-300">{alarm.message}</div>
                
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
                  <div>
                    <span className="font-medium">Time:</span><br />
                    {formatTimestamp(alarm.timestamp)}
                  </div>
                  <div>
                    <span className="font-medium">Speed:</span><br />
                    {alarm.speed_at_alarm_kmh?.toFixed(1) || 'N/A'} km/h
                  </div>
                </div>

                {/* Vehicle States */}
                {alarm.states && (
                  <div className="mt-2 space-y-1">
                    <div className="text-xs font-medium text-gray-400">Vehicle States:</div>
                    <div className="grid grid-cols-1 gap-1 text-xs">
                      {alarm.states.motion_controller && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Motion:</span>
                          <span className="text-white capitalize">
                            {alarm.states.motion_controller.toLowerCase()}
                          </span>
                        </div>
                      )}
                      {alarm.states.asset_activity && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Activity:</span>
                          <span className="text-white capitalize">
                            {alarm.states.asset_activity.toLowerCase()}
                          </span>
                        </div>
                      )}
                      {alarm.states.haulage_state && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Haulage:</span>
                          <span className="text-white capitalize">
                            {alarm.states.haulage_state.toLowerCase()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Separator for multiple alarms */}
              {isMultiple && index < cluster.alarms.length - 1 && (
                <hr className="border-gray-700 mt-3" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function AlarmPinLayer({
  alarms,
  showAlarms,
  clusterRadius = 50, // 50 meters
  timeClusterSeconds = 1 // 1 second
}: AlarmPinLayerProps) {
  // Debug logging for props changes
  useEffect(() => {
    console.log('[AlarmPinLayer] Props updated:', {
      showAlarms,
      alarmCount: alarms.length,
      clusterRadius,
      timeClusterSeconds,
      timestamp: new Date().toISOString()
    })
  }, [alarms, showAlarms, clusterRadius, timeClusterSeconds])
  // Filter alarms that have location data
  const alarmsWithLocation = useMemo(() => {
    return alarms.filter(alarm => 
      alarm.location && 
      typeof alarm.location.latitude === 'number' && 
      typeof alarm.location.longitude === 'number' &&
      !isNaN(alarm.location.latitude) && 
      !isNaN(alarm.location.longitude)
    )
  }, [alarms])

  // Cluster the alarms
  const clusteredAlarms = useMemo(() => {
    if (!showAlarms || alarmsWithLocation.length === 0) {
      return []
    }
    return clusterAlarms(alarmsWithLocation, clusterRadius, timeClusterSeconds)
  }, [alarmsWithLocation, showAlarms, clusterRadius, timeClusterSeconds])

  if (!showAlarms) {
    console.log('[AlarmPinLayer] Not showing alarms - showAlarms is false')
    return null
  }
  
  if (clusteredAlarms.length === 0) {
    console.log('[AlarmPinLayer] Not showing alarms - no clustered alarms available', {
      originalAlarms: alarms.length,
      alarmsWithLocation: alarmsWithLocation.length
    })
    return null
  }
  
  console.log('[AlarmPinLayer] Rendering', clusteredAlarms.length, 'alarm clusters')

  return (
    <>
      {clusteredAlarms.map((cluster) => (
        <Marker
          key={cluster.id}
          position={[cluster.latitude, cluster.longitude]}
          icon={createAlarmIcon(cluster.alarms.length)}
          eventHandlers={{
            click: () => {
              // Alarm pin clicked - popup will show automatically
            }
          }}
        >
          <Popup
            closeButton={true}
            autoClose={false}
            closeOnClick={false}
            className="alarm-popup-container"
            maxWidth={340}
          >
            <AlarmPopupContent cluster={cluster} />
          </Popup>
        </Marker>
      ))}

      {/* Custom CSS for alarm popups */}
      <style jsx global>{`
        .alarm-popup-container .leaflet-popup-content-wrapper {
          background: transparent !important;
          box-shadow: none !important;
          padding: 0 !important;
          border-radius: 8px !important;
        }
        
        .alarm-popup-container .leaflet-popup-content {
          margin: 0 !important;
          background: transparent !important;
        }
        
        .alarm-popup-container .leaflet-popup-tip {
          background: #111827 !important;
          border: 1px solid #374151 !important;
        }
        
        .custom-alarm-icon {
          background: transparent !important;
          border: none !important;
        }
        
        .alarm-marker {
          animation: pulse 2s infinite;
        }
        
        .alarm-marker.clustered {
          animation: pulse 1.5s infinite;
        }
        
        @keyframes pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
          }
          70% {
            box-shadow: 0 0 0 10px rgba(239, 68, 68, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
          }
        }
      `}</style>
    </>
  )
}