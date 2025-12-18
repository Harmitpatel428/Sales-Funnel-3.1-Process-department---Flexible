'use client';

import type { Lead, MobileNumber, SavedView } from '../types/shared';
import type { ColumnConfig } from '../types/shared';
import type { HeaderConfig } from '../context/HeaderContext';
import { formatDateToDDMMYYYY, parseDateFromDDMMYYYY } from '../utils/dateUtils';
import { DEFAULT_HEADER_LABELS } from '../constants/columnConfig';
import { createBackup, restoreFromBackup } from './storage';
import { generateUUID } from './uuid';

// Generic migration function type
export type MigrationFunction<TInput = unknown, TOutput = unknown> = (data: TInput) => { success: boolean; data: TOutput; errors: string[] };

// Specific migration types
export type LeadMigrationFunction = MigrationFunction<Lead[] | Lead, Lead[] | Lead>;
export type ColumnMigrationFunction = MigrationFunction<ColumnConfig[], ColumnConfig[]>;
export type HeaderMigrationFunction = MigrationFunction<HeaderConfig, HeaderConfig>;
export type SavedViewMigrationFunction = MigrationFunction<SavedView[], SavedView[]>;

// Migration registry interface
export interface MigrationRegistry<TInput = unknown, TOutput = unknown> {
  fromVersion: string;
  toVersion: string;
  migrate: MigrationFunction<TInput, TOutput>;
  description: string;
}

// Migration result interface
export interface MigrationResult {
  success: boolean;
  data: any;
  migratedFrom: string;
  migratedTo: string;
  errors: string[];
  warnings: string[];
}

