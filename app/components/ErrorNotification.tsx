'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ClassifiedError } from '../utils/errorHandling';

interface ErrorMessage {
    id: string;
    error: ClassifiedError;
    title: string;
    message: string;
    actions?: {
        label: string;
        action: () => void;
        variant?: 'primary' | 'secondary' | 'danger';
    }[];
    duration?: number;
}

export function ErrorNotification() {
    const [errors, setErrors] = useState<ErrorMessage[]>([]);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    const addError = useCallback((errorMsg: Omit<ErrorMessage, 'id'>) => {
        const id = Math.random().toString(36).substr(2, 9);
        const newError = { ...errorMsg, id };

        setErrors(prev => {
            // Enforce max 3
            const current = [...prev, newError];
            if (current.length > 3) {
                return current.slice(current.length - 3);
            }
            return current;
        });

        if (errorMsg.duration && errorMsg.duration > 0) {
            setTimeout(() => {
                removeError(id);
            }, errorMsg.duration);
        }
    }, []);

    const removeError = (id: string) => {
        setErrors(prev => prev.filter(e => e.id !== id));
        setExpandedIds(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
        });
    };

    const toggleExpand = (id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const copyDetails = async (error: ClassifiedError) => {
        try {
            await navigator.clipboard.writeText(JSON.stringify(error, null, 2));
            // Feedback handled by button text or toast
        } catch (e) {
            console.error('Failed to copy', e);
        }
    };

    useEffect(() => {
        const handleErrorEvent = (event: CustomEvent<Omit<ErrorMessage, 'id'>>) => {
            addError(event.detail);
        };

        window.addEventListener('app-error-notification', handleErrorEvent as EventListener);
        return () => window.removeEventListener('app-error-notification', handleErrorEvent as EventListener);
    }, [addError]);

    return (
        <div className="fixed top-4 right-4 z-[110] flex flex-col gap-3 pointer-events-none w-full max-w-sm">
            <AnimatePresence mode="popLayout">
                {errors.map((item) => (
                    <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: 20, scale: 0.95 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 20, scale: 0.95 }}
                        className={`pointer-events-auto bg-white rounded-lg shadow-xl border-l-4 overflow-hidden ${item.error.severity === 'CRITICAL' ? 'border-red-600' :
                                item.error.severity === 'HIGH' ? 'border-orange-500' : 'border-red-400'
                            }`}
                    >
                        <div className="p-4">
                            <div className="flex items-start">
                                <div className="flex-shrink-0">
                                    <svg className={`h-6 w-6 ${item.error.severity === 'CRITICAL' ? 'text-red-600' : 'text-orange-500'}`}
                                        fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
                                    </svg>
                                </div>
                                <div className="ml-3 w-0 flex-1 pt-0.5">
                                    <p className="text-sm font-medium text-gray-900">{item.title}</p>
                                    <p className="mt-1 text-sm text-gray-500">{item.message}</p>

                                    {/* Actions */}
                                    {item.actions && item.actions.length > 0 && (
                                        <div className="mt-3 flex space-x-3">
                                            {item.actions.map((action, idx) => (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    onClick={() => {
                                                        action.action();
                                                        if (action.label !== 'Copy Error Details') {
                                                            removeError(item.id);
                                                        }
                                                    }}
                                                    className={`bg-white rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${action.variant === 'primary' ? 'text-blue-600 hover:text-blue-500 focus:ring-blue-500' :
                                                            action.variant === 'danger' ? 'text-red-600 hover:text-red-500 focus:ring-red-500' :
                                                                'text-gray-700 hover:text-gray-500 focus:ring-gray-500'
                                                        }`}
                                                >
                                                    {action.label}
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {/* Expandable Details */}
                                    <div className="mt-2">
                                        <button
                                            onClick={() => toggleExpand(item.id)}
                                            className="text-xs text-gray-400 hover:text-gray-600 underline"
                                        >
                                            {expandedIds.has(item.id) ? 'Hide Details' : 'Show Details'}
                                        </button>

                                        {expandedIds.has(item.id) && (
                                            <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600 font-mono break-all max-h-32 overflow-y-auto border border-gray-100">
                                                <p>Type: {item.error.type}</p>
                                                <p>Code: {item.error.code}</p>
                                                {item.error.context?.endpoint && <p>Endpoint: {item.error.context.endpoint}</p>}
                                                <div className="mt-1">
                                                    <button
                                                        onClick={() => copyDetails(item.error)}
                                                        className="text-blue-500 hover:text-blue-700 font-sans"
                                                    >
                                                        Copy JSON
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="ml-4 flex-shrink-0 flex">
                                    <button
                                        className="bg-white rounded-md inline-flex text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                                        onClick={() => removeError(item.id)}
                                    >
                                        <span className="sr-only">Close</span>
                                        <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L10 8.586 5.707 4.293a1 1 0 010-1.414z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}

export function showErrorNotification(error: Omit<ErrorMessage, 'id'>) {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('app-error-notification', { detail: error }));
    }
}
