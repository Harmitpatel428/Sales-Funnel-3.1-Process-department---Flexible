'use client';

import type { Lead } from '../types/shared';
import { validateColumnName, validateColumnType, validateColumnDeletion } from '../constants/columnConfig';
import { formatDateToDDMMYYYY, parseDateFromDDMMYYYY } from '../utils/dateUtils';

// Validation functions for individual fields
export const validateKva = (value: string): string | null => {
  if (!value.trim()) {
    return 'KVA is required';
  }
  return null;
};

export const validateConsumerNumber = (value: string): string | null => {
  if (!value.trim()) {
    return 'Consumer number is required';
  } else if (!/^[\d\s\-\+\(\)]+$/.test(value.trim())) {
    return 'Please enter a valid consumer number';
  }
  return null;
};

export const validateCompany = (value: string): string | null => {
  if (!value.trim()) {
    return 'Company name is required';
  }
  return null;
};

export const validateClientName = (value: string): string | null => {
  if (!value.trim()) {
    return 'Client name is required';
  }
  return null;
};

export const validateMobileNumber = (value: string): string | null => {
  if (value.trim() && !/^[\d\s\-\+\(\)]+$/.test(value.trim())) {
    return 'Please enter a valid mobile number';
  }
  return null;
};

export const validateDate = (value: string, allowPast: boolean = true): string | null => {
  if (!value.trim()) {
    return null; // Date is optional
  }
  
  // Validate DD-MM-YYYY format
  if (!/^\d{2}-\d{2}-\d{4}$/.test(value)) {
    return 'Please enter a valid date (DD-MM-YYYY)';
  }
  
  if (!allowPast) {
    // Check if date is in the past
    try {
      const dateParts = value.split('-');
      if (dateParts.length === 3 && dateParts[0] && dateParts[1] && dateParts[2]) {
        const day = dateParts[0];
        const month = dateParts[1];
        const year = dateParts[2];
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (date < today) {
          return 'Date cannot be in the past';
        }
      }
    } catch {
      return 'Please enter a valid date (DD-MM-YYYY)';
    }
  }
  
  return null;
};

export const validateGSTNumber = (value: string): string | null => {
  if (value.trim() && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(value.trim())) {
    return 'Please enter a valid GST number';
  }
  return null;
};

// Main validation function for lead fields - enhanced to support dynamic columns
export const validateLeadField = (fieldName: keyof Lead, value: any, lead?: Lead, columnConfig?: any): string | null => {
  // First check if this is a custom field with column configuration
  if (columnConfig) {
    return validateDynamicField(columnConfig.fieldKey, value, columnConfig.type, {
      required: columnConfig.required,
      maxLength: columnConfig.maxLength,
      min: columnConfig.min,
      max: columnConfig.max,
      options: columnConfig.options,
      allowPast: columnConfig.allowPast
    });
  }

  // Handle standard fields
  switch (fieldName) {
    case 'kva':
      return validateKva(value);
    case 'consumerNumber':
      return validateConsumerNumber(value);
    case 'company':
      return validateCompany(value);
    case 'clientName':
      return validateClientName(value);
    case 'mobileNumber':
      return validateMobileNumber(value);
    case 'gstNumber':
      return validateGSTNumber(value);
    case 'connectionDate':
      return validateDate(value, true);
    case 'lastActivityDate':
      return validateDate(value, true);
    case 'followUpDate':
      const followUpError = validateDate(value, false);
      if (followUpError) return followUpError;
      
      // FL1 (Fresh Lead) should never require a follow-up date
      if (lead?.status === 'Fresh Lead') {
        return null;
      }
      
      // Additional validation for follow-up date based on status
      if (lead) {
        const statusesRequiringFollowUp = ['Follow-up', 'Hotlead', 'Mandate Sent', 'Documentation'];
        if (statusesRequiringFollowUp.includes(lead.status) && !value.trim()) {
          return 'Next follow-up date is required for this status';
        }
      }
      return null;
    case 'notes':
      // Additional validation for notes based on status
      if (lead) {
        const statusesRequiringNotes = ['Follow-up', 'Hotlead', 'Mandate Sent', 'Documentation'];
        if (statusesRequiringNotes.includes(lead.status) && !value.trim()) {
          return 'Last discussion is required for this status';
        }
      }
      return null;
    default:
      // For custom fields not handled above, try to validate as dynamic field
      if (typeof fieldName === 'string' && fieldName.startsWith('custom_')) {
        return validateDynamicField(fieldName, value, 'text', { required: false });
      }
      return null;
  }
};

