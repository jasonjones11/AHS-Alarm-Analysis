'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface LicenseInfo {
  valid: boolean
  userType: 'regular' | 'admin'
  expires: string | null
  macBound: string | null
  name: string
  licenseKey: string
}

interface LicenseContextType {
  licenseInfo: LicenseInfo | null
  isLicensed: boolean
  isAdmin: boolean
  validateLicense: (licenseKey: string) => Promise<boolean>
  clearLicense: () => void
  loading: boolean
  error: string | null
}

const LicenseContext = createContext<LicenseContextType | undefined>(undefined)

export const useLicense = () => {
  const context = useContext(LicenseContext)
  if (context === undefined) {
    throw new Error('useLicense must be used within a LicenseProvider')
  }
  return context
}

interface LicenseProviderProps {
  children: ReactNode
}

export const LicenseProvider: React.FC<LicenseProviderProps> = ({ children }) => {
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const API_BASE = 'http://127.0.0.1:9501'

  useEffect(() => {
    // Check for existing license in localStorage on startup
    checkStoredLicense()
  }, [])

  const checkStoredLicense = async () => {
    try {
      const storedLicense = localStorage.getItem('ahs_license_key')
      if (storedLicense) {
        const isValid = await validateLicense(storedLicense)
        if (!isValid) {
          localStorage.removeItem('ahs_license_key')
        }
      }
    } catch (error) {
      console.error('Error checking stored license:', error)
      localStorage.removeItem('ahs_license_key')
    } finally {
      setLoading(false)
    }
  }

  const validateLicense = async (licenseKey: string): Promise<boolean> => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`${API_BASE}/validate-license`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ license_key: licenseKey }),
      })

      const data = await response.json()

      if (data.status === 'success' && data.data.valid) {
        const licenseData: LicenseInfo = {
          valid: true,
          userType: data.data.user_type || 'regular',
          expires: data.data.expires,
          macBound: data.data.mac_bound,
          name: data.data.name || 'Unknown User',
          licenseKey: licenseKey
        }

        setLicenseInfo(licenseData)
        localStorage.setItem('ahs_license_key', licenseKey)

        console.log(`[LICENSE] Valid license for ${licenseData.name} (${licenseData.userType})`)
        return true
      } else {
        setError(data.message || 'Invalid license key')
        console.error('[LICENSE] Validation failed:', data.message)
        return false
      }
    } catch (error) {
      console.error('[LICENSE] Validation error:', error)
      setError('Failed to validate license. Check backend connection.')
      return false
    } finally {
      setLoading(false)
    }
  }

  const clearLicense = () => {
    setLicenseInfo(null)
    setError(null)
    localStorage.removeItem('ahs_license_key')
    console.log('[LICENSE] License cleared')
  }

  const value: LicenseContextType = {
    licenseInfo,
    isLicensed: licenseInfo?.valid || false,
    isAdmin: licenseInfo?.userType === 'admin',
    validateLicense,
    clearLicense,
    loading,
    error
  }

  return (
    <LicenseContext.Provider value={value}>
      {children}
    </LicenseContext.Provider>
  )
}