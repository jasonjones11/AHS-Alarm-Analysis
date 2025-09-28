/**
 * Shape utilities for alarm analysis
 * Provides functions to determine which shapes contain alarm points
 */

import { AlarmDataPoint } from './alarmTrailColors'

// Point-in-polygon utility function
function pointInPolygon(point: [number, number], polygon: number[][]): boolean {
  const [x, y] = point
  let inside = false
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside
    }
  }
  
  return inside
}

// Get shape name for a given point using point-in-polygon calculation
export function getShapeNameForPoint(lat: number, lng: number, geoJsonData: any): string | null {
  if (!geoJsonData || !geoJsonData.features) return null
  
  // Validate coordinates to prevent NaN errors
  if (lat == null || lng == null || isNaN(lat) || isNaN(lng) || 
      !isFinite(lat) || !isFinite(lng) ||
      lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return null
  }
  
  // Excluded AsiTypes that should not be used for boundary calculation
  const excludedAsiTypes = [
    'VectorImageDto_V1',
    'AozShapeDto_V1', 
    'ReferenceShapeDto_V1',
    'ObstacleShapeDto_V1',
    'PinDto_V1'
  ]
  
  for (const feature of geoJsonData.features) {
    // Skip excluded AsiTypes
    const asiType = feature?.properties?.AsiType || ''
    if (excludedAsiTypes.includes(asiType)) {
      continue
    }
    
    if (feature.geometry && feature.geometry.type === 'Polygon') {
      const coordinates = feature.geometry.coordinates[0] // Outer ring
      if (pointInPolygon([lng, lat], coordinates)) {
        return feature.properties?.AsiName || feature.properties?.Name || feature.properties?.name || 'Unknown Shape'
      }
    } else if (feature.geometry && feature.geometry.type === 'MultiPolygon') {
      for (const polygon of feature.geometry.coordinates) {
        const coordinates = polygon[0] // Outer ring of each polygon
        if (pointInPolygon([lng, lat], coordinates)) {
          return feature.properties?.AsiName || feature.properties?.Name || feature.properties?.name || 'Unknown Shape'
        }
      }
    }
  }
  
  return 'Outside Shape Areas'
}

// Get all available shapes that contain alarms
export function getShapesWithAlarms(alarmData: AlarmDataPoint[], geoJsonData: any): { shapeName: string; asiType: string; alarmCount: number }[] {
  if (!geoJsonData || !alarmData.length) return []
  
  const shapeMap = new Map<string, { asiType: string; alarmCount: number }>()
  
  alarmData.forEach(alarm => {
    if (alarm.latitude == null || alarm.longitude == null ||
        isNaN(alarm.latitude) || isNaN(alarm.longitude) ||
        !isFinite(alarm.latitude) || !isFinite(alarm.longitude)) return
    
    const shapeName = getShapeNameForPoint(alarm.latitude, alarm.longitude, geoJsonData)
    if (!shapeName || shapeName === 'Outside Shape Areas') return
    
    // Find the AsiType for this shape name
    const feature = geoJsonData.features?.find((f: any) => 
      f.properties?.AsiName === shapeName || 
      f.properties?.Name === shapeName || 
      f.properties?.name === shapeName
    )
    
    const asiType = feature?.properties?.AsiType || 'Unknown'
    
    if (!shapeMap.has(shapeName)) {
      shapeMap.set(shapeName, { asiType, alarmCount: 0 })
    }
    
    shapeMap.get(shapeName)!.alarmCount++
  })
  
  return Array.from(shapeMap.entries())
    .map(([shapeName, data]) => ({ shapeName, asiType: data.asiType, alarmCount: data.alarmCount }))
    .sort((a, b) => b.alarmCount - a.alarmCount)
}

// Get user-friendly display name for AsiType
export function getAsiTypeDisplayName(asiType: string): string {
  const displayNames: { [key: string]: string } = {
    'EdgeDumpShapeDto_V1': 'Edge Dumps',
    'CrusherDumpShapeDto_V1': 'Crusher Dumps', 
    'LoadShapeDto_V1': 'Load Areas',
    'StationShapeDto_V1': 'Stations',
    'DrivableShapeDto_V1': 'Drivable Areas',
    'RoadShapeDto_V1': 'Roads',
    'ObstacleShapeDto_V1': 'Obstacles',
    'ReferenceShapeDto_V1': 'Reference Areas',
    'VectorImageDto_V1': 'Vector Images',
    'PinDto_V1': 'Pins',
    'AozShapeDto_V1': 'AOZ Shapes',
    'RoughRoadShapeDto_V1': 'Rough Roads'
  }
  
  return displayNames[asiType] || asiType
}

// Filter alarms by selected shape names
export function filterAlarmsByShapes(alarmData: AlarmDataPoint[], selectedShapes: string[], geoJsonData: any): AlarmDataPoint[] {
  if (!selectedShapes.length) return alarmData
  if (!geoJsonData) return alarmData
  
  return alarmData.filter(alarm => {
    if (alarm.latitude == null || alarm.longitude == null || 
        isNaN(alarm.latitude) || isNaN(alarm.longitude) ||
        !isFinite(alarm.latitude) || !isFinite(alarm.longitude)) return false
    
    const shapeName = getShapeNameForPoint(alarm.latitude, alarm.longitude, geoJsonData)
    return shapeName && selectedShapes.includes(shapeName)
  })
}