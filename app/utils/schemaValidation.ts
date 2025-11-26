'use client';

import type { Lead, MobileNumber, Activity, SavedView, LeadFilters } from '../types/shared';
import type { ColumnConfig } from '../types/shared';
import { HeaderConfig } from '../context/HeaderContext';
import { validateDateString, formatDateToDDMMYYYY, parseDateFromDDMMYYYY } from '../utils/dateUtils';
import { getSchemaMetadata } from './schemaRegistry';
import { generateUUID } from './uuid';

// Validation result interfaces
export interface ValidationError {
  field: string;
  message: string;
  severity: 'critical' | 'error' | 'warning';
  actualValue: any;
  expectedType: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
  repairable: boolean;
}

// Type guards
export function isLead(data: any): data is Lead {
  if (!data || typeof data !== 'object') return false;
  
  // Check required fields
  const requiredFields = ['id', 'clientName', 'status', 'followUpDate', 'lastActivityDate'];
  for (const field of requiredFields) {
    if (!(field in data)) return false;
  }
  
  // Check field types
  if (typeof data.id !== 'string') return false;
  if (typeof data.clientName !== 'string') return false;
  if (typeof data.status !== 'string') return false;
  if (typeof data.followUpDate !== 'string') return false;
  if (typeof data.lastActivityDate !== 'string') return false;
  if (typeof data.isDone !== 'boolean') return false;
  if (typeof data.isDeleted !== 'boolean') return false;
  if (typeof data.isUpdated !== 'boolean') return false;
  
  // Check mobileNumbers array
  if (!Array.isArray(data.mobileNumbers)) return false;
  if (data.mobileNumbers.length === 0) return false;
  
  // Check activities array
  if (!Array.isArray(data.activities)) return false;
  
  return true;
}

export function isColumnConfig(data: any): data is ColumnConfig {
  if (!data || typeof data !== 'object') return false;
  
  const requiredFields = ['id', 'fieldKey', 'label', 'type', 'required', 'sortable', 'width', 'visible'];
  for (const field of requiredFields) {
    if (!(field in data)) return false;
  }
  
  if (typeof data.id !== 'string') return false;
  if (typeof data.fieldKey !== 'string') return false;
  if (typeof data.label !== 'string') return false;
  if (typeof data.type !== 'string') return false;
  if (typeof data.required !== 'boolean') return false;
  if (typeof data.sortable !== 'boolean') return false;
  if (typeof data.width !== 'number') return false;
  if (typeof data.visible !== 'boolean') return false;
  
  const validTypes = ['text', 'date', 'select', 'number', 'email', 'phone'];
  if (!validTypes.includes(data.type)) return false;
  
  if (data.type === 'select' && (!Array.isArray(data.options) || data.options.length === 0)) {
    return false;
  }
  
  return true;
}

export function isHeaderConfig(data: any): data is HeaderConfig {
  if (!data || typeof data !== 'object') return false;
  
  // HeaderConfig is Record<string, string>
  for (const [key, value] of Object.entries(data)) {
    if (typeof key !== 'string' || typeof value !== 'string') return false;
    if (value.trim() === '') return false;
  }
  
  return true;
}

export function isSavedView(data: any): data is SavedView {
  if (!data || typeof data !== 'object') return false;
  
  const requiredFields = ['id', 'name', 'filters'];
  for (const field of requiredFields) {
    if (!(field in data)) return false;
  }
  
  if (typeof data.id !== 'string') return false;
  if (typeof data.name !== 'string') return false;
  if (typeof data.filters !== 'object') return false;
  
  return true;
}

