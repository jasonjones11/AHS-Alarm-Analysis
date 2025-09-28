'use client'

import React, { useState, useEffect, useMemo } from 'react'

export interface AsiTypeFilterProps {
  selectedAsiTypes: string[]
  geoJsonData: any
  onAsiTypeSelectionChange: (asiTypes: string[]) => void
  className?: string
}

const AsiTypeFilterComponent: React.FC<AsiTypeFilterProps> = ({
  selectedAsiTypes,
  geoJsonData,
  onAsiTypeSelectionChange,
  className = ''
}) => {
  const [isExpanded, setIsExpanded] = useState(false)

  // Excluded AsiTypes that should not appear in the filter
  const excludedAsiTypes = [
    'PinDto_V1',
    'ObstacleShapeDto_V1',
    'ReferenceShapeDto_V1',
    'VectorImageDto_V1',
    'RoughRoadShapeDto_V1',
    'AozShapeDto_V1'
  ]

  // Extract unique AsiTypes from GeoJSON data (excluding unwanted ones)
  const availableAsiTypes = useMemo(() => {
    if (!geoJsonData?.features) return []
    
    const asiTypeSet = new Set<string>()
    geoJsonData.features.forEach((feature: any) => {
      const asiType = feature.properties?.AsiType
      if (asiType && typeof asiType === 'string' && !excludedAsiTypes.includes(asiType)) {
        asiTypeSet.add(asiType)
      }
    })
    
    return Array.from(asiTypeSet).sort()
  }, [geoJsonData])

  // Get user-friendly display names for AsiTypes
  const getDisplayName = (asiType: string): string => {
    const typeMap: { [key: string]: string } = {
      'ObstacleShapeDto_V1': 'Obstacles',
      'StationShapeDto_V1': 'Stations',
      'RoadShapeDto_V1': 'Roads',
      'DrivableShapeDto_V1': 'Drivable Areas',
      'LoadShapeDto_V1': 'Load Areas',
      'EdgeDumpShapeDto_V1': 'Edge Dumps',
      'CrusherDumpShapeDto_V1': 'Crusher Dumps',
      'ReferenceShapeDto_V1': 'Reference Areas',
      'VectorImageDto_V1': 'Vector Images',
      'PinDto_V1': 'Pins',
      'AozShapeDto_V1': 'AOZ Areas',
      'RoughRoadShapeDto_V1': 'Rough Roads'
    }
    return typeMap[asiType] || asiType.replace('Dto_V1', '').replace('Shape', '')
  }

  const handleSelectAll = () => {
    onAsiTypeSelectionChange(availableAsiTypes)
  }

  const handleClearAll = () => {
    onAsiTypeSelectionChange([])
  }

  const handleAsiTypeToggle = (asiType: string) => {
    const newSelection = selectedAsiTypes.includes(asiType)
      ? selectedAsiTypes.filter(t => t !== asiType)
      : [...selectedAsiTypes, asiType]
    onAsiTypeSelectionChange(newSelection)
  }

  // If no GeoJSON data, don't render
  if (!geoJsonData || availableAsiTypes.length === 0) {
    return null
  }

  return (
    <div className={`bg-gray-700 rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-white flex items-center">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 113 16.382V7.618a1 1 0 01.553-.894L9 4l6 3 6-3v13l-6 3-6-3z" />
          </svg>
          Shape Type Filter
        </h3>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-gray-300 hover:text-white"
        >
          <svg 
            className={`w-5 h-5 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Selection Summary */}
      <div className="text-sm text-gray-300 mb-3">
        {selectedAsiTypes.length === 0 
          ? 'All shape types shown' 
          : `${selectedAsiTypes.length} of ${availableAsiTypes.length} shape types selected`
        }
      </div>

      {isExpanded && (
        <div className="space-y-3">
          {/* Select All / Clear All */}
          <div className="flex space-x-2">
            <button
              onClick={handleSelectAll}
              className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
            >
              Select All
            </button>
            <button
              onClick={handleClearAll}
              className="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-500 transition-colors"
            >
              Clear All
            </button>
          </div>

          {/* AsiType List */}
          <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto">
            {availableAsiTypes.map((asiType) => (
              <label
                key={asiType}
                className="flex items-center space-x-2 text-sm text-gray-300 hover:text-white cursor-pointer p-2 rounded hover:bg-gray-600 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedAsiTypes.includes(asiType)}
                  onChange={() => handleAsiTypeToggle(asiType)}
                  className="rounded border-gray-400 text-blue-600 focus:ring-blue-500 focus:ring-2"
                />
                <span className="flex-1">
                  {getDisplayName(asiType)}
                </span>
                <span className="text-xs text-gray-500">
                  ({geoJsonData.features.filter((f: any) => f.properties?.AsiType === asiType).length})
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default AsiTypeFilterComponent