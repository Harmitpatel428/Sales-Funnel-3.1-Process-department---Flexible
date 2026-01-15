"use client";

import React from 'react';
import { useWebSocket } from '@/lib/websocket/client';
import { cn } from '@/lib/utils';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';

interface ConnectionStatusProps {
    tenantId: string | undefined;
}

export function ConnectionStatus({ tenantId }: ConnectionStatusProps) {
    const { isConnected } = useWebSocket(tenantId);

    return (
        <div className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium transition-all duration-300 bg-background/50 border border-border/50 backdrop-blur-sm shadow-sm ring-1 ring-white/10 ring-inset">
            {isConnected ? (
                <>
                    <div className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </div>
                    <span className="text-emerald-500 flex items-center gap-1.5">
                        <Wifi className="w-3 h-3" />
                        Live
                    </span>
                </>
            ) : (
                <>
                    <div className="relative flex h-2 w-2">
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                    </div>
                    <span className="text-amber-500 flex items-center gap-1.5 font-semibold">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Connecting...
                    </span>
                </>
            )}
        </div>
    );
}
