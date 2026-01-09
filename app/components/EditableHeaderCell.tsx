'use client';

import React, { useState, useRef, useEffect } from 'react';
import { validateHeaderName } from '../hooks/useValidation';
import { useColumns } from '../context/ColumnContext';
import PasswordModal from './PasswordModal';

interface EditableHeaderCellProps {
  fieldKey: string;
  currentLabel: string;
  onSave: (field: string, newLabel: string) => void;
  onCancel?: () => void;
  disabled?: boolean;
  className?: string;
  onEditStart?: (field: string) => void;
  onEditEnd?: (field: string) => void;
  existingHeaders: string[];
  onAddColumnBefore?: (fieldKey: string) => void;
  onAddColumnAfter?: (fieldKey: string) => void;
  onDeleteColumn?: (fieldKey: string) => void;
  onColumnSettings?: (fieldKey: string) => void;
}

const EditableHeaderCell = React.memo(function EditableHeaderCell({
  fieldKey,
  currentLabel,
  onSave,
  onCancel,
  disabled = false,
  className = '',
  onEditStart,
  onEditEnd,
  existingHeaders,
  onAddColumnBefore,
  onAddColumnAfter,
  onDeleteColumn,
  onColumnSettings
}: EditableHeaderCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(currentLabel);
  const [error, setError] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [pendingOperation, setPendingOperation] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { getColumnByKey } = useColumns();
  const column = getColumnByKey(fieldKey);

  // Update edit value when currentLabel changes
  useEffect(() => {
    setEditValue(currentLabel);
  }, [currentLabel]);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDoubleClick = () => {
    if (!disabled) {
      setIsEditing(true);
      setError(null);
      onEditStart?.(fieldKey);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    } else if (e.key === 'Tab') {
      // Allow tab to move to next header
      handleSave();
    }
  };

  const handleSave = () => {
    const trimmedValue = editValue.trim();

    // Use shared validation helper
    const err = validateHeaderName(trimmedValue, existingHeaders, fieldKey);
    if (err) {
      setError(err);
      return;
    }

    if (trimmedValue === currentLabel) {
      // No change, just exit edit mode
      setIsEditing(false);
      setError(null);
      onEditEnd?.(fieldKey);
      return;
    }

    try {
      onSave(fieldKey, trimmedValue);
      setIsEditing(false);
      setError(null);
      onEditEnd?.(fieldKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save header name');
    }
  };

  const handleCancel = () => {
    setEditValue(currentLabel);
    setIsEditing(false);
    setError(null);
    onCancel?.();
    onEditEnd?.(fieldKey);
  };

  const handleBlur = () => {
    // Small delay to allow for click events on save button
    setTimeout(() => {
      if (isEditing) {
        handleSave();
      }
    }, 100);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditValue(e.target.value);
    setError(null);
  };

  const handleDropdownToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDropdown(!showDropdown);
  };

  const handleMenuAction = (action: string) => {
    setShowDropdown(false);

    if (action === 'edit') {
      setIsEditing(true);
      setError(null);
      onEditStart?.(fieldKey);
    } else if (action === 'addBefore') {
      setPendingOperation('addBefore');
      setPasswordModalOpen(true);
    } else if (action === 'addAfter') {
      setPendingOperation('addAfter');
      setPasswordModalOpen(true);
    } else if (action === 'delete') {
      setPendingOperation('delete');
      setPasswordModalOpen(true);
    } else if (action === 'settings') {
      setPendingOperation('settings');
      setPasswordModalOpen(true);
    }
  };

  const handlePasswordSuccess = () => {
    setPasswordModalOpen(false);

    switch (pendingOperation) {
      case 'addBefore':
        onAddColumnBefore?.(fieldKey);
        break;
      case 'addAfter':
        onAddColumnAfter?.(fieldKey);
        break;
      case 'delete':
        onDeleteColumn?.(fieldKey);
        break;
      case 'settings':
        onColumnSettings?.(fieldKey);
        break;
    }

    setPendingOperation(null);
  };

  const getColumnTypeIcon = (type: string) => {
    switch (type) {
      case 'text': return '📝';
      case 'email': return '📧';
      case 'phone': return '📞';
      case 'number': return '🔢';
      case 'date': return '📅';
      case 'select': return '📋';
      default: return '📄';
    }
  };

  if (isEditing) {
    return (
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onClick={(e) => e.stopPropagation()}
          className={`
            w-full px-2 py-1 text-sm font-medium bg-white border-2 border-blue-500 rounded
            focus:outline-none focus:ring-2 focus:ring-blue-300 text-black placeholder:text-black
            ${error ? 'border-red-500 bg-red-50' : ''}
            ${className}
          `}
          maxLength={50}
          disabled={disabled}
          aria-label={`Edit header name for ${fieldKey} field`}
          placeholder="Enter header name"
        />
        {error && (
          <div className="absolute top-full left-0 mt-1 px-2 py-1 bg-red-100 border border-red-300 rounded text-xs text-red-700 whitespace-nowrap z-50">
            {error}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`
        relative flex items-center justify-between group cursor-pointer
        ${disabled ? 'cursor-default' : ''}
        ${className}
      `}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title={disabled ? '' : 'Double-click to edit header name'}
      aria-label={`Header: ${currentLabel}${disabled ? '' : ' (Double-click to edit)'}`}
    >
      <div className="flex items-center space-x-2 flex-1 min-w-0">
        {column && (
          <span className="text-sm" title={`${column.type} field`}>
            {getColumnTypeIcon(column.type)}
          </span>
        )}
        <span className="font-medium text-gray-900 truncate">
          {currentLabel}
        </span>
        {column?.required && (
          <span className="text-red-500 text-xs" title="Required field">
            *
          </span>
        )}
      </div>

      <div className="flex items-center space-x-1">
        {!disabled && isHovered && (
          <span className="ml-1 text-gray-400 text-xs opacity-70">
            ✏️
          </span>
        )}

        {!disabled && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={handleDropdownToggle}
              className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
              title="Column options"
              aria-label="Column options menu"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>

            {showDropdown && (
              <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                <div className="py-1">
                  <button
                    onClick={() => handleMenuAction('edit')}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                  >
                    <span>✏️</span>
                    <span>Edit Header</span>
                  </button>

                  <button
                    onClick={() => handleMenuAction('addBefore')}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                  >
                    <span>➕</span>
                    <span>Add Column Before</span>
                  </button>

                  <button
                    onClick={() => handleMenuAction('addAfter')}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                  >
                    <span>➕</span>
                    <span>Add Column After</span>
                  </button>

                  <div className="border-t border-gray-100 my-1"></div>

                  <button
                    onClick={() => handleMenuAction('settings')}
                    className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                  >
                    <span>⚙️</span>
                    <span>Column Settings</span>
                  </button>

                  {column && !column.required && (
                    <button
                      onClick={() => handleMenuAction('delete')}
                      className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
                    >
                      <span>🗑️</span>
                      <span>Delete Column</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <PasswordModal
        isOpen={passwordModalOpen}
        onClose={() => {
          setPasswordModalOpen(false);
          setPendingOperation(null);
        }}
        operation="columnManagement"
        onSuccess={handlePasswordSuccess}
        title="Column Management"
        description="Enter password to perform column management operations"
      />
    </div>
  );
});

EditableHeaderCell.displayName = 'EditableHeaderCell';

export default EditableHeaderCell;
