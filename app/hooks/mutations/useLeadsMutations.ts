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

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { Lead, ColumnConfig } from '../../types/shared';
import { leadKeys } from '../queries/useLeadsQuery';
import { caseKeys } from '../queries/useCasesQuery';
import { addToQueue, isOnline } from '../../utils/offlineQueue';
import { isNetworkError } from '../../utils/errorHandling';

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
            return apiClient.post<LeadMutationResponse>('/api/leads', lead);
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

    return useMutation({
        mutationFn: async (lead: Lead) => {
            return apiClient.put<LeadMutationResponse>(`/api/leads/${lead.id}`, lead);
        },
        onMutate: async (updatedLead) => {
            // Cancel any outgoing refetches
            await queryClient.cancelQueries({ queryKey: leadKeys.all, exact: false });

            // Snapshot all list caches and the detail cache
            const previousListCaches = queryClient.getQueriesData<LeadsListResponse>({
                queryKey: leadKeys.lists()
            });
            const previousDetail = queryClient.getQueryData<LeadDetailResponse>(
                leadKeys.detail(updatedLead.id)
            );

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
                                l.id === updatedLead.id ? updatedLead : l
                            ),
                        },
                    };
                }
            );

            // Optimistically update detail cache
            queryClient.setQueryData<LeadDetailResponse>(
                leadKeys.detail(updatedLead.id),
                (old) => {
                    if (!old) return old;
                    return { ...old, data: updatedLead };
                }
            );

            return { previousListCaches, previousDetail, leadId: updatedLead.id };
        },
        onError: (err, updatedLead, context) => {
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
                queryClient.setQueryData(
                    leadKeys.detail(updatedLead.id),
                    context.previousDetail
                );
            }

            // Queue for offline if network error
            if (isNetworkError(err) && !isOnline()) {
                addToQueue({
                    type: 'UPDATE_LEAD',
                    payload: updatedLead,
                    endpoint: `/api/leads/${updatedLead.id}`,
                    method: 'PUT',
                });
            }
        },
        onSuccess: (_, updatedLead) => {
            // Invalidate all related queries
            queryClient.invalidateQueries({ queryKey: leadKeys.lists(), exact: false });
            queryClient.invalidateQueries({ queryKey: leadKeys.detail(updatedLead.id) });
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

            // Queue for offline if network error
            if (isNetworkError(err) && !isOnline()) {
                addToQueue({
                    type: 'DELETE_LEAD',
                    payload: { leadId },
                    endpoint: `/api/leads/${leadId}`,
                    method: 'DELETE',
                });
            }
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
            return apiClient.put<LeadMutationResponse>(`/api/leads/${lead.id}`, {
                ...lead,
                isDone: true,
                lastActivityDate: new Date().toISOString(),
            });
        },
        onSuccess: (_, lead) => {
            queryClient.invalidateQueries({ queryKey: leadKeys.lists(), exact: false });
            queryClient.invalidateQueries({ queryKey: leadKeys.detail(lead.id) });
        },
    });
}
