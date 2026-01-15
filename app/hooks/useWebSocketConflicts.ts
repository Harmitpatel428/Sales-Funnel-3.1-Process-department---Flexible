'use client';

import { useState, useEffect, useCallback } from 'react';
import { ConflictState, ConflictResolution, applyResolution } from '../utils/optimistic';
import { useQueryClient } from '@tanstack/react-query';
import { leadKeys } from './queries/useLeadsQuery';
import { caseKeys } from './queries/useCasesQuery';
import { documentKeys } from './queries/useDocumentsQuery';

export function useWebSocketConflicts(filter?: (conflict: ConflictState) => boolean) {
    const [conflictState, setConflictState] = useState<ConflictState | null>(null);
    const queryClient = useQueryClient();

    useEffect(() => {
        const handleConflict = (event: CustomEvent<ConflictState>) => {
            if (!filter || filter(event.detail)) {
                setConflictState(event.detail);
            }
        };

        window.addEventListener('app-conflict', handleConflict as EventListener);
        return () => window.removeEventListener('app-conflict', handleConflict as EventListener);
    }, [filter]);

    const invalidateQueriesForConflict = useCallback((conflict: ConflictState) => {
        const { entityType, optimistic } = conflict;
        switch (entityType) {
            case 'lead':
                queryClient.invalidateQueries({ queryKey: leadKeys.detail(optimistic.id) });
                queryClient.invalidateQueries({ queryKey: leadKeys.lists() });
                break;
            case 'case':
                queryClient.invalidateQueries({ queryKey: caseKeys.detail(optimistic.caseId) });
                queryClient.invalidateQueries({ queryKey: caseKeys.lists() });
                break;
            case 'document':
                const docId = optimistic.id || optimistic.documentId;
                if (docId) {
                    queryClient.invalidateQueries({ queryKey: documentKeys.lists() }); // And maybe detail if it exists
                    // documentKeys might need detail? assuming lists covers it for now based on context
                }
                break;
        }
    }, [queryClient]);

    const resolveConflict = useCallback(async (resolution: ConflictResolution) => {
        if (!conflictState) return;

        const resolvedEntity = applyResolution(resolution, conflictState);
        const { entityType, optimistic } = conflictState;

        // Update cache with resolved entity
        switch (entityType) {
            case 'lead':
                queryClient.setQueryData(leadKeys.detail(optimistic.id), { success: true, data: resolvedEntity });
                break;
            case 'case':
                queryClient.setQueryData(caseKeys.detail(optimistic.caseId), { success: true, data: resolvedEntity });
                break;
        }

        // Invalidate to ensure consistency
        invalidateQueriesForConflict(conflictState);

        setConflictState(null);
    }, [conflictState, queryClient, invalidateQueriesForConflict]);

    const cancelConflict = useCallback(() => {
        if (conflictState) {
            // On cancel, we should invalidate to fetch the latest server state and discard our optimistic update
            invalidateQueriesForConflict(conflictState);
        }
        setConflictState(null);
    }, [conflictState, invalidateQueriesForConflict]);

    return {
        conflictState,
        resolveConflict,
        cancelConflict
    };
}
