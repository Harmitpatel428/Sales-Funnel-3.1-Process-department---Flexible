/**
 * WebSocket Event Deduplication
 * Prevents processing the same event multiple times due to reconnections or multi-path delivery
 */

const MAX_TRACKED_EVENTS = 1000;
const processedEvents = new Set<string>();
const eventQueue: string[] = [];

/**
 * Check if an event has already been processed
 */
export function isDuplicate(eventId: string): boolean {
    if (processedEvents.has(eventId)) {
        return true;
    }

    // Add to set and queue
    processedEvents.add(eventId);
    eventQueue.push(eventId);

    // Evict old events if limit reached
    if (eventQueue.length > MAX_TRACKED_EVENTS) {
        const oldestId = eventQueue.shift();
        if (oldestId) {
            processedEvents.delete(oldestId);
        }
    }

    return false;
}

/**
 * Reset de-duplication (useful for testing or full re-syncs)
 */
export function resetDeduplication(): void {
    processedEvents.clear();
    eventQueue.length = 0;
}
