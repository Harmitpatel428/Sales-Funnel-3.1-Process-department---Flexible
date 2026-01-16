'use client';

import React, { createContext, useContext, useEffect, useCallback } from 'react';
import { captureError } from '../utils/errorTelemetry';

interface ErrorTelemetryContextType {
    reportError: (error: unknown, context?: Record<string, any>) => void;
}

const ErrorTelemetryContext = createContext<ErrorTelemetryContextType | undefined>(undefined);

export function useErrorTelemetry() {
    const context = useContext(ErrorTelemetryContext);
    if (!context) {
        throw new Error('useErrorTelemetry must be used within an ErrorTelemetryProvider');
    }
    return context;
}

export function ErrorTelemetryProvider({ children }: { children: React.ReactNode }) {

    const reportError = useCallback((error: unknown, context?: Record<string, any>) => {
        captureError(error, context);
    }, []);

    useEffect(() => {
        const handleGlobalError = (event: ErrorEvent) => {
            captureError(event.error || new Error(event.message), {
                componentStack: 'Global Window Error',
                additionalContext: { filename: event.filename, lineno: event.lineno }
            });
        };

        const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
            captureError(event.reason, {
                componentStack: 'Unhandled Promise Rejection'
            });
        };

        window.addEventListener('error', handleGlobalError);
        window.addEventListener('unhandledrejection', handleUnhandledRejection);

        return () => {
            window.removeEventListener('error', handleGlobalError);
            window.removeEventListener('unhandledrejection', handleUnhandledRejection);
        };
    }, []);

    return (
        <ErrorTelemetryContext.Provider value={{ reportError }}>
            {children}
        </ErrorTelemetryContext.Provider>
    );
}
