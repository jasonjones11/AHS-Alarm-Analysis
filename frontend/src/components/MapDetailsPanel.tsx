'use client'

import React, { useMemo, useState } from 'react'

interface MapShape {
  id: string
  name: string
  type: string
  vertexCount: number
  geometry: any
}

interface MapDetailsPanelProps {
  geoJsonData?: any
  isVisible?: boolean
  onClose?: () => void
}

interface ShapeTypeStats {
  type: string
  displayName: string
  count: number
  totalVertices: number
  shapes: MapShape[]
}

const MapDetailsPanel: React.FC<MapDetailsPanelProps> = ({ 
  geoJsonData, 
  isVisible = true,
  onClose
}) => {
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set())

  // Process GeoJSON data to extract shape statistics
  const shapeStats = useMemo(() => {
    if (!geoJsonData?.features) return []

    const typeMap = new Map<string, ShapeTypeStats>()

    geoJsonData.features.forEach((feature: any) => {
      const asiType = feature.properties?.AsiType || 'Unknown'
      const asiName = feature.properties?.AsiName || 'Unnamed'
      const asiId = feature.properties?.AsiID || `feature_${feature.properties?.OBJECTID || feature.id || 'unknown'}`

      // Count vertices based on geometry type
      let vertexCount = 0
      if (feature.geometry) {
        if (feature.geometry.type === 'Polygon') {
          vertexCount = feature.geometry.coordinates[0]?.length || 0
        } else if (feature.geometry.type === 'LineString') {
          vertexCount = feature.geometry.coordinates?.length || 0
        } else if (feature.geometry.type === 'GeometryCollection') {
          // Sum vertices from all geometries in collection
          vertexCount = feature.geometry.geometries?.reduce((sum: number, geom: any) => {
            if (geom.type === 'LineString') {
              return sum + (geom.coordinates?.length || 0)
            } else if (geom.type === 'Polygon') {
              return sum + (geom.coordinates[0]?.length || 0)
            }
            return sum
          }, 0) || 0
        }
      }

      const shape: MapShape = {
        id: asiId,
        name: asiName,
        type: asiType,
        vertexCount,
        geometry: feature.geometry
      }

      if (!typeMap.has(asiType)) {
        typeMap.set(asiType, {
          type: asiType,
          displayName: getDisplayName(asiType),
          count: 0,
          totalVertices: 0,
          shapes: []
        })
      }

      const stats = typeMap.get(asiType)!
      stats.count++
      stats.totalVertices += vertexCount
      stats.shapes.push(shape)
    })

    return Array.from(typeMap.values()).sort((a, b) => b.count - a.count)
  }, [geoJsonData])

  const toggleTypeExpansion = (type: string) => {
    const newExpanded = new Set(expandedTypes)
    if (newExpanded.has(type)) {
      newExpanded.delete(type)
    } else {
      newExpanded.add(type)
    }
    setExpandedTypes(newExpanded)
  }

  if (!isVisible || !geoJsonData) return null

  const totalShapes = shapeStats.reduce((sum, stat) => sum + stat.count, 0)
  const totalVertices = shapeStats.reduce((sum, stat) => sum + stat.totalVertices, 0)

  return (
    <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-gray-700 bg-[#ffc726]">
        <div>
          <h2 className="text-2xl font-bold text-[#425563]">Map Analysis</h2>
          <p className="text-[#425563] mt-1">Detailed breakdown of map shapes</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Summary Stats */}
      <div className="p-6 bg-gradient-to-r from-gray-800 to-gray-700">
        <div className="grid grid-cols-3 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-400">{totalShapes}</div>
            <div className="text-sm text-gray-400">Total Features</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-green-400">{totalVertices}</div>
            <div className="text-sm text-gray-400">Total Vertices</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-purple-400">{shapeStats.length}</div>
            <div className="text-sm text-gray-400">Feature Types</div>
          </div>
        </div>
      </div>

      {/* Feature Types Grid */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="grid grid-cols-2 gap-4">
          {shapeStats.map((stat) => (
            <div key={stat.type} className="bg-gray-800 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleTypeExpansion(stat.type)}
                className="w-full p-4 text-left hover:bg-gray-750 transition-colors flex items-center justify-between"
              >
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white mb-2">{stat.displayName}</h3>
                  <div className="flex space-x-4">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                      <span className="text-sm text-gray-300">{stat.count} shapes</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <span className="text-sm text-gray-300">{stat.totalVertices} vertices</span>
                    </div>
                  </div>
                </div>
                <svg 
                  className={`w-5 h-5 text-gray-400 transition-transform ${expandedTypes.has(stat.type) ? 'rotate-90' : ''}`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {expandedTypes.has(stat.type) && (
                <div className="border-t border-gray-700 bg-gray-850">
                  <div className="p-4">
                    <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto">
                      {stat.shapes
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((shape) => (
                          <div
                            key={shape.id}
                            className="flex items-center justify-between p-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors border border-gray-700"
                          >
                            <div className="flex-1">
                              <div className="text-white font-medium">{shape.name}</div>
                              <div className="text-gray-400 text-xs mt-1">
                                ID: {shape.id} • Type: {shape.type}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-blue-400 font-semibold">{shape.vertexCount}</div>
                              <div className="text-gray-500 text-xs">vertices</div>
                            </div>
                          </div>
                        ))}
                    </div>
                    {stat.shapes.length === 0 && (
                      <div className="text-center text-gray-500 text-sm py-4">
                        No shapes of this type found
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        
        {shapeStats.length === 0 && (
          <div className="text-center py-12">
            <div className="text-gray-400 text-lg mb-2">No infrastructure features found</div>
            <div className="text-gray-600 text-sm">The map data doesn't contain any recognizable infrastructure elements</div>
          </div>
        )}
      </div>
    </div>
  )
}

// Helper function to convert technical type names to display names
function getDisplayName(asiType: string): string {
  const typeMap: { [key: string]: string } = {
    'RoadShapeDto_V1': 'Roads',
    'ObstacleShapeDto_V1': 'Obstacles',
    'StationShapeDto_V1': 'Stations',
    'DrivableShapeDto_V1': 'Drivable Areas',
    'ReferenceShapeDto_V1': 'Reference Shapes',
    'VectorImageDto_V1': 'Vector Graphics'
  }
  
  return typeMap[asiType] || asiType.replace('Dto_V1', '').replace(/([A-Z])/g, ' $1').trim()
}

export default MapDetailsPanel