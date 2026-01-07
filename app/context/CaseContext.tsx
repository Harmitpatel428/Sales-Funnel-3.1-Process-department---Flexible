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
import { addAuditLog } from '../utils/storage';
import { SystemAuditLog, AuditActionType } from '../types/shared';

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

const createCaseAuditLog = (
    actionType: AuditActionType,
    caseId: string,
    description: string,
    metadata?: Record<string, any>,
    currentUser?: { userId: string; name: string } | null
): void => {
    try {
        const user = currentUser || (() => {
            const userJson = localStorage.getItem('currentUser');
            return userJson ? JSON.parse(userJson) : null;
        })();

        const auditLog: SystemAuditLog = {
            id: generateUUID(),
            actionType,
            entityType: 'case',
            entityId: caseId,
            performedBy: user?.userId || 'system',
            performedByName: user?.name || 'System',
            performedAt: new Date().toISOString(),
            description,
            metadata
        };

        addAuditLog(auditLog);
    } catch (error) {
        console.error('Error creating case audit log:', error);
    }
};

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
    }): { success: boolean; message: string; caseIds?: string[] } => {
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

        const now = new Date().toISOString();
        const benefitTypes = metadata?.benefitTypes || [];

        // If no benefit types selected, create a single case with empty benefitTypes
        const typesToCreate = benefitTypes.length > 0 ? benefitTypes : [null];

        const createdCases: Case[] = [];
        const createdCaseIds: string[] = [];

        // Create one case per benefit type
        for (const benefitType of typesToCreate) {
            const caseId = generateUUID();
            const caseNumber = generateCaseNumber();

            const newCase: Case = {
                caseId,
                leadId,
                caseNumber,
                schemeType,
                caseType: metadata?.caseType,
                benefitTypes: benefitType ? [benefitType] : [], // Single benefit type per case
                companyType: metadata?.companyType,
                contacts: metadata?.contacts,
                assignedProcessUserId: null,
                assignedRole: null,
                processStatus: 'DOCUMENTS_PENDING',
                priority: 'MEDIUM',
                createdAt: now,
                updatedAt: now,
                // Denormalized lead info - use form data if provided, preferring submitted_payload
                clientName: lead.submitted_payload?.clientName ?? lead.clientName ?? '',
                company: (metadata?.companyName ?? lead.submitted_payload?.company ?? lead.company ?? '').trim() || 'Unknown Company',
                mobileNumber: lead.submitted_payload?.mobileNumber ?? lead.mobileNumber ?? (lead.mobileNumbers?.[0]?.number || ''),
                consumerNumber: lead.submitted_payload?.consumerNumber ?? lead.consumerNumber,
                kva: lead.submitted_payload?.kva ?? lead.kva,
                // Financial/Location fields from Forward to Process form
                talukaCategory: metadata?.talukaCategory,
                termLoanAmount: metadata?.termLoanAmount,
                plantMachineryValue: metadata?.plantMachineryValue,
                electricityLoad: metadata?.electricityLoad,
                electricityLoadType: metadata?.electricityLoadType,
                // Store complete original data
                originalLeadData: lead.submitted_payload || lead
            };

            createdCases.push(newCase);
            createdCaseIds.push(caseId);

            // Create audit log for each case
            createCaseAuditLog(
                'CASE_CREATED',
                caseId,
                `Case ${caseNumber} created from lead`,
                {
                    leadId,
                    schemeType,
                    benefitType: benefitType || 'none',
                    company: newCase.company
                }
            );
        }

        // Add all cases to state
        setCases(prev => [...prev, ...createdCases]);

        // Update the lead to mark it as converted (use first caseId for backward compatibility)
        updateLead({
            ...lead,
            convertedToCaseId: createdCaseIds[0],
            convertedAt: now
        }, { touchActivity: true });

        const caseCount = createdCaseIds.length;
        const message = caseCount > 1
            ? `${caseCount} cases created successfully (one per benefit type)`
            : 'Case created successfully';

        return { success: true, message, caseIds: createdCaseIds };
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

        // Create audit log
        createCaseAuditLog(
            'CASE_UPDATED',
            caseId,
            `Case updated`,
            { updates }
        );

        return { success: true, message: 'Case updated successfully' };
    }, [cases]);

    const deleteCase = useCallback((caseId: string): { success: boolean; message: string } => {
        const existingCase = cases.find(c => c.caseId === caseId);
        if (!existingCase) {
            return { success: false, message: 'Case not found' };
        }

        // Note: We don't revert the lead conversion - it's irreversible
        setCases(prev => prev.filter(c => c.caseId !== caseId));

        // Create audit log
        createCaseAuditLog(
            'CASE_DELETED',
            caseId,
            `Case ${existingCase.caseNumber} deleted`,
            { caseNumber: existingCase.caseNumber, company: existingCase.company }
        );

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

        // Create audit log
        createCaseAuditLog(
            'CASE_STATUS_CHANGED',
            caseId,
            `Status changed from ${existingCase.processStatus} to ${newStatus}`,
            { oldStatus: existingCase.processStatus, newStatus },
            currentUser
        );

        return { success: true, message: `Status updated to ${newStatus}` };
    }, [cases]);

    // ============================================================================
    // ASSIGNMENT OPERATIONS
    // ============================================================================

    const assignCase = useCallback((caseId: string, userId: string, roleId?: UserRole): { success: boolean; message: string } => {
        // RBAC: Only ADMIN or PROCESS_MANAGER can assign cases
        if (!currentUser || !['ADMIN', 'PROCESS_MANAGER'].includes(currentUser.role)) {
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

        // Create audit log
        const actionType = previousUserId ? 'CASE_REASSIGNED' : 'CASE_ASSIGNED';
        const description = previousUserId
            ? `Case reassigned from ${previousUserId} to ${userId}`
            : `Case assigned to ${userId}`;

        createCaseAuditLog(
            actionType,
            caseId,
            description,
            {
                previousUserId,
                newUserId: userId,
                previousRole,
                newRole: roleId,
                assignedBy: currentUser.userId
            },
            currentUser
        );

        return { success: true, message: 'Case assigned successfully' };
    }, [cases, currentUser]);



    // ============================================================================
    // ROLE-BASED VISIBILITY ENFORCEMENT (DATA LAYER)
    // ============================================================================
    // This computed property enforces strict role-based access control at the data layer.
    // All context methods that return cases use this filtered array as the source of truth.
    // 
    // VISIBILITY RULES:
    // - ADMIN: All cases (unrestricted)
    // - PROCESS_MANAGER: All cases (unrestricted)
    // - SALES_MANAGER: All cases (Read-Only access in Dashboard)
    // - PROCESS_EXECUTIVE: ONLY cases where assignedProcessUserId === currentUser.userId
    //   * Cannot see unassigned cases
    //   * Cannot see cases assigned to other users
    //   * Cannot see other benefit-type entries from same company unless assigned
    // - SALES_EXECUTIVE: Empty array (should not access Process Dashboard)
    //
    // SECURITY NOTE: This filtering prevents Process Executives from accessing
    // unassigned benefit-type entries even if they belong to the same company.
    // Each benefit-type entry is treated as an independent sub-lead with its own
    // assignment, ensuring strict isolation.
    // ============================================================================
    const visibleCases = useMemo(() => {
        // Filter cases based on user role
        if (!currentUser) return [];

        // ADMIN, PROCESS_MANAGER and SALES_MANAGER see all cases
        if (['ADMIN', 'PROCESS_MANAGER', 'SALES_MANAGER'].includes(currentUser.role)) {
            return cases;
        }

        // PROCESS_EXECUTIVE sees only cases assigned to them
        if (currentUser.role === 'PROCESS_EXECUTIVE') {
            return cases.filter(c => c.assignedProcessUserId === currentUser.userId);
        }

        // Other roles (SALES_EXECUTIVE) should not access cases
        // but if they do, return empty array
        return [];
    }, [cases, currentUser]);

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

    const getCasesByAssigneeFiltered = useCallback((userId: string): Case[] => {
        // Strict filtering: only return cases assigned to specific user
        // This respects role-based visibility (visibleCases already filtered)
        return visibleCases.filter(c =>
            c.assignedProcessUserId === userId &&
            c.assignedProcessUserId !== null
        );
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
        getCasesByAssigneeFiltered,
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