// Enhanced validation function that works with column context
export const validateLeadFieldWithContext = (fieldName: string, value: any, lead?: Lead, visibleColumns?: any[]): string | null => {
  // First try to find the column configuration
  if (visibleColumns) {
    const columnConfig = visibleColumns.find(col => col.fieldKey === fieldName);
    if (columnConfig) {
      return validateDynamicField(columnConfig.fieldKey, value, columnConfig.type, {
        required: columnConfig.required,
        maxLength: columnConfig.maxLength,
        min: columnConfig.min,
        max: columnConfig.max,
        options: columnConfig.options,
        allowPast: columnConfig.allowPast
      });
    }
  }

  // Fall back to standard validation
  return validateLeadField(fieldName as keyof Lead, value, lead);
};

// Validation for mobile numbers array
export const validateMobileNumbers = (mobileNumbers: any[]): Record<string, string> => {
  const errors: Record<string, string> = {};
  
  mobileNumbers.forEach((mobile, index) => {
    if (mobile.number && mobile.number.trim()) {
      const error = validateMobileNumber(mobile.number);
      if (error) {
        errors[`mobileNumber_${index}`] = error;
      }
    }
  });
  
  return errors;
};

// Custom unit type validation
export const validateCustomUnitType = (unitType: string, customUnitType: string): string | null => {
  if (unitType === 'Other' && !customUnitType.trim()) {
    return 'Custom unit type is required when "Other" is selected';
  }
  return null;
};

// Header validation functions
export const validateHeaderName = (name: string, existingHeaders: string[], fieldKey: string): string | null => {
  const trimmedName = name.trim();
  
  // Check for non-empty name
  if (!trimmedName) {
    return 'Header name cannot be empty';
  }
  
  // Check maximum length
  if (trimmedName.length > 50) {
    return 'Header name cannot exceed 50 characters';
  }
  
  // Check for special characters that could break Excel export
  if (!/^[a-zA-Z0-9\s\-_]+$/.test(trimmedName)) {
    return 'Header name can only contain letters, numbers, spaces, hyphens, and underscores';
  }
  
  // Check for duplicates (excluding current field)
  const duplicateIndex = existingHeaders.findIndex((header, index) => 
    header === trimmedName && index.toString() !== fieldKey
  );
  
  if (duplicateIndex !== -1) {
    return `Header name "${trimmedName}" is already used by another column`;
  }
  
  return null;
};

export const validateHeaderUniqueness = (headers: Record<string, string>): string[] => {
  const duplicates: string[] = [];
  const seen = new Set<string>();
  
  Object.values(headers).forEach(header => {
    if (seen.has(header)) {
      duplicates.push(header);
    } else {
      seen.add(header);
    }
  });
  
  return duplicates;
};

export const sanitizeHeaderName = (name: string): string => {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9\s\-_]/g, '') // Remove invalid characters
    .replace(/\s+/g, ' ') // Normalize spaces
    .substring(0, 50); // Limit length
};

// Password validation functions
export const validatePasswordStrength = (password: string): { score: number; feedback: string[] } => {
  let score = 0;
  const feedback: string[] = [];

  if (password.length >= 8) score += 1;
  else feedback.push('Password should be at least 8 characters long');

  if (/[a-z]/.test(password)) score += 1;
  else feedback.push('Password should contain lowercase letters');

  if (/[A-Z]/.test(password)) score += 1;
  else feedback.push('Password should contain uppercase letters');

  if (/[0-9]/.test(password)) score += 1;
  else feedback.push('Password should contain numbers');

  if (/[^A-Za-z0-9]/.test(password)) score += 1;
  else feedback.push('Password should contain special characters');

  return { score, feedback };
};

