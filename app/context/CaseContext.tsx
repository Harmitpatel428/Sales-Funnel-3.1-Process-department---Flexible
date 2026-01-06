'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import {
    Case,
    CaseFilters,
    ProcessStatus,
    CasePriority,
    CaseContextType,
    UserRole,
    CaseAssignmentHistory
} from '../types/processTypes';
import { Lead } from '../types/shared';
import { useLeads } from './LeadContext';
import { useUsers } from './UserContext';

// ============================================================================
// CONSTANTS
// ============================================================================

const CASES_STORAGE_KEY = 'processCases';
const CASE_COUNTER_KEY = 'caseCounter';
const ASSIGNMENT_HISTORY_KEY = 'caseAssignmentHistory';

// Generate case number (e.g., "CASE-2026-0001")
function generateCaseNumber(): string {
    let counter = 1;
    try {
        const stored = localStorage.getItem(CASE_COUNTER_KEY);
        if (stored) {
            counter = parseInt(stored, 10) + 1;
        }
        localStorage.setItem(CASE_COUNTER_KEY, counter.toString());
    } catch (error) {
        console.error('Error managing case counter:', error);
    }

    const year = new Date().getFullYear();
    const paddedCounter = counter.toString().padStart(4, '0');
    return `CASE-${year}-${paddedCounter}`;
}

// Generate UUID
function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

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

// ============================================================================
// CONTEXT
// ============================================================================

const CaseContext = createContext<CaseContextType | undefined>(undefined);

