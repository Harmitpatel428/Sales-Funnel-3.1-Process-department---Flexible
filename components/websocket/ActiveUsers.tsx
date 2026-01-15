"use client";

import React from 'react';
import { usePresence } from '@/lib/websocket/client';

interface ActiveUsersProps {
    tenantId: string | undefined;
    entityType: 'lead' | 'case' | 'document';
    entityId: string;
    currentUser?: { id: string, name: string };
}

/**
 * Component to display active users on a specific entity
 */
export function ActiveUsers({ tenantId, entityType, entityId, currentUser }: ActiveUsersProps) {
    const { activeUsers } = usePresence(tenantId, entityType, entityId, currentUser);

    if (activeUsers.length === 0) return null;

    return (
        <div className="flex items-center gap-2 py-2">
            <div className="flex -space-x-2">
                {activeUsers.map((user) => (
                    <div
                        key={user.userId}
                        title={`${user.userName} - ${user.action || 'viewing'}`}
                        className={`w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold shadow-sm transition-transform hover:-translate-y-1 hover:z-10 cursor-help
                            ${user.action === 'editing' ? 'bg-orange-100 text-orange-700 border-orange-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}
                    >
                        {(user.userName || '??').substring(0, 2).toUpperCase()}
                    </div>
                ))}
            </div>
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold ml-1">
                {activeUsers.length} {activeUsers.length === 1 ? 'user' : 'users'} active
            </span>
        </div>
    );
}
