'use client';

/**
 * React Query mutation hooks for Leads operations
 * 
 * Cache Strategy:
 * - Queries store raw API responses in cache: { success: boolean, data: { leads: Lead[] } }
 * - The `select` function transforms this to Lead[] for consumers
 * - Mutations must work with the raw cache shape, not the transformed output
 * - For invalidation, we use broad invalidation with exact: false to cover all filter variants
 */

import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { handleError } from '../../utils/errorPipeline';
import { apiClient } from '../../lib/apiClient';
import { Lead, ColumnConfig } from '../../types/shared';
import { leadKeys } from '../queries/useLeadsQuery';
import { caseKeys } from '../queries/useCasesQuery';
import { addToQueue, isOnline } from '../../utils/offlineQueue';
import { isNetworkError } from '../../utils/errorHandling';
import {
    createOptimisticUpdate,
    reconcileWithServer,
    ConflictState
} from '../../utils/optimistic';
import { showToast } from '../../components/NotificationToast';
import { LeadSchema } from '@/lib/validation/schemas';
import { assertApiResponse } from '@/app/utils/typeGuards';
import { z } from 'zod';

const IMPORTANT_LEAD_FIELDS = ['status', 'assignedToId', 'isDone', 'convertedToCaseId'];


// Response types matching the API responses stored in cache
interface LeadsListResponse {
    success: boolean;
    data: {
        leads: Lead[];
        total?: number;
    };
    message?: string;
}

interface LeadDetailResponse {
    success: boolean;
    data: Lead;
    message?: string;
}

interface LeadMutationResponse {
    success: boolean;
    data: Lead;
    message?: string;
}

interface ForwardLeadResponse {
    success: boolean;
    message: string;
    data: {
        caseIds: string[];
    };
}

interface DeleteResponse {
    success: boolean;
    message: string;
}

interface AssignResponse {
    success: boolean;
    message: string;
    data?: Lead;
}

/**
 * Create a new lead
 */
export function useCreateLeadMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (lead: Omit<Lead, 'id'>) => {
            const response = await apiClient.post<LeadMutationResponse>('/api/leads', lead);
            const ResponseSchema = z.object({
                success: z.boolean(),
                data: LeadSchema,
                message: z.string().optional()
            });
            assertApiResponse(ResponseSchema, response);
            return response;
        },
        onMutate: async (newLead) => {
            // Cancel any outgoing refetches for all lead list queries
            await queryClient.cancelQueries({ queryKey: leadKeys.all, exact: false });

            // Snapshot all list caches for potential rollback
            const previousListCaches = queryClient.getQueriesData<LeadsListResponse>({
                queryKey: leadKeys.lists()
            });

            // Optimistically add the new lead with a temporary ID
            const tempLead: Lead = {
                ...newLead as Lead,
                id: `temp_${Date.now()}`,
                createdAt: new Date().toISOString(),
            };

            // Update all cached list queries
            queryClient.setQueriesData<LeadsListResponse>(
                { queryKey: leadKeys.lists() },
                (old) => {
                    if (!old?.data?.leads) return old;
                    return {
                        ...old,
                        data: {
                            ...old.data,
                            leads: [...old.data.leads, tempLead],
                        },
                    };
                }
            );

            return { previousListCaches };
        },
        onError: (err, newLead, context) => {
            // Rollback all list caches
            if (context?.previousListCaches) {
                context.previousListCaches.forEach(([queryKey, data]) => {
                    if (data) {
                        queryClient.setQueryData(queryKey, data);
                    }
                });
            }

            // Queue for offline if network error
            if (isNetworkError(err) && !isOnline()) {
                addToQueue({
                    type: 'CREATE_LEAD',
                    payload: newLead,
                    endpoint: '/api/leads',
                    method: 'POST',
                });
            }
            handleError(err, { requestPayload: newLead });
        },
        onSuccess: () => {
            // Invalidate all lead list queries to refetch with new data
            queryClient.invalidateQueries({ queryKey: leadKeys.lists(), exact: false });
        },
    });
}

/**
 * Update an existing lead
 */
