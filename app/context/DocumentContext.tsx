'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import {
    CaseDocument,
    DocumentStatus,
    DocumentContextType
} from '../types/processTypes';

// ============================================================================
// CONTEXT
// ============================================================================

const DocumentContext = createContext<DocumentContextType | undefined>(undefined);

export function DocumentProvider({ children }: { children: ReactNode }) {
    const [documents, setDocuments] = useState<CaseDocument[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Helper to fetch documents
    const fetchDocuments = useCallback(async (caseId?: string) => {
        setIsLoading(true);
        try {
            const url = caseId
                ? `/api/documents?caseId=${caseId}`
                : '/api/documents';

            const res = await fetch(url);
            if (!res.ok) throw new Error('Failed to fetch documents');

            const data = await res.json();
            // Map API response to CaseDocument type
            const mappedDocs = data.documents.map((doc: any) => ({
                documentId: doc.id,
                caseId: doc.caseId,
                documentType: doc.documentType,
                fileName: doc.fileName,
                fileSize: doc.fileSize,
                mimeType: doc.mimeType,
                uploadedBy: doc.uploadedBy?.name || doc.uploadedById,
                uploadedAt: doc.createdAt,
                status: doc.status,
                rejectionReason: doc.rejectionReason,
                verifiedBy: doc.verifiedBy?.name,
                verifiedAt: doc.verifiedAt,
                filePath: doc.previewUrl || '' // Use preview URL as filePath
            }));

            setDocuments(mappedDocs);
        } catch (err: any) {
            console.error(err);
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Initial load? No, we load on demand via getDocumentsByCaseId usually or we expose a load function
    // For now, we'll keep the state empty until requested.
    // However, the original context loaded from localStorage on mount.
    // We can't fetch ALL documents on mount.
    // We'll rely on components calling refresh or we just expose the fetcher.

    // ============================================================================
    // DOCUMENT OPERATIONS
    // ============================================================================

    const addDocument = useCallback(async (doc: Omit<CaseDocument, 'documentId' | 'uploadedAt'> & { file?: File, fileData?: any }): Promise<{ success: boolean; message: string }> => {
        try {
            const formData = new FormData();
            if (doc.file) {
                formData.append('file', doc.file);
            } else if (doc.fileData) {
                // If it's a blob/file object passed as fileData
                formData.append('file', doc.fileData);
            } else {
                return { success: false, message: 'No file provided' };
            }

            const metadata = {
                caseId: doc.caseId,
                documentType: doc.documentType,
                notes: '' // Add notes if needed
            };
            formData.append('metadata', JSON.stringify(metadata));

            const res = await fetch('/api/documents', {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || 'Upload failed');
            }

            const data = await res.json();

            // Optimistic update or refetch
            // For now, simple refetch or append
            const newDoc: CaseDocument = {
                documentId: data.document.id,
                caseId: data.document.caseId,
                documentType: data.document.documentType,
                fileName: data.document.fileName,
                fileSize: data.document.fileSize,
                mimeType: data.document.mimeType,
                uploadedBy: 'Me', // Should come from user context or response
                uploadedAt: data.document.createdAt,
                status: data.document.status,
                filePath: data.document.previewUrl
            };

            setDocuments(prev => [newDoc, ...prev]);

            return { success: true, message: 'Document uploaded successfully' };
        } catch (error: any) {
            console.error('Add document error:', error);
            return { success: false, message: error.message };
        }
    }, []);

    const updateDocument = useCallback(async (documentId: string, updates: Partial<CaseDocument>): Promise<{ success: boolean; message: string }> => {
        try {
            // Only support status update for now via PATCH
            // If strictly updating local state:
            // But we want to call API.

            const res = await fetch(`/api/documents/${documentId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates),
            });

            if (!res.ok) throw new Error('Update failed');

            setDocuments(prev => prev.map(d =>
                d.documentId === documentId ? { ...d, ...updates } : d
            ));

            return { success: true, message: 'Document updated successfully' };
        } catch (error: any) {
            return { success: false, message: error.message };
        }
    }, []);

    const deleteDocument = useCallback(async (documentId: string): Promise<{ success: boolean; message: string }> => {
        try {
            const res = await fetch(`/api/documents/${documentId}`, {
                method: 'DELETE',
            });

            if (!res.ok) throw new Error('Delete failed');

            setDocuments(prev => prev.filter(d => d.documentId !== documentId));
            return { success: true, message: 'Document deleted successfully' };
        } catch (error: any) {
            return { success: false, message: error.message };
        }
    }, []);

    // ============================================================================
    // STATUS OPERATIONS
    // ============================================================================

    const verifyDocument = useCallback(async (documentId: string, userId: string): Promise<{ success: boolean; message: string }> => {
        try {
            const res = await fetch(`/api/documents/${documentId}/verify`, {
                method: 'POST',
            });

            if (!res.ok) throw new Error('Verification failed');

            setDocuments(prev => prev.map(d =>
                d.documentId === documentId
                    ? { ...d, status: 'VERIFIED', verifiedAt: new Date().toISOString(), verifiedBy: userId }
                    : d
            ));

            return { success: true, message: 'Document verified successfully' };
        } catch (error: any) {
            return { success: false, message: error.message };
        }
    }, []);

    const rejectDocument = useCallback(async (documentId: string, userId: string, reason: string): Promise<{ success: boolean; message: string }> => {
        try {
            const res = await fetch(`/api/documents/${documentId}/reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason }),
            });

            if (!res.ok) throw new Error('Rejection failed');

            setDocuments(prev => prev.map(d =>
                d.documentId === documentId
                    ? { ...d, status: 'REJECTED', verifiedAt: new Date().toISOString(), verifiedBy: userId, rejectionReason: reason }
                    : d
            ));

            return { success: true, message: 'Document rejected' };
        } catch (error: any) {
            return { success: false, message: error.message };
        }
    }, []);

    // ============================================================================
    // QUERIES
    // ============================================================================

    const getDocumentsByCaseId = useCallback((caseId: string): CaseDocument[] => {
        // Trigger fetch if empty or we want fresh? 
        // For now just return what we have. 
        // Ideally we should have a `loadDocuments(caseId)` function.
        // We'll trust that the component calls fetchDocuments when mounting.
        return documents.filter(d => d.caseId === caseId);
    }, [documents]);

    const getDocumentsByStatus = useCallback((caseId: string, status: DocumentStatus): CaseDocument[] => {
        return documents.filter(d => d.caseId === caseId && d.status === status);
    }, [documents]);

    // ============================================================================
    // CONTEXT VALUE
    // ============================================================================

    const contextValue: DocumentContextType & { fetchDocuments: (caseId: string) => Promise<void> } = useMemo(() => ({
        documents,
        addDocument,
        updateDocument,
        deleteDocument,
        verifyDocument,
        rejectDocument,
        getDocumentsByCaseId,
        getDocumentsByStatus,
        fetchDocuments
    }), [documents, addDocument, updateDocument, deleteDocument, verifyDocument, rejectDocument, getDocumentsByCaseId, getDocumentsByStatus, fetchDocuments]);

    return (
        <DocumentContext.Provider value={contextValue}>
            {children}
        </DocumentContext.Provider>
    );
}

export function useDocuments() {
    const ctx = useContext(DocumentContext);
    if (!ctx) throw new Error('useDocuments must be used inside DocumentProvider');
    return ctx as DocumentContextType & { fetchDocuments: (caseId: string) => Promise<void> };
}
