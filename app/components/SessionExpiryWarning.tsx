'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface SessionExpiryWarningProps {
    show: boolean;
    timeUntilExpiry: number; // in milliseconds
    onExtend: () => Promise<boolean>;
    onLogout: () => void;
}

export default function SessionExpiryWarning({
    show,
    timeUntilExpiry,
    onExtend,
    onLogout
}: SessionExpiryWarningProps) {
    const [timeLeft, setTimeLeft] = useState(timeUntilExpiry);
    const [extending, setExtending] = useState(false);

    useEffect(() => {
        if (!show) return;

        setTimeLeft(timeUntilExpiry);

        const interval = setInterval(() => {
            setTimeLeft(prev => Math.max(0, prev - 1000));
        }, 1000);

        return () => clearInterval(interval);
    }, [show, timeUntilExpiry]);

    if (!show) return null;

    const minutes = Math.floor(timeLeft / 60000);
    const seconds = Math.floor((timeLeft % 60000) / 1000);

    const handleExtend = async () => {
        setExtending(true);
        await onExtend();
        setExtending(false);
    };

    // Render to portal if document is available, otherwise null
    if (typeof document === 'undefined') return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-zinc-900 rounded-lg shadow-2xl p-6 w-full max-w-md border border-red-200 dark:border-red-900 animate-in fade-in zoom-in duration-200">
                <div className="flex flex-col items-center text-center space-y-4">
                    <div className="bg-red-100 dark:bg-red-900/30 p-3 rounded-full animate-pulse">
                        <svg
                            className="w-8 h-8 text-red-600 dark:text-red-400"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>

                    <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                        Session Expiring Soon
                    </h2>

                    <p className="text-zinc-600 dark:text-zinc-400">
                        Your session will expire in <span className="font-mono font-bold text-red-600 dark:text-red-400">{minutes}:{seconds.toString().padStart(2, '0')}</span> due to inactivity.
                        Any unsaved changes may be lost.
                    </p>

                    <div className="flex w-full space-x-3 pt-2">
                        <button
                            onClick={onLogout}
                            className="flex-1 px-4 py-2 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                        >
                            Logout Now
                        </button>
                        <button
                            onClick={handleExtend}
                            disabled={extending}
                            className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center justify-center"
                        >
                            {extending ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Extending...
                                </>
                            ) : (
                                'Extend Session'
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
