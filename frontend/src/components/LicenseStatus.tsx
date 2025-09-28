'use client'

import React, { useState } from 'react'
import { useLicense } from '@/context/LicenseContext'

const LicenseStatus: React.FC = () => {
  const { licenseInfo, clearLicense, isAdmin } = useLicense()
  const [showDetails, setShowDetails] = useState(false)

  if (!licenseInfo) return null

  const getDaysUntilExpiry = () => {
    if (!licenseInfo.expires) return null

    const expiryDate = new Date(licenseInfo.expires)
    const today = new Date()
    const diffTime = expiryDate.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    return diffDays
  }

  const daysUntilExpiry = getDaysUntilExpiry()
  const isExpiringSoon = daysUntilExpiry !== null && daysUntilExpiry <= 30

  return (
    <>
      {/* Status Badge */}
      <div className="relative">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className={`flex items-center space-x-2 px-3 py-1 rounded-full text-sm font-medium transition-colors ${
            isAdmin
              ? 'bg-purple-100 text-purple-800 hover:bg-purple-200'
              : isExpiringSoon
                ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                : 'bg-green-100 text-green-800 hover:bg-green-200'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            {isAdmin ? 'Admin' : 'Licensed'}
          </span>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* Details Dropdown */}
        {showDetails && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setShowDetails(false)} />
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-20">
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-gray-800">License Information</h3>
                  <div className={`px-2 py-1 rounded text-xs font-medium ${
                    isAdmin ? 'bg-purple-100 text-purple-800' : 'bg-green-100 text-green-800'
                  }`}>
                    {isAdmin ? 'Administrator' : 'Regular User'}
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <dt className="text-sm font-medium text-gray-600">Licensed to:</dt>
                    <dd className="text-sm text-gray-900 font-semibold">{licenseInfo.name}</dd>
                  </div>

                  {licenseInfo.expires && (
                    <div>
                      <dt className="text-sm font-medium text-gray-600">Expires:</dt>
                      <dd className="text-sm text-gray-900">
                        {licenseInfo.expires}
                        {daysUntilExpiry !== null && (
                          <span className={`ml-2 text-xs ${
                            daysUntilExpiry <= 7 ? 'text-red-600' :
                            daysUntilExpiry <= 30 ? 'text-yellow-600' : 'text-green-600'
                          }`}>
                            ({daysUntilExpiry > 0 ? `${daysUntilExpiry} days left` : 'Expired'})
                          </span>
                        )}
                      </dd>
                    </div>
                  )}

                  {licenseInfo.macBound && licenseInfo.macBound !== 'ANY' && (
                    <div>
                      <dt className="text-sm font-medium text-gray-600">Hardware Binding:</dt>
                      <dd className="text-sm text-gray-900 font-mono">{licenseInfo.macBound}</dd>
                    </div>
                  )}

                  <div>
                    <dt className="text-sm font-medium text-gray-600">License Key:</dt>
                    <dd className="text-xs text-gray-900 font-mono bg-gray-100 p-2 rounded break-all">
                      {licenseInfo.licenseKey}
                    </dd>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-200">
                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to sign out? You will need to re-enter your license key.')) {
                        clearLicense()
                        setShowDetails(false)
                      }
                    }}
                    className="w-full px-3 py-2 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Expiry Warning */}
      {isExpiringSoon && daysUntilExpiry !== null && daysUntilExpiry > 0 && (
        <div className="fixed bottom-4 right-4 bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded-lg shadow-lg max-w-sm z-30">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <div>
              <div className="font-medium text-sm">License Expiring Soon</div>
              <div className="text-xs mt-1">
                Your license expires in {daysUntilExpiry} day{daysUntilExpiry !== 1 ? 's' : ''}.
                Contact your administrator for renewal.
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default LicenseStatus