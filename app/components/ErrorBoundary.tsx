'use client';

import React, { Component, ReactNode } from 'react';
import { debugLogger, DebugCategory } from '../utils/debugLogger';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  errorId: string;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  showDetails?: boolean;
  level?: 'app' | 'page' | 'component';
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: ''
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Generate unique error ID
    const errorId = `ERR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      hasError: true,
      error,
      errorId
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const { onError, level = 'component' } = this.props;
    
    // Update state with error info
    this.setState({
      errorInfo
    });

    // Log error to debug logger
    try {
      debugLogger.error(DebugCategory.GENERAL, error.message, {
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        level,
        errorId: this.state.errorId,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href
      });
    } catch (logError) {
      console.error('Failed to log error to debug logger:', logError);
    }

    // Call custom error handler if provided
    if (onError) {
      try {
        onError(error, errorInfo);
      } catch (handlerError) {
        console.error('Error in custom error handler:', handlerError);
      }
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Error Boundary caught an error:', error);
      console.error('Error Info:', errorInfo);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: ''
    });
  };

  handleCopyErrorDetails = async () => {
    const { error, errorInfo, errorId } = this.state;
    const errorDetails = {
      errorId,
      timestamp: new Date().toISOString(),
      message: error?.message,
      stack: error?.stack,
      componentStack: errorInfo?.componentStack,
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(errorDetails, null, 2));
      // You could show a toast notification here if available
      console.log('Error details copied to clipboard');
    } catch (err) {
      console.error('Failed to copy error details:', err);
    }
  };

  render() {
    const { hasError, error, errorId } = this.state;
    const { children, fallback, showDetails = process.env.NODE_ENV === 'development' } = this.props;

    if (hasError) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback;
      }

      // Default fallback UI
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0">
                <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-medium text-gray-900">
                  Something went wrong
                </h3>
                <p className="text-sm text-gray-500">
                  Error ID: {errorId}
                </p>
              </div>
            </div>

            {showDetails && error && (
              <div className="mb-4 p-3 bg-gray-100 rounded-md">
                <p className="text-sm font-medium text-gray-700 mb-2">Error Details:</p>
                <p className="text-sm text-gray-600 mb-2">{error.message}</p>
                {error.stack && (
                  <details className="text-xs text-gray-500">
                    <summary className="cursor-pointer hover:text-gray-700">Stack Trace</summary>
                    <pre className="mt-2 whitespace-pre-wrap overflow-auto max-h-32">
                      {error.stack}
                    </pre>
                  </details>
                )}
              </div>
            )}

            <div className="flex flex-col space-y-2">
              <button
                onClick={this.handleReload}
                className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
              >
                Reload Page
              </button>
              
              <button
                onClick={this.handleGoHome}
                className="w-full bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
              >
                Go to Dashboard
              </button>
              
              <button
                onClick={this.handleReset}
                className="w-full bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors"
              >
                Try Again
              </button>
              
              <button
                onClick={this.handleCopyErrorDetails}
                className="w-full bg-gray-200 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-300 transition-colors"
              >
                Copy Error Details
              </button>
            </div>

            <div className="mt-4 text-xs text-gray-500 text-center">
              If this problem persists, please contact support with the error ID above.
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}