export function useUpdateLeadMutation() {
    const queryClient = useQueryClient();
    const versionRef = useRef<Record<string, number>>({});

    return useMutation({
        mutationFn: async (updatedLead: Partial<Lead> & { id: string }) => {
            const version = (updatedLead as any).version ?? versionRef.current[updatedLead.id];
            // Clear ref for this ID as it's been used for this specific mutation call
            if (updatedLead.id) delete versionRef.current[updatedLead.id];

            const response = await apiClient.put<LeadMutationResponse>(`/api/leads/${updatedLead.id}`, {
                ...updatedLead,
                version // Ensure version is sent for optimistic locking
            });
            const ResponseSchema = z.object({
                success: z.boolean(),
                data: LeadSchema,
                message: z.string().optional()
            });
            assertApiResponse(ResponseSchema, response);
            return response;
        },
        onMutate: async (updatedLead) => {
            // Cancel any outgoing refetches
            await queryClient.cancelQueries({ queryKey: leadKeys.all, exact: false });

            // Snapshot all list caches and the detail cache
            const previousListCaches = queryClient.getQueriesData<LeadsListResponse>({
                queryKey: leadKeys.lists()
            });
            const lastKnownGoodResponse = queryClient.getQueryData<LeadDetailResponse>(
                leadKeys.detail(updatedLead.id)
            );
            const lastKnownGood = lastKnownGoodResponse?.data;

            // Capture version for mutationFn
            if (lastKnownGood && updatedLead.id) {
                versionRef.current[updatedLead.id] = lastKnownGood.version;
            }

            // Use our utility for optimistic update with version increment
            const optimisticLead = createOptimisticUpdate({ ...lastKnownGood, ...updatedLead } as Lead, {});

            // Optimistically update all list caches
            queryClient.setQueriesData<LeadsListResponse>(
                { queryKey: leadKeys.lists() },
                (old) => {
                    if (!old?.data?.leads) return old;
                    return {
                        ...old,
                        data: {
                            ...old.data,
                            leads: old.data.leads.map((l: Lead) =>
                                l.id === optimisticLead.id ? optimisticLead : l
                            ),
                        },
                    };
                }
            );

            // Optimistically update detail cache
            queryClient.setQueryData<LeadDetailResponse>(
                leadKeys.detail(optimisticLead.id),
                (old) => {
                    if (!old) return old;
                    (optimisticLead as any).__lastKnownGood = lastKnownGood; // Store base for WS reconciliation
                    return { ...old, data: optimisticLead };
                }
            );

            return {
                previousListCaches,
                previousDetail: lastKnownGoodResponse,
                lastKnownGood,
                optimisticEntity: optimisticLead,
                leadId: updatedLead.id
            };
        },
        onSuccess: (response, updatedLead, context) => {
            // Reconcile with server response
            if (context?.lastKnownGood && context?.optimisticEntity) {
                const result = reconcileWithServer(
                    context.optimisticEntity,
                    response.data,
                    context.lastKnownGood,
                    IMPORTANT_LEAD_FIELDS
                );

                if (result.status === 'success' && response.data.version > context.lastKnownGood.version + 1) {
                    showToast({
                        type: 'info',
                        title: 'Data Synchronized',
                        message: 'Other changes were applied while you were editing.'
                    });
                } else if (result.status === 'conflict') {
                    // Trigger conflict resolution event/state
                    window.dispatchEvent(new CustomEvent('app-conflict', {
                        detail: {
                            entityType: 'lead',
                            conflicts: result.conflicts,
                            optimistic: result.optimistic,
                            server: result.server,
                            base: result.base,
                        }
                    }));
                    return; // Don't proceed with standard success update yet
                }
            }

            // Invalidate all related queries
            queryClient.invalidateQueries({ queryKey: leadKeys.lists(), exact: false });
            queryClient.invalidateQueries({ queryKey: leadKeys.detail(updatedLead.id) });
        },
        onError: (err: any, updatedLead, context) => {
            // Special handling for optimistic lock failure
            if (err?.code === 'OPTIMISTIC_LOCK_FAILED' || err?.status === 409) {
                const serverEntity = err?.details?.currentEntity || err?.response?.data?.details?.currentEntity;
                if (serverEntity && context?.lastKnownGood && context?.optimisticEntity) {
                    const result = reconcileWithServer(
                        context.optimisticEntity,
                        serverEntity,
                        context.lastKnownGood,
                        IMPORTANT_LEAD_FIELDS
                    );

                    window.dispatchEvent(new CustomEvent('app-conflict', {
                        detail: {
                            entityType: 'lead',
                            conflicts: result.conflicts,
                            optimistic: result.optimistic,
                            server: result.server,
                            base: result.base,
                        }
                    }));
                    return;
                }
            }

            // Standard fallback
            if (context?.previousListCaches) {
                context.previousListCaches.forEach(([queryKey, data]) => {
                    if (data) {
                        queryClient.setQueryData(queryKey, data);
                    }
                });
            }
            if (isNetworkError(err) && !isOnline()) {
                addToQueue({
                    type: 'UPDATE_LEAD',
                    payload: { ...updatedLead, version: context?.lastKnownGood?.version ?? updatedLead.version },
                    endpoint: `/api/leads/${updatedLead.id}`,
                    method: 'PUT',
                    version: context?.lastKnownGood?.version ?? updatedLead.version,
                    lastKnownGood: context?.lastKnownGood
                } as any);
            }
            handleError(err, { requestPayload: updatedLead });
        },
    });
}

/**
 * Delete a lead (soft delete)
 */
