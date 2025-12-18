'use client';

import type { Lead, SavedView } from '../types/shared';
import type { ColumnConfig } from '../types/shared';
import { HeaderConfig } from '../context/HeaderContext';
import { DEFAULT_HEADER_LABELS } from '../constants/columnConfig';
import { getItem, setItem, restoreFromBackup } from './storage';
import { isVersionedData, wrapWithVersion, getSchemaVersion, compareVersions } from './schemaRegistry';
import { runMigrations, needsMigration } from './schemaMigration';
import { 
  validateLeadArray, 
  validateColumnConfigArray, 
  validateHeaderConfigFields, 
  validateSavedViewFields,
  repairLeadArray,
  repairColumnConfig,
  checkDataIntegrity
} from './schemaValidation';
import { sanitizeLeadArray } from './sanitizer';
// import { sanitizeColumnConfig, sanitizeHeaderConfig } from './sanitizer'; // Temporarily disabled
import { storageNotifications } from './storageNotifications';
import { logStorage } from './debugLogger';

// Data load result interface
export interface DataLoadResult<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  warnings: string[];
  wasMigrated: boolean;
  wasRecovered: boolean;
  validationErrors: any[];
  recoveryAttempted: boolean;
}

// Load options interface
export interface LoadOptions {
  allowMigration?: boolean;
  allowRepair?: boolean;
  allowBackupRecovery?: boolean;
  strictValidation?: boolean;
  notifyUser?: boolean;
  createBackupBeforeMigration?: boolean;
}

// Default load options
const DEFAULT_LOAD_OPTIONS: LoadOptions = {
  allowMigration: true,
  allowRepair: true,
  allowBackupRecovery: true,
  strictValidation: false,
  notifyUser: true,
  createBackupBeforeMigration: true
};

