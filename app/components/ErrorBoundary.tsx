'use client';

import React, { Component, ReactNode } from 'react';
import { debugLogger, DebugCategory } from '../utils/debugLogger';
import { captureError } from '../utils/errorTelemetry';
import { classifyError, ClassifiedError } from '../utils/errorHandling';

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  classifiedError: ClassifiedError | null;
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
      classifiedError: null,
      errorInfo: null,
      errorId: ''
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    const errorId = `ERR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const classifiedError = classifyError(error, { requestId: errorId });

    return {
      hasError: true,
      error,
      classifiedError,
      errorId
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const { onError, level = 'component' } = this.props;
    const { errorId } = this.state;

    this.setState({ errorInfo });

    // 1. Capture Telemetry
    captureError(error, {
      componentStack: errorInfo.componentStack,
      errorId,
      level,
      userAgent: navigator.userAgent,
      url: window.location.href
    });

    // 2. Log to debug logger
    try {
      debugLogger.error(DebugCategory.GENERAL, error.message, {
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        level,
        errorId,
        timestamp: new Date().toISOString(),
      });
    } catch (logError) {
      console.error('Failed to log error to debug logger:', logError);
    }

    // 3. Custom Handler
    if (onError) {
      try {
        onError(error, errorInfo);
      } catch (handlerError) {
        console.error('Error in custom error handler:', handlerError);
      }
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
      classifiedError: null,
      errorInfo: null,
      errorId: ''
    });
  };

  handleCopyErrorDetails = async () => {
    const { error, errorInfo, errorId, classifiedError } = this.state;
    const errorDetails = {
      errorId,
      code: classifiedError?.code,
      type: classifiedError?.type,
      timestamp: new Date().toISOString(),
      message: error?.message,
      componentStack: errorInfo?.componentStack,
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(errorDetails, null, 2));
      // Could show toast here but logic is self-contained
      console.log('Error details copied to clipboard');
    } catch (err) {
      console.error('Failed to copy error details:', err);
    }
  };

  render() {
    const { hasError, error, errorId, classifiedError } = this.state;
    const { children, fallback, level = 'component', showDetails = process.env.NODE_ENV === 'development' } = this.props;

    if (hasError) {
      if (fallback) {
        return fallback;
      }

      // Compact fallback for component level
      if (level === 'component') {
        return (
          <div className="p-4 border border-red-200 bg-red-50 rounded-lg text-sm text-red-800 flex flex-col gap-2">
            <div className="font-semibold flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              Component Error
            </div>
            <div>{error?.message || 'Something went wrong'}</div>
            <button onClick={this.handleReset} className="text-blue-600 hover:text-blue-800 underline self-start text-xs">
              Try Again
            </button>
          </div>
        );
      }

      // Full page fallback
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
                  {classifiedError?.type === 'NETWORK' ? 'Connection Error' : 'System Error'}
                </h3>
                <p className="text-sm text-gray-500">
                  Ref: {errorId}
                </p>
              </div>
            </div>

            <div className="mb-4">
              <p className="text-gray-700">{classifiedError?.message || error?.message}</p>
              {classifiedError?.type === 'NETWORK' && (
                <p className="text-sm text-gray-500 mt-2">Please check your internet connection.</p>
              )}
            </div>

            {showDetails && error && (
              <div className="mb-4 p-3 bg-gray-100 rounded-md">
                <details className="text-xs text-gray-500">
                  <summary className="cursor-pointer hover:text-gray-700 font-medium">Technical Details</summary>
                  <pre className="mt-2 whitespace-pre-wrap overflow-auto max-h-32 p-2">
                    {error.stack}
                  </pre>
                </details>
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
                onClick={this.handleCopyErrorDetails}
                className="w-full bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 transition-colors"
              >
                Copy Error Details
              </button>
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}