// Field-level validators
export function validateLeadFields(lead: any): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];
  let repairable = true;
  
  // Check required fields
  const requiredFields = ['id', 'clientName', 'mobileNumbers', 'status', 'followUpDate', 'lastActivityDate', 'isDone', 'isDeleted', 'isUpdated', 'activities'];
  for (const field of requiredFields) {
    if (!(field in lead)) {
      errors.push({
        field,
        message: `Required field '${field}' is missing`,
        severity: 'critical',
        actualValue: undefined,
        expectedType: getFieldType(field)
      });
      repairable = false;
    }
  }
  
  // Validate field types
  if (lead.id !== undefined && typeof lead.id !== 'string') {
    errors.push({
      field: 'id',
      message: 'ID must be a string',
      severity: 'critical',
      actualValue: lead.id,
      expectedType: 'string'
    });
    repairable = false;
  }
  
  if (lead.clientName !== undefined && typeof lead.clientName !== 'string') {
    errors.push({
      field: 'clientName',
      message: 'Client name must be a string',
      severity: 'error',
      actualValue: lead.clientName,
      expectedType: 'string'
    });
  }
  
  if (lead.status !== undefined && typeof lead.status !== 'string') {
    errors.push({
      field: 'status',
      message: 'Status must be a string',
      severity: 'error',
      actualValue: lead.status,
      expectedType: 'string'
    });
  }
  
  // Validate status enum
  const validStatuses = ['New', 'CNR', 'Busy', 'Follow-up', 'Deal Close', 'Work Alloted', 'Hotlead', 'Mandate Sent', 'Documentation', 'Others'];
  if (lead.status && !validStatuses.includes(lead.status)) {
    errors.push({
      field: 'status',
      message: `Invalid status value. Must be one of: ${validStatuses.join(', ')}`,
      severity: 'error',
      actualValue: lead.status,
      expectedType: 'enum'
    });
  }
  
  // Validate dates
  if (lead.followUpDate && !validateDateString(lead.followUpDate).valid) {
    errors.push({
      field: 'followUpDate',
      message: 'Follow-up date must be in DD-MM-YYYY format',
      severity: 'error',
      actualValue: lead.followUpDate,
      expectedType: 'date (DD-MM-YYYY)'
    });
  }
  
  if (lead.lastActivityDate && !validateDateString(lead.lastActivityDate).valid) {
    errors.push({
      field: 'lastActivityDate',
      message: 'Last activity date must be in DD-MM-YYYY format',
      severity: 'error',
      actualValue: lead.lastActivityDate,
      expectedType: 'date (DD-MM-YYYY)'
    });
  }
  
  // Validate mobileNumbers array
  if (lead.mobileNumbers !== undefined) {
    if (!Array.isArray(lead.mobileNumbers)) {
      errors.push({
        field: 'mobileNumbers',
        message: 'Mobile numbers must be an array',
        severity: 'error',
        actualValue: lead.mobileNumbers,
        expectedType: 'array'
      });
    } else if (lead.mobileNumbers.length === 0) {
      errors.push({
        field: 'mobileNumbers',
        message: 'At least one mobile number is required',
        severity: 'error',
        actualValue: lead.mobileNumbers,
        expectedType: 'array with at least one item'
      });
    } else {
      // Validate each mobile number
      lead.mobileNumbers.forEach((mobile: any, index: number) => {
        if (!mobile || typeof mobile !== 'object') {
          errors.push({
            field: `mobileNumbers[${index}]`,
            message: 'Mobile number must be an object',
            severity: 'error',
            actualValue: mobile,
            expectedType: 'object'
          });
        } else {
          if (typeof mobile.id !== 'string') {
            errors.push({
              field: `mobileNumbers[${index}].id`,
              message: 'Mobile number ID must be a string',
              severity: 'error',
              actualValue: mobile.id,
              expectedType: 'string'
            });
          }
          if (typeof mobile.number !== 'string') {
            errors.push({
              field: `mobileNumbers[${index}].number`,
              message: 'Mobile number must be a string',
              severity: 'error',
              actualValue: mobile.number,
              expectedType: 'string'
            });
          }
          if (typeof mobile.name !== 'string') {
            errors.push({
              field: `mobileNumbers[${index}].name`,
              message: 'Mobile number name must be a string',
              severity: 'error',
              actualValue: mobile.name,
              expectedType: 'string'
            });
          }
          if (typeof mobile.isMain !== 'boolean') {
            errors.push({
              field: `mobileNumbers[${index}].isMain`,
              message: 'Mobile number isMain must be a boolean',
              severity: 'error',
              actualValue: mobile.isMain,
              expectedType: 'boolean'
            });
          }
        }
      });
    }
  }
  
  // Validate activities array
  if (lead.activities !== undefined && !Array.isArray(lead.activities)) {
    errors.push({
      field: 'activities',
      message: 'Activities must be an array',
      severity: 'error',
      actualValue: lead.activities,
      expectedType: 'array'
    });
  }
  
  // Validate boolean flags
  if (lead.isDone !== undefined && typeof lead.isDone !== 'boolean') {
    errors.push({
      field: 'isDone',
      message: 'isDone must be a boolean',
      severity: 'error',
      actualValue: lead.isDone,
      expectedType: 'boolean'
    });
  }
  
  if (lead.isDeleted !== undefined && typeof lead.isDeleted !== 'boolean') {
    errors.push({
      field: 'isDeleted',
      message: 'isDeleted must be a boolean',
      severity: 'error',
      actualValue: lead.isDeleted,
      expectedType: 'boolean'
    });
  }
  
  if (lead.isUpdated !== undefined && typeof lead.isUpdated !== 'boolean') {
    errors.push({
      field: 'isUpdated',
      message: 'isUpdated must be a boolean',
      severity: 'error',
      actualValue: lead.isUpdated,
      expectedType: 'boolean'
    });
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    repairable
  };
}

