'use client';

import React, { useState, useEffect } from 'react';
import { useLeads } from '../context/LeadContext';
import { useColumns } from '../context/ColumnContext';
import { useValidation } from '../hooks/useValidation';

// Helper function to format today's date as DD-MM-YYYY
const todayDDMMYYYY = () => {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

interface RowManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRowsAdded?: (count: number) => void;
  onRowsDeleted?: (count: number) => void;
}

const RowManagementModal: React.FC<RowManagementModalProps> = ({
  isOpen,
  onClose,
  onRowsAdded,
  onRowsDeleted
}) => {
  const [activeTab, setActiveTab] = useState<'add' | 'delete' | 'bulkEdit'>('add');
  const [addConfig, setAddConfig] = useState({
    count: 1,
    template: 'empty' as 'empty' | 'copy' | 'import',
    copyFromIndex: 0,
    importData: '',
    defaultValues: {} as Record<string, any>
  });
  const [deleteConfig, setDeleteConfig] = useState({
    criteria: 'all' as 'all' | 'status' | 'dateRange' | 'search',
    status: '',
    dateFrom: '',
    dateTo: '',
    searchQuery: '',
    selectedRows: [] as string[]
  });
  const [bulkEditConfig, setBulkEditConfig] = useState({
    selectedRows: [] as string[],
    fieldUpdates: {} as Record<string, any>
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [previewData, setPreviewData] = useState<any[]>([]);

  const { leads, addLead, deleteLead, updateLead } = useLeads();
  const { getVisibleColumns } = useColumns();
  const { validateFormWithEnhancedFeedback, validateBulkRowAddition } = useValidation();

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setActiveTab('add');
      setAddConfig({
        count: 1,
        template: 'empty',
        copyFromIndex: 0,
        importData: '',
        defaultValues: {}
      });
      setDeleteConfig({
        criteria: 'all',
        status: '',
        dateFrom: '',
        dateTo: '',
        searchQuery: '',
        selectedRows: []
      });
      setBulkEditConfig({
        selectedRows: [],
        fieldUpdates: {}
      });
      setError('');
      setSuccess('');
      setPreviewData([]);
    }
  }, [isOpen]);

  // Update preview when add config changes
  useEffect(() => {
    if (activeTab === 'add' && addConfig.count > 0) {
      generatePreview();
    }
  }, [addConfig, activeTab]);

  const generatePreview = () => {
    const visibleColumns = getVisibleColumns();
    const preview = [];
    
    for (let i = 0; i < Math.min(addConfig.count, 5); i++) {
      const row: any = { id: `preview_${i}` };
      
      visibleColumns.forEach(column => {
        if (addConfig.template === 'copy' && leads[addConfig.copyFromIndex]) {
          const sourceLead = leads[addConfig.copyFromIndex];
          if (sourceLead) {
            const sourceValue = (sourceLead as any)[column.fieldKey];
            row[column.fieldKey] = sourceValue !== undefined ? sourceValue : getDefaultValueForColumn(column);
          } else {
            row[column.fieldKey] = getDefaultValueForColumn(column);
          }
        } else if (addConfig.defaultValues[column.fieldKey] !== undefined) {
          row[column.fieldKey] = addConfig.defaultValues[column.fieldKey];
        } else {
          row[column.fieldKey] = getDefaultValueForColumn(column);
        }
      });
      
      preview.push(row);
    }
    
    setPreviewData(preview);
  };

  const handleAddRows = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      // Validate the bulk row addition
      const validationError = validateBulkRowAddition(addConfig.count, addConfig.template);
      if (validationError) {
        setError(validationError);
        return;
      }

      const visibleColumns = getVisibleColumns();
      const newLeads = [];

      for (let i = 0; i < addConfig.count; i++) {
        const newLead: any = {
          id: `lead_${Date.now()}_${i}`,
          // Required fields with defaults
          kva: '',
          connectionDate: '',
          consumerNumber: '',
          company: '',
          clientName: '',
          mobileNumbers: [
            { id: '1', number: '', name: '', isMain: true },
            { id: '2', number: '', name: '', isMain: false },
            { id: '3', number: '', name: '', isMain: false }
          ],
          mobileNumber: '', // Keep for backward compatibility
          followUpDate: '',
          notes: '',
          // Other fields
          status: 'New',
          unitType: 'New',
          lastActivityDate: new Date().toLocaleDateString('en-GB'), // DD-MM-YYYY format
          isDone: false,
          isDeleted: false,
          isUpdated: false,
          mandateStatus: 'Pending',
          documentStatus: 'Pending Documents',
          activities: [{
            id: `activity_${Date.now()}_${i}`,
            leadId: `lead_${Date.now()}_${i}`,
            description: 'Lead created',
            timestamp: new Date().toISOString()
          }]
        };

        // Populate all visible columns with appropriate default values
        visibleColumns.forEach(column => {
          if (addConfig.template === 'copy' && leads[addConfig.copyFromIndex]) {
            // Copy from existing lead
            const sourceLead = leads[addConfig.copyFromIndex];
            if (sourceLead) {
              const sourceValue = (sourceLead as any)[column.fieldKey];
              newLead[column.fieldKey] = sourceValue !== undefined ? sourceValue : getDefaultValueForColumn(column);
            } else {
              newLead[column.fieldKey] = getDefaultValueForColumn(column);
            }
          } else if (addConfig.defaultValues[column.fieldKey] !== undefined) {
            // Use user-specified default value
            newLead[column.fieldKey] = addConfig.defaultValues[column.fieldKey];
          } else {
            // Use column-specific default value
            newLead[column.fieldKey] = getDefaultValueForColumn(column);
          }
        });

        newLeads.push(newLead);
      }

      // Add all new leads
      for (const lead of newLeads) {
        addLead(lead);
      }

      setSuccess(`${addConfig.count} rows added successfully.`);
      onRowsAdded?.(addConfig.count);
    } catch (err) {
      setError('An error occurred while adding rows. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to get default value for a column based on its type
  const getDefaultValueForColumn = (column: any) => {
    if (column.defaultValue !== undefined) {
      return column.defaultValue;
    }
    
    switch (column.type) {
      case 'date':
        return todayDDMMYYYY();
      case 'number':
        return 0;
      case 'phone':
        return '';
      case 'email':
        return '';
      case 'select':
        return column.options?.[0] || '';
      case 'text':
      default:
        return '';
    }
  };

  const handleDeleteRows = async () => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      let leadsToDelete: any[] = [];

      if (deleteConfig.criteria === 'all') {
        leadsToDelete = [...leads];
      } else if (deleteConfig.criteria === 'status' && deleteConfig.status) {
        leadsToDelete = leads.filter(lead => lead.status === deleteConfig.status);
      } else if (deleteConfig.criteria === 'dateRange') {
        leadsToDelete = leads.filter(lead => {
          const leadDate = new Date(lead.lastActivityDate);
          const fromDate = deleteConfig.dateFrom ? new Date(deleteConfig.dateFrom) : null;
          const toDate = deleteConfig.dateTo ? new Date(deleteConfig.dateTo) : null;
          
          if (fromDate && leadDate < fromDate) return false;
          if (toDate && leadDate > toDate) return false;
          return true;
        });
      } else if (deleteConfig.criteria === 'search' && deleteConfig.searchQuery) {
        const query = deleteConfig.searchQuery.toLowerCase();
        leadsToDelete = leads.filter(lead => 
          Object.values(lead).some(value => 
            String(value).toLowerCase().includes(query)
          )
        );
      } else if (deleteConfig.selectedRows.length > 0) {
        leadsToDelete = leads.filter(lead => deleteConfig.selectedRows.includes(lead.id));
      }

      // Delete leads
      for (const lead of leadsToDelete) {
        deleteLead(lead.id);
      }

      setSuccess(`${leadsToDelete.length} rows deleted successfully.`);
      onRowsDeleted?.(leadsToDelete.length);
    } catch (err) {
      setError('An error occurred while deleting rows. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBulkEdit = async () => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const leadsToUpdate = leads.filter(lead => 
        bulkEditConfig.selectedRows.includes(lead.id)
      );

      if (leadsToUpdate.length === 0) {
        setError('No rows selected for editing.');
        return;
      }

      // Validate the bulk edit changes
      const visibleColumns = getVisibleColumns();
      const validation = validateFormWithEnhancedFeedback(bulkEditConfig.fieldUpdates, visibleColumns);
      
      if (!validation.valid) {
        const errorMessages = Object.values(validation.errors).join('; ');
        setError(`Validation errors: ${errorMessages}`);
        return;
      }

      // Apply updates to selected leads
      for (const lead of leadsToUpdate) {
        const updatedLead = { ...lead, ...bulkEditConfig.fieldUpdates };
        updateLead(updatedLead, { touchActivity: true });
      }

      setSuccess(`${leadsToUpdate.length} rows updated successfully.`);
    } catch (err) {
      setError('An error occurred while updating rows. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportData = () => {
    try {
      const lines = addConfig.importData.split('\n').filter(line => line.trim());
      if (lines.length === 0 || !lines[0]) {
        setError('No data found in import text');
        return;
      }
      const headers = lines[0].split('\t');
      const rows = lines.slice(1).map(line => {
        const values = line.split('\t');
        const row: any = {};
        headers.forEach((header, index) => {
          row[header.trim()] = values[index]?.trim() || '';
        });
        return row;
      });

      setAddConfig({ ...addConfig, count: rows.length });
      setSuccess(`Imported ${rows.length} rows from clipboard data.`);
    } catch (err) {
      setError('Invalid import data format. Please use tab-separated values.');
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <style jsx>{`
        .black-placeholder::placeholder {
          color: #000000 !important;
          opacity: 1 !important;
        }
        .black-placeholder {
          color: #000000 !important;
        }
      `}</style>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-4xl mx-4 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold text-gray-800">Row Management</h2>
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
            { key: 'add', label: 'Add Rows' },
            { key: 'delete', label: 'Delete Rows' },
            { key: 'bulkEdit', label: 'Bulk Edit' }
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

        {/* Add Rows Tab */}
        {activeTab === 'add' && (
          <form onSubmit={handleAddRows} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="row-count-input" className="block text-sm font-medium text-gray-700 mb-2">
                  Number of Rows
                </label>
                <input
                  id="row-count-input"
                  type="number"
                  value={addConfig.count}
                  onChange={(e) => setAddConfig({ ...addConfig, count: parseInt(e.target.value) || 1 })}
                  min="1"
                  max="100"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black black-placeholder"
                  required
                  disabled={isLoading}
                />
              </div>

              <div>
                <label htmlFor="template-select" className="block text-sm font-medium text-gray-700 mb-2">
                  Template
                </label>
                <select
                  id="template-select"
                  value={addConfig.template}
                  onChange={(e) => setAddConfig({ ...addConfig, template: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black black-placeholder"
                  disabled={isLoading}
                  aria-label="Template"
                >
                  <option value="empty">Empty rows</option>
                  <option value="copy">Copy from existing</option>
                  <option value="import">Import from clipboard</option>
                </select>
              </div>
            </div>

            {addConfig.template === 'copy' && (
              <div>
                <label htmlFor="copy-from-select" className="block text-sm font-medium text-gray-700 mb-2">
                  Copy from Row
                </label>
                <select
                  id="copy-from-select"
                  value={addConfig.copyFromIndex}
                  onChange={(e) => setAddConfig({ ...addConfig, copyFromIndex: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black black-placeholder"
                  disabled={isLoading}
                  aria-label="Copy from Row"
                >
                  {leads.map((lead, index) => (
                    <option key={lead.id} value={index}>
                      Row {index + 1}: {lead.clientName || 'Unnamed'}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {addConfig.template === 'import' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Import Data (Tab-separated values)
                </label>
                <textarea
                  value={addConfig.importData}
                  onChange={(e) => setAddConfig({ ...addConfig, importData: e.target.value })}
                  placeholder="Paste tab-separated data here..."
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black black-placeholder"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={handleImportData}
                  className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  disabled={isLoading}
                >
                  Parse Import Data
                </button>
              </div>
            )}

            {/* Default Values */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Default Values
              </label>
              <div className="space-y-2">
                {getVisibleColumns().map(column => (
                  <div key={column.fieldKey} className="flex items-center space-x-2">
                    <label className="w-32 text-sm text-gray-600">{column.label}:</label>
                    {column.type === 'select' ? (
                      <select
                        value={addConfig.defaultValues[column.fieldKey] || ''}
                        onChange={(e) => setAddConfig({
                          ...addConfig,
                          defaultValues: {
                            ...addConfig.defaultValues,
                            [column.fieldKey]: e.target.value
                          }
                        })}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                        disabled={isLoading}
                        aria-label={`Default value for ${column.label}`}
                      >
                        <option value="">Select {column.label.toLowerCase()}...</option>
                        {column.options?.map(option => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    ) : column.type === 'date' ? (
                      <input
                        type="date"
                        value={addConfig.defaultValues[column.fieldKey] || ''}
                        onChange={(e) => setAddConfig({
                          ...addConfig,
                          defaultValues: {
                            ...addConfig.defaultValues,
                            [column.fieldKey]: e.target.value
                          }
                        })}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                        disabled={isLoading}
                        aria-label={`Default value for ${column.label}`}
                      />
                    ) : (
                      <input
                        type={column.type === 'number' ? 'number' : column.type === 'email' ? 'email' : 'text'}
                        value={addConfig.defaultValues[column.fieldKey] || ''}
                        onChange={(e) => setAddConfig({
                          ...addConfig,
                          defaultValues: {
                            ...addConfig.defaultValues,
                            [column.fieldKey]: e.target.value
                          }
                        })}
                        placeholder={column.defaultValue || `Enter ${column.label.toLowerCase()}`}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 black-placeholder text-black"
                        disabled={isLoading}
                        aria-label={`Default value for ${column.label}`}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Preview */}
            {previewData.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Preview (showing first 5 rows)
                </label>
                <div className="overflow-x-auto">
                  <table className="min-w-full border border-gray-200 rounded-lg">
                    <thead className="bg-gray-50">
                      <tr>
                        {getVisibleColumns().map(column => (
                          <th key={column.fieldKey} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                            {column.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.map((row, index) => (
                        <tr key={index} className="border-t border-gray-200">
                          {getVisibleColumns().map(column => (
                            <td key={column.fieldKey} className="px-3 py-2 text-sm text-gray-900">
                              {row[column.fieldKey] || '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex space-x-3 pt-4">
              <button
                type="submit"
                disabled={isLoading || addConfig.count < 1}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Adding...' : `Add ${addConfig.count} Rows`}
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

        {/* Delete Rows Tab */}
        {activeTab === 'delete' && (
          <div className="space-y-6">
            <div>
              <label htmlFor="delete-criteria-select" className="block text-sm font-medium text-gray-700 mb-2">
                Delete Criteria
              </label>
              <select
                id="delete-criteria-select"
                value={deleteConfig.criteria}
                onChange={(e) => setDeleteConfig({ ...deleteConfig, criteria: e.target.value as any })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black placeholder:text-black"
                disabled={isLoading}
                aria-label="Delete Criteria"
              >
                <option value="all">All rows</option>
                <option value="status">By status</option>
                <option value="dateRange">By date range</option>
                <option value="search">By search query</option>
                <option value="selected">Selected rows</option>
              </select>
            </div>

            {deleteConfig.criteria === 'status' && (
              <div>
                <label htmlFor="status-select" className="block text-sm font-medium text-gray-700 mb-2">
                  Status
                </label>
                <select
                  id="status-select"
                  value={deleteConfig.status}
                  onChange={(e) => setDeleteConfig({ ...deleteConfig, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black black-placeholder"
                  disabled={isLoading}
                  aria-label="Status"
                >
                  <option value="">Select status...</option>
                  <option value="New">New</option>
                  <option value="Contacted">Contacted</option>
                  <option value="Qualified">Qualified</option>
                  <option value="Proposal">Proposal</option>
                  <option value="Negotiation">Negotiation</option>
                  <option value="Closed Won">Closed Won</option>
                  <option value="Closed Lost">Closed Lost</option>
                </select>
              </div>
            )}

            {deleteConfig.criteria === 'dateRange' && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="date-from-input" className="block text-sm font-medium text-gray-700 mb-2">
                    From Date
                  </label>
                  <input
                    id="date-from-input"
                    type="date"
                    value={deleteConfig.dateFrom}
                    onChange={(e) => setDeleteConfig({ ...deleteConfig, dateFrom: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black black-placeholder"
                    disabled={isLoading}
                  />
                </div>
                <div>
                  <label htmlFor="date-to-input" className="block text-sm font-medium text-gray-700 mb-2">
                    To Date
                  </label>
                  <input
                    id="date-to-input"
                    type="date"
                    value={deleteConfig.dateTo}
                    onChange={(e) => setDeleteConfig({ ...deleteConfig, dateTo: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black black-placeholder"
                    disabled={isLoading}
                  />
                </div>
              </div>
            )}

            {deleteConfig.criteria === 'search' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Search Query
                </label>
                <input
                  type="text"
                  value={deleteConfig.searchQuery}
                  onChange={(e) => setDeleteConfig({ ...deleteConfig, searchQuery: e.target.value })}
                  placeholder="Search in all fields..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black black-placeholder"
                  disabled={isLoading}
                />
              </div>
            )}

            <div className="flex space-x-3 pt-4">
              <button
                onClick={handleDeleteRows}
                disabled={isLoading}
                className="flex-1 bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Deleting...' : 'Delete Rows'}
              </button>
              <button
                onClick={onClose}
                disabled={isLoading}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Bulk Edit Tab */}
        {activeTab === 'bulkEdit' && (
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Rows to Edit
              </label>
              <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
                {leads.map((lead, index) => (
                  <div key={lead.id} className="flex items-center p-2 border-b border-gray-100">
                    <input
                      id={`bulk-edit-checkbox-${lead.id}`}
                      type="checkbox"
                      checked={bulkEditConfig.selectedRows.includes(lead.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setBulkEditConfig({
                            ...bulkEditConfig,
                            selectedRows: [...bulkEditConfig.selectedRows, lead.id]
                          });
                        } else {
                          setBulkEditConfig({
                            ...bulkEditConfig,
                            selectedRows: bulkEditConfig.selectedRows.filter(id => id !== lead.id)
                          });
                        }
                      }}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      disabled={isLoading}
                      aria-label={`Select row ${index + 1} for bulk edit`}
                    />
                    <span className="ml-2 text-sm text-gray-700">
                      Row {index + 1}: {lead.clientName || 'Unnamed'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Field Updates
              </label>
              <div className="space-y-2">
                {getVisibleColumns().map(column => (
                  <div key={column.fieldKey} className="flex items-center space-x-2">
                    <label className="w-32 text-sm text-gray-600">{column.label}:</label>
                    {column.type === 'select' ? (
                      <select
                        value={bulkEditConfig.fieldUpdates[column.fieldKey] || ''}
                        onChange={(e) => setBulkEditConfig({
                          ...bulkEditConfig,
                          fieldUpdates: {
                            ...bulkEditConfig.fieldUpdates,
                            [column.fieldKey]: e.target.value
                          }
                        })}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                        disabled={isLoading}
                        aria-label={`Update value for ${column.label}`}
                      >
                        <option value="">Keep current value</option>
                        {column.options?.map(option => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    ) : column.type === 'date' ? (
                      <input
                        type="date"
                        value={bulkEditConfig.fieldUpdates[column.fieldKey] || ''}
                        onChange={(e) => setBulkEditConfig({
                          ...bulkEditConfig,
                          fieldUpdates: {
                            ...bulkEditConfig.fieldUpdates,
                            [column.fieldKey]: e.target.value
                          }
                        })}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-black"
                        disabled={isLoading}
                        aria-label={`Update value for ${column.label}`}
                      />
                    ) : (
                      <input
                        type={column.type === 'number' ? 'number' : column.type === 'email' ? 'email' : 'text'}
                        value={bulkEditConfig.fieldUpdates[column.fieldKey] || ''}
                        onChange={(e) => setBulkEditConfig({
                          ...bulkEditConfig,
                          fieldUpdates: {
                            ...bulkEditConfig.fieldUpdates,
                            [column.fieldKey]: e.target.value
                          }
                        })}
                        placeholder="Leave empty to keep current value"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 black-placeholder text-black"
                        disabled={isLoading}
                        aria-label={`Update value for ${column.label}`}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex space-x-3 pt-4">
              <button
                onClick={handleBulkEdit}
                disabled={isLoading || bulkEditConfig.selectedRows.length === 0}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Updating...' : `Update ${bulkEditConfig.selectedRows.length} Rows`}
              </button>
              <button
                onClick={onClose}
                disabled={isLoading}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
};

export default RowManagementModal;
