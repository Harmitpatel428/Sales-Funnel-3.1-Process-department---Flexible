'use client';

import React, { useState, useMemo, useEffect, useCallback, lazy, Suspense } from 'react';
import { useLeads } from '../context/LeadContext';
import { useHeaders } from '../context/HeaderContext';
import { useColumns } from '../context/ColumnContext';
import type { Lead, LeadFilters, ColumnConfig } from '../types/shared';
import EditableCell from './EditableCell';
import EditableHeaderCell from './EditableHeaderCell';
import LoadingSpinner from './LoadingSpinner';
import { LeadSchema } from '@/lib/validation/schemas';

const MobileNumbersModal = lazy(() => import('./MobileNumbersModal'));
const ColumnManagementModal = lazy(() => import('./ColumnManagementModal'));

type SortField = keyof Lead | '';
type SortDirection = 'asc' | 'desc';

interface LeadTableProps {
  filters?: LeadFilters;
  onLeadClick?: (lead: Lead) => void;
  selectedLeads?: Set<string>;
  onLeadSelection?: (leadId: string, checked: boolean) => void;
  selectAll?: boolean;
  onSelectAll?: (checked: boolean) => void;
  leads?: Lead[]; // Allow passing custom leads array
  showActions?: boolean; // Show action buttons
  actionButtons?: (lead: Lead) => React.ReactNode; // Custom action buttons
  emptyMessage?: string; // Custom empty message
  className?: string; // Additional CSS classes
  editable?: boolean; // Enable inline editing
  onCellUpdate?: (leadId: string, field: string, value: string) => void; // Cell update callback
  validationErrors?: Record<string, Record<string, string>>; // Validation errors
  headerEditable?: boolean; // Enable header editing
  onColumnAdded?: (column: any) => void; // Column management callbacks
  onColumnDeleted?: (fieldKey: string) => void;
  highlightedLeadId?: string | null;
  roleFilter?: (leads: Lead[]) => Lead[]; // Role-based filter function for SALES_EXECUTIVE visibility
}

interface LeadRowProps {
  lead: Lead;
  onLeadClick?: (lead: Lead) => void;
  selectedLeads: Set<string>;
  onLeadSelection?: (leadId: string, checked: boolean) => void;
  visibleColumns: ColumnConfig[];
  editable: boolean;
  handleCellUpdate: (leadId: string, field: string, value: string) => Promise<void>;
  validationErrors: Record<string, Record<string, string>>;
  showActions: boolean;
  actionButtons?: (lead: Lead) => React.ReactNode;
  getStatusColor: (status: Lead['status']) => string;
  formatDate: (dateString: string) => string;
  getColumnByKey: (fieldKey: string) => ColumnConfig | undefined;
  setMobileModalOpen: (leadId: string | null) => void;
  getMobileNumbers: (lead: Lead) => any[];
  getMainMobileNumber: (lead: Lead) => string;
  getDisplayValue: (lead: Lead, fieldKey: string) => any;
  highlightedLeadId?: string | null;
}