export function validateColumnConfigFields(config: any): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];
  let repairable = true;
  
  // Check required fields
  const requiredFields = ['id', 'fieldKey', 'label', 'type', 'required', 'sortable', 'width', 'visible'];
  for (const field of requiredFields) {
    if (!(field in config)) {
      errors.push({
        field,
        message: `Required field '${field}' is missing`,
        severity: 'critical',
        actualValue: undefined,
        expectedType: getFieldType(field)
      });
      repairable = false;
    }
  }
  
  // Validate field types
  if (config.id !== undefined && typeof config.id !== 'string') {
    errors.push({
      field: 'id',
      message: 'ID must be a string',
      severity: 'critical',
      actualValue: config.id,
      expectedType: 'string'
    });
    repairable = false;
  }
  
  if (config.fieldKey !== undefined && typeof config.fieldKey !== 'string') {
    errors.push({
      field: 'fieldKey',
      message: 'Field key must be a string',
      severity: 'error',
      actualValue: config.fieldKey,
      expectedType: 'string'
    });
  }
  
  // Validate fieldKey format
  if (config.fieldKey && !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(config.fieldKey)) {
    errors.push({
      field: 'fieldKey',
      message: 'Field key must start with a letter and contain only letters, numbers, and underscores',
      severity: 'error',
      actualValue: config.fieldKey,
      expectedType: 'string matching pattern /^[a-zA-Z][a-zA-Z0-9_]*$/'
    });
  }
  
  if (config.label !== undefined && typeof config.label !== 'string') {
    errors.push({
      field: 'label',
      message: 'Label must be a string',
      severity: 'error',
      actualValue: config.label,
      expectedType: 'string'
    });
  }
  
  // Validate type
  const validTypes = ['text', 'date', 'select', 'number', 'email', 'phone'];
  if (config.type && !validTypes.includes(config.type)) {
    errors.push({
      field: 'type',
      message: `Invalid type. Must be one of: ${validTypes.join(', ')}`,
      severity: 'error',
      actualValue: config.type,
      expectedType: 'enum'
    });
  }
  
  // Validate select type requirements
  if (config.type === 'select' && (!config.options || !Array.isArray(config.options) || config.options.length === 0)) {
    errors.push({
      field: 'options',
      message: 'Select type columns must have at least one option',
      severity: 'error',
      actualValue: config.options,
      expectedType: 'array with at least one item'
    });
  }
  
  // Validate width
  if (config.width !== undefined && (typeof config.width !== 'number' || config.width < 50 || config.width > 500)) {
    errors.push({
      field: 'width',
      message: 'Width must be a number between 50 and 500',
      severity: 'error',
      actualValue: config.width,
      expectedType: 'number (50-500)'
    });
  }
  
  // Validate boolean fields
  if (config.required !== undefined && typeof config.required !== 'boolean') {
    errors.push({
      field: 'required',
      message: 'Required must be a boolean',
      severity: 'error',
      actualValue: config.required,
      expectedType: 'boolean'
    });
  }
  
  if (config.sortable !== undefined && typeof config.sortable !== 'boolean') {
    errors.push({
      field: 'sortable',
      message: 'Sortable must be a boolean',
      severity: 'error',
      actualValue: config.sortable,
      expectedType: 'boolean'
    });
  }
  
  if (config.visible !== undefined && typeof config.visible !== 'boolean') {
    errors.push({
      field: 'visible',
      message: 'Visible must be a boolean',
      severity: 'error',
      actualValue: config.visible,
      expectedType: 'boolean'
    });
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    repairable
  };
}

