/**
 * Centralized localStorage utility with quota monitoring, transaction queue,
 * automatic retry, backup mechanism, multi-tab sync, flush-on-unload, and encryption.
 * 
 * This utility wraps all localStorage operations to prevent race conditions,
 * handle quota exceeded errors, provide backup/restore functionality,
 * synchronize data across browser tabs, and encrypt sensitive data.
 */

// Import encryption utilities
import { isSensitiveKey, encryptData, decryptData, hasMasterKey } from './encryption';
import { logStorageError, logQuotaExceeded, logEncryptionError, logDecryptionError, logValidationError, ErrorSeverity, ErrorCategory } from './storageErrorLogger';
import type { Lead } from '../types/shared';
import type { ColumnConfig } from '../types/shared';
import type { SavedView } from '../types/shared';

// Core Types
export interface StorageConfig {
  key: string;
  maxRetries?: number;
  retryDelay?: number;
  enableBackup?: boolean;
  onQuotaExceeded?: (key: string, size: number) => void;
  onWarning?: (message: string) => void;
  onError?: (error: Error) => void;
}

export interface StorageTransaction {
  key: string;
  data: any;
  timestamp: number;
  retryCount: number;
  config?: Partial<StorageConfig>;
  resolve?: () => void;
  reject?: (err: Error) => void;
}

export interface StorageResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  bytesUsed?: number;
}

// Constants
export const STORAGE_QUOTA_LIMIT = 5 * 1024 * 1024; // 5MB fallback
export const WARNING_THRESHOLD = 0.8; // 80%
export const MAX_RETRIES = 3;
export const RETRY_BASE_DELAY = 300; // milliseconds
export const FLUSH_TIMEOUT = 1000; // milliseconds for beforeunload

// Dynamic quota management
interface QuotaInfo {
  quota: number;
  usage: number;
  timestamp: number;
}

let cachedQuota: QuotaInfo | null = null;
const QUOTA_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Storage usage caching to avoid O(n) scans
let approxSizeBytes = 0;
let isSizeInitialized = false;
const RECONCILIATION_INTERVAL = 30 * 1000; // 30 seconds
let lastReconciliation = 0;

/**
 * Get dynamic quota information from navigator.storage.estimate()
 * Caches result and refreshes periodically for accuracy across environments.
 */
export async function getQuota(): Promise<QuotaInfo | null> {
  try {
    // Check if storage estimate is available
    if (!navigator.storage?.estimate) {
      return null;
    }

    // Return cached result if still valid
    if (cachedQuota && (Date.now() - cachedQuota.timestamp) < QUOTA_CACHE_DURATION) {
      return cachedQuota;
    }

    // Fetch fresh quota information
    const estimate = await navigator.storage.estimate();
    
    if (estimate.quota && estimate.usage !== undefined) {
      cachedQuota = {
        quota: estimate.quota,
        usage: estimate.usage,
        timestamp: Date.now()
      };
      return cachedQuota;
    }

    return null;
  } catch (error) {
    console.warn('Failed to get storage quota estimate:', error);
    return null;
  }
}

/**
 * Check if an error is a quota exceeded error
 */
function isQuotaError(e: unknown): boolean {
  if (e instanceof Error) {
    return e.name === 'QuotaExceededError' || 
           e.message.includes('Quota') || 
           e.message.includes('quota');
  }
  return false;
}

// Transaction Queue State
const pendingTransactions = new Map<string, StorageTransaction[]>();
const processingKeys = new Set<string>();
const debounceTimers = new Map<string, number>();
const pendingData = new Map<string, any>();

// Multi-tab Sync State
const syncCallbacks = new Map<string, Set<(data: any) => void>>();
let isStorageSyncInitialized = false;

/**
 * Initialize approximate storage size by performing a one-time scan.
 * This should be called once during application startup.
 */
export function initializeStorageSize(): number {
  if (isSizeInitialized) {
    return approxSizeBytes;
  }

  let totalSize = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const value = localStorage.getItem(key);
      if (value) {
        totalSize += new Blob([value]).size;
      }
    }
  }

  approxSizeBytes = totalSize;
  isSizeInitialized = true;
  lastReconciliation = Date.now();
  
  return totalSize;
}

/**
 * Get cached storage size without performing a full scan.
 * Returns the approximate size based on tracked deltas.
 */
export function getCachedStorageSize(): number {
  if (!isSizeInitialized) {
    return initializeStorageSize();
  }
  return approxSizeBytes;
}

/**
 * Update cached storage size by delta (new value size - old value size).
 * This avoids expensive full scans on every write operation.
 */
export function updateStorageSizeDelta(key: string, oldValue: string | null, newValue: string): void {
  const oldSize = oldValue ? new Blob([oldValue]).size : 0;
  const newSize = new Blob([newValue]).size;
  const delta = newSize - oldSize;
  
  approxSizeBytes += delta;
  
  // Ensure size doesn't go negative (shouldn't happen, but safety check)
  if (approxSizeBytes < 0) {
    approxSizeBytes = 0;
  }
}

/**
 * Perform periodic reconciliation to correct drift between cached and actual size.
 * This should be called periodically (e.g., on idle) to maintain accuracy.
 */
export function reconcileStorageSize(): number {
  const now = Date.now();
  
  // Skip if reconciliation was performed recently
  if (now - lastReconciliation < RECONCILIATION_INTERVAL) {
    return approxSizeBytes;
  }

  let actualSize = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const value = localStorage.getItem(key);
      if (value) {
        actualSize += new Blob([value]).size;
      }
    }
  }

  const drift = Math.abs(actualSize - approxSizeBytes);
  
  // Only update if drift is significant (more than 1KB)
  if (drift > 1024) {
    console.warn(`Storage size drift detected: ${drift} bytes. Correcting cached size.`);
    approxSizeBytes = actualSize;
  }
  
  lastReconciliation = now;
  return approxSizeBytes;
}

/**
 * Calculate total storage size by iterating through all localStorage keys
 * and summing up byte sizes using Blob constructor.
 * This is the fallback method for integrity checks or when deltas are unknown.
 */
export function calculateStorageSize(): number {
  let totalSize = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const value = localStorage.getItem(key);
      if (value) {
        totalSize += new Blob([value]).size;
      }
    }
  }
  return totalSize;
}

