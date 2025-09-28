'use client'

import React from 'react'
import { TrailColorMode, getLegendInfo, getDataRangeStats, AlarmDataPoint } from '@/utils/alarmTrailColors'

interface TrailColorLegendProps {
  mode: TrailColorMode
  dataPoints?: AlarmDataPoint[]
  className?: string
}

export default function TrailColorLegend({ mode, dataPoints = [], className = '' }: TrailColorLegendProps) {
  const legendInfo = getLegendInfo(mode)
  const stats = getDataRangeStats(dataPoints, mode)
  
  return (
    <div className={`bg-gray-800 p-3 rounded-lg shadow-lg ${className}`}>
      <div className="mb-3">
        <h3 className="text-white font-semibold text-sm mb-1">{legendInfo.title}</h3>
        {dataPoints.length > 0 && (
          <div className="text-xs text-gray-400">
            Min: {stats.min} | Max: {stats.max} | Avg: {stats.avg} | Points: {stats.count}
          </div>
        )}
      </div>
      
      <div className="space-y-1">
        {legendInfo.items.map((item, index) => (
          <div key={index} className="flex items-center space-x-2">
            <div 
              className="w-4 h-3 rounded border border-gray-600" 
              style={{ backgroundColor: item.color }}
            />
            <span className="text-xs text-gray-300">{item.label}</span>
          </div>
        ))}
      </div>
      
      {mode === 'pitch' || mode === 'roll' ? (
        <div className="mt-2 pt-2 border-t border-gray-600">
          <div className="text-xs text-yellow-400">
            Threshold: 2.86° absolute limit
          </div>
        </div>
      ) : null}
      
      {mode === 'speed' && (
        <div className="mt-2 pt-2 border-t border-gray-600">
          <div className="text-xs text-gray-400">
            Negative values indicate reverse
          </div>
        </div>
      )}
    </div>
  )
}