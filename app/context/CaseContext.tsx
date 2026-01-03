'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
    Case,
    CaseFilters,
    ProcessStatus,
    CasePriority,
    CaseContextType
} from '../types/processTypes';
import { Lead } from '../types/shared';
import { useLeads } from './LeadContext';
import { useUsers } from './UserContext';

// ============================================================================
// CONSTANTS
// ============================================================================

const CASES_STORAGE_KEY = 'processCases';
const CASE_COUNTER_KEY = 'caseCounter';

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

const VALID_STATUS_TRANSITIONS: Record<ProcessStatus, ProcessStatus[]> = {
    'DOCUMENTS_PENDING': ['DOCUMENTS_RECEIVED', 'CLOSED'],
    'DOCUMENTS_RECEIVED': ['VERIFICATION', 'DOCUMENTS_PENDING', 'CLOSED'],
    'VERIFICATION': ['SUBMITTED', 'DOCUMENTS_PENDING', 'CLOSED'],
    'SUBMITTED': ['QUERY_RAISED', 'APPROVED', 'REJECTED'],
    'QUERY_RAISED': ['SUBMITTED', 'CLOSED'],
    'APPROVED': ['CLOSED'],
    'REJECTED': ['CLOSED'],
    'CLOSED': [] // Terminal state - no transitions allowed
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

    const createCase = useCallback((leadId: string, schemeType: string): { success: boolean; message: string; caseId?: string } => {
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
            assignedProcessUserId: null,
            processStatus: 'DOCUMENTS_PENDING',
            priority: 'MEDIUM',
            createdAt: now,
            updatedAt: now,
            // Denormalized lead info
            clientName: lead.clientName || '',
            company: lead.company || '',
            mobileNumber: lead.mobileNumber || (lead.mobileNumbers?.[0]?.number || ''),
            consumerNumber: lead.consumerNumber,
            kva: lead.kva
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

    const assignCase = useCallback((caseId: string, userId: string): { success: boolean; message: string } => {
        const existingCase = cases.find(c => c.caseId === caseId);
        if (!existingCase) {
            return { success: false, message: 'Case not found' };
        }

        setCases(prev => prev.map(c =>
            c.caseId === caseId
                ? { ...c, assignedProcessUserId: userId, updatedAt: new Date().toISOString() }
                : c
        ));

        return { success: true, message: 'Case assigned successfully' };
    }, [cases]);

    // ============================================================================
    // FILTERING
    // ============================================================================

    const getFilteredCases = useCallback((filters: CaseFilters): Case[] => {
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

    const contextValue: CaseContextType = {
        cases,
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
    };

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
