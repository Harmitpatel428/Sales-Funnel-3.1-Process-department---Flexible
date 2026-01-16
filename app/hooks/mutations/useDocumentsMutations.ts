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

import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { handleError } from '../../utils/errorPipeline';
import { apiClient } from '../../lib/apiClient';
import { CaseDocument, DocumentStatus } from '../../types/processTypes';
import { documentKeys } from '../queries/useDocumentsQuery';
import { addToQueue, isOnline } from '../../utils/offlineQueue';
import { isNetworkError } from '../../utils/errorHandling';
import {
    createOptimisticUpdate,
    reconcileWithServer,
} from '../../utils/optimistic';
import { showToast } from '../../components/NotificationToast';

import { DocumentSchema } from '@/lib/validation/schemas';
import { assertApiResponse } from '@/app/utils/typeGuards';
import { z } from 'zod';

const IMPORTANT_DOCUMENT_FIELDS = ['status', 'verifiedById', 'rejectionReason'];


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
            const response = await apiClient.post<UploadResponse>('/api/documents', formData);

            // Validate with matched schema (UploadResponse shape)
            const ResponseSchema = z.object({
                success: z.boolean(),
                document: DocumentSchema.passthrough().partial().extend({
                    previewUrl: z.string().optional()
                }),
                message: z.string().optional()
            });

            assertApiResponse(ResponseSchema, response);
            return response;
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
            handleError(err, { requestPayload: { ...variables, file: undefined, fileName: variables.file.name } });
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
    const versionRef = useRef<Record<string, number>>({});

    return useMutation({
        mutationFn: async ({
            documentId,
            updates,
        }: {
            documentId: string;
            updates: Partial<CaseDocument>;
        }) => {
            const version = (updates as any).version ?? versionRef.current[documentId];
            if (documentId) delete versionRef.current[documentId];

            const response = await apiClient.patch<DocumentMutationResponse>(`/api/documents/${documentId}`, {
                ...updates,
                version
            });

            const ResponseSchema = z.object({
                success: z.boolean(),
                document: DocumentSchema.partial().passthrough(),
                message: z.string().optional()
            });
            assertApiResponse(ResponseSchema, response);
            return response;
        },
        onMutate: async ({ documentId, updates }) => {
            await queryClient.cancelQueries({ queryKey: documentKeys.all, exact: false });

            // Snapshot single document cache if it exists
            const previousListCaches = queryClient.getQueriesData<DocumentsListResponse>({
                queryKey: documentKeys.lists()
            });

            // Find the current document in one of the lists to use as base
            let currentDoc: ApiDocument | undefined;
            for (const [, list] of previousListCaches) {
                currentDoc = list?.documents.find(d => d.id === documentId);
                if (currentDoc) break;
            }

            if (!currentDoc) return { previousListCaches };

            // Use our utility for optimistic update
            const baseEntity = { ...currentDoc, version: (currentDoc as any).version || 1 } as any;

            // Capture version for mutationFn
            if (documentId) {
                versionRef.current[documentId] = baseEntity.version;
            }

            const optimisticDoc = createOptimisticUpdate(baseEntity, updates as any);

            // Optimistically update all list caches
            queryClient.setQueriesData<DocumentsListResponse>(
                { queryKey: documentKeys.lists() },
                (old) => {
                    if (!old?.documents) return old;
                    (optimisticDoc as any).__lastKnownGood = baseEntity; // Store base for WS reconciliation
                    return {
                        ...old,
                        documents: old.documents.map((d): ApiDocument =>
                            d.id === documentId ? { ...d, ...optimisticDoc } : d
                        ),
                    };
                }
            );

            return {
                previousListCaches,
                lastKnownGood: baseEntity,
                optimisticEntity: optimisticDoc,
                documentId
            };
        },
        onSuccess: (response, { documentId }, context) => {
            // Reconcile with server response
            if (context?.lastKnownGood && context?.optimisticEntity) {
                const result = reconcileWithServer(
                    context.optimisticEntity,
                    response.document,
                    context.lastKnownGood,
                    IMPORTANT_DOCUMENT_FIELDS
                );

                if (result.status === 'success' && response.document.version > context.lastKnownGood.version + 1) {
                    showToast({
                        type: 'info',
                        title: 'Data Synchronized',
                        message: 'Other changes were applied while you were editing.'
                    });
                } else if (result.status === 'conflict') {
                    window.dispatchEvent(new CustomEvent('app-conflict', {
                        detail: {
                            entityType: 'document',
                            conflicts: result.conflicts,
                            optimistic: result.optimistic,
                            server: result.server,
                            base: result.base,
                        }
                    }));
                    return;
                }
            }

            queryClient.invalidateQueries({ queryKey: documentKeys.lists(), exact: false });
        },
        onError: (err: any, { documentId, updates }, context) => {
            if (err?.code === 'OPTIMISTIC_LOCK_FAILED' || err?.status === 409) {
                const serverEntity = err?.details?.currentEntity || err?.response?.data?.details?.currentEntity;
                if (serverEntity && context?.lastKnownGood && context?.optimisticEntity) {
                    const result = reconcileWithServer(
                        context.optimisticEntity,
                        serverEntity,
                        context.lastKnownGood,
                        IMPORTANT_DOCUMENT_FIELDS
                    );

                    window.dispatchEvent(new CustomEvent('app-conflict', {
                        detail: {
                            entityType: 'document',
                            conflicts: result.conflicts,
                            optimistic: result.optimistic,
                            server: result.server,
                            base: result.base,
                        }
                    }));
                    return;
                }
            }

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
                    payload: { documentId, ...updates, version: context?.lastKnownGood?.version ?? (updates as any).version },
                    endpoint: `/api/documents/${documentId}`,
                    method: 'PATCH',
                    version: context?.lastKnownGood?.version ?? (updates as any).version,
                    lastKnownGood: context?.lastKnownGood
                } as any);
            }
            handleError(err, { requestPayload: { documentId, updates } });
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
            handleError(err, { requestPayload: { documentId } });
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
            handleError(err, { requestPayload: { documentId } });
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
            handleError(err, { requestPayload: { documentId, reason } });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: documentKeys.lists(), exact: false });
        },
    });
}
