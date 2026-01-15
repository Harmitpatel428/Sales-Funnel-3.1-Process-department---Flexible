'use client';

import React, { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    Case,
    CaseFilters,
    ProcessStatus,
    CasePriority,
    CaseContextType,
    UserRole,
    BulkAssignmentResult
} from '../types/processTypes';

import { useUsers } from './UserContext';

// React Query hooks
import { useCasesQuery, caseKeys } from '../hooks/queries/useCasesQuery';
import {
    useCreateCaseMutation,
    useUpdateCaseMutation,
    useDeleteCaseMutation,
    useUpdateCaseStatusMutation,
    useAssignCaseMutation,
    useBulkAssignCasesMutation,
} from '../hooks/mutations/useCasesMutations';

// ============================================================================
// VALID STATUS TRANSITIONS
// ============================================================================

// All statuses available for selection
const ALL_STATUSES: ProcessStatus[] = [
    'DOCUMENTS_PENDING',
    'DOCUMENTS_RECEIVED',
    'VERIFICATION',
    'SUBMITTED',
    'QUERY_RAISED',
    'APPROVED',
    'REJECTED',
    'CLOSED'
];

// Allow transitions to any status from any current status
const VALID_STATUS_TRANSITIONS: Record<ProcessStatus, ProcessStatus[]> = {
    'DOCUMENTS_PENDING': ALL_STATUSES,
    'DOCUMENTS_RECEIVED': ALL_STATUSES,
    'VERIFICATION': ALL_STATUSES,
    'SUBMITTED': ALL_STATUSES,
    'QUERY_RAISED': ALL_STATUSES,
    'APPROVED': ALL_STATUSES,
    'REJECTED': ALL_STATUSES,
    'CLOSED': ALL_STATUSES
};

// CONTEXT
// ============================================================================

const CaseContext = createContext<CaseContextType | undefined>(undefined);

