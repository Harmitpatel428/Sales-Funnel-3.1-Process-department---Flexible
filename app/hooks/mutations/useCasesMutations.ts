'use client';

/**
 * React Query mutation hooks for Cases operations
 * 
 * Cache Strategy:
 * - Queries store raw API responses in cache: { success: boolean, data: { cases: Case[] } }
 * - The `select` function transforms this to Case[] for consumers
 * - Mutations must work with the raw cache shape, not the transformed output
 * - For invalidation, we use broad invalidation with exact: false to cover all filter variants
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { Case, ProcessStatus, UserRole, BulkAssignmentResult } from '../../types/processTypes';
import { caseKeys } from '../queries/useCasesQuery';
import { addToQueue, isOnline } from '../../utils/offlineQueue';
import { isNetworkError } from '../../utils/errorHandling';

// Response types matching the API responses stored in cache
interface CasesListResponse {
    success: boolean;
    data: {
        cases: Case[];
        total?: number;
    };
    message?: string;
}

interface CaseDetailResponse {
    success: boolean;
    data: Case;
    message?: string;
}

interface CaseMutationResponse {
    success: boolean;
    data: Case;
    message?: string;
}

interface CreateCaseResponse {
    success: boolean;
    message: string;
    data: {
        caseId: string;
    };
}

interface DeleteResponse {
    success: boolean;
    message: string;
}

interface StatusResponse {
    success: boolean;
    data: Case;
    message: string;
}

interface AssignResponse {
    success: boolean;
    message: string;
}

interface BulkAssignResponse {
    success: boolean;
    message: string;
    data: {
        count: number;
    };
}

/**
 * Create a new case
 */
export function useCreateCaseMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            leadId,
            schemeType,
            metadata,
        }: {
            leadId: string;
            schemeType: string;
            metadata?: {
                caseType?: string;
                benefitTypes?: string[];
                companyName?: string;
                companyType?: string;
                contacts?: Array<{
                    name: string;
                    designation: string;
                    customDesignation?: string;
                    phoneNumber: string;
                }>;
                talukaCategory?: string;
                termLoanAmount?: string;
                plantMachineryValue?: string;
                electricityLoad?: string;
                electricityLoadType?: 'HT' | 'LT' | '';
            };
        }) => {
            return apiClient.post<CreateCaseResponse>('/api/cases', {
                leadId,
                schemeType,
                ...metadata,
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: caseKeys.lists(), exact: false });
        },
    });
}

/**
 * Update an existing case
 */
export function useUpdateCaseMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            caseId,
            updates,
        }: {
            caseId: string;
            updates: Partial<Case>;
        }) => {
            return apiClient.put<CaseMutationResponse>(`/api/cases/${caseId}`, updates);
        },
        onMutate: async ({ caseId, updates }) => {
            await queryClient.cancelQueries({ queryKey: caseKeys.all, exact: false });

            // Snapshot all list caches and the detail cache
            const previousListCaches = queryClient.getQueriesData<CasesListResponse>({
                queryKey: caseKeys.lists()
            });
            const previousDetail = queryClient.getQueryData<CaseDetailResponse>(
                caseKeys.detail(caseId)
            );

            // Optimistically update all list caches
            queryClient.setQueriesData<CasesListResponse>(
                { queryKey: caseKeys.lists() },
                (old) => {
                    if (!old?.data?.cases) return old;
                    return {
                        ...old,
                        data: {
                            ...old.data,
                            cases: old.data.cases.map((c: Case) =>
                                c.caseId === caseId
                                    ? { ...c, ...updates, updatedAt: new Date().toISOString() }
                                    : c
                            ),
                        },
                    };
                }
            );

            // Optimistically update detail cache
            if (previousDetail) {
                queryClient.setQueryData<CaseDetailResponse>(
                    caseKeys.detail(caseId),
                    (old) => {
                        if (!old?.data) return old;
                        return {
                            ...old,
                            data: { ...old.data, ...updates, updatedAt: new Date().toISOString() }
                        };
                    }
                );
            }

            return { previousListCaches, previousDetail, caseId };
        },
        onError: (err, { caseId }, context) => {
            // Rollback all list caches
            if (context?.previousListCaches) {
                context.previousListCaches.forEach(([queryKey, data]) => {
                    if (data) {
                        queryClient.setQueryData(queryKey, data);
                    }
                });
            }
            // Rollback detail cache
            if (context?.previousDetail) {
                queryClient.setQueryData(caseKeys.detail(caseId), context.previousDetail);
            }

            if (isNetworkError(err) && !isOnline()) {
                addToQueue({
                    type: 'UPDATE_CASE',
                    payload: { caseId },
                    endpoint: `/api/cases/${caseId}`,
                    method: 'PUT',
                });
            }
        },
        onSuccess: (data, { caseId }) => {
            queryClient.invalidateQueries({ queryKey: caseKeys.lists(), exact: false });
            queryClient.invalidateQueries({ queryKey: caseKeys.detail(caseId) });
        },
    });
}

