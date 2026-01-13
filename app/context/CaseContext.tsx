'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
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
    const [cases, setCases] = useState<Case[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { currentUser } = useUsers();

    // Fetch cases from API
    const fetchCases = useCallback(async () => {
        try {
            setIsLoading(true);
            const response = await fetch('/api/cases');
            const data = await response.json();
            if (data.success) {
                setCases(data.data.cases);
            } else {
                console.error('Failed to fetch cases:', data.message);
            }
        } catch (error) {
            console.error('Error fetching cases:', error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Load cases on mount
    useEffect(() => {
        if (currentUser) {
            fetchCases();
        }
    }, [currentUser, fetchCases]);

    // ============================================================================
    // CASE CRUD OPERATIONS
    // ============================================================================

    // Re-implementing createCase properly to support the signature
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
            // If benefitTypes array provided, we might want to loop.
            // But let's assume manual creation is single for now.
            const response = await fetch('/api/cases', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leadId, schemeType, ...metadata })
            });
            const data = await response.json();
            if (data.success) {
                fetchCases();
                return { success: true, message: data.message, caseIds: [data.data.caseId] };
            } else {
                return { success: false, message: data.message };
            }
        } catch (error) {
            return { success: false, message: 'Network error' };
        }
    }, [fetchCases]);


    const updateCase = useCallback(async (caseId: string, updates: Partial<Case>): Promise<{ success: boolean; message: string }> => {
        try {
            const response = await fetch(`/api/cases/${caseId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });
            const data = await response.json();
            if (data.success) {
                setCases(prev => prev.map(c => c.caseId === caseId ? data.data : c));
                return { success: true, message: 'Case updated successfully' };
            }
            return { success: false, message: data.message };
        } catch (error) {
            return { success: false, message: 'Network error' };
        }
    }, []);

    const deleteCase = useCallback(async (caseId: string): Promise<{ success: boolean; message: string }> => {
        try {
            const response = await fetch(`/api/cases/${caseId}`, { method: 'DELETE' });
            const data = await response.json();
            if (data.success) {
                setCases(prev => prev.filter(c => c.caseId !== caseId));
                return { success: true, message: 'Case deleted successfully' };
            }
            return { success: false, message: data.message };
        } catch (error) {
            return { success: false, message: 'Network error' };
        }
    }, []);

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
            const response = await fetch(`/api/cases/${caseId}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newStatus })
            });
            const data = await response.json();
            if (data.success) {
                setCases(prev => prev.map(c => c.caseId === caseId ? data.data : c));
                return { success: true, message: data.message };
            }
            return { success: false, message: data.message };
        } catch (error) {
            return { success: false, message: 'Network error' };
        }
    }, []);

    // ============================================================================
    // ASSIGNMENT OPERATIONS
    // ============================================================================

    const assignCase = useCallback(async (caseId: string, userId: string, roleId?: UserRole): Promise<{ success: boolean; message: string }> => {
        try {
            const response = await fetch(`/api/cases/${caseId}/assign`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, roleId })
            });
            const data = await response.json();
            if (data.success) {
                fetchCases();
                return { success: true, message: data.message };
            }
            return { success: false, message: data.message };
        } catch (error) {
            return { success: false, message: 'Network error' };
        }
    }, [fetchCases]);

    const bulkAssignCases = useCallback(async (caseIds: string[], userId: string, roleId?: UserRole): Promise<BulkAssignmentResult> => {
        try {
            const response = await fetch('/api/cases/bulk-assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ caseIds, userId, roleId })
            });
            const data = await response.json();
            if (data.success) {
                fetchCases();
                return { success: true, message: data.message, count: data.data.count };
            }
            return { success: false, message: data.message, count: 0 };
        } catch (error) {
            return { success: false, message: 'Network error', count: 0 };
        }
    }, [fetchCases]);

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
