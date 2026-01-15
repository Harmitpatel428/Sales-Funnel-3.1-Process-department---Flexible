'use client';

/**
 * React Query hooks for Cases data fetching
 */

import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { Case, CaseFilters, ProcessStatus, CasePriority } from '../../types/processTypes';
import { CaseSchema } from '@/lib/validation/schemas';
import { assertApiResponse } from '@/app/utils/typeGuards';
import { z } from 'zod';

// Query keys factory for type-safe keys
export const caseKeys = {
    all: ['cases'] as const,
    lists: () => [...caseKeys.all, 'list'] as const,
    list: (filters?: CaseFilters) => [...caseKeys.lists(), filters] as const,
    details: () => [...caseKeys.all, 'detail'] as const,
    detail: (id: string) => [...caseKeys.details(), id] as const,
    byLead: (leadId: string) => [...caseKeys.all, 'byLead', leadId] as const,
    stats: () => [...caseKeys.all, 'stats'] as const,
};

// Response types
interface CasesResponse {
    success: boolean;
    data: {
        cases: Case[];
        total?: number;
    };
    message?: string;
}

interface CaseResponse {
    success: boolean;
    data: Case;
    message?: string;
}

interface CaseStatsResponse {
    success: boolean;
    data: {
        total: number;
        byStatus: Record<ProcessStatus, number>;
        byPriority: Record<CasePriority, number>;
    };
    message?: string;
}

/**
 * Fetch all cases with optional filters
 */
export function useCasesQuery(
    filters?: CaseFilters,
    options?: Omit<UseQueryOptions<CasesResponse, Error, Case[]>, 'queryKey' | 'queryFn'>
) {
    return useQuery({
        queryKey: caseKeys.list(filters),
        queryFn: async () => {
            const params: Record<string, any> = {};

            if (filters?.status && filters.status.length > 0) {
                params.status = filters.status.join(',');
            }
            if (filters?.assignedTo) {
                params.assignedTo = filters.assignedTo;
            }
            if (filters?.priority && filters.priority.length > 0) {
                params.priority = filters.priority.join(',');
            }
            if (filters?.schemeType) {
                params.schemeType = filters.schemeType;
            }
            if (filters?.searchTerm) {
                params.search = filters.searchTerm;
            }
            if (filters?.dateRangeStart) {
                params.dateRangeStart = filters.dateRangeStart;
            }
            if (filters?.dateRangeEnd) {
                params.dateRangeEnd = filters.dateRangeEnd;
            }

            if (filters?.dateRangeEnd) {
                params.dateRangeEnd = filters.dateRangeEnd;
            }

            const response = await apiClient.get<CasesResponse>('/api/cases', { params });
            const ResponseSchema = z.object({
                success: z.boolean(),
                data: z.object({
                    cases: z.array(CaseSchema.partial().passthrough()),
                    total: z.number().optional()
                }),
                message: z.string().optional()
            });
            assertApiResponse(ResponseSchema, response);
            return response;
        },
        select: (data) => data.data.cases,
        staleTime: 30000, // 30 seconds
        ...options,
    });
}

/**
 * Fetch a single case by ID
 */
export function useCaseQuery(
    caseId: string,
    options?: Omit<UseQueryOptions<CaseResponse, Error, Case>, 'queryKey' | 'queryFn'>
) {
    return useQuery({
        queryKey: caseKeys.detail(caseId),
        queryFn: async () => {
            const response = await apiClient.get<CaseResponse>(`/api/cases/${caseId}`);
            const ResponseSchema = z.object({
                success: z.boolean(),
                data: CaseSchema.partial().passthrough(),
                message: z.string().optional()
            });
            assertApiResponse(ResponseSchema, response);
            return response;
        },
        select: (data) => data.data,
        staleTime: 60000, // 1 minute
        enabled: !!caseId,
        ...options,
    });
}

/**
 * Fetch case by lead ID
 */
export function useCaseByLeadQuery(
    leadId: string,
    options?: Omit<UseQueryOptions<CasesResponse, Error, Case | undefined>, 'queryKey' | 'queryFn'>
) {
    return useQuery({
        queryKey: caseKeys.byLead(leadId),
        queryFn: async () => {
            return apiClient.get<CasesResponse>('/api/cases', { params: { leadId } });
        },
        select: (data) => data.data.cases[0], // Return first case for this lead
        staleTime: 60000, // 1 minute
        enabled: !!leadId,
        ...options,
    });
}

/**
 * Fetch case statistics
 */
export function useCaseStatsQuery(
    options?: Omit<UseQueryOptions<CaseStatsResponse, Error, CaseStatsResponse['data']>, 'queryKey' | 'queryFn'>
) {
    return useQuery({
        queryKey: caseKeys.stats(),
        queryFn: async () => {
            return apiClient.get<CaseStatsResponse>('/api/cases/stats');
        },
        select: (data) => data.data,
        staleTime: 60000, // 1 minute
        ...options,
    });
}
