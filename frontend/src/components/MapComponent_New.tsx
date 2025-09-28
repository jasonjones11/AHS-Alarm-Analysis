'use client'

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { createComponentLogger } from '@/utils/frontendLogger'
import LeftSidebar from './LeftSidebar'
import RightSidebar from './RightSidebar'
import { PlaybackEngine, TruckPosition } from '@/utils/PlaybackEngine'
import TrailColorModeSelector, { ColorMode, getTrailColor } from './TrailColorModeSelector'
import AlarmPinLayer, { AlarmData } from './AlarmPinLayer'
import DistanceMeasurementTool from './DistanceMeasurementTool'
import Image from 'next/image'

// Dynamic imports for Leaflet to prevent SSR issues
const MapContainer = dynamic(() => import('react-leaflet').then(mod => ({ default: mod.MapContainer })), { ssr: false })
const GeoJSON = dynamic(() => import('react-leaflet').then(mod => ({ default: mod.GeoJSON })), { ssr: false })
const Polyline = dynamic(() => import('react-leaflet').then(mod => ({ default: mod.Polyline })), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(mod => ({ default: mod.Marker })), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then(mod => ({ default: mod.Popup })), { ssr: false })

// Simple GPS trace smoothing function
const smoothGPSTrace = (points: [number, number][]): [number, number][] => {
  if (!points || points.length < 3) return points
  return points
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

// Types for vehicle data
interface VehicleInfo {
  vehicle_id: string
  vehicle_type: 'autonomous' | 'manual'
  data_points: number
  time_range: {
    start: string
    end: string
  }
}

interface PlaybackDataPoint {
  vehicle_id: string
  timestamp: string
  latitude: number
  longitude: number
  speed_kmh: number
  offpath_deviation?: number
  states?: {
    motion_controller?: string
    asset_activity?: string
    haulage_state?: string
  }
  position_data?: any
}

interface MapComponentProps {
  availableVehicles: VehicleInfo[]
  geoJsonData?: any
  onVehicleTracesUpdate?: (traces: Map<string, PlaybackDataPoint[]>) => void
  onLoadingUpdate?: (loading: Set<string>) => void
  fitMapRef?: React.MutableRefObject<(() => void) | null>
  // Playback state from external controls
  externalPlaybackState?: {
    isPlaying: boolean
    isStopped: boolean
  }
}

// Enhanced position data with hover information
interface HoverInfo {
  vehicle_id: string
  timestamp: string
  speed_kmh: number
  latitude: number
  longitude: number
  offpath_deviation?: number
  states?: {
    motion_controller?: string
    asset_activity?: string
    haulage_state?: string
  }
  position: [number, number]
}

// Utility function to ensure speed is in km/h
const ensureSpeedInKmh = (speed: number | undefined): number => {
  if (speed === undefined || speed === null || isNaN(speed)) return 0
  
  // If speed is very small (likely in m/s), convert to km/h
  // Most vehicle speeds in km/h should be > 1, in m/s would be < 1 for low speeds
  // This is a heuristic - ideally the backend should provide consistent units
  if (speed < 0.1) {
    return speed * 3.6  // Convert m/s to km/h
  }
  
  return speed // Already in km/h
}

// FIX 6: Error Fallback Component for engine initialization failures
const ErrorFallback = ({ error, onRetry }: { error: Error; onRetry: () => void }) => (
  <div className="absolute inset-0 bg-red-900/90 flex flex-col items-center justify-center text-white p-4 z-50 rounded-lg">
    <h3 className="text-xl font-bold mb-2">Playback Engine Error</h3>
    <p className="mb-4 text-center">{error.message}</p>
    <button
      onClick={onRetry}
      className="px-4 py-2 bg-white text-red-900 rounded hover:bg-gray-200 transition-colors"
    >
      Retry
    </button>
  </div>
)

export default function MapComponent({ 
  availableVehicles, 
  geoJsonData, 
  onVehicleTracesUpdate,
  onLoadingUpdate,
  fitMapRef,
  externalPlaybackState
}: MapComponentProps) {
  // Component logger for debugging - FIX: Use useMemo to prevent recreation on every render
  const logger = useMemo(() => createComponentLogger('MapComponent_New'), [])
  
  // State for selected vehicles and their traces
  const [selectedVehicles, setSelectedVehicles] = useState<Set<string>>(new Set())
  const [vehicleTraces, setVehicleTraces] = useState<Map<string, PlaybackDataPoint[]>>(new Map())
  const [loading, setLoading] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  
  // Track previous values to detect changes for parent callbacks
  const prevLoadingRef = useRef<Set<string>>(new Set())
  const prevTracesRef = useRef<Map<string, PlaybackDataPoint[]>>(new Map())
  
  // Performance optimization refs
  const lastPositionUpdateRef = useRef<number>(0)
  
  // Advanced playback states
  const [playbackEngine, setPlaybackEngine] = useState<PlaybackEngine | null>(null)
  const [currentTruckPositions, setCurrentTruckPositions] = useState<TruckPosition[]>([])
  const [isPlaybackMode, setIsPlaybackMode] = useState<boolean>(false)
  const [isPlaying, setIsPlaying] = useState<boolean>(false)
  const [isStopped, setIsStopped] = useState<boolean>(true)
  const [selectedTruck, setSelectedTruck] = useState<string | null>(null)
  const [followingTruck, setFollowingTruck] = useState<string | null>(null)

  // Use external playback state if provided, otherwise use local state
  const effectiveIsPlaying = externalPlaybackState?.isPlaying ?? isPlaying
  const effectiveIsStopped = externalPlaybackState?.isStopped ?? isStopped


  
  // Trace history for moving trucks (1 minute behind each truck)
  const [truckTraceHistories, setTruckTraceHistories] = useState<Map<string, TruckPosition[]>>(new Map())
  
  // Playback time range controls
  const [playbackStartTime, setPlaybackStartTime] = useState<number>(0)
  const [playbackEndTime, setPlaybackEndTime] = useState<number>(0)
  const [globalTimeRange, setGlobalTimeRange] = useState<{start: number, end: number}>({start: 0, end: 0})
  
  // Trail visualization states
  const [colorMode, setColorMode] = useState<ColorMode>('speed')
  const [showAlarms, setShowAlarms] = useState<boolean>(true)
  const [alarmFilter, setAlarmFilter] = useState<string>('all')
  const [trailOpacity, setTrailOpacity] = useState<number>(0.8)
  const [alarms, setAlarms] = useState<AlarmData[]>([])
  
  // Distance measurement tool state
  const [isDistanceToolActive, setIsDistanceToolActive] = useState<boolean>(false)
  
  // Get unique alarm types for filter dropdown
  const availableAlarmTypes = useMemo(() => {
    const types = new Set<string>()
    alarms.forEach(alarm => {
      if (alarm.message && alarm.message.trim()) {
        types.add(alarm.message)
      }
    })
    return Array.from(types).sort()
  }, [alarms])
  
  // Handle show alarms change - with debugging and proper state management
  const handleShowAlarmsChange = useCallback((show: boolean) => {
    logger.userAction('alarm-visibility-toggle', {
      show, 
      currentShowAlarms: showAlarms, 
      timestamp: new Date().toISOString() 
    })
    
    // Force state update using functional update to prevent stale closures
    setShowAlarms(() => {
      logger.info('alarm-state-update', 'Show alarms state updated', { show })
      return show
    })
    
    logger.userAction('toggle-alarms', `Alarms ${show ? 'enabled' : 'disabled'}`)
  }, []) // FIX: Remove logger dependency since it's now stable
  
  // Handle alarm filter change - with debugging and proper state management
  const handleAlarmFilterChange = useCallback((filter: string) => {
    logger.userAction('alarm-filter-change', {
      filter, 
      currentFilter: alarmFilter, 
      timestamp: new Date().toISOString() 
    })
    
    // Force state update using functional update to prevent stale closures
    setAlarmFilter(() => {
      logger.info('alarm-filter-update', 'Alarm filter state updated', { filter })
      return filter
    })
    
    logger.userAction('filter-alarms', `Alarm filter changed to: ${filter}`)
  }, []) // FIX: Remove logger dependency since it's now stable
  
  // Filter alarms based on selected filter - with debugging
  const filteredAlarms = useMemo(() => {
    logger.debug('alarm-filtering', 'Filtering alarms', {
      totalAlarms: alarms.length,
      alarmFilter,
      timestamp: new Date().toISOString()
    })
    
    if (alarmFilter === 'all') {
      logger.info('alarm-display', 'Showing all alarms', { count: alarms.length })
      return alarms
    }
    
    const filtered = alarms.filter(alarm => alarm.message === alarmFilter)
    logger.debug('alarm-filtered', 'Alarms filtered', {
      filterValue: alarmFilter,
      matchingAlarms: filtered.length,
      sampleAlarmMessages: alarms.slice(0, 3).map(a => a.message)
    })
    return filtered
  }, [alarms, alarmFilter])
  
  // Removed hover functionality for better performance - using click-based tooltips instead
  
  // Panel visibility state
  const [isPanelCollapsed, setIsPanelCollapsed] = useState<boolean>(false)
  const [isPlaybackPanelCollapsed, setIsPlaybackPanelCollapsed] = useState<boolean>(false)
  
  // Map interaction mode state
  const [mapInteractionMode, setMapInteractionMode] = useState<'traces' | 'shapes'>('traces')
  const [enableMapShapeProperties, setEnableMapShapeProperties] = useState<boolean>(true)
  const [enableTraceTooltips, setEnableTraceTooltips] = useState<boolean>(true)
  const [selectedTracePoint, setSelectedTracePoint] = useState<{
    vehicleId: string
    point: PlaybackDataPoint
    position: [number, number]
  } | null>(null)

  // Create refs for accessing current state in event handlers (prevents closure issues)
  const effectiveIsPlayingRef = useRef(effectiveIsPlaying)
  const effectiveIsStoppedRef = useRef(effectiveIsStopped)
  const enableMapShapePropertiesRef = useRef(enableMapShapeProperties)
  const enableTraceTooltipsRef = useRef(enableTraceTooltips)

  // Update refs when values change
  useEffect(() => {
    effectiveIsPlayingRef.current = effectiveIsPlaying
    effectiveIsStoppedRef.current = effectiveIsStopped
    enableMapShapePropertiesRef.current = enableMapShapeProperties
    enableTraceTooltipsRef.current = enableTraceTooltips
  }, [effectiveIsPlaying, effectiveIsStopped, enableMapShapeProperties, enableTraceTooltips])
  
  // Log component mounting and cleanup
  useEffect(() => {
    logger.mounted({ availableVehiclesCount: availableVehicles.length, hasGeoJsonData: !!geoJsonData })
    
    // Cleanup function to prevent memory leaks
    return () => {
      logger.unmounted()
      
      // Clean up playback engine
      if (playbackEngine) {
        try {
          playbackEngine.destroy()
          logger.info('component-cleanup', 'Playback engine destroyed on unmount')
        } catch (error) {
          logger.error('component-cleanup', 'Error destroying playback engine on unmount', error as Error)
        }
      }
      
      // Clear refs
      if (currentEngineRef.current) {
        currentEngineRef.current = null
      }
    }
  }, [])
  
  // Automatically disable interactive tools during playback for performance
  useEffect(() => {
    if (isPlaying) {
      if (isDistanceToolActive) {
        setIsDistanceToolActive(false)
        logger.userAction('auto-disable-distance-tool', 'Distance tool auto-disabled during playback for performance')
      }
      if (selectedTracePoint) {
        setSelectedTracePoint(null)
        logger.userAction('auto-close-trace-tooltip', 'Trace tooltip auto-closed during playback for performance')
      }
    }
  }, [isPlaying, isDistanceToolActive, selectedTracePoint, logger])
  
  // Map reference
  const mapRef = useRef<any>(null)
  
  // Default map center for Pilbara mining operations (close to actual truck coordinates)
  const DEFAULT_CENTER: [number, number] = [-22.4569, 119.9025]
  const DEFAULT_ZOOM = 14
  
  // Colors for different vehicle types
  const VEHICLE_COLORS = {
    autonomous: '#2563eb', // Blue for autonomous trucks
    manual: '#dc2626',     // Red for manual vehicles
  }
  
  // Get vehicle info by ID
  const getVehicleInfo = useCallback((vehicleId: string) => {
    return availableVehicles.find(v => v.vehicle_id === vehicleId)
  }, [availableVehicles])
  
  // Load alarm data for a vehicle
  const loadVehicleAlarms = useCallback(async (vehicleId: string) => {
    try {
      logger.info('load-alarms', 'Loading alarm data', { vehicleId })
      const response = await fetch(`http://127.0.0.1:9500/vehicles/${vehicleId}/alarms`)
      
      if (response.ok) {
        const data = await response.json()
        const alarmData: AlarmData[] = (data.alarms || []).map((alarm: any) => ({
          vehicle_id: vehicleId,
          timestamp: alarm.timestamp,
          alarm_type: alarm.alarm_type || 'Unknown',
          message: alarm.message || 'No message',
          severity: alarm.severity || 'info',
          location: alarm.location?.latitude && alarm.location?.longitude ? {
            latitude: alarm.location.latitude,
            longitude: alarm.location.longitude
          } : undefined,
          speed_at_alarm_kmh: alarm.speed_at_alarm_kmh,
          states: alarm.states
        }))
        
        setAlarms(prev => {
          const filtered = prev.filter(a => a.vehicle_id !== vehicleId)
          return [...filtered, ...alarmData]
        })
        
        logger.success('load-alarms', 'Alarm data loaded', {
          vehicleId,
          alarmCount: alarmData.length
        })
      }
    } catch (error) {
      logger.error('load-alarms', 'Failed to load alarms', error as Error, { vehicleId })
    }
  }, []) // FIX: Remove logger dependency since it's now stable
  
  // Load vehicle trace data from backend
  const loadVehicleTrace = useCallback(async (vehicleId: string) => {
    if (vehicleTraces.has(vehicleId)) {
      logger.debug('load-trace', 'Trace already loaded, skipping', { vehicleId })
      return // Already loaded
    }
    
    logger.info('load-trace', 'Starting trace data load', { vehicleId })
    setLoading(prev => {
      const newSet = new Set(prev)
      newSet.add(vehicleId)
      return newSet
    })
    setError(null)
    
    try {
      const apiUrl = `http://127.0.0.1:9500/vehicles/${vehicleId}/playback`
      logger.api('load-trace', 'Fetching playback data', { vehicleId, url: apiUrl })
      
      // Fetch all playback data for this vehicle (entire 30-minute period)
      const response = await logger.trackApiCall(
        'load-trace',
        () => fetch(apiUrl),
        { vehicleId }
      )
      
      if (!response.ok) {
        const errorText = await response.text()
        logger.error('load-trace', 'API response not OK', 
          new Error(`HTTP ${response.status}: ${response.statusText}`), 
          { vehicleId, status: response.status, statusText: response.statusText, responseBody: errorText }
        )
        throw new Error(`Failed to load data for ${vehicleId}: ${response.status} ${response.statusText} - ${errorText}`)
      }
      
      const data = await response.json()
      const traceData = data.data || []
      
      logger.success('load-trace', 'Trace data loaded successfully', 
        { 
          vehicleId, 
          dataPointsCount: traceData.length,
          hasValidGPS: traceData.filter((p: any) => p.latitude && p.longitude).length,
          timeRange: traceData.length > 0 ? {
            start: traceData[0]?.timestamp,
            end: traceData[traceData.length - 1]?.timestamp
          } : null
        }
      )
      
      // Store the trace data
      setVehicleTraces(prev => {
        const newMap = new Map(prev)
        newMap.set(vehicleId, traceData)
        return newMap
      })
      
      // Load alarms for this vehicle if it's autonomous
      const vehicle = getVehicleInfo(vehicleId)
      if (vehicle?.vehicle_type === 'autonomous') {
        await loadVehicleAlarms(vehicleId)
      }
      
    } catch (err) {
      logger.error('load-trace', 'Failed to load vehicle trace', err as Error, { vehicleId })
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      setError(`Failed to load trace for ${vehicleId}: ${errorMessage}`)
    } finally {
      setLoading(prev => {
        const newSet = new Set(prev)
        newSet.delete(vehicleId)
        return newSet
      })
    }
  }, [vehicleTraces, logger, getVehicleInfo, loadVehicleAlarms])
  
  // Handle parent component updates for loading state changes
  useEffect(() => {
    if (onLoadingUpdate && loading !== prevLoadingRef.current) {
      onLoadingUpdate(loading)
      prevLoadingRef.current = new Set(loading)
    }
  }, [loading, onLoadingUpdate])
  
  // Handle parent component updates for vehicle traces changes
  useEffect(() => {
    if (onVehicleTracesUpdate && vehicleTraces !== prevTracesRef.current) {
      onVehicleTracesUpdate(vehicleTraces)
      prevTracesRef.current = new Map(vehicleTraces)
    }
  }, [vehicleTraces, onVehicleTracesUpdate])
  
  // Track current engine for comparison - FIX 4: Stable engine reference tracking
  const currentEngineRef = useRef<PlaybackEngine | null>(null)
  
  // FIX: Add refs for stable access to values removed from dependencies
  const vehicleTracesRef = useRef(vehicleTraces)
  const selectedVehiclesRef = useRef(selectedVehicles)
  
  // Update refs when values change
  useEffect(() => {
    vehicleTracesRef.current = vehicleTraces
  }, [vehicleTraces])
  
  useEffect(() => {
    selectedVehiclesRef.current = selectedVehicles
  }, [selectedVehicles])
  
  // FIX 3: Stable dependency for engine initialization
  const areSelectedVehicleTracesReady = useMemo(() => {
    return selectedVehicles.size > 0 && 
           Array.from(selectedVehicles).every(vehicleId => vehicleTraces.has(vehicleId))
  }, [selectedVehicles, vehicleTraces])
  
  // Engine initialization error state - FIX 6: Error handling
  const [engineError, setEngineError] = useState<Error | null>(null)
  
  // Retry engine initialization - FIX 6: Error recovery
  const retryEngineInitialization = useCallback(() => {
    setEngineError(null)
  }, [])
  
  // FIX 3: Optimized vehicle marker rendering with useMemo
  const filteredCurrentTruckPositions = useMemo(() => {
    return currentTruckPositions.filter((position, index, arr) => {
      const isSelected = selectedVehicles.has(position.vehicle_id)
      const isFirstOccurrence = arr.findIndex(p => p.vehicle_id === position.vehicle_id) === index
      return isSelected && isFirstOccurrence
    })
  }, [currentTruckPositions, selectedVehicles])
  
  // Reinitialize playback engine when selected vehicle traces are ready
  useEffect(() => {
    if (areSelectedVehicleTracesReady) {
      // Filter traces to only include selected vehicles
      const filteredTraces = new Map()
      logger.debug('playback-filter', 'Filtering traces for selected vehicles', {
        selectedVehicles: Array.from(selectedVehiclesRef.current),
        availableTraces: Array.from(vehicleTracesRef.current.keys())
      })
      
      selectedVehiclesRef.current.forEach(vehicleId => {
        if (vehicleTracesRef.current.has(vehicleId)) {
          const traceData = vehicleTracesRef.current.get(vehicleId)
          logger.debug('playback-filter', `Adding vehicle ${vehicleId} to filtered traces`, {
            vehicleId,
            dataPointCount: traceData ? traceData.length : 0,
            hasData: !!traceData
          })
          filteredTraces.set(vehicleId, traceData)
        } else {
          logger.warning('playback-filter', `Vehicle ${vehicleId} not found in available traces`)
        }
      })
      
      logger.debug('playback-filter', 'Final filtered traces', {
        count: filteredTraces.size,
        vehicleIds: Array.from(filteredTraces.keys())
      })
      
      logger.info('playback-init', 'Initializing playback engine for selected vehicles', {
        selectedVehicles: Array.from(selectedVehiclesRef.current),
        availableTraces: Array.from(vehicleTracesRef.current.keys()),
        filteredTraces: Array.from(filteredTraces.keys()),
        traceSizes: Array.from(filteredTraces.entries()).map(([id, data]) => ({ vehicleId: id, points: data.length }))
      })
      
      // FIX 4: Check if we need to create a new engine - compare actual engine content
      const newEngineVehicles = Array.from(filteredTraces.keys()).sort().join(',')
      const currentEngine = currentEngineRef.current
      let actualEngineVehicles: string | null = null
      
      if (currentEngine) {
        // Get the actual vehicles loaded in the engine
        const engineState = currentEngine.getState()
        const enginePositions = currentEngine.getCurrentPositions()
        actualEngineVehicles = [...new Set(enginePositions.map(p => p.vehicle_id))].sort().join(',')
      }
      
      logger.info('playback-init', 'Engine comparison', {
        newEngineVehicles,
        actualEngineVehicles,
        hasCurrentEngine: !!currentEngine,
        needsRecreation: actualEngineVehicles !== newEngineVehicles
      })
      
      if (actualEngineVehicles === newEngineVehicles && currentEngine) {
        // Engine is actually configured for these vehicles, no need to recreate
        logger.info('playback-init', 'Engine already configured for current vehicles, skipping recreation')
        return
      }
      
      // Force recreation if engine has different vehicles than expected
      if (actualEngineVehicles && actualEngineVehicles !== newEngineVehicles) {
        logger.info('playback-init', 'Engine vehicle mismatch detected, forcing recreation', {
          expected: newEngineVehicles,
          actual: actualEngineVehicles
        })
      }
      
      // Clean up existing engine if it exists
      if (playbackEngine) {
        try {
          playbackEngine.destroy()
          logger.info('playback-cleanup', 'Previous playback engine destroyed')
        } catch (error) {
          logger.error('playback-cleanup', 'Error destroying previous engine', error as Error)
        } finally {
          currentEngineRef.current = null
        }
      }
      
      try {
        // FIX 6: Error handling for engine creation
        const vehicleDataSizes = Array.from(vehicleTraces.entries()).map(([id, data]) => ({
          vehicleId: id,
          dataPoints: data.length,
          firstTimestamp: data[0]?.timestamp,
          lastTimestamp: data[data.length - 1]?.timestamp
        }))
        
        logger.info('playback-init', 'Initializing playback engine', {
          vehicleCount: vehicleTraces.size,
          vehicles: Array.from(vehicleTraces.keys()),
          vehicleDataSizes
        })
        
        const engine = new PlaybackEngine({
          onPositionUpdate: handleTruckPositionUpdate,
          onTimeUpdate: handleTimeUpdate,
          onPlayStateChange: handlePlayStateChange,
          onSpeedChange: handleSpeedChange
        })
      
      // Debug: Check vehicle data before loading into engine
      logger.info('vehicle-traces', 'Vehicle traces before loading to engine', {
        selectedVehicles: Array.from(selectedVehicles),
        vehicleTracesSize: vehicleTraces.size,
        vehicleTracesKeys: Array.from(vehicleTraces.keys()),
        traceDataLengths: Array.from(vehicleTraces.entries()).map(([id, data]) => ({ 
          vehicleId: id, 
          dataLength: data.length,
          hasValidCoords: data.some(d => d.latitude && d.longitude),
          firstTimestamp: data[0]?.timestamp,
          lastTimestamp: data[data.length - 1]?.timestamp
        }))
      })
      
        // Load ONLY selected vehicle data into engine
        logger.info('playback-init', 'Loading truck data into engine', {
          filteredTracesSize: filteredTraces.size,
          filteredTracesIds: Array.from(filteredTraces.keys()),
          filteredTracesData: Array.from(filteredTraces.entries()).map(([id, data]) => ({ 
            vehicleId: id, 
            points: data.length, 
            firstPoint: data[0], 
            lastPoint: data[data.length - 1] 
          }))
        })
        engine.loadTruckData(filteredTraces)
        
        // Calculate global time range
        const state = engine.getState()
        const globalStart = state.startTime
        const globalEnd = state.endTime
        setGlobalTimeRange({start: globalStart, end: globalEnd})
        setPlaybackStartTime(globalStart)
        setPlaybackEndTime(globalEnd)
        
        setPlaybackEngine(engine)
        currentEngineRef.current = engine
        setIsPlaybackMode(true)
        
        // Immediately get and set initial positions
        const initialPositions = engine.getCurrentPositions()
        if (initialPositions.length > 0) {
          setCurrentTruckPositions(initialPositions)
          logger.success('playback-init', 'Initial positions set', {
            positionCount: initialPositions.length,
            positions: initialPositions.map(p => ({
              vehicle: p.vehicle_id,
              lat: p.latitude,
              lng: p.longitude
            }))
          })
        }
        
        logger.success('playback-init', 'Playback engine initialized with selected vehicles')
        setEngineError(null) // Clear any previous errors
        
      } catch (error) {
        // FIX 6: Handle engine initialization errors
        const engineError = error instanceof Error ? error : new Error('Unknown engine initialization error')
        logger.error('playback-init', 'Failed to initialize playback engine', engineError)
        setEngineError(engineError)
        setPlaybackEngine(null)
        currentEngineRef.current = null
        setIsPlaybackMode(false)
      }
    }
  }, [areSelectedVehicleTracesReady])  // FIX: Remove unstable dependencies - use refs for access
  
  // Handle truck position updates from playback - SIMPLIFIED to prevent infinite loops
  const handleTruckPositionUpdate = useCallback((positions: TruckPosition[]) => {
    // Prevent infinite loops by checking if positions actually changed
    if (!positions || positions.length === 0) return
    
    // Basic throttling to prevent excessive re-renders
    const now = Date.now()
    if (lastPositionUpdateRef.current && (now - lastPositionUpdateRef.current) < 100) {
      return // Skip updates that are too frequent (< 100ms apart)
    }
    lastPositionUpdateRef.current = now
    
    // Simplified position update - just set the new positions
    setCurrentTruckPositions(positions)
    
    // Update trace histories with 30-second trail
    setTruckTraceHistories(prev => {
      const newHistories = new Map()
      
      // Copy existing histories first
      prev.forEach((history, vehicleId) => {
        newHistories.set(vehicleId, history)
      })
      
      const thirtySecondsMs = 30 * 1000 // 30 seconds trail
      
      positions.forEach(position => {
        const vehicleId = position.vehicle_id
        const currentHistory = newHistories.get(vehicleId) || []
        const positionTime = new Date(position.timestamp).getTime()
        
        // Check if this position is already in history (prevent duplicates)
        const alreadyExists = currentHistory.some((p: any) => 
          p.timestamp === position.timestamp && p.vehicle_id === position.vehicle_id
        )
        
        if (!alreadyExists) {
          // Add current position and filter to keep only last 30 seconds
          const newHistory = [...currentHistory, position]
            .filter((p: any) => {
              const pTime = new Date(p.timestamp).getTime()
              return (positionTime - pTime) <= thirtySecondsMs
            })
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
          
          newHistories.set(vehicleId, newHistory)
        }
      })
      
      return newHistories
    })
    
    // Reduced logging to prevent excessive console output
    if (Math.random() < 0.1) { // Only log 10% of updates
      logger.debug('position-update', 'Truck positions updated', {
        positionCount: positions.length,
        vehicles: positions.map(p => p.vehicle_id)
      })
    }
  }, []) // FIX: Remove logger dependency since it's now stable
  
  // Handle playback time updates - MEMOIZED to prevent engine recreations
  const handleTimeUpdate = useCallback((currentTime: number, timestamp: string) => {
    // Can be used for time display updates
    logger.debug('time-update', 'Playback time updated', { currentTime, timestamp })
  }, []) // FIX: Remove logger dependency since it's now stable
  
  // Handle play state changes - MEMOIZED to prevent engine recreations
  const handlePlayStateChange = useCallback((playing: boolean) => {
    setIsPlaying(playing)
    if (playing) {
      setIsStopped(false) // When playing starts, it's not stopped
    }
    // When paused during playback, still not stopped
    logger.info('playback-state', `Playback ${playing ? 'started' : 'paused'}`)
  }, []) // FIX: Remove logger dependency since it's now stable
  
  // Handle stop functionality (separate from pause) - MEMOIZED to prevent engine recreations
  const handleStopPlayback = useCallback(() => {
    if (playbackEngine) {
      playbackEngine.pause()
      playbackEngine.seekToTime(0) // Reset to beginning
      setIsPlaying(false)
      setIsStopped(true)
      logger.info('playback-state', 'Playback stopped and reset')
    }
  }, [playbackEngine]) // FIX: Remove logger dependency since it's now stable
  
  // Handle speed changes - MEMOIZED to prevent engine recreations
  const handleSpeedChange = useCallback((speed: number) => {
    logger.info('playback-speed', `Playback speed changed to ${speed}x`)
  }, []) // FIX: Remove logger dependency since it's now stable
  
  // Handle telemetry truck selection (separate from following)
  const handleTelemetryTruckChange = useCallback((vehicleId: string | null) => {
    setSelectedTruck(vehicleId)
    logger.userAction('select-telemetry-truck', `Telemetry selected for truck ${vehicleId || 'none'}`)
  }, [])
  
  // Handle trace point click for tooltips (only when stopped and enabled)
  const handleTracePointClick = useCallback((vehicleId: string, point: PlaybackDataPoint, position: [number, number]) => {
    logger.debug('trace-click', 'Trace click attempt', { 
      enableTraceTooltips: enableTraceTooltipsRef.current, 
      effectiveIsPlaying: effectiveIsPlayingRef.current, 
      effectiveIsStopped: effectiveIsStoppedRef.current,
      vehicleId, 
      timestamp: point.timestamp 
    })
    
    if (!enableTraceTooltipsRef.current) {
      logger.debug('trace-click', 'Trace click blocked: tooltips disabled')
      return
    }
    
    // Only allow trace clicks when playback is fully stopped
    if (effectiveIsPlayingRef.current || !effectiveIsStoppedRef.current) {
      logger.debug('trace-click', 'Trace click blocked: playback is active or not stopped')
      return
    }
    
    // Close any existing tooltip first, then set new one
    setSelectedTracePoint(null)
    setTimeout(() => {
      setSelectedTracePoint({ vehicleId, point, position })
      logger.userAction('trace-point-click', `Single-clicked trace point for ${vehicleId} at ${point.timestamp}`)
    }, 50) // Small delay to ensure clean state transition
  }, [])
  
  // Handle follow truck functionality (separate from telemetry selection)
  const handleFollowTruck = useCallback((vehicleId: string | null) => {
    setFollowingTruck(vehicleId)
    
    if (vehicleId && mapRef.current && L) {
      const position = currentTruckPositions.find(p => p.vehicle_id === vehicleId)
      if (position) {
        const map = mapRef.current
        map.setView([position.latitude, position.longitude], 16, {
          animate: true,
          duration: 1
        })
        logger.userAction('follow-truck', `Following truck ${vehicleId}`)
      }
    }
    
    if (!vehicleId) {
      logger.userAction('unfollow-truck', 'Stopped following truck')
    }
  }, [currentTruckPositions, logger])
  
  // Update map view when following a truck
  useEffect(() => {
    if (followingTruck && mapRef.current && L) {
      const position = currentTruckPositions.find(p => p.vehicle_id === followingTruck)
      if (position) {
        const map = mapRef.current
        map.panTo([position.latitude, position.longitude], {
          animate: true,
          duration: 0.5
        })
      }
    }
  }, [currentTruckPositions, followingTruck])
  
  // Toggle vehicle selection
  const toggleVehicle = useCallback(async (vehicleId: string) => {
    const isSelected = selectedVehicles.has(vehicleId)
    
    logger.userAction('toggle-vehicle', 
      `${isSelected ? 'Deselecting' : 'Selecting'} vehicle ${vehicleId}`
    )
    
    if (isSelected) {
      // Deselect vehicle
      setSelectedVehicles(prev => {
        const newSet = new Set(prev)
        newSet.delete(vehicleId)
        logger.stateChange('selectedVehicles', Array.from(newSet), Array.from(prev))
        return newSet
      })
    } else {
      // Select vehicle and load its trace
      setSelectedVehicles(prev => {
        const newSet = new Set(prev)
        newSet.add(vehicleId)
        logger.stateChange('selectedVehicles', Array.from(newSet), Array.from(prev))
        return newSet
      })
      await loadVehicleTrace(vehicleId)
      
      // Also load alarms for autonomous vehicles
      const vehicle = getVehicleInfo(vehicleId)
      if (vehicle?.vehicle_type === 'autonomous') {
        await loadVehicleAlarms(vehicleId)
      }
    }
  }, [selectedVehicles, loadVehicleTrace, loadVehicleAlarms, getVehicleInfo, logger])
  
  // Create polyline path for vehicle trace with gap detection and time filtering
  // Smooth path interpolation function
  const smoothPath = useCallback((points: [number, number][]): [number, number][] => {
    if (points.length < 3) return points
    
    const smoothedPoints: [number, number][] = []
    smoothedPoints.push(points[0]) // Keep first point
    
    // Add interpolated points between existing points for smoother curves
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1]
      const curr = points[i]
      const next = points[i + 1]
      
      // Add intermediate point before current point
      const interpBefore: [number, number] = [
        prev[0] + (curr[0] - prev[0]) * 0.7,
        prev[1] + (curr[1] - prev[1]) * 0.7
      ]
      smoothedPoints.push(interpBefore)
      
      // Add current point
      smoothedPoints.push(curr)
      
      // Add intermediate point after current point
      const interpAfter: [number, number] = [
        curr[0] + (next[0] - curr[0]) * 0.3,
        curr[1] + (next[1] - curr[1]) * 0.3
      ]
      smoothedPoints.push(interpAfter)
    }
    
    smoothedPoints.push(points[points.length - 1]) // Keep last point
    return smoothedPoints
  }, [])

  const createVehiclePath = useCallback((traceData: PlaybackDataPoint[], timeRange?: [number, number]) => {
    // First filter by time range if provided
    let filteredData = traceData.filter(point => {
      if (!point.latitude || !point.longitude) return false
      
      if (timeRange) {
        const pointTime = new Date(point.timestamp).getTime()
        if (pointTime < timeRange[0] || pointTime > timeRange[1]) {
          return false
        }
      }
      
      return true
    })
    
    // Sort by timestamp to ensure proper order
    filteredData.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    
    // Break into segments where there are time gaps > 5 minutes to prevent straight lines
    const segments: [number, number][][] = []
    let currentSegment: [number, number][] = []
    
    const maxGapMs = 5 * 60 * 1000 // 5 minutes
    
    for (let i = 0; i < filteredData.length; i++) {
      const point = filteredData[i]
      const currentTime = new Date(point.timestamp).getTime()
      
      if (currentSegment.length > 0) {
        const lastPoint = filteredData[i - 1]
        const lastTime = new Date(lastPoint.timestamp).getTime()
        const timeDiff = currentTime - lastTime
        
        // If gap > 5 minutes, start new segment
        if (timeDiff > maxGapMs) {
          if (currentSegment.length > 1) {
            segments.push([...currentSegment])
          }
          currentSegment = [[point.latitude, point.longitude]]
        } else {
          currentSegment.push([point.latitude, point.longitude])
        }
      } else {
        currentSegment.push([point.latitude, point.longitude])
      }
    }
    
    // Add final segment
    if (currentSegment.length > 1) {
      segments.push(currentSegment)
    }
    
    // Apply smoothing to the first segment and return
    const firstSegment = segments.length > 0 ? segments[0] : []
    return firstSegment.length > 2 ? smoothPath(firstSegment) : firstSegment
  }, [smoothPath])
  
  // Create multiple polyline segments for vehicle trace with gap detection
  const createVehiclePathSegments = useCallback((traceData: PlaybackDataPoint[], timeRange?: [number, number]) => {
    // First filter by time range if provided
    let filteredData = traceData.filter(point => {
      if (!point.latitude || !point.longitude) return false
      
      if (timeRange) {
        const pointTime = new Date(point.timestamp).getTime()
        if (pointTime < timeRange[0] || pointTime > timeRange[1]) {
          return false
        }
      }
      
      return true
    })
    
    // Sort by timestamp to ensure proper order
    filteredData.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    
    // Helper function to calculate distance between two GPS points (in meters)
    const calculateDistance = (point1: PlaybackDataPoint, point2: PlaybackDataPoint): number => {
      const R = 6371e3 // Earth's radius in meters
      const lat1 = point1.latitude * Math.PI / 180
      const lat2 = point2.latitude * Math.PI / 180
      const deltaLat = (point2.latitude - point1.latitude) * Math.PI / 180
      const deltaLng = (point2.longitude - point1.longitude) * Math.PI / 180

      const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
                Math.cos(lat1) * Math.cos(lat2) *
                Math.sin(deltaLng/2) * Math.sin(deltaLng/2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))

      return R * c
    }
    
    // Break into segments to prevent artificial straight lines
    const segments: [number, number][][] = []
    let currentSegment: [number, number][] = []
    
    const maxGapMs = 5 * 60 * 1000 // 5 minutes
    const maxDistanceM = 500 // 500 meters - prevents long straight lines
    
    for (let i = 0; i < filteredData.length; i++) {
      const point = filteredData[i]
      const currentTime = new Date(point.timestamp).getTime()
      
      if (currentSegment.length > 0) {
        const lastPoint = filteredData[i - 1]
        const lastTime = new Date(lastPoint.timestamp).getTime()
        const timeDiff = currentTime - lastTime
        const distance = calculateDistance(lastPoint, point)
        
        // Start new segment if time gap > 5 minutes OR distance > 500m
        // This prevents both time-based and spatial-based artificial connections
        if (timeDiff > maxGapMs || distance > maxDistanceM) {
          if (currentSegment.length > 1) {
            segments.push([...currentSegment])
          }
          currentSegment = [[point.latitude, point.longitude]]
        } else {
          currentSegment.push([point.latitude, point.longitude])
        }
      } else {
        currentSegment.push([point.latitude, point.longitude])
      }
    }
    
    // Add final segment
    if (currentSegment.length > 1) {
      segments.push(currentSegment)
    }
    
    return segments
  }, [])
  
  // Auto-fit map to show all selected vehicle traces
  const fitMapToVehicles = useCallback(() => {
    if (!mapRef.current || selectedVehicles.size === 0) {
      logger.warning('fit-map', 'Fit map skipped', { 
        hasMapRef: !!mapRef.current, 
        selectedCount: selectedVehicles.size 
      })
      return
    }
    
    // Dynamically load Leaflet if not available
    let leaflet = L
    if (typeof window !== 'undefined' && !leaflet) {
      try {
        leaflet = require('leaflet')
      } catch (e) {
        logger.error('fit-map', 'Failed to load Leaflet', e as Error)
        return
      }
    }
    
    if (!leaflet) {
      logger.error('fit-map', 'Leaflet not available')
      return
    }
    
    const map = mapRef.current
    const allPoints: [number, number][] = []
    
    // Collect all points from selected vehicles
    selectedVehicles.forEach(vehicleId => {
      const traceData = vehicleTraces.get(vehicleId)
      if (traceData) {
        const path = createVehiclePath(traceData)
        allPoints.push(...path)
        logger.debug('fit-map', 'Added points for vehicle', { vehicleId, pointCount: path.length })
      }
    })
    
    logger.info('fit-map', 'Attempting to fit map to vehicles', { 
      totalPoints: allPoints.length,
      samplePoints: allPoints.slice(0, 3),
      vehicleCount: selectedVehicles.size
    })
    
    if (allPoints.length > 0) {
      try {
        // Fit map bounds to show all points
        const bounds = leaflet.latLngBounds(allPoints)
        map.fitBounds(bounds, { padding: [20, 20] })
        logger.success('fit-map', 'Map fitted to vehicle bounds')
      } catch (error) {
        logger.error('fit-map', 'Failed to fit map bounds', error as Error)
      }
    } else {
      logger.warning('fit-map', 'No points found to fit map bounds')
    }
  }, [selectedVehicles, vehicleTraces, createVehiclePath, logger])
  
  // Removed auto-fit to prevent unwanted zoom behavior - users can manually use fit button

  // Register fit map trigger via ref
  useEffect(() => {
    if (fitMapRef) {
      fitMapRef.current = fitMapToVehicles
    }
  }, [fitMapToVehicles, fitMapRef])
  
  // GeoJSON Layer component for mining infrastructure
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
            
            return true
          })
        }
        
        // Calculate bounds for callback but don't auto-zoom to prevent unwanted zoom behavior
        geoJsonLayer = L.geoJSON(filteredData)
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
            logger.error('geojson-cleanup', 'Error cleaning up GeoJSON layer', error as Error)
          }
        }
      }
    }, [data, map, onBoundsCalculated])
    
    return null
  }

  return (
    <div className="w-full h-full bg-gray-900 shadow-xl border border-gray-700 rounded-lg flex">
      {/* Mining Map Styles */}
      <style jsx global>{`
        .mining-map .leaflet-container {
          background-color: #1e293b !important;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        .mining-map .leaflet-tile-pane {
          filter: invert(1) hue-rotate(180deg) brightness(0.3) contrast(1.2);
        }
        .mining-map .leaflet-control-zoom {
          background: rgba(30, 41, 59, 0.9);
          border: 1px solid #475569;
          border-radius: 6px;
        }
        .mining-map .leaflet-control-zoom a {
          background: rgba(30, 41, 59, 0.9);
          color: #e2e8f0;
          border: none;
        }
        .mining-map .leaflet-control-zoom a:hover {
          background: rgba(51, 65, 85, 0.9);
          color: #ffffff;
        }
        .leaflet-popup-content-wrapper {
          background: linear-gradient(135deg, #1e293b, #334155);
          border: 1px solid #475569;
          border-radius: 8px;
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.4);
        }
        .leaflet-popup-content {
          color: #e2e8f0;
          margin: 0;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        .leaflet-popup-tip {
          background: #334155;
          border: 1px solid #475569;
        }
        
        .custom-truck-marker {
          background: transparent !important;
          border: none !important;
        }
        
        .hover-info-popup .leaflet-popup-content-wrapper {
          background: transparent !important;
          box-shadow: none !important;
          padding: 0 !important;
          border-radius: 8px !important;
        }
        
        .hover-info-popup .leaflet-popup-content {
          margin: 0 !important;
          background: transparent !important;
        }
        
        .hover-info-popup .leaflet-popup-tip {
          background: #111827 !important;
          border: 1px solid #374151 !important;
        }
        
        @keyframes pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.7);
          }
          70% {
            box-shadow: 0 0 0 10px rgba(37, 99, 235, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(37, 99, 235, 0);
          }
        }
      `}</style>
      
      {/* Left Sidebar - Vehicle Selection & Trail Colors */}
      <LeftSidebar
        // Vehicle Control Props
        selectedVehicles={selectedVehicles}
        onVehicleSelectionChange={async (newSelection: Set<string>) => {
          // Find differences and use toggleVehicle for each change
          const currentSelection = selectedVehicles
          const toAdd = Array.from(newSelection).filter(id => !currentSelection.has(id))
          const toRemove = Array.from(currentSelection).filter(id => !newSelection.has(id))
          
          // Process additions and removals using toggleVehicle
          for (const vehicleId of [...toAdd, ...toRemove]) {
            await toggleVehicle(vehicleId)
          }
        }}
        availableVehicles={availableVehicles}
        onSelectAll={() => {
          availableVehicles.forEach(v => {
            if (!selectedVehicles.has(v.vehicle_id)) {
              toggleVehicle(v.vehicle_id)
            }
          })
        }}
        onClearAll={() => {
          selectedVehicles.forEach(vehicleId => {
            toggleVehicle(vehicleId)
          })
        }}
        onFitToTraces={fitMapToVehicles}
        
        // Trail Color Props
        colorMode={colorMode}
        showAlarms={showAlarms}
        alarmFilter={alarmFilter}
        availableAlarmTypes={availableAlarmTypes}
        opacity={trailOpacity}
        onColorModeChange={setColorMode}
        onShowAlarmsChange={setShowAlarms}
        onAlarmFilterChange={setAlarmFilter}
        onOpacityChange={setTrailOpacity}
      />
      
      {/* Main Map Area */}
      <div className="flex-1 relative">
        {/* Error Display */}
        {error && (
          <div className="absolute top-4 left-4 z-20 max-w-md">
            <div className="bg-red-900 border border-red-700 rounded-lg p-3">
              <p className="text-red-200 text-sm">{error}</p>
              <button
                onClick={() => {
                  setError(null)
                  logger.userAction('dismiss-error', 'Error message dismissed')
                }}
                className="mt-2 text-xs text-red-300 hover:text-white underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        
        {/* Map Container */}
        <div className="w-full h-full relative rounded-lg overflow-hidden">
        
        
        {/* Map Controls Overlay - Top Right */}
        <div className="absolute top-4 right-4 z-20 flex flex-col space-y-2">
          {/* Zoom Controls */}
          <div className="bg-gray-900/90 border border-gray-700 rounded-lg shadow-xl">
            <button
              onClick={() => {
                if (mapRef.current) {
                  mapRef.current.zoomIn()
                  logger.userAction('zoom-in', 'Zoomed in')
                }
              }}
              className="block w-10 h-10 text-gray-300 hover:text-white hover:bg-gray-800 rounded-t-lg transition-colors border-b border-gray-700"
              title="Zoom In"
            >
              <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </button>
            <button
              onClick={() => {
                if (mapRef.current) {
                  mapRef.current.zoomOut()
                  logger.userAction('zoom-out', 'Zoomed out')
                }
              }}
              className="block w-10 h-10 text-gray-300 hover:text-white hover:bg-gray-800 rounded-b-lg transition-colors"
              title="Zoom Out"
            >
              <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 12H6" />
              </svg>
            </button>
          </div>
          
          {/* Fit to Traces Button */}
          <button
            onClick={fitMapToVehicles}
            disabled={selectedVehicles.size === 0}
            className="w-10 h-10 bg-gray-900/90 border border-gray-700 rounded-lg shadow-xl text-gray-300 hover:text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Fit to Selected Traces"
          >
            <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
          
          {/* Distance Measurement Tool Toggle */}
          <button
            onClick={() => {
              // Block during any playback activity (playing or not stopped)
              if (effectiveIsPlaying || !effectiveIsStopped) {
                logger.userAction('distance-tool-blocked', 'Distance tool blocked during playback')
                return
              }
              setIsDistanceToolActive(!isDistanceToolActive)
              logger.userAction('toggle-distance-tool', isDistanceToolActive ? 'Deactivated distance tool' : 'Activated distance tool')
            }}
            disabled={effectiveIsPlaying || !effectiveIsStopped}
            className={`w-10 h-10 border rounded-lg shadow-xl transition-all duration-200 ${
              effectiveIsPlaying || !effectiveIsStopped
                ? 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed opacity-50'
                : isDistanceToolActive
                  ? 'bg-blue-600 text-white border-blue-500 hover:bg-blue-700 shadow-blue-500/30'
                  : 'bg-gray-900/90 text-gray-300 border-gray-700 hover:text-white hover:bg-gray-800 hover:border-gray-600'
            }`}
            title={(effectiveIsPlaying || !effectiveIsStopped) ? "Distance tool only available when playback is stopped" : (isDistanceToolActive ? "Disable Distance Tool (Active)" : "Enable Distance Tool")}
          >
            <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21l3-3 9-9a1.414 1.414 0 000-2L15 3a1.414 1.414 0 00-2 0l-9 9-3 3v6h6z" />
            </svg>
          </button>
          
          {/* Map Shape Properties Toggle */}
          <button
            onClick={() => {
              // Block during any playback activity (playing or not stopped)
              if (effectiveIsPlaying || !effectiveIsStopped) {
                logger.userAction('map-shapes-blocked', 'Map shape toggle blocked during playback')
                return
              }
              setEnableMapShapeProperties(!enableMapShapeProperties)
              logger.userAction('toggle-map-shapes', enableMapShapeProperties ? 'Disabled map shape properties' : 'Enabled map shape properties')
            }}
            disabled={effectiveIsPlaying || !effectiveIsStopped}
            className={`w-10 h-10 border rounded-lg shadow-xl transition-all duration-200 ${
              effectiveIsPlaying || !effectiveIsStopped
                ? 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed opacity-50'
                : enableMapShapeProperties
                  ? 'bg-green-600 text-white border-green-500 hover:bg-green-700 shadow-green-500/30'
                  : 'bg-gray-900/90 text-gray-300 border-gray-700 hover:text-white hover:bg-gray-800 hover:border-gray-600'
            }`}
            title={(effectiveIsPlaying || !effectiveIsStopped) ? "Map shape properties only available when playback is stopped" : (enableMapShapeProperties ? "Disable Map Shape Properties (Active - Click shapes to see details)" : "Enable Map Shape Properties (Click shapes to see details)")}
          >
            <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>
          
          {/* Trace Tooltips Toggle - Only available when stopped */}
          <button
            onClick={() => {
              // Block during any playback activity (playing or not stopped)
              if (effectiveIsPlaying || !effectiveIsStopped) {
                logger.userAction('trace-tooltips-blocked', 'Trace tooltips toggle blocked during playback')
                return
              }
              const newValue = !enableTraceTooltips
              logger.userAction('trace-tooltips-toggle', { oldValue: enableTraceTooltips, newValue })
              setEnableTraceTooltips(newValue)
              logger.userAction('toggle-trace-tooltips', newValue ? 'Enabled trace tooltips' : 'Disabled trace tooltips')
            }}
            disabled={effectiveIsPlaying || !effectiveIsStopped}
            className={`w-10 h-10 border rounded-lg shadow-xl transition-all duration-200 ${
              effectiveIsPlaying || !effectiveIsStopped
                ? 'bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed opacity-50'
                : enableTraceTooltips
                  ? 'bg-purple-600 text-white border-purple-500 hover:bg-purple-700 shadow-purple-500/30'
                  : 'bg-gray-900/90 text-gray-300 border-gray-700 hover:text-white hover:bg-gray-800 hover:border-gray-600'
            }`}
            title={(effectiveIsPlaying || !effectiveIsStopped) ? "Trace tooltips only available when playback is stopped" : enableTraceTooltips ? "Disable Trace Tooltips (Active - Click trace when stopped to see vehicle details)" : "Enable Trace Tooltips (Click trace when stopped to see vehicle details)"}
          >
            <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
          </button>
          
          
        </div>
        
        {typeof window !== 'undefined' && (
          <MapContainer
            center={DEFAULT_CENTER}
            zoom={DEFAULT_ZOOM}
            className="w-full h-full mining-map"
            ref={mapRef}
            style={{ backgroundColor: '#1e293b' }}
            zoomControl={false}
          >
            {/* No tile layer - only show GeoJSON mine infrastructure */}
            
            {/* Mine Infrastructure Layer */}
            {geoJsonData && (
              <>
                {/* Only show GeoJSONLayer when map shape properties are enabled and not actively playing */}
                {enableMapShapeProperties && (!isPlaying || isStopped) && (
                  <GeoJSONLayer data={geoJsonData} />
                )}
                
                
                {/* AOZ Background Layer */}
                <GeoJSON
                  data={geoJsonData}
                  filter={(feature) => {
                    const asiType = feature.properties?.AsiType?.toLowerCase() || ''
                    return asiType.includes('aoz') && !asiType.includes('aozshapedto')
                  }}
                  style={() => ({
                    fillColor: 'rgba(255, 215, 0, 0.08)',
                    weight: 1,
                    opacity: 0.6,
                    color: 'rgba(255, 215, 0, 0.3)',
                    fillOpacity: 0.1
                  })}
                  interactive={false}
                />
                
                {/* Main Infrastructure Shapes */}
                <GeoJSON
                  data={geoJsonData}
                  interactive={enableMapShapeProperties && (!isPlaying || isStopped)} // Only enable when not actively playing and enabled
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
                    
                    // Remove line features
                    if (feature.geometry?.type === 'LineString' || feature.geometry?.type === 'MultiLineString') {
                      return false
                    }
                    
                    return true
                  }}
                  style={(feature) => {
                    const asiType = feature?.properties?.AsiType?.toLowerCase() || ''
                    
                    if (asiType.includes('road') || asiType.includes('track')) {
                      return {
                        color: '#94a3b8',
                        weight: 2,
                        fillColor: 'rgba(148, 163, 184, 0.2)',
                        fillOpacity: 0.4
                      }
                    }
                    
                    return {
                      color: '#64748b',
                      weight: 1.5,
                      fillColor: 'rgba(100, 116, 139, 0.15)',
                      fillOpacity: 0.3
                    }
                  }}
                  onEachFeature={(feature, layer) => {
                    // Add click handler to show shape properties
                    layer.on({
                      click: () => {
                        // Only show popup when map shape properties are enabled AND playback is paused (not actively playing)
                        if (!enableMapShapePropertiesRef.current || effectiveIsPlayingRef.current) {
                          return
                        }
                        
                        const props = feature.properties || {}
                        
                        // Extract specific ASI properties for mining infrastructure
                        const name = props.AsiName || props.Name || props.name || 'Unknown Shape'
                        const speedLimit = props.AsiSpeedLimit || props.SpeedLimit || props.speedLimit
                        const type = props.AsiType || props.Type || props.type || 'Infrastructure'
                        
                        const popupContent = `
                          <div class="bg-gray-900 rounded-lg p-3 text-white text-sm min-w-[200px]">
                            <div class="font-semibold text-blue-300 mb-2">${name}</div>
                            <div class="space-y-1 text-xs">
                              <div class="flex justify-between">
                                <span class="text-gray-400">Type:</span>
                                <span class="text-right max-w-[120px] truncate">${type}</span>
                              </div>
                              ${speedLimit ? `
                              <div class="flex justify-between">
                                <span class="text-gray-400">Speed Limit:</span>
                                <span class="text-right max-w-[120px] truncate text-orange-400">${speedLimit} km/h</span>
                              </div>` : ''}
                              <hr class="border-gray-700 my-2">
                              <div class="text-xs text-gray-500">
                                Click map interaction toggle to switch back to trace mode
                              </div>
                            </div>
                          </div>
                        `
                        layer.bindPopup(popupContent).openPopup()
                      }
                    })
                  }}
                />
              </>
            )}
            
            {/* Static Vehicle GPS Traces - Show immediately when vehicles selected, hide during active playback */}
            {(!isPlaying || isStopped) && Array.from(selectedVehicles).map(vehicleId => {
              const vehicle = getVehicleInfo(vehicleId)
              const traceData = vehicleTraces.get(vehicleId)
              
              if (!vehicle || !traceData || traceData.length === 0) {
                return null
              }
              
              // Apply time range filtering if playback time range is active
              const timeRange: [number, number] | undefined = (playbackStartTime !== globalTimeRange.start || playbackEndTime !== globalTimeRange.end) 
                ? [playbackStartTime, playbackEndTime] 
                : undefined
              
              const pathSegments = createVehiclePathSegments(traceData, timeRange)
              if (pathSegments.length === 0) return null
              
              // Generate colored segments based on selected color mode
              const createColoredSegments = () => {
                const allSegmentElements: React.ReactElement[] = []
                
                // Create polylines for each path segment to prevent straight line artifacts
                pathSegments.forEach((segment, segmentIndex) => {
                  if (colorMode === 'solid' || vehicle.vehicle_type !== 'autonomous') {
                    // Use solid color for manual vehicles or when solid mode is selected
                    const color = VEHICLE_COLORS[vehicle.vehicle_type]
                    allSegmentElements.push(
                      <Polyline
                        key={`static-solid-${vehicleId}-segment-${segmentIndex}`}
                        positions={smoothGPSTrace(segment)}
                        pathOptions={{
                          color: color,
                          weight: 4,
                          opacity: trailOpacity * 0.8,
                          // Improve clickability with invisible broader stroke
                          stroke: true,
                          interactive: enableTraceTooltips,
                        }}
                        eventHandlers={enableTraceTooltips ? {
                          click: (e) => {
                            // Prevent event bubbling to ensure single click registration
                            e.originalEvent?.stopPropagation()
                            
                            // Only allow clicks when playback is stopped
                            if (!effectiveIsPlayingRef.current && effectiveIsStoppedRef.current && segment.length > 0) {
                              // Find closest trace point to click location
                              const midpointIndex = Math.floor((segmentIndex * segment.length) / pathSegments.length)
                              const correspondingPoint = traceData[midpointIndex] || traceData[0]
                              if (correspondingPoint) {
                                handleTracePointClick(vehicleId, correspondingPoint, [correspondingPoint.latitude, correspondingPoint.longitude])
                              }
                            }
                          }
                        } : {}}
                      />
                    )
                  } else {
                    // Create colored segments for autonomous vehicles within this path segment
                    // Filter traceData to only points in this segment's time range
                    const segmentStartPos = segment[0]
                    const segmentEndPos = segment[segment.length - 1]
                    
                    // Find corresponding data points for this segment
                    const segmentData = traceData.filter(point => {
                      if (!point.latitude || !point.longitude) return false
                      
                      // Check if point is part of this segment (rough approximation)
                      return segment.some(pos => 
                        Math.abs(pos[0] - point.latitude) < 0.0001 && 
                        Math.abs(pos[1] - point.longitude) < 0.0001
                      )
                    })
                    
                    for (let i = 0; i < segmentData.length - 1; i++) {
                      const currentPoint = segmentData[i]
                      const nextPoint = segmentData[i + 1]
                      
                      if (currentPoint.latitude && currentPoint.longitude && 
                          nextPoint.latitude && nextPoint.longitude) {
                        
                        const segmentColor = getTrailColor(
                          colorMode,
                          ensureSpeedInKmh(currentPoint.speed_kmh),
                          currentPoint.offpath_deviation,
                          currentPoint.states,
                          1
                        )
                        
                        allSegmentElements.push(
                          <Polyline
                            key={`static-segment-${vehicleId}-${segmentIndex}-${i}`}
                            positions={[
                              [currentPoint.latitude, currentPoint.longitude],
                              [nextPoint.latitude, nextPoint.longitude]
                            ]}
                            pathOptions={{
                              color: segmentColor,
                              weight: 4,
                              opacity: trailOpacity * 0.8,
                              // Improve clickability with invisible broader stroke
                              stroke: true,
                              interactive: enableTraceTooltips,
                            }}
                            eventHandlers={enableTraceTooltips ? {
                              click: (e) => {
                                // Prevent event bubbling to ensure single click registration
                                e.originalEvent?.stopPropagation()
                                
                                // Only allow clicks when playback is stopped
                                if (!effectiveIsPlayingRef.current && effectiveIsStoppedRef.current) {
                                  handleTracePointClick(vehicleId, currentPoint, [currentPoint.latitude, currentPoint.longitude])
                                }
                              }
                            } : {}}
                          />
                        )
                      }
                    }
                  }
                })
                
                return allSegmentElements
              }
              
              return (
                <div key={`static-${vehicleId}`}>
                  {createColoredSegments()}
                  
                </div>
              )
            })}
            
            {/* Moving Vehicle Icons with Trace Histories - Show when playback engine is active */}
            {/* FIX 3: Use optimized filtered positions - With proper logging */}
            {isPlaybackMode && filteredCurrentTruckPositions.length > 0 && (() => {
              logger.debug('render-vehicles', 'Rendering vehicles', { vehicleIds: filteredCurrentTruckPositions.map(p => p.vehicle_id) })
              return filteredCurrentTruckPositions
            })()
              .map(position => {
                const vehicle = getVehicleInfo(position.vehicle_id)
                if (!vehicle) return null
              
              const traceHistory = truckTraceHistories.get(position.vehicle_id) || []
              
              // Calculate direction from movement for directional arrow
              let rotation = 0
              if (traceHistory.length >= 2) {
                const current = traceHistory[traceHistory.length - 1]
                const previous = traceHistory[traceHistory.length - 2]
                const deltaLat = current.latitude - previous.latitude
                const deltaLng = current.longitude - previous.longitude
                // Calculate bearing in degrees (0° = North, 90° = East)
                rotation = Math.atan2(deltaLng, deltaLat) * (180 / Math.PI)
                // Normalize to 0-360 degrees
                rotation = (rotation + 360) % 360
              }
              
              // Create circular vehicle icon with directional arrow (like screenshot)
              const vehicleIcon = L?.divIcon({
                className: 'custom-vehicle-marker',
                html: `
                  <div class="vehicle-marker ${vehicle.vehicle_type}" style="
                    width: 32px;
                    height: 32px;
                    position: relative;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                  ">
                    <!-- Vehicle Name Label -->
                    <div style="
                      position: absolute;
                      top: -25px;
                      left: 50%;
                      transform: translateX(-50%);
                      background: rgba(30, 41, 59, 0.9);
                      color: white;
                      padding: 2px 6px;
                      border-radius: 4px;
                      font-size: 10px;
                      font-weight: bold;
                      white-space: nowrap;
                      border: 1px solid ${vehicle.vehicle_type === 'autonomous' ? '#3b82f6' : '#ef4444'};
                      z-index: 1000;
                    ">
                      ${position.vehicle_id}
                    </div>
                    
                    <!-- Main Circular Icon -->
                    <div style="
                      width: 28px;
                      height: 28px;
                      border-radius: 50%;
                      background-color: ${vehicle.vehicle_type === 'autonomous' ? '#3b82f6' : '#ef4444'};
                      border: 2px solid white;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      position: relative;
                      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
                      z-index: 999;
                    ">
                      <!-- Directional Arrow -->
                      <div style="
                        width: 0;
                        height: 0;
                        border-left: 6px solid transparent;
                        border-right: 6px solid transparent;
                        border-bottom: 10px solid white;
                        transform: rotate(${rotation}deg);
                        transform-origin: center center;
                      "></div>
                    </div>
                    
                    <!-- Status Dot -->
                    <div style="
                      position: absolute;
                      top: 2px;
                      right: 2px;
                      width: 8px;
                      height: 8px;
                      border-radius: 50%;
                      background-color: #10b981;
                      border: 1px solid white;
                      z-index: 1001;
                    "></div>
                  </div>
                `,
                iconSize: [32, 32],
                iconAnchor: [16, 16]
              })
              
              logger.debug('render-vehicle', `Rendering vehicle ${position.vehicle_id}`, { latitude: position.latitude, longitude: position.longitude })
              
              return (
                <div key={`moving-vehicle-${position.vehicle_id}-${position.timestamp}`}>
                  {/* Trace History (1-minute trail behind truck) - Respects color mode */}
                  {traceHistory.length > 1 && (() => {
                    if (colorMode === 'solid' || vehicle.vehicle_type !== 'autonomous') {
                      // Use solid color for manual vehicles or when solid mode is selected
                      return (
                        <Polyline
                          positions={smoothGPSTrace(traceHistory.map(p => [p.latitude, p.longitude] as [number, number]))}
                          pathOptions={{
                            color: vehicle.vehicle_type === 'autonomous' ? '#3b82f6' : '#ef4444',
                            weight: 4,
                            opacity: trailOpacity,
                          }}
                        />
                      )
                    } else {
                      // Create colored segments for autonomous vehicles based on colorMode with gap detection
                      const segments: React.ReactElement[] = []
                      
                      // Helper function to calculate distance between two GPS points (in meters)
                      const calculateDistance = (point1: TruckPosition, point2: TruckPosition): number => {
                        const R = 6371e3 // Earth's radius in meters
                        const lat1 = point1.latitude * Math.PI / 180
                        const lat2 = point2.latitude * Math.PI / 180
                        const deltaLat = (point2.latitude - point1.latitude) * Math.PI / 180
                        const deltaLng = (point2.longitude - point1.longitude) * Math.PI / 180

                        const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
                                  Math.cos(lat1) * Math.cos(lat2) *
                                  Math.sin(deltaLng/2) * Math.sin(deltaLng/2)
                        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))

                        return R * c
                      }
                      
                      for (let i = 0; i < traceHistory.length - 1; i++) {
                        const currentPoint = traceHistory[i]
                        const nextPoint = traceHistory[i + 1]
                        
                        // Calculate time and distance gaps
                        const timeDiff = new Date(nextPoint.timestamp).getTime() - new Date(currentPoint.timestamp).getTime()
                        const distance = calculateDistance(currentPoint, nextPoint)
                        
                        // Skip drawing line if gap is too large (prevents artificial straight lines)
                        const maxGapMs = 30 * 1000 // 30 seconds max for playback trails
                        const maxDistanceM = 500 // 500 meters max distance
                        
                        if (timeDiff <= maxGapMs && distance <= maxDistanceM) {
                          const segmentColor = getTrailColor(
                            colorMode,
                            ensureSpeedInKmh(currentPoint.speed_kmh),
                            currentPoint.offpath_deviation,
                            currentPoint.states,
                            1
                          )
                          
                          segments.push(
                            <Polyline
                              key={`playback-segment-${position.vehicle_id}-${i}`}
                              positions={[
                                [currentPoint.latitude, currentPoint.longitude],
                                [nextPoint.latitude, nextPoint.longitude]
                              ]}
                              pathOptions={{
                                color: segmentColor,
                                weight: 4,
                                opacity: trailOpacity,
                              }}
                            />
                          )
                        }
                      }
                      return segments
                    }
                  })()}
                  
                  {/* Moving Vehicle Icon */}
                  <Marker 
                    position={[position.latitude, position.longitude]}
                    icon={vehicleIcon}
                    eventHandlers={{
                      click: () => {
                        // Vehicle icon clicks now only show popup, don't select telemetry
                        logger.userAction('vehicle-click', `Clicked vehicle ${position.vehicle_id} for info`)
                      }
                    }}
                  >
                    <Popup>
                      <div className="min-w-72 bg-gray-900 text-white rounded-lg shadow-xl border border-gray-700 p-4">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-3 border-b border-gray-700 pb-2">
                          <div className="flex items-center space-x-2">
                            <div className={`w-4 h-4 rounded-full ${
                              vehicle.vehicle_type === 'autonomous' ? 'bg-blue-500' : 'bg-red-500'
                            }`}></div>
                            <span className="font-bold text-lg text-white">{position.vehicle_id}</span>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              vehicle.vehicle_type === 'autonomous' 
                                ? 'bg-blue-600/20 text-blue-300'
                                : 'bg-red-600/20 text-red-300'
                            }`}>
                              {vehicle.vehicle_type === 'autonomous' ? 'Autonomous' : 'Manual'}
                            </span>
                          </div>
                        </div>
                        
                        {/* Telemetry Data */}
                        <div className="space-y-3">
                          {/* Speed */}
                          <div className="flex items-center justify-between bg-gray-800 rounded-lg p-3">
                            <div className="flex items-center space-x-2">
                              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                              </svg>
                              <span className="text-sm text-gray-300">Speed</span>
                            </div>
                            <span className="text-sm font-bold text-white">
                              {ensureSpeedInKmh(position.speed_kmh).toFixed(1)} km/h
                            </span>
                          </div>
                          
                          {/* Timestamp */}
                          <div className="flex items-center justify-between bg-gray-800 rounded-lg p-3">
                            <div className="flex items-center space-x-2">
                              <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                              <span className="text-sm text-gray-300">Time</span>
                            </div>
                            <span className="text-sm font-mono text-white">
                              {new Date(position.timestamp).toLocaleString('en-AU', {
                                timeZone: 'Australia/Perth',
                                hour12: false,
                                month: 'short',
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit',
                                second: '2-digit'
                              })}
                            </span>
                          </div>
                          
                          {/* Vehicle States */}
                          {(position.states?.motion_controller || position.states?.asset_activity || position.states?.haulage_state) && (
                            <div className="bg-gray-800 rounded-lg p-3">
                              <div className="text-sm font-medium text-gray-300 mb-2 flex items-center space-x-2">
                                <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span>Vehicle States</span>
                              </div>
                              <div className="space-y-1">
                                {position.states?.motion_controller && (
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-400">Motion:</span>
                                    <span className="text-white font-medium capitalize">{position.states.motion_controller.toLowerCase()}</span>
                                  </div>
                                )}
                                {position.states?.asset_activity && (
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-400">Activity:</span>
                                    <span className="text-white font-medium capitalize">{position.states.asset_activity.toLowerCase()}</span>
                                  </div>
                                )}
                                {position.states?.haulage_state && (
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-400">Haulage:</span>
                                    <span className="text-white font-medium capitalize">{position.states.haulage_state.toLowerCase()}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                </div>
              )
            })}
            
            
            {/* Alarm Pin Layer */}
            <AlarmPinLayer 
              alarms={filteredAlarms}
              showAlarms={showAlarms}
              clusterRadius={50}
              timeClusterSeconds={1}
            />
            
            {/* Distance Measurement Tool */}
            <DistanceMeasurementTool 
              isActive={isDistanceToolActive}
              onMeasurementComplete={(measurement) => {
                logger.userAction('distance-measurement', `Measured distance: ${measurement.distance.toFixed(1)}m between ${measurement.startPoint.label} and ${measurement.endPoint.label}`)
              }}
              onClearMeasurements={() => {
                logger.userAction('clear-measurements', 'Cleared all distance measurements')
              }}
              onClose={() => {
                setIsDistanceToolActive(false)
                logger.userAction('distance-tool-close', 'Distance tool closed')
              }}
            />
            
            {/* Trace Point Tooltip */}
            {selectedTracePoint && (
              <Marker
                position={selectedTracePoint.position}
                icon={L?.divIcon({
                  className: 'trace-tooltip-marker',
                  html: '',
                  iconSize: [8, 8],
                  iconAnchor: [4, 4]
                })}
              >
                <Popup
                  closeButton={true}
                  autoClose={false}
                  closeOnClick={false}
                  className="trace-tooltip-popup"
                >
                  <div className="min-w-72 bg-gray-900 text-white rounded-lg shadow-xl border border-gray-700 p-4">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3 border-b border-gray-700 pb-2">
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                        <span className="font-bold text-lg text-white">{selectedTracePoint.vehicleId}</span>
                        <span className="px-2 py-1 rounded-full text-xs font-medium bg-purple-600/20 text-purple-300">
                          Trace Point
                        </span>
                      </div>
                      <button
                        onClick={() => setSelectedTracePoint(null)}
                        className="text-gray-400 hover:text-white transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    
                    {/* Trace Data */}
                    <div className="space-y-3">
                      {/* Speed */}
                      <div className="flex items-center justify-between bg-gray-800 rounded-lg p-3">
                        <div className="flex items-center space-x-2">
                          <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          <span className="text-sm text-gray-300">Speed</span>
                        </div>
                        <span className="text-sm font-bold text-white">
                          {ensureSpeedInKmh(selectedTracePoint.point.speed_kmh).toFixed(1)} km/h
                        </span>
                      </div>
                      
                      {/* Timestamp */}
                      <div className="flex items-center justify-between bg-gray-800 rounded-lg p-3">
                        <div className="flex items-center space-x-2">
                          <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-sm text-gray-300">Timestamp</span>
                        </div>
                        <span className="text-sm font-mono text-white">
                          {new Date(selectedTracePoint.point.timestamp).toLocaleString('en-AU', {
                            timeZone: 'Australia/Perth',
                            hour12: false,
                            month: 'short',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                          })}
                        </span>
                      </div>
                      
                      {/* Location */}
                      <div className="flex items-center justify-between bg-gray-800 rounded-lg p-3">
                        <div className="flex items-center space-x-2">
                          <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span className="text-sm text-gray-300">Location</span>
                        </div>
                        <span className="text-xs font-mono text-white">
                          {selectedTracePoint.point.latitude.toFixed(6)}, {selectedTracePoint.point.longitude.toFixed(6)}
                        </span>
                      </div>
                      
                      {/* Off-path Deviation */}
                      {selectedTracePoint.point.offpath_deviation !== undefined && (
                        <div className="flex items-center justify-between bg-gray-800 rounded-lg p-3">
                          <div className="flex items-center space-x-2">
                            <svg className="w-5 h-5 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12h18M3 8h18M3 16h18" />
                            </svg>
                            <span className="text-sm text-gray-300">Off-Path</span>
                          </div>
                          <span className="text-sm font-bold text-white">
                            {selectedTracePoint.point.offpath_deviation?.toFixed(2) || '0.00'}m
                          </span>
                        </div>
                      )}
                      
                      {/* Vehicle States */}
                      {selectedTracePoint.point.states && (
                        <div className="bg-gray-800 rounded-lg p-3">
                          <div className="text-sm font-medium text-gray-300 mb-2 flex items-center space-x-2">
                            <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span>Vehicle States</span>
                          </div>
                          <div className="space-y-1">
                            {selectedTracePoint.point.states.motion_controller && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-400">Motion:</span>
                                <span className="text-white font-medium capitalize">{selectedTracePoint.point.states.motion_controller.toLowerCase()}</span>
                              </div>
                            )}
                            {selectedTracePoint.point.states.asset_activity && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-400">Activity:</span>
                                <span className="text-white font-medium capitalize">{selectedTracePoint.point.states.asset_activity.toLowerCase()}</span>
                              </div>
                            )}
                            {selectedTracePoint.point.states.haulage_state && (
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-400">Haulage:</span>
                                <span className="text-white font-medium capitalize">{selectedTracePoint.point.states.haulage_state.toLowerCase()}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            )}
          </MapContainer>
        )}
        </div>
      </div>

      {/* Right Sidebar - Playback Controls & Telemetry */}
      <RightSidebar
        // Playback Control Props
        playbackEngine={playbackEngine}
        onTruckPositionUpdate={handleTruckPositionUpdate}
        onFollowTruck={handleFollowTruck}
        onTelemetryTruckChange={handleTelemetryTruckChange}
        globalTimeRange={globalTimeRange}
        playbackStartTime={playbackStartTime}
        playbackEndTime={playbackEndTime}
        onTimeRangeChange={(start, end) => {
          setPlaybackStartTime(start)
          setPlaybackEndTime(end)
          
          // Clear trace histories to prevent artificial connections when time range changes
          setTruckTraceHistories(new Map())
          
          // Filter static vehicle traces based on new time range
          const filteredTraces = new Map()
          vehicleTraces.forEach((trace, vehicleId) => {
            const filteredTrace = trace.filter(point => {
              const pointTime = new Date(point.timestamp).getTime()
              return pointTime >= start && pointTime <= end
            })
            if (filteredTrace.length > 0) {
              filteredTraces.set(vehicleId, filteredTrace)
            }
          })
          setVehicleTraces(filteredTraces)
          
          logger.userAction('time-range-change', `Time range changed to ${new Date(start).toISOString()} - ${new Date(end).toISOString()}`)
        }}
        onTimeRangeReset={() => {
          setPlaybackStartTime(0)
          setPlaybackEndTime(0)
          setTruckTraceHistories(new Map())
          
          // Restore original vehicle traces
          const fullTraces = new Map()
          selectedVehicles.forEach(vehicleId => {
            const trace = vehicleTraces.get(vehicleId)
            if (trace) {
              fullTraces.set(vehicleId, trace)
            }
          })
          setVehicleTraces(fullTraces)
          
          logger.userAction('time-range-reset', 'Time range reset to full dataset')
        }}
        onStop={() => {
          if (playbackEngine) {
            playbackEngine.stop()
          }
        }}
        selectedVehicles={selectedVehicles}
        
        // Telemetry Props
        selectedTruck={selectedTruck}
        followingTruck={followingTruck}
        currentTruckPositions={currentTruckPositions}
      />
    </div>
  )
}