export function CaseProvider({ children }: { children: ReactNode }) {
    const { currentUser } = useUsers();
    const queryClient = useQueryClient();

    // React Query for cases data - API as source of truth
    const {
        data: cases = [],
        isLoading,
        isFetching,
        error
    } = useCasesQuery(undefined, {
        enabled: !!currentUser,
    });

    // Mutations
    const createCaseMutation = useCreateCaseMutation();
    const updateCaseMutation = useUpdateCaseMutation();
    const deleteCaseMutation = useDeleteCaseMutation();
    const updateStatusMutation = useUpdateCaseStatusMutation();
    const assignCaseMutation = useAssignCaseMutation();
    const bulkAssignMutation = useBulkAssignCasesMutation();

    // ============================================================================
    // CASE CRUD OPERATIONS
    // ============================================================================

    const createCase = useCallback(async (leadId: string, schemeType: string, metadata?: {
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
    }): Promise<{ success: boolean; message: string; caseIds?: string[] }> => {
        try {
            const result = await createCaseMutation.mutateAsync({
                leadId,
                schemeType,
                metadata,
            });
            return {
                success: result.success,
                message: result.message,
                caseIds: result.data?.caseId ? [result.data.caseId] : undefined
            };
        } catch (error: any) {
            return { success: false, message: error.message || 'Network error' };
        }
    }, [createCaseMutation]);


    const updateCase = useCallback(async (caseId: string, updates: Partial<Case>): Promise<{ success: boolean; message: string }> => {
        try {
            await updateCaseMutation.mutateAsync({ caseId, updates });
            return { success: true, message: 'Case updated successfully' };
        } catch (error: any) {
            return { success: false, message: error.message || 'Network error' };
        }
    }, [updateCaseMutation]);

    const deleteCase = useCallback(async (caseId: string): Promise<{ success: boolean; message: string }> => {
        try {
            await deleteCaseMutation.mutateAsync(caseId);
            return { success: true, message: 'Case deleted successfully' };
        } catch (error: any) {
            return { success: false, message: error.message || 'Network error' };
        }
    }, [deleteCaseMutation]);

    const getCaseById = useCallback((caseId: string): Case | undefined => {
        return cases.find(c => c.caseId === caseId);
    }, [cases]);

    const getCaseByLeadId = useCallback((leadId: string): Case | undefined => {
        return cases.find(c => c.leadId === leadId);
    }, [cases]);

    // ============================================================================
    // STATUS OPERATIONS
    // ============================================================================

    const updateStatus = useCallback(async (caseId: string, newStatus: ProcessStatus): Promise<{ success: boolean; message: string }> => {
        try {
            const result = await updateStatusMutation.mutateAsync({ caseId, newStatus });
            return { success: true, message: result.message || 'Status updated successfully' };
        } catch (error: any) {
            return { success: false, message: error.message || 'Network error' };
        }
    }, [updateStatusMutation]);

    // ============================================================================
    // ASSIGNMENT OPERATIONS
    // ============================================================================

    const assignCase = useCallback(async (caseId: string, userId: string, roleId?: UserRole): Promise<{ success: boolean; message: string }> => {
        try {
            const result = await assignCaseMutation.mutateAsync({ caseId, userId, roleId });
            return { success: true, message: result.message || 'Case assigned successfully' };
        } catch (error: any) {
            return { success: false, message: error.message || 'Network error' };
        }
    }, [assignCaseMutation]);

    const bulkAssignCases = useCallback(async (caseIds: string[], userId: string, roleId?: UserRole): Promise<BulkAssignmentResult> => {
        try {
            const result = await bulkAssignMutation.mutateAsync({ caseIds, userId, roleId });
            return result;
        } catch (error: any) {
            return { success: false, message: error.message || 'Network error', count: 0 };
        }
    }, [bulkAssignMutation]);

    // ============================================================================
    // FILTERING
    // ============================================================================

    const getFilteredCases = useCallback((filters: CaseFilters): Case[] => {
        // Client side filtering for active view
        // Server handles role visibility already
        return cases.filter(c => {
            // Status filter
            if (filters.status && filters.status.length > 0) {
                if (!filters.status.includes(c.processStatus)) return false;
            }

            // Assignee filter
            if (filters.assignedTo) {
                if (c.assignedProcessUserId !== filters.assignedTo) return false;
            }

            // Priority filter
            if (filters.priority && filters.priority.length > 0) {
                if (!filters.priority.includes(c.priority)) return false;
            }

            // Scheme type filter
            if (filters.schemeType) {
                if (c.schemeType !== filters.schemeType) return false;
            }

            // Search term
            if (filters.searchTerm) {
                const term = filters.searchTerm.toLowerCase();
                const searchFields = [
                    c.caseNumber,
                    c.clientName,
                    c.company,
                    c.mobileNumber,
                    c.consumerNumber,
                    c.schemeType
                ].filter(Boolean).map(f => f!.toLowerCase());

                if (!searchFields.some(f => f.includes(term))) return false;
            }

            // Date range
            if (filters.dateRangeStart) {
                if (new Date(c.createdAt) < new Date(filters.dateRangeStart)) return false;
            }
            if (filters.dateRangeEnd) {
                if (new Date(c.createdAt) > new Date(filters.dateRangeEnd)) return false;
            }

            return true;
        });
    }, [cases]);

    const getCasesByStatus = useCallback((status: ProcessStatus): Case[] => {
        return cases.filter(c => c.processStatus === status);
    }, [cases]);

    const getCasesByAssignee = useCallback((userId: string): Case[] => {
        return cases.filter(c => c.assignedProcessUserId === userId);
    }, [cases]);

    const getCasesByAssigneeFiltered = useCallback((userId: string): Case[] => {
        return cases.filter(c =>
            c.assignedProcessUserId === userId &&
            c.assignedProcessUserId !== null
        );
    }, [cases]);

    // ============================================================================
    // STATISTICS
    // ============================================================================

    const getCaseStats = useCallback(() => {
        const byStatus: Record<ProcessStatus, number> = {
            'DOCUMENTS_PENDING': 0,
            'DOCUMENTS_RECEIVED': 0,
            'VERIFICATION': 0,
            'SUBMITTED': 0,
            'QUERY_RAISED': 0,
            'APPROVED': 0,
            'REJECTED': 0,
            'CLOSED': 0
        };

        const byPriority: Record<CasePriority, number> = {
            'LOW': 0,
            'MEDIUM': 0,
            'HIGH': 0,
            'URGENT': 0
        };

        cases.forEach(c => {
            byStatus[c.processStatus]++;
            byPriority[c.priority]++;
        });

        return {
            total: cases.length,
            byStatus,
            byPriority
        };
    }, [cases]);

    // ============================================================================
    // CONTEXT VALUE
    // ============================================================================

    // Memoize context value to prevent unnecessary re-renders
    const contextValue: CaseContextType = useMemo(() => ({
        cases,
        isLoading,
        createCase,
        updateCase,
        deleteCase,
        getCaseById,
        getCaseByLeadId,
        updateStatus,
        assignCase,
        bulkAssignCases,
        getFilteredCases,
        getCasesByStatus,
        getCasesByAssignee,
        getCasesByAssigneeFiltered,
        getCaseStats
    }), [
        cases,
        isLoading,
        createCase,
        updateCase,
        deleteCase,
        getCaseById,
        getCaseByLeadId,
        updateStatus,
        assignCase,
        bulkAssignCases,
        getFilteredCases,
        getCasesByStatus,
        getCasesByAssignee,
        getCasesByAssigneeFiltered,
        getCaseStats
    ]);

    return (
        <CaseContext.Provider value={contextValue}>
            {children}
        </CaseContext.Provider>
    );
}

export function useCases() {
    const ctx = useContext(CaseContext);
    if (!ctx) throw new Error('useCases must be used inside CaseProvider');
    return ctx;
}
