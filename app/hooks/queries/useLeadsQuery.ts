'use client';

/**
 * React Query hooks for Leads data fetching
 */

import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { Lead, LeadFilters, Activity } from '../../types/shared';

// Query keys factory for type-safe keys
export const leadKeys = {
    all: ['leads'] as const,
    lists: () => [...leadKeys.all, 'list'] as const,
    list: (filters?: LeadFilters) => [...leadKeys.lists(), filters] as const,
    details: () => [...leadKeys.all, 'detail'] as const,
    detail: (id: string) => [...leadKeys.details(), id] as const,
    activities: (id: string) => [...leadKeys.detail(id), 'activities'] as const,
};

// Response types
interface LeadsResponse {
    success: boolean;
    data: {
        leads: Lead[];
        total?: number;
    };
    message?: string;
}

interface LeadResponse {
    success: boolean;
    data: Lead;
    message?: string;
}

interface ActivitiesResponse {
    success: boolean;
    data: {
        activities: Activity[];
    };
    message?: string;
}

/**
 * Fetch all leads with optional filters
 */
export function useLeadsQuery(
    filters?: LeadFilters,
    options?: Omit<UseQueryOptions<LeadsResponse, Error, Lead[]>, 'queryKey' | 'queryFn'>
) {
    return useQuery({
        queryKey: leadKeys.list(filters),
        queryFn: async () => {
            const params: Record<string, any> = {};

            if (filters?.status && filters.status.length > 0) {
                params.status = filters.status.join(',');
            }
            if (filters?.searchTerm) {
                params.search = filters.searchTerm;
            }
            if (filters?.followUpDateStart) {
                params.followUpDateStart = filters.followUpDateStart;
            }
            if (filters?.followUpDateEnd) {
                params.followUpDateEnd = filters.followUpDateEnd;
            }

            return apiClient.get<LeadsResponse>('/api/leads', { params });
        },
        select: (data) => data.data.leads,
        staleTime: 30000, // 30 seconds
        ...options,
    });
}

/**
 * Fetch a single lead by ID
 */
export function useLeadQuery(
    leadId: string,
    options?: Omit<UseQueryOptions<LeadResponse, Error, Lead>, 'queryKey' | 'queryFn'>
) {
    return useQuery({
        queryKey: leadKeys.detail(leadId),
        queryFn: async () => {
            return apiClient.get<LeadResponse>(`/api/leads/${leadId}`);
        },
        select: (data) => data.data,
        staleTime: 60000, // 1 minute
        enabled: !!leadId,
        ...options,
    });
}

/**
 * Fetch activities for a lead
 */
export function useLeadActivitiesQuery(
    leadId: string,
    options?: Omit<UseQueryOptions<ActivitiesResponse, Error, Activity[]>, 'queryKey' | 'queryFn'>
) {
    return useQuery({
        queryKey: leadKeys.activities(leadId),
        queryFn: async () => {
            return apiClient.get<ActivitiesResponse>(`/api/leads/${leadId}/activities`);
        },
        select: (data) => data.data.activities,
        staleTime: 30000, // 30 seconds
        enabled: !!leadId,
        ...options,
    });
}

/**
 * Prefetch leads for faster navigation
 */
export function usePrefetchLeads() {
    // This can be used to prefetch leads data
    // Useful when hovering over navigation links
}
