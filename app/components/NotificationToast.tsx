'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export interface ToastMessage {
    id: string;
    type: 'success' | 'error' | 'info' | 'warning';
    title: string;
    message: string;
    duration?: number;
}

export function NotificationToast() {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const addToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
        const id = Math.random().toString(36).substr(2, 9);
        const newToast = { ...toast, id };
        setToasts(prev => [...prev, newToast]);

        if (toast.duration !== 0) {
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== id));
            }, toast.duration || 5000);
        }
    }, []);

    useEffect(() => {
        const handleToastEvent = (event: CustomEvent<Omit<ToastMessage, 'id'>>) => {
            addToast(event.detail);
        };

        window.addEventListener('app-toast', handleToastEvent as EventListener);
        return () => window.removeEventListener('app-toast', handleToastEvent as EventListener);
    }, [addToast]);

    const removeToast = (id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    return (
        <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
            <AnimatePresence>
                {toasts.map((toast) => (
                    <motion.div
                        key={toast.id}
                        initial={{ opacity: 0, x: 20, scale: 0.95 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 20, scale: 0.95 }}
                        className={`pointer-events-auto w-80 rounded-lg shadow-lg border p-4 bg-white flex items-start gap-3 ${toast.type === 'success' ? 'border-emerald-100 bg-emerald-50/30' :
                                toast.type === 'error' ? 'border-rose-100 bg-rose-50/30' :
                                    toast.type === 'warning' ? 'border-amber-100 bg-amber-50/30' :
                                        'border-blue-100 bg-blue-50/30'
                            }`}
                    >
                        <div className={`mt-0.5 flex-shrink-0 h-5 w-5 rounded-full flex items-center justify-center ${toast.type === 'success' ? 'bg-emerald-100 text-emerald-600' :
                                toast.type === 'error' ? 'bg-rose-100 text-rose-600' :
                                    toast.type === 'warning' ? 'bg-amber-100 text-amber-600' :
                                        'bg-blue-100 text-blue-600'
                            }`}>
                            {toast.type === 'success' && (
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                </svg>
                            )}
                            {toast.type === 'error' && (
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            )}
                            {(toast.type === 'warning' || toast.type === 'info') && (
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            )}
                        </div>
                        <div className="flex-grow">
                            <h4 className="text-sm font-bold text-gray-900 leading-tight">{toast.title}</h4>
                            <p className="mt-1 text-xs text-gray-600 leading-relaxed">{toast.message}</p>
                        </div>
                        <button
                            onClick={() => removeToast(toast.id)}
                            className="mt-0.5 flex-shrink-0 text-gray-400 hover:text-gray-600"
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}

export function showToast(toast: Omit<ToastMessage, 'id'>) {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('app-toast', { detail: toast }));
    }
}
