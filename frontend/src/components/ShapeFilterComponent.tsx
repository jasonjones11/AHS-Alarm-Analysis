'use client'

import React, { useState, useMemo } from 'react'
import { AlarmDataPoint } from '@/utils/alarmTrailColors'
import { getShapesWithAlarms, getAsiTypeDisplayName } from '@/utils/shapeUtils'

interface ShapeFilterComponentProps {
  selectedShapes: string[]
  alarmData: AlarmDataPoint[]
  geoJsonData: any
  onShapeSelectionChange: (shapes: string[]) => void
  className?: string
}

interface ShapeGroup {
  asiType: string
  displayName: string
  shapes: { name: string; alarmCount: number }[]
  totalCount: number
}

export default function ShapeFilterComponent({
  selectedShapes,
  alarmData,
  geoJsonData,
  onShapeSelectionChange,
  className = ''
}: ShapeFilterComponentProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  // Get all shapes that contain alarms, grouped by AsiType
  const shapeGroups = useMemo(() => {
    const shapesWithAlarms = getShapesWithAlarms(alarmData, geoJsonData)
    
    // Group by AsiType
    const groupMap = new Map<string, ShapeGroup>()
    
    shapesWithAlarms.forEach(({ shapeName, asiType, alarmCount }) => {
      if (!groupMap.has(asiType)) {
        groupMap.set(asiType, {
          asiType,
          displayName: getAsiTypeDisplayName(asiType),
          shapes: [],
          totalCount: 0
        })
      }
      
      const group = groupMap.get(asiType)!
      group.shapes.push({ name: shapeName, alarmCount })
      group.totalCount += alarmCount
    })
    
    // Sort groups by total alarm count (descending)
    return Array.from(groupMap.values()).sort((a, b) => b.totalCount - a.totalCount)
  }, [alarmData, geoJsonData])

  const totalShapeCount = useMemo(() => {
    return shapeGroups.reduce((sum, group) => sum + group.shapes.length, 0)
  }, [shapeGroups])

  const selectedCount = selectedShapes.length

  const handleSelectAll = () => {
    const allShapes = shapeGroups.flatMap(group => group.shapes.map(shape => shape.name))
    onShapeSelectionChange(allShapes)
  }

  const handleClearAll = () => {
    onShapeSelectionChange([])
  }

  const handleShapeToggle = (shapeName: string) => {
    const newSelection = selectedShapes.includes(shapeName)
      ? selectedShapes.filter(s => s !== shapeName)
      : [...selectedShapes, shapeName]
    onShapeSelectionChange(newSelection)
  }

  const handleGroupToggle = (group: ShapeGroup) => {
    const groupShapeNames = group.shapes.map(s => s.name)
    const allSelected = groupShapeNames.every(name => selectedShapes.includes(name))
    
    let newSelection: string[]
    if (allSelected) {
      // Deselect all shapes in this group
      newSelection = selectedShapes.filter(name => !groupShapeNames.includes(name))
    } else {
      // Select all shapes in this group
      const otherShapes = selectedShapes.filter(name => !groupShapeNames.includes(name))
      newSelection = [...otherShapes, ...groupShapeNames]
    }
    onShapeSelectionChange(newSelection)
  }

  if (shapeGroups.length === 0) {
    return (
      <div className={`p-4 bg-gray-800/50 rounded-lg border border-gray-600 ${className}`}>
        <h4 className="text-sm font-semibold text-white mb-2">Shape Filter</h4>
        <p className="text-sm text-gray-400">No shapes with alarms found</p>
      </div>
    )
  }

  return (
    <div className={`bg-gray-800/50 rounded-lg border border-gray-600 ${className}`}>
      <div className="p-4">
        <div 
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center space-x-2">
            <h4 className="text-base font-semibold text-white">Shape Filter</h4>
            <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
              {selectedCount}/{totalShapeCount}
            </span>
          </div>
          <svg 
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {isExpanded && (
          <div className="mt-4 space-y-4">
            {/* Select All / Clear All Controls */}
            <div className="flex space-x-3">
              <button
                onClick={handleSelectAll}
                className="px-3 py-2 text-sm bg-[#86c8bc] hover:bg-[#7bb8ac] text-[#001e32] rounded transition-colors"
              >
                Select All
              </button>
              <button
                onClick={handleClearAll}
                className="px-3 py-2 text-sm bg-[#425563] hover:bg-[#556474] text-white rounded transition-colors"
              >
                Clear All
              </button>
            </div>

            {/* Shape Groups */}
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {shapeGroups.map((group) => {
                const groupShapeNames = group.shapes.map(s => s.name)
                const selectedInGroup = groupShapeNames.filter(name => selectedShapes.includes(name)).length
                const allGroupSelected = selectedInGroup === groupShapeNames.length
                const someGroupSelected = selectedInGroup > 0 && selectedInGroup < groupShapeNames.length

                return (
                  <div key={group.asiType} className="border border-gray-700 rounded-lg p-2">
                    {/* Group Header */}
                    <div 
                      className="flex items-center justify-between cursor-pointer mb-2"
                      onClick={() => handleGroupToggle(group)}
                    >
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={allGroupSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someGroupSelected
                          }}
                          onChange={() => handleGroupToggle(group)}
                          className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-2"
                        />
                        <span className="text-sm font-medium text-gray-300">
                          {group.displayName}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {selectedInGroup}/{group.shapes.length} ({group.totalCount} alarms)
                      </span>
                    </div>

                    {/* Individual Shapes */}
                    <div className="ml-4 space-y-1">
                      {group.shapes.map((shape) => (
                        <div key={shape.name} className="flex items-center justify-between">
                          <label className="flex items-center space-x-2 cursor-pointer text-sm">
                            <input
                              type="checkbox"
                              checked={selectedShapes.includes(shape.name)}
                              onChange={() => handleShapeToggle(shape.name)}
                              className="rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-1"
                            />
                            <span className="text-gray-400">{shape.name}</span>
                          </label>
                          <span className="text-xs text-gray-500 ml-2">
                            {shape.alarmCount}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}