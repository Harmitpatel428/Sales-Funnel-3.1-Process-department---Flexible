/**
 * Enhanced Offline Queue
 * Handles failed mutations with resilience patterns.
 */

import { executeWithCircuitBreaker } from './circuitBreaker';

const OFFLINE_QUEUE_KEY = 'offlineQueue';
const FAILED_QUEUE_KEY = 'failedQueue';
const MAX_RETRY_COUNT = 5;
const BATCH_SIZE = 5;

export type MutationType =
    | 'CREATE_LEAD'
    | 'UPDATE_LEAD'
    | 'DELETE_LEAD'
    | 'ASSIGN_LEAD'
    | 'FORWARD_LEAD'
    | 'CREATE_CASE'
    | 'UPDATE_CASE'
    | 'DELETE_CASE'
    | 'UPDATE_CASE_STATUS'
    | 'ASSIGN_CASE'
    | 'BULK_ASSIGN_CASES'
    | 'UPLOAD_DOCUMENT'
    | 'UPDATE_DOCUMENT'
    | 'DELETE_DOCUMENT'
    | 'VERIFY_DOCUMENT'
    | 'REJECT_DOCUMENT';

export interface OfflineQueueItem {
    id: string;
    type: MutationType;
    payload: any;
    timestamp: number;
    retryCount: number;
    endpoint: string;
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    version?: number;
    lastKnownGood?: any;
    lastAttemptTimestamp?: number;
}

type QueueEventCallback = (item: OfflineQueueItem) => void;
type QueueProcessCallback = (results: { success: OfflineQueueItem[]; failed: OfflineQueueItem[] }) => void;

const onItemAddedCallback: QueueEventCallback | null = null;
const onItemProcessedCallback: QueueEventCallback | null = null;
const onQueueProcessedCallback: QueueProcessCallback | null = null;