/**
 * Check if adding additional bytes would exceed storage quota.
 * Uses dynamic quota estimation when available, with fallback to STORAGE_QUOTA_LIMIT.
 * Returns status information including current usage and percentage.
 */
export async function checkQuota(additionalBytes: number): Promise<{
  withinLimit: boolean;
  currentSize: number;
  percentUsed: number;
  quotaLimit: number;
}> {
  const currentSize = calculateStorageSize();
  const totalSize = currentSize + additionalBytes;
  
  // Try to get dynamic quota first
  const quotaInfo = await getQuota();
  const quotaLimit = quotaInfo?.quota || STORAGE_QUOTA_LIMIT;
  const percentUsed = totalSize / quotaLimit;
  
  return {
    withinLimit: totalSize <= quotaLimit,
    currentSize,
    percentUsed,
    quotaLimit
  };
}

/**
 * Synchronous version of checkQuota for compatibility.
 * Uses cached storage size and quota to avoid expensive operations.
 */
export function checkQuotaSync(additionalBytes: number): {
  withinLimit: boolean;
  currentSize: number;
  percentUsed: number;
  quotaLimit: number;
} {
  const currentSize = getCachedStorageSize();
  const totalSize = currentSize + additionalBytes;
  
  // Use cached quota if available, otherwise fallback
  const quotaLimit = cachedQuota?.quota || STORAGE_QUOTA_LIMIT;
  const percentUsed = totalSize / quotaLimit;
  
  return {
    withinLimit: totalSize <= quotaLimit,
    currentSize,
    percentUsed,
    quotaLimit
  };
}

/**
 * Safely retrieve item from localStorage with error handling and encryption support.
 * Returns StorageResult with success status and parsed data or error.
 */