export function validateHeaderConfigFields(config: any): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];
  const repairable = true;
  
  if (!config || typeof config !== 'object') {
    errors.push({
      field: 'config',
      message: 'Header config must be an object',
      severity: 'critical',
      actualValue: config,
      expectedType: 'object'
    });
    return { valid: false, errors, warnings, repairable: false };
  }
  
  // Validate all keys are strings and values are non-empty strings
  for (const [key, value] of Object.entries(config)) {
    if (typeof key !== 'string') {
      errors.push({
        field: `key:${key}`,
        message: 'All keys must be strings',
        severity: 'error',
        actualValue: key,
        expectedType: 'string'
      });
    }
    
    if (typeof value !== 'string') {
      errors.push({
        field: key,
        message: 'All values must be strings',
        severity: 'error',
        actualValue: value,
        expectedType: 'string'
      });
    } else if (value.trim() === '') {
      errors.push({
        field: key,
        message: 'Header labels cannot be empty',
        severity: 'error',
        actualValue: value,
        expectedType: 'non-empty string'
      });
    }
  }
  
  // Check for duplicate values
  const values = Object.values(config) as string[];
  const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
  if (duplicates.length > 0) {
    warnings.push(`Duplicate header labels found: ${duplicates.join(', ')}`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    repairable
  };
}

export function validateSavedViewFields(view: any): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];
  let repairable = true;
  
  // Check required fields
  const requiredFields = ['id', 'name', 'filters'];
  for (const field of requiredFields) {
    if (!(field in view)) {
      errors.push({
        field,
        message: `Required field '${field}' is missing`,
        severity: 'critical',
        actualValue: undefined,
        expectedType: getFieldType(field)
      });
      repairable = false;
    }
  }
  
  // Validate field types
  if (view.id !== undefined && typeof view.id !== 'string') {
    errors.push({
      field: 'id',
      message: 'ID must be a string',
      severity: 'critical',
      actualValue: view.id,
      expectedType: 'string'
    });
    repairable = false;
  }
  
  if (view.name !== undefined && typeof view.name !== 'string') {
    errors.push({
      field: 'name',
      message: 'Name must be a string',
      severity: 'error',
      actualValue: view.name,
      expectedType: 'string'
    });
  }
  
  if (view.filters !== undefined && typeof view.filters !== 'object') {
    errors.push({
      field: 'filters',
      message: 'Filters must be an object',
      severity: 'error',
      actualValue: view.filters,
      expectedType: 'object'
    });
  }
  
  // Validate filters structure
  if (view.filters && typeof view.filters === 'object') {
    const validFilterKeys = ['status', 'followUpDateStart', 'followUpDateEnd', 'searchTerm'];
    for (const key of Object.keys(view.filters)) {
      if (!validFilterKeys.includes(key)) {
        warnings.push(`Unknown filter key: ${key}`);
      }
    }
    
    // Validate status array
    if (view.filters.status && !Array.isArray(view.filters.status)) {
      errors.push({
        field: 'filters.status',
        message: 'Status filter must be an array',
        severity: 'error',
        actualValue: view.filters.status,
        expectedType: 'array'
      });
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    repairable
  };
}

