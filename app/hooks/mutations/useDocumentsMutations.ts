'use client';

/**
 * React Query mutation hooks for Documents operations
 * 
 * Cache Strategy:
 * - Queries store raw API responses in cache: { success?: boolean, documents: [...] }
 * - The `select` function transforms this to CaseDocument[] for consumers
 * - Mutations must work with the raw cache shape, not the transformed output
 * - For invalidation, we use broad invalidation with exact: false to cover all filter variants
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { CaseDocument, DocumentStatus } from '../../types/processTypes';
import { documentKeys } from '../queries/useDocumentsQuery';
import { addToQueue, isOnline } from '../../utils/offlineQueue';
import { isNetworkError } from '../../utils/errorHandling';

// API response document type (different from CaseDocument which is the domain model)
interface ApiDocument {
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
}

// Response types matching the API responses stored in cache
interface DocumentsListResponse {
    success?: boolean;
    documents: ApiDocument[];
    message?: string;
}

interface DocumentMutationResponse {
    success: boolean;
    document: CaseDocument;
    message?: string;
}

interface UploadResponse {
    success: boolean;
    document: {
        id: string;
        caseId: string;
        documentType: string;
        fileName: string;
        fileSize?: number;
        mimeType?: string;
        status: DocumentStatus;
        createdAt: string;
        previewUrl?: string;
    };
    message?: string;
}

interface DeleteResponse {
    success: boolean;
    message: string;
}

interface VerifyResponse {
    success: boolean;
    message: string;
}

/**
 * Upload a new document
 * Uses apiClient.post with FormData to inherit global timeout/error handling
 */
export function useUploadDocumentMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            file,
            caseId,
            documentType,
            notes,
        }: {
            file: File;
            caseId: string;
            documentType: string;
            notes?: string;
        }) => {
            const formData = new FormData();
            formData.append('file', file);
            formData.append(
                'metadata',
                JSON.stringify({
                    caseId,
                    documentType,
                    notes: notes || '',
                })
            );

            // Use apiClient.post with FormData to inherit global timeout/error handling
            // apiClient automatically handles FormData by not setting Content-Type header
            return apiClient.post<UploadResponse>('/api/documents', formData);
        },
        // No optimistic update for file uploads - can't show file before it's uploaded
        onError: (err, variables) => {
            // Queue for offline retry if network error
            if (isNetworkError(err) && !isOnline()) {
                // For file uploads, we store a reference that can be used for resumable upload
                // Note: The actual file cannot be serialized, so we store metadata
                // A more complete solution would use IndexedDB to store the file blob
                addToQueue({
                    type: 'UPLOAD_DOCUMENT',
                    payload: {
                        caseId: variables.caseId,
                        documentType: variables.documentType,
                        notes: variables.notes,
                        fileName: variables.file.name,
                        fileSize: variables.file.size,
                        mimeType: variables.file.type,
                        // Note: Actual file needs to be re-selected by user for retry
                        // or stored in IndexedDB for offline support
                    },
                    endpoint: '/api/documents',
                    method: 'POST',
                });
            }
        },
        onSuccess: (data) => {
            // Invalidate documents for this case and all document lists
            queryClient.invalidateQueries({ queryKey: documentKeys.byCase(data.document.caseId) });
            queryClient.invalidateQueries({ queryKey: documentKeys.lists(), exact: false });
        },
        // Use shared retry/backoff defaults from QueryClient
        retry: 3,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    });
}

/**
 * Update document metadata
 * Note: updates param uses CaseDocument types but we only update applicable API fields
 */
export function useUpdateDocumentMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            documentId,
            updates,
        }: {
            documentId: string;
            updates: Partial<CaseDocument>;
        }) => {
            return apiClient.patch<DocumentMutationResponse>(`/api/documents/${documentId}`, updates);
        },
        onMutate: async ({ documentId, updates }) => {
            await queryClient.cancelQueries({ queryKey: documentKeys.all, exact: false });

            const previousListCaches = queryClient.getQueriesData<DocumentsListResponse>({
                queryKey: documentKeys.lists()
            });

            // Map CaseDocument updates to API document fields
            // Only include fields that exist in both types
            const apiUpdates: Partial<ApiDocument> = {};
            if (updates.documentType !== undefined) apiUpdates.documentType = updates.documentType;
            if (updates.fileName !== undefined) apiUpdates.fileName = updates.fileName;
            if (updates.fileSize !== undefined) apiUpdates.fileSize = updates.fileSize;
            if (updates.mimeType !== undefined) apiUpdates.mimeType = updates.mimeType;
            if (updates.status !== undefined) apiUpdates.status = updates.status;
            if (updates.rejectionReason !== undefined) apiUpdates.rejectionReason = updates.rejectionReason;

            // Optimistically update all list caches
            queryClient.setQueriesData<DocumentsListResponse>(
                { queryKey: documentKeys.lists() },
                (old) => {
                    if (!old?.documents) return old;
                    return {
                        ...old,
                        documents: old.documents.map((d): ApiDocument =>
                            d.id === documentId ? { ...d, ...apiUpdates } : d
                        ),
                    };
                }
            );

            return { previousListCaches };
        },
        onError: (err, { documentId, updates }, context) => {
            if (context?.previousListCaches) {
                context.previousListCaches.forEach(([queryKey, data]) => {
                    if (data) {
                        queryClient.setQueryData(queryKey, data);
                    }
                });
            }

            if (isNetworkError(err) && !isOnline()) {
                addToQueue({
                    type: 'UPDATE_DOCUMENT',
                    payload: { documentId, updates },
                    endpoint: `/api/documents/${documentId}`,
                    method: 'PATCH',
                });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: documentKeys.lists(), exact: false });
        },
    });
}

