'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ApprovalModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (note: string) => void;
    caseNumber?: string;
}

const ApprovalModal: React.FC<ApprovalModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    caseNumber
}) => {
    const [approvalNote, setApprovalNote] = useState('');
    const [showFireworks, setShowFireworks] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setApprovalNote('');
            // Trigger fireworks immediately
            setShowFireworks(true);
        } else {
            setShowFireworks(false);
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
        onConfirm(approvalNote);
    };

    // Generate random firework particles
    const generateParticles = (count: number, colors: string[]) => {
        return [...Array(count)].map((_, i) => ({
            id: i,
            color: colors[Math.floor(Math.random() * colors.length)],
            x: Math.random() * 100,
            delay: Math.random() * 0.1,
            duration: 0.5 + Math.random() * 0.3,
            size: 4 + Math.random() * 4
        }));
    };

    const fireworkColors = ['#10B981', '#34D399', '#6EE7B7', '#FBBF24', '#F59E0B', '#8B5CF6', '#A78BFA'];
    const particles = generateParticles(25, fireworkColors);

    return (
        <AnimatePresence mode="wait">
            {isOpen && (
                <div className="fixed inset-0 z-[100] overflow-y-auto" role="dialog" aria-modal="true">
                    <div className="flex items-center justify-center min-h-screen p-4">
                        {/* Golden/Green Gradient Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.1 }}
                            className="fixed inset-0 bg-gradient-to-br from-emerald-900/70 via-black/60 to-amber-900/70 backdrop-blur-sm"
                            onClick={onClose}
                        />

                        {/* Fireworks/Sparkle Burst Effect */}
                        {showFireworks && (
                            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                                {/* Center Burst */}
                                {particles.map((p) => (
                                    <motion.div
                                        key={`burst-${p.id}`}
                                        initial={{
                                            x: '50%',
                                            y: '50%',
                                            scale: 0,
                                            opacity: 1
                                        }}
                                        animate={{
                                            x: `${p.x}%`,
                                            y: `${20 + Math.random() * 60}%`,
                                            scale: [0, 1.5, 0],
                                            opacity: [1, 1, 0]
                                        }}
                                        transition={{
                                            duration: p.duration,
                                            delay: p.delay,
                                            ease: 'easeOut'
                                        }}
                                        style={{
                                            position: 'absolute',
                                            width: p.size,
                                            height: p.size,
                                            borderRadius: '50%',
                                            backgroundColor: p.color,
                                            boxShadow: `0 0 ${p.size * 2}px ${p.color}`
                                        }}
                                    />
                                ))}

                                {/* Floating Stars */}
                                {[...Array(15)].map((_, i) => (
                                    <motion.div
                                        key={`star-${i}`}
                                        initial={{
                                            x: `${Math.random() * 100}%`,
                                            y: '110%',
                                            rotate: 0,
                                            opacity: 0
                                        }}
                                        animate={{
                                            y: '-10%',
                                            rotate: 360,
                                            opacity: [0, 1, 1, 0]
                                        }}
                                        transition={{
                                            duration: 1 + Math.random() * 0.5,
                                            delay: Math.random() * 0.2,
                                            ease: 'easeOut'
                                        }}
                                        className="absolute text-2xl"
                                    >
                                        ⭐
                                    </motion.div>
                                ))}

                                {/* Confetti Rain */}
                                {[...Array(25)].map((_, i) => (
                                    <motion.div
                                        key={`confetti-${i}`}
                                        initial={{
                                            x: `${Math.random() * 100}%`,
                                            y: -20,
                                            rotate: 0,
                                            opacity: 1
                                        }}
                                        animate={{
                                            y: (typeof window !== 'undefined' ? window.innerHeight : 800) + 20,
                                            rotate: Math.random() * 720 - 360,
                                            x: `${Math.random() * 100}%`
                                        }}
                                        transition={{
                                            duration: 0.8 + Math.random() * 0.5,
                                            delay: Math.random() * 0.2,
                                            ease: 'easeIn'
                                        }}
                                        style={{
                                            position: 'absolute',
                                            width: 8 + Math.random() * 8,
                                            height: 8 + Math.random() * 8,
                                            backgroundColor: fireworkColors[Math.floor(Math.random() * fireworkColors.length)],
                                            borderRadius: Math.random() > 0.5 ? '50%' : '2px'
                                        }}
                                    />
                                ))}
                            </div>
                        )}

                        {/* Modal Content */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.8, y: 30 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.8, y: 30 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 500 }}
                            className="relative w-full max-w-lg"
                        >
                            {/* Golden Glow Effect */}
                            <motion.div
                                className="absolute inset-0 bg-gradient-to-r from-emerald-500 via-amber-400 to-emerald-500 rounded-2xl blur-2xl"
                                animate={{
                                    opacity: [0.35, 0.5, 0.35],
                                    scale: [1, 1.05, 1]
                                }}
                                transition={{
                                    duration: 1.5,
                                    repeat: Infinity,
                                    ease: 'easeInOut'
                                }}
                            />

                            {/* Modal Card */}
                            <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-emerald-200 dark:border-emerald-800">
                                {/* Top Celebration Bar with shimmer */}
                                <div className="h-2 bg-gradient-to-r from-emerald-500 via-amber-400 to-emerald-500 relative overflow-hidden">
                                    <motion.div
                                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent"
                                        animate={{
                                            x: ['-100%', '200%']
                                        }}
                                        transition={{
                                            duration: 1,
                                            repeat: Infinity,
                                            ease: 'linear'
                                        }}
                                    />
                                </div>

                                {/* Content */}
                                <div className="p-6">
                                    {/* Trophy/Celebration Icon */}
                                    <div className="flex justify-center mb-5">
                                        <motion.div
                                            initial={{ scale: 0, rotate: -180 }}
                                            animate={{ scale: 1, rotate: 0 }}
                                            transition={{ type: 'spring', damping: 15, stiffness: 400 }}
                                            className="relative"
                                        >
                                            {/* Rotating ring */}
                                            <motion.div
                                                className="absolute -inset-4 rounded-full border-4 border-dashed border-amber-400/50"
                                                animate={{ rotate: 360 }}
                                                transition={{
                                                    duration: 4,
                                                    repeat: Infinity,
                                                    ease: 'linear'
                                                }}
                                            />

                                            <motion.div
                                                className="p-5 rounded-full bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600 ring-8 ring-emerald-500/20"
                                                animate={{
                                                    boxShadow: [
                                                        '0 0 20px rgba(16, 185, 129, 0.4)',
                                                        '0 0 40px rgba(16, 185, 129, 0.6)',
                                                        '0 0 20px rgba(16, 185, 129, 0.4)'
                                                    ]
                                                }}
                                                transition={{
                                                    duration: 1,
                                                    repeat: Infinity,
                                                    ease: 'easeInOut'
                                                }}
                                            >
                                                <motion.span
                                                    className="text-4xl block"
                                                    animate={{
                                                        scale: [1, 1.2, 1],
                                                        rotate: [0, 10, -10, 0]
                                                    }}
                                                    transition={{
                                                        duration: 0.8,
                                                        repeatDelay: 1.5
                                                    }}
                                                >
                                                    🏆
                                                </motion.span>
                                            </motion.div>
                                        </motion.div>
                                    </div>

                                    {/* Title with gradient */}
                                    <motion.h3
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.1 }}
                                        className="text-2xl font-bold text-center bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-600 bg-clip-text text-transparent mb-1"
                                    >
                                        Approve This Case! 🎉
                                    </motion.h3>

                                    {caseNumber && (
                                        <motion.p
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="text-center text-emerald-600 font-mono text-sm mb-4"
                                        >
                                            {caseNumber}
                                        </motion.p>
                                    )}

                                    {/* Success Message */}
                                    <motion.div
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.1 }}
                                        className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl p-4 mb-5"
                                    >
                                        <p className="text-sm text-emerald-700 dark:text-emerald-300 text-center font-medium">
                                            🎊 Congratulations! This case is ready to be approved.
                                        </p>
                                    </motion.div>

                                    {/* Optional Note */}
                                    <div className="mb-4">
                                        <label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 block">
                                            Approval Note <span className="text-gray-400 font-normal">(optional)</span>
                                        </label>
                                        <textarea
                                            value={approvalNote}
                                            onChange={(e) => setApprovalNote(e.target.value)}
                                            placeholder="Add any notes about this approval..."
                                            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-gray-900 dark:text-white dark:bg-gray-800 placeholder-gray-400 resize-none transition-all duration-150"
                                            rows={2}
                                        />
                                    </div>
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
                                        className="flex-1 py-3 px-6 rounded-xl text-white font-semibold bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-500 hover:from-emerald-600 hover:via-teal-600 hover:to-emerald-600 shadow-lg shadow-emerald-500/30 transition-all duration-100 focus:outline-none focus:ring-4 focus:ring-emerald-500/30 relative overflow-hidden group"
                                    >
                                        {/* Button shimmer */}
                                        <motion.div
                                            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-500"
                                        />
                                        <span className="flex items-center justify-center gap-2 relative z-10">
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                            </svg>
                                            Approve Case!
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

export default ApprovalModal;
