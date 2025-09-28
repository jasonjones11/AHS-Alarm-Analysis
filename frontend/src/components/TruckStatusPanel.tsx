'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { apiClient } from '@/utils/api'
import TimeSlicerComponent, { TimeRange } from './TimeSlicerComponent'

interface TruckAnalyticsData {
  vehicle_id: string
  total_points: number
  data_points: number
  time_range: {
    start: string
    end: string
  }
  first_timestamp: string
  last_timestamp: string
  // Analytics data
  alarms: {
    total_count: number
    by_type: { [key: string]: number }
    severity_breakdown: { [key: string]: number }
  }
  speed_analytics: {
    overall_avg_speed: number
    max_speed: number
    by_haulage_state: { [key: string]: { avg_speed: number; count: number } }
    by_motion_controller: { [key: string]: { avg_speed: number; count: number } }
    by_asset_activity: { [key: string]: { avg_speed: number; count: number } }
  }
  distance_analytics: {
    total_distance_km: number
    distance_by_haulage_state: { [key: string]: number }
    distance_by_motion_controller: { [key: string]: number }
    distance_by_asset_activity: { [key: string]: number }
  }
}

interface TruckStatusPanelProps {
  isOpen: boolean
  onClose: () => void
  selectedVehicleId: string | null
  onVehicleChange: (vehicleId: string) => void
  availableVehicles: Array<{vehicle_id: string; vehicle_type: string}>
}

