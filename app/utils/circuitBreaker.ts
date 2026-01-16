/**
 * Circuit Breaker Utilities
 * Implements resiliency pattern to prevent cascading failures.
 */

import { ClassifiedError } from './errorHandling';

// Circuit State
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerConfig {
    failureThreshold: number;
    successThreshold: number;
    timeout: number;
    halfOpenRequests: number;
    resetTimeout?: number;
}

interface CircuitMetrics {
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
    state: CircuitState;
}

// Default Configuration
const DEFAULT_CONFIG: CircuitBreakerConfig = {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000, // 60s
    halfOpenRequests: 3
};

// Store circuit states in memory
const circuits = new Map<string, CircuitMetrics>();
const listeners: ((endpoint: string, state: CircuitState) => void)[] = [];

/**
 * Get the current state of a circuit
 */
export function getCircuitState(endpoint: string): CircuitMetrics {
    if (!circuits.has(endpoint)) {
        circuits.set(endpoint, {
            failureCount: 0,
            successCount: 0,
            lastFailureTime: 0,
            state: 'CLOSED'
        });
    }
    return circuits.get(endpoint)!;
}

/**
 * Error thrown when circuit is open
 */
export class CircuitOpenError extends Error {
    constructor(message: string = 'Circuit breaker open') {
        super(message);
        this.name = 'CircuitOpenError';
        (this as any).code = 'CIRCUIT_OPEN';
    }
}

/**
 * Subscribe to circuit state changes
 */
export function onCircuitStateChange(callback: (endpoint: string, state: CircuitState) => void) {
    listeners.push(callback);
    return () => {
        const index = listeners.indexOf(callback);
        if (index > -1) listeners.splice(index, 1);
    };
}

function notifyListeners(endpoint: string, state: CircuitState) {
    listeners.forEach(cb => cb(endpoint, state));
}

/**
 * Execute an operation with circuit breaker protection
 */
export async function executeWithCircuitBreaker<T>(
    endpoint: string,
    operation: () => Promise<T>,
    config: CircuitBreakerConfig = DEFAULT_CONFIG
): Promise<T> {
    const circuit = getCircuitState(endpoint);

    // Check if circuit is OPEN
    if (circuit.state === 'OPEN') {
        const now = Date.now();
        if (now - circuit.lastFailureTime > config.timeout) {
            // Setup HALF_OPEN state
            circuit.state = 'HALF_OPEN';
            circuit.successCount = 0; // Reset success count for verification
            notifyListeners(endpoint, 'HALF_OPEN');
        } else {
            throw new CircuitOpenError(`Service ${endpoint} is currently unavailable.`);
        }
    }

    try {
        const result = await operation();

        // Success handling
        if (circuit.state === 'HALF_OPEN') {
            circuit.successCount++;
            if (circuit.successCount >= config.successThreshold) {
                resetCircuit(endpoint);
            }
        } else if (circuit.state === 'CLOSED') {
            // Reset failure count on success if we want to degrade gracefully? 
            // Usually we only reset failure count if it was > 0, or maybe we leave it until threshold?
            // A common pattern is to reset failure count on success.
            if (circuit.failureCount > 0) {
                circuit.failureCount = 0;
            }
        }

        return result;
    } catch (error) {
        // Failure handling
        circuit.lastFailureTime = Date.now();

        // Determine if error should trip the circuit (e.g. 500s trip, 400s don't)
        // We assume caller handles specific logic, but generically:
        circuit.failureCount++;

        if (circuit.state === 'HALF_OPEN') {
            // If failed in HALF_OPEN, go back to OPEN immediately
            circuit.state = 'OPEN';
            notifyListeners(endpoint, 'OPEN');
        } else if (circuit.state === 'CLOSED') {
            if (circuit.failureCount >= config.failureThreshold) {
                circuit.state = 'OPEN';
                notifyListeners(endpoint, 'OPEN');
            }
        }

        throw error;
    }
}

/**
 * Reset a circuit manually or automatically
 */
export function resetCircuit(endpoint: string) {
    const circuit = getCircuitState(endpoint);
    circuit.state = 'CLOSED';
    circuit.failureCount = 0;
    circuit.successCount = 0;
    circuit.lastFailureTime = 0;
    notifyListeners(endpoint, 'CLOSED');
}

/**
 * Get all circuit statuses (for monitoring)
 */
export function getAllCircuits(): Record<string, CircuitMetrics> {
    return Object.fromEntries(circuits.entries());
}