/**
 * Delete a case
 */
export function useDeleteCaseMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (caseId: string) => {
            return apiClient.delete<DeleteResponse>(`/api/cases/${caseId}`);
        },
        onMutate: async (caseId) => {
            await queryClient.cancelQueries({ queryKey: caseKeys.all, exact: false });

            const previousListCaches = queryClient.getQueriesData<CasesListResponse>({
                queryKey: caseKeys.lists()
            });

            // Optimistically remove from all caches
            queryClient.setQueriesData<CasesListResponse>(
                { queryKey: caseKeys.lists() },
                (old) => {
                    if (!old?.data?.cases) return old;
                    return {
                        ...old,
                        data: {
                            ...old.data,
                            cases: old.data.cases.filter((c: Case) => c.caseId !== caseId),
                        },
                    };
                }
            );

            return { previousListCaches };
        },
        onError: (err, caseId, context) => {
            if (context?.previousListCaches) {
                context.previousListCaches.forEach(([queryKey, data]) => {
                    if (data) {
                        queryClient.setQueryData(queryKey, data);
                    }
                });
            }

            if (isNetworkError(err) && !isOnline()) {
                addToQueue({
                    type: 'DELETE_CASE',
                    payload: { caseId },
                    endpoint: `/api/cases/${caseId}`,
                    method: 'DELETE',
                });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: caseKeys.lists(), exact: false });
        },
    });
}

/**
 * Update case status
 */
export function useUpdateCaseStatusMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            caseId,
            newStatus,
        }: {
            caseId: string;
            newStatus: ProcessStatus;
        }) => {
            return apiClient.patch<StatusResponse>(`/api/cases/${caseId}/status`, {
                newStatus,
            });
        },
        onMutate: async ({ caseId, newStatus }) => {
            await queryClient.cancelQueries({ queryKey: caseKeys.all, exact: false });

            const previousListCaches = queryClient.getQueriesData<CasesListResponse>({
                queryKey: caseKeys.lists()
            });

            // Optimistically update status in all caches
            queryClient.setQueriesData<CasesListResponse>(
                { queryKey: caseKeys.lists() },
                (old) => {
                    if (!old?.data?.cases) return old;
                    return {
                        ...old,
                        data: {
                            ...old.data,
                            cases: old.data.cases.map((c: Case) =>
                                c.caseId === caseId
                                    ? { ...c, processStatus: newStatus, updatedAt: new Date().toISOString() }
                                    : c
                            ),
                        },
                    };
                }
            );

            return { previousListCaches };
        },
        onError: (err, { caseId, newStatus }, context) => {
            if (context?.previousListCaches) {
                context.previousListCaches.forEach(([queryKey, data]) => {
                    if (data) {
                        queryClient.setQueryData(queryKey, data);
                    }
                });
            }

            if (isNetworkError(err) && !isOnline()) {
                addToQueue({
                    type: 'UPDATE_CASE_STATUS',
                    payload: { caseId, newStatus },
                    endpoint: `/api/cases/${caseId}/status`,
                    method: 'PATCH',
                });
            }
        },
        onSuccess: (_, { caseId }) => {
            queryClient.invalidateQueries({ queryKey: caseKeys.lists(), exact: false });
            queryClient.invalidateQueries({ queryKey: caseKeys.detail(caseId) });
        },
    });
}