// Main load function
export async function loadAndValidateData<T>(
  key: string, 
  defaultValue: T, 
  options: LoadOptions = {}
): Promise<DataLoadResult<T>> {
  const opts = { ...DEFAULT_LOAD_OPTIONS, ...options };
  const result: DataLoadResult<T> = {
    success: false,
    data: null,
    error: null,
    warnings: [],
    wasMigrated: false,
    wasRecovered: false,
    validationErrors: [],
    recoveryAttempted: false
  };

  try {
    logStorage(`Loading data for key: ${key}`, { options: opts });

    // Step 1: Load from storage
    const storageResult = await getItem<T>(key, defaultValue);
    if (!storageResult.success) {
      result.error = `Failed to load data from storage: ${storageResult.error}`;
      if (opts.notifyUser) {
        storageNotifications.notifyStorageError(`load ${key}`, new Error(result.error));
      }
      return result;
    }

    const rawData = storageResult.data;
    if (rawData === null || rawData === undefined) {
      result.data = defaultValue;
      result.success = true;
      return result;
    }

    // Step 2: Check if data is versioned
    let currentVersion = '0.9'; // Legacy version
    let dataToProcess = rawData;

    if (isVersionedData(rawData)) {
      currentVersion = rawData.version;
      dataToProcess = rawData.data;
      logStorage(`Found versioned data`, { version: currentVersion, key });
    } else {
      logStorage(`Found legacy data, treating as version 0.9`, { key });
    }

    const targetVersion = getSchemaVersion(key);

    // Step 3: Check if migration needed
    if (opts.allowMigration && needsMigration(currentVersion, targetVersion)) {
      logStorage(`Migration needed: ${currentVersion} -> ${targetVersion}`, { key });
      
      if (opts.notifyUser) {
        storageNotifications.notify(`Migrating ${key} data from version ${currentVersion} to ${targetVersion}`, 'info');
      }

      // Step 4: Run migrations
      const migrationResult = runMigrations(key, dataToProcess, currentVersion, targetVersion);
      if (!migrationResult.success) {
        result.error = `Migration failed: ${migrationResult.errors.join(', ')}`;
        result.validationErrors = migrationResult.errors;
        if (opts.notifyUser) {
          storageNotifications.notify(`Migration failed for ${key}: ${migrationResult.errors.join(', ')}`, 'error');
        }
        return result;
      }

      dataToProcess = migrationResult.data;
      result.wasMigrated = true;
      result.warnings.push(...migrationResult.warnings);

      if (opts.notifyUser) {
        storageNotifications.notify(`Successfully migrated ${key} data to version ${targetVersion}`, 'success');
      }
    }

    // Step 5: Sanitize data
    try {
      switch (key) {
        case 'leads':
          // dataToProcess = sanitizeLeadArray(dataToProcess as Lead[]) as T;
          break;
        case 'leadColumnConfig':
          // dataToProcess = sanitizeColumnConfig(dataToProcess as ColumnConfig[]) as T;
          break;
        case 'leadHeaderConfig':
          // dataToProcess = sanitizeHeaderConfig(dataToProcess as HeaderConfig) as T;
          break;
        default:
          // Generic sanitization would go here
          break;
      }
    } catch (error) {
      result.warnings.push(`Sanitization warning: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Step 6: Validate data integrity
    const integrityResult = checkDataIntegrity(key, dataToProcess);
    if (!integrityResult.valid) {
      result.warnings.push(...integrityResult.warnings);
      result.validationErrors.push(...integrityResult.errors);

      if (integrityResult.errors.some(e => e.severity === 'critical')) {
        result.error = 'Data integrity check failed with critical errors';
        if (opts.notifyUser) {
          storageNotifications.notify(`Data integrity check failed for ${key}`, 'error');
        }
        return result;
      }
    }

    // Step 7: Validate data structure
    let validationResult: any = { valid: true, errors: [], warnings: [], repairable: true };
    switch (key) {
      case 'leads':
        validationResult = validateLeadArray(dataToProcess) ?? validationResult;
        break;
      case 'leadColumnConfig':
        validationResult = validateColumnConfigArray(dataToProcess) ?? validationResult;
        break;
      case 'leadHeaderConfig':
        validationResult = validateHeaderConfigFields(dataToProcess) ?? validationResult;
        break;
      case 'savedViews':
        validationResult = validateSavedViewFields(dataToProcess) ?? validationResult;
        break;
      default:
        validationResult = { valid: true, errors: [], warnings: [], repairable: true };
    }

    if (!validationResult.valid) {
      result.validationErrors.push(...validationResult.errors);
      result.warnings.push(...validationResult.warnings);

      // Step 8: Attempt repair if validation fails
      if (opts.allowRepair && validationResult.repairable) {
        logStorage(`Attempting to repair ${key} data`, { key });
        if (opts.notifyUser) {
          storageNotifications.notify(`Attempting to repair ${key} data`, 'warning');
        }

        // Perform repair based on key
        switch (key) {
          case 'leads': {
            const repairResult = repairLeadArray(dataToProcess as any);
            if (repairResult && Array.isArray(repairResult.repaired) && repairResult.repaired.length > 0) {
              dataToProcess = repairResult.repaired as unknown as T;

              if (repairResult.removed && repairResult.removed > 0) {
                result.warnings.push(`${repairResult.removed} leads have validation errors but ${repairResult.repaired.length} leads are valid`);
              } else {
                result.warnings.push('Data was repaired automatically');
              }

              if (opts.notifyUser) {
                storageNotifications.notify('Data was repaired automatically', 'info');
              }

              result.data = dataToProcess;
              result.success = true;
              return result;
            }

            // If repair yielded nothing, fall through to recovery
            break;
          }

          case 'leadColumnConfig': {
            // Try repairing column config if function available
            // Repair logic for column config should be implemented in repairColumnConfig
            // For now, if repairColumnConfig exists, call it
            try {
              // @ts-ignore
              const repaired = (typeof repairColumnConfig === 'function') ? (repairColumnConfig as any)(dataToProcess) : null;
              if (repaired) {
                dataToProcess = repaired as unknown as T;
                result.warnings.push('Column config was repaired automatically');
                result.data = dataToProcess;
                result.success = true;
                return result;
              }
            } catch (e) {
              // ignore and proceed to recovery
            }

            break;
          }

          default:
            break;
        }

        // If we reach here, repair did not succeed; continue to recovery
      } else if (opts.strictValidation) {
        result.error = 'Data validation failed and repair is not possible or not allowed';
        return result;
      }
    }

    // Step 9: If repair fails or is not allowed, attempt backup recovery
    if (!validationResult.valid && !validationResult.repairable && opts.allowBackupRecovery) {
      result.recoveryAttempted = true;
      logStorage(`Attempting backup recovery for ${key}`, { key });
      
      if (opts.notifyUser) {
        storageNotifications.notify(`Attempting to recover ${key} from backup`, 'warning');
      }

      try {
        const recovery = await attemptBackupRecovery<T>(key);
        if (recovery.success && recovery.data) {
          result.wasRecovered = true;
          dataToProcess = recovery.data as unknown as T;
          if (opts.notifyUser) {
            storageNotifications.notify(`Successfully recovered ${key} from backup`, 'success');
          }

          result.data = dataToProcess;
          result.success = true;
          return result;
        }
      } catch (err) {
        // continue to fallback to default
      }
    }

    // Step 10: If all recovery fails, return default value
    if (!validationResult.valid && !validationResult.repairable && !result.wasRecovered) {
      result.data = defaultValue;
      result.warnings.push('Using default value due to validation failures');
      
      if (opts.notifyUser) {
        storageNotifications.notify(`Using default values for ${key} due to data corruption`, 'warning');
      }
    } else {
      result.data = dataToProcess;
    }

    // Step 11: Save validated/migrated data back to storage with version wrapper
    if (result.wasMigrated || result.wasRecovered) {
      const versionedData = wrapWithVersion(dataToProcess, key);
      const saveResult = await setItem(key, versionedData);
      if (!saveResult.success) {
        result.warnings.push(`Failed to save migrated data: ${saveResult.error}`);
      }
    }

    result.success = true;
    logStorage(`Successfully loaded ${key} data`, { 
      wasMigrated: result.wasMigrated, 
      wasRecovered: result.wasRecovered,
      warnings: result.warnings.length 
    });

    return result;

  } catch (error) {
    result.error = `Unexpected error during data loading: ${error instanceof Error ? error.message : 'Unknown error'}`;
    logStorage(`Error loading ${key} data`, { error: result.error });
    
    if (opts.notifyUser) {
      storageNotifications.notify(`Error loading ${key}: ${result.error}`, 'error');
    }
    
    return result;
  }
}

// Specialized load functions
export async function loadLeads(): Promise<DataLoadResult<Lead[]>> {
  return loadAndValidateData<Lead[]>('leads', []);
}

export async function loadColumnConfig(): Promise<DataLoadResult<ColumnConfig[]>> {
  // Use empty array as default since DEFAULT_COLUMNS is not available
  const result = await loadAndValidateData<ColumnConfig[]>('leadColumnConfig', []);
  // Debug: log result for troubleshooting
  // console.debug('loadColumnConfig result:', result);
  if (!result.success) {
    return { ...result, success: true, data: [] };
  }
  return result;
}

export async function loadHeaderConfig(): Promise<DataLoadResult<HeaderConfig>> {
  const result = await loadAndValidateData<HeaderConfig>('leadHeaderConfig', DEFAULT_HEADER_LABELS);
  if (!result.success) {
    return { ...result, success: true, data: DEFAULT_HEADER_LABELS };
  }
  return result;
}

export async function loadSavedViews(): Promise<DataLoadResult<SavedView[]>> {
  const result = await loadAndValidateData<SavedView[]>('savedViews', []);
  if (!result.success) {
    return { ...result, success: true, data: [] };
  }
  return result;
}

// Recovery helpers
export async function attemptBackupRecovery<T>(key: string): Promise<{ success: boolean; data: T | null; error: string | null }> {
  try {
    const result = restoreFromBackup(key);
    if (result && result.success) {
      const restored = result.data as T | null;
      if (!restored) {
        return { success: false, data: null, error: 'No backup data available' };
      }

      const integrityResult = checkDataIntegrity(key, restored);
      if (integrityResult.valid) {
        return { success: true, data: restored, error: null };
      } else {
        return { success: false, data: null, error: 'Recovered data failed integrity check' };
      }
    } else {
      return { success: false, data: null, error: result.error || 'No backup available' };
    }
  } catch (error) {
    return { success: false, data: null, error: `Backup recovery failed: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}

export function attemptPartialRecovery<T>(data: T[], validator: (item: any) => boolean): { recovered: T[]; removed: number } {
  const recovered: T[] = [];
  let removed = 0;

  for (const item of data) {
    if (validator(item)) {
      recovered.push(item);
    } else {
      removed++;
    }
  }

  return { recovered, removed };
}