export async function getItem<T>(key: string, defaultValue?: T): Promise<StorageResult<T>> {
  const item = localStorage.getItem(key);
  let dataToParse = item;
  
  try {
    if (item === null) {
      return {
        success: true,
        data: defaultValue,
        bytesUsed: defaultValue ? new Blob([JSON.stringify(defaultValue)]).size : 0
      };
    }
    
    // Check if this is encrypted sensitive data
    if (isSensitiveKey(key)) {
      if (!hasMasterKey()) {
        return {
          success: false,
          error: 'Master key not available for encrypted data',
          data: defaultValue,
          bytesUsed: 0
        };
      }
      
      try {
        dataToParse = await decryptData(item);
      } catch (decryptError) {
        const error = decryptError instanceof Error ? decryptError : new Error(String(decryptError));
        logDecryptionError(`Decryption failed for ${key} in getItem`, error);
        return {
          success: false,
          error: `Decryption failed: ${error.message}`,
          data: defaultValue,
          bytesUsed: 0
        };
      }
    }
    
    const parsed = JSON.parse(dataToParse);
    return {
      success: true,
      data: parsed,
      bytesUsed: new Blob([item]).size
    };
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    
    // Enhanced error logging for JSON parse failures
    logStorageError('getItem: JSON parse failed', errorObj, { 
      operation: 'getItem',
      key, 
      additionalData: {
        errorType: 'JSON_PARSE_FAILED',
        dataLength: dataToParse?.length || 0,
        dataPreview: dataToParse?.substring(0, 100) || ''
      },
      timestamp: Date.now(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      severity: ErrorSeverity.MEDIUM,
      category: ErrorCategory.CORRUPTION
    });
    
    // Attempt to restore from backup if available
    try {
      const backupKey = `${key}_backup`;
      const backupData = localStorage.getItem(backupKey);
      if (backupData) {
        const backupParsed = JSON.parse(backupData);
        logStorageError('getItem: Restored from backup due to JSON parse failure', new Error('Restored from backup due to JSON parse failure'), { 
          key, 
          backupUsed: true,
          severity: ErrorSeverity.LOW,
          category: ErrorCategory.STORAGE
        });
        
        return {
          success: true,
          data: backupParsed,
          bytesUsed: new Blob([backupData]).size
        };
      }
    } catch (backupError) {
      logStorageError('getItem: Backup restore failed', backupError as Error, { 
        operation: 'getItem',
        key, 
        additionalData: {
          errorType: 'BACKUP_RESTORE_FAILED' 
        },
        timestamp: Date.now(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        severity: ErrorSeverity.HIGH,
        category: ErrorCategory.CORRUPTION
      });
    }
    
    return {
      success: false,
      error: `Failed to parse stored data for key '${key}'. Data may be corrupted.`,
      data: defaultValue,
      bytesUsed: 0
    };
  }
}

/**
 * Process transaction queue for a specific key with mutex lock.
 * Ensures serial processing of writes to prevent race conditions.
 */
async function processQueue(key: string): Promise<void> {
  if (processingKeys.has(key)) {
    return; // Already processing this key
  }
  
  const transactions = pendingTransactions.get(key);
  if (!transactions || transactions.length === 0) {
    return;
  }
  
  processingKeys.add(key);
  
  try {
    while (transactions.length > 0) {
      const transaction = transactions.shift()!;
      await executeTransaction(transaction);
    }
  } finally {
    processingKeys.delete(key);
  }
}

/**
 * Execute a single storage transaction with retry logic.
 * Uses exponential backoff for retries and handles quota exceeded errors.
 */
async function executeTransaction(transaction: StorageTransaction): Promise<void> {
  const { key, data, retryCount, config } = transaction;
  
  try {
    const serialized = JSON.stringify(data);
    const size = new Blob([serialized]).size;
    
    // Check quota before write (use sync version for transaction processing)
    const quotaCheck = checkQuotaSync(size);
    if (!quotaCheck.withinLimit) {
      // Log quota exceeded error
      logQuotaExceeded(`Quota exceeded for ${key}`, { currentSize: quotaCheck.currentSize, quotaLimit: quotaCheck.quotaLimit });
      
      // Call quota exceeded callback
      config?.onQuotaExceeded?.(key, quotaCheck.currentSize);
      throw new Error(`Quota exceeded: ${(quotaCheck.percentUsed * 100).toFixed(1)}% used (${(quotaCheck.currentSize / 1024 / 1024).toFixed(2)}MB / ${(quotaCheck.quotaLimit / 1024 / 1024).toFixed(2)}MB)`);
    }
    
    // Warn if approaching limit
    if (quotaCheck.percentUsed > WARNING_THRESHOLD) {
      const warning = `Storage usage at ${(quotaCheck.percentUsed * 100).toFixed(1)}%! Consider exporting and archiving old data.`;
      config?.onWarning?.(warning);
    }
    
    // Get old value for delta calculation
    const oldValue = localStorage.getItem(key);
    
    localStorage.setItem(key, serialized);
    
    // Update cached storage size
    updateStorageSizeDelta(key, oldValue, serialized);
    
    // Trigger sync callbacks for multi-tab updates
    const callbacks = syncCallbacks.get(key);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
    
    // Resolve promise if awaited
    transaction.resolve?.();
    
  } catch (error) {
    // Check if this is a quota error
    if (isQuotaError(error)) {
      // Don't retry quota errors, just notify and fail
      config?.onQuotaExceeded?.(key, calculateStorageSize());
      transaction.reject?.(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
    
    // For other errors, retry if within limits
    const maxRetries = config?.maxRetries || MAX_RETRIES;
    if (retryCount < maxRetries) {
      // Retry with exponential backoff
      const baseDelay = config?.retryDelay || RETRY_BASE_DELAY;
      const delay = baseDelay * Math.pow(2, retryCount);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      const retryTransaction: StorageTransaction = {
        ...transaction,
        retryCount: retryCount + 1
      };
      
      const queue = pendingTransactions.get(key) || [];
      queue.push(retryTransaction);
      pendingTransactions.set(key, queue);
      
      await processQueue(key);
    } else {
      // Final failure - notify and reject
      config?.onError?.(error instanceof Error ? error : new Error(String(error)));
      transaction.reject?.(error instanceof Error ? error : new Error(String(error)));
      console.error(`Storage write failed for key ${key}:`, error);
      throw error;
    }
  }
}

/**
 * Enqueue a write operation to the transaction queue.
 * Prevents race conditions by serializing writes per key.
 */
export function enqueueWrite(key: string, data: any, config?: Partial<StorageConfig>): void {
  const transaction: StorageTransaction = {
    key,
    data,
    timestamp: Date.now(),
    retryCount: 0,
    config
  };
  
  const queue = pendingTransactions.get(key) || [];
  queue.push(transaction);
  pendingTransactions.set(key, queue);
  
  // Start processing queue
  processQueue(key).catch(error => {
    console.error(`Queue processing failed for key ${key}:`, error);
    if (config?.onError) {
      config.onError(error);
    }
  });
}

/**
 * Set item in localStorage with retry logic and quota monitoring.
 * 
 * @param key - The storage key
 * @param data - The data to store (will be JSON serialized)
 * @param config - Optional configuration for retry behavior and callbacks
 * @returns Promise<StorageResult> with success status and error handling
 * 
 * @description
 * This function signals enqueue success, NOT durability. The write operation is
 * queued and processed asynchronously. For critical paths that require durability
 * guarantees (e.g., before navigation), use setItemAwaited() instead.
 * 
 * @example
 * ```typescript
 * // For non-critical operations
 * await setItem('userPreferences', { theme: 'dark' });
 * 
 * // For critical operations requiring durability
 * await setItemAwaited('criticalData', data);
 * ```
 * 
 * @see setItemAwaited - For operations requiring durability guarantees
 * @see flushPending - To flush all pending writes immediately
 */
export async function setItem(key: string, data: any, config?: Partial<StorageConfig>): Promise<StorageResult<void>> {
  try {
    const serialized = JSON.stringify(data);
    const size = new Blob([serialized]).size;
    
    // Check quota
    const quotaCheck = await checkQuota(size);
    if (!quotaCheck.withinLimit) {
      const error = `Quota exceeded: Cannot save ${key}. Current size: ${(quotaCheck.currentSize / 1024 / 1024).toFixed(2)}MB / ${(quotaCheck.quotaLimit / 1024 / 1024).toFixed(2)}MB`;
      if (config?.onQuotaExceeded) {
        config.onQuotaExceeded(key, quotaCheck.currentSize);
      }
      return {
        success: false,
        error
      };
    }
    
    // Warn if approaching limit
    if (quotaCheck.percentUsed > WARNING_THRESHOLD) {
      const warning = `Storage usage at ${(quotaCheck.percentUsed * 100).toFixed(1)}%! Consider exporting and archiving old data.`;
      if (config?.onWarning) {
        config.onWarning(warning);
      }
    }
    
    // Create backup if enabled
    if (config?.enableBackup) {
      const backupResult = createBackup(key);
      if (!backupResult.success) {
        console.warn(`Backup failed for ${key}:`, backupResult.error);
      }
    }
    
    // Check if this is sensitive data that needs encryption
    if (isSensitiveKey(key)) {
      if (!hasMasterKey()) {
        return {
          success: false,
          error: 'Master key not available for encrypting sensitive data'
        };
      }
      
      try {
        const encryptedData = await encryptData(serialized);
        const encryptedSize = new Blob([encryptedData]).size;
        
        // Execute write with encrypted data
        enqueueWrite(key, encryptedData, config);
        
        return {
          success: true,
          bytesUsed: encryptedSize
        };
      } catch (encryptError) {
        const error = encryptError instanceof Error ? encryptError : new Error(String(encryptError));
        logEncryptionError(`Encryption failed for ${key} in setItem`, error);
        return {
          success: false,
          error: `Encryption failed: ${error.message}`
        };
      }
    }
    
    // Execute write for non-sensitive data
    enqueueWrite(key, data, config);
    
    return {
      success: true,
      bytesUsed: size
    };
    
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    logStorageError('setItem failed', errorObj, { key, severity: ErrorSeverity.MEDIUM, category: ErrorCategory.STORAGE });
    
    if (config?.onError) {
      config.onError(errorObj);
    }
    return {
      success: false,
      error: errorObj.message
    };
  }
}

/**
 * Awaited version of setItem that resolves only when the write is actually committed.
 * 
 * @param key - The storage key
 * @param data - The data to store (will be JSON serialized)
 * @param config - Optional configuration for retry behavior and callbacks
 * @returns Promise<void> that resolves when the transaction completes successfully
 * 
 * @description
 * This function provides durability guarantees by resolving only after the write
 * operation has been successfully committed to localStorage. Use this for critical
 * operations where data loss would be unacceptable (e.g., before navigation,
 * form submissions, or other state transitions).
 * 
 * @example
 * ```typescript
 * // Before navigation - ensure data is saved
 * await setItemAwaited('userFormData', formData);
 * router.push('/next-page');
 * 
 * // Before critical operations
 * await setItemAwaited('backupData', criticalData);
 * performRiskyOperation();
 * ```
 * 
 * @see setItem - For non-critical operations (faster, no durability guarantee)
 * @see flushPendingSyncFor - For flushing specific keys synchronously
 */
export async function setItemAwaited(key: string, data: any, config?: Partial<StorageConfig>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const transaction: StorageTransaction = {
      key,
      data,
      timestamp: Date.now(),
      retryCount: 0,
      config,
      resolve,
      reject
    };
    
    const queue = pendingTransactions.get(key) || [];
    queue.push(transaction);
    pendingTransactions.set(key, queue);
    
    // Start processing queue
    processQueue(key).catch(error => {
      console.error(`Queue processing failed for key ${key}:`, error);
      reject(error);
    });
  });
}

/**
 * Synchronous version of setItem for emergency flush scenarios.
 * 
 * @param key - The storage key
 * @param data - The data to store (will be JSON serialized)
 * @param config - Optional configuration for error handling
 * @returns StorageResult with immediate success/failure status
 * 
 * @description
 * This function performs a direct, synchronous write to localStorage with no
 * retry logic or queuing. Use only for emergency scenarios where the async
 * queue cannot be used (e.g., beforeunload handlers, critical error recovery).
 * 
 * @warning
 * This function bypasses all retry logic and error recovery mechanisms.
 * It should only be used when the standard async methods are not available.
 * 
 * @example
 * ```typescript
 * // Emergency flush before page unload
 * window.addEventListener('beforeunload', () => {
 *   setItemSync('emergencyData', criticalData);
 * });
 * ```
 */
export async function setItemSync(key: string, data: any, config?: Partial<StorageConfig>): Promise<StorageResult<void>> {
  try {
    const serialized = JSON.stringify(data);
    const size = new Blob([serialized]).size;
    
    // Check quota (sync version for emergency flush)
    const quotaCheck = checkQuotaSync(size);
    if (!quotaCheck.withinLimit) {
      const error = `Quota exceeded: Cannot save ${key}. Current size: ${(quotaCheck.currentSize / 1024 / 1024).toFixed(2)}MB / ${(quotaCheck.quotaLimit / 1024 / 1024).toFixed(2)}MB`;
      if (config?.onQuotaExceeded) {
        config.onQuotaExceeded(key, quotaCheck.currentSize);
      }
      return {
        success: false,
        error
      };
    }
    
    // Get old value for delta calculation
    const oldValue = localStorage.getItem(key);
    
    // Check if this is sensitive data that needs encryption
    if (isSensitiveKey(key)) {
      if (!hasMasterKey()) {
        return {
          success: false,
          error: 'Master key not available for encrypting sensitive data'
        };
      }
      
      try {
        const encryptedData = await encryptData(serialized);
        localStorage.setItem(key, encryptedData);
        
        // Update cached storage size with encrypted data
        updateStorageSizeDelta(key, oldValue, encryptedData);
        
        // Trigger sync callbacks with original data
        const callbacks = syncCallbacks.get(key);
        if (callbacks) {
          callbacks.forEach(callback => callback(data));
        }
        
        return {
          success: true,
          bytesUsed: new Blob([encryptedData]).size
        };
      } catch (encryptError) {
        return {
          success: false,
          error: `Encryption failed: ${encryptError instanceof Error ? encryptError.message : 'Unknown error'}`
        };
      }
    }
    
    localStorage.setItem(key, serialized);
    
    // Update cached storage size
    updateStorageSizeDelta(key, oldValue, serialized);
    
    // Trigger sync callbacks
    const callbacks = syncCallbacks.get(key);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
    
    return {
      success: true,
      bytesUsed: size
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (config?.onError) {
      config.onError(error instanceof Error ? error : new Error(errorMessage));
    }
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Remove item from localStorage with optional backup.
 * Returns Promise<StorageResult> with success status.
 */
export async function removeItem(key: string, config?: Partial<StorageConfig>): Promise<StorageResult<void>> {
  try {
    // Create backup if enabled
    if (config?.enableBackup) {
      const backupResult = createBackup(key);
      if (!backupResult.success) {
        console.warn(`Backup failed for ${key}:`, backupResult.error);
      }
    }
    
    // Get old value for delta calculation
    const oldValue = localStorage.getItem(key);
    
    localStorage.removeItem(key);
    
    // Update cached storage size (removing item reduces size)
    updateStorageSizeDelta(key, oldValue, '');
    
    return {
      success: true
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (config?.onError) {
      config.onError(error instanceof Error ? error : new Error(errorMessage));
    }
    return {
      success: false,
      error: errorMessage
    };
  }
}

/**
 * Create backup of current item before destructive operations.
 * Stores copy with _backup suffix.
 */
export function createBackup(key: string): StorageResult<void> {
  try {
    const currentValue = localStorage.getItem(key);
    if (currentValue === null) {
      return {
        success: false,
        error: `No data found for key ${key}`
      };
    }
    
    const backupKey = `${key}_backup`;
    localStorage.setItem(backupKey, currentValue);
    
    return {
      success: true
    };
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Restore item from backup.
 * Reads from _backup suffix and writes to original key.
 */
export function restoreFromBackup(key: string): StorageResult<void> {
  try {
    const backupKey = `${key}_backup`;
    const backupValue = localStorage.getItem(backupKey);
    
    if (backupValue === null) {
      return {
        success: false,
        error: `No backup found for key ${key}`
      };
    }
    
    localStorage.setItem(key, backupValue);
    
    // Trigger sync callbacks
    const callbacks = syncCallbacks.get(key);
    if (callbacks) {
      try {
        const parsed = JSON.parse(backupValue);
        callbacks.forEach(callback => callback(parsed));
      } catch (parseError) {
        logStorageError('restoreFromBackup: Backup parse failed', parseError as Error, { 
          key, 
          errorType: 'BACKUP_PARSE_FAILED',
          backupLength: backupValue.length,
          severity: ErrorSeverity.HIGH,
          category: ErrorCategory.CORRUPTION
        });
        console.warn(`Backup data for '${key}' is corrupted and cannot be restored.`, parseError);
      }
    }
    
    return {
      success: true
    };
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Check if backup exists for a key.
 */
export function hasBackup(key: string): boolean {
  const backupKey = `${key}_backup`;
  return localStorage.getItem(backupKey) !== null;
}

/**
 * Clear backup for a key.
 */
export function clearBackup(key: string): void {
  const backupKey = `${key}_backup`;
  localStorage.removeItem(backupKey);
}

/**
 * Set item with debounced write to prevent excessive writes.
 * Clears existing timer and sets new one for the specified delay.
 */
export function setItemDebounced(key: string, data: any, delay: number, config?: Partial<StorageConfig>): void {
  // Clear existing timer
  const existingTimer = debounceTimers.get(key);
  if (existingTimer) {
    clearTimeout(existingTimer as number);
  }
  
  // Store pending data
  pendingData.set(key, data);
  
  // Set new timer
  const timer = window.setTimeout(() => {
    const pendingDataForKey = pendingData.get(key);
    if (pendingDataForKey !== undefined) {
      void setItem(key, pendingDataForKey, config);
      pendingData.delete(key);
    }
    debounceTimers.delete(key);
  }, delay);
  
  debounceTimers.set(key, timer);
}

/**
 * Flush all pending debounced writes immediately.
 * 
 * @returns Promise<void> that resolves when all pending writes are completed
 * 
 * @description
 * This function cancels all pending debounced timers and writes the data
 * synchronously. It provides durability guarantees for all pending operations.
 * Use this before navigation or other critical state transitions.
 * 
 * @example
 * ```typescript
 * // Before navigation
 * await flushPending();
 * router.push('/next-page');
 * 
 * // Before critical operations
 * await flushPending();
 * performDataMigration();
 * ```
 * 
 * @see flushPendingSyncFor - For flushing specific keys synchronously
 */
export async function flushPending(): Promise<void> {
  // Cancel all timers
  debounceTimers.forEach(timer => clearTimeout(timer as number));
  debounceTimers.clear();
  
  // Write all pending data synchronously
  const promises: Promise<void>[] = [];
  pendingData.forEach((data, key) => {
    promises.push(
      new Promise<void>(async (resolve) => {
        const result = await setItemSync(key, data);
        if (!result.success) {
          console.error(`Flush failed for ${key}:`, result.error);
        }
        resolve();
      })
    );
  });
  
  await Promise.all(promises);
  pendingData.clear();
}

/**
 * Synchronously flush pending writes for specific keys.
 * 
 * @param keys - Array of keys to flush immediately
 * @returns void
 * 
 * @description
 * This function performs synchronous writes for the specified keys, bypassing
 * the async queue. Use this for critical operations where specific data must
 * be committed before proceeding (e.g., before navigation or state changes).
 * 
 * @example
 * ```typescript
 * // Before navigation - ensure specific data is saved
 * flushPendingSyncFor(['userFormData', 'criticalSettings']);
 * router.push('/next-page');
 * 
 * // Before critical operations
 * flushPendingSyncFor(['backupData']);
 * performRiskyOperation();
 * ```
 * 
 * @see setItemAwaited - For individual key durability guarantees
 * @see flushPending - For flushing all pending writes asynchronously
 */
export async function flushPendingSyncFor(keys: string[]): Promise<void> {
  for (const key of keys) {
    const pendingDataForKey = pendingData.get(key);
    if (pendingDataForKey !== undefined) {
      const result = await setItemSync(key, pendingDataForKey);
      if (!result.success) {
        console.error(`Synchronous flush failed for ${key}:`, result.error);
      }
      pendingData.delete(key);
    }
    
    // Cancel any pending timer for this key
    const timer = debounceTimers.get(key);
    if (timer) {
      clearTimeout(timer as number);
      debounceTimers.delete(key);
    }
  }
}

/**
 * Register callback for multi-tab synchronization.
 * Returns unregister function to remove the callback.
 */
export function registerSyncCallback(key: string, callback: (data: any) => void): () => void {
  if (!syncCallbacks.has(key)) {
    syncCallbacks.set(key, new Set());
  }
  
  const callbacks = syncCallbacks.get(key)!;
  callbacks.add(callback);
  
  // Return unregister function
  return () => {
    callbacks.delete(callback);
    if (callbacks.size === 0) {
      syncCallbacks.delete(key);
    }
  };
}

/**
 * Initialize storage event listener for multi-tab synchronization.
 * Should be called once during application initialization.
 */
export function initStorageSync(): void {
  if (isStorageSyncInitialized) {
    return;
  }
  
  window.addEventListener('storage', (event) => {
    if (!event.key || !event.newValue) {
      return;
    }
    
    const callbacks = syncCallbacks.get(event.key);
    if (callbacks) {
      try {
        const parsed = JSON.parse(event.newValue);
        callbacks.forEach(callback => callback(parsed));
      } catch (error) {
        logStorageError('storageEvent: Parse failed', error as Error, { 
          key: event.key, 
          errorType: 'STORAGE_EVENT_PARSE_FAILED',
          newValueLength: event.newValue?.length || 0,
          severity: ErrorSeverity.LOW,
          category: ErrorCategory.CORRUPTION
        });
        console.warn(`Received invalid data from another tab for '${event.key}'. Ignoring update.`, error);
      }
    }
  });
  
  isStorageSyncInitialized = true;
}

/**
 * Initialize storage manager with global event handlers.
 * Sets up beforeunload and visibilitychange handlers for data safety.
 */
export function initStorageManager(globalConfig?: Partial<StorageConfig>): void {
  // Initialize storage size cache
  initializeStorageSize();
  
  // Initialize multi-tab sync
  initStorageSync();
  
  // Flush pending writes before page unload
  const handleBeforeUnload = async () => {
    // Use synchronous flush for beforeunload
    debounceTimers.forEach(timer => clearTimeout(timer as number));
    debounceTimers.clear();
    
    // Flush pending debounced data
    for (const [key, data] of pendingData.entries()) {
      const result = await setItemSync(key, data, globalConfig);
      if (!result.success) {
        console.error(`Emergency flush failed for ${key}:`, result.error);
      }
    }
    pendingData.clear();
    
    // Flush queued transactions - write the last transaction for each key
    for (const [key, transactions] of pendingTransactions.entries()) {
      if (transactions.length > 0) {
        const lastTransaction = transactions[transactions.length - 1];
        const result = await setItemSync(key, lastTransaction.data, globalConfig);
        if (!result.success) {
          console.error(`Emergency transaction flush failed for ${key}:`, result.error);
        }
      }
    }
    pendingTransactions.clear();
    processingKeys.clear();
  };
  
  // Flush when page becomes hidden (mobile/tab switching)
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') {
      // Perform reconciliation before flush
      reconcileStorageSize();
      
      flushPending().catch(error => {
        console.error('Visibility change flush failed:', error);
      });
    }
  };
  
  // Periodic reconciliation on idle
  const handleIdle = () => {
    reconcileStorageSize();
  };
  
  // Use requestIdleCallback if available, otherwise setTimeout
  const scheduleReconciliation = () => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(handleIdle, { timeout: 5000 });
    } else {
      setTimeout(handleIdle, 1000);
    }
  };
  
  // Schedule periodic reconciliation
  const reconciliationInterval = setInterval(scheduleReconciliation, RECONCILIATION_INTERVAL);
  
  window.addEventListener('beforeunload', handleBeforeUnload);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  
  // Store cleanup function
  (window as any).__storageCleanup = () => {
    window.removeEventListener('beforeunload', handleBeforeUnload);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    clearInterval(reconciliationInterval);
  };
}

/**
 * Cleanup storage manager and remove event listeners.
 */
export function cleanupStorageManager(): void {
  const cleanup = (window as any).__storageCleanup;
  if (cleanup) {
    cleanup();
    delete (window as any).__storageCleanup;
  }
  
  // Clear all pending operations
  debounceTimers.forEach(timer => clearTimeout(timer as number));
  debounceTimers.clear();
  pendingData.clear();
  pendingTransactions.clear();
  processingKeys.clear();
  syncCallbacks.clear();
  
  isStorageSyncInitialized = false;
}

/**
 * Get comprehensive storage statistics for debugging.
 * Uses dynamic quota when available for accurate percentage calculation.
 */
export async function getStorageStats(): Promise<{
  totalSize: number;
  percentUsed: number;
  itemCount: number;
  largestKey: string;
  largestSize: number;
  quotaLimit: number;
}> {
  let totalSize = 0;
  let itemCount = 0;
  let largestKey = '';
  let largestSize = 0;
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const value = localStorage.getItem(key);
      if (value) {
        const size = new Blob([value]).size;
        totalSize += size;
        itemCount++;
        
        if (size > largestSize) {
          largestSize = size;
          largestKey = key;
        }
      }
    }
  }
  
  // Get dynamic quota information
  const quotaInfo = await getQuota();
  const quotaLimit = quotaInfo?.quota || STORAGE_QUOTA_LIMIT;
  
  return {
    totalSize,
    percentUsed: totalSize / quotaLimit,
    itemCount,
    largestKey,
    largestSize,
    quotaLimit
  };
}

/**
 * Synchronous version of getStorageStats for compatibility.
 * Uses cached storage size for better performance.
 */
export function getStorageStatsSync(): {
  totalSize: number;
  percentUsed: number;
  itemCount: number;
  largestKey: string;
  largestSize: number;
  quotaLimit: number;
} {
  // Use cached size for total, but still scan for item count and largest item
  const totalSize = getCachedStorageSize();
  let itemCount = 0;
  let largestKey = '';
  let largestSize = 0;
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const value = localStorage.getItem(key);
      if (value) {
        const size = new Blob([value]).size;
        itemCount++;
        
        if (size > largestSize) {
          largestSize = size;
          largestKey = key;
        }
      }
    }
  }
  
  // Use cached quota if available
  const quotaLimit = cachedQuota?.quota || STORAGE_QUOTA_LIMIT;
  
  return {
    totalSize,
    percentUsed: totalSize / quotaLimit,
    itemCount,
    largestKey,
    largestSize,
    quotaLimit
  };
}

/**
 * Clear all backup items from localStorage.
 */
export function clearAllBackups(): void {
  const keysToRemove: string[] = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.endsWith('_backup')) {
      keysToRemove.push(key);
    }
  }
  
  keysToRemove.forEach(key => localStorage.removeItem(key));
}