function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function getQueue(): OfflineQueueItem[] {
    if (typeof window === 'undefined') return [];
    try {
        const stored = localStorage.getItem(OFFLINE_QUEUE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

export function hasPendingItems(): boolean {
    return getQueue().length > 0;
}

export function getFailedQueue(): OfflineQueueItem[] {
    if (typeof window === 'undefined') return [];
    try {
        const stored = localStorage.getItem(FAILED_QUEUE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

function saveQueue(queue: OfflineQueueItem[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

function saveFailedQueue(queue: OfflineQueueItem[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(FAILED_QUEUE_KEY, JSON.stringify(queue));
}

export function addToQueue(item: Omit<OfflineQueueItem, 'id' | 'timestamp' | 'retryCount'>): void {
    const queue = getQueue();
    const newItem: OfflineQueueItem = {
        ...item,
        id: generateId(),
        timestamp: Date.now(),
        retryCount: 0,
    };
    queue.push(newItem);
    saveQueue(queue);

    // Emit event
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('queue-item-added', { detail: newItem }));
    }

    if (onItemAddedCallback) onItemAddedCallback(newItem);
}

export function removeFromQueue(id: string): void {
    const queue = getQueue();
    const filtered = queue.filter((item) => item.id !== id);
    saveQueue(filtered);
}

function moveToFailedQueue(item: OfflineQueueItem): void {
    removeFromQueue(item.id);
    const failedQueue = getFailedQueue();
    failedQueue.push(item);
    saveFailedQueue(failedQueue);
}

// Calculate backoff delay
function getBackoffDelay(retryCount: number): number {
    return Math.min(1000 * Math.pow(2, retryCount), 60000);
}

/**
 * Process a single item with Circuit Breaker
 */
async function processItem(item: OfflineQueueItem): Promise<boolean> {
    try {
        const isFormData = item.type === 'UPLOAD_DOCUMENT';

        // Check backoff
        if (item.lastAttemptTimestamp) {
            const delay = getBackoffDelay(item.retryCount);
            if (Date.now() - item.lastAttemptTimestamp < delay) {
                return false; // Not ready to retry yet
            }
        }

        // Use circuit breaker
        await executeWithCircuitBreaker(
            item.endpoint.split('?')[0], // Use base endpoint
            async () => {
                const response = await fetch(item.endpoint, {
                    method: item.method,
                    headers: isFormData ? undefined : { 'Content-Type': 'application/json' },
                    body: isFormData ? item.payload : JSON.stringify(item.payload),
                });

                if (response.status === 409) {
                    const errorData = await response.json();
                    const serverEntity = errorData?.details?.currentEntity;

                    if (serverEntity && item.lastKnownGood) {
                        // Trigger conflict resolution
                        window.dispatchEvent(new CustomEvent('app-conflict', {
                            detail: {
                                entityType: item.type.split('_')[1].toLowerCase(),
                                conflicts: [],
                                optimistic: item.payload,
                                server: serverEntity,
                                base: item.lastKnownGood,
                            }
                        }));
                    }
                    // Conflicts shouldn't retry automatically in standard flow, 
                    // or maybe we loop until user resolves?
                    // Here we likely fail it so user can resolve.
                    throw new Error('CONFLICT');
                }

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                return true;
            }
        );

        return true;
    } catch (error) {
        console.error(`Failed to process queue item ${item.id}`, error);

        // Special case for Conflict: fail permanently/move to failed queue?
        if ((error as Error).message === 'CONFLICT') {
            // Let caller logic handle moving to failed
            return false;
        }

        return false;
    }
}

/**
 * Process queue with batching
 */
export async function processQueue(): Promise<{
    success: OfflineQueueItem[];
    failed: OfflineQueueItem[];
    pending: OfflineQueueItem[];
}> {
    const queue = getQueue();
    const results = {
        success: [] as OfflineQueueItem[],
        failed: [] as OfflineQueueItem[],
        pending: [] as OfflineQueueItem[],
    };

    if (queue.length === 0) return results;

    // Process in batches
    // We only take items that are ready (backoff)
    const now = Date.now();
    const readyItems = queue.filter(item => {
        if (!item.lastAttemptTimestamp) return true;
        return (now - item.lastAttemptTimestamp) >= getBackoffDelay(item.retryCount);
    });

    const itemsToProcess = readyItems.slice(0, BATCH_SIZE); // Concurrent limit

    // If no items ready, we just return current state
    if (itemsToProcess.length === 0 && queue.length > 0) {
        results.pending = queue;
        return results;
    }

    const processedResults = await Promise.all(itemsToProcess.map(async (item) => {
        const success = await processItem(item);
        return { item, success };
    }));

    for (const res of processedResults) {
        const { item, success } = res;

        if (success) {
            removeFromQueue(item.id);
            results.success.push(item);
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('queue-item-processed', { detail: item }));
            }
            if (onItemProcessedCallback) onItemProcessedCallback(item);
        } else {
            // Update retry count and timestamp
            const updatedItem = {
                ...item,
                retryCount: item.retryCount + 1,
                lastAttemptTimestamp: Date.now()
            };

            if (updatedItem.retryCount > MAX_RETRY_COUNT) {
                moveToFailedQueue(updatedItem);
                results.failed.push(updatedItem);
            } else {
                // Update in place
                const currentQueue = getQueue();
                const newQueue = currentQueue.map(q => q.id === item.id ? updatedItem : q);
                saveQueue(newQueue);
                results.pending.push(updatedItem);
            }
        }
    }

    if (queue.length > itemsToProcess.length) {
        // There are more items, recursive scheduling? 
        // Or rely on next trigger (e.g. interval or event)
        // For now just return partial results of this batch
    }

    if (itemsToProcess.length > 0 && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('queue-processing-complete', { detail: results }));
    }

    if (onQueueProcessedCallback && itemsToProcess.length > 0) {
        onQueueProcessedCallback({ success: results.success, failed: results.failed });
    }

    return results;
}

// ... Keep existing exports like clearQueue, setQueueCallbacks etc ...
export function clearQueue(): void { saveQueue([]); }
export function clearFailedQueue(): void { saveFailedQueue([]); }

export function retryFailedItem(id: string): void {
    // Logic to move from failed to main (reset counts)
    const failed = getFailedQueue();
    const item = failed.find(i => i.id === id);
    if (item) {
        const newItem = { ...item, retryCount: 0, lastAttemptTimestamp: 0 };
        saveFailedQueue(failed.filter(i => i.id !== id));
        addToQueue(newItem); // This adds to main queue
    }
}

export function initializeOfflineQueueListeners(onOnline?: () => void, onOffline?: () => void): () => void {
    if (typeof window === 'undefined') return () => { };
    const handleOnline = () => { processQueue(); onOnline?.(); };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
}

export function isOnline(): boolean {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
}
