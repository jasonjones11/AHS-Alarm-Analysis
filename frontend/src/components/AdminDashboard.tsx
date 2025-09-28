'use client'

import React, { useState, useEffect } from 'react'
import { useLicense } from '@/context/LicenseContext'

interface License {
  license_key: string
  name: string
  mac_address: string
  expiry_date: string
  created_date: string
  user_type: string
  validation_status: {
    valid: boolean
    reason: string
    expires: string
    mac_bound: string
  }
}

const AdminDashboard: React.FC = () => {
  const { licenseInfo } = useLicense()
  const [licenses, setLicenses] = useState<License[]>([])
  const [loading, setLoading] = useState(false)
  const [showGenerator, setShowGenerator] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // License generation form
  const [newLicense, setNewLicense] = useState({
    name: '',
    mac_address: '',
    expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 1 year from now
    user_id: ''
  })

  const API_BASE = 'http://127.0.0.1:9501'

  useEffect(() => {
    if (licenseInfo?.userType === 'admin') {
      fetchLicenses()
    }
  }, [licenseInfo])

  const fetchLicenses = async () => {
    try {
      setLoading(true)
      const response = await fetch(`${API_BASE}/license-info?license_key=${licenseInfo?.licenseKey}`)
      const data = await response.json()

      if (data.status === 'success') {
        setLicenses(data.data.licenses)
      } else {
        setError(data.message || 'Failed to fetch licenses')
      }
    } catch (error) {
      console.error('Error fetching licenses:', error)
      setError('Failed to fetch licenses')
    } finally {
      setLoading(false)
    }
  }

  const generateLicense = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`${API_BASE}/generate-license?admin_key=${licenseInfo?.licenseKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newLicense),
      })

      const data = await response.json()

      if (data.status === 'success') {
        alert(`License generated successfully!\n\nLicense Key: ${data.data.license_key}\n\nSend this key to ${data.data.name}`)

        // Reset form
        setNewLicense({
          name: '',
          mac_address: '',
          expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          user_id: ''
        })
        setShowGenerator(false)

        // Refresh licenses
        fetchLicenses()
      } else {
        setError(data.message || 'Failed to generate license')
      }
    } catch (error) {
      console.error('Error generating license:', error)
      setError('Failed to generate license')
    } finally {
      setLoading(false)
    }
  }

  const formatMacAddress = (mac: string) => {
    return mac.replace(/(.{2})(?=.)/g, '$1:')
  }

  const getStatusBadge = (license: License) => {
    const isValid = license.validation_status.valid
    const baseClasses = "px-2 py-1 text-xs font-semibold rounded-full"

    if (isValid) {
      return <span className={`${baseClasses} bg-green-100 text-green-800`}>Valid</span>
    } else {
      return <span className={`${baseClasses} bg-red-100 text-red-800`}>Invalid</span>
    }
  }

  if (licenseInfo?.userType !== 'admin') {
    return null
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Admin Dashboard</h2>
          <p className="text-gray-600">License Management & User Administration</p>
        </div>
        <button
          onClick={() => setShowGenerator(!showGenerator)}
          className="px-4 py-2 bg-[#86c8bc] text-[#001e32] rounded-lg hover:bg-[#7bb8ac] transition-colors"
        >
          {showGenerator ? 'Hide Generator' : 'Generate License'}
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* License Generator */}
      {showGenerator && (
        <div className="bg-gray-50 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Generate New License</h3>
          <form onSubmit={generateLicense} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">User Name</label>
              <input
                type="text"
                value={newLicense.name}
                onChange={(e) => setNewLicense({...newLicense, name: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="John Smith"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">MAC Address</label>
              <input
                type="text"
                value={newLicense.mac_address}
                onChange={(e) => setNewLicense({...newLicense, mac_address: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="AA:BB:CC:DD:EE:FF or AABBCCDDEEFF"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
              <input
                type="date"
                value={newLicense.expiry_date}
                onChange={(e) => setNewLicense({...newLicense, expiry_date: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">User ID (Optional)</label>
              <input
                type="text"
                value={newLicense.user_id}
                onChange={(e) => setNewLicense({...newLicense, user_id: e.target.value})}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                placeholder="Auto-generated if empty"
              />
            </div>

            <div className="md:col-span-2 flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-[#86c8bc] text-[#001e32] rounded-md hover:bg-[#7bb8ac] disabled:opacity-50"
              >
                {loading ? 'Generating...' : 'Generate License'}
              </button>
              <button
                type="button"
                onClick={() => setShowGenerator(false)}
                className="px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* License List */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Active Licenses ({licenses.length})</h3>
          <button
            onClick={fetchLicenses}
            disabled={loading}
            className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>

        {loading && licenses.length === 0 ? (
          <div className="text-center py-8">
            <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
            <p className="text-gray-600">Loading licenses...</p>
          </div>
        ) : licenses.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No licenses found. Generate your first license above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full table-auto">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">User</th>
                  <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">MAC Address</th>
                  <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Expires</th>
                  <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Status</th>
                  <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">License Key</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {licenses.map((license, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div>
                        <div className="font-medium text-gray-900">{license.name}</div>
                        <div className="text-sm text-gray-500">
                          {license.user_type === 'admin' ? 'Administrator' : 'Regular User'}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                        {license.mac_address === 'ANY' ? 'Any MAC' : formatMacAddress(license.mac_address)}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {license.expiry_date}
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(license)}
                      {!license.validation_status.valid && (
                        <div className="text-xs text-gray-500 mt-1">
                          {license.validation_status.reason}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded max-w-xs truncate">
                          {license.license_key}
                        </code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(license.license_key)
                            alert('License key copied to clipboard!')
                          }}
                          className="text-blue-600 hover:text-blue-800"
                          title="Copy license key"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default AdminDashboard