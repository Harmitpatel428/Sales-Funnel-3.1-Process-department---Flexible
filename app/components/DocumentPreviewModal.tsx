'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface DocumentPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    document: {
        fileName: string;
        documentType: string;
        mimeType?: string;
        fileData?: string; // Base64 data URL
        filePath?: string;
        status: string;
        uploadedAt?: string;
        fileSize?: number;
    } | null;
}

const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
    isOpen,
    onClose,
    document
}) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [fileUrl, setFileUrl] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && document) {
            setLoading(true);
            setError(null);

            // Check if we have base64 data
            if (document.fileData) {
                setFileUrl(document.fileData);
                setLoading(false);
            } else if (document.filePath && typeof window !== 'undefined' && window.electron) {
                // Try to load from file system via Electron
                loadFromElectron();
            } else {
                setError('Document data not available. The file may have been uploaded in a different environment.');
                setLoading(false);
            }
        }

        return () => {
            if (fileUrl && fileUrl.startsWith('blob:')) {
                URL.revokeObjectURL(fileUrl);
            }
        };
    }, [isOpen, document]);

    const loadFromElectron = async () => {
        if (!document?.filePath || !window.electron) return;

        try {
            const result = await window.electron.readFile(document.filePath);
            if (result.success && result.data) {
                setFileUrl(result.data);
                setLoading(false);
            } else {
                setError('Failed to load file: ' + (result.error || 'Unknown error'));
                setLoading(false);
            }
        } catch (err) {
            setError('Error loading file from disk');
            setLoading(false);
        }
    };

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        if (isOpen) {
            document && window.addEventListener('keydown', handleEscape);
            document && (window.document.body.style.overflow = 'hidden');
        }

        return () => {
            window.removeEventListener('keydown', handleEscape);
            window.document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    const isImage = document?.mimeType?.startsWith('image/') ||
        document?.fileName?.match(/\.(jpg|jpeg|png|gif|webp)$/i);
    const isPDF = document?.mimeType === 'application/pdf' ||
        document?.fileName?.match(/\.pdf$/i);

    const formatFileSize = (bytes?: number) => {
        if (!bytes) return 'Unknown size';
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return '';
        return new Date(dateStr).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const handleDownload = () => {
        if (fileUrl && document) {
            const link = window.document.createElement('a');
            link.href = fileUrl;
            link.download = document.fileName;
            window.document.body.appendChild(link);
            link.click();
            window.document.body.removeChild(link);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && document && (
                <div className="fixed inset-0 z-[100] overflow-hidden" role="dialog" aria-modal="true">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    {/* Modal Container */}
                    <div className="fixed inset-0 flex flex-col">
                        {/* Header */}
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.2 }}
                            className="flex-shrink-0 bg-gray-900/95 border-b border-gray-700 px-6 py-4"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    {/* Document icon */}
                                    <div className={`p-2 rounded-lg ${isPDF ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'
                                        }`}>
                                        {isPDF ? (
                                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                            </svg>
                                        ) : (
                                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                        )}
                                    </div>

                                    <div>
                                        <h2 className="text-white font-semibold text-lg truncate max-w-md">
                                            {document.fileName}
                                        </h2>
                                        <div className="flex items-center gap-3 text-sm text-gray-400">
                                            <span>{document.documentType}</span>
                                            <span>•</span>
                                            <span>{formatFileSize(document.fileSize)}</span>
                                            {document.uploadedAt && (
                                                <>
                                                    <span>•</span>
                                                    <span>{formatDate(document.uploadedAt)}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    {/* Status Badge */}
                                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${document.status === 'VERIFIED'
                                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                            : document.status === 'REJECTED'
                                                ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                                : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                        }`}>
                                        {document.status}
                                    </span>

                                    {/* Download Button */}
                                    {fileUrl && (
                                        <button
                                            onClick={handleDownload}
                                            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                                            title="Download"
                                        >
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                            </svg>
                                        </button>
                                    )}

                                    {/* Close Button */}
                                    <button
                                        onClick={onClose}
                                        className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                                    >
                                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </motion.div>

                        {/* Content Area */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2, delay: 0.1 }}
                            className="flex-1 overflow-auto p-4 flex items-center justify-center"
                        >
                            {loading ? (
                                <div className="flex flex-col items-center gap-4">
                                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-500 border-t-transparent" />
                                    <p className="text-gray-400">Loading document...</p>
                                </div>
                            ) : error ? (
                                <div className="bg-gray-800 rounded-xl p-8 text-center max-w-md">
                                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                                        <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                    </div>
                                    <h3 className="text-white font-semibold mb-2">Unable to Preview</h3>
                                    <p className="text-gray-400 text-sm">{error}</p>
                                </div>
                            ) : fileUrl ? (
                                <div className="w-full h-full flex items-center justify-center">
                                    {isImage ? (
                                        <img
                                            src={fileUrl}
                                            alt={document.fileName}
                                            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                                        />
                                    ) : isPDF ? (
                                        <iframe
                                            src={fileUrl}
                                            className="w-full h-full rounded-lg bg-white"
                                            title={document.fileName}
                                        />
                                    ) : (
                                        <div className="bg-gray-800 rounded-xl p-8 text-center">
                                            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-700 flex items-center justify-center">
                                                <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                                </svg>
                                            </div>
                                            <h3 className="text-white font-semibold mb-2">Preview Not Available</h3>
                                            <p className="text-gray-400 text-sm mb-4">This file type cannot be previewed in the browser.</p>
                                            <button
                                                onClick={handleDownload}
                                                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                                            >
                                                Download File
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : null}
                        </motion.div>
                    </div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default DocumentPreviewModal;