// Array validators
export function validateLeadArray(data: any): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];
  let repairable = true;
  
  if (!Array.isArray(data)) {
    errors.push({
      field: 'data',
      message: 'Data must be an array',
      severity: 'critical',
      actualValue: data,
      expectedType: 'array'
    });
    return { valid: false, errors, warnings, repairable: false };
  }
  
  let validLeads = 0;
  let invalidLeads = 0;
  
  data.forEach((lead: any, index: number) => {
    const leadValidation = validateLeadFields(lead);
    if (leadValidation.valid) {
      validLeads++;
    } else {
      invalidLeads++;
      leadValidation.errors.forEach(error => {
        errors.push({
          ...error,
          field: `[${index}].${error.field}`
        });
      });
      leadValidation.warnings.forEach(warning => {
        warnings.push(`Lead ${index}: ${warning}`);
      });
    }
  });
  
  if (invalidLeads > 0 && validLeads > 0) {
    repairable = true;
    warnings.push(`${invalidLeads} leads have validation errors but ${validLeads} leads are valid`);
  } else if (invalidLeads === data.length) {
    repairable = false;
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    repairable
  };
}

export function validateColumnConfigArray(data: any): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];
  let repairable = true;
  
  if (!Array.isArray(data)) {
    errors.push({
      field: 'data',
      message: 'Data must be an array',
      severity: 'critical',
      actualValue: data,
      expectedType: 'array'
    });
    return { valid: false, errors, warnings, repairable: false };
  }
  
  let validConfigs = 0;
  let invalidConfigs = 0;
  const fieldKeys = new Set<string>();
  
  data.forEach((config: any, index: number) => {
    const configValidation = validateColumnConfigFields(config);
    if (configValidation.valid) {
      validConfigs++;
      
      // Check for duplicate fieldKeys
      if (config.fieldKey) {
        if (fieldKeys.has(config.fieldKey)) {
          errors.push({
            field: `[${index}].fieldKey`,
            message: `Duplicate field key: ${config.fieldKey}`,
            severity: 'error',
            actualValue: config.fieldKey,
            expectedType: 'unique string'
          });
        } else {
          fieldKeys.add(config.fieldKey);
        }
      }
    } else {
      invalidConfigs++;
      configValidation.errors.forEach(error => {
        errors.push({
          ...error,
          field: `[${index}].${error.field}`
        });
      });
    }
  });
  
  // Check if at least one column is visible
  const visibleColumns = data.filter((config: any) => config.visible === true);
  if (visibleColumns.length === 0) {
    errors.push({
      field: 'visible',
      message: 'At least one column must be visible',
      severity: 'error',
      actualValue: visibleColumns.length,
      expectedType: 'at least 1'
    });
  }
  
  if (invalidConfigs > 0 && validConfigs > 0) {
    repairable = true;
    warnings.push(`${invalidConfigs} column configs have validation errors but ${validConfigs} configs are valid`);
  } else if (invalidConfigs === data.length) {
    repairable = false;
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    repairable
  };
}

