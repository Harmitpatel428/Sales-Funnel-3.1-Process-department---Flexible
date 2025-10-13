/**
 * Centralized notification helper module for storage-related user feedback.
 * 
 * This module provides a centralized way to display toast notifications
 * for storage operations, avoiding the need to duplicate toast state
 * management in every context that uses storage.
 * 
 * Usage:
 * 1. Register a toast callback with storageNotifications.register()
 * 2. Use notification methods to display messages
 * 3. Unregister callback when component unmounts
 */

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export type NotificationCallback = (message: string, type: NotificationType) => void;

/**
 * StorageNotificationManager class for managing storage-related notifications.
 * Provides methods for different types of storage events and errors.
 */
export class StorageNotificationManager {
  private callbacks = new Set<NotificationCallback>();

  /**
   * Register a notification callback.
   * Returns an unregister function to remove the callback.
   */
  register(callback: NotificationCallback): () => void {
    this.callbacks.add(callback);
    
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Send a notification to all registered callbacks.
   */
  notify(message: string, type: NotificationType): void {
    this.callbacks.forEach(callback => {
      try {
        callback(message, type);
      } catch (error) {
        console.error('Notification callback error:', error);
      }
    });
  }

  /**
   * Notify about quota exceeded error.
   * Formats message with key and size information.
   */
  notifyQuotaExceeded(key: string, size: number): void {
    const sizeMB = (size / 1024 / 1024).toFixed(2);
    const message = `Storage limit exceeded! Cannot save ${key}. Current size: ${sizeMB}MB. Please export your data and clear old records.`;
    this.notify(message, 'error');
  }

  /**
   * Notify about quota warning when approaching storage limit.
   * Formats message with percentage information.
   */
  notifyQuotaWarning(percentUsed: number): void {
    const percent = Math.round(percentUsed * 100);
    const message = `Storage usage at ${percent}%! Consider exporting and archiving old data to prevent data loss.`;
    this.notify(message, 'warning');
  }

  /**
   * Notify about generic storage errors.
   * Formats message with operation and error details.
   */
  notifyStorageError(operation: string, error: Error): void {
    const message = `Failed to ${operation}: ${error.message}. Your changes may not be saved.`;
    this.notify(message, 'error');
  }

  /**
   * Notify about successful backup creation.
   * Formats message with key information.
   */
  notifyBackupCreated(key: string): void {
    const message = `Backup created for ${key} before operation.`;
    this.notify(message, 'info');
  }

  /**
   * Notify about successful backup restoration.
   * Formats message with key information.
   */
  notifyBackupRestored(key: string): void {
    const message = `Data restored from backup for ${key}.`;
    this.notify(message, 'success');
  }

  /**
   * Notify about successful data save operation.
   * Formats message with key information.
   */
  notifyDataSaved(key: string): void {
    const message = `Data saved successfully for ${key}.`;
    this.notify(message, 'success');
  }

  /**
   * Notify about data import operation.
   * Formats message with success/failure status.
   */
  notifyDataImported(success: boolean, error?: string): void {
    if (success) {
      this.notify('Data imported successfully from backup.', 'success');
    } else {
      const message = `Data import failed: ${error || 'Unknown error'}.`;
      this.notify(message, 'error');
    }
  }

  /**
   * Notify about storage cleanup operations.
   * Formats message with operation details.
   */
  notifyStorageCleanup(operation: string, count?: number): void {
    let message: string;
    if (count !== undefined) {
      message = `${operation} completed. ${count} items processed.`;
    } else {
      message = `${operation} completed successfully.`;
    }
    this.notify(message, 'info');
  }

  /**
   * Notify about multi-tab synchronization events.
   * Formats message with key information.
   */
  notifyTabSync(key: string, action: 'updated' | 'conflict'): void {
    if (action === 'updated') {
      const message = `Data synchronized from another tab for ${key}.`;
      this.notify(message, 'info');
    } else {
      const message = `Data conflict detected for ${key}. Please refresh to see latest changes.`;
      this.notify(message, 'warning');
    }
  }

  /**
   * Notify about pending operations being flushed.
   * Formats message with operation count.
   */
  notifyFlushPending(count: number): void {
    const message = `Flushing ${count} pending operations before page close.`;
    this.notify(message, 'info');
  }

  /**
   * Notify about retry attempts for failed operations.
   * Formats message with retry count and operation.
   */
  notifyRetryAttempt(operation: string, retryCount: number, maxRetries: number): void {
    const message = `Retrying ${operation} (attempt ${retryCount}/${maxRetries})...`;
    this.notify(message, 'warning');
  }

  /**
   * Notify about successful recovery from backup.
   * Formats message with key information.
   */
  notifyRecoverySuccess(key: string): void {
    const message = `Successfully recovered ${key} from backup.`;
    this.notify(message, 'success');
  }

  /**
   * Notify about failed recovery attempt.
   * Formats message with key and error information.
   */
  notifyRecoveryFailed(key: string, error: string): void {
    const message = `Failed to recover ${key} from backup: ${error}.`;
    this.notify(message, 'error');
  }

  /**
   * Notify about storage statistics.
   * Formats message with usage information.
   */
  notifyStorageStats(stats: {
    totalSize: number;
    percentUsed: number;
    itemCount: number;
    largestKey: string;
  }): void {
    const sizeMB = (stats.totalSize / 1024 / 1024).toFixed(2);
    const percent = Math.round(stats.percentUsed * 100);
    const message = `Storage: ${sizeMB}MB used (${percent}%), ${stats.itemCount} items. Largest: ${stats.largestKey}`;
    this.notify(message, 'info');
  }

  /**
   * Clear all registered callbacks.
   * Useful for cleanup during application shutdown.
   */
  clear(): void {
    this.callbacks.clear();
  }

  /**
   * Get the number of registered callbacks.
   * Useful for debugging and monitoring.
   */
  getCallbackCount(): number {
    return this.callbacks.size;
  }
}

/**
 * Singleton instance of StorageNotificationManager.
 * This instance is shared across the entire application.
 */
export const storageNotifications = new StorageNotificationManager();

/**
 * Convenience function to register a notification callback.
 * Returns the unregister function.
 */
export function registerStorageNotification(callback: NotificationCallback): () => void {
  return storageNotifications.register(callback);
}

/**
 * Convenience function to send a notification.
 */
export function notifyStorage(message: string, type: NotificationType): void {
  storageNotifications.notify(message, type);
}

/**
 * Convenience function to notify about quota exceeded.
 */
export function notifyQuotaExceeded(key: string, size: number): void {
  storageNotifications.notifyQuotaExceeded(key, size);
}

/**
 * Convenience function to notify about quota warning.
 */
export function notifyQuotaWarning(percentUsed: number): void {
  storageNotifications.notifyQuotaWarning(percentUsed);
}

/**
 * Convenience function to notify about storage errors.
 */
export function notifyStorageError(operation: string, error: Error): void {
  storageNotifications.notifyStorageError(operation, error);
}

/**
 * Convenience function to notify about backup operations.
 */
export function notifyBackupCreated(key: string): void {
  storageNotifications.notifyBackupCreated(key);
}

/**
 * Convenience function to notify about backup restoration.
 */
export function notifyBackupRestored(key: string): void {
  storageNotifications.notifyBackupRestored(key);
}
