/**
 * Error Telemetry System
 * Captures, stores, and reports errors with context.
 */

import { openDB, DBSchema } from 'idb';
import { classifyError, ClassifiedError, ErrorContext, generateErrorFingerprint } from './errorHandling';

interface TelemetryDB extends DBSchema {
    errors: {
        key: number;
        value: TelemetryEvent;
        indexes: { 'by-timestamp': number };
    };
}

export interface TelemetryEvent {
    id?: number;
    error: ClassifiedError;
    timestamp: number;
    synced: boolean;
}

const DB_NAME = 'error-telemetry';
const STORE_NAME = 'errors';
const MAX_STORED_ERRORS = 500;

// Initialize DB
const dbPromise = typeof window !== 'undefined'
    ? openDB<TelemetryDB>(DB_NAME, 1, {
        upgrade(db) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            store.createIndex('by-timestamp', 'timestamp');
        },
    }).catch(() => null) // Handle any DB init errors gracefully
    : Promise.resolve(null); // Return null on SSR instead of rejecting

/**
 * Capture an error with context
 */
export async function captureError(error: unknown, context?: Partial<ErrorContext>) {
    try {
        if (typeof window === 'undefined') return; // Client-side only

        const classifiedFn = classifyError(error, context);

        // Sampling for high volume errors (simple implementation)
        // ideally strict Rate Limiting per fingerprint, here we rely on caller or future enhancement

        const event: TelemetryEvent = {
            error: classifiedFn,
            timestamp: Date.now(),
            synced: false
        };

        const db = await dbPromise;
        if (!db) return; // No DB available
        await db.add(STORE_NAME, event);

        // Prune old errors
        const count = await db.count(STORE_NAME);
        if (count > MAX_STORED_ERRORS) {
            // Delete oldest
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const index = store.index('by-timestamp');
            const cursor = await index.openCursor(null, 'next');
            if (cursor) {
                await cursor.delete();
            }
            await tx.done;
        }

        // Attempt sync to server (fire and forget)
        syncErrors();

    } catch (e) {
        console.error('Failed to capture telemetry', e);
    }
}

/**
 * Sync unsynced errors to server
 */
async function syncErrors() {
    try {
        const db = await dbPromise;
        if (!db) return; // No DB available
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        const allEvents = await store.getAll();
        const unsynced = allEvents.filter(e => !e.synced);

        if (unsynced.length === 0) return;

        // Batch send
        const batch = unsynced.slice(0, 10); // Send 10 at a time

        // Use fetch directly to avoid circular dependency with apiClient if it uses telemetry
        const response = await fetch('/api/telemetry/errors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ errors: batch })
        });

        if (response.ok) {
            // Mark as synced
            for (const event of batch) {
                if (event.id) {
                    event.synced = true;
                    await store.put(event);
                }
            }
        }

        await tx.done;

    } catch (e) {
        // Silent fail on sync
    }
}

/**
 * Get error statistics
 */
export async function getErrorStats() {
    try {
        const db = await dbPromise;
        if (!db) return { total: 0, byType: {}, byFingerprint: {} }; // No DB available
        const events = await db.getAll(STORE_NAME);

        const total = events.length;
        const byType: Record<string, number> = {};
        const byFingerprint: Record<string, number> = {};

        events.forEach(e => {
            const type = e.error.type;
            byType[type] = (byType[type] || 0) + 1;

            const fp = e.error.fingerprint;
            byFingerprint[fp] = (byFingerprint[fp] || 0) + 1;
        });

        return { total, byType, byFingerprint };
    } catch {
        return { total: 0, byType: {}, byFingerprint: {} };
    }
}

/**
 * Export error report
 */
export async function exportErrorReport() {
    try {
        const db = await dbPromise;
        if (!db) return '[]'; // No DB available
        const events = await db.getAll(STORE_NAME);
        return JSON.stringify(events, null, 2);
    } catch {
        return '[]';
    }
}
