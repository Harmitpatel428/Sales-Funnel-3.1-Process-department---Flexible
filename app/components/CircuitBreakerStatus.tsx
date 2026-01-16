'use client';

import React, { useEffect, useState } from 'react';
import { onCircuitStateChange, getAllCircuits, CircuitState } from '../utils/circuitBreaker';
import { motion, AnimatePresence } from 'framer-motion';

export const CircuitBreakerStatus: React.FC = () => {
    const [openEndpoints, setOpenEndpoints] = useState<string[]>([]);
    const [isHalfOpen, setIsHalfOpen] = useState(false);

    useEffect(() => {
        // Initial state check
        const checkState = () => {
            const all = getAllCircuits();
            const open: string[] = [];
            let half = false;

            Object.entries(all).forEach(([endpoint, metrics]) => {
                if (metrics.state === 'OPEN') {
                    open.push(endpoint);
                } else if (metrics.state === 'HALF_OPEN') {
                    open.push(endpoint);
                    half = true;
                }
            });

            setOpenEndpoints(open);
            setIsHalfOpen(half);
        };

        checkState();

        // Subscribe to changes
        const unsubscribe = onCircuitStateChange(() => {
            // Re-evaluate on any change
            checkState();
        });

        return unsubscribe;
    }, []);

    if (openEndpoints.length === 0) {
        return null;
    }

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={`fixed top-4 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded-full shadow-lg z-50 flex items-center space-x-2 font-medium ${isHalfOpen
                        ? 'bg-yellow-500 text-white'
                        : 'bg-red-500 text-white'
                    }`}
            >
                {isHalfOpen ? (
                    <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <span>System Recovering ({openEndpoints.length} services)...</span>
                    </>
                ) : (
                    <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M13.477 14.89A6 6 0 015.11 6.524l8.367 8.368zm1.414-1.414L6.524 6.524a6 6 0 018.367 8.367zM18 10a8 8 0 11-16 0 8 8 0 0116 0z" clipRule="evenodd" />
                        </svg>
                        <span>System Partial Outage ({openEndpoints.length} services)</span>
                    </>
                )}
            </motion.div>
        </AnimatePresence>
    );
};
