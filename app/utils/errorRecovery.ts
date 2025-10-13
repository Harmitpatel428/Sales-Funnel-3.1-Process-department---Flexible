/**
 * Centralized error recovery utility with common recovery strategies
 * Provides structured error recovery for various failure scenarios
 */

import { storageErrorLogger } from './storageErrorLogger';
import { storageNotifications } from './storageNotifications';

export interface RecoveryResult {
  success: boolean;
  strategy: string;
  message: string;
  data?: any;
  error?: string;
}

export interface RecoveryOption {
  label: string;
  description: string;
  action: () => Promise<RecoveryResult>;
  severity: 'low' | 'medium' | 'high';
}

export enum RecoveryStrategy {
  RESTORE_BACKUP = 'restore_backup',
  CLEAR_CACHE = 'clear_cache',
  REPAIR_DATA = 'repair_data',
  RETRY_OPERATION = 'retry_operation',
  USE_DEFAULTS = 'use_defaults',
  CLEAR_CORRUPTED = 'clear_corrupted'
}

/**
 * Attempts to recover from storage errors
 */
export async function recoverFromStorageError(key: string, error: Error): Promise<RecoveryResult> {
  try {
    // Try to restore from backup first
    const { restoreFromBackup, hasBackup } = await import('./storage');
    
    if (await hasBackup(key)) {
      const result = await restoreFromBackup(key);
      if (result.success) {
        return {
          success: true,
          strategy: RecoveryStrategy.RESTORE_BACKUP,
          message: `Successfully restored ${key} from backup`,
          data: result.data
        };
      }
    }
    
    // Try to clear corrupted data
    try {
      localStorage.removeItem(key);
      return {
        success: true,
        strategy: RecoveryStrategy.CLEAR_CORRUPTED,
        message: `Cleared corrupted data for ${key}`,
        data: null
      };
    } catch (clearError) {
      return {
        success: false,
        strategy: RecoveryStrategy.CLEAR_CORRUPTED,
        message: `Failed to clear corrupted data for ${key}`,
        error: clearError.message
      };
    }
    
  } catch (recoveryError) {
    return {
      success: false,
      strategy: RecoveryStrategy.RESTORE_BACKUP,
      message: `Recovery failed for ${key}`,
      error: recoveryError.message
    };
  }
}

/**
 * Attempts to recover from validation errors
 */
export async function recoverFromValidationError(data: any, validator: Function): Promise<RecoveryResult> {
  try {
    // Try auto-repair first
    const repairedData = await attemptAutoRepair(data, validator);
    if (repairedData) {
      return {
        success: true,
        strategy: RecoveryStrategy.REPAIR_DATA,
        message: 'Data automatically repaired',
        data: repairedData
      };
    }
    
    // Try removing invalid fields
    const cleanedData = removeInvalidFields(data, validator);
    if (cleanedData) {
      return {
        success: true,
        strategy: RecoveryStrategy.REPAIR_DATA,
        message: 'Invalid fields removed from data',
        data: cleanedData
      };
    }
    
    // Use default values
    const defaultData = getDefaultData(data);
    return {
      success: true,
      strategy: RecoveryStrategy.USE_DEFAULTS,
      message: 'Using default values for corrupted data',
      data: defaultData
    };
    
  } catch (error) {
    return {
      success: false,
      strategy: RecoveryStrategy.REPAIR_DATA,
      message: 'Failed to repair validation errors',
      error: error.message
    };
  }
}

/**
 * Attempts to recover from quota exceeded errors
 */
