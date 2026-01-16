import { NextRequest } from 'next/server';

// Log Levels
export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

export interface LogEntry {
    timestamp: string;
    requestId: string;
    method: string;
    path: string;
    level: LogLevel;
    userId: string;
    tenantId: string;
    ip: string;
    duration?: number;
    status?: number;
    error?: any;
    userAgent?: string;
}

// In-memory log buffer (circular buffer-ish by slicing)
const MAX_LOGS = 1000;
let logBuffer: LogEntry[] = [];

export function getRequestLogs(requestId?: string): LogEntry[] {
    if (requestId) {
        return logBuffer.filter(log => log.requestId === requestId);
    }
    return [...logBuffer]; // Return copy
}

export function logRequest(req: NextRequest, session: any | null, options: {
    startTime?: number,
    status?: number,
    error?: any,
    level?: LogLevel
} = {}) {
    const timestamp = new Date().toISOString();

    // Get correlation ID or generate
    const requestId = req.headers.get('X-Request-ID') || `req-${Date.now()}`;

    const method = req.method;
    const path = req.nextUrl.pathname;
    const userId = session?.userId || 'anonymous';
    const tenantId = session?.tenantId || 'unknown';
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    const duration = options.startTime ? Date.now() - options.startTime : undefined;
    const level = options.level || (options.error ? 'ERROR' : 'INFO');

    const logEntry: LogEntry = {
        timestamp,
        requestId,
        method,
        path,
        level,
        userId,
        tenantId,
        ip,
        duration,
        status: options.status,
        error: options.error,
        userAgent
    };

    // Console logging
    const logMsg = `[${timestamp}] [${level}] [${requestId}] ${method} ${path} (${duration ? duration + 'ms' : '-'}) - ${options.status || '-'} User:${userId}`;

    if (level === 'ERROR' || level === 'CRITICAL') {
        console.error(logMsg, options.error || '');
    } else if (level === 'WARN') {
        console.warn(logMsg);
    } else {
        console.log(logMsg);
    }

    // Add to buffer
    logBuffer.push(logEntry);
    if (logBuffer.length > MAX_LOGS) {
        logBuffer = logBuffer.slice(logBuffer.length - MAX_LOGS);
    }
}