// Data repair functions
export function repairLead(lead: any): Lead | null {
  if (!lead || typeof lead !== 'object') return null;
  
  try {
    const repaired: any = { ...lead };
    
    // Generate missing ID
    if (!repaired.id || typeof repaired.id !== 'string') {
      repaired.id = generateUUID();
    }
    
    // Fill missing required fields with defaults
    if (!repaired.clientName || typeof repaired.clientName !== 'string') {
      repaired.clientName = '';
    }
    
    if (!repaired.status || typeof repaired.status !== 'string') {
      repaired.status = 'New';
    }
    
    if (!repaired.followUpDate || typeof repaired.followUpDate !== 'string') {
      repaired.followUpDate = formatDateToDDMMYYYY(new Date().toISOString());
    }
    
    if (!repaired.lastActivityDate || typeof repaired.lastActivityDate !== 'string') {
      repaired.lastActivityDate = formatDateToDDMMYYYY(new Date().toISOString());
    }
    
    // Ensure mobileNumbers array exists
    if (!Array.isArray(repaired.mobileNumbers)) {
      if (repaired.mobileNumber && typeof repaired.mobileNumber === 'string') {
        // Migrate from old mobileNumber string format
        repaired.mobileNumbers = [{
          id: generateUUID(),
          number: repaired.mobileNumber,
          name: 'Primary',
          isMain: true
        }];
      } else {
        repaired.mobileNumbers = [{
          id: generateUUID(),
          number: '',
          name: 'Primary',
          isMain: true
        }];
      }
    }
    
    // Ensure activities array exists
    if (!Array.isArray(repaired.activities)) {
      repaired.activities = [];
    }
    
    // Ensure boolean flags exist
    if (typeof repaired.isDone !== 'boolean') {
      repaired.isDone = false;
    }
    if (typeof repaired.isDeleted !== 'boolean') {
      repaired.isDeleted = false;
    }
    if (typeof repaired.isUpdated !== 'boolean') {
      repaired.isUpdated = false;
    }
    
    // Convert date formats
    if (repaired.followUpDate && !validateDateString(repaired.followUpDate).valid) {
      const parsedDate = parseDateFromDDMMYYYY(repaired.followUpDate);
      if (parsedDate) {
        repaired.followUpDate = formatDateToDDMMYYYY(parsedDate.toISOString());
      }
    }
    
    if (repaired.lastActivityDate && !validateDateString(repaired.lastActivityDate).valid) {
      const parsedDate = parseDateFromDDMMYYYY(repaired.lastActivityDate);
      if (parsedDate) {
        repaired.lastActivityDate = formatDateToDDMMYYYY(parsedDate.toISOString());
      }
    }
    
    return repaired as Lead;
  } catch (error) {
    console.error('Error repairing lead:', error);
    return null;
  }
}

export function repairLeadArray(leads: any[]): { repaired: Lead[]; removed: number; errors: string[] } {
  const repaired: Lead[] = [];
  const errors: string[] = [];
  let removed = 0;
  
  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const repairedLead = repairLead(lead);
    
    if (repairedLead) {
      repaired.push(repairedLead);
    } else {
      removed++;
      errors.push(`Lead ${i} could not be repaired and was removed`);
    }
  }
  
  return { repaired, removed, errors };
}

export function repairColumnConfig(config: any): ColumnConfig | null {
  if (!config || typeof config !== 'object') return null;
  
  try {
    const repaired: any = { ...config };
    
    // Generate missing ID from fieldKey
    if (!repaired.id || typeof repaired.id !== 'string') {
      if (repaired.fieldKey && typeof repaired.fieldKey === 'string') {
        repaired.id = repaired.fieldKey;
      } else {
        repaired.id = generateUUID();
      }
    }
    
    // Fill missing required fields with defaults
    if (!repaired.fieldKey || typeof repaired.fieldKey !== 'string') {
      return null; // Cannot repair without fieldKey
    }
    
    if (!repaired.label || typeof repaired.label !== 'string') {
      repaired.label = repaired.fieldKey;
    }
    
    if (!repaired.type || typeof repaired.type !== 'string') {
      repaired.type = 'text';
    }
    
    if (typeof repaired.required !== 'boolean') {
      repaired.required = false;
    }
    
    if (typeof repaired.sortable !== 'boolean') {
      repaired.sortable = true;
    }
    
    if (typeof repaired.width !== 'number' || repaired.width < 50 || repaired.width > 500) {
      repaired.width = 150;
    }
    
    if (typeof repaired.visible !== 'boolean') {
      repaired.visible = true;
    }
    
    // Ensure options array for select type
    if (repaired.type === 'select' && (!Array.isArray(repaired.options) || repaired.options.length === 0)) {
      repaired.options = ['Option 1'];
    }
    
    return repaired as ColumnConfig;
  } catch (error) {
    console.error('Error repairing column config:', error);
    return null;
  }
}