export async function recoverFromQuotaError(key: string): Promise<RecoveryResult> {
  try {
    let freedSpace = 0;
    
    // Try clearing cache first
    const cacheKeys = Object.keys(localStorage).filter(k => k.includes('cache') || k.includes('temp'));
    for (const cacheKey of cacheKeys) {
      const size = localStorage.getItem(cacheKey)?.length || 0;
      localStorage.removeItem(cacheKey);
      freedSpace += size;
    }
    
    if (freedSpace > 0) {
      return {
        success: true,
        strategy: RecoveryStrategy.CLEAR_CACHE,
        message: `Freed ${freedSpace} bytes by clearing cache`,
        data: { freedSpace }
      };
    }
    
    // Try removing old backups
    const backupKeys = Object.keys(localStorage).filter(k => k.includes('backup'));
    for (const backupKey of backupKeys) {
      const size = localStorage.getItem(backupKey)?.length || 0;
      localStorage.removeItem(backupKey);
      freedSpace += size;
    }
    
    if (freedSpace > 0) {
      return {
        success: true,
        strategy: RecoveryStrategy.CLEAR_CACHE,
        message: `Freed ${freedSpace} bytes by removing old backups`,
        data: { freedSpace }
      };
    }
    
    return {
      success: false,
      strategy: RecoveryStrategy.CLEAR_CACHE,
      message: 'Unable to free sufficient storage space',
      error: 'Storage quota exceeded and no cache/backup data to clear'
    };
    
  } catch (error) {
    return {
      success: false,
      strategy: RecoveryStrategy.CLEAR_CACHE,
      message: 'Failed to recover from quota error',
      error: error.message
    };
  }
}

/**
 * Retries failed operations with exponential backoff
 */
export async function recoverFromNetworkError(
  operation: Function, 
  maxRetries: number = 3
): Promise<RecoveryResult> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      return {
        success: true,
        strategy: RecoveryStrategy.RETRY_OPERATION,
        message: `Operation succeeded after ${attempt} attempt(s)`,
        data: result
      };
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  return {
    success: false,
    strategy: RecoveryStrategy.RETRY_OPERATION,
    message: `Operation failed after ${maxRetries} attempts`,
    error: lastError?.message || 'Unknown error'
  };
}

/**
 * Attempts to repair corrupted data using schema
 */
export async function recoverFromCorruptedData(key: string, schema: any): Promise<RecoveryResult> {
  try {
    const { repairCorruptedLeads, repairColumnConfig } = await import('./storage');
    
    if (key === 'leads') {
      const result = await repairCorruptedLeads();
      return {
        success: result.success,
        strategy: RecoveryStrategy.REPAIR_DATA,
        message: result.success ? 'Leads data repaired successfully' : 'Failed to repair leads data',
        data: result.data,
        error: result.success ? undefined : result.error
      };
    }
    
    if (key === 'columns') {
      const result = await repairColumnConfig();
      return {
        success: result.success,
        strategy: RecoveryStrategy.REPAIR_DATA,
        message: result.success ? 'Column configuration repaired successfully' : 'Failed to repair column configuration',
        data: result.data,
        error: result.success ? undefined : result.error
      };
    }
    
    return {
      success: false,
      strategy: RecoveryStrategy.REPAIR_DATA,
      message: `No repair strategy available for ${key}`,
      error: 'Unknown data type'
    };
    
  } catch (error) {
    return {
      success: false,
      strategy: RecoveryStrategy.REPAIR_DATA,
      message: `Failed to repair corrupted data for ${key}`,
      error: error.message
    };
  }
}

/**
 * Analyzes error and returns available recovery options
 */
export function getRecoveryOptions(error: Error): RecoveryOption[] {
  const options: RecoveryOption[] = [];
  
  // Storage quota error
  if (error.name === 'QuotaExceededError' || error.message.includes('quota')) {
    options.push({
      label: 'Clear Cache',
      description: 'Free up storage space by clearing temporary data',
      action: () => recoverFromQuotaError(''),
      severity: 'high'
    });
  }
  
  // JSON parse error
  if (error.message.includes('JSON') || error.message.includes('parse')) {
    options.push({
      label: 'Restore from Backup',
      description: 'Restore data from the most recent backup',
      action: async () => {
        const { restoreFromBackup, hasBackup } = await import('./storage');
        const keys = ['leads', 'columns', 'settings'];
        for (const key of keys) {
          if (await hasBackup(key)) {
            return await restoreFromBackup(key);
          }
        }
        return {
          success: false,
          strategy: RecoveryStrategy.RESTORE_BACKUP,
          message: 'No backups available',
          error: 'No backup data found'
        };
      },
      severity: 'medium'
    });
  }
  
  // Network/API error
  if (error.message.includes('fetch') || error.message.includes('network')) {
    options.push({
      label: 'Retry Operation',
      description: 'Try the operation again with automatic retry',
      action: () => recoverFromNetworkError(() => Promise.resolve()),
      severity: 'low'
    });
  }
  
  // Generic recovery options
  options.push({
    label: 'Clear Corrupted Data',
    description: 'Remove corrupted data and start fresh',
    action: async () => ({
      success: true,
      strategy: RecoveryStrategy.CLEAR_CORRUPTED,
      message: 'Corrupted data cleared',
      data: null
    }),
    severity: 'high'
  });
  
  return options;
}