export function useDeleteLeadMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (leadId: string) => {
            return apiClient.delete<DeleteResponse>(`/api/leads/${leadId}`);
        },
        onMutate: async (leadId) => {
            // Cancel any outgoing refetches
            await queryClient.cancelQueries({ queryKey: leadKeys.all, exact: false });

            // Snapshot all list caches
            const previousListCaches = queryClient.getQueriesData<LeadsListResponse>({
                queryKey: leadKeys.lists()
            });

            // Optimistically mark as deleted in all caches
            queryClient.setQueriesData<LeadsListResponse>(
                { queryKey: leadKeys.lists() },
                (old) => {
                    if (!old?.data?.leads) return old;
                    return {
                        ...old,
                        data: {
                            ...old.data,
                            leads: old.data.leads.map((l: Lead) =>
                                l.id === leadId ? { ...l, isDeleted: true } : l
                            ),
                        },
                    };
                }
            );

            return { previousListCaches };
        },
        onError: (err, leadId, context) => {
            // Rollback all list caches
            if (context?.previousListCaches) {
                context.previousListCaches.forEach(([queryKey, data]) => {
                    if (data) {
                        queryClient.setQueryData(queryKey, data);
                    }
                });
            }

            if (isNetworkError(err) && !isOnline()) {
                addToQueue({
                    type: 'DELETE_LEAD',
                    payload: { leadId },
                    endpoint: `/api/leads/${leadId}`,
                    method: 'DELETE',
                });
            }
            handleError(err, { requestPayload: { leadId } });
        },
        onSuccess: () => {
            // Invalidate all lead list queries
            queryClient.invalidateQueries({ queryKey: leadKeys.lists(), exact: false });
        },
    });
}

/**
 * Assign a lead to a user
 */
export function useAssignLeadMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            leadId,
            userId,
            assignedBy,
        }: {
            leadId: string;
            userId: string;
            assignedBy: string;
        }) => {
            return apiClient.post<AssignResponse>(`/api/leads/${leadId}/assign`, {
                userId,
                assignedBy,
            });
        },
        onMutate: async ({ leadId, userId, assignedBy }) => {
            await queryClient.cancelQueries({ queryKey: leadKeys.all, exact: false });

            const previousListCaches = queryClient.getQueriesData<LeadsListResponse>({
                queryKey: leadKeys.lists()
            });

            // Optimistically update assignment in all caches
            queryClient.setQueriesData<LeadsListResponse>(
                { queryKey: leadKeys.lists() },
                (old) => {
                    if (!old?.data?.leads) return old;
                    return {
                        ...old,
                        data: {
                            ...old.data,
                            leads: old.data.leads.map((l: Lead) =>
                                l.id === leadId
                                    ? {
                                        ...l,
                                        assignedTo: userId,
                                        assignedBy,
                                        assignedAt: new Date().toISOString(),
                                    }
                                    : l
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
                    type: 'ASSIGN_LEAD',
                    payload: variables,
                    endpoint: `/api/leads/${variables.leadId}/assign`,
                    method: 'POST',
                });
            }
            handleError(err, { requestPayload: variables });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: leadKeys.lists(), exact: false });
        },
    });
}

/**
 * Unassign a lead
 */
export function useUnassignLeadMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (leadId: string) => {
            return apiClient.post<AssignResponse>(`/api/leads/${leadId}/unassign`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: leadKeys.lists(), exact: false });
        },
    });
}

/**
 * Forward lead to process (creates cases)
 */
export function useForwardLeadMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            leadId,
            benefitTypes,
            reason,
        }: {
            leadId: string;
            benefitTypes: string[];
            reason?: string;
        }) => {
            return apiClient.post<ForwardLeadResponse>(`/api/leads/${leadId}/forward`, {
                benefitTypes,
                reason,
            });
        },
        onSuccess: () => {
            // Invalidate both leads and cases as this creates cases
            queryClient.invalidateQueries({ queryKey: leadKeys.lists(), exact: false });
            queryClient.invalidateQueries({ queryKey: caseKeys.lists(), exact: false });
        },
    });
}

/**
 * Add activity to a lead
 */
export function useAddLeadActivityMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({
            leadId,
            description,
            activityType,
            duration,
            metadata,
        }: {
            leadId: string;
            description: string;
            activityType?: string;
            duration?: number;
            metadata?: Record<string, any>;
        }) => {
            return apiClient.post(`/api/leads/${leadId}/activities`, {
                description,
                activityType: activityType || 'note',
                duration,
                metadata,
            });
        },
        onSuccess: (_, { leadId }) => {
            queryClient.invalidateQueries({ queryKey: leadKeys.lists(), exact: false });
            queryClient.invalidateQueries({ queryKey: leadKeys.activities(leadId) });
        },
    });
}

/**
 * Mark lead as done
 */
export function useMarkLeadDoneMutation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (lead: Lead) => {
            const response = await apiClient.put<LeadMutationResponse>(`/api/leads/${lead.id}`, {
                ...lead,
                version: lead.version,
                isDone: true,
                lastActivityDate: new Date().toISOString(),
            });
            const ResponseSchema = z.object({
                success: z.boolean(),
                data: LeadSchema,
                message: z.string().optional()
            });
            assertApiResponse(ResponseSchema, response);
            return response;
        },
        onSuccess: (_, lead) => {
            queryClient.invalidateQueries({ queryKey: leadKeys.lists(), exact: false });
            queryClient.invalidateQueries({ queryKey: leadKeys.detail(lead.id) });
        },
    });
}