// Integrity checks
export function checkDataIntegrity(key: string, data: any): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];
  let repairable = true;
  
  try {
    const metadata = getSchemaMetadata(key);
    
    // Check for circular references
    if (hasCircularReference(data)) {
      errors.push({
        field: 'data',
        message: 'Data contains circular references',
        severity: 'critical',
        actualValue: data,
        expectedType: 'object without circular references'
      });
      repairable = false;
    }
    
    // Check data size
    const dataSize = JSON.stringify(data).length;
    if (dataSize > 10 * 1024 * 1024) { // 10MB
      errors.push({
        field: 'data',
        message: 'Data size exceeds reasonable limits',
        severity: 'error',
        actualValue: `${Math.round(dataSize / 1024 / 1024)}MB`,
        expectedType: 'less than 10MB'
      });
    }
    
    // Check for suspicious patterns
    if (Array.isArray(data)) {
      if (data.length === 0) {
        warnings.push('Data array is empty');
      } else if (data.length > 10000) {
        warnings.push(`Large data array with ${data.length} items`);
      }
      
      // Check for all null/undefined values
      const nullCount = data.filter(item => item === null || item === undefined).length;
      if (nullCount === data.length) {
        errors.push({
          field: 'data',
          message: 'All array items are null or undefined',
          severity: 'error',
          actualValue: nullCount,
          expectedType: 'array with valid items'
        });
      }
    }
    
    // Validate based on schema metadata
    if (metadata.requiredFields.length > 0 && typeof data === 'object') {
      for (const field of metadata.requiredFields) {
        if (!(field in data)) {
          errors.push({
            field,
            message: `Required field '${field}' is missing`,
            severity: 'error',
            actualValue: undefined,
            expectedType: metadata.fieldTypes[field] || 'any'
          });
        }
      }
    }
    
  } catch (error) {
    errors.push({
      field: 'data',
      message: `Integrity check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      severity: 'critical',
      actualValue: data,
      expectedType: 'valid data structure'
    });
    repairable = false;
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    repairable
  };
}

// Helper functions
function getFieldType(field: string): string {
  const fieldTypes: Record<string, string> = {
    id: 'string',
    clientName: 'string',
    status: 'string',
    followUpDate: 'string',
    lastActivityDate: 'string',
    isDone: 'boolean',
    isDeleted: 'boolean',
    isUpdated: 'boolean',
    mobileNumbers: 'array',
    activities: 'array',
    fieldKey: 'string',
    label: 'string',
    type: 'string',
    required: 'boolean',
    sortable: 'boolean',
    width: 'number',
    visible: 'boolean',
    name: 'string',
    filters: 'object'
  };
  
  return fieldTypes[field] || 'any';
}

function hasCircularReference(obj: any, seen = new WeakSet()): boolean {
  if (obj === null || typeof obj !== 'object') {
    return false;
  }
  
  if (seen.has(obj)) {
    return true;
  }
  
  seen.add(obj);
  
  for (const key in obj) {
    if (hasCircularReference(obj[key], seen)) {
      return true;
    }
  }
  
  seen.delete(obj);
  return false;
}
