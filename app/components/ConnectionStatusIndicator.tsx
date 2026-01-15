'use client';

import React from 'react';
import { useRealtimeSync } from '@/app/hooks/useRealtimeSync';

/**
 * Premium UI component for displaying WebSocket connection status
 */
export function ConnectionStatusIndicator() {
    const { isConnected, connectionState } = useRealtimeSync();

    const getStatusColor = () => {
        switch (connectionState) {
            case 'connected': return 'bg-emerald-500';
            case 'connecting': return 'bg-amber-500 animate-pulse';
            case 'disconnected':
            case 'error': return 'bg-rose-500';
            default: return 'bg-gray-400';
        }
    };

    const getStatusText = () => {
        switch (connectionState) {
            case 'connected': return 'Live';
            case 'connecting': return 'Connecting...';
            case 'disconnected': return 'Disconnected';
            case 'error': return 'Offline';
            default: return 'Checking...';
        }
    };

    return (
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-100 dark:border-gray-700 shadow-sm transition-all duration-300 hover:shadow-md cursor-default group">
            <div className="relative flex h-2 w-2">
                {connectionState === 'connected' && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                )}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${getStatusColor()}`}></span>
            </div>
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300 select-none">
                {getStatusText()}
            </span>

            {/* Tooltip */}
            <div className="absolute top-10 right-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                <div className="bg-gray-900 text-white text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap">
                    Real-time updates active
                </div>
            </div>
        </div>
    );
}
