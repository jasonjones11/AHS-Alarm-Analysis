'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { Truck } from '@/types/truck'
import { apiClient } from '@/utils/api'

interface TruckDetail {
  vehicle_id: string;
  total_points: number;
  data_points: number;
  time_range: {
    start: string;
    end: string;
  };
  first_timestamp: string;
  last_timestamp: string;
  session_id?: string;
}

interface AutonomousTrucksPanelProps {
  trucks: Truck[];
  selectedTrucks: string[];
  onTruckToggle: (truckId: string) => void;
  isLoading: boolean;
  error: string | null;
}

const logger = {
  info: (message: string, data?: any) => console.log(`📊 [AUTONOMOUS_TRUCKS] ${message}`, data || ''),
  success: (message: string, data?: any) => console.log(`✅ [AUTONOMOUS_TRUCKS] ${message}`, data || ''),
  error: (message: string, error?: any) => console.error(`❌ [AUTONOMOUS_TRUCKS] ${message}`, error || ''),
};

export default function AutonomousTrucksPanel({
  trucks,
  selectedTrucks,
  onTruckToggle,
  isLoading,
  error,
}: AutonomousTrucksPanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [truckDetails, setTruckDetails] = useState<Record<string, TruckDetail>>({})
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [sortBy, setSortBy] = useState<'id' | 'points' | 'time'>('id')
  const [filterActive, setFilterActive] = useState(false)

  // Load detailed truck information from backend
  const loadTruckDetails = async () => {
    setLoadingDetails(true)
    try {
      logger.info('Loading detailed truck information...')
      const truckData = await apiClient.getTrucks()
      
      const details: Record<string, TruckDetail> = {}
      truckData.forEach(truck => {
        // Only process autonomous trucks
        if (truck.vehicle_id.startsWith('DT') || truck.vehicle_id.startsWith('AT')) {
          details[truck.vehicle_id] = {
            vehicle_id: truck.vehicle_id,
            total_points: truck.total_points || truck.data_points || 0,
            data_points: truck.data_points || truck.total_points || 0,
            time_range: truck.time_range || {
              start: truck.first_timestamp || '',
              end: truck.last_timestamp || ''
            },
            first_timestamp: truck.first_timestamp || '',
            last_timestamp: truck.last_timestamp || '',
            session_id: truck.session_id
          }
        }
      })
      
      setTruckDetails(details)
      logger.success(`Loaded details for ${Object.keys(details).length} autonomous trucks`)
    } catch (error) {
      logger.error('Failed to load truck details', error)
    } finally {
      setLoadingDetails(false)
    }
  }

  useEffect(() => {
    if (trucks.length > 0) {
      loadTruckDetails()
    }
  }, [trucks])

  // Sort trucks based on selected criteria
  const sortedTrucks = [...trucks].sort((a, b) => {
    const detailA = truckDetails[a.id]
    const detailB = truckDetails[b.id]
    
    switch (sortBy) {
      case 'points':
        return (detailB?.total_points || 0) - (detailA?.total_points || 0)
      case 'time':
        const timeA = detailA?.last_timestamp ? new Date(detailA.last_timestamp).getTime() : 0
        const timeB = detailB?.last_timestamp ? new Date(detailB.last_timestamp).getTime() : 0
        return timeB - timeA
      case 'id':
      default:
        return a.id.localeCompare(b.id)
    }
  })

  // Filter trucks if needed
  const filteredTrucks = filterActive 
    ? sortedTrucks.filter(truck => {
        const detail = truckDetails[truck.id]
        return detail && detail.total_points > 0
      })
    : sortedTrucks

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
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getTruckStatusColor = (truck: Truck) => {
    const detail = truckDetails[truck.id]
    if (!detail) return 'bg-gray-600'
    if (detail.total_points > 10000) return 'bg-green-500'
    if (detail.total_points > 1000) return 'bg-yellow-500'
    if (detail.total_points > 0) return 'bg-blue-500'
    return 'bg-gray-500'
  }

  const getTruckDataQuality = (truck: Truck) => {
    const detail = truckDetails[truck.id]
    if (!detail || detail.total_points === 0) return 'No Data'
    if (detail.total_points > 10000) return 'Rich Data'
    if (detail.total_points > 1000) return 'Good Data'
    return 'Limited Data'
  }

  return (
    <div className={`bg-gray-900 shadow-xl border border-gray-700 rounded-lg transition-all duration-300 ${isCollapsed ? 'w-12 overflow-hidden' : 'w-full'}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-700 bg-gradient-to-r from-blue-900 to-gray-900 rounded-t-lg">
        <div className="flex items-center justify-between">
          <h2 className={`font-bold text-lg text-gray-100 ${isCollapsed ? 'hidden' : 'flex items-center space-x-2'}`}>
            <Image 
              src="/icons/Haul Truck - CAT - Loaded.png" 
              alt="Autonomous Trucks" 
              width={24} 
              height={24}
              className="filter brightness-0 invert"
            />
            <span>Autonomous Trucks</span>
          </h2>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 hover:bg-gray-700 hover:bg-opacity-70 rounded-lg transition-colors text-gray-300 hover:text-gray-100"
          >
            {isCollapsed ? '→' : '←'}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <>
          {/* Controls */}
          <div className="p-4 border-b border-gray-700 bg-gray-800 space-y-3">
            {/* Summary Stats */}
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-gray-700 p-2 rounded">
                <div className="text-lg font-bold text-blue-400">{filteredTrucks.length}</div>
                <div className="text-xs text-gray-300">Available</div>
              </div>
              <div className="bg-gray-700 p-2 rounded">
                <div className="text-lg font-bold text-orange-400">{selectedTrucks.length}</div>
                <div className="text-xs text-gray-300">Selected</div>
              </div>
              <div className="bg-gray-700 p-2 rounded">
                <div className="text-lg font-bold text-green-400">
                  {Object.values(truckDetails).filter(d => d.total_points > 0).length}
                </div>
                <div className="text-xs text-gray-300">With Data</div>
              </div>
              <div className="bg-gray-700 p-2 rounded">
                <div className="text-lg font-bold text-yellow-400">
                  {Object.values(truckDetails).reduce((sum, d) => sum + d.total_points, 0).toLocaleString()}
                </div>
                <div className="text-xs text-gray-300">Total Points</div>
              </div>
            </div>

            {/* Sort and Filter Controls */}
            <div className="flex space-x-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as 'id' | 'points' | 'time')}
                className="flex-1 bg-gray-700 text-gray-200 text-sm rounded px-2 py-1 border border-gray-600"
              >
                <option value="id">Sort by ID</option>
                <option value="points">Sort by Data Points</option>
                <option value="time">Sort by Latest Activity</option>
              </select>
              
              <button
                onClick={() => setFilterActive(!filterActive)}
                className={`px-3 py-1 rounded text-sm transition-colors ${
                  filterActive 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {filterActive ? 'All' : 'With Data'}
              </button>
            </div>

            <button
              onClick={loadTruckDetails}
              disabled={loadingDetails}
              className="w-full px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm disabled:opacity-50"
            >
              {loadingDetails ? '🔄 Updating...' : '🔄 Refresh Details'}
            </button>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mx-4 mt-4 p-3 bg-red-900 border border-red-700 rounded-lg text-sm">
              <div className="flex items-center">
                <svg className="w-4 h-4 text-red-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-red-200">{error}</p>
              </div>
            </div>
          )}

          {/* Truck List */}
          <div className="p-4 bg-gray-900">
            <div className="max-h-96 overflow-y-auto">
              <div className="space-y-2">
                {filteredTrucks.map((truck) => {
                  const detail = truckDetails[truck.id]
                  const isSelected = selectedTrucks.includes(truck.id)
                  
                  return (
                    <div
                      key={truck.id}
                      className={`group relative p-3 border rounded-xl cursor-pointer transition-all duration-200 hover:shadow-md ${
                        isSelected
                          ? 'border-blue-500 bg-blue-900 bg-opacity-30 shadow-sm'
                          : 'border-gray-600 hover:border-blue-400 hover:bg-gray-800 bg-gray-700'
                      } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                      onClick={() => {
                        if (!isLoading) {
                          logger.info(`Truck ${isSelected ? 'deselected' : 'selected'}: ${truck.id}`)
                          onTruckToggle(truck.id)
                        }
                      }}
                    >
                      <div className="flex items-center justify-between">
                        {/* Truck Info */}
                        <div className="flex items-center space-x-3">
                          {/* Selection Checkbox */}
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                            isSelected 
                              ? 'bg-blue-600 border-blue-500' 
                              : 'border-gray-400 hover:border-blue-400'
                          }`}>
                            {isSelected && (
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          
                          <div className="relative">
                            <Image 
                              src="/icons/Haul Truck - CAT - Loaded.png" 
                              alt="Truck" 
                              width={24} 
                              height={24}
                              className={`${
                                isSelected 
                                  ? 'filter brightness-0 invert' 
                                  : 'filter brightness-0 invert opacity-80'
                              }`}
                            />
                            <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${getTruckStatusColor(truck)}`}></div>
                          </div>
                          
                          <div>
                            <div className="font-bold text-lg text-gray-200">{truck.id}</div>
                            <div className={`text-xs ${isSelected ? 'text-blue-300' : 'text-gray-400'}`}>
                              {getTruckDataQuality(truck)}
                            </div>
                          </div>
                        </div>

                        {/* Data Points */}
                        <div className="text-right">
                          <div className="font-bold text-sm text-gray-200">
                            {detail ? detail.total_points.toLocaleString() : '...'}
                          </div>
                          <div className={`text-xs ${isSelected ? 'text-blue-300' : 'text-gray-400'}`}>
                            data points
                          </div>
                        </div>
                      </div>

                      {/* Additional Details */}
                      {detail && (
                        <div className="mt-2 pt-2 border-t border-gray-600 grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <div className={`font-medium ${isSelected ? 'text-blue-300' : 'text-gray-300'}`}>
                              Duration
                            </div>
                            <div className={isSelected ? 'text-blue-400' : 'text-gray-400'}>
                              {formatDuration(detail.time_range.start, detail.time_range.end)}
                            </div>
                          </div>
                          <div>
                            <div className={`font-medium ${isSelected ? 'text-blue-300' : 'text-gray-300'}`}>
                              Latest Activity
                            </div>
                            <div className={isSelected ? 'text-blue-400' : 'text-gray-400'}>
                              {formatTimestamp(detail.last_timestamp)}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Selection Indicator */}
                      {isSelected && (
                        <div className="mt-2 pt-2 border-t border-blue-700">
                          <div className="text-xs text-blue-300 font-medium flex items-center space-x-1">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>Selected for map display</span>
                          </div>
                        </div>
                      )}

                      {/* Loading Indicator */}
                      {isSelected && isLoading && (
                        <div className="mt-2 pt-2 border-t border-blue-400 flex items-center justify-center">
                          <div className="w-4 h-4 border-2 border-blue-200 border-t-transparent rounded-full animate-spin mr-2" />
                          <span className="text-sm text-blue-200">Loading truck data...</span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Selection Actions */}
            {filteredTrucks.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-700">
                <div className="flex space-x-2">
                  <button
                    onClick={() => {
                      const allTruckIds = filteredTrucks.map(t => t.id)
                      allTruckIds.forEach(id => {
                        if (!selectedTrucks.includes(id)) {
                          onTruckToggle(id)
                        }
                      })
                      logger.info('Selected all visible trucks')
                    }}
                    disabled={isLoading}
                    className="flex-1 px-3 py-2 bg-[#86c8bc] text-[#001e32] rounded hover:bg-[#7bb8ac] transition-colors text-sm disabled:opacity-50"
                  >
                    📋 Select All
                  </button>
                  <button
                    onClick={() => {
                      selectedTrucks.forEach(id => onTruckToggle(id))
                      logger.info('Cleared all truck selections')
                    }}
                    disabled={isLoading || selectedTrucks.length === 0}
                    className="flex-1 px-3 py-2 bg-[#425563] text-white rounded hover:bg-[#556474] transition-colors text-sm disabled:opacity-50"
                  >
                    🗑️ Clear All
                  </button>
                </div>
              </div>
            )}

            {/* Empty State */}
            {filteredTrucks.length === 0 && !isLoading && (
              <div className="text-center py-8 text-gray-400">
                <Image 
                  src="/icons/Haul Truck - CAT - Unloaded.png" 
                  alt="No Trucks" 
                  width={48} 
                  height={48}
                  className="mx-auto mb-3 filter brightness-0 invert opacity-40"
                />
                <p className="text-sm font-medium mb-1">
                  {filterActive ? 'No trucks with data available' : 'No autonomous trucks available'}
                </p>
                <p className="text-xs text-gray-500">
                  {filterActive ? 'Try clearing the filter or running an extraction' : 'Run a data extraction to populate truck data'}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}