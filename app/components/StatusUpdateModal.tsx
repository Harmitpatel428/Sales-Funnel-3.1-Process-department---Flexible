'use client';

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface StatusUpdateModalProps {
    isOpen: boolean;
    onClose: () => void;
    type: 'success' | 'error' | 'info' | 'warning';
    title: string;
    message: string;
    actionLabel?: string;
    onAction?: () => void;
    showConfetti?: boolean;
}

const StatusUpdateModal: React.FC<StatusUpdateModalProps> = ({
    isOpen,
    onClose,
    type,
    title,
    message,
    actionLabel = 'Got it',
    onAction,
    showConfetti = false
}) => {
    // Close on escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    // Prevent scrolling when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    const getIconAndColors = () => {
        switch (type) {
            case 'success':
                return {
                    bgGradient: 'from-emerald-500 to-teal-600',
                    iconBg: 'bg-gradient-to-br from-emerald-400 to-teal-500',
                    ringColor: 'ring-emerald-500/30',
                    buttonBg: 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700',
                    icon: (
                        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <motion.path
                                initial={{ pathLength: 0 }}
                                animate={{ pathLength: 1 }}
                                transition={{ duration: 0.2 }}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2.5}
                                d="M5 13l4 4L19 7"
                            />
                        </svg>
                    )
                };
            case 'error':
                return {
                    bgGradient: 'from-red-500 to-rose-600',
                    iconBg: 'bg-gradient-to-br from-red-400 to-rose-500',
                    ringColor: 'ring-red-500/30',
                    buttonBg: 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700',
                    icon: (
                        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <motion.path
                                initial={{ pathLength: 0 }}
                                animate={{ pathLength: 1 }}
                                transition={{ duration: 0.15 }}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2.5}
                                d="M6 18L18 6M6 6l12 12"
                            />
                        </svg>
                    )
                };
            case 'warning':
                return {
                    bgGradient: 'from-amber-500 to-orange-600',
                    iconBg: 'bg-gradient-to-br from-amber-400 to-orange-500',
                    ringColor: 'ring-amber-500/30',
                    buttonBg: 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700',
                    icon: (
                        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    )
                };
            case 'info':
            default:
                return {
                    bgGradient: 'from-violet-500 to-purple-600',
                    iconBg: 'bg-gradient-to-br from-violet-400 to-purple-500',
                    ringColor: 'ring-violet-500/30',
                    buttonBg: 'bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700',
                    icon: (
                        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    )
                };
        }
    };

    const { bgGradient, iconBg, ringColor, buttonBg, icon } = getIconAndColors();

    const handleAction = () => {
        if (onAction) {
            onAction();
        }
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                    <div className="flex items-center justify-center min-h-screen p-4">
                        {/* Backdrop with blur */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.1 }}
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
                            onClick={onClose}
                        />

                        {/* Success Confetti Effect */}
                        {showConfetti && type === 'success' && (
                            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                                {[...Array(20)].map((_, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{
                                            x: Math.random() * window.innerWidth,
                                            y: -20,
                                            rotate: 0,
                                            scale: Math.random() * 0.5 + 0.5
                                        }}
                                        animate={{
                                            y: window.innerHeight + 20,
                                            rotate: Math.random() * 360,
                                            x: Math.random() * window.innerWidth
                                        }}
                                        transition={{
                                            duration: Math.random() * 1 + 1,
                                            delay: Math.random() * 0.15,
                                            ease: 'easeOut'
                                        }}
                                        className={`absolute w-3 h-3 rounded-sm ${['bg-emerald-400', 'bg-teal-400', 'bg-green-400', 'bg-cyan-400', 'bg-yellow-400'][
                                            Math.floor(Math.random() * 5)
                                        ]
                                            }`}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Modal Content */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            transition={{ type: 'spring', damping: 30, stiffness: 500 }}
                            className="relative w-full max-w-md"
                        >
                            {/* Glow Effect */}
                            <div className={`absolute inset-0 bg-gradient-to-r ${bgGradient} rounded-2xl blur-xl opacity-30`} />

                            {/* Modal Card */}
                            <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-800">
                                {/* Top Gradient Bar */}
                                <div className={`h-1 bg-gradient-to-r ${bgGradient}`} />

                                {/* Content */}
                                <div className="p-6">
                                    {/* Icon with Pulse Animation */}
                                    <div className="flex justify-center mb-4">
                                        <motion.div
                                            initial={{ scale: 0 }}
                                            animate={{ scale: 1 }}
                                            transition={{ type: 'spring', damping: 20, stiffness: 500 }}
                                            className={`relative p-3 rounded-full ${iconBg} ring-4 ${ringColor}`}
                                        >
                                            {/* Pulse rings */}
                                            <motion.div
                                                initial={{ scale: 1, opacity: 0.5 }}
                                                animate={{ scale: 1.5, opacity: 0 }}
                                                transition={{ duration: 0.6 }}
                                                className={`absolute inset-0 rounded-full ${iconBg}`}
                                            />

                                            {icon}
                                        </motion.div>
                                    </div>

                                    {/* Title */}
                                    <motion.h3
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.1 }}
                                        className="text-lg font-bold text-center text-gray-900 dark:text-white mb-2"
                                    >
                                        {title}
                                    </motion.h3>

                                    {/* Message */}
                                    <motion.p
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.1 }}
                                        className="text-center text-gray-600 dark:text-gray-400 text-sm leading-relaxed"
                                    >
                                        {message}
                                    </motion.p>
                                </div>

                                {/* Action Button */}
                                <div className="px-6 pb-6">
                                    <motion.button
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.1 }}
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={handleAction}
                                        className={`w-full py-3 px-6 rounded-xl text-white font-semibold shadow-lg transition-all duration-100 ${buttonBg} focus:outline-none focus:ring-4 ${ringColor}`}
                                    >
                                        {actionLabel}
                                    </motion.button>
                                </div>

                                {/* Close Button */}
                                <button
                                    onClick={onClose}
                                    className="absolute top-3 right-3 p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-100"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </motion.div>
                    </div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default StatusUpdateModal;