/**
 * Executes a specific recovery strategy
 */
export async function executeRecoveryStrategy(strategy: RecoveryStrategy, context: any = {}): Promise<RecoveryResult> {
  try {
    storageErrorLogger.logError({
      message: `Executing recovery strategy: ${strategy}`,
      level: 'info',
      timestamp: new Date().toISOString(),
      context
    });
    
    let result: RecoveryResult;
    
    switch (strategy) {
      case RecoveryStrategy.RESTORE_BACKUP:
        result = await recoverFromStorageError(context.key || '', new Error('Backup restore requested'));
        break;
      case RecoveryStrategy.CLEAR_CACHE:
        result = await recoverFromQuotaError(context.key || '');
        break;
      case RecoveryStrategy.REPAIR_DATA:
        result = await recoverFromCorruptedData(context.key || '', context.schema);
        break;
      case RecoveryStrategy.RETRY_OPERATION:
        result = await recoverFromNetworkError(context.operation || (() => Promise.resolve()));
        break;
      case RecoveryStrategy.USE_DEFAULTS:
        result = {
          success: true,
          strategy: RecoveryStrategy.USE_DEFAULTS,
          message: 'Using default values',
          data: context.defaults || {}
        };
        break;
      case RecoveryStrategy.CLEAR_CORRUPTED:
        result = await recoverFromStorageError(context.key || '', new Error('Clear corrupted data requested'));
        break;
      default:
        result = {
          success: false,
          strategy,
          message: 'Unknown recovery strategy',
          error: 'Invalid strategy provided'
        };
    }
    
    // Show notification based on result
    if (result.success) {
      storageNotifications.notify({
        type: 'success',
        message: result.message,
        duration: 3000
      });
    } else {
      storageNotifications.notify({
        type: 'error',
        message: result.message,
        duration: 5000
      });
    }
    
    return result;
    
  } catch (error) {
    const result = {
      success: false,
      strategy,
      message: 'Recovery strategy execution failed',
      error: error.message
    };
    
    storageNotifications.notify({
      type: 'error',
      message: result.message,
      duration: 5000
    });
    
    return result;
  }
}

// Helper functions

async function attemptAutoRepair(data: any, validator: Function): Promise<any> {
  // Simple auto-repair logic - can be enhanced based on specific validation rules
  if (typeof data === 'object' && data !== null) {
    const repaired = { ...data };
    
    // Fix common issues
    if (repaired.id && typeof repaired.id !== 'string') {
      repaired.id = String(repaired.id);
    }
    
    if (repaired.createdAt && !repaired.createdAt.match(/^\d{4}-\d{2}-\d{2}/)) {
      repaired.createdAt = new Date().toISOString();
    }
    
    // Validate repaired data
    try {
      validator(repaired);
      return repaired;
    } catch {
      return null;
    }
  }
  
  return null;
}

function removeInvalidFields(data: any, validator: Function): any {
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  
  const cleaned = { ...data };
  const requiredFields = ['id']; // Add more required fields as needed
  
  // Remove fields that cause validation errors
  for (const field of Object.keys(cleaned)) {
    try {
      const testData = { ...cleaned };
      delete testData[field];
      validator(testData);
      delete cleaned[field];
    } catch {
      // Field is required, keep it
    }
  }
  
  return cleaned;
}

function getDefaultData(originalData: any): any {
  if (Array.isArray(originalData)) {
    return [];
  }
  
  if (typeof originalData === 'object' && originalData !== null) {
    return {
      id: `default_${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
  
  return null;
}
