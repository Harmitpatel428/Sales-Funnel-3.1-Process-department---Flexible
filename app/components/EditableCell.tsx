'use client';

import React, { useState, useRef, useEffect, memo } from 'react';
import { validateLeadField, validateFieldWithZod } from '../hooks/useValidation';
import { validateLeadCrossFields, validateCaseCrossFields, validateDocumentCrossFields, ValidationError } from '../../lib/validation/cross-field-rules';
import { z } from 'zod';

interface EditableCellProps {
  value: string | number;
  type: 'text' | 'select' | 'date' | 'number';
  options?: string[];
  onSave: (value: string) => void;
  validation?: (value: string) => string | null;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  lead?: any; // For conditional validation
  data?: any; // Generic context for validation (alias/alternative to lead)
  fieldName?: string; // For validation
  schema?: z.ZodSchema; // Zod schema for validation
  schemaField?: string; // Optional override for schema field name if different from fieldName
  relatedFields?: Record<string, any>; // Fields that should trigger re-validation or are related. Changed to Record to pass values.
  entityType?: 'lead' | 'case' | 'document'; // To select cross-field validator
}

const EditableCell = memo<EditableCellProps>(function EditableCell({
  value,
  type,
  options = [],
  onSave,
  validation,
  placeholder = '',
  className = '',
  disabled = false,
  lead,
  data,
  fieldName,
  schema,
  schemaField,
  relatedFields,
  entityType
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(String(value || ''));
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasWarning, setHasWarning] = useState(false);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(null);

  // Update editValue when value prop changes
  useEffect(() => {
    setEditValue(String(value || ''));
  }, [value]);

  // Proactively re-validate if related fields change while editing or having an error/warning
  useEffect(() => {
    if (isEditing || hasError || hasWarning) {
      // Optional: could trigger re-validation here if needed
      // For now, relying on save or user interaction interaction
    }
  }, [relatedFields, lead, data]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.select();
      }
    }
  }, [isEditing]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click
    if (!disabled && !isEditing) {
      setIsEditing(true);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation(); // Prevent row click
    if (e.key === 'Escape') {
      handleCancel();
    } else if (e.key === 'Enter' && type !== 'select') {
      handleSave();
    }
  };

  const handleSave = async () => {
    const trimmedValue = editValue.trim();

    // Validate the value
    let error: string | null = null;
    const contextData = data || lead;
    const validationField = schemaField || fieldName;

    if (validation) {
      error = validation(trimmedValue);
    } else if (schema && validationField && contextData) {
      error = validateFieldWithZod(schema, validationField, trimmedValue, contextData);
    } else if (fieldName && lead) {
      error = validateLeadField(fieldName as any, trimmedValue, lead);
    }

    if (error) {
      setHasError(true);
      setErrorMessage(error);
      return;
    }

    // Cross-field validation checks (Non-blocking warnings)
    let crossErrors: ValidationError[] = [];
    if (entityType && validationField && contextData) {
      // Construct partial entity for validation
      const entity = {
        ...(contextData || {}),
        ...(relatedFields || {}),
        [validationField]: trimmedValue
      };

      if (entityType === 'lead') {
        crossErrors = validateLeadCrossFields(entity); // validateLeadCrossFields expect Partial<Lead>
      } else if (entityType === 'case') {
        crossErrors = validateCaseCrossFields(entity);
      } else if (entityType === 'document') {
        crossErrors = validateDocumentCrossFields(entity as any);
      }
    }

    if (crossErrors.length > 0) {
      setHasWarning(true);
      setWarningMessage(crossErrors[0].message);
      // Non-blocking: we still proceed to save, but the warning state is set.
      // If we want the user to SEE it, we might want to return here if it was "Blocking-Until-Confirmed",
      // but instructions say "non-blocking".
      // Use case: User sets status, forgets notes. System warns "Notes required". User sees warning.
      // If they hit save, it saves. Backend might reject if strict.
      // If backend rejects, handleSave catch block handles it.
      // If backend is strict, this should effectively be a pre-check.
      // If "non-blocking" means "just a warning", then we save.
    } else {
      setHasWarning(false);
      setWarningMessage(null);
    }

    setIsLoading(true);
    setHasError(false);
    setErrorMessage(null);
    // Keep warning state if any? Or clear it on success? 
    // Usually clear on success. But if we save, we close component.

    try {
      await onSave(trimmedValue);
      setIsEditing(false);
      setHasWarning(false);
      setWarningMessage(null);
    } catch (err) {
      setHasError(true);
      setErrorMessage('Failed to save');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setEditValue(String(value || ''));
    setIsEditing(false);
    setHasError(false);
    setErrorMessage(null);
    setHasWarning(false);
    setWarningMessage(null);
  };

  const handleFocus = (e: React.FocusEvent) => {
    e.stopPropagation(); // Prevent row click
  };

  const handleBlur = () => {
    // Small delay to allow for click events on save buttons
    setTimeout(() => {
      if (isEditing) {
        handleSave();
      }
    }, 100);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    e.stopPropagation(); // Prevent row click
    let newValue = e.target.value;

    // Special handling for date inputs (DD-MM-YYYY format)
    if (type === 'date') {
      // Remove all non-numeric characters first
      const numericValue = newValue.replace(/[^0-9]/g, '');

      // Auto-format with dashes based on numeric length
      let formattedValue = '';
      if (numericValue.length >= 1) {
        formattedValue = numericValue.slice(0, 2);
        if (numericValue.length >= 3) {
          formattedValue += '-' + numericValue.slice(2, 4);
          if (numericValue.length >= 5) {
            formattedValue += '-' + numericValue.slice(4, 8);
          }
        }
      }
      newValue = formattedValue;
    }

    // Special handling for number inputs (mobile numbers)
    if (type === 'number') {
      // Only allow numeric characters and limit to 10 digits
      newValue = newValue.replace(/[^0-9]/g, '').slice(0, 10);
    }

    setEditValue(newValue);
    setHasError(false);
    setErrorMessage(null);
    setHasWarning(false);
    setWarningMessage(null);
  };

  const renderInput = () => {
    const baseClasses = `w-full px-2 py-1 border rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-200 text-black text-xs placeholder:text-black ${hasError ? 'border-red-500 bg-red-50' : hasWarning ? 'border-orange-500 bg-orange-50' : 'border-gray-300'
      }`;

    switch (type) {
      case 'select':
        return (
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            value={editValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
            className={baseClasses}
            disabled={isLoading}
            title={`Select ${placeholder}`}
            aria-label={`Select ${placeholder}`}
          >
            <option value="">Select {placeholder}</option>
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );

      case 'date':
        return (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={editValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder="DD-MM-YYYY"
            maxLength={10}
            className={baseClasses}
            disabled={isLoading}
          />
        );

      case 'number':
        return (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={editValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={placeholder}
            pattern="[0-9]*"
            inputMode="numeric"
            className={baseClasses}
            disabled={isLoading}
          />
        );

      default:
        return (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="text"
            value={editValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={placeholder}
            className={baseClasses}
            disabled={isLoading}
          />
        );
    }
  };

  if (isEditing) {
    return (
      <div className={`relative ${className}`}>
        {renderInput()}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-600"></div>
          </div>
        )}
        {hasError && (
          <div className="absolute -bottom-5 left-0 right-0 z-10">
            <div className="text-xs text-red-600 flex items-center bg-white border border-red-200 rounded p-1 shadow-sm whitespace-nowrap">
              <svg className="w-3 h-3 mr-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {errorMessage || 'Validation error'}
            </div>
          </div>
        )}
        {!hasError && hasWarning && (
          <div className="absolute -bottom-5 left-0 right-0 z-10">
            <div className="text-xs text-orange-600 flex items-center bg-white border border-orange-200 rounded p-1 shadow-sm whitespace-nowrap">
              <svg className="w-3 h-3 mr-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {warningMessage || 'Warning'}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`cursor-pointer hover:bg-gray-50 transition-colors duration-150 ${className}`}
      onClick={handleClick}
      title={disabled ? 'Cannot edit this field' : 'Click to edit'}
    >
      <div className="text-xs text-black truncate">
        {value || <span className="text-black italic">{placeholder}</span>}
      </div>
    </div>
  );
});

export default EditableCell;
