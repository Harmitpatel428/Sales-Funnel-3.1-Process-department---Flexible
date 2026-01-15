'use client';

import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    CaseDocument,
    DocumentStatus,
    DocumentContextType
} from '../types/processTypes';

// React Query hooks
import { useDocumentsQuery, useDocumentsByCaseQuery, documentKeys } from '../hooks/queries/useDocumentsQuery';
import {
    useUploadDocumentMutation,
    useUpdateDocumentMutation,
    useDeleteDocumentMutation,
    useVerifyDocumentMutation,
    useRejectDocumentMutation,
} from '../hooks/mutations/useDocumentsMutations';

// ============================================================================
// CONTEXT
// ============================================================================

const DocumentContext = createContext<DocumentContextType | undefined>(undefined);

export function DocumentProvider({ children }: { children: ReactNode }) {
    const queryClient = useQueryClient();

    // Track the current case ID for document fetching
    const [currentCaseId, setCurrentCaseId] = useState<string | undefined>(undefined);

    // React Query for documents - API as source of truth
    const {
        data: documents = [],
        isLoading,
        isFetching,
        error
    } = useDocumentsQuery(
        currentCaseId ? { caseId: currentCaseId } : undefined
    );

    // Mutations
    const uploadMutation = useUploadDocumentMutation();
    const updateMutation = useUpdateDocumentMutation();
    const deleteMutation = useDeleteDocumentMutation();
    const verifyMutation = useVerifyDocumentMutation();
    const rejectMutation = useRejectDocumentMutation();

    // Fetch documents for a specific case - triggers React Query refetch
    const fetchDocuments = useCallback(async (caseId: string) => {
        setCurrentCaseId(caseId);
        // Invalidate and refetch
        await queryClient.invalidateQueries({ queryKey: documentKeys.byCase(caseId) });
    }, [queryClient]);

    // ============================================================================
    // DOCUMENT OPERATIONS
    // ============================================================================

    const addDocument = useCallback(async (doc: Omit<CaseDocument, 'documentId' | 'uploadedAt'> & { file?: File, fileData?: any }): Promise<{ success: boolean; message: string }> => {
        try {
            if (!doc.file && !doc.fileData) {
                return { success: false, message: 'No file provided' };
            }

            const file = doc.file || doc.fileData;

            await uploadMutation.mutateAsync({
                file,
                caseId: doc.caseId,
                documentType: doc.documentType,
                notes: doc.notes,
            });

            return { success: true, message: 'Document uploaded successfully' };
        } catch (error: any) {
            console.error('Add document error:', error);
            return { success: false, message: error.message || 'Upload failed' };
        }
    }, [uploadMutation]);

    const updateDocument = useCallback(async (documentId: string, updates: Partial<CaseDocument>): Promise<{ success: boolean; message: string }> => {
        try {
            await updateMutation.mutateAsync({ documentId, updates });
            return { success: true, message: 'Document updated successfully' };
        } catch (error: any) {
            return { success: false, message: error.message || 'Update failed' };
        }
    }, [updateMutation]);

    const deleteDocument = useCallback(async (documentId: string): Promise<{ success: boolean; message: string }> => {
        try {
            await deleteMutation.mutateAsync(documentId);
            return { success: true, message: 'Document deleted successfully' };
        } catch (error: any) {
            return { success: false, message: error.message || 'Delete failed' };
        }
    }, [deleteMutation]);

    // ============================================================================
    // STATUS OPERATIONS
    // ============================================================================

    const verifyDocument = useCallback(async (documentId: string, userId: string): Promise<{ success: boolean; message: string }> => {
        try {
            await verifyMutation.mutateAsync(documentId);
            return { success: true, message: 'Document verified successfully' };
        } catch (error: any) {
            return { success: false, message: error.message || 'Verification failed' };
        }
    }, [verifyMutation]);

    const rejectDocument = useCallback(async (documentId: string, userId: string, reason: string): Promise<{ success: boolean; message: string }> => {
        try {
            await rejectMutation.mutateAsync({ documentId, reason });
            return { success: true, message: 'Document rejected' };
        } catch (error: any) {
            return { success: false, message: error.message || 'Rejection failed' };
        }
    }, [rejectMutation]);

    // ============================================================================
    // QUERIES
    // ============================================================================

    const getDocumentsByCaseId = useCallback((caseId: string): CaseDocument[] => {
        // If we have loaded documents for this case, return them
        // Otherwise, trigger a fetch and return empty array
        if (caseId !== currentCaseId) {
            // Trigger fetch for new case
            setCurrentCaseId(caseId);
        }
        return documents.filter(d => d.caseId === caseId);
    }, [documents, currentCaseId]);

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