const LeadRow = React.memo(function LeadRow({
  lead,
  onLeadClick,
  selectedLeads,
  onLeadSelection,
  visibleColumns,
  editable,
  handleCellUpdate,
  //   validationErrors, // Unused in render currently but kept for interface consistency if needed
  showActions,
  actionButtons,
  getStatusColor,
  formatDate,
  //   getColumnByKey, // Unused in render currently
  setMobileModalOpen,
  getMobileNumbers,
  getMainMobileNumber,
  getDisplayValue,
  highlightedLeadId
}: LeadRowProps) {

  const rowClassName = `cursor-pointer transition-colors duration-150 hover:bg-gray-50 border-b border-gray-100 ${lead.id === highlightedLeadId ? 'bg-blue-50 border-l-4 border-blue-400' : ''}`;
  const cellClassName = 'px-3 py-2 whitespace-nowrap overflow-hidden text-ellipsis truncate text-sm text-gray-900';

  // Check if lead is new (created within last 24 hours)
  const getBadgeStatus = (lead: Lead): 'JUST_ADDED' | 'NEW' | null => {
    const isManualNew = lead.status === 'New';
    if (!lead.createdAt) return isManualNew ? 'NEW' : null;
    try {
      const created = new Date(lead.createdAt);
      const now = new Date();
      const diffInMinutes = (now.getTime() - created.getTime()) / (1000 * 60);
      if (diffInMinutes < 20) return 'JUST_ADDED';
      if (diffInMinutes < 24 * 60) return 'NEW';
    } catch {
      return isManualNew ? 'NEW' : null;
    }
    return isManualNew ? 'NEW' : null;
  };

  const badgeStatus = getBadgeStatus(lead);

  return (
    <tr
      className={rowClassName}
      onClick={() => onLeadClick && onLeadClick(lead)}
    >
      {onLeadSelection && (
        <td className={`w-12 text-center ${cellClassName}`} onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selectedLeads.has(lead.id)}
            onChange={(e) => onLeadSelection && onLeadSelection(lead.id, e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
            aria-label={`Select lead ${lead.kva}`}
          />
        </td>
      )}
      {visibleColumns.map((column) => {
        const fieldKey = column.fieldKey;
        const mutableValue = (lead as any)[fieldKey] ?? '';
        const snapshotValue = getDisplayValue(lead, fieldKey);
        const defaultValue = column.defaultValue || '';
        const displayValue = snapshotValue ?? defaultValue;

        // Mobile number field
        if (fieldKey === 'mobileNumber') {
          return (
            <td key={fieldKey} className={cellClassName}>
              {editable ? (
                <div className="flex items-center space-x-1">
                  <EditableCell
                    value={getMainMobileNumber(lead).replace(/-/g, '')}
                    type="number"
                    onSave={(val) => {
                      const mobileNumbers = getMobileNumbers(lead);
                      const updatedMobileNumbers = [...mobileNumbers];
                      const mainIndex = updatedMobileNumbers.findIndex(m => m.isMain);
                      if (mainIndex >= 0) {
                        const existing = updatedMobileNumbers[mainIndex];
                        if (existing) {
                          updatedMobileNumbers[mainIndex] = { id: existing.id, number: val, name: existing.name, isMain: existing.isMain };
                        }
                      } else if (updatedMobileNumbers.length > 0) {
                        const existing = updatedMobileNumbers[0];
                        if (existing) {
                          updatedMobileNumbers[0] = { id: existing.id, number: val, name: existing.name, isMain: existing.isMain };
                        }
                      }
                      handleCellUpdate(lead.id, 'mobileNumbers', JSON.stringify(updatedMobileNumbers));
                      handleCellUpdate(lead.id, 'mobileNumber', val);
                    }}
                    placeholder="Mobile number"
                    fieldName="mobileNumber"
                    lead={lead}
                    schema={LeadSchema}
                    entityType="lead"
                    className="text-xs max-w-32 truncate w-full"
                  />
                  <button type="button" onClick={(e) => { e.stopPropagation(); setMobileModalOpen(lead.id); }} className="px-1 py-0.5 text-xs bg-blue-100 text-blue-600 rounded hover:bg-blue-200 transition-colors" title="Edit all mobile numbers">...</button>
                </div>
              ) : (
                <div className="text-xs text-black truncate">{getMainMobileNumber(lead).replace(/-/g, '')}</div>
              )}
            </td>
          );
        }

        // Status field
        if (fieldKey === 'status') {
          const statusDisplayValue = snapshotValue ?? mutableValue;
          return (
            <td key={fieldKey} className={cellClassName}>
              {editable ? (
                <EditableCell value={mutableValue} type={column.type === 'email' || column.type === 'phone' ? 'text' : column.type} options={column.options || ['New', 'CNR', 'Busy', 'Follow-up', 'Deal Close', 'Work Alloted', 'Hotlead', 'Mandate Sent', 'Documentation', 'Others']} onSave={(val) => handleCellUpdate(lead.id, fieldKey, val)} placeholder="Select Status" fieldName={fieldKey} lead={lead} schema={LeadSchema} entityType="lead" className="text-xs w-full" />
              ) : (
                <span className={`px-2 py-0.5 inline-flex text-xs leading-4 font-semibold rounded-full whitespace-nowrap ${getStatusColor(statusDisplayValue || lead.status)}`}>{statusDisplayValue === 'Work Alloted' ? 'WAO' : statusDisplayValue}</span>
              )}
            </td>
          );
        }

        // Date fields
        if (column.type === 'date') {
          const dateDisplayValue = snapshotValue ?? mutableValue;
          return (
            <td key={fieldKey} className={cellClassName}>
              {editable ? (
                <EditableCell value={formatDate(mutableValue)} type="date" onSave={(val) => handleCellUpdate(lead.id, fieldKey, val)} placeholder="DD-MM-YYYY" fieldName={fieldKey} lead={lead} schema={LeadSchema} entityType="lead" className="text-xs w-full" />
              ) : (
                <div className="text-xs text-black whitespace-nowrap">{formatDate(dateDisplayValue)}</div>
              )}
            </td>
          );
        }

        // Default fields
        return (
          <td key={fieldKey} className={cellClassName}>
            {editable ? (
              <EditableCell value={displayValue} type={column.type === 'email' || column.type === 'phone' ? 'text' : column.type} {...(column.options && { options: column.options })} onSave={(val) => handleCellUpdate(lead.id, fieldKey, val)} placeholder={`Enter ${column.label.toLowerCase()}`} fieldName={fieldKey} lead={lead} schema={LeadSchema} entityType="lead" className="text-xs w-full" />
            ) : (
              <div className="flex items-center gap-1">
                <div className="text-xs text-black truncate" title={displayValue}>{displayValue || defaultValue || 'N/A'}</div>
                {fieldKey === 'clientName' && badgeStatus === 'JUST_ADDED' && (<span className="bg-green-100 text-green-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-green-200 shadow-sm animate-pulse whitespace-nowrap">JUST ADDED</span>)}
                {fieldKey === 'clientName' && badgeStatus === 'NEW' && (<span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-purple-200 shadow-sm animate-pulse">NEW</span>)}
              </div>
            )}
          </td>
        );
      })}
      {showActions && (
        <td className={`w-24 ${cellClassName}`} onClick={(e) => e.stopPropagation()}>
          {actionButtons && actionButtons(lead)}
        </td>
      )}
    </tr>
  );
});

const LeadTable = React.memo(function LeadTable({
  filters = {},
  onLeadClick,
  selectedLeads = new Set(),
  onLeadSelection,
  selectAll = false,
  onSelectAll,
  leads: customLeads,
  showActions = false,
  actionButtons,
  emptyMessage = "No leads found matching the current filters.",
  className = "",
  editable = false,
  onCellUpdate,
  validationErrors = {},
  headerEditable = true,
  onColumnAdded,
  onColumnDeleted,
  highlightedLeadId,
  roleFilter
}: LeadTableProps) {
  const { leads: contextLeads, getFilteredLeads } = useLeads();
  const { getDisplayName, updateHeader, headerConfig } = useHeaders();
  const { getVisibleColumns, getColumnByKey } = useColumns();
  const [sortField, setSortField] = useState<SortField>('');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  //   const [useVirtualization, setUseVirtualization] = useState(false); // Removed
  //   const [virtualizationError, setVirtualizationError] = useState(false); // Removed
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);
  const [mobileModalOpen, setMobileModalOpen] = useState<string | null>(null);
  const [editingHeader, setEditingHeader] = useState<string | null>(null);
  const [columnManagementOpen, setColumnManagementOpen] = useState(false);
  const [columnOperation, setColumnOperation] = useState<{ type: 'settings' | 'addBefore' | 'addAfter' | 'delete', fieldKey?: string } | null>(null);

  // Refs for horizontal scroll sync - Removed as implementation is now standard HTML table which handles this natively

  // Use custom leads if provided, otherwise use context leads
  const leads = customLeads || contextLeads;

  // Force re-render when column configuration changes
  const [columnVersion, setColumnVersion] = useState(0);

  useEffect(() => {
    // Track visible column count to force re-render when columns change
    const currentColumns = getVisibleColumns();
    const columnCount = currentColumns.length;
    setColumnVersion(columnCount);
  }, [getVisibleColumns]);


  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (dropdownOpen) {
        setDropdownOpen(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  // Handle cell update
  const handleCellUpdate = useCallback(async (leadId: string, field: string, value: string) => {
    if (onCellUpdate) {
      await onCellUpdate(leadId, field, value);
    }
  }, [onCellUpdate]);

  // Handle mobile numbers modal save
  const handleMobileModalSave = useCallback(async (updatedLead: Lead) => {
    if (onCellUpdate) {
      // Update the mobile numbers
      await onCellUpdate(updatedLead.id, 'mobileNumbers', JSON.stringify(updatedLead.mobileNumbers));
      // Update the main mobile number for backward compatibility
      const mainMobileNumber = updatedLead.mobileNumbers.find(m => m.isMain)?.number || updatedLead.mobileNumbers[0]?.number || '';
      await onCellUpdate(updatedLead.id, 'mobileNumber', mainMobileNumber);
    }
    setMobileModalOpen(null);
  }, [onCellUpdate]);

  // Handle header save
  const handleHeaderSave = useCallback((field: string, newLabel: string) => {
    try {
      updateHeader(field, newLabel);
      setEditingHeader(null);
    } catch (error) {
      console.error('Error updating header:', error);
      // Error will be handled by EditableHeaderCell component
    }
  }, [updateHeader]);

  // Column operation handlers
  const handleAddColumnBefore = useCallback((fieldKey: string) => {
    setColumnOperation({ type: 'addBefore', fieldKey });
    setColumnManagementOpen(true);
  }, []);

  const handleAddColumnAfter = useCallback((fieldKey: string) => {
    setColumnOperation({ type: 'addAfter', fieldKey });
    setColumnManagementOpen(true);
  }, []);

  const handleDeleteColumn = useCallback((fieldKey: string) => {
    setColumnOperation({ type: 'delete', fieldKey });
    setColumnManagementOpen(true);
  }, []);

  const handleColumnSettings = useCallback((fieldKey: string) => {
    setColumnOperation({ type: 'settings', fieldKey });
    setColumnManagementOpen(true);
  }, []);

  const handleColumnAdded = useCallback((column: any) => {
    onColumnAdded?.(column);
    setColumnManagementOpen(false);
    setColumnOperation(null);

    // Scroll headers into view after a short delay
    setTimeout(() => {
      const tableContainer = document.querySelector('.table-container');
      if (tableContainer) {
        tableContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }, [onColumnAdded]);

  const handleColumnDeleted = useCallback((fieldKey: string) => {
    onColumnDeleted?.(fieldKey);
    setColumnManagementOpen(false);
    setColumnOperation(null);
  }, [onColumnDeleted]);

  // Get filtered leads
  const filteredLeads = useMemo(() => {
    let result: Lead[];
    if (customLeads) {
      result = customLeads;
    } else {
      result = getFilteredLeads(filters);
    }
    // Apply role-based filter if provided
    if (roleFilter) {
      result = roleFilter(result);
    }
    return result;
  }, [getFilteredLeads, filters, customLeads, roleFilter]);

  // Optimized Intl.Collator
  const stringCollator = useMemo(() => new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: 'base'
  }), []);

  // Parse caches
  const dateParseCache = useMemo(() => new Map<string, number>(), [filteredLeads.length]);
  const numberParseCache = useMemo(() => new Map<string, number>(), [filteredLeads.length]);

  // Helper function to parse dates for sorting
  const parseDateForSorting = useCallback((dateString: string): number => {
    if (!dateString) return 0;
    const cached = dateParseCache.get(dateString);
    if (cached !== undefined) return cached;

    let timestamp: number;
    if (dateString.match(/^\d{2}-\d{2}-\d{4}$/)) {
      const [day, month, year] = dateString.split('-');
      if (day && month && year) {
        timestamp = new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).getTime();
      } else {
        timestamp = 0;
      }
    } else {
      const date = new Date(dateString);
      timestamp = isNaN(date.getTime()) ? 0 : date.getTime();
    }
    dateParseCache.set(dateString, timestamp);
    return timestamp;
  }, [dateParseCache]);

  // Helper function to parse numeric values for sorting
  const parseNumericForSorting = useCallback((value: string): number => {
    if (!value) return 0;
    const cached = numberParseCache.get(value);
    if (cached !== undefined) return cached;
    const numericMatch = value.toString().match(/\d+/);
    const parsed = numericMatch ? parseInt(numericMatch[0]) : 0;
    numberParseCache.set(value, parsed);
    return parsed;
  }, [numberParseCache]);

  // Memoized comparator
  const createComparator = useMemo(() => {
    const column = sortField ? getColumnByKey(sortField) : null;
    const columnType = column?.type;

    return (a: Lead, b: Lead, aIndex: number, bIndex: number): number => {
      const aValue = sortField ? a[sortField] : undefined;
      const bValue = sortField ? b[sortField] : undefined;

      if (aValue === undefined && bValue === undefined) return aIndex - bIndex;
      if (aValue === undefined) return 1;
      if (bValue === undefined) return -1;

      let comparison = 0;

      if (columnType === 'date') {
        const aTimestamp = parseDateForSorting(String(aValue || ''));
        const bTimestamp = parseDateForSorting(String(bValue || ''));
        comparison = aTimestamp - bTimestamp;
      }
      else if (columnType === 'number') {
        const aNum = parseNumericForSorting(String(aValue || ''));
        const bNum = parseNumericForSorting(String(bValue || ''));
        comparison = aNum - bNum;
      }
      else if (typeof aValue === 'string' && typeof bValue === 'string') {
        comparison = stringCollator.compare(aValue, bValue);
      } else {
        comparison = aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      }

      if (comparison === 0) {
        return aIndex - bIndex;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    };
  }, [sortField, sortDirection, getColumnByKey, parseDateForSorting, parseNumericForSorting, stringCollator]);

  // Sort leads
  const sortedLeads = useMemo(() => {
    if (!sortField) return filteredLeads;
    const indexed = filteredLeads.map((lead, index) => ({ lead, index }));
    indexed.sort((a, b) => createComparator(a.lead, b.lead, a.index, b.index));
    return indexed.map(item => item.lead);
  }, [filteredLeads, sortField, createComparator]);

  // Handle column header click for sorting
  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField, sortDirection]);

  // Render sort indicator
  const renderSortIndicator = useCallback((field: SortField) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  }, [sortField, sortDirection]);

  // Format date
  const formatDate = useCallback((dateString: string) => {
    if (!dateString) return '';
    if (dateString.match(/^\d{2}-\d{2}-\d{4}$/)) {
      return dateString;
    }
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}-${month}-${year}`;
    } catch {
      return dateString;
    }
  }, []);

  // Get status color
  const getStatusColor = useCallback((status: Lead['status']) => {
    switch (status) {
      case 'New': return 'bg-blue-100 text-blue-800';
      case 'CNR': return 'bg-orange-100 text-orange-800';
      case 'Busy': return 'bg-yellow-100 text-yellow-800';
      case 'Follow-up': return 'bg-purple-100 text-purple-800';
      case 'Deal Close': return 'bg-green-100 text-green-800';
      case 'Work Alloted': return 'bg-indigo-100 text-indigo-800';
      case 'Hotlead': return 'bg-red-100 text-red-800';
      case 'Mandate Sent': return 'bg-teal-100 text-teal-800';
      case 'Documentation': return 'bg-cyan-100 text-cyan-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }, []);

  // Get mobile numbers helper
  const getMobileNumbers = useCallback((lead: Lead) => {
    if (!lead.mobileNumbers) return [];
    if (Array.isArray(lead.mobileNumbers)) {
      return lead.mobileNumbers;
    }
    if (typeof lead.mobileNumbers === 'string') {
      try {
        const parsed = JSON.parse(lead.mobileNumbers);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }, []);

  const getMainMobileNumber = useCallback((lead: Lead) => {
    const mobileNumbers = getMobileNumbers(lead);
    const mainNumber = mobileNumbers.find(m => m.isMain)?.number;
    return mainNumber || lead.mobileNumber || '';
  }, [getMobileNumbers]);

  const getDisplayValue = useCallback((lead: Lead, fieldKey: string): any => {
    return lead.submitted_payload?.[fieldKey] ?? (lead as any)[fieldKey];
  }, []);

  // Helper to determine column width class
  const getColumnWidthClass = useCallback((fieldKey: string, columnType?: string) => {
    // Checkbox is handled separately (w-12)

    // Status: w-28
    if (fieldKey === 'status') return 'w-28';

    // KVA: w-20
    if (fieldKey.toLowerCase() === 'kva') return 'w-20';

    // DISCOM: w-24
    if (fieldKey.toLowerCase() === 'discom') return 'w-24';

    // Dates: w-36
    if (columnType === 'date') return 'w-36';
    if (fieldKey.toLowerCase().includes('date')) return 'w-36';

    // Company: w-[20%]
    if (fieldKey.toLowerCase() === 'company' || fieldKey.toLowerCase().includes('company')) return 'w-[20%]';

    // Client Name: w-[18%]
    if (fieldKey === 'clientName' || fieldKey.toLowerCase().includes('name')) return 'w-[18%]';

    // Mobile: w-[14%]
    if (fieldKey === 'mobileNumber' || fieldKey.toLowerCase().includes('mobile')) return 'w-[14%]';

    // Default fallback width
    return 'w-40';
  }, []);

  return (
    <div className={`relative flex flex-col h-full ${className}`}>


      {/* Main Table Container */}
      <div className="w-full overflow-x-auto flex-1 h-full relative">
        <table className="w-full table-fixed border-collapse text-left">
          <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10 shadow-sm">
            <tr>
              {onLeadSelection && (
                <th className="px-3 py-2 w-12 text-center sticky top-0 bg-gray-50 z-10 border-b border-gray-200">
                  <div className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={selectAll}
                      ref={(input) => {
                        if (input) {
                          const selectedCount = selectedLeads ? selectedLeads.size : 0;
                          input.indeterminate = selectedCount > 0 && selectedCount < filteredLeads.length;
                        }
                      }}
                      onChange={(e) => onSelectAll && onSelectAll(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                      aria-label="Select all leads"
                    />
                  </div>
                </th>
              )}
              {getVisibleColumns().map((column) => {
                const field = column.fieldKey;
                const isEditing = editingHeader === field;
                const displayName = getDisplayName(field);
                const widthClass = getColumnWidthClass(field, column.type);

                return (
                  <th
                    key={field}
                    className={`px-3 py-2 text-left text-xs font-medium text-black uppercase tracking-wider sticky top-0 bg-gray-50 z-10 border-b border-gray-200 whitespace-nowrap overflow-hidden text-ellipsis ${widthClass} ${!isEditing ? 'cursor-pointer hover:bg-gray-100' : ''}`}
                    onClick={!isEditing ? () => handleSort(field as SortField) : undefined}
                    title={displayName}
                  >
                    {headerEditable ? (
                      <div className="flex items-center w-full gap-2">
                        <EditableHeaderCell
                          fieldKey={field}
                          currentLabel={displayName}
                          onSave={handleHeaderSave}
                          onCancel={() => setEditingHeader(null)}
                          disabled={!headerEditable}
                          className="flex-1 min-w-0"
                          onEditStart={(field) => setEditingHeader(field)}
                          onEditEnd={() => setEditingHeader(null)}
                          existingHeaders={Object.values(headerConfig)}
                          onAddColumnBefore={handleAddColumnBefore}
                          onAddColumnAfter={handleAddColumnAfter}
                          onDeleteColumn={handleDeleteColumn}
                          onColumnSettings={handleColumnSettings}
                        />
                        {!isEditing && <span className="flex-shrink-0">{renderSortIndicator(field as SortField)}</span>}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        {displayName}
                        {renderSortIndicator(field as SortField)}
                      </div>
                    )}
                  </th>
                );
              })}
              {showActions && (
                <th className="px-3 py-2 text-left text-xs font-medium text-black uppercase tracking-wider sticky top-0 bg-gray-50 z-10 border-b border-gray-200 whitespace-nowrap w-24">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {sortedLeads.length > 0 ? (
              sortedLeads.map((lead) => (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  onLeadClick={onLeadClick}
                  selectedLeads={selectedLeads}
                  onLeadSelection={onLeadSelection}
                  visibleColumns={getVisibleColumns()}
                  editable={editable}
                  handleCellUpdate={handleCellUpdate}
                  validationErrors={validationErrors}
                  showActions={showActions}
                  actionButtons={actionButtons}
                  getStatusColor={getStatusColor}
                  formatDate={formatDate}
                  getColumnByKey={getColumnByKey}
                  setMobileModalOpen={setMobileModalOpen}
                  getMobileNumbers={getMobileNumbers}
                  getMainMobileNumber={getMainMobileNumber}
                  getDisplayValue={getDisplayValue}
                  highlightedLeadId={highlightedLeadId}
                />
              ))
            ) : (
              <tr>
                <td colSpan={getVisibleColumns().length + (onLeadSelection ? 1 : 0) + (showActions ? 1 : 0)} className="px-6 py-12 text-center text-sm text-gray-500">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Numbers Modal */}
      {mobileModalOpen && (
        <Suspense fallback={<LoadingSpinner text="Loading..." />}>
          <MobileNumbersModal
            isOpen={true}
            onClose={() => setMobileModalOpen(null)}
            lead={sortedLeads.find(lead => lead.id === mobileModalOpen)!}
            onSave={handleMobileModalSave}
          />
        </Suspense>
      )}

      {/* Column Management Modal */}
      {columnManagementOpen && (
        <Suspense fallback={<LoadingSpinner text="Loading..." />}>
          <ColumnManagementModal
            isOpen={columnManagementOpen}
            onClose={() => {
              setColumnManagementOpen(false);
              setColumnOperation(null);
            }}
            onColumnAdded={handleColumnAdded}
            onColumnDeleted={handleColumnDeleted}
            {...(columnOperation && { operation: columnOperation })}
          />
        </Suspense>
      )}
    </div>
  );
});

export default LeadTable;