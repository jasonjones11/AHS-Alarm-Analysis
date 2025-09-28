/**
 * Trail color utilities for alarm analysis visualization
 * Supports speed, off-path error, pitch, and roll coloring
 */

export type TrailColorMode = 'speed' | 'off_path' | 'pitch' | 'roll'

export interface AlarmDataPoint {
  vehicle_id: string
  timestamp: string
  latitude: number | null
  longitude: number | null
  speed_kmh: number
  alarm_type: string
  alarm_title: string
  off_path_error_m: number | null
  pitch_deg: number
  roll_deg: number
}

/**
 * Get color for speed-based trail visualization
 */
export function getSpeedColor(speedKmh: number): string {
  // Speed color scale from green (slow) to red (fast)
  const absSpeed = Math.abs(speedKmh)
  
  if (absSpeed === 0) return '#808080' // Gray for stopped
  if (absSpeed < 5) return '#00ff00'   // Green for very slow
  if (absSpeed < 10) return '#80ff00'  // Light green
  if (absSpeed < 20) return '#ffff00'  // Yellow
  if (absSpeed < 30) return '#ff8000'  // Orange  
  if (absSpeed < 40) return '#ff4000'  // Red-orange
  return '#ff0000'                     // Red for fast
}

/**
 * Get color for off-path error visualization
 */
export function getOffPathColor(offPathErrorM: number | null): string {
  if (offPathErrorM === null || offPathErrorM === undefined) {
    return '#808080' // Gray for no data
  }
  
  const absError = Math.abs(offPathErrorM)
  
  if (absError === 0) return '#00ff00'      // Green for on path
  if (absError < 0.5) return '#80ff00'      // Light green
  if (absError < 1.0) return '#ffff00'      // Yellow
  if (absError < 2.0) return '#ff8000'      // Orange
  if (absError < 3.0) return '#ff4000'      // Red-orange
  return '#ff0000'                          // Red for severely off path
}

/**
 * Get color for pitch visualization (absolute value with 2.86 deg threshold)
 */
export function getPitchColor(pitchDeg: number): string {
  const absPitch = Math.abs(pitchDeg)
  const threshold = 2.86
  
  if (absPitch < threshold * 0.2) return '#00ff00'  // Green for minimal pitch
  if (absPitch < threshold * 0.4) return '#80ff00'  // Light green
  if (absPitch < threshold * 0.6) return '#ffff00'  // Yellow
  if (absPitch < threshold * 0.8) return '#ff8000'  // Orange
  if (absPitch < threshold) return '#ff4000'        // Red-orange approaching limit
  return '#ff0000'                                  // Red for exceeding threshold
}

/**
 * Get color for roll visualization (absolute value with 2.86 deg threshold) 
 */
export function getRollColor(rollDeg: number): string {
  const absRoll = Math.abs(rollDeg)
  const threshold = 2.86
  
  if (absRoll < threshold * 0.2) return '#00ff00'   // Green for minimal roll
  if (absRoll < threshold * 0.4) return '#80ff00'   // Light green
  if (absRoll < threshold * 0.6) return '#ffff00'   // Yellow
  if (absRoll < threshold * 0.8) return '#ff8000'   // Orange
  if (absRoll < threshold) return '#ff4000'         // Red-orange approaching limit
  return '#ff0000'                                  // Red for exceeding threshold
}

/**
 * Get trail color based on selected mode and data point
 */
export function getTrailColor(dataPoint: AlarmDataPoint, mode: TrailColorMode): string {
  switch (mode) {
    case 'speed':
      return getSpeedColor(dataPoint.speed_kmh)
    case 'off_path':
      return getOffPathColor(dataPoint.off_path_error_m)
    case 'pitch':
      return getPitchColor(dataPoint.pitch_deg)
    case 'roll':
      return getRollColor(dataPoint.roll_deg)
    default:
      return '#808080' // Gray default
  }
}

/**
 * Get legend information for each color mode
 */
export function getLegendInfo(mode: TrailColorMode) {
  switch (mode) {
    case 'speed':
      return {
        title: 'Speed (km/h)',
        items: [
          { color: '#808080', label: 'Stopped (0)' },
          { color: '#00ff00', label: 'Very Slow (0-5)' },
          { color: '#80ff00', label: 'Slow (5-10)' },
          { color: '#ffff00', label: 'Medium (10-20)' },
          { color: '#ff8000', label: 'Fast (20-30)' },
          { color: '#ff4000', label: 'Very Fast (30-40)' },
          { color: '#ff0000', label: 'Extreme (40+)' }
        ]
      }
    
    case 'off_path':
      return {
        title: 'Off Path Error (m)',
        items: [
          { color: '#808080', label: 'No Data' },
          { color: '#00ff00', label: 'On Path (0)' },
          { color: '#80ff00', label: 'Minor (0-0.5)' },
          { color: '#ffff00', label: 'Moderate (0.5-1.0)' },
          { color: '#ff8000', label: 'High (1.0-2.0)' },
          { color: '#ff4000', label: 'Severe (2.0-3.0)' },
          { color: '#ff0000', label: 'Critical (3.0+)' }
        ]
      }
    
    case 'pitch':
      return {
        title: 'Pitch Angle (degrees)',
        items: [
          { color: '#00ff00', label: 'Minimal (0-0.57)' },
          { color: '#80ff00', label: 'Low (0.57-1.14)' },
          { color: '#ffff00', label: 'Medium (1.14-1.72)' },
          { color: '#ff8000', label: 'High (1.72-2.29)' },
          { color: '#ff4000', label: 'Near Limit (2.29-2.86)' },
          { color: '#ff0000', label: 'Over Limit (2.86+)' }
        ]
      }
    
    case 'roll':
      return {
        title: 'Roll Angle (degrees)', 
        items: [
          { color: '#00ff00', label: 'Minimal (0-0.57)' },
          { color: '#80ff00', label: 'Low (0.57-1.14)' },
          { color: '#ffff00', label: 'Medium (1.14-1.72)' },
          { color: '#ff8000', label: 'High (1.72-2.29)' },
          { color: '#ff4000', label: 'Near Limit (2.29-2.86)' },
          { color: '#ff0000', label: 'Over Limit (2.86+)' }
        ]
      }
    
    default:
      return {
        title: 'Unknown',
        items: []
      }
  }
}

/**
 * Get range statistics for data points in a specific mode
 */
export function getDataRangeStats(dataPoints: AlarmDataPoint[], mode: TrailColorMode) {
  if (dataPoints.length === 0) {
    return { min: 0, max: 0, avg: 0, count: 0 }
  }
  
  let values: number[] = []
  
  switch (mode) {
    case 'speed':
      values = dataPoints.map(p => Math.abs(p.speed_kmh))
      break
    case 'off_path':
      values = dataPoints
        .filter(p => p.off_path_error_m !== null)
        .map(p => Math.abs(p.off_path_error_m!))
      break
    case 'pitch':
      values = dataPoints.map(p => Math.abs(p.pitch_deg))
      break
    case 'roll':
      values = dataPoints.map(p => Math.abs(p.roll_deg))
      break
  }
  
  if (values.length === 0) {
    return { min: 0, max: 0, avg: 0, count: 0 }
  }
  
  const min = Math.min(...values)
  const max = Math.max(...values)
  const avg = values.reduce((sum, val) => sum + val, 0) / values.length
  
  return {
    min: Number(min.toFixed(2)),
    max: Number(max.toFixed(2)),
    avg: Number(avg.toFixed(2)),
    count: values.length
  }
}