/**
 * Export all localStorage data as JSON string for debugging.
 */
export function exportStorage(): string {
  const data: Record<string, string> = {};
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key) {
      const value = localStorage.getItem(key);
      if (value) {
        data[key] = value;
      }
    }
  }
  
  return JSON.stringify(data, null, 2);
}

// Import validation configuration
const ALLOWED_KEY_PREFIXES = [
  'lead',
  'template',
  'column',
  'header',
  'password',
  'security',
  'backup',
  '_encryption'
];

const MAX_KEY_LENGTH = 100;
const MAX_VALUE_SIZE = 10 * 1024 * 1024; // 10MB per item
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50MB total

interface ImportValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  projectedSize: number;
  itemCount: number;
}

interface ImportOptions {
  dryRun?: boolean;
  createBackup?: boolean;
  validateKeys?: boolean;
  maxSize?: number;
}

/**
 * Validate imported storage data
 */
export function validateImportData(data: Record<string, any>): ImportValidationResult {
  const result: ImportValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    projectedSize: 0,
    itemCount: 0
  };

  if (!data || typeof data !== 'object') {
    result.valid = false;
    result.errors.push('Invalid data format');
    return result;
  }

  const keys = Object.keys(data);
  result.itemCount = keys.length;

  // Check total item count
  if (keys.length > 1000) {
    result.warnings.push(`Large number of items (${keys.length}). Import may be slow.`);
  }

  // Validate each key-value pair
  for (const [key, value] of Object.entries(data)) {
    // Key validation
    if (typeof key !== 'string') {
      result.valid = false;
      result.errors.push(`Invalid key type: ${typeof key}`);
      continue;
    }

    if (key.length === 0) {
      result.valid = false;
      result.errors.push('Empty key found');
      continue;
    }

    if (key.length > MAX_KEY_LENGTH) {
      result.valid = false;
      result.errors.push(`Key too long: ${key} (${key.length} > ${MAX_KEY_LENGTH})`);
      continue;
    }

    // Check for allowed key prefixes
    const hasValidPrefix = ALLOWED_KEY_PREFIXES.some(prefix => key.startsWith(prefix));
    if (!hasValidPrefix) {
      result.warnings.push(`Key '${key}' doesn't match expected prefixes`);
    }

    // Check for suspicious keys
    if (key.includes('script') || key.includes('eval') || key.includes('function')) {
      result.warnings.push(`Potentially suspicious key: ${key}`);
    }

    // Value validation
    if (typeof value !== 'string') {
      result.valid = false;
      result.errors.push(`Invalid value type for key '${key}': ${typeof value}`);
      continue;
    }

    const valueSize = new Blob([value]).size;
    if (valueSize > MAX_VALUE_SIZE) {
      result.valid = false;
      result.errors.push(`Value too large for key '${key}': ${(valueSize / 1024 / 1024).toFixed(2)}MB`);
      continue;
    }

    // Check for valid JSON if it looks like JSON
    if (value.trim().startsWith('{') || value.trim().startsWith('[')) {
      try {
        JSON.parse(value);
      } catch (parseError) {
        result.warnings.push(`Key '${key}' contains invalid JSON and will be skipped during import.`);
        logStorageError('validateImportData: JSON parse failed', parseError as Error, { 
          key, 
          errorType: 'IMPORT_VALIDATION_JSON_PARSE_FAILED',
          valueLength: value.length,
          severity: ErrorSeverity.MEDIUM,
          category: ErrorCategory.CORRUPTION
        });
      }
    }

    // Check for suspicious content
    if (value.includes('<script') || value.includes('javascript:') || value.includes('eval(')) {
      result.warnings.push(`Potentially malicious content in key '${key}'`);
    }

    result.projectedSize += valueSize;
  }

  // Check total size
  if (result.projectedSize > MAX_TOTAL_SIZE) {
    result.valid = false;
    result.errors.push(`Total size too large: ${(result.projectedSize / 1024 / 1024).toFixed(2)}MB`);
  }

  return result;
}

