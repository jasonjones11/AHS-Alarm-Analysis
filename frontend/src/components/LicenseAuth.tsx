'use client'

import React, { useState, useEffect } from 'react'
import { useLicense } from '@/context/LicenseContext'

const LicenseAuth: React.FC = () => {
  const { validateLicense, loading, error, licenseInfo, clearLicense } = useLicense()
  const [licenseKey, setLicenseKey] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showSystemInfo, setShowSystemInfo] = useState(false)
  const [systemInfo, setSystemInfo] = useState<any>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!licenseKey.trim()) return

    setSubmitting(true)
    try {
      await validateLicense(licenseKey.trim())
    } finally {
      setSubmitting(false)
    }
  }

  const fetchSystemInfo = async () => {
    try {
      const response = await fetch('http://127.0.0.1:9501/system-info')
      const data = await response.json()
      setSystemInfo(data.data)
      setShowSystemInfo(true)
    } catch (error) {
      console.error('Error fetching system info:', error)
    }
  }

  const formatMacAddress = (mac: string) => {
    return mac.match(/.{1,2}/g)?.join(':') || mac
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-blue-600 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">AHS Alarm Analysis</h1>
          <p className="text-gray-600">Enter your license key to access the application</p>
        </div>

        {/* License Form */}
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="licenseKey" className="block text-sm font-medium text-gray-700 mb-2">
              License Key
            </label>
            <input
              type="text"
              id="licenseKey"
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
              placeholder="AHS-2025-USER-MACAABBCC-EXP251231-CHK789"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              disabled={submitting || loading}
              required
            />
            <p className="mt-1 text-xs text-gray-500">
              Enter the license key provided by your administrator
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <div className="flex">
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <div className="ml-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting || loading || !licenseKey.trim()}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting || loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Validating...
              </>
            ) : (
              'Activate License'
            )}
          </button>
        </form>

        {/* System Info Toggle */}
        <div className="mt-6 text-center">
          <button
            onClick={fetchSystemInfo}
            className="text-sm text-blue-600 hover:text-blue-800 underline"
          >
            Need your MAC address? Click here
          </button>
        </div>

        {/* System Info Modal */}
        {showSystemInfo && systemInfo && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowSystemInfo(false)}>
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">System MAC Addresses</h3>
                <button
                  onClick={() => setShowSystemInfo(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-gray-600 mb-3">
                  Share any of these MAC addresses with your administrator to get a license:
                </p>
                {systemInfo.mac_addresses?.map((mac: string, index: number) => (
                  <div key={index} className="flex items-center justify-between bg-gray-50 p-2 rounded">
                    <code className="text-sm font-mono">{formatMacAddress(mac)}</code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(mac)
                        alert('MAC address copied to clipboard!')
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800 ml-2"
                    >
                      Copy
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-4 text-center">
                <button
                  onClick={() => setShowSystemInfo(false)}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-gray-500">
            Protected by hardware-bound licensing
          </p>
        </div>
      </div>
    </div>
  )
}

export default LicenseAuth