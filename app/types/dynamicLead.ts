/**
 * Type-safe dynamic property system for Lead objects
 * 
 * This module provides a comprehensive type system that allows runtime column addition
 * while maintaining TypeScript type safety. It eliminates the need for `as any` assertions
 * when working with dynamic lead properties.
 */

import type { Lead, ColumnConfig } from './shared';

/**
 * Union type representing all possible values for dynamic fields
 * This replaces `any` for dynamic field values
 */
export type FieldValue = string | number | boolean | Date | null | undefined;

/**
 * Extended Lead type with index signature for custom fields
 * Use this instead of `Lead & Record<string, any>`
 * Preserves type safety for known Lead properties while allowing dynamic ones
 */
export type DynamicLead = Lead & { [key: string]: FieldValue };

/**
 * Typed column config with proper defaultValue typing
 * Replaces `any` in ColumnConfig interface
 */
export type TypedColumnConfig = Omit<ColumnConfig, 'defaultValue'> & { 
  defaultValue?: FieldValue 
};

/**
 * Type alias for column config arrays
 * Use this instead of `any[]` for column config parameters
 */
export type ColumnConfigArray = ColumnConfig[];

/**
 * Type guard to check if a property exists on a lead object
 * @param lead - The lead object to check
 * @param key - The property key to check for
 * @returns Type predicate indicating if the key exists on the lead
 */
export function hasLeadProperty(lead: Lead, key: string): key is keyof Lead {
  return key in lead;
}

/**
 * Checks if a field key is in the base Lead interface
 * @param key - The field key to check
 * @returns True if the field is a standard Lead property, false for custom fields
 */
export function isKnownLeadField(key: string): key is keyof Lead {
  const knownFields: (keyof Lead)[] = [
    'id', 'kva', 'connectionDate', 'consumerNumber', 'company', 'clientName', 'discom', 'gidc', 'gstNumber', 
    'mobileNumbers', 'mobileNumber', 'companyLocation', 'unitType', 'marketingObjective', 'budget', 'timeline', 
    'status', 'contactOwner', 'lastActivityDate', 'followUpDate', 'finalConclusion', 'notes', 'isDone', 
    'isDeleted', 'isUpdated', 'activities', 'mandateStatus', 'documentStatus'
  ];
  return knownFields.includes(key as keyof Lead);
}

/**
 * Checks if a field is a custom dynamic column
 * @param key - The field key to check
 * @param columns - Array of column configurations
 * @returns True if the field is a custom column not in base Lead interface
 */
export function isDynamicField(key: string, columns: ColumnConfig[]): boolean {
  return !isKnownLeadField(key) && columns.some(col => col.fieldKey === key);
}

/**
 * Type-safe property accessor for DynamicLead objects
 * @param lead - The lead object to access
 * @param key - The property key to access
 * @returns The property value with proper typing, or undefined if not found
 */
export function getLeadPropertySafe(lead: DynamicLead, key: string): FieldValue {
  return lead[key];
}

/**
 * Type-safe property setter for DynamicLead objects
 * @param lead - The lead object to update
 * @param key - The property key to set
 * @param value - The value to set
 * @returns New lead object with property set (immutable update)
 */
export function setLeadPropertySafe(lead: DynamicLead, key: string, value: FieldValue): DynamicLead {
  return {
    ...lead,
    [key]: value
  };
}

/**
 * Validates if a value matches the expected column type
 * @param value - The value to validate
 * @param columnType - The expected column type
 * @returns True if valid, false otherwise
 */
export function validateFieldValue(value: FieldValue, columnType: ColumnConfig['type']): boolean {
  if (value === null || value === undefined) {
    return true; // null/undefined are always valid
  }

  switch (columnType) {
    case 'text':
    case 'email':
    case 'phone':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !isNaN(value);
    case 'date':
      return value instanceof Date || typeof value === 'string';
    case 'select':
      return typeof value === 'string' || Array.isArray(value);
    default:
      return true; // Unknown types are considered valid
  }
}

/**
 * Safely converts a value to match the expected column type
 * @param value - The value to convert
 * @param columnType - The target column type
 * @returns Converted value or null if conversion fails
 */
export function coerceFieldValue(value: unknown, columnType: ColumnConfig['type']): FieldValue {
  if (value === null || value === undefined) {
    return value;
  }

  try {
    switch (columnType) {
      case 'text':
      case 'email':
      case 'phone':
        return String(value);
      
      case 'number':
        const num = Number(value);
        return isNaN(num) ? null : num;
      
      case 'date':
        if (value instanceof Date) {
          return value;
        }
        if (typeof value === 'string') {
          const date = new Date(value);
          return isNaN(date.getTime()) ? null : date;
        }
        return null;
      
      case 'select':
        return String(value);
      
      default:
        return String(value);
    }
  } catch (error) {
    console.warn(`Failed to coerce value "${value}" to type "${columnType}":`, error);
    return null;
  }
}

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
    'name' in item
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
    'fieldKey' in item && 
    'label' in item && 
    'type' in item
  );
}

/**
 * Helper type for leads with validation errors
 */
export type LeadWithValidation = DynamicLead & { 
  validationErrors?: string[] 
};

/**
 * Helper type for leads with custom fields
 */
export type LeadWithCustomFields = DynamicLead & {
  customFields?: Record<string, FieldValue>
};