export const validatePasswordChange = (oldPassword: string, newPassword: string): string | null => {
  if (!oldPassword || !newPassword) {
    return 'Both old and new passwords are required';
  }

  if (oldPassword === newPassword) {
    return 'New password must be different from the old password';
  }

  if (newPassword.length < 6) {
    return 'New password must be at least 6 characters long';
  }

  const strength = validatePasswordStrength(newPassword);
  if (strength.score < 2) {
    return 'New password is too weak. Please choose a stronger password.';
  }

  return null;
};

export const validateSecurityQuestion = (question: string, answer: string): string | null => {
  if (!question.trim()) {
    return 'Security question is required';
  }

  if (!answer.trim()) {
    return 'Security answer is required';
  }

  if (answer.length < 3) {
    return 'Security answer must be at least 3 characters long';
  }

  return null;
};

// Row management validation functions
export const validateBulkRowAddition = (count: number, template: string): string | null => {
  if (!count || count <= 0) {
    return 'Number of rows must be greater than 0';
  }

  if (count > 100) {
    return 'Cannot add more than 100 rows at once';
  }

  if (!template) {
    return 'Template selection is required';
  }

  return null;
};

export const validateBulkRowDeletion = (criteria: string, leads: any[]): string | null => {
  if (!criteria) {
    return 'Deletion criteria is required';
  }

  if (leads.length === 0) {
    return 'No leads available for deletion';
  }

  return null;
};

export const validateBulkEdit = (changes: Record<string, any>, leads: any[]): string | null => {
  if (!changes || Object.keys(changes).length === 0) {
    return 'No changes specified';
  }

  if (leads.length === 0) {
    return 'No leads selected for editing';
  }

  // Validate each field change
  for (const [field, value] of Object.entries(changes)) {
    if (value !== undefined && value !== null && value !== '') {
      const error = validateLeadField(field as keyof Lead, value);
      if (error) {
        return `Invalid value for ${field}: ${error}`;
      }
    }
  }

  return null;
};

// Data migration validation
export const validateDataMigration = (oldSchema: any[], newSchema: any[], data: any[]): string | null => {
  if (!oldSchema || !newSchema || !data) {
    return 'Schema and data are required for migration';
  }

  if (oldSchema.length === 0 || newSchema.length === 0) {
    return 'Schema cannot be empty';
  }

  if (data.length === 0) {
    return 'No data to migrate';
  }

  return null;
};

export const validateBackupIntegrity = (backup: any[], original: any[]): string | null => {
  if (!backup || !original) {
    return 'Backup and original data are required';
  }

  if (backup.length !== original.length) {
    return 'Backup data count does not match original data count';
  }

  return null;
};

// Validate custom column based on column configuration
export const validateCustomColumn = (columnConfig: any, value: any): string | null => {
  if (!columnConfig) {
    return 'Column configuration is required';
  }

  return validateDynamicField(columnConfig.fieldKey, value, columnConfig.type, {
    required: columnConfig.required,
    maxLength: columnConfig.maxLength,
    min: columnConfig.min,
    max: columnConfig.max,
    options: columnConfig.options,
    allowPast: columnConfig.allowPast
  });
};

