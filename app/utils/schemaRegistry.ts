'use client';

import type { Lead, MobileNumber, Activity, SavedView, LeadFilters } from '../types/shared';
import type { ColumnConfig } from '../types/shared';
import { HeaderConfig } from '../context/HeaderContext';
import { debugLogger, DebugCategory } from './debugLogger';

// Schema version constants
export const CURRENT_SCHEMA_VERSION = '1.0';
export const MIN_SUPPORTED_VERSION = '0.9';

// Schema version constants for each data type
export const LEAD_SCHEMA_VERSION = '1.0';
export const COLUMN_SCHEMA_VERSION = '1.0';
export const HEADER_SCHEMA_VERSION = '1.0';
export const SAVED_VIEW_SCHEMA_VERSION = '1.0';

// Schema definitions extending existing interfaces
export interface LeadSchema extends Lead {
  // All fields from Lead interface are required for schema validation
  id: string;
  clientName: string;
  mobileNumbers: MobileNumber[];
  status: 'New' | 'CNR' | 'Busy' | 'Follow-up' | 'Deal Close' | 'Work Alloted' | 'Hotlead' | 'Mandate Sent' | 'Documentation' | 'Others';
  followUpDate: string;
  lastActivityDate: string;
  isDone: boolean;
  isDeleted: boolean;
  isUpdated: boolean;
  activities: Activity[];
}

export interface ColumnConfigSchema extends ColumnConfig {
  // All fields from ColumnConfig interface are required for schema validation
  id: string;
  fieldKey: string;
  label: string;
  type: 'text' | 'date' | 'select' | 'number' | 'email' | 'phone';
  required: boolean;
  sortable: boolean;
  width: number;
  visible: boolean;
}

export interface HeaderConfigSchema extends HeaderConfig {
  // HeaderConfig is already Record<string, string>, no additional fields needed
}

export interface SavedViewSchema extends SavedView {
  // All fields from SavedView interface are required for schema validation
  id: string;
  name: string;
  filters: LeadFilters;
}

// Versioned data wrapper
export interface VersionedData<T> {
  version: string;
  data: T;
  timestamp: string;
  migratedFrom?: string;
}

// Schema metadata interface
export interface SchemaMetadata {
  version: string;
  requiredFields: string[];
  optionalFields: string[];
  fieldTypes: Record<string, string>;
  description: string;
}

// Schema metadata for each data type
export const LEAD_SCHEMA_METADATA: SchemaMetadata = {
  version: LEAD_SCHEMA_VERSION,
  requiredFields: ['id', 'clientName', 'mobileNumbers', 'status', 'followUpDate', 'lastActivityDate', 'isDone', 'isDeleted', 'isUpdated', 'activities'],
  optionalFields: ['kva', 'connectionDate', 'consumerNumber', 'company', 'discom', 'gidc', 'gstNumber', 'mobileNumber', 'companyLocation', 'unitType', 'marketingObjective', 'budget', 'timeline', 'contactOwner', 'finalConclusion', 'notes', 'mandateStatus', 'documentStatus'],
  fieldTypes: {
    id: 'string',
    kva: 'string',
    connectionDate: 'string',
    consumerNumber: 'string',
    company: 'string',
    clientName: 'string',
    discom: 'string',
    gidc: 'string',
    gstNumber: 'string',
    mobileNumbers: 'array',
    mobileNumber: 'string',
    companyLocation: 'string',
    unitType: 'string',
    marketingObjective: 'string',
    budget: 'string',
    timeline: 'string',
    status: 'string',
    contactOwner: 'string',
    lastActivityDate: 'string',
    followUpDate: 'string',
    finalConclusion: 'string',
    notes: 'string',
    isDone: 'boolean',
    isDeleted: 'boolean',
    isUpdated: 'boolean',
    activities: 'array',
    mandateStatus: 'string',
    documentStatus: 'string'
  },
  description: 'Lead data structure with all required and optional fields'
};

export const COLUMN_CONFIG_SCHEMA_METADATA: SchemaMetadata = {
  version: COLUMN_SCHEMA_VERSION,
  requiredFields: ['id', 'fieldKey', 'label', 'type', 'required', 'sortable', 'width', 'visible'],
  optionalFields: ['options', 'defaultValue', 'description'],
  fieldTypes: {
    id: 'string',
    fieldKey: 'string',
    label: 'string',
    type: 'string',
    required: 'boolean',
    sortable: 'boolean',
    width: 'number',
    visible: 'boolean',
    options: 'array',
    defaultValue: 'any',
    description: 'string'
  },
  description: 'Column configuration structure for dynamic table columns'
};

export const HEADER_CONFIG_SCHEMA_METADATA: SchemaMetadata = {
  version: HEADER_SCHEMA_VERSION,
  requiredFields: [],
  optionalFields: [],
  fieldTypes: {},
  description: 'Header configuration mapping field keys to display labels'
};

export const SAVED_VIEW_SCHEMA_METADATA: SchemaMetadata = {
  version: SAVED_VIEW_SCHEMA_VERSION,
  requiredFields: ['id', 'name', 'filters'],
  optionalFields: [],
  fieldTypes: {
    id: 'string',
    name: 'string',
    filters: 'object'
  },
  description: 'Saved view structure for storing filter configurations'
};

