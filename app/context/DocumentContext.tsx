'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
    CaseDocument,
    DocumentStatus,
    DocumentContextType
} from '../types/processTypes';

// ============================================================================
// CONSTANTS
// ============================================================================

const DOCUMENTS_STORAGE_KEY = 'caseDocuments';

// Generate UUID
function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// ============================================================================
// CONTEXT
// ============================================================================

const DocumentContext = createContext<DocumentContextType | undefined>(undefined);

export function DocumentProvider({ children }: { children: ReactNode }) {
    const [documents, setDocuments] = useState<CaseDocument[]>([]);
    const [isHydrated, setIsHydrated] = useState(false);

    // Load documents from localStorage
    useEffect(() => {
        try {
            const storedDocs = localStorage.getItem(DOCUMENTS_STORAGE_KEY);
            if (storedDocs) {
                setDocuments(JSON.parse(storedDocs));
            }
        } catch (error) {
            console.error('Error loading documents:', error);
        } finally {
            setIsHydrated(true);
        }
    }, []);

    // Persist documents to localStorage
    useEffect(() => {
        if (!isHydrated) return;

        const timeoutId = setTimeout(() => {
            try {
                localStorage.setItem(DOCUMENTS_STORAGE_KEY, JSON.stringify(documents));
            } catch (error) {
                console.error('Error saving documents:', error);
            }
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [documents, isHydrated]);

    // ============================================================================
    // DOCUMENT OPERATIONS
    // ============================================================================

    const addDocument = useCallback((doc: Omit<CaseDocument, 'documentId' | 'uploadedAt'>): { success: boolean; message: string } => {
        const newDoc: CaseDocument = {
            ...doc,
            documentId: generateUUID(),
            uploadedAt: new Date().toISOString()
        };

        setDocuments(prev => [...prev, newDoc]);
        return { success: true, message: 'Document added successfully' };
    }, []);

    const updateDocument = useCallback((documentId: string, updates: Partial<CaseDocument>): { success: boolean; message: string } => {
        const docIndex = documents.findIndex(d => d.documentId === documentId);
        if (docIndex === -1) {
            return { success: false, message: 'Document not found' };
        }

        setDocuments(prev => prev.map(d =>
            d.documentId === documentId ? { ...d, ...updates } : d
        ));

        return { success: true, message: 'Document updated successfully' };
    }, [documents]);

    const deleteDocument = useCallback((documentId: string): { success: boolean; message: string } => {
        const doc = documents.find(d => d.documentId === documentId);
        if (!doc) {
            return { success: false, message: 'Document not found' };
        }

        setDocuments(prev => prev.filter(d => d.documentId !== documentId));
        return { success: true, message: 'Document deleted successfully' };
    }, [documents]);

    // ============================================================================
    // STATUS OPERATIONS
    // ============================================================================

    const verifyDocument = useCallback((documentId: string, userId: string): { success: boolean; message: string } => {
        const doc = documents.find(d => d.documentId === documentId);
        if (!doc) {
            return { success: false, message: 'Document not found' };
        }

        if (doc.status !== 'RECEIVED') {
            return { success: false, message: 'Only received documents can be verified' };
        }

        setDocuments(prev => prev.map(d =>
            d.documentId === documentId
                ? {
                    ...d,
                    status: 'VERIFIED' as DocumentStatus,
                    verifiedAt: new Date().toISOString(),
                    verifiedBy: userId,
                    rejectionReason: undefined
                }
                : d
        ));

        return { success: true, message: 'Document verified successfully' };
    }, [documents]);

    const rejectDocument = useCallback((documentId: string, userId: string, reason: string): { success: boolean; message: string } => {
        const doc = documents.find(d => d.documentId === documentId);
        if (!doc) {
            return { success: false, message: 'Document not found' };
        }

        if (doc.status !== 'RECEIVED') {
            return { success: false, message: 'Only received documents can be rejected' };
        }

        setDocuments(prev => prev.map(d =>
            d.documentId === documentId
                ? {
                    ...d,
                    status: 'REJECTED' as DocumentStatus,
                    verifiedAt: new Date().toISOString(),
                    verifiedBy: userId,
                    rejectionReason: reason
                }
                : d
        ));

        return { success: true, message: 'Document rejected' };
    }, [documents]);

    // ============================================================================
    // QUERIES
    // ============================================================================

    const getDocumentsByCaseId = useCallback((caseId: string): CaseDocument[] => {
        return documents.filter(d => d.caseId === caseId);
    }, [documents]);

    const getDocumentsByStatus = useCallback((caseId: string, status: DocumentStatus): CaseDocument[] => {
        return documents.filter(d => d.caseId === caseId && d.status === status);
    }, [documents]);

    // ============================================================================
    // CONTEXT VALUE
    // ============================================================================

    const contextValue: DocumentContextType = {
        documents,
        addDocument,
        updateDocument,
        deleteDocument,
        verifyDocument,
        rejectDocument,
        getDocumentsByCaseId,
        getDocumentsByStatus
    };

    return (
        <DocumentContext.Provider value={contextValue}>
            {children}
        </DocumentContext.Provider>
    );
}

export function useDocuments() {
    const ctx = useContext(DocumentContext);
    if (!ctx) throw new Error('useDocuments must be used inside DocumentProvider');
    return ctx;
}
