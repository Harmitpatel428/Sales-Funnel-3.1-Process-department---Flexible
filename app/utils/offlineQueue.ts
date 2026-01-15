/**
 * Offline Queue Utility
 * 
 * Captures failed mutations when offline and retries them when connection is restored.
 * This provides a seamless offline experience for CRM operations.
 */

// Storage key for the offline queue
const OFFLINE_QUEUE_KEY = 'offlineQueue';
const FAILED_QUEUE_KEY = 'failedQueue';
const MAX_RETRY_COUNT = 5;

// Mutation types
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
    | 'UPLOAD_DOCUMENT'
    | 'UPDATE_DOCUMENT'
    | 'DELETE_DOCUMENT'
    | 'VERIFY_DOCUMENT'
    | 'REJECT_DOCUMENT';

// Queue item interface
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
}

// Event callbacks
type QueueEventCallback = (item: OfflineQueueItem) => void;
type QueueProcessCallback = (results: { success: OfflineQueueItem[]; failed: OfflineQueueItem[] }) => void;

let onItemAddedCallback: QueueEventCallback | null = null;
let onItemProcessedCallback: QueueEventCallback | null = null;
let onQueueProcessedCallback: QueueProcessCallback | null = null;

/**
 * Generate unique ID for queue items
 */
function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get the offline queue from localStorage
 */
export function getQueue(): OfflineQueueItem[] {
    if (typeof window === 'undefined') return [];

    try {
        const stored = localStorage.getItem(OFFLINE_QUEUE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

/**
 * Get the failed queue (items that exceeded retry limit)
 */
export function getFailedQueue(): OfflineQueueItem[] {
    if (typeof window === 'undefined') return [];

    try {
        const stored = localStorage.getItem(FAILED_QUEUE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

/**
 * Save queue to localStorage
 */
function saveQueue(queue: OfflineQueueItem[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Save failed queue to localStorage
 */
function saveFailedQueue(queue: OfflineQueueItem[]): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(FAILED_QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Add a failed mutation to the offline queue
 */
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

    if (onItemAddedCallback) {
        onItemAddedCallback(newItem);
    }
}

/**
 * Remove an item from the queue
 */
export function removeFromQueue(id: string): void {
    const queue = getQueue();
    const filtered = queue.filter((item) => item.id !== id);
    saveQueue(filtered);
}

/**
 * Move item to failed queue
 */
function moveToFailedQueue(item: OfflineQueueItem): void {
    removeFromQueue(item.id);

    const failedQueue = getFailedQueue();
    failedQueue.push(item);
    saveFailedQueue(failedQueue);
}

/**
 * Process a single queue item
 */
async function processItem(item: OfflineQueueItem): Promise<boolean> {
    try {
        const isFormData = item.type === 'UPLOAD_DOCUMENT';

        const response = await fetch(item.endpoint, {
            method: item.method,
            headers: isFormData ? undefined : { 'Content-Type': 'application/json' },
            body: isFormData ? item.payload : JSON.stringify(item.payload),
        });

        if (response.status === 409) {
            const errorData = await response.json();
            const serverEntity = errorData?.details?.currentEntity;

            if (serverEntity && item.lastKnownGood) {
                // Trigger conflict resolution flow
                window.dispatchEvent(new CustomEvent('app-conflict', {
                    detail: {
                        entityType: item.type.split('_')[1].toLowerCase(),
                        conflicts: [], // Will be detected by reconciliation
                        optimistic: item.payload,
                        server: serverEntity,
                        base: item.lastKnownGood,
                    }
                }));
            }
            return false;
        }

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        return true;
    } catch (error) {
        console.error(`Failed to process queue item ${item.id}:`, error);
        return false;
    }
}

/**
 * Process all items in the offline queue
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

    if (queue.length === 0) {
        return results;
    }

    // Process items in order (FIFO)
    for (const item of queue) {
        const success = await processItem(item);

        if (success) {
            removeFromQueue(item.id);
            results.success.push(item);

            if (onItemProcessedCallback) {
                onItemProcessedCallback(item);
            }
        } else {
            // Increment retry count
            const updatedItem = { ...item, retryCount: item.retryCount + 1 };

            if (updatedItem.retryCount > MAX_RETRY_COUNT) {
                // Move to failed queue
                moveToFailedQueue(updatedItem);
                results.failed.push(updatedItem);
            } else {
                // Update in queue for next retry
                const currentQueue = getQueue();
                const updatedQueue = currentQueue.map((q) =>
                    q.id === item.id ? updatedItem : q
                );
                saveQueue(updatedQueue);
                results.pending.push(updatedItem);
            }
        }
    }

    if (onQueueProcessedCallback) {
        onQueueProcessedCallback({ success: results.success, failed: results.failed });
    }

    return results;
}

/**
 * Clear all items from the queue
 */
export function clearQueue(): void {
    saveQueue([]);
}

/**
 * Clear failed queue
 */
export function clearFailedQueue(): void {
    saveFailedQueue([]);
}

/**
 * Retry a specific failed item
 */
export async function retryFailedItem(id: string): Promise<boolean> {
    const failedQueue = getFailedQueue();
    const item = failedQueue.find((i) => i.id === id);

    if (!item) return false;

    // Reset retry count and move back to main queue
    const updatedItem = { ...item, retryCount: 0, timestamp: Date.now() };

    // Remove from failed queue
    saveFailedQueue(failedQueue.filter((i) => i.id !== id));

    // Add to main queue
    const queue = getQueue();
    queue.push(updatedItem);
    saveQueue(queue);

    // Try to process immediately
    const success = await processItem(updatedItem);

    if (success) {
        removeFromQueue(updatedItem.id);
        return true;
    }

    return false;
}

/**
 * Get queue statistics
 */
export function getQueueStats(): {
    pendingCount: number;
    failedCount: number;
    oldestTimestamp: number | null;
} {
    const queue = getQueue();
    const failedQueue = getFailedQueue();

    return {
        pendingCount: queue.length,
        failedCount: failedQueue.length,
        oldestTimestamp: queue.length > 0 ? Math.min(...queue.map((i) => i.timestamp)) : null,
    };
}

/**
 * Check if offline queue has pending items
 */
export function hasPendingItems(): boolean {
    return getQueue().length > 0;
}

/**
 * Set up event listeners for queue events
 */
export function setQueueCallbacks(callbacks: {
    onItemAdded?: QueueEventCallback;
    onItemProcessed?: QueueEventCallback;
    onQueueProcessed?: QueueProcessCallback;
}): void {
    onItemAddedCallback = callbacks.onItemAdded || null;
    onItemProcessedCallback = callbacks.onItemProcessed || null;
    onQueueProcessedCallback = callbacks.onQueueProcessed || null;
}

/**
 * Initialize online/offline event listeners
 * Call this in app initialization to auto-process queue on reconnect
 */
export function initializeOfflineQueueListeners(
    onOnline?: () => void,
    onOffline?: () => void
): () => void {
    if (typeof window === 'undefined') return () => { };

    const handleOnline = async () => {
        console.log('[OfflineQueue] Connection restored, processing queue...');
        const results = await processQueue();
        console.log('[OfflineQueue] Queue processed:', results);
        onOnline?.();
    };

    const handleOffline = () => {
        console.log('[OfflineQueue] Connection lost');
        onOffline?.();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Return cleanup function
    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
}

/**
 * Check if browser is currently online
 */
export function isOnline(): boolean {
    if (typeof window === 'undefined') return true;
    return navigator.onLine;
}