// Field-specific validation for dynamic columns
export const validateDynamicField = (fieldKey: string, value: any, fieldType: string, constraints?: any): string | null => {
  if (!fieldKey) {
    return 'Field key is required';
  }

  if (!fieldType) {
    return 'Field type is required';
  }

  // Get field label for better error messages
  const fieldLabel = constraints?.label || fieldKey;

  // Validate based on field type
  switch (fieldType) {
    case 'text':
      if (constraints?.required && (!value || !value.toString().trim())) {
        return `${fieldLabel} is required`;
      }
      if (value && value.toString().length > (constraints?.maxLength || 255)) {
        return `${fieldLabel} exceeds maximum length of ${constraints?.maxLength || 255} characters`;
      }
      break;

    case 'email':
      if (constraints?.required && (!value || !value.toString().trim())) {
        return `${fieldLabel} is required`;
      }
      if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.toString())) {
        return `${fieldLabel} must be a valid email address`;
      }
      break;

    case 'phone':
      if (constraints?.required && (!value || !value.toString().trim())) {
        return `${fieldLabel} is required`;
      }
      if (value && !/^[\d\s\-\+\(\)]+$/.test(value.toString())) {
        return `${fieldLabel} must be a valid phone number`;
      }
      break;

    case 'number':
      if (constraints?.required && (!value || value === '')) {
        return `${fieldLabel} is required`;
      }
      if (value && isNaN(Number(value))) {
        return `${fieldLabel} must be a valid number`;
      }
      if (value && constraints?.min !== undefined && Number(value) < constraints.min) {
        return `${fieldLabel} must be at least ${constraints.min}`;
      }
      if (value && constraints?.max !== undefined && Number(value) > constraints.max) {
        return `${fieldLabel} must be at most ${constraints.max}`;
      }
      break;

    case 'date':
      if (constraints?.required && (!value || !value.toString().trim())) {
        return `${fieldLabel} is required`;
      }
      if (value) {
        const dateError = validateDate(value.toString(), constraints?.allowPast !== false);
        if (dateError) {
          return `${fieldLabel}: ${dateError}`;
        }
      }
      break;

    case 'select':
      if (constraints?.required && (!value || !value.toString().trim())) {
        return `${fieldLabel} is required`;
      }
      if (value && constraints?.options && !constraints.options.includes(value)) {
        return `${fieldLabel} must be one of: ${constraints.options.join(', ')}`;
      }
      break;

    case 'textarea':
      if (constraints?.required && (!value || !value.toString().trim())) {
        return `${fieldLabel} is required`;
      }
      if (value && value.toString().length > (constraints?.maxLength || 1000)) {
        return `${fieldLabel} exceeds maximum length of ${constraints?.maxLength || 1000} characters`;
      }
      break;

    case 'url':
      if (constraints?.required && (!value || !value.toString().trim())) {
        return `${fieldLabel} is required`;
      }
      if (value && !/^https?:\/\/.+/.test(value.toString())) {
        return `${fieldLabel} must be a valid URL (starting with http:// or https://)`;
      }
      break;

    case 'currency':
      if (constraints?.required && (!value || value === '')) {
        return `${fieldLabel} is required`;
      }
      if (value && isNaN(Number(value))) {
        return `${fieldLabel} must be a valid number`;
      }
      if (value && Number(value) < 0) {
        return `${fieldLabel} cannot be negative`;
      }
      break;

    default:
      return `Unknown field type: ${fieldType}`;
  }

  return null;
};

// Comprehensive validation for forms with dynamic columns
export const validateFormWithDynamicColumns = (formData: Record<string, any>, visibleColumns: any[]): Record<string, string> => {
  const errors: Record<string, string> = {};
  
  visibleColumns.forEach(column => {
    const value = formData[column.fieldKey];
    const error = validateDynamicField(column.fieldKey, value, column.type, {
      required: column.required,
      maxLength: column.maxLength,
      min: column.min,
      max: column.max,
      options: column.options,
      allowPast: column.allowPast,
      label: column.label
    });
    
    if (error) {
      errors[column.fieldKey] = error;
    }
  });
  
  return errors;
};

// Enhanced validation for column constraints
export const validateColumnConstraints = (constraints: any): string[] => {
  const errors: string[] = [];
  
  if (constraints.maxLength && (constraints.maxLength < 1 || constraints.maxLength > 10000)) {
    errors.push('Maximum length must be between 1 and 10000 characters');
  }
  
  if (constraints.min !== undefined && constraints.max !== undefined && constraints.min > constraints.max) {
    errors.push('Minimum value cannot be greater than maximum value');
  }
  
  if (constraints.options && (!Array.isArray(constraints.options) || constraints.options.length === 0)) {
    errors.push('Options must be a non-empty array');
  }
  
  return errors;
};

