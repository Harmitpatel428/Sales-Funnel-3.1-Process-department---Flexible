'use client';

/**
 * React Query hooks for Documents data fetching
 */

import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { CaseDocument, DocumentStatus } from '../../types/processTypes';
import { DocumentSchema } from '@/lib/validation/schemas';
import { assertApiResponse } from '@/app/utils/typeGuards';
import { z } from 'zod';

// Query keys factory for type-safe keys
export const documentKeys = {
    all: ['documents'] as const,
    lists: () => [...documentKeys.all, 'list'] as const,
    list: (filters?: { caseId?: string; status?: DocumentStatus }) => [...documentKeys.lists(), filters] as const,
    byCase: (caseId: string) => [...documentKeys.all, 'byCase', caseId] as const,
    details: () => [...documentKeys.all, 'detail'] as const,
    detail: (id: string) => [...documentKeys.details(), id] as const,
};

// Response types
interface DocumentsResponse {
    success?: boolean;
    documents: Array<{
        id: string;
        caseId: string;
        documentType: string;
        fileName: string;
        fileSize?: number;
        mimeType?: string;
        status: DocumentStatus;
        createdAt: string;
        uploadedBy?: { name: string };
        uploadedById?: string;
        verifiedBy?: { name: string };
        verifiedAt?: string;
        rejectionReason?: string;
        previewUrl?: string;
    }>;
    message?: string;
}

interface DocumentResponse {
    success: boolean;
    document: CaseDocument;
    message?: string;
}

/**
 * Map API response to CaseDocument type
 */
function mapDocument(doc: DocumentsResponse['documents'][0]): CaseDocument {
    return {
        documentId: doc.id,
        caseId: doc.caseId,
        documentType: doc.documentType,
        fileName: doc.fileName,
        fileSize: doc.fileSize,
        mimeType: doc.mimeType,
        uploadedBy: doc.uploadedBy?.name || doc.uploadedById || '',
        uploadedAt: doc.createdAt,
        status: doc.status,
        rejectionReason: doc.rejectionReason,
        verifiedBy: doc.verifiedBy?.name,
        verifiedAt: doc.verifiedAt,
        filePath: doc.previewUrl || '',
    };
}

/**
 * Fetch documents with optional filters
 */
export function useDocumentsQuery(
    filters?: { caseId?: string; status?: DocumentStatus },
    options?: Omit<UseQueryOptions<DocumentsResponse, Error, CaseDocument[]>, 'queryKey' | 'queryFn'>
) {
    return useQuery({
        queryKey: documentKeys.list(filters),
        queryFn: async () => {
            const params: Record<string, any> = {};

            if (filters?.caseId) {
                params.caseId = filters.caseId;
            }
            if (filters?.status) {
                params.status = filters.status;
            }

            const response = await apiClient.get<DocumentsResponse>('/api/documents', { params });
            const ResponseSchema = z.object({
                success: z.boolean().optional(),
                documents: z.array(DocumentSchema.partial().passthrough()),
                message: z.string().optional()
            });
            assertApiResponse(ResponseSchema, response);
            return response;
        },
        select: (data) => data.documents.map(mapDocument),
        staleTime: 20000, // 20 seconds - documents change frequently
        ...options,
    });
}

/**
 * Fetch documents for a specific case
 */
export function useDocumentsByCaseQuery(
    caseId: string,
    options?: Omit<UseQueryOptions<DocumentsResponse, Error, CaseDocument[]>, 'queryKey' | 'queryFn'>
) {
    return useQuery({
        queryKey: documentKeys.byCase(caseId),
        queryFn: async () => {
            return apiClient.get<DocumentsResponse>(`/api/documents`, { params: { caseId } });
        },
        select: (data) => data.documents.map(mapDocument),
        staleTime: 20000, // 20 seconds
        enabled: !!caseId,
        ...options,
    });
}

/**
 * Fetch a single document by ID
 */
export function useDocumentQuery(
    documentId: string,
    options?: Omit<UseQueryOptions<DocumentResponse, Error, CaseDocument>, 'queryKey' | 'queryFn'>
) {
    return useQuery({
        queryKey: documentKeys.detail(documentId),
        queryFn: async () => {
            return apiClient.get<DocumentResponse>(`/api/documents/${documentId}`);
        },
        select: (data) => data.document,
        staleTime: 30000, // 30 seconds
        enabled: !!documentId,
        ...options,
    });
}
