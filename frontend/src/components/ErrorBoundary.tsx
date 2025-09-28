'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'
import { createComponentLogger } from '@/utils/frontendLogger'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  resetKey?: string | number
  resetOnPropsChange?: boolean
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  errorId: string | null
}

class ErrorBoundary extends Component<Props, State> {
  private logger = createComponentLogger('ErrorBoundary')
  private resetTimeoutId: number | null = null

  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    errorId: null
  }

  public static getDerivedStateFromError(error: Error): State {
    const errorId = `err_${error.message.length}_${error.name.length}_${error.stack?.length || 0}`
    return {
      hasError: true,
      error,
      errorInfo: null,
      errorId
    }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const errorId = this.state.errorId || `err_${error.message.length}_${error.name.length}`
    
    // Log comprehensive error information
    this.logger.error('component-error', 'React component error caught', error, {
      errorId,
      errorInfo,
      componentStack: errorInfo.componentStack,
      errorBoundary: this.constructor.name,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href
    })

    // Call optional error handler
    this.props.onError?.(error, errorInfo)

    // Update state with error info
    this.setState({ errorInfo })
  }

  public componentDidUpdate(prevProps: Props) {
    const { resetKey, resetOnPropsChange } = this.props
    const { hasError } = this.state

    // Reset error boundary when resetKey changes
    if (hasError && prevProps.resetKey !== resetKey) {
      this.resetErrorBoundary()
    }

    // Reset error boundary when any props change (if enabled)
    if (hasError && resetOnPropsChange && prevProps !== this.props) {
      this.resetErrorBoundary()
    }
  }

  public componentWillUnmount() {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId)
    }
  }

  private resetErrorBoundary = () => {
    this.logger.info('error-recovery', 'Resetting error boundary')
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null
    })
  }

  private handleRetry = () => {
    this.logger.userAction('retry-after-error', 'User clicked retry button')
    this.resetErrorBoundary()
  }

  private handleReload = () => {
    this.logger.userAction('reload-after-error', 'User clicked reload button')
    window.location.reload()
  }

  private scheduleAutoRetry = () => {
    this.logger.info('error-recovery', 'Scheduling auto retry in 10 seconds')
    this.resetTimeoutId = window.setTimeout(() => {
      this.logger.info('error-recovery', 'Auto retry triggered')
      this.resetErrorBoundary()
    }, 10000)
  }

  public render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback
      }

      // Default error UI
      return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
          <div className="bg-gray-800 border border-red-500 rounded-lg p-6 max-w-2xl w-full">
            <div className="flex items-center mb-4">
              <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center mr-3">
                <span className="text-white font-bold">!</span>
              </div>
              <h1 className="text-xl font-bold text-white">Something went wrong</h1>
            </div>
            
            <div className="text-gray-300 mb-6">
              <p className="mb-2">
                The application encountered an unexpected error. This has been automatically reported to help us improve the system.
              </p>
              <p className="text-sm text-gray-400">
                Error ID: <code className="bg-gray-700 px-1 rounded">{this.state.errorId}</code>
              </p>
            </div>

            {/* Error details (only in development) */}
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <div className="bg-gray-900 border border-gray-600 rounded p-4 mb-6">
                <h3 className="text-sm font-semibold text-red-400 mb-2">Error Details (Development)</h3>
                <pre className="text-xs text-gray-300 overflow-auto max-h-32">
                  {this.state.error.toString()}
                </pre>
                {this.state.errorInfo && (
                  <pre className="text-xs text-gray-400 overflow-auto max-h-32 mt-2">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={this.handleRetry}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={this.handleReload}
                className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded transition-colors"
              >
                Reload Page
              </button>
              <button
                onClick={this.scheduleAutoRetry}
                className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-4 py-2 rounded transition-colors"
                disabled={!!this.resetTimeoutId}
              >
                {this.resetTimeoutId ? 'Auto retry in 10s...' : 'Auto Retry'}
              </button>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-600">
              <p className="text-xs text-gray-400">
                If this problem persists, please contact support with the error ID above.
              </p>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary

// Specialized error boundaries for different parts of the application

export const MapErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    fallback={
      <div className="w-full h-full bg-gray-900 flex items-center justify-center border border-gray-700 rounded-lg">
        <div className="text-center p-8">
          <div className="w-16 h-16 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl">🗺️</span>
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Map Error</h3>
          <p className="text-gray-300 mb-4">The map component encountered an error.</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
          >
            Reload Map
          </button>
        </div>
      </div>
    }
    resetOnPropsChange={true}
  >
    {children}
  </ErrorBoundary>
)

export const DataPanelErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    fallback={
      <div className="bg-gray-800 border border-red-500 rounded-lg p-6 m-4">
        <div className="text-center">
          <div className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-white text-xl">📊</span>
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Data Panel Error</h3>
          <p className="text-gray-300 mb-4">Unable to load the data extraction panel.</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm"
          >
            Reload
          </button>
        </div>
      </div>
    }
  >
    {children}
  </ErrorBoundary>
)

export const PlaybackErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ErrorBoundary
    fallback={
      <div className="bg-gray-800 border border-red-500 rounded-lg p-4 m-2">
        <div className="text-center">
          <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-2">
            <span className="text-white">▶️</span>
          </div>
          <h4 className="text-sm font-semibold text-white mb-1">Playback Error</h4>
          <p className="text-xs text-gray-300 mb-2">Playback controls encountered an error.</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs"
          >
            Reset
          </button>
        </div>
      </div>
    }
  >
    {children}
  </ErrorBoundary>
)