export function CaseProvider({ children }: { children: ReactNode }) {
    const [cases, setCases] = useState<Case[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isHydrated, setIsHydrated] = useState(false);

    const { updateLead, leads } = useLeads();
    const { currentUser } = useUsers();

    // Load cases from localStorage
    useEffect(() => {
        try {
            const storedCases = localStorage.getItem(CASES_STORAGE_KEY);
            if (storedCases) {
                setCases(JSON.parse(storedCases));
            }
        } catch (error) {
            console.error('Error loading cases:', error);
        } finally {
            setIsLoading(false);
            setIsHydrated(true);
        }
    }, []);

    // Persist cases to localStorage
    useEffect(() => {
        if (!isHydrated) return;

        const timeoutId = setTimeout(() => {
            try {
                localStorage.setItem(CASES_STORAGE_KEY, JSON.stringify(cases));
            } catch (error) {
                console.error('Error saving cases:', error);
            }
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [cases, isHydrated]);

    // ============================================================================
    // CASE CRUD OPERATIONS
    // ============================================================================

    const createCase = useCallback((leadId: string, schemeType: string, metadata?: {
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
        // Financial/Location fields
        talukaCategory?: string;
        termLoanAmount?: string;
        plantMachineryValue?: string;
        electricityLoad?: string;
        electricityLoadType?: 'HT' | 'LT' | '';
    }): { success: boolean; message: string; caseId?: string } => {
        // Find the lead
        const lead = leads.find(l => l.id === leadId);
        if (!lead) {
            return { success: false, message: 'Lead not found' };
        }

        // Check if lead is already converted
        if (lead.convertedToCaseId) {
            return { success: false, message: 'Lead has already been converted to a case' };
        }

        // Check if a case already exists for this lead
        if (cases.some(c => c.leadId === leadId)) {
            return { success: false, message: 'A case already exists for this lead' };
        }

        const caseId = generateUUID();
        const now = new Date().toISOString();

        const newCase: Case = {
            caseId,
            leadId,
            caseNumber: generateCaseNumber(),
            schemeType,
            caseType: metadata?.caseType,
            benefitTypes: metadata?.benefitTypes,
            companyType: metadata?.companyType,
            contacts: metadata?.contacts,
            assignedProcessUserId: null,
            assignedRole: null,
            processStatus: 'DOCUMENTS_PENDING',
            priority: 'MEDIUM',
            createdAt: now,
            updatedAt: now,
            // Denormalized lead info - use form data if provided
            clientName: lead.clientName || '',
            company: metadata?.companyName || lead.company || '',
            mobileNumber: lead.mobileNumber || (lead.mobileNumbers?.[0]?.number || ''),
            consumerNumber: lead.consumerNumber,
            kva: lead.kva,
            // Financial/Location fields from Forward to Process form
            talukaCategory: metadata?.talukaCategory,
            termLoanAmount: metadata?.termLoanAmount,
            plantMachineryValue: metadata?.plantMachineryValue,
            electricityLoad: metadata?.electricityLoad,
            electricityLoadType: metadata?.electricityLoadType
        };

        setCases(prev => [...prev, newCase]);

        // Update the lead to mark it as converted
        updateLead({
            ...lead,
            convertedToCaseId: caseId,
            convertedAt: now
        }, { touchActivity: true });

        return { success: true, message: 'Case created successfully', caseId };
    }, [leads, cases, updateLead]);

    const updateCase = useCallback((caseId: string, updates: Partial<Case>): { success: boolean; message: string } => {
        const caseIndex = cases.findIndex(c => c.caseId === caseId);
        if (caseIndex === -1) {
            return { success: false, message: 'Case not found' };
        }

        setCases(prev => prev.map(c =>
            c.caseId === caseId
                ? { ...c, ...updates, updatedAt: new Date().toISOString() }
                : c
        ));

        return { success: true, message: 'Case updated successfully' };
    }, [cases]);

    const deleteCase = useCallback((caseId: string): { success: boolean; message: string } => {
        const existingCase = cases.find(c => c.caseId === caseId);
        if (!existingCase) {
            return { success: false, message: 'Case not found' };
        }

        // Note: We don't revert the lead conversion - it's irreversible
        setCases(prev => prev.filter(c => c.caseId !== caseId));

        return { success: true, message: 'Case deleted successfully' };
    }, [cases]);

    const getCaseById = useCallback((caseId: string): Case | undefined => {
        return cases.find(c => c.caseId === caseId);
    }, [cases]);

    const getCaseByLeadId = useCallback((leadId: string): Case | undefined => {
        return cases.find(c => c.leadId === leadId);
    }, [cases]);

    // ============================================================================
    // STATUS OPERATIONS
    // ============================================================================

    const updateStatus = useCallback((caseId: string, newStatus: ProcessStatus): { success: boolean; message: string } => {
        const existingCase = cases.find(c => c.caseId === caseId);
        if (!existingCase) {
            return { success: false, message: 'Case not found' };
        }

        // Validate status transition
        const allowedTransitions = VALID_STATUS_TRANSITIONS[existingCase.processStatus];
        if (!allowedTransitions.includes(newStatus)) {
            return {
                success: false,
                message: `Invalid status transition from ${existingCase.processStatus} to ${newStatus}`
            };
        }

        const updates: Partial<Case> = {
            processStatus: newStatus,
            updatedAt: new Date().toISOString()
        };

        // If closing, set closedAt
        if (newStatus === 'CLOSED') {
            updates.closedAt = new Date().toISOString();
        }

        setCases(prev => prev.map(c =>
            c.caseId === caseId ? { ...c, ...updates } : c
        ));

        return { success: true, message: `Status updated to ${newStatus}` };
    }, [cases]);

    // ============================================================================
    // ASSIGNMENT OPERATIONS
    // ============================================================================

    const assignCase = useCallback((caseId: string, userId: string, roleId?: UserRole): { success: boolean; message: string } => {
        // RBAC: Only ADMIN, PROCESS_MANAGER, or SALES_MANAGER can assign cases
        if (!currentUser || !['ADMIN', 'PROCESS_MANAGER', 'SALES_MANAGER'].includes(currentUser.role)) {
            return { success: false, message: 'Unauthorized: You do not have permission to assign cases' };
        }

        const existingCase = cases.find(c => c.caseId === caseId);
        if (!existingCase) {
            return { success: false, message: 'Case not found' };
        }

        // Capture prior assignment for history
        const previousRole = existingCase.assignedRole;
        const previousUserId = existingCase.assignedProcessUserId;

        // Create assignment history entry
        const historyEntry: CaseAssignmentHistory = {
            historyId: generateUUID(),
            caseId,
            previousRole,
            previousUserId,
            newRole: roleId || null,
            newUserId: userId,
            assignedBy: currentUser.userId,
            assignedByName: currentUser.name,
            assignedAt: new Date().toISOString()
        };

        // Persist to localStorage
        try {
            const storedHistory = localStorage.getItem(ASSIGNMENT_HISTORY_KEY);
            const historyList: CaseAssignmentHistory[] = storedHistory ? JSON.parse(storedHistory) : [];
            historyList.push(historyEntry);
            localStorage.setItem(ASSIGNMENT_HISTORY_KEY, JSON.stringify(historyList));
        } catch (error) {
            console.error('Error saving assignment history:', error);
        }

        setCases(prev => prev.map(c =>
            c.caseId === caseId
                ? {
                    ...c,
                    assignedProcessUserId: userId,
                    assignedRole: roleId || null,
                    updatedAt: new Date().toISOString()
                }
                : c
        ));

        return { success: true, message: 'Case assigned successfully' };
    }, [cases, currentUser]);

    // ============================================================================
    // DEPENDENT VISIBILITY: Filter cases based on lead status
    // ============================================================================
    // Cases should be hidden when their linked Lead is deleted.
    // When the Lead is restored (via re-import), Cases automatically reappear.

    const visibleCases = useMemo(() => {
        return cases;
        // Previous logic hid cases if lead was deleted.
        // We now want cases to persist independently.
    }, [cases]);

    // ============================================================================
    // FILTERING
    // ============================================================================

    const getFilteredCases = useCallback((filters: CaseFilters): Case[] => {
        // Start with visible cases only (respects lead deletion status)
        return visibleCases.filter(c => {
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
    }, [visibleCases]);

    const getCasesByStatus = useCallback((status: ProcessStatus): Case[] => {
        return visibleCases.filter(c => c.processStatus === status);
    }, [visibleCases]);

    const getCasesByAssignee = useCallback((userId: string): Case[] => {
        return visibleCases.filter(c => c.assignedProcessUserId === userId);
    }, [visibleCases]);

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

        // Use visibleCases to only count cases with active leads
        visibleCases.forEach(c => {
            byStatus[c.processStatus]++;
            byPriority[c.priority]++;
        });

        return {
            total: visibleCases.length,
            byStatus,
            byPriority
        };
    }, [visibleCases]);

    // ============================================================================
    // CONTEXT VALUE
    // ============================================================================

    // Memoize context value to prevent unnecessary re-renders
    const contextValue: CaseContextType = useMemo(() => ({
        cases: visibleCases, // Expose only visible cases (respects lead deletion)
        isLoading,
        createCase,
        updateCase,
        deleteCase,
        getCaseById,
        getCaseByLeadId,
        updateStatus,
        assignCase,
        getFilteredCases,
        getCasesByStatus,
        getCasesByAssignee,
        getCaseStats
    }), [
        visibleCases,
        isLoading,
        createCase,
        updateCase,
        deleteCase,
        getCaseById,
        getCaseByLeadId,
        updateStatus,
        assignCase,
        getFilteredCases,
        getCasesByStatus,
        getCasesByAssignee,
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