// Validate column type compatibility
export const validateColumnTypeCompatibility = (oldType: string, newType: string, existingData: any[]): string | null => {
  if (oldType === newType) {
    return null; // No change needed
  }
  
  // Check if data conversion is possible
  const incompatibleConversions = [
    { from: 'select', to: 'number' },
    { from: 'select', to: 'date' },
    { from: 'number', to: 'select' },
    { from: 'date', to: 'select' }
  ];
  
  const isIncompatible = incompatibleConversions.some(conv => 
    conv.from === oldType && conv.to === newType
  );
  
  if (isIncompatible) {
    return `Cannot convert from ${oldType} to ${newType} type. Data may be lost.`;
  }
  
  // Check if existing data is compatible with new type
  const incompatibleData = existingData.filter(item => {
    if (!item) return false;
    
    switch (newType) {
      case 'number':
        return isNaN(Number(item));
      case 'date':
        return !validateDate(item.toString(), true);
      case 'email':
        return !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item.toString());
      case 'phone':
        return !/^[\d\s\-\+\(\)]+$/.test(item.toString());
      default:
        return false;
    }
  });
  
  if (incompatibleData.length > 0) {
    return `${incompatibleData.length} records have incompatible data for ${newType} type`;
  }
  
  return null;
};

// Enhanced form validation with real-time feedback
export const validateFormField = (fieldKey: string, value: any, columnConfig: any, formData?: Record<string, any>): { 
  valid: boolean; 
  error: string | null; 
  warning: string | null;
  suggestions: string[];
} => {
  const result = {
    valid: true,
    error: null as string | null,
    warning: null as string | null,
    suggestions: [] as string[]
  };
  
  // Basic validation
  const error = validateDynamicField(fieldKey, value, columnConfig.type, {
    required: columnConfig.required,
    maxLength: columnConfig.maxLength,
    min: columnConfig.min,
    max: columnConfig.max,
    options: columnConfig.options,
    allowPast: columnConfig.allowPast,
    label: columnConfig.label
  });
  
  if (error) {
    result.valid = false;
    result.error = error;
    return result;
  }
  
  // Additional validations and suggestions
  if (columnConfig.type === 'email' && value) {
    const email = value.toString().toLowerCase();
    if (!email.includes('@')) {
      result.suggestions.push('Email should contain @ symbol');
    }
    if (!email.includes('.')) {
      result.suggestions.push('Email should contain a domain');
    }
  }
  
  if (columnConfig.type === 'phone' && value) {
    const phone = value.toString().replace(/[^0-9]/g, '');
    if (phone.length < 10) {
      result.warning = 'Phone number seems too short';
    }
    if (phone.length > 15) {
      result.warning = 'Phone number seems too long';
    }
  }
  
  if (columnConfig.type === 'date' && value) {
    const date = new Date(value);
    const today = new Date();
    if (date > today) {
      result.warning = 'Date is in the future';
    }
  }
  
  // Cross-field validation
  if (formData) {
    if (fieldKey === 'followUpDate' && formData.status) {
      const statusesRequiringFollowUp = ['Follow-up', 'Hotlead', 'Mandate Sent', 'Documentation'];
      if (statusesRequiringFollowUp.includes(formData.status) && !value) {
        result.valid = false;
        result.error = 'Follow-up date is required for this status';
      }
    }
  }
  
  return result;
};

// Validate entire form with enhanced feedback
export const validateFormWithEnhancedFeedback = (formData: Record<string, any>, visibleColumns: any[]): {
  valid: boolean;
  errors: Record<string, string>;
  warnings: Record<string, string>;
  suggestions: Record<string, string[]>;
} => {
  const result = {
    valid: true,
    errors: {} as Record<string, string>,
    warnings: {} as Record<string, string>,
    suggestions: {} as Record<string, string[]>
  };
  
  visibleColumns.forEach(column => {
    const value = formData[column.fieldKey];
    const validation = validateFormField(column.fieldKey, value, column, formData);
    
    if (!validation.valid && validation.error) {
      result.valid = false;
      result.errors[column.fieldKey] = validation.error;
    }
    
    if (validation.warning) {
      result.warnings[column.fieldKey] = validation.warning;
    }
    
    if (validation.suggestions.length > 0) {
      result.suggestions[column.fieldKey] = validation.suggestions;
    }
  });
  
  return result;
};