// Schema registry map
export const SCHEMA_REGISTRY: Record<string, SchemaMetadata> = {
  'leads': LEAD_SCHEMA_METADATA,
  'savedViews': SAVED_VIEW_SCHEMA_METADATA,
  'leadColumnConfig': COLUMN_CONFIG_SCHEMA_METADATA,
  'leadHeaderConfig': HEADER_CONFIG_SCHEMA_METADATA
};

// Utility functions
export function getSchemaVersion(key: string): string {
  const metadata = SCHEMA_REGISTRY[key];
  return metadata ? metadata.version : CURRENT_SCHEMA_VERSION;
}

export function getSchemaMetadata(key: string): SchemaMetadata {
  const metadata = SCHEMA_REGISTRY[key];
  if (!metadata) {
    throw new Error(`No schema metadata found for key: ${key}`);
  }
  return metadata;
}

export function isVersionedData(data: any): data is VersionedData<any> {
  return (
    data &&
    typeof data === 'object' &&
    typeof data.version === 'string' &&
    'data' in data &&
    typeof data.timestamp === 'string'
  );
}

export function wrapWithVersion<T>(data: T, key: string): VersionedData<T> {
  return {
    version: getSchemaVersion(key),
    data,
    timestamp: new Date().toISOString()
  };
}

export function unwrapVersionedData<T>(versionedData: VersionedData<T>): T {
  return versionedData.data;
}

// Version comparison functions
export function compareVersions(v1: string, v2: string): number {
  const parseVersion = (version: string): number[] => {
    return version.split('.').map(part => {
      const num = parseInt(part, 10);
      if (isNaN(num)) {
        throw new Error(`Invalid version format: ${version}`);
      }
      return num;
    });
  };

  try {
    const parts1 = parseVersion(v1);
    const parts2 = parseVersion(v2);
    
    // Pad arrays to same length
    const maxLength = Math.max(parts1.length, parts2.length);
    while (parts1.length < maxLength) parts1.push(0);
    while (parts2.length < maxLength) parts2.push(0);
    
    for (let i = 0; i < maxLength; i++) {
      if (parts1[i] < parts2[i]) return -1;
      if (parts1[i] > parts2[i]) return 1;
    }
    
    return 0;
  } catch (error) {
    throw new Error(`Version comparison failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function isNewerVersion(current: string, target: string): boolean {
  return compareVersions(current, target) < 0;
}

export function areVersionsCompatible(v1: string, v2: string): boolean {
  const parts1 = v1.split('.');
  const parts2 = v2.split('.');
  
  // Major version changes are incompatible
  return parts1[0] === parts2[0];
}

export function getCompatibilityMessage(fromVersion: string, toVersion: string): string {
  if (fromVersion === toVersion) {
    return 'Versions are identical';
  }
  
  if (!areVersionsCompatible(fromVersion, toVersion)) {
    return `Major version change from ${fromVersion} to ${toVersion} - breaking changes may occur`;
  }
  
  if (isNewerVersion(fromVersion, toVersion)) {
    return `Upgrade from ${fromVersion} to ${toVersion} - new features and improvements`;
  } else {
    return `Downgrade from ${fromVersion} to ${toVersion} - some features may be lost`;
  }
}

// Schema export/import functions
export function exportSchemaDefinitions(): string {
  const schemaExport = {
    version: CURRENT_SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
    schemas: SCHEMA_REGISTRY,
    constants: {
      CURRENT_SCHEMA_VERSION,
      MIN_SUPPORTED_VERSION,
      LEAD_SCHEMA_VERSION,
      COLUMN_SCHEMA_VERSION,
      HEADER_SCHEMA_VERSION,
      SAVED_VIEW_SCHEMA_VERSION
    }
  };
  
  return JSON.stringify(schemaExport, null, 2);
}

export function validateImportedSchema(schemaJson: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  try {
    let imported;
    try {
      imported = JSON.parse(schemaJson);
    } catch (parseError) {
      debugLogger.error(DebugCategory.VALIDATION, 'Schema import failed: Invalid JSON format', { 
        error: parseError instanceof Error ? parseError.message : String(parseError)
      });
      errors.push('Invalid JSON format. Please check the schema file.');
      return { valid: false, errors };
    }
    
    if (!imported.version) {
      errors.push('Schema version is required');
    }
    
    if (!imported.schemas || typeof imported.schemas !== 'object') {
      errors.push('Schema definitions are required');
    }
    
    if (!imported.constants || typeof imported.constants !== 'object') {
      errors.push('Schema constants are required');
    }
    
    // Validate each schema
    if (imported.schemas) {
      Object.entries(imported.schemas).forEach(([key, schema]: [string, any]) => {
        if (!schema.version) {
          errors.push(`Schema ${key} is missing version`);
        }
        if (!Array.isArray(schema.requiredFields)) {
          errors.push(`Schema ${key} is missing requiredFields array`);
        }
        if (!Array.isArray(schema.optionalFields)) {
          errors.push(`Schema ${key} is missing optionalFields array`);
        }
        if (!schema.fieldTypes || typeof schema.fieldTypes !== 'object') {
          errors.push(`Schema ${key} is missing fieldTypes object`);
        }
      });
    }
    
    // Check for version conflicts
    if (imported.constants) {
      Object.entries(imported.constants).forEach(([key, version]: [string, any]) => {
        if (typeof version !== 'string') {
          errors.push(`Constant ${key} must be a string`);
        }
      });
    }
    
  } catch (error) {
    errors.push(`Invalid JSON format: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}