export default function TruckStatusPanel({
  isOpen,
  onClose,
  selectedVehicleId,
  onVehicleChange,
  availableVehicles
}: TruckStatusPanelProps) {
  const [analyticsData, setAnalyticsData] = useState<TruckAnalyticsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rawVehicleData, setRawVehicleData] = useState<any[]>([])
  const [filteredVehicleData, setFilteredVehicleData] = useState<any[]>([])
  const [timeRange, setTimeRange] = useState<TimeRange | null>(null)
  
  // Collapsible section states
  const [expandedSections, setExpandedSections] = useState<{
    alarms: boolean
    speedDetails: boolean
    distanceDetails: boolean
  }>({
    alarms: false,
    speedDetails: false,
    distanceDetails: false
  })

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
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

    try {
      if (selectedVehicleId === 'ALL_AUTONOMOUS') {
        // Handle combined autonomous trucks
        const dataToAnalyze = rawVehicleData.filter(point => {
          if (!filterTimeRange) return true
          const pointTime = new Date(point.timestamp)
          return pointTime >= filterTimeRange.start && pointTime <= filterTimeRange.end
        })

        // Get alarms for all autonomous vehicles
        const trucks = await apiClient.getTrucks()
        const autonomousVehicles = trucks.filter(t => availableVehicles.find(v => v.vehicle_id === t.vehicle_id)?.vehicle_type === 'autonomous')
        
        const alarmPromises = autonomousVehicles.map(truck => 
          fetch(`http://127.0.0.1:9500/vehicles/${truck.vehicle_id}/alarms`)
            .then(r => r.json())
            .catch(() => ({ alarms: [] }))
        )
        
        const alarmResults = await Promise.all(alarmPromises)
        const allAlarms = alarmResults.flatMap(result => result.alarms || [])
        
        // Filter alarms by time range if specified
        const alarms = allAlarms.filter((alarm: any) => {
          if (!filterTimeRange) return true
          const alarmTime = new Date(alarm.timestamp)
          return alarmTime >= filterTimeRange.start && alarmTime <= filterTimeRange.end
        })

        // Group filtered data by vehicle for proper analytics calculation
        const vehicleDataForAnalytics: any[] = []
        const vehicleGroups: { [vehicleId: string]: any[] } = {}
        
        // Group data by vehicle_id
        dataToAnalyze.forEach((point: any) => {
          const vehicleId = point.vehicle_id
          if (!vehicleGroups[vehicleId]) {
            vehicleGroups[vehicleId] = []
          }
          vehicleGroups[vehicleId].push(point)
        })
        
        // Convert to vehicle data structure
        Object.entries(vehicleGroups).forEach(([vehicleId, points]) => {
          vehicleDataForAnalytics.push({
            vehicle_id: vehicleId,
            playbook: points,
            alarms: alarms.filter((alarm: any) => alarm.vehicle_id === vehicleId),
            truck: { vehicle_id: vehicleId }
          })
        })

        const analytics = calculateCombinedVehicleAnalytics(vehicleDataForAnalytics, alarms)
        
        // Calculate time range from raw data
        const allTimestamps = rawVehicleData.map(p => p.timestamp).sort()
        const rawDataRange = {
          start: allTimestamps[0] || '',
          end: allTimestamps[allTimestamps.length - 1] || ''
        }
        
        // Calculate time range from filtered data
        const calculatedTimeRange = dataToAnalyze.length > 0 ? {
          start: dataToAnalyze[0].timestamp,
          end: dataToAnalyze[dataToAnalyze.length - 1].timestamp
        } : rawDataRange
        
        setAnalyticsData({
          vehicle_id: 'ALL_AUTONOMOUS',
          total_points: filterTimeRange ? dataToAnalyze.length : rawVehicleData.length,
          data_points: dataToAnalyze.length,
          time_range: filterTimeRange ? calculatedTimeRange : rawDataRange,
          first_timestamp: filterTimeRange ? calculatedTimeRange.start : rawDataRange.start,
          last_timestamp: filterTimeRange ? calculatedTimeRange.end : rawDataRange.end,
          ...analytics
        })
      } else {
        // Handle single vehicle
        const trucks = await apiClient.getTrucks()
        const truck = trucks.find(t => t.vehicle_id === selectedVehicleId)
        
        if (!truck) {
          setError(`Vehicle ${selectedVehicleId} not found`)
          return
        }

        // Apply time filtering to raw data
        const dataToAnalyze = rawVehicleData.filter(point => {
          if (!filterTimeRange) return true
          const pointTime = new Date(point.timestamp)
          return pointTime >= filterTimeRange.start && pointTime <= filterTimeRange.end
        })

        // Get alarms and apply time filtering
        const alarmData = await fetch(`http://127.0.0.1:9500/vehicles/${selectedVehicleId}/alarms`).then(r => r.json()).catch(() => ({ alarms: [] }))
        const allAlarms = alarmData.alarms || []
        
        // Filter alarms by time range if specified
        const alarms = allAlarms.filter((alarm: any) => {
          if (!filterTimeRange) return true
          const alarmTime = new Date(alarm.timestamp)
          return alarmTime >= filterTimeRange.start && alarmTime <= filterTimeRange.end
        })

        // Calculate analytics with filtered data
        const analytics = calculateVehicleAnalytics(dataToAnalyze, alarms, truck)
        
        // Calculate time range from filtered data
        const calculatedTimeRange = dataToAnalyze.length > 0 ? {
          start: dataToAnalyze[0].timestamp,
          end: dataToAnalyze[dataToAnalyze.length - 1].timestamp
        } : {
          start: truck.first_timestamp || '',
          end: truck.last_timestamp || ''
        }
        
        setAnalyticsData({
          vehicle_id: selectedVehicleId,
          total_points: filterTimeRange ? dataToAnalyze.length : (truck.total_points || truck.data_points || 0),
          data_points: dataToAnalyze.length,
          time_range: filterTimeRange ? calculatedTimeRange : (truck.time_range || {
            start: truck.first_timestamp || '',
            end: truck.last_timestamp || ''
          }),
          first_timestamp: filterTimeRange ? calculatedTimeRange.start : truck.first_timestamp || '',
          last_timestamp: filterTimeRange ? calculatedTimeRange.end : truck.last_timestamp || '',
          ...analytics
        })
      }
    } catch (err) {
      setError(`Failed to load analytics for ${selectedVehicleId}: ${err}`)
    } finally {
      setLoading(false)
    }
  }, [selectedVehicleId, rawVehicleData, timeRange, availableVehicles])

  // Load analytics data when vehicle is selected (single or all autonomous)
  useEffect(() => {
    if (selectedVehicleId === 'ALL_AUTONOMOUS') {
      loadCombinedAnalyticsData()
    } else if (selectedVehicleId) {
      loadAnalyticsData(selectedVehicleId)
    }
  }, [selectedVehicleId])


  const loadCombinedAnalyticsData = async () => {
    setLoading(true)
    setError(null)
    
    try {
      // Get all autonomous vehicles
      const trucks = await apiClient.getTrucks()
      const autonomousVehicles = trucks.filter(t => availableVehicles.find(v => v.vehicle_id === t.vehicle_id)?.vehicle_type === 'autonomous')
      
      if (autonomousVehicles.length === 0) {
        setError('No autonomous vehicles found')
        return
      }

      // Load data for all autonomous vehicles
      const vehicleDataPromises = autonomousVehicles.map(async (truck) => {
        const [playbackData, alarmData] = await Promise.all([
          fetch(`http://127.0.0.1:9500/vehicles/${truck.vehicle_id}/playback`).then(r => r.json()).catch(() => ({ data: [] })),
          fetch(`http://127.0.0.1:9500/vehicles/${truck.vehicle_id}/alarms`).then(r => r.json()).catch(() => ({ alarms: [] }))
        ])
        
        return {
          vehicle_id: truck.vehicle_id,
          playbook: playbackData.data || [],
          alarms: alarmData.alarms || [],
          truck: truck
        }
      })

      const vehicleData = await Promise.all(vehicleDataPromises)
      
      // Combine all data
      const allPlaybook = vehicleData.flatMap(v => v.playbook.map((p: any) => ({ ...p, vehicle_id: v.vehicle_id })))
      const allAlarms = vehicleData.flatMap(v => v.alarms.map((a: any) => ({ ...a, vehicle_id: v.vehicle_id })))
      
      // Sort by timestamp
      allPlaybook.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      allAlarms.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

      // Store raw data for time slicing
      setRawVehicleData(allPlaybook)

      // Calculate combined analytics using all vehicle data (time filtering handled by processAnalyticsWithTimeFilter)
      const analytics = calculateCombinedVehicleAnalytics(vehicleData, allAlarms)
      
      setAnalyticsData({
        vehicle_id: 'ALL_AUTONOMOUS',
        total_points: allPlaybook.length,
        data_points: allPlaybook.length,
        time_range: {
          start: allPlaybook.length > 0 ? allPlaybook[0].timestamp : '',
          end: allPlaybook.length > 0 ? allPlaybook[allPlaybook.length - 1].timestamp : ''
        },
        first_timestamp: allPlaybook.length > 0 ? allPlaybook[0].timestamp : '',
        last_timestamp: allPlaybook.length > 0 ? allPlaybook[allPlaybook.length - 1].timestamp : '',
        ...analytics
      })
    } catch (err) {
      setError(`Failed to load combined analytics: ${err}`)
    } finally {
      setLoading(false)
    }
  }

  const loadAnalyticsData = async (vehicleId: string) => {
    setLoading(true)
    setError(null)
    
    try {
      // Load basic truck info
      const trucks = await apiClient.getTrucks()
      const truck = trucks.find(t => t.vehicle_id === vehicleId)
      
      if (!truck) {
        setError(`Vehicle ${vehicleId} not found`)
        return
      }

      // Load detailed analytics data from multiple endpoints
      const [playbackData, alarmData] = await Promise.all([
        fetch(`http://127.0.0.1:9500/vehicles/${vehicleId}/playback`).then(r => r.json()).catch(() => ({ playbook_data: [] })),
        fetch(`http://127.0.0.1:9500/vehicles/${vehicleId}/alarms`).then(r => r.json()).catch(() => ({ alarms: [] }))
      ])

      const playbook = playbackData.data || []
      const alarms = alarmData.alarms || []

      // Store raw data for time slicing
      setRawVehicleData(playbook)

      // Use filtered data for analytics (or raw data if no filter)
      const dataToAnalyze = timeRange ? playbook.filter((point: any) => {
        const pointTime = new Date(point.timestamp)
        return pointTime >= timeRange.start && pointTime <= timeRange.end
      }) : playbook

      // Calculate analytics
      const analytics = calculateVehicleAnalytics(dataToAnalyze, alarms, truck)
      
      setAnalyticsData({
        vehicle_id: vehicleId,
        total_points: truck.total_points || truck.data_points || 0,
        data_points: truck.data_points || truck.total_points || 0,
        time_range: truck.time_range || {
          start: truck.first_timestamp || '',
          end: truck.last_timestamp || ''
        },
        first_timestamp: truck.first_timestamp || '',
        last_timestamp: truck.last_timestamp || '',
        ...analytics
      })
    } catch (err) {
      setError(`Failed to load analytics for ${vehicleId}: ${err}`)
    } finally {
      setLoading(false)
    }
  }

  // Calculate combined analytics for multiple vehicles
  const calculateCombinedVehicleAnalytics = (vehicleData: any[], allAlarms: any[]) => {
    let totalDistance = 0
    let totalSpeed = 0
    let totalPointsCount = 0
    let maxSpeed = 0
    
    const alarmsByTitle: { [key: string]: number } = {}
    const severityBreakdown: { [key: string]: number } = {}
    
    const speedByHaulage: { [key: string]: { speeds: number[]; count: number } } = {}
    const speedByMotion: { [key: string]: { speeds: number[]; count: number } } = {}
    const speedByActivity: { [key: string]: { speeds: number[]; count: number } } = {}
    
    const distanceByHaulage: { [key: string]: number } = {}
    const distanceByMotion: { [key: string]: number } = {}
    const distanceByActivity: { [key: string]: number } = {}
    
    // Process alarms
    allAlarms.forEach((alarm: any) => {
      const title = alarm.alarm_title || 
                   alarm.title || 
                   alarm.Title || 
                   alarm.alarm_name || 
                   alarm.name || 
                   alarm.message || 
                   alarm.description || 
                   alarm.type ||
                   JSON.stringify(alarm) ||
                   'Unknown Alarm'
      
      const severity = alarm.severity || alarm.level || 'info'
      alarmsByTitle[title] = (alarmsByTitle[title] || 0) + 1
      severityBreakdown[severity] = (severityBreakdown[severity] || 0) + 1
    })
    
    // Process each vehicle's data separately
    vehicleData.forEach(vehicle => {
      const playbook = vehicle.playbook
      if (!playbook || playbook.length === 0) return
      
      // Calculate distance for this vehicle only
      let vehicleDistance = 0
      for (let i = 1; i < playbook.length; i++) {
        const point = playbook[i]
        const prevPoint = playbook[i - 1]
        const speed = Math.abs(point.speed_kmh || 0)
        const timeInterval = (new Date(point.timestamp).getTime() - new Date(prevPoint.timestamp).getTime()) / 1000
        const distanceM = speed * (1000/3600) * timeInterval
        const distanceKm = distanceM / 1000
        vehicleDistance += distanceKm
        
        // Add to state-based distance tracking
        const haulageState = point.states?.haulage_state || 'Unknown'
        const motionState = point.states?.motion_controller || 'Unknown'
        const activityState = point.states?.asset_activity || 'Unknown'
        
        distanceByHaulage[haulageState] = (distanceByHaulage[haulageState] || 0) + distanceKm
        distanceByMotion[motionState] = (distanceByMotion[motionState] || 0) + distanceKm
        distanceByActivity[activityState] = (distanceByActivity[activityState] || 0) + distanceKm
      }
      totalDistance += vehicleDistance
      
      // Process speed data for each point
      playbook.forEach((point: any) => {
        const speed = Math.abs(point.speed_kmh || 0)
        const haulageState = point.states?.haulage_state || 'Unknown'
        const motionState = point.states?.motion_controller || 'Unknown'
        const activityState = point.states?.asset_activity || 'Unknown'
        
        totalSpeed += speed
        totalPointsCount++
        maxSpeed = Math.max(maxSpeed, speed)
        
        // Speed by haulage state
        if (!speedByHaulage[haulageState]) {
          speedByHaulage[haulageState] = { speeds: [], count: 0 }
        }
        speedByHaulage[haulageState].speeds.push(speed)
        speedByHaulage[haulageState].count++
        
        // Speed by motion controller
        if (!speedByMotion[motionState]) {
          speedByMotion[motionState] = { speeds: [], count: 0 }
        }
        speedByMotion[motionState].speeds.push(speed)
        speedByMotion[motionState].count++
        
        // Speed by asset activity
        if (!speedByActivity[activityState]) {
          speedByActivity[activityState] = { speeds: [], count: 0 }
        }
        speedByActivity[activityState].speeds.push(speed)
        speedByActivity[activityState].count++
      })
    })

    // Calculate averages for all state categories
    const avgSpeedByHaulage: { [key: string]: { avg_speed: number; count: number } } = {}
    Object.entries(speedByHaulage).forEach(([state, data]) => {
      avgSpeedByHaulage[state] = {
        avg_speed: data.speeds.reduce((a, b) => a + b, 0) / data.speeds.length,
        count: data.count
      }
    })
    
    const avgSpeedByMotion: { [key: string]: { avg_speed: number; count: number } } = {}
    Object.entries(speedByMotion).forEach(([state, data]) => {
      avgSpeedByMotion[state] = {
        avg_speed: data.speeds.reduce((a, b) => a + b, 0) / data.speeds.length,
        count: data.count
      }
    })
    
    const avgSpeedByActivity: { [key: string]: { avg_speed: number; count: number } } = {}
    Object.entries(speedByActivity).forEach(([state, data]) => {
      avgSpeedByActivity[state] = {
        avg_speed: data.speeds.reduce((a, b) => a + b, 0) / data.speeds.length,
        count: data.count
      }
    })

    return {
      alarms: {
        total_count: allAlarms.length,
        by_type: alarmsByTitle,
        severity_breakdown: severityBreakdown
      },
      speed_analytics: {
        overall_avg_speed: totalPointsCount > 0 ? totalSpeed / totalPointsCount : 0,
        max_speed: maxSpeed,
        by_haulage_state: avgSpeedByHaulage,
        by_motion_controller: avgSpeedByMotion,
        by_asset_activity: avgSpeedByActivity
      },
      distance_analytics: {
        total_distance_km: totalDistance,
        distance_by_haulage_state: distanceByHaulage,
        distance_by_motion_controller: distanceByMotion,
        distance_by_asset_activity: distanceByActivity
      }
    }
  }

  // Calculate comprehensive analytics from playbook data
  const calculateVehicleAnalytics = (playbook: any[], alarms: any[], truck: any) => {
    // Alarm analytics - group by alarm title instead of type
    const alarmsByTitle: { [key: string]: number } = {}
    const severityBreakdown: { [key: string]: number } = {}
    
    alarms.forEach((alarm: any) => {
      // Debug: Log alarm structure to help identify correct field names
      if (alarms.length > 0 && alarms.indexOf(alarm) === 0) {
        console.log('First alarm data structure:', alarm)
        console.log('Available alarm fields:', Object.keys(alarm))
      }
      
      // Try multiple possible field names for alarm title
      const title = alarm.alarm_title || 
                   alarm.title || 
                   alarm.Title || 
                   alarm.alarm_name || 
                   alarm.name || 
                   alarm.message || 
                   alarm.description || 
                   alarm.type ||
                   JSON.stringify(alarm) || // Fallback to show raw data
                   'Unknown Alarm'
      
      const severity = alarm.severity || alarm.level || 'info'
      alarmsByTitle[title] = (alarmsByTitle[title] || 0) + 1
      severityBreakdown[severity] = (severityBreakdown[severity] || 0) + 1
    })

    // Speed and distance analytics for all state categories
    const speedByHaulage: { [key: string]: { speeds: number[]; count: number } } = {}
    const speedByMotion: { [key: string]: { speeds: number[]; count: number } } = {}
    const speedByActivity: { [key: string]: { speeds: number[]; count: number } } = {}
    
    const distanceByHaulage: { [key: string]: number } = {}
    const distanceByMotion: { [key: string]: number } = {}
    const distanceByActivity: { [key: string]: number } = {}
    
    let totalDistance = 0
    let maxSpeed = 0
    let totalSpeed = 0

    for (let i = 0; i < playbook.length; i++) {
      const point = playbook[i]
      const speed = Math.abs(point.speed_kmh || 0)
      const haulageState = point.states?.haulage_state || 'Unknown'
      const motionState = point.states?.motion_controller || 'Unknown'
      const activityState = point.states?.asset_activity || 'Unknown'
      
      // Speed analytics
      totalSpeed += speed
      maxSpeed = Math.max(maxSpeed, speed)
      
      // Speed by haulage state
      if (!speedByHaulage[haulageState]) {
        speedByHaulage[haulageState] = { speeds: [], count: 0 }
      }
      speedByHaulage[haulageState].speeds.push(speed)
      speedByHaulage[haulageState].count++
      
      // Speed by motion controller
      if (!speedByMotion[motionState]) {
        speedByMotion[motionState] = { speeds: [], count: 0 }
      }
      speedByMotion[motionState].speeds.push(speed)
      speedByMotion[motionState].count++
      
      // Speed by asset activity
      if (!speedByActivity[activityState]) {
        speedByActivity[activityState] = { speeds: [], count: 0 }
      }
      speedByActivity[activityState].speeds.push(speed)
      speedByActivity[activityState].count++
      
      // Distance calculation (speed * time interval)
      if (i > 0) {
        const prevPoint = playbook[i - 1]
        const timeInterval = (new Date(point.timestamp).getTime() - new Date(prevPoint.timestamp).getTime()) / 1000 // seconds
        const distanceM = speed * (1000/3600) * timeInterval // convert km/h to m/s, then multiply by time
        const distanceKm = distanceM / 1000 // convert to km
        totalDistance += distanceKm
        
        // Distance by each state category
        distanceByHaulage[haulageState] = (distanceByHaulage[haulageState] || 0) + distanceKm
        distanceByMotion[motionState] = (distanceByMotion[motionState] || 0) + distanceKm
        distanceByActivity[activityState] = (distanceByActivity[activityState] || 0) + distanceKm
      }
    }

    // Calculate averages for all state categories
    const avgSpeedByHaulage: { [key: string]: { avg_speed: number; count: number } } = {}
    Object.entries(speedByHaulage).forEach(([state, data]) => {
      avgSpeedByHaulage[state] = {
        avg_speed: data.speeds.reduce((a, b) => a + b, 0) / data.speeds.length,
        count: data.count
      }
    })
    
    const avgSpeedByMotion: { [key: string]: { avg_speed: number; count: number } } = {}
    Object.entries(speedByMotion).forEach(([state, data]) => {
      avgSpeedByMotion[state] = {
        avg_speed: data.speeds.reduce((a, b) => a + b, 0) / data.speeds.length,
        count: data.count
      }
    })
    
    const avgSpeedByActivity: { [key: string]: { avg_speed: number; count: number } } = {}
    Object.entries(speedByActivity).forEach(([state, data]) => {
      avgSpeedByActivity[state] = {
        avg_speed: data.speeds.reduce((a, b) => a + b, 0) / data.speeds.length,
        count: data.count
      }
    })

    return {
      alarms: {
        total_count: alarms.length,
        by_type: alarmsByTitle,
        severity_breakdown: severityBreakdown
      },
      speed_analytics: {
        overall_avg_speed: playbook.length > 0 ? totalSpeed / playbook.length : 0,
        max_speed: maxSpeed,
        by_haulage_state: avgSpeedByHaulage,
        by_motion_controller: avgSpeedByMotion,
        by_asset_activity: avgSpeedByActivity
      },
      distance_analytics: {
        total_distance_km: totalDistance,
        distance_by_haulage_state: distanceByHaulage,
        distance_by_motion_controller: distanceByMotion,
        distance_by_asset_activity: distanceByActivity
      }
    }
  }

  const formatDuration = (start: string, end: string) => {
    if (!start || !end) return 'Unknown'
    const startTime = new Date(start).getTime()
    const endTime = new Date(end).getTime()
    const durationMs = endTime - startTime
    const minutes = Math.round(durationMs / 60000)
    if (minutes < 60) return `${minutes}min`
    const hours = Math.floor(minutes / 60)
    const remainingMins = minutes % 60
    return `${hours}h ${remainingMins}min`
  }

  const formatTimestamp = (timestamp: string) => {
    if (!timestamp) return 'Unknown'
    return new Date(timestamp).toLocaleString('en-AU', {
      timeZone: 'Australia/Perth',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
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

  if (!isOpen) return null

  return (
    <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-gray-700">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center space-x-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <span>Vehicle Analytics Dashboard</span>
          </h2>
          <p className="text-gray-400 mt-1">Comprehensive performance analysis and operational insights</p>
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

      {/* Vehicle Selection */}
      <div className="p-6 bg-gradient-to-r from-gray-800 to-gray-700 border-b border-gray-700">
        <div className="flex items-center space-x-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-300 mb-2">Select Vehicle</label>
            <select
              value={selectedVehicleId || ''}
              onChange={(e) => onVehicleChange(e.target.value)}
              className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-600 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none transition-colors"
            >
              <option value="">Choose a vehicle for analysis...</option>
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
                  <div className="p-2 bg-purple-500/20 rounded-lg">
                    <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      </div>

      {/* Time Slicer */}
      {rawVehicleData.length > 0 && (
        <div className="p-6 bg-gray-800 border-b border-gray-700">
          <TimeSlicerComponent
            alarmData={rawVehicleData}
            onTimeRangeChange={handleTimeRangeChange}
            onApplyFilter={processAnalyticsWithTimeFilter}
            disabled={loading}
            className=""
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center space-x-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
              <span className="text-gray-400">Loading analytics data...</span>
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

        {analyticsData && !loading && (
          <div className="space-y-6">
            {/* Overview Statistics */}
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/20 p-6 rounded-lg border border-blue-500/30">
                <div className="text-3xl font-bold text-blue-400 mb-2">{analyticsData.total_points.toLocaleString()}</div>
                <div className="text-sm text-blue-300 font-medium">Total Data Points</div>
                <div className="text-xs text-gray-400 mt-1">GPS and telemetry records</div>
              </div>
              <div className="bg-gradient-to-br from-green-500/10 to-green-600/20 p-6 rounded-lg border border-green-500/30">
                <div className="text-3xl font-bold text-green-400 mb-2">{analyticsData.speed_analytics.overall_avg_speed.toFixed(1)}</div>
                <div className="text-sm text-green-300 font-medium">Average Speed</div>
                <div className="text-xs text-gray-400 mt-1">km/h operational average</div>
              </div>
              <div className="bg-gradient-to-br from-purple-500/10 to-purple-600/20 p-6 rounded-lg border border-purple-500/30">
                <div className="text-3xl font-bold text-purple-400 mb-2">{analyticsData.distance_analytics.total_distance_km.toFixed(1)}</div>
                <div className="text-sm text-purple-300 font-medium">Total Distance</div>
                <div className="text-xs text-gray-400 mt-1">kilometers traveled</div>
              </div>
              <div className="bg-gradient-to-br from-red-500/10 to-red-600/20 p-6 rounded-lg border border-red-500/30">
                <div className="text-3xl font-bold text-red-400 mb-2">{analyticsData.alarms.total_count}</div>
                <div className="text-sm text-red-300 font-medium">Total Alarms</div>
                <div className="text-xs text-gray-400 mt-1">operational alerts</div>
              </div>
            </div>

            {/* Operational Timeline */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center space-x-2">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Operational Timeline</span>
              </h3>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="text-sm text-gray-400 mb-1">Start Time</div>
                  <div className="text-lg text-white">{formatTimestamp(analyticsData.first_timestamp)}</div>
                </div>
                <div>
                  <div className="text-sm text-gray-400 mb-1">End Time</div>
                  <div className="text-lg text-white">{formatTimestamp(analyticsData.last_timestamp)}</div>
                </div>
              </div>
              <div className="mt-4">
                <div className="text-sm text-gray-400 mb-1">Total Duration</div>
                <div className="text-xl font-bold text-yellow-400">
                  {formatDuration(analyticsData.time_range.start, analyticsData.time_range.end)}
                </div>
              </div>
            </div>

            {/* Speed Analysis */}
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white flex items-center space-x-2">
                  <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                  <span>Speed Performance</span>
                </h3>
                <div className="text-2xl font-bold text-green-400">
                  Max: {analyticsData.speed_analytics.max_speed.toFixed(1)} km/h
                </div>
              </div>
              
              <button
                onClick={() => toggleSection('speedDetails')}
                className="w-full flex items-center justify-between text-gray-400 hover:text-white transition-colors mb-4"
              >
                <span>View detailed speed breakdown by operational states</span>
                <svg 
                  className={`w-5 h-5 transition-transform ${expandedSections.speedDetails ? 'rotate-90' : ''}`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {expandedSections.speedDetails && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-gray-700/50 rounded-lg p-4">
                    <h4 className="text-lg font-semibold text-white mb-3">Haulage States</h4>
                    <div className="space-y-2">
                      {Object.entries(analyticsData.speed_analytics.by_haulage_state || {})
                        .sort(([, a], [, b]) => b.avg_speed - a.avg_speed)
                        .map(([state, data]) => (
                          <div key={state} className="flex justify-between items-center">
                            <span className="text-gray-300 text-sm">{state}</span>
                            <span className="text-blue-400 font-mono">{data.avg_speed.toFixed(1)} km/h</span>
                          </div>
                        ))}
                    </div>
                  </div>
                  <div className="bg-gray-700/50 rounded-lg p-4">
                    <h4 className="text-lg font-semibold text-white mb-3">Motion Controller</h4>
                    <div className="space-y-2">
                      {Object.entries(analyticsData.speed_analytics.by_motion_controller || {})
                        .sort(([, a], [, b]) => b.avg_speed - a.avg_speed)
                        .map(([state, data]) => (
                          <div key={state} className="flex justify-between items-center">
                            <span className="text-gray-300 text-sm">{state}</span>
                            <span className="text-green-400 font-mono">{data.avg_speed.toFixed(1)} km/h</span>
                          </div>
                        ))}
                    </div>
                  </div>
                  <div className="bg-gray-700/50 rounded-lg p-4">
                    <h4 className="text-lg font-semibold text-white mb-3">Asset Activity</h4>
                    <div className="space-y-2">
                      {Object.entries(analyticsData.speed_analytics.by_asset_activity || {})
                        .sort(([, a], [, b]) => b.avg_speed - a.avg_speed)
                        .map(([state, data]) => (
                          <div key={state} className="flex justify-between items-center">
                            <span className="text-gray-300 text-sm">{state}</span>
                            <span className="text-purple-400 font-mono">{data.avg_speed.toFixed(1)} km/h</span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Alarm Analysis */}
            {analyticsData.alarms.total_count > 0 && (
              <div className="bg-gray-800 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-white flex items-center space-x-2">
                    <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <span>Alarm Analysis</span>
                  </h3>
                  <div className="flex items-center space-x-2">
                    <div className={`px-3 py-1 text-sm rounded-full ${
                      analyticsData.alarms.total_count > 10 
                        ? 'bg-red-500/30 text-red-200' 
                        : analyticsData.alarms.total_count > 5 
                          ? 'bg-yellow-500/30 text-yellow-200' 
                          : 'bg-green-500/30 text-green-200'
                    }`}>
                      {analyticsData.alarms.total_count > 10 
                        ? `HIGH (${analyticsData.alarms.total_count} alarms)` 
                        : analyticsData.alarms.total_count > 5 
                          ? `MODERATE (${analyticsData.alarms.total_count} alarms)` 
                          : `LOW (${analyticsData.alarms.total_count} alarms)`}
                    </div>
                    <div className="group relative">
                      <svg className="w-4 h-4 text-gray-400 hover:text-gray-300 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="absolute bottom-full right-0 mb-2 w-64 p-2 bg-gray-900 text-gray-200 text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50">
                        <div className="font-medium mb-1">Alarm Severity Classification:</div>
                        <div>• HIGH: More than 10 alarms</div>
                        <div>• MODERATE: 6-10 alarms</div>
                        <div>• LOW: 5 or fewer alarms</div>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => toggleSection('alarms')}
                  className="w-full flex items-center justify-between text-gray-400 hover:text-white transition-colors mb-4"
                >
                  <span>View alarm breakdown by title ({Object.keys(analyticsData.alarms.by_type || {}).length} alarm types)</span>
                  <svg 
                    className={`w-5 h-5 transition-transform ${expandedSections.alarms ? 'rotate-90' : ''}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {expandedSections.alarms && (
                  <div className="space-y-3">
                    <div className="text-sm text-gray-400 mb-3">
                      Alarm breakdown by title (showing {analyticsData.alarms.total_count} alarms across {Object.keys(analyticsData.alarms.by_type || {}).length} types)
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      {Object.entries(analyticsData.alarms.by_type || {})
                        .sort(([, a], [, b]) => (b as number) - (a as number))
                        .map(([title, count]) => (
                          <div key={title} className="bg-gray-700/50 rounded-lg p-4 border border-red-500/20">
                            <div className="flex justify-between items-start">
                              <div className="flex-1">
                                <span className="text-gray-200 font-medium text-sm block">{title}</span>
                                <span className="text-gray-400 text-xs mt-1">Alarm Title</span>
                              </div>
                              <div className="text-right">
                                <span className="text-red-400 font-bold text-xl">{count}</span>
                                <div className="text-gray-400 text-xs mt-1">occurrences</div>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Distance Analysis */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-xl font-bold text-white mb-4 flex items-center space-x-2">
                <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                </svg>
                <span>Distance Analysis</span>
              </h3>

              <button
                onClick={() => toggleSection('distanceDetails')}
                className="w-full flex items-center justify-between text-gray-400 hover:text-white transition-colors mb-4"
              >
                <span>View distance breakdown by operational states</span>
                <svg 
                  className={`w-5 h-5 transition-transform ${expandedSections.distanceDetails ? 'rotate-90' : ''}`}
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {expandedSections.distanceDetails && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-gray-700/50 rounded-lg p-4">
                    <h4 className="text-lg font-semibold text-white mb-3">Haulage States</h4>
                    <div className="space-y-2">
                      {Object.entries(analyticsData.distance_analytics.distance_by_haulage_state || {})
                        .sort(([, a], [, b]) => (b as number) - (a as number))
                        .map(([state, distance]) => (
                          <div key={state} className="flex justify-between items-center">
                            <span className="text-gray-300 text-sm">{state}</span>
                            <span className="text-blue-400 font-mono">{(distance as number).toFixed(1)} km</span>
                          </div>
                        ))}
                    </div>
                  </div>
                  <div className="bg-gray-700/50 rounded-lg p-4">
                    <h4 className="text-lg font-semibold text-white mb-3">Motion Controller</h4>
                    <div className="space-y-2">
                      {Object.entries(analyticsData.distance_analytics.distance_by_motion_controller || {})
                        .sort(([, a], [, b]) => (b as number) - (a as number))
                        .map(([state, distance]) => (
                          <div key={state} className="flex justify-between items-center">
                            <span className="text-gray-300 text-sm">{state}</span>
                            <span className="text-green-400 font-mono">{(distance as number).toFixed(1)} km</span>
                          </div>
                        ))}
                    </div>
                  </div>
                  <div className="bg-gray-700/50 rounded-lg p-4">
                    <h4 className="text-lg font-semibold text-white mb-3">Asset Activity</h4>
                    <div className="space-y-2">
                      {Object.entries(analyticsData.distance_analytics.distance_by_asset_activity || {})
                        .sort(([, a], [, b]) => (b as number) - (a as number))
                        .map(([state, distance]) => (
                          <div key={state} className="flex justify-between items-center">
                            <span className="text-gray-300 text-sm">{state}</span>
                            <span className="text-purple-400 font-mono">{(distance as number).toFixed(1)} km</span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {!analyticsData && !loading && !error && (
          <div className="text-center py-12">
            <svg className="w-20 h-20 mx-auto mb-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <h3 className="text-xl font-bold text-white mb-2">Select a Vehicle for Analysis</h3>
            <p className="text-gray-400">Choose a vehicle from the dropdown above to view comprehensive analytics including speed performance, distance metrics, and alarm analysis.</p>
          </div>
        )}
      </div>
    </div>
  )
}