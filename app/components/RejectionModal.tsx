'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface RejectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (reason: string) => void;
    caseNumber?: string;
}

const REJECTION_REASONS = [
    'Incomplete Documents',
    'Invalid Information',
    'Not Eligible',
    'Duplicate Application',
    'Customer Request',
    'Failed Verification',
    'Other'
];

const RejectionModal: React.FC<RejectionModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    caseNumber
}) => {
    const [selectedReason, setSelectedReason] = useState('');
    const [customReason, setCustomReason] = useState('');
    const [isShaking, setIsShaking] = useState(false);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (isOpen) {
            setSelectedReason('');
            setCustomReason('');
            // Trigger initial shake animation
            setIsShaking(true);
            setTimeout(() => setIsShaking(false), 500);
        }
    }, [isOpen]);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    const handleConfirm = () => {
        const reason = selectedReason === 'Other' ? customReason : selectedReason;
        if (!reason.trim()) {
            setIsShaking(true);
            setTimeout(() => setIsShaking(false), 500);
            return;
        }
        onConfirm(reason);
    };

    const shakeAnimation = {
        shake: {
            x: [0, -10, 10, -10, 10, -5, 5, 0],
            transition: { duration: 0.5 }
        }
    };

    return (
        <AnimatePresence mode="wait">
            {isOpen && (
                <div className="fixed inset-0 z-[100] overflow-y-auto" role="dialog" aria-modal="true">
                    <div className="flex items-center justify-center min-h-screen p-4">
                        {/* Dramatic Red Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="fixed inset-0 bg-gradient-to-br from-red-900/80 via-black/70 to-red-900/80 backdrop-blur-sm"
                            onClick={onClose}
                        />

                        {/* Animated Warning Particles */}
                        <div className="fixed inset-0 pointer-events-none overflow-hidden">
                            {[...Array(12)].map((_, i) => (
                                <motion.div
                                    key={i}
                                    initial={{
                                        x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 800),
                                        y: (typeof window !== 'undefined' ? window.innerHeight : 600) + 20,
                                        rotate: 0,
                                        opacity: 0.8
                                    }}
                                    animate={{
                                        y: -20,
                                        rotate: Math.random() * 180,
                                        opacity: 0
                                    }}
                                    transition={{
                                        duration: Math.random() * 2 + 2,
                                        delay: Math.random() * 1,
                                        repeat: Infinity,
                                        ease: 'easeOut'
                                    }}
                                    className="absolute w-2 h-2 bg-red-500 rounded-full"
                                    style={{
                                        boxShadow: '0 0 10px rgba(239, 68, 68, 0.8)'
                                    }}
                                />
                            ))}
                        </div>

                        {/* Modal Content */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={isShaking ? { ...shakeAnimation.shake, opacity: 1, scale: 1, y: 0 } : { opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 400 }}
                            className="relative w-full max-w-lg"
                        >
                            {/* Glow Effect */}
                            <div className="absolute inset-0 bg-gradient-to-r from-red-500 to-rose-600 rounded-2xl blur-2xl opacity-40" />

                            {/* Modal Card */}
                            <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-red-200 dark:border-red-800">
                                {/* Top Warning Bar */}
                                <div className="h-2 bg-gradient-to-r from-red-500 via-rose-500 to-red-600 relative overflow-hidden">
                                    <motion.div
                                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
                                        animate={{
                                            x: ['-100%', '200%']
                                        }}
                                        transition={{
                                            duration: 1.5,
                                            repeat: Infinity,
                                            ease: 'easeInOut'
                                        }}
                                    />
                                </div>

                                {/* Content */}
                                <div className="p-6">
                                    {/* Warning Icon */}
                                    <div className="flex justify-center mb-5">
                                        <motion.div
                                            initial={{ scale: 0, rotate: -180 }}
                                            animate={{ scale: 1, rotate: 0 }}
                                            transition={{ type: 'spring', damping: 15, stiffness: 300 }}
                                            className="relative"
                                        >
                                            <div className="p-4 rounded-full bg-gradient-to-br from-red-500 to-rose-600 ring-8 ring-red-500/20">
                                                <motion.svg
                                                    className="w-10 h-10 text-white"
                                                    fill="none"
                                                    viewBox="0 0 24 24"
                                                    stroke="currentColor"
                                                    animate={{
                                                        scale: [1, 1.1, 1],
                                                    }}
                                                    transition={{
                                                        duration: 1.5,
                                                        repeat: Infinity,
                                                        ease: 'easeInOut'
                                                    }}
                                                >
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                </motion.svg>
                                            </div>
                                            {/* Pulse rings */}
                                            <motion.div
                                                className="absolute inset-0 rounded-full bg-red-500"
                                                initial={{ scale: 1, opacity: 0.5 }}
                                                animate={{ scale: 2, opacity: 0 }}
                                                transition={{ duration: 1, repeat: Infinity }}
                                            />
                                        </motion.div>
                                    </div>

                                    {/* Title */}
                                    <motion.h3
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.1 }}
                                        className="text-xl font-bold text-center text-gray-900 dark:text-white mb-1"
                                    >
                                        Reject This Case?
                                    </motion.h3>

                                    {caseNumber && (
                                        <motion.p
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="text-center text-red-600 font-mono text-sm mb-4"
                                        >
                                            {caseNumber}
                                        </motion.p>
                                    )}

                                    {/* Warning Message */}
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.15 }}
                                        className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 mb-5"
                                    >
                                        <p className="text-sm text-red-700 dark:text-red-300 text-center">
                                            ⚠️ This action is significant. Please select a reason for rejection.
                                        </p>
                                    </motion.div>

                                    {/* Reason Selection */}
                                    <div className="space-y-2 mb-4">
                                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                            Rejection Reason <span className="text-red-500">*</span>
                                        </label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {REJECTION_REASONS.map((reason) => (
                                                <motion.button
                                                    key={reason}
                                                    whileHover={{ scale: 1.02 }}
                                                    whileTap={{ scale: 0.98 }}
                                                    onClick={() => setSelectedReason(reason)}
                                                    className={`px-3 py-2 text-sm rounded-lg border transition-all duration-150 ${selectedReason === reason
                                                            ? 'bg-red-500 text-white border-red-500 shadow-lg shadow-red-500/25'
                                                            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20'
                                                        }`}
                                                >
                                                    {reason}
                                                </motion.button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Custom Reason Input */}
                                    {selectedReason === 'Other' && (
                                        <motion.div
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="mb-4"
                                        >
                                            <textarea
                                                ref={inputRef}
                                                value={customReason}
                                                onChange={(e) => setCustomReason(e.target.value)}
                                                placeholder="Enter your reason..."
                                                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 text-gray-900 dark:text-white dark:bg-gray-800 placeholder-gray-400 resize-none"
                                                rows={3}
                                                autoFocus
                                            />
                                        </motion.div>
                                    )}
                                </div>

                                {/* Action Buttons */}
                                <div className="px-6 pb-6 flex gap-3">
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={onClose}
                                        className="flex-1 py-3 px-6 rounded-xl text-gray-700 dark:text-gray-300 font-semibold bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors duration-100"
                                    >
                                        Cancel
                                    </motion.button>
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.98 }}
                                        onClick={handleConfirm}
                                        disabled={!selectedReason || (selectedReason === 'Other' && !customReason.trim())}
                                        className="flex-1 py-3 px-6 rounded-xl text-white font-semibold bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 shadow-lg shadow-red-500/25 transition-all duration-100 focus:outline-none focus:ring-4 focus:ring-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                                    >
                                        <span className="flex items-center justify-center gap-2">
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                            Confirm Rejection
                                        </span>
                                    </motion.button>
                                </div>

                                {/* Close Button */}
                                <button
                                    onClick={onClose}
                                    className="absolute top-4 right-4 p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-100"
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

export default RejectionModal;