/**
 * Assign a case to a user
 */
export function useAssignCaseMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            caseId,
            userId,
            roleId,
        }: {
            caseId: string;
            userId: string;
            roleId?: UserRole;
        }) => {
            return apiClient.post<AssignResponse>(`/api/cases/${caseId}/assign`, {
                userId,
                roleId,
            });
        },
        onMutate: async ({ caseId, userId, roleId }) => {
            await queryClient.cancelQueries({ queryKey: caseKeys.all, exact: false });

            const previousListCaches = queryClient.getQueriesData<CasesListResponse>({
                queryKey: caseKeys.lists()
            });

            // Optimistically update assignment in all caches
            queryClient.setQueriesData<CasesListResponse>(
                { queryKey: caseKeys.lists() },
                (old) => {
                    if (!old?.data?.cases) return old;
                    return {
                        ...old,
                        data: {
                            ...old.data,
                            cases: old.data.cases.map((c: Case) =>
                                c.caseId === caseId
                                    ? {
                                        ...c,
                                        assignedProcessUserId: userId,
                                        assignedRole: roleId || c.assignedRole,
                                        updatedAt: new Date().toISOString(),
                                    }
                                    : c
                            ),
                        },
                    };
                }
            );

            return { previousListCaches };
        },
        onError: (err, variables, context) => {
            if (context?.previousListCaches) {
                context.previousListCaches.forEach(([queryKey, data]) => {
                    if (data) {
                        queryClient.setQueryData(queryKey, data);
                    }
                });
            }

            if (isNetworkError(err) && !isOnline()) {
                addToQueue({
                    type: 'ASSIGN_CASE',
                    payload: variables,
                    endpoint: `/api/cases/${variables.caseId}/assign`,
                    method: 'POST',
                });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: caseKeys.lists(), exact: false });
        },
    });
}

/**
 * Bulk assign cases
 */
export function useBulkAssignCasesMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            caseIds,
            userId,
            roleId,
        }: {
            caseIds: string[];
            userId: string;
            roleId?: UserRole;
        }): Promise<BulkAssignmentResult> => {
            const response = await apiClient.post<BulkAssignResponse>('/api/cases/bulk-assign', {
                caseIds,
                userId,
                roleId,
            });
            return {
                success: response.success,
                message: response.message,
                count: response.data?.count || 0,
            };
        },
        onMutate: async ({ caseIds, userId, roleId }) => {
            await queryClient.cancelQueries({ queryKey: caseKeys.all, exact: false });

            const previousListCaches = queryClient.getQueriesData<CasesListResponse>({
                queryKey: caseKeys.lists()
            });

            // Optimistically update all assigned cases in all caches
            queryClient.setQueriesData<CasesListResponse>(
                { queryKey: caseKeys.lists() },
                (old) => {
                    if (!old?.data?.cases) return old;
                    return {
                        ...old,
                        data: {
                            ...old.data,
                            cases: old.data.cases.map((c: Case) =>
                                caseIds.includes(c.caseId)
                                    ? {
                                        ...c,
                                        assignedProcessUserId: userId,
                                        assignedRole: roleId || c.assignedRole,
                                        updatedAt: new Date().toISOString(),
                                    }
                                    : c
                            ),
                        },
                    };
                }
            );

            return { previousListCaches };
        },
        onError: (_, __, context) => {
            if (context?.previousListCaches) {
                context.previousListCaches.forEach(([queryKey, data]) => {
                    if (data) {
                        queryClient.setQueryData(queryKey, data);
                    }
                });
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: caseKeys.lists(), exact: false });
        },
    });
}
