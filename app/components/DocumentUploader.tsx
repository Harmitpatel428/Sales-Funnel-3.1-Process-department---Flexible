'use client';

import React, { useState, useRef } from 'react';
import { useDocuments } from '../context/DocumentContext';
import { useUsers } from '../context/UserContext';
import { useTimeline } from '../context/TimelineContext';
import { Case, REQUIRED_DOCUMENT_TYPES } from '../types/processTypes';

interface DocumentUploaderProps {
    caseId: string;
    schemeType: string;
}

export default function DocumentUploader({ caseId, schemeType }: DocumentUploaderProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { addDocument, documents } = useDocuments();
    const { currentUser } = useUsers();
    const { logDocumentAction } = useTimeline();

    const [selectedType, setSelectedType] = useState<string>(REQUIRED_DOCUMENT_TYPES[0]);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState('');
    const [dragActive, setDragActive] = useState(false);

    // Check if file system access is available
    const isElectron = typeof window !== 'undefined' && !!window.electron;

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            await handleUpload(e.target.files[0]);
        }
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            await handleUpload(e.dataTransfer.files[0]);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
    };

    const handleUpload = async (file: File) => {
        if (!currentUser) return;

        // Limits: Max 10MB
        if (file.size > 10 * 1024 * 1024) {
            setError('File size exceeds 10MB limit');
            return;
        }

        // Check validation: Only PDF and Images
        if (!['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'].includes(file.type)) {
            setError('Only PDF and Image files (JPG, PNG) are allowed');
            return;
        }

        setIsUploading(true);
        setError('');

        try {
            let filePath = '';

            if (isElectron) {
                // 1. Get base path
                const userDataPath = await window.electron.getDocumentsPath();

                // 2. Construct directory path: data/cases/{caseId}/documents/
                const relativeDir = `data/cases/${caseId}/documents`;
                const dirPath = await window.electron.joinPath(userDataPath, relativeDir);

                // 3. Create directory
                await window.electron.createDirectory(dirPath);

                // 4. Construct file path
                const timestamp = Date.now();
                const safeName = file.name.replace(/[^a-z0-9.]/gi, '_');
                const fileName = `${timestamp}_${safeName}`;
                filePath = await window.electron.joinPath(dirPath, fileName);

                // 5. Read file as base64
                const reader = new FileReader();
                const base64Promise = new Promise<string>((resolve, reject) => {
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = reject;
                });
                reader.readAsDataURL(file);
                const base64Content = await base64Promise;

                // 6. Save file
                const result = await window.electron.saveFile(filePath, base64Content);
                if (!result.success) {
                    throw new Error(result.error);
                }
            } else {
                // Fallback for web dev (no actual file save)
                console.warn('Electron API not available. File will not be saved to disk.');
                filePath = `fake/path/${file.name}`;
            }

            // 7. Add to context
            const result = addDocument({
                caseId,
                documentType: selectedType,
                fileName: file.name,
                filePath,
                fileSize: file.size,
                mimeType: file.type,
                status: 'RECEIVED', // Auto-mark as received upon upload
                uploadedBy: currentUser.userId
            });

            if (result.success) {
                // 8. Log action
                logDocumentAction(
                    caseId,
                    'DOCUMENT_UPLOADED',
                    selectedType,
                    currentUser.userId,
                    currentUser.name
                );

                // Reset form
                if (fileInputRef.current) fileInputRef.current.value = '';
            } else {
                setError(result.message);
            }

        } catch (err: any) {
            console.error('Upload failed:', err);
            setError('Upload failed: ' + (err.message || 'Unknown error'));
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Upload Requirements
            </h3>

            {/* Error Message */}
            {error && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
                    {error}
                </div>
            )}

            <div className="space-y-4">
                {/* Document Type Selector */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Document Type
                    </label>
                    <select
                        value={selectedType}
                        onChange={(e) => setSelectedType(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                        {REQUIRED_DOCUMENT_TYPES.map(type => (
                            <option key={type} value={type}>{type}</option>
                        ))}
                    </select>
                </div>

                {/* Drag & Drop Area */}
                <div
                    className={`
            border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer
            ${dragActive ? 'border-purple-500 bg-purple-50' : 'border-gray-300 hover:border-purple-400 hover:bg-gray-50'}
            ${isUploading ? 'opacity-50 pointer-events-none' : ''}
          `}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png"
                    />

                    {isUploading ? (
                        <div className="flex flex-col items-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mb-2"></div>
                            <p className="text-sm text-gray-500">Uploading...</p>
                        </div>
                    ) : (
                        <>
                            <svg className="w-10 h-10 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            <p className="text-gray-900 font-medium mb-1">Click to upload or drag and drop</p>
                            <p className="text-xs text-gray-500">PDF, JPG or PNG (max. 10MB)</p>
                        </>
                    )}
                </div>
            </div>

            {/* Uploaded Documents List Summary - To show what's missing */}
            <div className="mt-6 pt-6 border-t border-gray-100">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                    Required Documents Status
                </h4>
                <div className="space-y-2">
                    {REQUIRED_DOCUMENT_TYPES.slice(0, 5).map(type => {
                        const isUploaded = documents.some(d => d.documentType === type && d.caseId === caseId);
                        return (
                            <div key={type} className="flex items-center justify-between text-sm">
                                <span className={isUploaded ? 'text-gray-900' : 'text-gray-500'}>
                                    {type}
                                </span>
                                {isUploaded ? (
                                    <span className="flex items-center text-green-600 text-xs font-medium">
                                        <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                        Uploaded
                                    </span>
                                ) : (
                                    <span className="text-amber-600 text-xs font-medium">Pending</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
