'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FieldConflict,
    ConflictResolution,
    getFieldLabel,
    formatFieldValue
} from '../utils/optimistic';

interface ConflictResolutionModalProps {
    isOpen: boolean;
    entityType: 'lead' | 'case' | 'document';
    conflicts: FieldConflict[];
    optimisticEntity: any;
    serverEntity: any;
    onResolve: (resolution: ConflictResolution) => void;
    onCancel: () => void;
}

const ConflictResolutionModal: React.FC<ConflictResolutionModalProps> = ({
    isOpen,
    entityType,
    conflicts,
    optimisticEntity,
    serverEntity,
    onResolve,
    onCancel
}) => {
    const [fieldSelections, setFieldSelections] = useState<Record<string, 'optimistic' | 'server'>>({});
    const [showBase, setShowBase] = useState(false);

    // Initialize selections with server values as default if not already selected
    useEffect(() => {
        if (isOpen) {
            const initial: Record<string, 'optimistic' | 'server'> = {};
            conflicts.forEach(c => {
                initial[c.field] = 'server';
            });
            setFieldSelections(initial);
        }
    }, [isOpen, conflicts]);

    const handleFieldSelect = (field: string, selection: 'optimistic' | 'server') => {
        setFieldSelections(prev => ({ ...prev, [field]: selection }));
    };

    const handleKeepAllOptimistic = () => {
        onResolve({ strategy: 'keep-optimistic' });
    };

    const handleAcceptAllServer = () => {
        onResolve({ strategy: 'accept-server' });
    };

    const handleResolveManual = () => {
        onResolve({ strategy: 'manual', fieldSelections });
    };

    // Close on escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onCancel();
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onCancel]);

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

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
                <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">

                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity backdrop-blur-sm"
                        onClick={onCancel}
                    />

                    <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

                    {/* Modal Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full border border-gray-100"
                    >
                        <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                            <div className="sm:flex sm:items-start">
                                <div className="mx-auto flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-amber-100 sm:mx-0 sm:h-10 sm:w-10">
                                    <svg className="h-6 w-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                </div>
                                <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left w-full">
                                    <h3 className="text-xl leading-6 font-bold text-gray-900" id="modal-title">
                                        Conflict Detected: {entityType.charAt(0).toUpperCase() + entityType.slice(1)}
                                    </h3>
                                    <div className="mt-2">
                                        <p className="text-sm text-gray-500">
                                            Another user has updated this {entityType} since you started editing. Please choose which changes to keep.
                                        </p>
                                    </div>

                                    <div className="mt-6 overflow-x-auto border rounded-lg">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Field</th>
                                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Your Changes</th>
                                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Server Changes</th>
                                                    {showBase && (
                                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Original</th>
                                                    )}
                                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Resolution</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {conflicts.map((conflict) => (
                                                    <tr key={conflict.field} className={conflict.isImportant ? "bg-amber-50" : ""}>
                                                        <td className="px-4 py-4 whitespace-nowrap">
                                                            <div className="flex flex-col">
                                                                <span className="text-sm font-semibold text-gray-900">
                                                                    {getFieldLabel(entityType, conflict.field)}
                                                                </span>
                                                                {conflict.isImportant && (
                                                                    <span className="text-[10px] text-amber-600 font-bold uppercase tracking-tight">Important</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-4">
                                                            <span className="text-sm text-blue-600 font-medium">
                                                                {formatFieldValue(conflict.optimisticValue, conflict.field)}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-4">
                                                            <span className="text-sm text-indigo-600 font-medium">
                                                                {formatFieldValue(conflict.serverValue, conflict.field)}
                                                            </span>
                                                        </td>
                                                        {showBase && (
                                                            <td className="px-4 py-4">
                                                                <span className="text-sm text-gray-400">
                                                                    {formatFieldValue(conflict.baseValue, conflict.field)}
                                                                </span>
                                                            </td>
                                                        )}
                                                        <td className="px-4 py-4 text-center whitespace-nowrap">
                                                            <div className="inline-flex rounded-md shadow-sm" role="group">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleFieldSelect(conflict.field, 'optimistic')}
                                                                    className={`px-3 py-1 text-xs font-medium border rounded-l-lg transition-colors ${fieldSelections[conflict.field] === 'optimistic'
                                                                            ? 'bg-blue-600 text-white border-blue-600'
                                                                            : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                                                                        }`}
                                                                >
                                                                    Mine
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleFieldSelect(conflict.field, 'server')}
                                                                    className={`px-3 py-1 text-xs font-medium border rounded-r-lg transition-colors ${fieldSelections[conflict.field] === 'server'
                                                                            ? 'bg-indigo-600 text-white border-indigo-600'
                                                                            : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                                                                        }`}
                                                                >
                                                                    Server
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="mt-4 flex justify-between items-center">
                                        <button
                                            type="button"
                                            onClick={() => setShowBase(!showBase)}
                                            className="text-xs text-gray-400 hover:text-gray-600 underline"
                                        >
                                            {showBase ? "Hide Original Values" : "Show Original Values"}
                                        </button>
                                        <div className="text-xs text-gray-400 italic">
                                            Total {conflicts.length} fields modified concurrently
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-gray-50 px-4 py-4 sm:px-6 flex flex-col sm:flex-row-reverse gap-3">
                            <button
                                type="button"
                                className="inline-flex justify-center rounded-lg border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-semibold text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:w-auto sm:text-sm transition-all"
                                onClick={handleResolveManual}
                            >
                                Apply Selected Changes
                            </button>
                            <button
                                type="button"
                                className="inline-flex justify-center rounded-lg border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:w-auto sm:text-sm transition-all"
                                onClick={handleKeepAllOptimistic}
                            >
                                Overwrite with Mine
                            </button>
                            <button
                                type="button"
                                className="inline-flex justify-center rounded-lg border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:w-auto sm:text-sm transition-all"
                                onClick={handleAcceptAllServer}
                            >
                                Accept All Server
                            </button>
                            <div className="flex-grow"></div>
                            <button
                                type="button"
                                className="inline-flex justify-center rounded-lg border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:w-auto sm:text-sm transition-all"
                                onClick={onCancel}
                            >
                                Discard Changes
                            </button>
                        </div>
                    </motion.div>
                </div>
            </div>
        </AnimatePresence>
    );
};

export default ConflictResolutionModal;
