'use client';

import React from 'react';
import { usePresence } from '@/lib/websocket/client';
import { useUsers } from '@/app/context/UserContext';

interface PresenceIndicatorProps {
    entityType: 'lead' | 'case' | 'document';
    entityId: string;
    tenantId?: string;
}

/**
 * Component to display active users viewing the current entity
 */
export function PresenceIndicator({ entityType, entityId, tenantId }: PresenceIndicatorProps) {
    const { currentUser } = useUsers();
    const { activeUsers, isConnected } = usePresence(
        tenantId,
        entityType,
        entityId,
        currentUser ? { id: currentUser.id, name: currentUser.name } : undefined
    );

    // Filter out current user from the list to avoid showing "Me" (optional)
    const otherUsers = activeUsers.filter(u => u.userId !== currentUser?.id);

    if (!isConnected || activeUsers.length === 0) return null;

    return (
        <div className="flex items-center gap-2 py-2">
            <div className="flex -space-x-2 overflow-hidden">
                {activeUsers.map((user, idx) => (
                    <div
                        key={user.userId || idx}
                        className="inline-block h-8 w-8 rounded-full ring-2 ring-white dark:ring-gray-900 bg-purple-100 flex items-center justify-center overflow-hidden group relative"
                        title={user.userName}
                    >
                        <span className="text-xs font-bold text-purple-700 uppercase">
                            {user.userName?.substring(0, 2) || '??'}
                        </span>

                        {/* Action Badge */}
                        <div className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-emerald-500 border border-white dark:border-gray-900" title={user.action}></div>

                        {/* Tooltip */}
                        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                            <div className="bg-gray-900 text-white text-[10px] px-2 py-1 rounded shadow-lg whitespace-nowrap">
                                {user.userName} {user.userId === currentUser?.id ? '(You)' : ''} is {user.action || 'viewing'}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <span className="text-xs text-gray-400 font-medium">
                {activeUsers.length} active now
            </span>
        </div>
    );
}
