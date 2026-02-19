'use client';

/**
 * React Query hooks for Leads data fetching
 */

import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { apiClient } from '../../lib/apiClient';
import { Lead, LeadFilters, Activity } from '../../types/shared';
import { assertApiResponse } from '@/app/utils/typeGuards';
import { z } from 'zod';

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
        leads: unknown[];
        total?: number;
    };
    message?: string;
}

interface LeadResponse {
    success: boolean;
    data: unknown;
    message?: string;
}

interface ActivitiesResponse {
    success: boolean;
    data: {
        activities: Activity[];
    };
    message?: string;
}

const STATUS_ALIAS_MAP: Record<string, Lead['status'] | string> = {
    NEW: 'New',
    CONTACTED: 'Follow-up',
    QUALIFIED: 'Follow-up',
    PROPOSAL: 'Follow-up',
    NEGOTIATION: 'Follow-up',
    WON: 'Deal Close',
    LOST: 'Others',
    WAO: 'Work Alloted',
    WORK_ALLOTED: 'Work Alloted',
    WORK_ALLOTTED: 'Work Alloted',
    FOLLOW_UP: 'Follow-up',
    FOLLOWUP: 'Follow-up',
    DEAL_CLOSE: 'Deal Close',
    HOT_LEAD: 'Hotlead',
    CNR: 'CNR',
    BUSY: 'Busy',
    DOCUMENTATION: 'Documentation',
    MANDATE_SENT: 'Mandate Sent',
    OTHERS: 'Others',
    FRESH_LEAD: 'Fresh Lead',
};

function toStringValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value);
}

function toDateString(value: unknown): string {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'string') return value;
    const date = new Date(value as any);
    return isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function parseJsonValue(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
        return JSON.parse(trimmed);
    } catch {
        return value;
    }
}

function normalizeStatus(status: unknown): Lead['status'] | string {
    const raw = toStringValue(status).trim();
    if (!raw) return 'New';

    const normalizedKey = raw.toUpperCase().replace(/[\s-]+/g, '_');
    return STATUS_ALIAS_MAP[normalizedKey] || raw;
}

function normalizeMobileNumbers(value: unknown): Lead['mobileNumbers'] {
    const parsed = parseJsonValue(value);
    const arr = Array.isArray(parsed) ? parsed : [];

    return arr
        .map((item: any, index: number) => {
            const number = toStringValue(item?.number ?? item?.mobileNumber).trim();
            const name = toStringValue(item?.name ?? item?.contactName).trim();
            if (!number && !name) return null;

            return {
                id: toStringValue(item?.id || `mobile-${index}`),
                number,
                name,
                isMain: Boolean(item?.isMain ?? item?.isPrimary ?? false),
            };
        })
        .filter((item): item is Lead['mobileNumbers'][number] => Boolean(item));
}

function normalizeActivities(value: unknown, leadId: string): Activity[] {
    const parsed = parseJsonValue(value);
    const arr = Array.isArray(parsed) ? parsed : [];

    return arr
        .map((item: any, index: number) => {
            const description = toStringValue(item?.description).trim();
            if (!description) return null;

            return {
                id: toStringValue(item?.id || `${leadId}-activity-${index}`),
                leadId,
                description,
                timestamp: toDateString(item?.timestamp) || new Date().toISOString(),
                employeeName: item?.employeeName ? toStringValue(item.employeeName) : undefined,
                activityType: item?.activityType,
                duration: typeof item?.duration === 'number' ? item.duration : undefined,
                metadata: item?.metadata && typeof item.metadata === 'object' ? item.metadata : undefined,
            } as Activity;
        })
        .filter((item): item is Activity => Boolean(item));
}

