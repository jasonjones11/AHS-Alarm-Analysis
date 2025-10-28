'use client'
// Force recompile to clear selectedAsiTypes error

import React, { useState, useEffect, useCallback } from 'react'
import DataExtractionPanel from '@/components/DataExtractionPanel'
import AlarmAnalysisPanel from '@/components/AlarmAnalysisPanel'
import { buildApiUrl } from '@/config/environment'
import AlarmMapComponent from '@/components/AlarmMapComponent'
import MapDetailsPanel from '@/components/MapDetailsPanel'
import AlarmTimeAnalysisPanel from '@/components/AlarmTimeAnalysisPanel'
import HeatmapAnalysisPanel from '@/components/HeatmapAnalysisPanel'
import SpeedSlicerComponent, { SpeedRange } from '@/components/SpeedSlicerComponent'
import { TrailColorMode, AlarmDataPoint } from '@/utils/alarmTrailColors'
import Image from 'next/image'

// License system imports
import { useLicense } from '@/context/LicenseContext'
import LicenseAuth from '@/components/LicenseAuth'
import AdminDashboardModal from '@/components/AdminDashboardModal'
import LicenseStatus from '@/components/LicenseStatus'

// Simple logging for alarm analysis
const logger = {
  info: (message: string, data?: any) => console.log(`[INFO] [ALARM_APP] ${message}`, data || ''),
  success: (message: string, data?: any) => console.log(`[SUCCESS] [ALARM_APP] ${message}`, data || ''),
  warning: (message: string, data?: any) => console.warn(`[WARNING] [ALARM_APP] ${message}`, data || ''),
  error: (message: string, error?: any) => console.error(`[ERROR] [ALARM_APP] ${message}`, error || ''),
}

