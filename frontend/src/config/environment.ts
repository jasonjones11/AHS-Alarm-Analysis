/**
 * Environment Configuration
 * 
 * Centralized configuration management for different environments.
 * Uses Next.js environment variables with secure defaults.
 */

interface EnvironmentConfig {
  // API Configuration
  API_BASE_URL: string
  API_TIMEOUT: number
  
  // Development Configuration
  IS_DEVELOPMENT: boolean
  IS_PRODUCTION: boolean
  
  // Logging Configuration
  LOG_LEVEL: 'debug' | 'info' | 'warning' | 'error'
  ENABLE_CONSOLE_LOGS: boolean
  
  // Performance Configuration
  MAP_UPDATE_INTERVAL: number
  PLAYBACK_UPDATE_INTERVAL: number
  
  // Security Configuration
  ENABLE_CORS: boolean
  ALLOWED_ORIGINS: string[]
}

// Default configuration with secure values
const defaultConfig: EnvironmentConfig = {
  // API Configuration
  API_BASE_URL: 'http://127.0.0.1:9501',
  API_TIMEOUT: 30000,
  
  // Development Configuration
  IS_DEVELOPMENT: process.env.NODE_ENV === 'development',
  IS_PRODUCTION: process.env.NODE_ENV === 'production',
  
  // Logging Configuration - Production-safe defaults
  LOG_LEVEL: process.env.NODE_ENV === 'production' ? 'warning' : 'debug',
  ENABLE_CONSOLE_LOGS: process.env.NODE_ENV === 'development',
  
  // Performance Configuration
  MAP_UPDATE_INTERVAL: 100, // milliseconds
  PLAYBACK_UPDATE_INTERVAL: 50, // milliseconds
  
  // Security Configuration
  ENABLE_CORS: true,
  ALLOWED_ORIGINS: ['http://localhost:3000', 'http://127.0.0.1:3000']
}

// Environment-specific overrides using Next.js environment variables
const environmentConfig: EnvironmentConfig = {
  ...defaultConfig,
  
  // API Configuration from environment
  API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL || defaultConfig.API_BASE_URL,
  API_TIMEOUT: parseInt(process.env.NEXT_PUBLIC_API_TIMEOUT || '') || defaultConfig.API_TIMEOUT,
  
  // Logging Configuration from environment
  LOG_LEVEL: (process.env.NEXT_PUBLIC_LOG_LEVEL as EnvironmentConfig['LOG_LEVEL']) || defaultConfig.LOG_LEVEL,
  ENABLE_CONSOLE_LOGS: process.env.NEXT_PUBLIC_ENABLE_CONSOLE_LOGS === 'true' || defaultConfig.ENABLE_CONSOLE_LOGS,
  
  // Performance Configuration from environment
  MAP_UPDATE_INTERVAL: parseInt(process.env.NEXT_PUBLIC_MAP_UPDATE_INTERVAL || '') || defaultConfig.MAP_UPDATE_INTERVAL,
  PLAYBACK_UPDATE_INTERVAL: parseInt(process.env.NEXT_PUBLIC_PLAYBACK_UPDATE_INTERVAL || '') || defaultConfig.PLAYBACK_UPDATE_INTERVAL,
  
  // Security Configuration from environment
  ENABLE_CORS: process.env.NEXT_PUBLIC_ENABLE_CORS !== 'false',
  ALLOWED_ORIGINS: process.env.NEXT_PUBLIC_ALLOWED_ORIGINS?.split(',') || defaultConfig.ALLOWED_ORIGINS
}

// Validation function to ensure configuration is valid
function validateConfig(config: EnvironmentConfig): void {
  if (!config.API_BASE_URL) {
    throw new Error('API_BASE_URL is required')
  }
  
  if (config.API_TIMEOUT <= 0) {
    throw new Error('API_TIMEOUT must be positive')
  }
  
  if (!['debug', 'info', 'warning', 'error'].includes(config.LOG_LEVEL)) {
    throw new Error('LOG_LEVEL must be one of: debug, info, warning, error')
  }
  
  if (config.MAP_UPDATE_INTERVAL <= 0) {
    throw new Error('MAP_UPDATE_INTERVAL must be positive')
  }
  
  if (config.PLAYBACK_UPDATE_INTERVAL <= 0) {
    throw new Error('PLAYBACK_UPDATE_INTERVAL must be positive')
  }
}

// Validate configuration on module load
try {
  validateConfig(environmentConfig)
} catch (error) {
  console.error('[CONFIG] Environment configuration validation failed:', error)
  throw error
}

// Export the validated configuration
export const config = environmentConfig

// Helper functions for common configuration checks
export const isProduction = () => config.IS_PRODUCTION
export const isDevelopment = () => config.IS_DEVELOPMENT
export const shouldLogToConsole = () => config.ENABLE_CONSOLE_LOGS
export const getApiBaseUrl = () => config.API_BASE_URL
export const getApiTimeout = () => config.API_TIMEOUT
export const getLogLevel = () => config.LOG_LEVEL

// Dynamic API URL detection for network access
const getApiBaseUrlDynamic = (): string => {
  // If running in browser and API_BASE_URL is localhost/127.0.0.1, 
  // try to use the same IP as the frontend
  if (typeof window !== 'undefined') {
    const frontendHost = window.location.hostname
    const apiUrl = config.API_BASE_URL
    
    // If API is configured for localhost/127.0.0.1 but frontend is accessed via network IP
    if ((apiUrl.includes('127.0.0.1') || apiUrl.includes('localhost')) && 
        (frontendHost !== '127.0.0.1' && frontendHost !== 'localhost')) {
      
      console.log(`[CONFIG] Frontend accessed via ${frontendHost}, switching API to same host`)
      // Replace localhost/127.0.0.1 with the actual frontend host
      const dynamicApiUrl = apiUrl
        .replace('127.0.0.1', frontendHost)
        .replace('localhost', frontendHost)
        .replace(':9500', ':9501') // Update to correct backend port 9501
      
      console.log(`[CONFIG] Dynamic API URL: ${dynamicApiUrl}`)
      return dynamicApiUrl
    }
  }
  
  // Default behavior - use configured API URL but ensure correct port 9501
  return config.API_BASE_URL.replace(':9500', ':9501')
}

// API URL builder helper with dynamic detection
export const buildApiUrl = (endpoint: string): string => {
  const baseUrl = getApiBaseUrlDynamic().replace(/\/$/, '') // Remove trailing slash
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  return `${baseUrl}${cleanEndpoint}`
}

// Debug configuration (only in development)
if (config.IS_DEVELOPMENT) {
  console.log('[CONFIG] Environment configuration loaded:', {
    API_BASE_URL: config.API_BASE_URL,
    LOG_LEVEL: config.LOG_LEVEL,
    ENABLE_CONSOLE_LOGS: config.ENABLE_CONSOLE_LOGS,
    NODE_ENV: process.env.NODE_ENV
  })
}

export default config