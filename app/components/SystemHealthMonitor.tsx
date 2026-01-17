'use client';

import React from 'react';
import { useHealthCheck } from '../hooks/useHealthCheck';
import { motion, AnimatePresence } from 'framer-motion';

export const SystemHealthMonitor: React.FC = () => {
    const { isHealthy, checkStatus, isError } = useHealthCheck();

    // Do not show if healthy or if check hasn't run yet/unknown
    if (isHealthy || checkStatus === 'unknown') {
        return null;
    }

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-red-600 text-white px-4 py-2 text-center text-sm font-medium z-50 relative"
            >
                <div className="flex items-center justify-center space-x-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span>
                        System Health Alert: {isError ? 'Cannot reach health service' : `System is ${checkStatus}`}
                        {checkStatus === 'degraded' && ' - Performance may be impacted.'}
                        {checkStatus === 'unhealthy' && ' - Critical services are unavailable.'}
                    </span>
                </div>
            </motion.div>
        </AnimatePresence>
    );
};