// Lead migrations
const leadMigrations: MigrationRegistry[] = [
  {
    fromVersion: '0.9',
    toVersion: '1.0',
    migrate: (data: any) => {
      const errors: string[] = [];
      
      try {
        // Handle array of leads
        if (Array.isArray(data)) {
          const migratedLeads = data.map((lead: any) => migrateLeadFrom09To10(lead, errors));
          return { success: errors.length === 0, data: migratedLeads, errors };
        }
        
        // Handle single lead
        const migratedLead = migrateLeadFrom09To10(data, errors);
        return { success: errors.length === 0, data: migratedLead, errors };
      } catch (error) {
        errors.push(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return { success: false, data, errors };
      }
    },
    description: 'Migrate from legacy format: add version wrapper, migrate mobileNumber to mobileNumbers array, add boolean flags, standardize dates'
  }
];

// Column config migrations
const columnMigrations: MigrationRegistry[] = [
  {
    fromVersion: '0.9',
    toVersion: '1.0',
    migrate: (data: any) => {
      const errors: string[] = [];
      
      try {
        if (Array.isArray(data)) {
          const migratedColumns = data.map((config: any) => migrateColumnConfigFrom09To10(config, errors));
          return { success: errors.length === 0, data: migratedColumns, errors };
        }
        
        const migratedConfig = migrateColumnConfigFrom09To10(data, errors);
        return { success: errors.length === 0, data: migratedConfig, errors };
      } catch (error) {
        errors.push(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return { success: false, data, errors };
      }
    },
    description: 'Migrate column configs: ensure ID field exists, add visible field, validate types and widths'
  }
];

// Header config migrations
const headerMigrations: MigrationRegistry[] = [
  {
    fromVersion: '0.9',
    toVersion: '1.0',
    migrate: (data: any) => {
      const errors: string[] = [];
      
      try {
        const migratedHeaders = migrateHeaderConfigFrom09To10(data, errors);
        return { success: errors.length === 0, data: migratedHeaders, errors };
      } catch (error) {
        errors.push(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return { success: false, data, errors };
      }
    },
    description: 'Migrate header configs: sanitize labels, merge with defaults, remove invalid entries'
  }
];

// Saved view migrations
const viewMigrations: MigrationRegistry[] = [
  {
    fromVersion: '0.9',
    toVersion: '1.0',
    migrate: (data: any) => {
      const errors: string[] = [];
      
      try {
        if (Array.isArray(data)) {
          const migratedViews = data.map((view: any) => migrateSavedViewFrom09To10(view, errors));
          return { success: errors.length === 0, data: migratedViews, errors };
        }
        
        const migratedView = migrateSavedViewFrom09To10(data, errors);
        return { success: errors.length === 0, data: migratedView, errors };
      } catch (error) {
        errors.push(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return { success: false, data, errors };
      }
    },
    description: 'Migrate saved views: ensure ID exists, validate filters structure, remove invalid properties'
  }
];

// Migration execution functions
export function runMigrations(key: string, data: any, currentVersion: string, targetVersion: string): MigrationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  try {
    // Get appropriate migration registry
    let migrations: MigrationRegistry[];
    switch (key) {
      case 'leads':
        migrations = leadMigrations;
        break;
      case 'leadColumnConfig':
        migrations = columnMigrations;
        break;
      case 'leadHeaderConfig':
        migrations = headerMigrations;
        break;
      case 'savedViews':
        migrations = viewMigrations;
        break;
      default:
        return {
          success: false,
          data,
          migratedFrom: currentVersion,
          migratedTo: targetVersion,
          errors: [`No migration path found for key: ${key}`],
          warnings
        };
    }
    
    // Get migration path
    const migrationPath = getMigrationPath(currentVersion, targetVersion, migrations);
    if (migrationPath.length === 0) {
      return {
        success: true,
        data,
        migratedFrom: currentVersion,
        migratedTo: targetVersion,
        errors,
        warnings: ['No migration needed']
      };
    }
    
    // Create backup before migration
    const backupResult = createBackup(key);
    if (!backupResult.success) {
      warnings.push('Failed to create backup before migration');
    }
    
    // Execute migrations in sequence
    let currentData = data;
    let fromVersion = currentVersion;
    
    for (const migration of migrationPath) {
      const result = migration.migrate(currentData);
      if (!result.success) {
        return {
          success: false,
          data: currentData,
          migratedFrom: fromVersion,
          migratedTo: migration.toVersion,
          errors: [...errors, ...result.errors],
          warnings
        };
      }
      
      currentData = result.data;
      fromVersion = migration.toVersion;
      errors.push(...result.errors);
    }
    
    return {
      success: true,
      data: currentData,
      migratedFrom: currentVersion,
      migratedTo: targetVersion,
      errors,
      warnings
    };
    
  } catch (error) {
    return {
      success: false,
      data,
      migratedFrom: currentVersion,
      migratedTo: targetVersion,
      errors: [`Migration execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      warnings
    };
  }
}

export function getMigrationPath(fromVersion: string, toVersion: string, migrations: MigrationRegistry[]): MigrationRegistry[] {
  if (fromVersion === toVersion) {
    return [];
  }
  
  // Sort migrations by version
  const sortedMigrations = migrations.sort((a, b) => {
    const aFrom = parseFloat(a.fromVersion);
    const bFrom = parseFloat(b.fromVersion);
    return aFrom - bFrom;
  });
  
  // Find migration path
  const path: MigrationRegistry[] = [];
  let currentVersion = fromVersion;
  
  while (currentVersion !== toVersion) {
    const nextMigration = sortedMigrations.find(m => m.fromVersion === currentVersion);
    if (!nextMigration) {
      throw new Error(`No migration found from version ${currentVersion} to ${toVersion}`);
    }
    
    path.push(nextMigration);
    currentVersion = nextMigration.toVersion;
    
    // Prevent infinite loops
    if (path.length > 10) {
      throw new Error('Migration path too long, possible circular dependency');
    }
  }
  
  return path;
}

// Migration helper functions
export function needsMigration(currentVersion: string, targetVersion: string): boolean {
  return currentVersion !== targetVersion;
}

export function canMigrate(key: string, fromVersion: string): boolean {
  try {
    let migrations: MigrationRegistry[];
    switch (key) {
      case 'leads':
        migrations = leadMigrations;
        break;
      case 'leadColumnConfig':
        migrations = columnMigrations;
        break;
      case 'leadHeaderConfig':
        migrations = headerMigrations;
        break;
      case 'savedViews':
        migrations = viewMigrations;
        break;
      default:
        return false;
    }
    
    return migrations.some(m => m.fromVersion === fromVersion);
  } catch {
    return false;
  }
}

export function getMigrationDescription(fromVersion: string, toVersion: string): string {
  if (fromVersion === toVersion) {
    return 'No migration needed';
  }
  
  return `Migrate data from version ${fromVersion} to ${toVersion}`;
}

// Rollback support
export function rollbackMigration(key: string): boolean {
  try {
    const result = restoreFromBackup(key);
    return result.success;
  } catch {
    return false;
  }
}

// Individual migration functions
function migrateLeadFrom09To10(lead: any, errors: string[]): Lead {
  const migrated: any = { ...lead };
  
  // Generate missing ID
  // Basic validation: ensure we have something that looks like a lead
  if (!lead || typeof lead !== 'object' || (!lead.clientName && !lead.company && !lead.mobileNumber && !Array.isArray(lead.mobileNumbers))) {
    errors.push('Invalid lead data');
    return lead as Lead;
  }

  if (!migrated.id || typeof migrated.id !== 'string') {
    migrated.id = generateUUID();
  }
  
  // Migrate mobileNumber string to mobileNumbers array
  if (!Array.isArray(migrated.mobileNumbers)) {
    if (migrated.mobileNumber && typeof migrated.mobileNumber === 'string') {
      migrated.mobileNumbers = [{
        id: generateUUID(),
        number: migrated.mobileNumber,
        name: 'Primary',
        isMain: true
      }];
    } else {
      migrated.mobileNumbers = [{
        id: generateUUID(),
        number: '',
        name: 'Primary',
        isMain: true
      }];
    }
  }
  
  // Add missing boolean flags
  if (typeof migrated.isDone !== 'boolean') {
    migrated.isDone = false;
  }
  if (typeof migrated.isDeleted !== 'boolean') {
    migrated.isDeleted = false;
  }
  if (typeof migrated.isUpdated !== 'boolean') {
    migrated.isUpdated = false;
  }
  
  // Add activities array if missing
  if (!Array.isArray(migrated.activities)) {
    migrated.activities = [];
  }
  
  // Convert date formats to DD-MM-YYYY. Support legacy ISO strings and DD-MM-YYYY
  if (migrated.followUpDate && typeof migrated.followUpDate === 'string') {
    try {
      // Try ISO parse first
      const iso = new Date(migrated.followUpDate);
      if (!isNaN(iso.getTime())) {
        migrated.followUpDate = formatDateToDDMMYYYY(iso.toISOString());
      } else {
        const parsedDate = parseDateFromDDMMYYYY(migrated.followUpDate);
        if (parsedDate) {
          migrated.followUpDate = formatDateToDDMMYYYY(parsedDate.toISOString());
        } else {
          errors.push('Invalid followUpDate format');
        }
      }
    } catch (error) {
      errors.push(`Failed to convert followUpDate: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  if (migrated.lastActivityDate && typeof migrated.lastActivityDate === 'string') {
    try {
      const iso = new Date(migrated.lastActivityDate);
      if (!isNaN(iso.getTime())) {
        migrated.lastActivityDate = formatDateToDDMMYYYY(iso.toISOString());
      } else {
        const parsedDate = parseDateFromDDMMYYYY(migrated.lastActivityDate);
        if (parsedDate) {
          migrated.lastActivityDate = formatDateToDDMMYYYY(parsedDate.toISOString());
        } else {
          errors.push('Invalid lastActivityDate format');
        }
      }
    } catch (error) {
      errors.push(`Failed to convert lastActivityDate: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  return migrated as Lead;
}

function migrateColumnConfigFrom09To10(config: any, errors: string[]): ColumnConfig {
  const migrated: any = { ...config };
  
  // Ensure ID field exists
  if (!migrated.id || typeof migrated.id !== 'string') {
    if (migrated.fieldKey && typeof migrated.fieldKey === 'string') {
      migrated.id = migrated.fieldKey;
    } else {
      migrated.id = generateUUID();
    }
  }
  
  // Add visible field if missing
  if (typeof migrated.visible !== 'boolean') {
    migrated.visible = true;
  }
  
  // Add description field if missing
  if (!migrated.description || typeof migrated.description !== 'string') {
    migrated.description = '';
  }
  
  // Validate and fix type field
  const validTypes = ['text', 'date', 'select', 'number', 'email', 'phone'];
  if (!migrated.type || !validTypes.includes(migrated.type)) {
    migrated.type = 'text';
    // Non-fatal correction - do not push to errors
  }
  
  // Validate and fix width (normalize legacy widths to a sensible maximum)
  if (typeof migrated.width !== 'number' || migrated.width < 50 || migrated.width > 150) {
    migrated.width = 150;
    // Non-fatal correction
  }
  
  // Ensure options array for select type
  if (migrated.type === 'select' && (!Array.isArray(migrated.options) || migrated.options.length === 0)) {
    migrated.options = ['Option 1'];
    // Non-fatal correction
  }
  
  return migrated as ColumnConfig;
}

function migrateHeaderConfigFrom09To10(config: any, errors: string[]): HeaderConfig {
  const migrated: any = { ...DEFAULT_HEADER_LABELS };
  
  if (config && typeof config === 'object') {
    // Merge with existing config, sanitizing values
    for (const [key, value] of Object.entries(config)) {
      if (typeof key === 'string' && typeof value === 'string' && value.trim() !== '') {
        // Sanitize header name
        const sanitized = value
          .trim()
          .replace(/[^a-zA-Z0-9\s\-_]/g, '') // Remove invalid characters
          .replace(/\s+/g, ' ') // Normalize spaces
          .substring(0, 50); // Limit length
        
        if (sanitized !== value) {
          // Sanitization performed — treat as non-fatal correction (no error)
        }
        
        migrated[key] = sanitized;
      }
    }
  }
  
  return migrated as HeaderConfig;
}

function migrateSavedViewFrom09To10(view: any, errors: string[]): SavedView {
  const migrated: any = { ...view };
  
  // Ensure ID exists
  if (!migrated.id || typeof migrated.id !== 'string') {
    migrated.id = generateUUID();
  }
  
  // Validate filters object
  if (!migrated.filters || typeof migrated.filters !== 'object') {
    migrated.filters = {};
  }
  
  // Remove invalid filter properties
  const validFilterKeys = ['status', 'followUpDateStart', 'followUpDateEnd', 'searchTerm'];
  const filters = migrated.filters;
  for (const key of Object.keys(filters)) {
    if (!validFilterKeys.includes(key)) {
      delete filters[key];
      // Non-fatal correction
    }
  }
  
  // Ensure status is array if present
  if (filters.status && !Array.isArray(filters.status)) {
    filters.status = [filters.status];
    // Non-fatal correction
  }
  
  return migrated as SavedView;
}