// Export all validation functions as a hook
export const useValidation = () => {
  return {
    validateKva,
    validateConsumerNumber,
    validateCompany,
    validateClientName,
    validateMobileNumber,
    validateDate,
    validateGSTNumber,
    validateLeadField,
    validateLeadFieldWithContext,
    validateMobileNumbers,
    validateCustomUnitType,
    formatDateToDDMMYYYY,
    parseDateFromDDMMYYYY,
    validateHeaderName,
    validateHeaderUniqueness,
    sanitizeHeaderName,
    // Column management validation
    validateColumnName,
    validateColumnType,
    validateColumnDeletion,
    validateColumnConstraints,
    validateColumnTypeCompatibility,
    // Password validation
    validatePasswordStrength,
    validatePasswordChange,
    validateSecurityQuestion,
    // Row management validation
    validateBulkRowAddition,
    validateBulkRowDeletion,
    validateBulkEdit,
    // Data migration validation
    validateDataMigration,
    validateBackupIntegrity,
    // Dynamic field validation
    validateDynamicField,
    validateCustomColumn,
    validateFormWithDynamicColumns,
    validateFormField,
    validateFormWithEnhancedFeedback
  };
};

// Import-specific validation functions
export const validateImportedLead = (lead: Partial<Lead>, visibleColumns: any[]): { valid: boolean; errors: string[]; warnings: string[] } => {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Validate required fields
  if (!lead.clientName || lead.clientName.trim() === '') {
    errors.push('Client name is required');
  }
  
  // Validate data types and formats
  if (lead.kva && typeof lead.kva !== 'string') {
    warnings.push(`KVA field has unexpected type: ${typeof lead.kva}`);
  }
  
  if (lead.mobileNumbers && Array.isArray(lead.mobileNumbers)) {
    lead.mobileNumbers.forEach((mobile, idx) => {
      if (mobile.number && !/^\d+$/.test(mobile.number)) {
        warnings.push(`Mobile number ${idx + 1} contains non-numeric characters: ${mobile.number}`);
      }
    });
  }
  
  // Check date formats
  const dateFields = ['connectionDate', 'lastActivityDate', 'followUpDate'];
  dateFields.forEach(field => {
    const value = (lead as any)[field];
    if (value && typeof value === 'string') {
      if (!/^\d{2}-\d{2}-\d{4}$/.test(value)) {
        warnings.push(`${field} format should be DD-MM-YYYY, got: ${value}`);
      }
    }
  });
  
  // Validate dynamic columns
  visibleColumns.forEach(column => {
    if (column.required) {
      const value = (lead as any)[column.fieldKey];
      if (!value || value.toString().trim() === '') {
        errors.push(`Required field missing: ${column.label}`);
      }
    }
  });
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
};

export const validateImportedLeads = (leads: Partial<Lead>[], visibleColumns: any[]): Array<{lead: Partial<Lead>, errors: string[], warnings: string[], index: number}> => {
  return leads.map((lead, index) => {
    const validation = validateImportedLead(lead, visibleColumns);
    return {
      lead,
      errors: validation.errors,
      warnings: validation.warnings,
      index
    };
  });
};

export const getImportSuggestions = (unmappedHeader: string): string[] => {
  const suggestions: string[] = [];
  const header = unmappedHeader.toLowerCase();
  
  // Fuzzy matching suggestions
  if (header.includes('client') || header.includes('name')) {
    suggestions.push('Client Name');
  }
  if (header.includes('mobile') || header.includes('phone')) {
    suggestions.push('Mobile Number');
  }
  if (header.includes('status')) {
    suggestions.push('Status');
  }
  if (header.includes('date') && header.includes('follow')) {
    suggestions.push('Follow Up Date');
  }
  if (header.includes('date') && header.includes('last')) {
    suggestions.push('Last Activity Date');
  }
  if (header.includes('kva') || header.includes('name')) {
    suggestions.push('KVA');
  }
  
  return suggestions.length > 0 ? suggestions : ['No suggestions available'];
};