// Test data for playback system verification
import { PlaybackDataPoint } from '@/utils/PlaybackEngine'

export const generateTestData = (): Map<string, PlaybackDataPoint[]> => {
  const vehicles = ['DT025', 'DT027', 'WC001']
  const dataMap = new Map<string, PlaybackDataPoint[]>()
  
  const baseTime = Date.now() - (30 * 60 * 1000) // 30 minutes ago
  const pointsPerVehicle = 300 // 1 point every 6 seconds for 30 minutes
  
  vehicles.forEach(vehicleId => {
    const points: PlaybackDataPoint[] = []
    const baseLatitude = -22.4569 + (Math.random() - 0.5) * 0.02
    const baseLongitude = 119.9025 + (Math.random() - 0.5) * 0.02
    
    for (let i = 0; i < pointsPerVehicle; i++) {
      const timestamp = new Date(baseTime + i * 6000) // 6-second intervals
      const progress = i / pointsPerVehicle
      
      // Create a circular path for testing
      const angle = progress * Math.PI * 4 // 4 full circles
      const radius = 0.005 // Small radius for visible movement
      
      const latitude = baseLatitude + Math.cos(angle) * radius
      const longitude = baseLongitude + Math.sin(angle) * radius
      
      // Variable speed for testing
      const speed = 5 + Math.sin(progress * Math.PI * 6) * 15 // 0-20 km/h
      
      points.push({
        vehicle_id: vehicleId,
        timestamp: timestamp.toISOString(),
        latitude,
        longitude,
        speed_kmh: Math.max(0, speed),
        offpath_deviation: Math.random() * 2 - 1, // -1 to +1 meters
        states: {
          motion_controller: speed > 2 ? 'FORWARD' : 'STOPPED',
          asset_activity: speed > 10 ? 'HAULING' : 'LOADING',
          haulage_state: Math.random() > 0.5 ? 'LOADED' : 'EMPTY'
        }
      })
    }
    
    dataMap.set(vehicleId, points)
  })
  
  return dataMap
}

export const testVehicleInfo = [
  {
    vehicle_id: 'DT025',
    vehicle_type: 'autonomous' as const,
    data_points: 300,
    time_range: {
      start: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      end: new Date().toISOString()
    }
  },
  {
    vehicle_id: 'DT027', 
    vehicle_type: 'autonomous' as const,
    data_points: 300,
    time_range: {
      start: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      end: new Date().toISOString()
    }
  },
  {
    vehicle_id: 'WC001',
    vehicle_type: 'manual' as const,
    data_points: 300,
    time_range: {
      start: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      end: new Date().toISOString()
    }
  }
]