export default function Home() {
  // ==========================================
  // LICENSE SYSTEM
  // ==========================================
  const { licenseInfo, loading: licenseLoading } = useLicense()

  // ==========================================
  // UI STATE MANAGEMENT
  // ==========================================
  const [isExtractionPanelOpen, setIsExtractionPanelOpen] = useState(false)
  const [showMapDetails, setShowMapDetails] = useState(false)
  const [isTimeAnalysisPanelOpen, setIsTimeAnalysisPanelOpen] = useState(false)
  const [isHeatmapAnalysisPanelOpen, setIsHeatmapAnalysisPanelOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  // ==========================================
  // ALARM ANALYSIS STATE
  // ==========================================
  const [selectedVehicles, setSelectedVehicles] = useState<string[]>([])
  const [selectedAlarmTypes, setSelectedAlarmTypes] = useState<string[]>([])
  const [speedRange, setSpeedRange] = useState<SpeedRange | null>(null)
  const [selectedShapes, setSelectedShapes] = useState<string[]>([])
  const [trailColorMode, setTrailColorMode] = useState<TrailColorMode>('speed')
  const [geoJsonData, setGeoJsonData] = useState<any>(null)
  const [backendHealthy, setBackendHealthy] = useState(false)
  const [isAdminDashboardOpen, setIsAdminDashboardOpen] = useState(false)

  // ==========================================
  // BACKEND INTEGRATION
  // ==========================================

  // Check backend health for alarm analysis
  const checkBackendHealth = useCallback(async () => {
    logger.info('Checking alarm analysis backend health...')
    
    try {
      const response = await fetch(buildApiUrl('/'))
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      
      const healthData = await response.json()
      setBackendHealthy(true)
      logger.success('Alarm analysis backend is healthy', healthData)
      return true
    } catch (error) {
      setBackendHealthy(false)
      logger.warning('Alarm analysis backend not available, showing extraction panel', error)
      return false
    }
  }, [])

  // Check if alarm data is available
  const checkAlarmDataAvailable = useCallback(async () => {
    if (!backendHealthy) {
      logger.warning('Backend not healthy, cannot check alarm data')
      return false
    }
    
    try {
      const response = await fetch(buildApiUrl('/trucks'))
      if (response.ok) {
        const data = await response.json()
        logger.info(`Found ${data.count} vehicles with alarm data`)
        return data.count > 0
      }
    } catch (error) {
      logger.warning('Cannot check alarm data availability', error)
    }
    return false
  }, [backendHealthy])

  // ==========================================
  // INITIALIZATION
  // ==========================================

  // Initialize application
  useEffect(() => {
    const initializeApp = async () => {
      logger.info('🚨 Initializing Mining Truck Alarm Analysis Dashboard...')
      
      const isHealthy = await checkBackendHealth()
      if (isHealthy) {
        const hasData = await checkAlarmDataAvailable()
        if (!hasData) {
          setIsExtractionPanelOpen(true)
          logger.info('No alarm data available, showing extraction panel')
        } else {
          logger.success('Application initialized successfully with alarm data')
        }
      } else {
        setIsExtractionPanelOpen(true)
        logger.warning('Application initialized with extraction panel (backend unavailable)')
      }
    }
    
    initializeApp()
  }, [checkBackendHealth, checkAlarmDataAvailable])

  // ==========================================
  // EVENT HANDLERS
  // ==========================================

  const handleVehicleSelectionChange = useCallback((vehicleIds: string[]) => {
    setSelectedVehicles(vehicleIds)
    logger.info('Vehicle selection changed', { vehicleIds })
  }, [])

  const handleAlarmTypeSelectionChange = useCallback((alarmTypes: string[]) => {
    setSelectedAlarmTypes(alarmTypes)
    logger.info('Alarm type selection changed', { alarmTypes })
  }, [])

  const handleTrailColorModeChange = useCallback((mode: TrailColorMode) => {
    setTrailColorMode(mode)
    logger.info('Trail color mode changed', { mode })
  }, [])

  const handleSpeedRangeChange = useCallback((speedRange: SpeedRange | null) => {
    setSpeedRange(speedRange)
    logger.info('Speed range changed', { speedRange })
  }, [])

  const handleShapeSelectionChange = useCallback((shapes: string[]) => {
    setSelectedShapes(shapes)
    logger.info('Shape selection changed', { shapes })
  }, [])


  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const result = JSON.parse(e.target?.result as string)
          setGeoJsonData(result)
          logger.success('GeoJSON file loaded successfully', { fileName: file.name })
        } catch (error) {
          logger.error('Error parsing GeoJSON file', error)
          setError('Failed to parse GeoJSON file')
        }
      }
      reader.readAsText(file)
    }
  }, [])

  const handleExportData = useCallback(async () => {
    logger.info('User requested data export', { selectedVehicles, selectedAlarmTypes, hasGeoJson: !!geoJsonData })

    try {
      setLoading(true)
      setError(null)

      // First, get the alarm data from the backend
      const params = new URLSearchParams()
      if (selectedVehicles.length > 0) {
        params.append('vehicle_ids', selectedVehicles.join(','))
      }
      if (selectedAlarmTypes.length > 0) {
        params.append('alarm_types', selectedAlarmTypes.join(','))
      }

      const alarmDataResponse = await fetch(buildApiUrl(`/export-data?${params.toString()}`))

      if (!alarmDataResponse.ok) {
        throw new Error(`Failed to get alarm data: ${alarmDataResponse.statusText}`)
      }

      const alarmData = await alarmDataResponse.json()

      // Now enhance with shape names using frontend logic
      const { getShapeNameForPoint } = await import('@/utils/shapeUtils')

      const csvRows = alarmData.map((event: any) => {
        // Use existing frontend shape detection
        const shapeName = geoJsonData && event.latitude && event.longitude
          ? getShapeNameForPoint(event.latitude, event.longitude, geoJsonData) || ''
          : ''

        // Convert UTC timestamp to Perth local time (UTC+8)
        const utcDate = new Date(event.timestamp)
        const perthDate = new Date(utcDate.getTime() + (8 * 60 * 60 * 1000)) // Add 8 hours
        const perthTimestamp = perthDate.toISOString().replace('T', ' ').substring(0, 19) + ' (Perth)'

        return {
          timestamp: perthTimestamp,
          vehicle: event.vehicle,
          alarm_type: event.alarm_type,
          speed: event.speed_kmh || '',
          offpath: event.off_path_error_m || '',
          pitch: event.pitch_max_deg || '',
          roll: event.roll_max_deg || '',
          ShapeName: shapeName,
          latitude: event.latitude || '',
          longitude: event.longitude || ''
        }
      })

      // Create CSV content
      const csvHeader = 'timestamp,vehicle,alarm_type,speed,offpath,pitch,roll,ShapeName,latitude,longitude\n'
      const csvContent = csvHeader + csvRows.map((row: any) =>
        Object.values(row).map((val: any) => `"${val}"`).join(',')
      ).join('\n')

      // Create download link
      const blob = new Blob([csvContent], { type: 'text/csv' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `alarm_data_export_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      logger.success('Data export completed successfully', {
        eventCount: csvRows.length,
        hasShapeNames: csvRows.some((row: any) => row.ShapeName)
      })

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      logger.error('Data export failed', error)
      setError(`Export failed: ${errorMessage}`)
    } finally {
      setLoading(false)
    }
  }, [selectedVehicles, selectedAlarmTypes, geoJsonData])

  const handleExtractionComplete = useCallback((data?: any) => {
    logger.info('Data extraction completed, checking for alarm data...', data)
    setIsExtractionPanelOpen(false)
    // Check for new data after extraction
    setTimeout(() => {
      checkBackendHealth().then(checkAlarmDataAvailable)
    }, 1000)
  }, [checkBackendHealth, checkAlarmDataAvailable])

  const handleSkipToMap = useCallback(() => {
    logger.info('User requested skip to map view')
    setIsExtractionPanelOpen(false)
    setBackendHealthy(true) // Force map view
  }, [])

  // ==========================================
  // RENDER LOGIC
  // ==========================================

  // Show loading spinner while checking license
  if (licenseLoading) {
    return (
      <div className="min-h-screen bg-[#425563] flex items-center justify-center font-raleway">
        <div className="flex flex-col items-center space-y-4">
          <div className="animate-spin w-8 h-8 border-4 border-white border-t-transparent rounded-full"></div>
          <p className="text-white text-sm font-raleway">Verifying license...</p>
        </div>
      </div>
    )
  }

  // Show license authentication if not licensed
  if (!licenseInfo) {
    return <LicenseAuth />
  }

  if (isExtractionPanelOpen) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-[#425563] font-raleway">
        <DataExtractionPanel
          onExtractionComplete={handleExtractionComplete}
          previouslyExtractedData={null}
          onSkipToMap={handleSkipToMap}
        />
      </main>
    )
  }

  return (
    <main className="h-screen flex flex-col bg-[#1f2937] text-white overflow-hidden font-raleway">
      {/* Header */}
      <header className="w-full bg-[#425563] p-3.2 shadow-md flex items-center justify-between flex-shrink-0" style={{ position: 'sticky', top: 0, zIndex: 9999 }}>
        <div className="flex items-center space-x-4">
          {/* Epiroc Logo */}
          <div className="flex-shrink-0">
            <Image
              src="/Epiroc Logo_Epiroc Yellow_RGB.png"
              alt="Epiroc"
              width={186}
              height={62}
              className="object-contain"
            />
          </div>
          {/* Separator */}
          <div className="border-l border-gray-600 pl-4">
            <h1 className="text-3xl font-bold text-[#86c8bc] flex items-center space-x-3">
              <Image
                src="/icons/Haul Truck - CAT - Loaded.png"
                alt="Mining Truck"
                width={48}
                height={48}
                className="filter brightness-0 saturate-0" style={{filter: 'brightness(0) saturate(100%) invert(73%) sepia(21%) saturate(1043%) hue-rotate(123deg) brightness(103%) contrast(90%)'}}
              />
              <span>AHS Alarm Analysis</span>
            </h1>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          {/* License Status */}
          <LicenseStatus />

          {/* Map Upload */}
          <div className="flex items-center">
            <label className="cursor-pointer px-4 py-2 bg-[#ffc726] text-[#425563] rounded-md hover:bg-[#ffb000] transition-colors duration-200 flex items-center space-x-2 font-raleway font-medium">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V7.618a1 1 0 01.553-.894L9 4l6 3 6-3v13l-6 3-6-3z" />
              </svg>
              <span>Upload Map</span>
              <input
                type="file"
                accept=".json,.geojson"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
          
          {/* Map Details Toggle */}
          {geoJsonData && (
            <button
              onClick={() => setShowMapDetails(!showMapDetails)}
              className={`px-4 py-2 rounded-md transition-colors duration-200 flex items-center space-x-2 font-raleway font-medium ${
                showMapDetails ? 'bg-[#ffc726] text-[#425563] hover:bg-[#ffb000]' : 'bg-[#ffc726] text-[#425563] hover:bg-[#ffb000]'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>Map Details</span>
            </button>
          )}
          
          <button
            onClick={() => setIsTimeAnalysisPanelOpen(true)}
            className="px-4 py-2 bg-[#ffc726] text-[#425563] rounded-md hover:bg-[#ffb000] transition-colors duration-200 flex items-center space-x-2 font-raleway font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span>Hour by Hour Analysis</span>
          </button>
          
          <button
            onClick={() => setIsHeatmapAnalysisPanelOpen(true)}
            className="px-4 py-2 bg-[#ffc726] text-[#425563] rounded-md hover:bg-[#ffb000] transition-colors duration-200 flex items-center space-x-2 font-raleway font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Heatmap Analysis</span>
          </button>
          
          {/* Admin Dashboard Button - Only show for admin users */}
          {licenseInfo?.userType === 'admin' && (
            <button
              onClick={() => setIsAdminDashboardOpen(true)}
              className="px-4 py-2 bg-[#ffc726] text-[#425563] rounded-md hover:bg-[#ffb000] transition-colors duration-200 flex items-center space-x-2 font-raleway font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>Admin</span>
            </button>
          )}

          <button
            onClick={handleExportData}
            className="px-4 py-2 bg-[#ffc726] text-[#425563] rounded-md hover:bg-[#ffb000] transition-colors duration-200 flex items-center space-x-2 font-raleway font-medium"
            disabled={loading}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16V4m0 0l-3 3m3-3l3 3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>{loading ? 'Exporting...' : 'Export Data'}</span>
          </button>

          <button
            onClick={() => setIsExtractionPanelOpen(true)}
            className="px-4 py-2 bg-[#ffc726] text-[#425563] rounded-md hover:bg-[#ffb000] transition-colors duration-200 flex items-center space-x-2 font-raleway font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>Extract New Data</span>
          </button>
          
          {!backendHealthy && (
            <div className="flex items-center text-red-400 text-sm">
              [WARNING] Backend Offline
            </div>
          )}
        </div>
      </header>

      {/* Map Details Panel Overlay */}
      {showMapDetails && geoJsonData && (
        <div className="fixed inset-0 bg-[#425563] bg-opacity-90 flex items-center justify-center z-[9999] p-4">
          <MapDetailsPanel 
            geoJsonData={geoJsonData}
            isVisible={showMapDetails}
            onClose={() => setShowMapDetails(false)}
          />
        </div>
      )}

      {/* Time Analysis Panel Overlay */}
      {isTimeAnalysisPanelOpen && (
        <div className="fixed inset-0 bg-[#425563] bg-opacity-90 flex items-center justify-center z-[9999] p-4">
          <AlarmTimeAnalysisPanel
            selectedVehicles={selectedVehicles}
            selectedAlarmTypes={selectedAlarmTypes}
            speedRange={speedRange}
            selectedShapes={selectedShapes}
            geoJsonData={geoJsonData}
            onShapeSelectionChange={handleShapeSelectionChange}
            onClose={() => setIsTimeAnalysisPanelOpen(false)}
          />
        </div>
      )}

      {/* Heatmap Analysis Panel Overlay */}
      {isHeatmapAnalysisPanelOpen && (
        <div className="fixed inset-0 bg-[#425563] bg-opacity-90 flex items-center justify-center z-[9999] p-4">
          <HeatmapAnalysisPanel
            selectedVehicles={selectedVehicles}
            selectedAlarmTypes={selectedAlarmTypes}
            speedRange={speedRange}
            selectedShapes={selectedShapes}
            geoJsonData={geoJsonData}
            onShapeSelectionChange={handleShapeSelectionChange}
            onClose={() => setIsHeatmapAnalysisPanelOpen(false)}
          />
        </div>
      )}

      {/* Content Container */}
      <div className="flex flex-1 relative min-h-0">
        {/* Collapsible Left Sidebar */}
        <div className={`bg-[#1f2937] border-r border-[#425563] transition-all duration-300 flex-shrink-0 flex flex-col ${
          isSidebarCollapsed ? 'w-12' : 'w-100'
        }`}>
          {/* Collapse/Expand Button */}
          <div className="flex justify-end p-3 border-b border-gray-600 flex-shrink-0">
            <button
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="p-2 rounded-md hover:bg-[#425563] text-gray-300 hover:text-white transition-colors"
              title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <svg 
                className={`w-5 h-5 transform transition-transform ${isSidebarCollapsed ? 'rotate-180' : ''}`} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>

          {/* Sidebar Content */}
          {!isSidebarCollapsed && (
            <div className="flex-1 overflow-y-auto min-h-0">
              <AlarmAnalysisPanel
                selectedVehicles={selectedVehicles}
                selectedAlarmTypes={selectedAlarmTypes}
                speedRange={speedRange}
                selectedShapes={selectedShapes}
                trailColorMode={trailColorMode}
                geoJsonData={geoJsonData}
                onVehicleSelectionChange={handleVehicleSelectionChange}
                onAlarmTypeSelectionChange={handleAlarmTypeSelectionChange}
                onTrailColorModeChange={handleTrailColorModeChange}
                onSpeedRangeChange={handleSpeedRangeChange}
                onShapeSelectionChange={handleShapeSelectionChange}
              />
            </div>
          )}
        </div>
        
        {/* Main Content - Map */}
        <div className="flex-1 flex flex-col min-h-0 bg-[#1f2937]">
          {/* Error Display */}
          {error && (
            <div className="bg-[#b83149] text-white p-4 m-4 rounded-md flex-shrink-0">
              <p className="font-raleway">[ERROR] {error}</p>
              <button
                onClick={() => setError(null)}
                className="mt-2 px-3 py-1 bg-[#a12d3e] rounded text-sm hover:bg-[#8f1e33] font-raleway"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Loading Indicator */}
          {loading && (
            <div className="bg-[#489dc5] text-white p-4 m-4 rounded-md flex-shrink-0">
              <p className="font-raleway">Loading alarm analysis data...</p>
            </div>
          )}

          {/* Alarm Map Component */}
          <div className="flex-1 min-h-0">
            <AlarmMapComponent
              selectedVehicles={selectedVehicles}
              selectedAlarmTypes={selectedAlarmTypes}
              speedRange={speedRange}
              selectedShapes={selectedShapes}
              trailColorMode={trailColorMode}
              geoJsonData={geoJsonData}
              />
          </div>
        </div>
      </div>

      {/* Admin Dashboard Modal */}
      <AdminDashboardModal
        isVisible={isAdminDashboardOpen}
        onClose={() => setIsAdminDashboardOpen(false)}
      />

    </main>
  )
}