'use client';

import React from 'react';
import { useImpersonation } from '../context/ImpersonationContext';

/**
 * Banner displayed when admin is impersonating another user.
 * Uses ImpersonationContext for state and actions.
 */
export default function ImpersonationBanner() {
    const { isImpersonating, originalUser, impersonatedUser, stopImpersonation } = useImpersonation();

    if (!isImpersonating || !impersonatedUser || !originalUser) {
        return null;
    }

    const handleStop = () => {
        stopImpersonation();
    };

    return (
        <div className="bg-amber-500 text-amber-900 px-4 py-2 shadow-md">
            <div className="max-w-[1920px] mx-auto flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-medium">
                        Viewing as <strong>{impersonatedUser.name}</strong>
                    </span>
                    <span className="bg-amber-200 text-amber-800 text-xs px-2 py-0.5 rounded-full font-medium">
                        {impersonatedUser.role.replace(/_/g, ' ')}
                    </span>
                    <span className="text-amber-700 text-sm">
                        (Logged in as {originalUser.name})
                    </span>
                </div>
                <button
                    onClick={handleStop}
                    className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded text-sm font-medium transition-colors flex items-center gap-1"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Stop Impersonation
                </button>
            </div>
        </div>
    );
}