/**
 * Perform dry-run import to validate data without making changes
 */
export function dryRunImport(jsonString: string): ImportValidationResult {
  try {
    const data = JSON.parse(jsonString);
    return validateImportData(data);
  } catch (error) {
    const errorObj = error instanceof Error ? error : new Error(String(error));
    logStorageError('dryRunImport: JSON parse failed', errorObj, { 
      errorType: 'DRY_RUN_JSON_PARSE_FAILED',
      jsonStringLength: jsonString.length,
      severity: ErrorSeverity.MEDIUM,
      category: ErrorCategory.CORRUPTION
    });
    
    return {
      valid: false,
      errors: [`Import file contains invalid JSON. Please check the file format. Error: ${errorObj.message}`],
      warnings: [],
      projectedSize: 0,
      itemCount: 0
    };
  }
}

/**
 * Create backup of current localStorage data
 */
export function createImportBackup(): StorageResult<string> {
  try {
    const backupData: Record<string, string> = {};
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        if (value) {
          backupData[key] = value;
        }
      }
    }

    const backupJson = JSON.stringify(backupData, null, 2);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupKey = `_import_backup_${timestamp}`;
    
    localStorage.setItem(backupKey, backupJson);
    
    return {
      success: true,
      data: backupKey
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Restore from import backup
 */
export function restoreFromImportBackup(backupKey: string): StorageResult<void> {
  const backupData = localStorage.getItem(backupKey);
  try {
    if (!backupData) {
      return {
        success: false,
        error: 'Backup not found'
      };
    }

    const data = JSON.parse(backupData);
    
    // Clear current data
    localStorage.clear();
    
    // Restore backup data
    Object.entries(data).forEach(([key, value]) => {
      if (typeof value === 'string') {
        localStorage.setItem(key, value);
      }
    });
    
    return {
      success: true
    };
  } catch (parseError) {
    const errorObj = parseError instanceof Error ? parseError : new Error(String(parseError));
    logStorageError('restoreImportBackup: JSON parse failed', errorObj, { 
      errorType: 'IMPORT_BACKUP_JSON_PARSE_FAILED',
      backupDataLength: backupData?.length || 0,
      severity: ErrorSeverity.HIGH,
      category: ErrorCategory.CORRUPTION
    });
    
    return {
      success: false,
      error: 'Import backup is corrupted and cannot be restored.'
    };
  }
}

/**
 * Import localStorage data from JSON string with validation and safety features.
 * Returns StorageResult with success status and error handling.
 */
export function importStorage(jsonString: string, options: ImportOptions = {}): StorageResult<void> {
  const {
    dryRun = false,
    createBackup = true,
    validateKeys = true,
    maxSize = MAX_TOTAL_SIZE
  } = options;

  try {
    const data = JSON.parse(jsonString);
    
    if (typeof data !== 'object' || data === null) {
      return {
        success: false,
        error: 'Invalid JSON format'
      };
    }

    // Validate data if requested
    if (validateKeys) {
      const validation = validateImportData(data);
      if (!validation.valid) {
        return {
          success: false,
          error: `Validation failed: ${validation.errors.join(', ')}`
        };
      }
      
      if (validation.projectedSize > maxSize) {
        return {
          success: false,
          error: `Data too large: ${(validation.projectedSize / 1024 / 1024).toFixed(2)}MB`
        };
      }
    }

    // Dry run - just validate without importing
    if (dryRun) {
      return {
        success: true
      };
    }

    // Create backup if requested
    let backupKey: string | undefined;
    if (createBackup) {
      const backupResult = createImportBackup();
      if (backupResult.success && backupResult.data) {
        backupKey = backupResult.data;
      } else {
        console.warn('Failed to create backup:', backupResult.error);
      }
    }

    try {
      // Clear existing data
      localStorage.clear();
      
      // Import new data
      Object.entries(data).forEach(([key, value]) => {
        if (typeof value === 'string') {
          localStorage.setItem(key, value);
        }
      });
      
      return {
        success: true
      };
      
    } catch (importError) {
      // Restore backup if import failed
      if (backupKey) {
        const restoreResult = restoreFromImportBackup(backupKey);
        if (!restoreResult.success) {
          console.error('Failed to restore backup after import failure:', restoreResult.error);
        }
      }
      
      throw importError;
    }
    
  } catch (parseError) {
    const errorObj = parseError instanceof Error ? parseError : new Error(String(parseError));
    logStorageError('importStorage: JSON parse failed', errorObj, { 
      errorType: 'IMPORT_STORAGE_JSON_PARSE_FAILED',
      jsonStringLength: jsonString.length,
      severity: ErrorSeverity.HIGH,
      category: ErrorCategory.CORRUPTION
    });
    
    return {
      success: false,
    };
  }
}

// Type-safe localStorage wrappers with runtime validation

/**
 * Type-safe getItem with runtime validation
 * @param key - The storage key
 * @param defaultValue - Default value if key doesn't exist or validation fails
 * @param validator - Type guard function to validate the data
 * @returns Promise with validated data or default value
 */
export async function getItemTyped<T>(key: string, defaultValue: T, validator: (data: unknown) => data is T): Promise<StorageResult<T>> {
  try {
    const result = await getItem<T>(key, defaultValue);
    if (result.success && result.data !== undefined) {
      if (validator(result.data)) {
        return result;
      } else {
        logValidationError(`Type validation failed for ${key}`, undefined, { severity: ErrorSeverity.MEDIUM, category: ErrorCategory.VALIDATION });
        return { success: true, data: defaultValue };
      }
    }
    return result;
  } catch (error) {
    logStorageError(`getItemTyped failed for ${key}`, error instanceof Error ? error : new Error('Unknown error'), { severity: ErrorSeverity.HIGH, category: ErrorCategory.STORAGE });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Type-safe setItem with pre-save validation
 * @param key - The storage key
 * @param data - The data to store
 * @param validator - Type guard function to validate the data
 * @param config - Optional storage configuration
 * @returns Promise with operation result
 */
export async function setItemTyped<T>(key: string, data: T, validator: (data: unknown) => data is T, config?: Partial<StorageConfig>): Promise<StorageResult<void>> {
  try {
    if (!validator(data)) {
      logValidationError(`Pre-save validation failed for ${key}`, undefined, { severity: ErrorSeverity.HIGH, category: ErrorCategory.VALIDATION });
      return { success: false, error: 'Data validation failed' };
    }
    
    return await setItem(key, data, config);
  } catch (error) {
    logStorageError(`setItemTyped failed for ${key}`, error instanceof Error ? error : new Error('Unknown error'), { severity: ErrorSeverity.HIGH, category: ErrorCategory.STORAGE });
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Type guard helpers for common types

/**
 * Type guard to check if data is a Lead array
 * @param data - The data to validate
 * @returns True if data is a Lead array
 */
export function isLeadArray(data: unknown): data is Lead[] {
  return Array.isArray(data) && data.every(item => 
    typeof item === 'object' && 
    item !== null && 
    'id' in item && 
    'kva' in item &&
    'clientName' in item
  );
}

/**
 * Type guard to check if data is a ColumnConfig array
 * @param data - The data to validate
 * @returns True if data is a ColumnConfig array
 */
export function isColumnConfigArray(data: unknown): data is ColumnConfig[] {
  return Array.isArray(data) && data.every(item => 
    typeof item === 'object' && 
    item !== null && 
    'id' in item && 
    'fieldKey' in item && 
    'label' in item && 
    'type' in item
  );
}

/**
 * Type guard to check if data is a SavedView array
 * @param data - The data to validate
 * @returns True if data is a SavedView array
 */
export function isSavedViewArray(data: unknown): data is SavedView[] {
  return Array.isArray(data) && data.every(item => 
    typeof item === 'object' && 
    item !== null && 
    'id' in item && 
    'name' in item && 
    'filters' in item
  );
}

/**
 * Repair corrupted leads data
 * @param corruptedData - Corrupted leads data
 * @returns Repaired leads data
 */
export function repairCorruptedLeads(corruptedData: any): any[] {
  if (!Array.isArray(corruptedData)) {
    return [];
  }

  return corruptedData.map((lead: any, index: number) => {
    if (!lead || typeof lead !== 'object') {
      return {
        id: `repaired-${index}`,
        clientName: 'Unknown',
        company: 'Unknown',
        status: 'New',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }

    // Ensure required fields exist
    const repairedLead = {
      id: lead.id || `repaired-${index}`,
      clientName: lead.clientName || 'Unknown',
      company: lead.company || 'Unknown',
      status: lead.status || 'New',
      createdAt: lead.createdAt || new Date().toISOString(),
      updatedAt: lead.updatedAt || new Date().toISOString(),
      ...lead
    };

    // Ensure mobileNumbers is an array
    if (!Array.isArray(repairedLead.mobileNumbers)) {
      repairedLead.mobileNumbers = [];
    }

    // Ensure activities is an array
    if (!Array.isArray(repairedLead.activities)) {
      repairedLead.activities = [];
    }

    return repairedLead;
  });
}

/**
 * Repair corrupted column configuration
 * @param corruptedData - Corrupted column configuration
 * @returns Repaired column configuration
 */
export function repairColumnConfig(corruptedData: any): any[] {
  if (!Array.isArray(corruptedData)) {
    return [];
  }

  return corruptedData.map((config: any, index: number) => {
    if (!config || typeof config !== 'object') {
      return {
        id: `repaired-column-${index}`,
        fieldKey: `field_${index}`,
        label: `Field ${index}`,
        type: 'text',
        required: false,
        sortable: true,
        width: 150,
        visible: true,
        description: 'Repaired column'
      };
    }

    // Ensure required fields exist
    return {
      id: config.id || `repaired-column-${index}`,
      fieldKey: config.fieldKey || `field_${index}`,
      label: config.label || `Field ${index}`,
      type: config.type || 'text',
      required: Boolean(config.required),
      sortable: Boolean(config.sortable),
      width: Number(config.width) || 150,
      visible: Boolean(config.visible),
      description: config.description || 'Repaired column',
      ...config
    };
  });
}
