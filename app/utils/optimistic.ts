/**
 * Utilities for version-aware optimistic updates and conflict reconciliation.
 */

export interface FieldConflict {
    field: string;
    optimisticValue: any;
    serverValue: any;
    baseValue: any;
    isImportant: boolean;
}

export interface ReconciliationResult<T> {
    status: 'success' | 'conflict';
    entity?: T;
    conflicts?: FieldConflict[];
    optimistic?: T;
    server?: T;
    base?: T;
}

export type ConflictResolution =
    | { strategy: 'keep-optimistic' }
    | { strategy: 'accept-server' }
    | { strategy: 'manual', fieldSelections: Record<string, 'optimistic' | 'server'> };

export interface ConflictState {
    entityType: 'lead' | 'case' | 'document';
    conflicts: FieldConflict[];
    optimistic: any;
    server: any;
    base: any;
}

/**
 * Merges updates into entity and increments version number for optimistic display.
 */
export function createOptimisticUpdate<T extends { version: number; updatedAt?: string | Date }>(
    entity: T,
    updates: Partial<T>
): T {
    return {
        ...entity,
        ...updates,
        version: entity.version + 1,
        updatedAt: new Date().toISOString(),
    };
}

/**
 * Restores entity to previous state.
 */
export function rollbackOptimisticUpdate<T>(previousState: T): T {
    return previousState;
}

/**
 * Implements three-way merge algorithm to detect conflicts.
 */
export function reconcileWithServer<T extends { version: number }>(
    optimisticEntity: T,
    serverEntity: T,
    lastKnownGood: T,
    importantFields: string[] = []
): ReconciliationResult<T> {
    // If versions match, it's a clean success
    if (optimisticEntity.version === serverEntity.version) {
        return { status: 'success', entity: serverEntity };
    }

    // If versions differ, check for functional conflicts
    const conflicts = detectFieldConflicts(optimisticEntity, serverEntity, lastKnownGood, importantFields);

    if (conflicts.length === 0) {
        // No conflicting changes in the same fields, auto-merge (last write wins on the object level, 
        // but here we just return success if no specific fields conflicted based on our rules)
        return { status: 'success', entity: serverEntity };
    }

    return {
        status: 'conflict',
        conflicts,
        optimistic: optimisticEntity,
        server: serverEntity,
        base: lastKnownGood,
    };
}

/**
 * Compares each field across three versions to identify conflicts.
 */
export function detectFieldConflicts<T>(
    optimistic: T,
    server: T,
    base: T,
    importantFields: string[]
): FieldConflict[] {
    const conflicts: FieldConflict[] = [];
    const keys = new Set([
        ...Object.keys(optimistic as any),
        ...Object.keys(server as any)
    ]);

    for (const key of keys) {
        // Skip metadata fields
        if (['version', 'updatedAt', 'createdAt'].includes(key)) continue;

        const optVal = (optimistic as any)[key];
        const srvVal = (server as any)[key];
        const baseVal = (base as any)[key];

        const optChanged = JSON.stringify(optVal) !== JSON.stringify(baseVal);
        const srvChanged = JSON.stringify(srvVal) !== JSON.stringify(baseVal);

        // Conflict exists if both changed and values are different
        if (optChanged && srvChanged && JSON.stringify(optVal) !== JSON.stringify(srvVal)) {
            conflicts.push({
                field: key,
                optimisticValue: optVal,
                serverValue: srvVal,
                baseValue: baseVal,
                isImportant: importantFields.includes(key)
            });
        }
    }

    return conflicts;
}

/**
 * Applies user's resolution choice to produce a final entity for submission.
 */
export function applyResolution<T extends { version: number }>(
    resolution: ConflictResolution,
    conflictState: ConflictState
): T {
    const { strategy } = resolution;
    const { optimistic, server, base } = conflictState;

    if (strategy === 'keep-optimistic') {
        return { ...optimistic, version: server.version };
    }

    if (strategy === 'accept-server') {
        return server;
    }

    if (strategy === 'manual') {
        const resolved = { ...server };
        const { fieldSelections } = resolution;

        for (const [field, selection] of Object.entries(fieldSelections)) {
            if (selection === 'optimistic') {
                resolved[field] = optimistic[field];
            }
        }

        return resolved;
    }

    return server;
}

/**
 * Maps technical field names to user-friendly labels.
 */
export function getFieldLabel(entityType: string, fieldName: string): string {
    const labels: Record<string, Record<string, string>> = {
        lead: {
            status: 'Status',
            assignedToId: 'Assigned To',
            isDone: 'Marked Done',
            convertedToCaseId: 'Converted to Case',
            clientName: 'Client Name',
            mobileNumber: 'Mobile Number',
            company: 'Company',
        },
        case: {
            processStatus: 'Process Status',
            assignedProcessUserId: 'Assigned Specialist',
            closedAt: 'Closed Date',
            priority: 'Priority',
        },
        document: {
            status: 'Verification Status',
            verifiedById: 'Verified By',
            rejectionReason: 'Rejection Reason',
        }
    };

    return labels[entityType]?.[fieldName] || fieldName;
}

/**
 * Formats field values for display in conflict modal.
 */
export function formatFieldValue(value: any, fieldName: string): string {
    if (value === null || value === undefined) return 'None';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';

    // Date detection
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
        try {
            return new Date(value).toLocaleString();
        } catch {
            return value;
        }
    }

    if (Array.isArray(value)) {
        return `${value.length} items`;
    }

    if (typeof value === 'object') {
        return JSON.stringify(value);
    }

    return String(value);
}