/**
 * Delete a document
 */
export function useDeleteDocumentMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (documentId: string) => {
            return apiClient.delete<DeleteResponse>(`/api/documents/${documentId}`);
        },
        onMutate: async (documentId) => {
            await queryClient.cancelQueries({ queryKey: documentKeys.all, exact: false });

            const previousListCaches = queryClient.getQueriesData<DocumentsListResponse>({
                queryKey: documentKeys.lists()
            });

            // Optimistically remove from all caches
            queryClient.setQueriesData<DocumentsListResponse>(
                { queryKey: documentKeys.lists() },
                (old) => {
                    if (!old?.documents) return old;
                    return {
                        ...old,
                        documents: old.documents.filter((d) => d.id !== documentId),
                    };
                }
            );

            return { previousListCaches };
        },
        onError: (err, documentId, context) => {
            if (context?.previousListCaches) {
                context.previousListCaches.forEach(([queryKey, data]) => {
                    if (data) {
                        queryClient.setQueryData(queryKey, data);
                    }
                });
            }

            if (isNetworkError(err) && !isOnline()) {
                addToQueue({
                    type: 'DELETE_DOCUMENT',
                    payload: { documentId },
                    endpoint: `/api/documents/${documentId}`,
                    method: 'DELETE',
                });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: documentKeys.lists(), exact: false });
        },
    });
}

/**
 * Verify a document
 */
export function useVerifyDocumentMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (documentId: string) => {
            return apiClient.post<VerifyResponse>(`/api/documents/${documentId}/verify`);
        },
        onMutate: async (documentId) => {
            await queryClient.cancelQueries({ queryKey: documentKeys.all, exact: false });

            const previousListCaches = queryClient.getQueriesData<DocumentsListResponse>({
                queryKey: documentKeys.lists()
            });

            // Optimistically update status in all caches
            queryClient.setQueriesData<DocumentsListResponse>(
                { queryKey: documentKeys.lists() },
                (old) => {
                    if (!old?.documents) return old;
                    return {
                        ...old,
                        documents: old.documents.map((d): ApiDocument =>
                            d.id === documentId
                                ? {
                                    ...d,
                                    status: 'VERIFIED' as DocumentStatus,
                                    verifiedAt: new Date().toISOString(),
                                }
                                : d
                        ),
                    };
                }
            );

            return { previousListCaches };
        },
        onError: (err, documentId, context) => {
            if (context?.previousListCaches) {
                context.previousListCaches.forEach(([queryKey, data]) => {
                    if (data) {
                        queryClient.setQueryData(queryKey, data);
                    }
                });
            }

            if (isNetworkError(err) && !isOnline()) {
                addToQueue({
                    type: 'VERIFY_DOCUMENT',
                    payload: { documentId },
                    endpoint: `/api/documents/${documentId}/verify`,
                    method: 'POST',
                });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: documentKeys.lists(), exact: false });
        },
    });
}

/**
 * Reject a document
 */
export function useRejectDocumentMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            documentId,
            reason,
        }: {
            documentId: string;
            reason: string;
        }) => {
            return apiClient.post<VerifyResponse>(`/api/documents/${documentId}/reject`, {
                reason,
            });
        },
        onMutate: async ({ documentId, reason }) => {
            await queryClient.cancelQueries({ queryKey: documentKeys.all, exact: false });

            const previousListCaches = queryClient.getQueriesData<DocumentsListResponse>({
                queryKey: documentKeys.lists()
            });

            // Optimistically update status in all caches
            queryClient.setQueriesData<DocumentsListResponse>(
                { queryKey: documentKeys.lists() },
                (old) => {
                    if (!old?.documents) return old;
                    return {
                        ...old,
                        documents: old.documents.map((d): ApiDocument =>
                            d.id === documentId
                                ? {
                                    ...d,
                                    status: 'REJECTED' as DocumentStatus,
                                    rejectionReason: reason,
                                    verifiedAt: new Date().toISOString(),
                                }
                                : d
                        ),
                    };
                }
            );

            return { previousListCaches };
        },
        onError: (err, { documentId, reason }, context) => {
            if (context?.previousListCaches) {
                context.previousListCaches.forEach(([queryKey, data]) => {
                    if (data) {
                        queryClient.setQueryData(queryKey, data);
                    }
                });
            }

            if (isNetworkError(err) && !isOnline()) {
                addToQueue({
                    type: 'REJECT_DOCUMENT',
                    payload: { documentId, reason },
                    endpoint: `/api/documents/${documentId}/reject`,
                    method: 'POST',
                });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: documentKeys.lists(), exact: false });
        },
    });
}
