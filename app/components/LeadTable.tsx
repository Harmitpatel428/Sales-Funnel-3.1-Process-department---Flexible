'use client';

import React, { useState, useMemo, useEffect, useCallback, lazy, Suspense } from 'react';
import { FixedSizeList as List } from 'react-window';
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
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);
  const [mobileModalOpen, setMobileModalOpen] = useState<string | null>(null);
  const [editingHeader, setEditingHeader] = useState<string | null>(null);
  const [columnManagementOpen, setColumnManagementOpen] = useState(false);
  const [columnOperation, setColumnOperation] = useState<{ type: 'settings' | 'addBefore' | 'addAfter' | 'delete', fieldKey?: string } | null>(null);

  // Virtualization settings
  // Virtual scrolling enabled for >100 leads to improve performance
  const [useVirtualization, setUseVirtualization] = useState(false);
  const [virtualizationError, setVirtualizationError] = useState(false);
  const ROW_HEIGHT = 40; // Matches current row height with padding
  const CONTAINER_HEIGHT = 800; // Visible table height - increased for better UX
  const VIRTUALIZATION_THRESHOLD = 100; // Enable when >100 leads

  // Use custom leads if provided, otherwise use context leads
  const leads = customLeads || contextLeads;

  // Force re-render when column configuration changes
  const [columnVersion, setColumnVersion] = useState(0);

  useEffect(() => {
    // Track visible column count to force re-render when columns change
    const currentColumns = getVisibleColumns();
    const columnCount = currentColumns.length;
    if (process.env.NODE_ENV === 'development') {
      console.log('Column configuration updated:', columnCount, 'visible columns');
    }
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
    if (process.env.NODE_ENV === 'development') {
      console.log('Column added successfully:', column);
    }
    onColumnAdded?.(column);
    setColumnManagementOpen(false);
    setColumnOperation(null);
    // Force table re-render
    if (process.env.NODE_ENV === 'development') {
      console.log('Table will re-render with new column:', column.fieldKey);
    }

    // Scroll headers into view after a short delay to allow for re-render
    setTimeout(() => {
      const tableContainer = document.querySelector('.table-container');
      if (tableContainer) {
        tableContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }, [onColumnAdded]);

  const handleColumnDeleted = useCallback((fieldKey: string) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('Column deleted successfully:', fieldKey);
    }
    onColumnDeleted?.(fieldKey);
    setColumnManagementOpen(false);
    setColumnOperation(null);
    // Force table re-render
    if (process.env.NODE_ENV === 'development') {
      console.log('Table will re-render without column:', fieldKey);
    }
  }, [onColumnDeleted]);

  // Get filtered leads
  // Dependencies use stable primitives: getFilteredLeads is memoized in context,
  // filters is a stable object reference, customLeads from props
  // Using leads.length instead of leads array prevents unnecessary recomputations
  const filteredLeads = useMemo(() => {
    let result: Lead[];
    if (customLeads) {
      // If custom leads are provided, return them as is (no filtering)
      result = customLeads;
    } else {
      result = getFilteredLeads(filters);
    }
    // Apply role-based filter if provided (for SALES_EXECUTIVE visibility restriction)
    if (roleFilter) {
      result = roleFilter(result);
    }
    return result;
  }, [getFilteredLeads, filters, leads.length, customLeads, roleFilter]);

  // Optimized Intl.Collator for faster string comparisons (created once)
  const stringCollator = useMemo(() => new Intl.Collator(undefined, {
    numeric: true,
    sensitivity: 'base'
  }), []);

  // Parse caches for avoiding repeated parsing during sorting
  const dateParseCache = useMemo(() => new Map<string, number>(), [filteredLeads.length]);
  const numberParseCache = useMemo(() => new Map<string, number>(), [filteredLeads.length]);

  // Helper function to parse dates for sorting with caching
  const parseDateForSorting = useCallback((dateString: string): number => {
    if (!dateString) return 0; // Return epoch for empty dates

    // Check cache first
    const cached = dateParseCache.get(dateString);
    if (cached !== undefined) return cached;

    let timestamp: number;

    // Handle DD-MM-YYYY format
    if (dateString.match(/^\d{2}-\d{2}-\d{4}$/)) {
      const [day, month, year] = dateString.split('-');
      if (day && month && year) {
        timestamp = new Date(parseInt(year), parseInt(month) - 1, parseInt(day)).getTime();
      } else {
        timestamp = 0;
      }
    } else {
      // Handle ISO format or other formats
      const date = new Date(dateString);
      timestamp = isNaN(date.getTime()) ? 0 : date.getTime();
    }

    // Cache and return
    dateParseCache.set(dateString, timestamp);
    return timestamp;
  }, [dateParseCache]);

  // Helper function to parse numeric values for sorting with caching
  const parseNumericForSorting = useCallback((value: string): number => {
    if (!value) return 0;

    // Check cache first
    const cached = numberParseCache.get(value);
    if (cached !== undefined) return cached;

    // Extract numbers from the string
    const numericMatch = value.toString().match(/\d+/);
    const parsed = numericMatch ? parseInt(numericMatch[0]) : 0;

    // Cache and return
    numberParseCache.set(value, parsed);
    return parsed;
  }, [numberParseCache]);

  // Memoized comparator function based on column type
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

      // Handle date fields
      if (columnType === 'date') {
        const aTimestamp = parseDateForSorting(String(aValue || ''));
        const bTimestamp = parseDateForSorting(String(bValue || ''));
        comparison = aTimestamp - bTimestamp;
      }
      // Handle numeric fields
      else if (columnType === 'number') {
        const aNum = parseNumericForSorting(String(aValue || ''));
        const bNum = parseNumericForSorting(String(bValue || ''));
        comparison = aNum - bNum;
      }
      // Handle string fields with optimized Intl.Collator
      else if (typeof aValue === 'string' && typeof bValue === 'string') {
        comparison = stringCollator.compare(aValue, bValue);
      } else {
        comparison = aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      }

      // Stable sort: use index as tiebreaker for equal elements
      if (comparison === 0) {
        return aIndex - bIndex;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    };
  }, [sortField, sortDirection, getColumnByKey, parseDateForSorting, parseNumericForSorting, stringCollator]);

  // Sort leads based on current sort field and direction with optimized comparator
  const sortedLeads = useMemo(() => {
    if (!sortField) return filteredLeads;

    // Create indexed array for stable sort
    const indexed = filteredLeads.map((lead, index) => ({ lead, index }));

    // Sort with memoized comparator
    indexed.sort((a, b) => createComparator(a.lead, b.lead, a.index, b.index));

    return indexed.map(item => item.lead);
  }, [filteredLeads, sortField, createComparator]);

  // Enable virtual scrolling for large datasets to improve performance
  useEffect(() => {
    setUseVirtualization(sortedLeads.length > VIRTUALIZATION_THRESHOLD);
    // Reset virtualization error when threshold changes
    if (sortedLeads.length <= VIRTUALIZATION_THRESHOLD) {
      setVirtualizationError(false);
    }
  }, [sortedLeads.length, VIRTUALIZATION_THRESHOLD]);

  // Add error detection effect for virtualization issues
  useEffect(() => {
    if (useVirtualization && sortedLeads.length > 0) {
      // Check if table rows are rendering correctly after a short delay
      const checkTimeout = setTimeout(() => {
        const tableRows = document.querySelectorAll('tbody tr');
        const visibleRows = Array.from(tableRows).filter(row => {
          const htmlRow = row as HTMLElement;
          return htmlRow.offsetHeight > 0 && htmlRow.offsetWidth > 0;
        });

        // If we have leads but no visible rows, virtualization might be broken
        if (sortedLeads.length > 0 && visibleRows.length === 0) {
          console.warn('Virtualization may be causing rendering issues, falling back to standard rendering');
          setVirtualizationError(true);
        }
      }, 100);

      return () => clearTimeout(checkTimeout);
    }
  }, [useVirtualization, sortedLeads.length]);

  // Add render time tracking and performance monitoring
  if (process.env.NODE_ENV === 'development') {
    console.log('LeadTable rendering', sortedLeads.length, 'leads', useVirtualization ? 'with virtualization' : 'standard');

    // Performance warning for very large datasets
    if (sortedLeads.length > 10000) {
      console.warn(`Large dataset detected (${sortedLeads.length} leads). Consider implementing pagination or advanced virtualization.`);
    }
  }

  // Handle column header click for sorting
  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      // Toggle direction if clicking the same field
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Set new field and default to ascending
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField, sortDirection]);

  // Render sort indicator
  const renderSortIndicator = useCallback((field: SortField) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? ' ↑' : ' ↓';
  }, [sortField, sortDirection]);

  // Format date for display in DD-MM-YYYY format
  const formatDate = useCallback((dateString: string) => {
    if (!dateString) return '';

    // If already in DD-MM-YYYY format, return as is
    if (dateString.match(/^\d{2}-\d{2}-\d{4}$/)) {
      return dateString;
    }

    // If it's a Date object or ISO string, convert to DD-MM-YYYY
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString; // Return original if invalid

      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();

      return `${day}-${month}-${year}`;
    } catch {
      return dateString; // Return original if conversion fails
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

  // Calculate column span for empty state
  const getColumnSpan = () => {
    let span = getVisibleColumns().length; // Use dynamic column count from configuration
    if (onLeadSelection) span += 1; // Add checkbox column
    if (showActions) span += 1; // Add actions column
    return span;
  };

  // Helper function to safely parse mobile numbers
  const getMobileNumbers = useCallback((lead: Lead) => {
    if (!lead.mobileNumbers) return [];

    // If it's already an array, return it
    if (Array.isArray(lead.mobileNumbers)) {
      return lead.mobileNumbers;
    }

    // If it's a string, try to parse it as JSON
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

  // Helper function to get main mobile number
  const getMainMobileNumber = useCallback((lead: Lead) => {
    const mobileNumbers = getMobileNumbers(lead);
    const mainNumber = mobileNumbers.find(m => m.isMain)?.number;
    return mainNumber || lead.mobileNumber || '';
  }, [getMobileNumbers]);

  const getDisplayValue = useCallback((lead: Lead, fieldKey: string): any => {
    return lead.submitted_payload?.[fieldKey] ?? (lead as any)[fieldKey];
  }, []);

  // Memoize the itemData object to prevent LeadRow re-renders
  const itemData = useMemo(() => ({
    leads: sortedLeads,
    onLeadClick,
    selectedLeads,
    onLeadSelection,
    getVisibleColumns,
    editable,
    handleCellUpdate,
    validationErrors,
    showActions,
    actionButtons,
    getStatusColor,
    formatDate,
    getColumnByKey,
    setMobileModalOpen,
    getMobileNumbers,
    getMainMobileNumber,
    getDisplayValue,
    highlightedLeadId,
  }), [
    sortedLeads,
    onLeadClick,
    selectedLeads,
    onLeadSelection,
    getVisibleColumns,
    editable,
    handleCellUpdate,
    validationErrors,
    showActions,
    actionButtons,
    getStatusColor,
    formatDate,
    getColumnByKey,
    setMobileModalOpen,
    getMobileNumbers,
    getMainMobileNumber,
    getDisplayValue,
    highlightedLeadId,
  ]);

  // Memoized row component for virtual scrolling
  const LeadRow = React.memo<{
    index: number;
    style?: React.CSSProperties;
    data: {
      leads: Lead[];
      onLeadClick?: (lead: Lead) => void;
      selectedLeads: Set<string>;
      onLeadSelection?: (leadId: string, checked: boolean) => void;
      getVisibleColumns: () => ColumnConfig[];
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
    };
  }>(({ index, style, data }) => {
    const lead = data.leads[index];
    if (!lead) return null;

    // Apply virtual scrolling styles conditionally to avoid linting warnings
    const rowProps: React.HTMLAttributes<HTMLTableRowElement> = {
      className: `cursor-pointer transition-all duration-300 hover:bg-gray-50 ${lead.id === data.highlightedLeadId ? 'bg-blue-50 border-l-4 border-blue-400 shadow-sm' : ''}`,
      onClick: () => data.onLeadClick && data.onLeadClick(lead),
    };

    // Only add style prop when virtual scrolling is active
    if (style) {

      rowProps.style = style;
    }

    // Check if lead is new (created within last 24 hours)
    const getBadgeStatus = (lead: Lead): 'JUST_ADDED' | 'NEW' | null => {
      // If manually marked as new via status, treat as New (unless very fresh)
      const isManualNew = lead.status === 'New';

      if (!lead.createdAt) return isManualNew ? 'NEW' : null;

      try {
        const created = new Date(lead.createdAt);
        const now = new Date();
        const diffInMinutes = (now.getTime() - created.getTime()) / (1000 * 60);

        if (diffInMinutes < 20) return 'JUST_ADDED';
        if (diffInMinutes < 24 * 60) return 'NEW';
      } catch (e) {
        return isManualNew ? 'NEW' : null;
      }

      return isManualNew ? 'NEW' : null;
    };

    const badgeStatus = getBadgeStatus(lead);

    return (
      <tr key={lead.id} {...rowProps}>
        {data.onLeadSelection && (
          <td className="px-0.5 py-0.5 whitespace-nowrap">
            <div className="w-9 h-8 flex items-center justify-center">
              <input
                type="checkbox"
                checked={data.selectedLeads.has(lead.id)}
                onChange={(e) => data.onLeadSelection && data.onLeadSelection(lead.id, e.target.checked)}
                onClick={(e) => e.stopPropagation()}
                className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                aria-label={`Select lead ${lead.kva}`}
              />
            </div>
          </td>
        )}
        {data.getVisibleColumns().map((column) => {
          const fieldKey = column.fieldKey;
          // Use mutable value for editable cells, getDisplayValue (submitted_payload) for read-only display
          const mutableValue = (lead as any)[fieldKey] ?? '';
          const snapshotValue = data.getDisplayValue(lead, fieldKey);

          // Debug logging for dynamic columns
          if (process.env.NODE_ENV === 'development') {
            if (!(fieldKey in lead)) {
              console.log(`Dynamic column "${fieldKey}" not found in lead data, using default value`);
            }
          }

          // Get the column configuration for this field
          const columnConfig = data.getColumnByKey(fieldKey);
          const defaultValue = columnConfig?.defaultValue || '';
          // For display, prioritize submitted_payload via getDisplayValue
          const displayValue = snapshotValue ?? defaultValue;

          // Special handling for mobile number field
          if (fieldKey === 'mobileNumber') {
            return (
              <td key={fieldKey} className="px-0.5 py-0.5 whitespace-nowrap">
                {data.editable ? (
                  <div className="flex items-center space-x-1">
                    <EditableCell
                      value={getMainMobileNumber(lead).replace(/-/g, '')}
                      type="number"
                      onSave={(val) => {
                        // Update the main mobile number
                        const mobileNumbers = getMobileNumbers(lead);
                        const updatedMobileNumbers = [...mobileNumbers];
                        const mainIndex = updatedMobileNumbers.findIndex(m => m.isMain);
                        if (mainIndex >= 0) {
                          const existing = updatedMobileNumbers[mainIndex];
                          if (existing) {
                            updatedMobileNumbers[mainIndex] = {
                              id: existing.id,
                              number: val,
                              name: existing.name,
                              isMain: existing.isMain
                            };
                          }
                        } else if (updatedMobileNumbers.length > 0) {
                          const existing = updatedMobileNumbers[0];
                          if (existing) {
                            updatedMobileNumbers[0] = {
                              id: existing.id,
                              number: val,
                              name: existing.name,
                              isMain: existing.isMain
                            };
                          }
                        }
                        data.handleCellUpdate(lead.id, 'mobileNumbers', JSON.stringify(updatedMobileNumbers));
                        data.handleCellUpdate(lead.id, 'mobileNumber', val);
                      }}
                      placeholder="Mobile number"
                      fieldName="mobileNumber"
                      lead={lead}
                      schema={LeadSchema}
                      entityType="lead"
                      className="text-xs max-w-12 truncate flex-1"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        data.setMobileModalOpen(lead.id);
                      }}
                      className="px-1 py-0.5 text-xs bg-blue-100 text-blue-600 rounded hover:bg-blue-200 transition-colors"
                      title="Edit all mobile numbers"
                    >
                      ...
                    </button>
                  </div>
                ) : (
                  <div className="px-1 text-xs text-black max-w-12 truncate">
                    {getMainMobileNumber(lead).replace(/-/g, '')}
                  </div>
                )}
              </td>
            );
          }

          // Special handling for status field
          if (fieldKey === 'status') {
            // Use snapshotValue for display, mutableValue for editable cells
            const statusDisplayValue = snapshotValue ?? mutableValue;
            return (
              <td key={fieldKey} className="px-0.5 py-0.5 whitespace-nowrap">
                {data.editable ? (
                  <EditableCell
                    value={mutableValue}
                    type={column.type === 'email' || column.type === 'phone' ? 'text' : column.type}
                    options={column.options || ['New', 'CNR', 'Busy', 'Follow-up', 'Deal Close', 'Work Alloted', 'Hotlead', 'Mandate Sent', 'Documentation', 'Others']}
                    onSave={(val) => data.handleCellUpdate(lead.id, fieldKey, val)}
                    placeholder="Select Status"
                    fieldName={fieldKey}
                    lead={lead}
                    schema={LeadSchema}
                    entityType="lead"
                    className="text-xs"
                  />
                ) : (
                  <span className={`px-1 inline-flex text-xs leading-5 font-semibold rounded-full max-w-16 truncate ${data.getStatusColor(statusDisplayValue || lead.status)}`}>
                    {statusDisplayValue === 'Work Alloted' ? 'WAO' : statusDisplayValue}
                  </span>
                )}
              </td>
            );
          }

          // Special handling for date fields
          if (column.type === 'date') {
            // Use snapshotValue for display, mutableValue for editable cells
            const dateDisplayValue = snapshotValue ?? mutableValue;
            return (
              <td key={fieldKey} className="px-0.5 py-0.5 whitespace-nowrap">
                {data.editable ? (
                  <EditableCell
                    value={data.formatDate(mutableValue)}
                    type="date"
                    onSave={(val) => data.handleCellUpdate(lead.id, fieldKey, val)}
                    placeholder="DD-MM-YYYY"
                    fieldName={fieldKey}
                    lead={lead}
                    schema={LeadSchema}
                    entityType="lead"
                    className="text-xs min-w-16"
                  />
                ) : (
                  <div className="text-xs text-black min-w-16">{data.formatDate(dateDisplayValue)}</div>
                )}
              </td>
            );
          }

          // Default handling for other fields
          return (
            <td key={fieldKey} className="px-0.5 py-0.5 whitespace-nowrap">
              {data.editable ? (
                <EditableCell
                  value={displayValue}
                  type={column.type === 'email' || column.type === 'phone' ? 'text' : column.type}
                  {...(column.options && { options: column.options })}
                  onSave={(val) => data.handleCellUpdate(lead.id, fieldKey, val)}
                  placeholder={`Enter ${column.label.toLowerCase()}`}
                  fieldName={fieldKey}
                  lead={lead}
                  schema={LeadSchema}
                  entityType="lead"
                  className="text-xs"
                />
              ) : (
                <div className="flex items-center gap-1">
                  <div className="text-xs text-black truncate" title={displayValue}>
                    {displayValue || defaultValue || 'N/A'}
                  </div>
                  {fieldKey === 'clientName' && badgeStatus === 'JUST_ADDED' && (
                    <span className="bg-green-100 text-green-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-green-200 shadow-sm animate-pulse whitespace-nowrap">
                      JUST ADDED
                    </span>
                  )}
                  {fieldKey === 'clientName' && badgeStatus === 'NEW' && (
                    <span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-purple-200 shadow-sm animate-pulse">
                      NEW
                    </span>
                  )}
                </div>
              )}
            </td>
          );
        })}
        {data.showActions && (
          <td className="px-0.5 py-0.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
            {data.actionButtons && data.actionButtons(lead)}
          </td>
        )}
      </tr>
    );
  });
  LeadRow.displayName = 'LeadRow';

  return (
    <div className={`overflow-x-auto relative ${className}`}>
      {/* Loading indicator for large datasets */}
      {sortedLeads.length > 1000 && (
        <div className="absolute top-0 left-0 right-0 bg-blue-50 text-blue-800 text-xs px-2 py-1 text-center z-20">
          Loading {sortedLeads.length} leads...
        </div>
      )}

      {/* Count badge and performance indicator */}
      {sortedLeads.length > 0 && (
        <div className="absolute top-0 right-0 bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded-bl z-20">
          Displaying {sortedLeads.length} leads {(useVirtualization && !virtualizationError) ? '(Optimized Mode)' : '(Standard Mode)'}
        </div>
      )}
      <table key={columnVersion} className="min-w-full divide-y divide-gray-200 bg-white table-container">
        <thead className="bg-gray-50 sticky top-0 z-30 shadow-sm">
          <tr>
            {onLeadSelection && (
              <th scope="col" className="px-0.5 py-1.5 text-left w-8">
                <div className="w-8 h-8 flex items-center justify-center">
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

              // Define column widths based on column configuration
              const getColumnWidth = (column: ColumnConfig) => {
                // Use column width from configuration, mapping to Tailwind classes
                if (column.width <= 100) return 'w-8';
                if (column.width <= 120) return 'w-8';
                if (column.width <= 150) return 'w-20';
                if (column.width <= 200) return 'w-32';
                if (column.width <= 250) return 'w-36';
                return 'w-40';
              };

              return (
                <th
                  key={field}
                  scope="col"
                  className={`px-0.5 py-1.5 text-left text-xs font-medium text-black uppercase tracking-wider ${!isEditing ? 'cursor-pointer hover:bg-gray-100' : ''} ${getColumnWidth(column)}`}
                  onClick={!isEditing ? () => handleSort(field as SortField) : undefined}
                >
                  {headerEditable ? (
                    <div className="flex items-center w-full">
                      <EditableHeaderCell
                        fieldKey={field}
                        currentLabel={displayName}
                        onSave={handleHeaderSave}
                        onCancel={() => setEditingHeader(null)}
                        disabled={!headerEditable}
                        className="flex-1"
                        onEditStart={(field) => setEditingHeader(field)}
                        onEditEnd={() => setEditingHeader(null)}
                        existingHeaders={Object.values(headerConfig)}
                        onAddColumnBefore={handleAddColumnBefore}
                        onAddColumnAfter={handleAddColumnAfter}
                        onDeleteColumn={handleDeleteColumn}
                        onColumnSettings={handleColumnSettings}
                      />
                      {!isEditing && renderSortIndicator(field as SortField)}
                    </div>
                  ) : (
                    <span className="flex items-center">
                      {displayName}
                      {renderSortIndicator(field as SortField)}
                    </span>
                  )}
                </th>
              );
            })}
            {showActions && (
              <th scope="col" className="px-0.5 py-1.5 text-left text-xs font-medium text-black uppercase tracking-wider w-20">
                Actions
              </th>
            )}
          </tr>
        </thead>
        {/* Conditional rendering: Virtual scrolling for large lists, standard rendering for small lists */}
        {sortedLeads.length > 0 ? (
          (useVirtualization && !virtualizationError) ? (
            // Virtual scrolling enabled for performance with large datasets
            // Note: Virtual scrolling may cause table structure issues in some browsers
            // If data doesn't display correctly, reduce VIRTUALIZATION_THRESHOLD
            <List
              key={sortedLeads.length}
              height={Math.min(CONTAINER_HEIGHT, window.innerHeight - 300)}
              itemCount={sortedLeads.length}
              itemSize={ROW_HEIGHT}
              width="100%"
              overscanCount={10}
              innerElementType="tbody"
              className="bg-white divide-y divide-gray-200"
              itemData={itemData}
            >
              {LeadRow}
            </List>
          ) : (
            // Standard rendering optimized with React.memo and stable keys
            // Handles up to 5000 leads efficiently on modern browsers
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedLeads.map((lead, index) => (
                <LeadRow
                  key={lead.id}
                  index={index}
                  data={itemData}
                />
              ))}
            </tbody>
          )
        ) : (
          <tbody className="bg-white divide-y divide-gray-200">
            <tr>
              <td colSpan={getColumnSpan()} className="px-0.5 py-0.5 text-center text-xs text-black">
                {emptyMessage}
              </td>
            </tr>
          </tbody>
        )}

        {/* Show warning when fallback occurs */}
        {virtualizationError && (
          <tbody className="bg-yellow-50 divide-y divide-gray-200">
            <tr>
              <td colSpan={getColumnSpan()} className="px-0.5 py-0.5 text-center text-xs text-yellow-800 bg-yellow-100">
                Displaying {sortedLeads.length} leads in standard mode for better compatibility
              </td>
            </tr>
          </tbody>
        )}
      </table>

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