/**
 * Centralized Error Handling Pipeline
 * Orchestrates classification, logging, telemetry, and user notification.
 */

import { classifyError, ClassifiedError, ErrorContext } from './errorHandling';
import { captureError } from './errorTelemetry';
import { showErrorNotification } from '../components/ErrorNotification';
import { triggerErrorRecovery } from '../components/ErrorRecoveryPanel';
import { getRecoveryActions, RecoveryAction } from '@/lib/middleware/error-handler';
import { retryFailedItem } from './offlineQueue';

// Deduplication
const processingErrors = new Set<string>();

export async function handleError(error: unknown, context?: Partial<ErrorContext> & { silent?: boolean }) {
    try {
        // 1. Classify
        const classified = classifyError(error, context);

        // 2. Deduplicate logic (debounce same errors)
        const fingerprint = classified.fingerprint;
        if (processingErrors.has(fingerprint)) {
            // Already processing this error recently
            return;
        }
        processingErrors.add(fingerprint);
        setTimeout(() => processingErrors.delete(fingerprint), 5000); // 5s debounce

        // 3. Telemetry
        await captureError(error, context);

        // 4. Log to console
        console.error(`[Pipeline] ${classified.type}: ${classified.message}`, error);

        if (context?.silent) return;

        // 5. User Notification Strategy
        const possibleActions = getRecoveryActions(classified);

        // Critical / Complex errors -> Recovery Modal
        if ((classified.type === 'CONFLICT' || classified.type === 'AUTH') && !classified.isRetryable) {
            triggerErrorRecovery({
                error: classified,
                title: classified.type === 'CONFLICT' ? 'Data Conflict' : 'Authentication Error',
                options: possibleActions.map(a => convertActionToOption(a, classified))
            });
            return;
        }

        // Standard errors -> Notification Toast
        const primaryAction = possibleActions.find(a => a.isPrimary);

        showErrorNotification({
            error: classified,
            title: getTitleForError(classified),
            message: classified.message,
            duration: classified.severity === 'CRITICAL' ? 0 : 8000, // Persistent if critical
            actions: primaryAction ? [{
                label: primaryAction.label,
                action: () => executeRecoveryAction(primaryAction, context),
                variant: 'primary'
            }] : undefined
        });

    } catch (pipelineError) {
        console.error('Error pipeline failed:', pipelineError);
        // Fallback alert
        alert('An unexpected error occurred.');
    }
}

function getTitleForError(error: ClassifiedError): string {
    switch (error.type) {
        case 'NETWORK': return 'Connection Error';
        case 'TIMEOUT': return 'Request Timeout';
        case 'VALIDATION': return 'Validation Failed';
        case 'SERVER': return 'Server Error';
        case 'AUTH': return 'Session Expired';
        case 'CIRCUIT_OPEN': return 'Service Unavailable';
        default: return 'Error';
    }
}

function convertActionToOption(action: RecoveryAction, error: ClassifiedError) {
    return {
        label: action.label,
        variant: (action.action === 'DISCARD' ? 'danger' : 'primary') as any, // Cast to match UI type
        action: async () => executeRecoveryAction(action)
    };
}

async function executeRecoveryAction(action: RecoveryAction, context?: any) {
    switch (action.action) {
        case 'RETRY':
            // Logic to retry logic (depends on context, e.g. refetch query)
            if (context?.retryFn) {
                await context.retryFn();
            } else {
                window.location.reload();
            }
            break;
        case 'DISCARD':
            if (confirm('Are you sure you want to discard your changes? This action cannot be undone.')) {
                window.location.reload();
            }
            break;
        case 'SAVE_LATER':
            if (context?.requestPayload && context?.endpoint) {
                const { addToQueue } = await import('./offlineQueue');
                addToQueue({
                    type: 'UPDATE_LEAD', // Fallback type, ideally should be dynamic or generic
                    payload: context.requestPayload,
                    endpoint: context.endpoint,
                    method: context.method || 'POST'
                } as any);
                alert('Changes saved to offline queue. They will be synced when connection is restored.');
            } else {
                alert('Unable to save changes: missing request context.');
            }
            break;
        case 'LOGIN':
            window.location.href = '/login';
            break;
        case 'CONTACT_SUPPORT':
            // Open support modal or mailto
            window.open('mailto:support@example.com');
            break;
        default:
            break;
    }
}