function normalizeRecordObject(value: unknown): Record<string, any> | undefined {
    const parsed = parseJsonValue(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, any>
        : undefined;
}

function normalizeLeadFromApi(input: unknown): Lead {
    const raw = (input && typeof input === 'object') ? input as Record<string, any> : {};
    const id = toStringValue(raw.id);

    const assignedToId =
        raw.assignedToId ??
        (raw.assignedTo && typeof raw.assignedTo === 'object' ? (raw.assignedTo as any).id : raw.assignedTo);

    return {
        id,
        kva: toStringValue(raw.kva),
        connectionDate: toDateString(raw.connectionDate),
        consumerNumber: toStringValue(raw.consumerNumber),
        company: toStringValue(raw.company),
        clientName: toStringValue(raw.clientName),
        discom: raw.discom !== undefined && raw.discom !== null ? toStringValue(raw.discom) : undefined,
        gidc: raw.gidc !== undefined && raw.gidc !== null ? toStringValue(raw.gidc) : undefined,
        gstNumber: raw.gstNumber !== undefined && raw.gstNumber !== null ? toStringValue(raw.gstNumber) : undefined,
        mobileNumbers: normalizeMobileNumbers(raw.mobileNumbers),
        mobileNumber: toStringValue(raw.mobileNumber),
        companyLocation: raw.companyLocation !== undefined && raw.companyLocation !== null ? toStringValue(raw.companyLocation) : undefined,
        unitType: toStringValue(raw.unitType || 'New'),
        marketingObjective: raw.marketingObjective !== undefined && raw.marketingObjective !== null ? toStringValue(raw.marketingObjective) : undefined,
        budget: raw.budget !== undefined && raw.budget !== null ? toStringValue(raw.budget) : undefined,
        termLoan: raw.termLoan !== undefined && raw.termLoan !== null ? toStringValue(raw.termLoan) : undefined,
        timeline: raw.timeline !== undefined && raw.timeline !== null ? toStringValue(raw.timeline) : undefined,
        status: normalizeStatus(raw.status) as Lead['status'],
        contactOwner: raw.contactOwner !== undefined && raw.contactOwner !== null ? toStringValue(raw.contactOwner) : undefined,
        lastActivityDate: toDateString(raw.lastActivityDate),
        followUpDate: toDateString(raw.followUpDate),
        finalConclusion: raw.finalConclusion !== undefined && raw.finalConclusion !== null ? toStringValue(raw.finalConclusion) : undefined,
        notes: raw.notes !== undefined && raw.notes !== null ? toStringValue(raw.notes) : undefined,
        isDone: Boolean(raw.isDone),
        isDeleted: Boolean(raw.isDeleted),
        isUpdated: Boolean(raw.isUpdated),
        activities: normalizeActivities(raw.activities, id),
        mandateStatus: raw.mandateStatus !== undefined && raw.mandateStatus !== null ? toStringValue(raw.mandateStatus) as any : undefined,
        documentStatus: raw.documentStatus !== undefined && raw.documentStatus !== null ? toStringValue(raw.documentStatus) as any : undefined,
        convertedToCaseId: raw.convertedToCaseId !== undefined && raw.convertedToCaseId !== null ? toStringValue(raw.convertedToCaseId) : undefined,
        convertedAt: toDateString(raw.convertedAt),
        createdAt: toDateString(raw.createdAt),
        assignedTo: assignedToId !== undefined && assignedToId !== null ? toStringValue(assignedToId) : undefined,
        assignedBy: raw.assignedBy !== undefined && raw.assignedBy !== null ? toStringValue(raw.assignedBy) : undefined,
        assignedAt: toDateString(raw.assignedAt),
        submitted_payload: normalizeRecordObject(raw.submitted_payload),
        version: typeof raw.version === 'number' && Number.isFinite(raw.version) ? raw.version : 1,
        updatedAt: toDateString(raw.updatedAt),
    };
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

            const ResponseSchema = z.object({
                success: z.boolean(),
                data: z.object({
                    leads: z.array(z.unknown()),
                    total: z.number().optional()
                }).passthrough(),
                message: z.string().optional()
            }).passthrough();

            const pageSize = 100;
            const allLeads: unknown[] = [];
            let page = 1;
            let totalFromServer: number | undefined;
            let lastMessage: string | undefined;

            while (true) {
                const response = await apiClient.get<LeadsResponse>('/api/leads', {
                    params: {
                        ...params,
                        page,
                        limit: pageSize,
                    }
                });

                const parsedResponse = assertApiResponse(ResponseSchema, response);
                const batch = parsedResponse.data.leads || [];
                allLeads.push(...batch);
                totalFromServer = parsedResponse.data.total;
                lastMessage = parsedResponse.message;

                const reachedKnownTotal = typeof totalFromServer === 'number' && allLeads.length >= totalFromServer;
                const reachedLastPage = batch.length < pageSize;
                if (reachedKnownTotal || reachedLastPage) {
                    break;
                }

                page += 1;
                // Safety guard to avoid accidental infinite loops.
                if (page > 500) {
                    break;
                }
            }

            return {
                success: true,
                data: {
                    leads: allLeads,
                    total: totalFromServer ?? allLeads.length,
                },
                message: lastMessage
            };
        },
        select: (data) => data.data.leads.map(normalizeLeadFromApi),
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
            const response = await apiClient.get<LeadResponse>(`/api/leads/${leadId}`);
            const ResponseSchema = z.object({
                success: z.boolean(),
                data: z.unknown(),
                message: z.string().optional()
            }).passthrough();
            assertApiResponse(ResponseSchema, response);
            return response;
        },
        select: (data) => normalizeLeadFromApi(data.data),
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
