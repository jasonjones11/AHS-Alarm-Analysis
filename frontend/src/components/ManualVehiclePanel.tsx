'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ManualVehicleData } from '@/types/truck'

interface ManualVehicleProps {
  id: string
  hasData: boolean
  isSelected: boolean
  isLoading?: boolean
}

// Get appropriate icon based on manual vehicle asset class
const getManualVehicleIcon = (vehicleId: string): string => {
  const vehicleIdUpper = vehicleId.toUpperCase()
  
  // Extract asset class from vehicle ID
  if (vehicleIdUpper.includes('LV') || vehicleIdUpper.startsWith('LV')) {
    return '/icons/LV.png'
  } else if (vehicleIdUpper.includes('DZ') || vehicleIdUpper.includes('DOZER')) {
    return '/icons/Dozer.png'
  } else if (vehicleIdUpper.includes('WC') || vehicleIdUpper.includes('WATER')) {
    return '/icons/Water Cart.png'
  } else if (vehicleIdUpper.includes('GR') || vehicleIdUpper.includes('GRADER')) {
    return '/icons/Grader.png'
  } else if (vehicleIdUpper.includes('EX') || vehicleIdUpper.includes('EXCAVATOR')) {
    return '/icons/Excavator.png'
  } else if (vehicleIdUpper.includes('LR') || vehicleIdUpper.includes('LOADER')) {
    return '/icons/Loader.png'
  } else {
    // Default to Water Cart for unknown manual vehicles
    return '/icons/Water Cart.png'
  }
}

interface ManualVehiclePanelProps {
  manualVehicles: ManualVehicleProps[]
  selectedManualVehicles: string[]
  onManualVehicleToggle: (vehicleId: string) => void
  loading: boolean
}

export default function ManualVehiclePanel({
  manualVehicles,
  selectedManualVehicles,
  onManualVehicleToggle,
  loading
}: ManualVehiclePanelProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)

  return (
    <div className={`bg-gray-900 shadow-xl border border-gray-700 rounded-lg transition-all duration-300 ${isCollapsed ? 'w-12 overflow-hidden' : 'w-full'}`}>
      <div className="p-4 border-b border-gray-700 bg-gradient-to-r from-orange-900 to-yellow-900 rounded-t-lg">
        <div className="flex items-center justify-between">
          <h2 className={`font-bold text-lg text-gray-100 ${isCollapsed ? 'hidden' : 'flex items-center space-x-2'}`}>
            <Image 
              src="/icons/Excavator.png" 
              alt="Manual Assets" 
              width={24} 
              height={24}
              className="filter brightness-0 invert"
            />
            <span>Manual Assets</span>
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
          {/* Manual Vehicles List */}
          <div className="flex-1 overflow-y-auto bg-gray-900">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm text-gray-200 flex items-center space-x-2">
                  <Image 
                    src="/icons/Excavator.png" 
                    alt="Tracked Vehicles" 
                    width={16} 
                    height={16}
                    className="filter brightness-0 invert"
                  />
                  <span>Tracked Vehicles ({manualVehicles.length})</span>
                </h3>
                <div className="text-xs text-gray-400">
                  {selectedManualVehicles.length} selected
                </div>
              </div>

              {loading && (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
                </div>
              )}

              {!loading && manualVehicles.length === 0 && (
                <div className="text-center py-8 text-gray-400">
                  <Image 
                    src="/icons/Excavator.png" 
                    alt="No Vehicles" 
                    width={48} 
                    height={48}
                    className="mx-auto mb-2 filter brightness-0 invert opacity-40"
                  />
                  <p className="text-sm">No manual vehicles extracted</p>
                  <p className="text-xs text-gray-500 mt-1">Manual vehicles will appear here after data extraction</p>
                </div>
              )}

              <div className="space-y-2">
                {manualVehicles.map((vehicle) => (
                  <div
                    key={vehicle.id}
                    className={`group relative p-3 border rounded-xl cursor-pointer transition-all duration-200 hover:shadow-md ${
                      vehicle.isSelected
                        ? 'border-orange-500 bg-orange-900 bg-opacity-30 shadow-sm'
                        : 'border-gray-600 hover:border-orange-400 hover:bg-gray-800 bg-gray-700'
                    }`}
                    onClick={() => onManualVehicleToggle(vehicle.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className={`w-3 h-3 rounded-full ${
                          vehicle.hasData ? 'bg-green-400' : 'bg-gray-500'
                        }`}></div>
                        <Image 
                          src={getManualVehicleIcon(vehicle.id)} 
                          alt="Manual Vehicle" 
                          width={20} 
                          height={20}
                          className={`${
                            vehicle.isSelected 
                              ? 'filter brightness-0 invert' 
                              : vehicle.hasData
                              ? 'filter brightness-0 invert opacity-80'
                              : 'filter brightness-0 invert opacity-40'
                          }`}
                        />
                        <div>
                          <div className="font-semibold text-gray-200">{vehicle.id}</div>
                          <div className="text-xs text-gray-400">
                            {vehicle.hasData ? 'Data Available' : 'No Recent Data'}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        {vehicle.isLoading && (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-orange-600"></div>
                        )}
                      </div>
                    </div>

                    {vehicle.isSelected && (
                      <div className="mt-2 pt-2 border-t border-orange-700">
                        <div className="text-xs text-orange-300 font-medium flex items-center space-x-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span>Selected for map display</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}