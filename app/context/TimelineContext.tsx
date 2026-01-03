'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
    CaseTimelineEntry,
    TimelineActionType,
    ProcessStatus,
    TimelineContextType
} from '../types/processTypes';

// ============================================================================
// CONSTANTS
// ============================================================================

const TIMELINE_STORAGE_KEY = 'caseTimelines';

// Generate UUID
function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// ============================================================================
// CONTEXT
// ============================================================================

const TimelineContext = createContext<TimelineContextType | undefined>(undefined);

export function TimelineProvider({ children }: { children: ReactNode }) {
    const [timeline, setTimeline] = useState<CaseTimelineEntry[]>([]);
    const [isHydrated, setIsHydrated] = useState(false);

    // Load timeline from localStorage
    useEffect(() => {
        try {
            const storedTimeline = localStorage.getItem(TIMELINE_STORAGE_KEY);
            if (storedTimeline) {
                setTimeline(JSON.parse(storedTimeline));
            }
        } catch (error) {
            console.error('Error loading timeline:', error);
        } finally {
            setIsHydrated(true);
        }
    }, []);

    // Persist timeline to localStorage
    useEffect(() => {
        if (!isHydrated) return;

        const timeoutId = setTimeout(() => {
            try {
                localStorage.setItem(TIMELINE_STORAGE_KEY, JSON.stringify(timeline));
            } catch (error) {
                console.error('Error saving timeline:', error);
            }
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [timeline, isHydrated]);

    // ============================================================================
    // TIMELINE OPERATIONS
    // ============================================================================

    const addTimelineEntry = useCallback((entry: Omit<CaseTimelineEntry, 'entryId' | 'performedAt'>) => {
        const newEntry: CaseTimelineEntry = {
            ...entry,
            entryId: generateUUID(),
            performedAt: new Date().toISOString()
        };

        setTimeline(prev => [...prev, newEntry]);
    }, []);

    const getTimelineByCaseId = useCallback((caseId: string): CaseTimelineEntry[] => {
        return timeline
            .filter(e => e.caseId === caseId)
            .sort((a, b) => new Date(b.performedAt).getTime() - new Date(a.performedAt).getTime());
    }, [timeline]);

    // ============================================================================
    // UTILITY FUNCTIONS FOR COMMON ACTIONS
    // ============================================================================

    const logStatusChange = useCallback((
        caseId: string,
        oldStatus: ProcessStatus,
        newStatus: ProcessStatus,
        userId: string,
        userName: string
    ) => {
        addTimelineEntry({
            caseId,
            actionType: 'STATUS_CHANGED',
            action: `Status changed from ${oldStatus.replace(/_/g, ' ')} to ${newStatus.replace(/_/g, ' ')}`,
            performedBy: userId,
            performedByName: userName,
            metadata: { oldStatus, newStatus }
        });
    }, [addTimelineEntry]);

    const logAssignment = useCallback((
        caseId: string,
        userId: string,
        userName: string,
        assigneeId: string,
        assigneeName: string
    ) => {
        addTimelineEntry({
            caseId,
            actionType: 'ASSIGNED',
            action: `Case assigned to ${assigneeName}`,
            performedBy: userId,
            performedByName: userName,
            metadata: { assigneeId, assigneeName }
        });
    }, [addTimelineEntry]);

    const logDocumentAction = useCallback((
        caseId: string,
        action: TimelineActionType,
        documentType: string,
        userId: string,
        userName: string
    ) => {
        let actionDescription = '';
        switch (action) {
            case 'DOCUMENT_UPLOADED':
                actionDescription = `Uploaded document: ${documentType}`;
                break;
            case 'DOCUMENT_VERIFIED':
                actionDescription = `Verified document: ${documentType}`;
                break;
            case 'DOCUMENT_REJECTED':
                actionDescription = `Rejected document: ${documentType}`;
                break;
            default:
                actionDescription = `Document action: ${documentType}`;
        }

        addTimelineEntry({
            caseId,
            actionType: action,
            action: actionDescription,
            performedBy: userId,
            performedByName: userName,
            metadata: { documentType }
        });
    }, [addTimelineEntry]);

    // ============================================================================
    // CONTEXT VALUE
    // ============================================================================

    const contextValue: TimelineContextType = {
        addTimelineEntry,
        getTimelineByCaseId,
        logStatusChange,
        logAssignment,
        logDocumentAction
    };

    return (
        <TimelineContext.Provider value={contextValue}>
            {children}
        </TimelineContext.Provider>
    );
}

export function useTimeline() {
    const ctx = useContext(TimelineContext);
    if (!ctx) throw new Error('useTimeline must be used inside TimelineProvider');
    return ctx;
}
