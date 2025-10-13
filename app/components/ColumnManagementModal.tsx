'use client';

import React, { useState, useEffect } from 'react';
import { useColumns } from '../context/ColumnContext';
import type { ColumnConfig } from '../types/shared';
import { useHeaders } from '../context/HeaderContext';

interface ColumnManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onColumnAdded?: (column: ColumnConfig) => void;
  onColumnDeleted?: (fieldKey: string) => void;
  operation?: {
    type: 'addBefore' | 'addAfter' | 'delete' | 'settings';
    fieldKey?: string;
  };
}

const ColumnManagementModal: React.FC<ColumnManagementModalProps> = ({
  isOpen,
  onClose,
  onColumnAdded,
  onColumnDeleted,
  operation
}) => {
  const [activeTab, setActiveTab] = useState<'add' | 'delete' | 'reorder'>('add');
  const [newColumn, setNewColumn] = useState({
    fieldKey: '',
    label: '',
    type: 'text' as 'text' | 'select',
    required: false,
    sortable: true,
    width: 150,
    visible: true,
    description: '',
    options: [] as string[],
    defaultValue: ''
  });
  const [newOption, setNewOption] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);

  const { 
    columns, 
    addColumn, 
    deleteColumn, 
    reorderColumns, 
    toggleColumnVisibility
  } = useColumns();
  const { addHeader, removeHeader } = useHeaders();

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      // Set active tab based on operation
      if (operation?.type === 'delete') {
        setActiveTab('delete');
      } else if (operation?.type === 'settings') {
        setActiveTab('add'); // Settings will be handled in the add tab
      } else {
        setActiveTab('add');
      }
      
      setNewColumn({
        fieldKey: '',
        label: '',
        type: 'text',
        required: false,
        sortable: true,
        width: 150,
        visible: true,
        description: '',
        options: [],
        defaultValue: ''
      });
      setNewOption('');
      setError('');
      setSuccess('');
    }
  }, [isOpen, operation]);

  const handleAddColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      // Validate required fields
      if (!newColumn.fieldKey || !newColumn.label) {
        setError('Field key and label are required.');
        return;
      }

      // Check if field key already exists
      if (columns.some(col => col.fieldKey === newColumn.fieldKey)) {
        setError('A column with this field key already exists.');
        return;
      }

      // Validate field key format
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(newColumn.fieldKey)) {
        setError('Field key must start with a letter and contain only letters, numbers, and underscores.');
        return;
      }

      // Prepare column config
      const columnConfig = {
        ...newColumn,
        options: newColumn.type === 'select' ? newColumn.options : [],
        defaultValue: newColumn.defaultValue || undefined
      };

      const result = addColumn(columnConfig);
      if (result.success) {
        // Add header for the new column
        addHeader(columnConfig.fieldKey, columnConfig.label);
        
        // Handle column insertion based on operation
        if (operation?.type === 'addBefore' && operation.fieldKey) {
          const targetIndex = columns.findIndex(col => col.fieldKey === operation.fieldKey);
          if (targetIndex !== -1) {
            const newOrder = [...columns.map(col => col.fieldKey)];
            newOrder.splice(targetIndex, 0, columnConfig.fieldKey);
            reorderColumns(newOrder);
          }
        } else if (operation?.type === 'addAfter' && operation.fieldKey) {
          const targetIndex = columns.findIndex(col => col.fieldKey === operation.fieldKey);
          if (targetIndex !== -1) {
            const newOrder = [...columns.map(col => col.fieldKey)];
            newOrder.splice(targetIndex + 1, 0, columnConfig.fieldKey);
            reorderColumns(newOrder);
          }
        }
        
        setSuccess(result.message);
        setNewColumn({
          fieldKey: '',
          label: '',
          type: 'text',
          required: false,
          sortable: true,
          width: 150,
          visible: true,
          description: '',
          options: [],
          defaultValue: ''
        });
        onColumnAdded?.(columnConfig as ColumnConfig);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteColumn = async (fieldKey: string) => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const column = columns.find(col => col.fieldKey === fieldKey);
      if (!column) {
        setError('Column not found.');
        return;
      }

      // Allow deletion of all columns, including required ones
      // Show warning for required columns but still allow deletion
      if (column.required) {
        const confirmed = window.confirm(
          `Warning: "${column.label}" is a required column. Deleting it may cause data loss and system issues. Are you sure you want to delete this column?`
        );
        if (!confirmed) {
          setIsLoading(false);
          return;
        }
      }

      const result = deleteColumn(fieldKey);
      if (result.success) {
        // Remove header for the deleted column
        removeHeader(fieldKey);
        
        setSuccess(result.message);
        onColumnDeleted?.(fieldKey);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleVisibility = (fieldKey: string) => {
    toggleColumnVisibility(fieldKey);
  };

  const handleDragStart = (e: React.DragEvent, fieldKey: string) => {
    setDraggedColumn(fieldKey);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetFieldKey: string) => {
    e.preventDefault();
    
    if (!draggedColumn || draggedColumn === targetFieldKey) {
      return;
    }

    const draggedIndex = columns.findIndex(col => col.fieldKey === draggedColumn);
    const targetIndex = columns.findIndex(col => col.fieldKey === targetFieldKey);
    
    if (draggedIndex === -1 || targetIndex === -1) {
      return;
    }

    const newOrder = [...columns];
    const [draggedItem] = newOrder.splice(draggedIndex, 1);
    if (!draggedItem) return;
    newOrder.splice(targetIndex, 0, draggedItem);
    
    const fieldKeys = newOrder.map(col => col.fieldKey);
    reorderColumns(fieldKeys);
    
    setDraggedColumn(null);
  };


  const addOption = () => {
    if (newOption.trim() && !newColumn.options.includes(newOption.trim())) {
      setNewColumn({
        ...newColumn,
        options: [...newColumn.options, newOption.trim()]
      });
      setNewOption('');
    }
  };

  const removeOption = (index: number) => {
    setNewColumn({
      ...newColumn,
      options: newColumn.options.filter((_, i) => i !== index)
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-4xl mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold text-gray-800">Column Management</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
            disabled={isLoading}
          >
            ×
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 mb-6 border-b border-gray-200">
          {[
            { key: 'add', label: 'Add Column' },
            { key: 'delete', label: 'Delete Column' },
            { key: 'reorder', label: 'Reorder Columns' }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-4 py-2 text-sm font-medium border-b-2 ${
                activeTab === tab.key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              disabled={isLoading}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
            {success}
          </div>
        )}

        {/* Add Column Tab */}
        {activeTab === 'add' && (
          <form onSubmit={handleAddColumn} className="space-y-6">
            {/* Column Configuration */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Field Key *
                  </label>
                  <input
                    type="text"
                    value={newColumn.fieldKey}
                    onChange={(e) => setNewColumn({ ...newColumn, fieldKey: e.target.value })}
                    placeholder="e.g., company, budget"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black placeholder:text-black"
                    required
                    disabled={isLoading}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Internal field identifier (letters, numbers, underscores only)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Display Label *
                  </label>
                  <input
                    type="text"
                    value={newColumn.label}
                    onChange={(e) => setNewColumn({ ...newColumn, label: e.target.value })}
                    placeholder="e.g., Company Name"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black placeholder:text-black"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="column-type-select" className="block text-sm font-medium text-gray-700 mb-2">
                    Field Type
                  </label>
                  <select
                    id="column-type-select"
                    value={newColumn.type}
                    onChange={(e) => setNewColumn({ ...newColumn, type: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black placeholder:text-black"
                    disabled={isLoading}
                    aria-label="Field Type"
                  >
                    <option value="text">Text</option>
                    <option value="email">Email</option>
                    <option value="phone">Phone</option>
                    <option value="number">Number</option>
                    <option value="date">Date</option>
                    <option value="select">Select</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="column-width-input" className="block text-sm font-medium text-gray-700 mb-2">
                    Column Width
                  </label>
                  <input
                    id="column-width-input"
                    type="number"
                    value={newColumn.width}
                    onChange={(e) => setNewColumn({ ...newColumn, width: parseInt(e.target.value) || 150 })}
                    min="100"
                    max="400"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black placeholder:text-black"
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* Select Options */}
              {newColumn.type === 'select' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Options
                  </label>
                  <div className="flex space-x-2 mb-2">
                    <input
                      type="text"
                      value={newOption}
                      onChange={(e) => setNewOption(e.target.value)}
                      placeholder="Add option"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={isLoading}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addOption())}
                    />
                    <button
                      type="button"
                      onClick={addOption}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                      disabled={isLoading}
                    >
                      Add
                    </button>
                  </div>
                  <div className="space-y-1">
                    {newColumn.options.map((option, index) => (
                      <div key={index} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded">
                        <span className="text-sm">{option}</span>
                        <button
                          type="button"
                          onClick={() => removeOption(index)}
                          className="text-red-600 hover:text-red-800"
                          disabled={isLoading}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Additional Options */}
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="required"
                    checked={newColumn.required}
                    onChange={(e) => setNewColumn({ ...newColumn, required: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    disabled={isLoading}
                  />
                  <label htmlFor="required" className="ml-2 block text-sm text-gray-700">
                    Required field
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="sortable"
                    checked={newColumn.sortable}
                    onChange={(e) => setNewColumn({ ...newColumn, sortable: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    disabled={isLoading}
                  />
                  <label htmlFor="sortable" className="ml-2 block text-sm text-gray-700">
                    Sortable column
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="visible"
                    checked={newColumn.visible}
                    onChange={(e) => setNewColumn({ ...newColumn, visible: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    disabled={isLoading}
                  />
                  <label htmlFor="visible" className="ml-2 block text-sm text-gray-700">
                    Visible by default
                  </label>
                </div>
              </div>
            </div>

            <div className="flex space-x-3 pt-4">
              <button
                type="submit"
                disabled={isLoading || !newColumn.fieldKey || !newColumn.label}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Adding...' : 'Add Column'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Delete Column Tab */}
        {activeTab === 'delete' && (
          <div className="space-y-4">
            <p className="text-gray-600">
              Select columns to delete. Required columns will show a warning before deletion.
            </p>
            <div className="space-y-2">
              {columns.map(column => (
                <div key={column.fieldKey} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium text-gray-800">{column.label}</div>
                    <div className="text-sm text-gray-500">
                      {column.fieldKey} • {column.type} • {column.required ? 'Required' : 'Optional'}
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => handleToggleVisibility(column.fieldKey)}
                      className={`px-3 py-1 text-sm rounded ${
                        column.visible 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}
                      disabled={isLoading}
                    >
                      {column.visible ? 'Visible' : 'Hidden'}
                    </button>
                    <button
                      onClick={() => handleDeleteColumn(column.fieldKey)}
                      disabled={isLoading}
                      className={`px-3 py-1 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed ${
                        column.required 
                          ? 'bg-orange-600 hover:bg-orange-700' 
                          : 'bg-red-600 hover:bg-red-700'
                      }`}
                      title={column.required ? 'Delete required column (with warning)' : 'Delete column'}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reorder Columns Tab */}
        {activeTab === 'reorder' && (
          <div className="space-y-4">
            <p className="text-gray-600">
              Drag and drop columns to reorder them.
            </p>
            <div className="space-y-2">
              {columns.map(column => (
                <div
                  key={column.fieldKey}
                  draggable
                  onDragStart={(e) => handleDragStart(e, column.fieldKey)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, column.fieldKey)}
                  className="flex items-center p-3 border border-gray-200 rounded-lg cursor-move hover:bg-gray-50"
                >
                  <div className="mr-3 text-gray-400">⋮⋮</div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-800">{column.label}</div>
                    <div className="text-sm text-gray-500">
                      {column.fieldKey} • {column.type} • {column.required ? 'Required' : 'Optional'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ColumnManagementModal;
