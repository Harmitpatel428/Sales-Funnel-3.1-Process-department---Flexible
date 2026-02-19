'use client';

import React, { useState, useMemo, useEffect, useCallback, lazy, Suspense, useRef } from 'react';
import { FixedSizeList as List, ListChildComponentProps } from 'react-window';
import { useResizeObserver } from '../hooks/useResizeObserver';
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

// Defined column widths for consistent alignment
const COLUMN_WIDTHS: Record<string, number> = {
  status: 120,
  kva: 80,
  discom: 100,
  date: 120, // General date column width
  company: 200,
  clientName: 180,
  mobileNumber: 140,
  default: 160,
  actions: 100,
  checkbox: 50
};

interface LeadTableProps {
  filters?: LeadFilters;
  onLeadClick?: (lead: Lead) => void;
  selectedLeads?: Set<string>;
  onLeadSelection?: (leadId: string, checked: boolean) => void;
  selectAll?: boolean;
  onSelectAll?: (checked: boolean) => void;
  leads?: Lead[];
  showActions?: boolean;
  actionButtons?: (lead: Lead) => React.ReactNode;
  emptyMessage?: string;
  className?: string;
  editable?: boolean;
  onCellUpdate?: (leadId: string, field: string, value: string) => void;
  validationErrors?: Record<string, Record<string, string>>;
  headerEditable?: boolean;
  onColumnAdded?: (column: any) => void;
  onColumnDeleted?: (fieldKey: string) => void;
  highlightedLeadId?: string | null;
  roleFilter?: (leads: Lead[]) => Lead[];
  stickyHeader?: boolean;
}

interface LeadRowProps {
  lead: Lead;
  style: React.CSSProperties;
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
  columnWidths: Record<string, number>;
}

const LeadRow = React.memo(function LeadRow({
  lead,
  style,
  onLeadClick,
  selectedLeads,
  onLeadSelection,
  visibleColumns,
  editable,
  handleCellUpdate,
  showActions,
  actionButtons,
  getStatusColor,
  formatDate,
  setMobileModalOpen,
  getMobileNumbers,
  getMainMobileNumber,
  getDisplayValue,
  highlightedLeadId,
  columnWidths
}: LeadRowProps) {

  const rowClassName = `flex items-center cursor-pointer transition-colors duration-150 hover:bg-gray-50 border-b border-gray-100 ${lead.id === highlightedLeadId ? 'bg-blue-50 border-l-4 border-blue-400' : ''}`;

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
    <div
      className={rowClassName}
      style={style}
      onClick={() => onLeadClick && onLeadClick(lead)}
    >
      {onLeadSelection && (
        <div style={{ width: columnWidths.checkbox, minWidth: columnWidths.checkbox }} className="flex-shrink-0 flex items-center justify-center px-1 py-1 border-r border-transparent" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selectedLeads.has(lead.id)}
            onChange={(e) => onLeadSelection && onLeadSelection(lead.id, e.target.checked)}
            className="w-3.5 h-3.5 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
            aria-label={`Select lead ${lead.kva}`}
          />
        </div>
      )}
      {visibleColumns.map((column) => {
        const fieldKey = column.fieldKey;
        const width = columnWidths[fieldKey] || columnWidths.default;

        // Determine specific width based on column type if not explicit
        let finalWidth = width;
        if (column.type === 'date' || fieldKey.toLowerCase().includes('date')) finalWidth = columnWidths.date;
        if (fieldKey === 'status') finalWidth = columnWidths.status;
        if (fieldKey === 'kva') finalWidth = columnWidths.kva;
        if (fieldKey === 'discom') finalWidth = columnWidths.discom;
        if (fieldKey === 'company' || fieldKey.includes('company')) finalWidth = columnWidths.company;
        if (fieldKey === 'clientName' || fieldKey.includes('name')) finalWidth = columnWidths.clientName;
        if (fieldKey === 'mobileNumber') finalWidth = columnWidths.mobileNumber;

        const mutableValue = (lead as any)[fieldKey] ?? '';
        const snapshotValue = getDisplayValue(lead, fieldKey);
        const defaultValue = column.defaultValue || '';
        const displayValue = snapshotValue ?? defaultValue;

        return (
          <div
            key={fieldKey}
            style={{ width: finalWidth, minWidth: finalWidth }}
            className="flex-shrink-0 px-2 py-1 text-xs text-gray-900 border-r border-transparent overflow-hidden"
          >
            {fieldKey === 'mobileNumber' ? (
              editable ? (
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
                    placeholder="Mobile"
                    fieldName="mobileNumber"
                    lead={lead}
                    schema={LeadSchema}
                    entityType="lead"
                    className="text-xs truncate w-full"
                  />
                  <button type="button" onClick={(e) => { e.stopPropagation(); setMobileModalOpen(lead.id); }} className="px-1 py-0.5 text-xs bg-blue-100 text-blue-600 rounded hover:bg-blue-200" title="Edit numbers">...</button>
                </div>
              ) : (
                <div className="text-xs text-black truncate">{getMainMobileNumber(lead).replace(/-/g, '')}</div>
              )
            ) : fieldKey === 'status' ? (
              editable ? (
                <EditableCell value={mutableValue} type={column.type === 'email' || column.type === 'phone' ? 'text' : column.type} options={column.options || ['New', 'CNR', 'Busy', 'Follow-up', 'Deal Close', 'Work Alloted', 'Hotlead', 'Mandate Sent', 'Documentation', 'Others']} onSave={(val) => handleCellUpdate(lead.id, fieldKey, val)} placeholder="Select Status" fieldName={fieldKey} lead={lead} schema={LeadSchema} entityType="lead" className="text-xs w-full" />
              ) : (
                <span className={`px-1.5 py-0.5 inline-flex text-[10px] leading-3 font-semibold rounded-full whitespace-nowrap ${getStatusColor(displayValue)}`}>{displayValue === 'Work Alloted' ? 'WAO' : displayValue}</span>
              )
            ) : column.type === 'date' ? (
              editable ? (
                <EditableCell value={formatDate(mutableValue)} type="date" onSave={(val) => handleCellUpdate(lead.id, fieldKey, val)} placeholder="DD-MM-YYYY" fieldName={fieldKey} lead={lead} schema={LeadSchema} entityType="lead" className="text-xs w-full" />
              ) : (
                <div className="text-xs text-black whitespace-nowrap">{formatDate(displayValue)}</div>
              )
            ) : (
              editable ? (
                <EditableCell value={displayValue} type={column.type === 'email' || column.type === 'phone' ? 'text' : column.type} {...(column.options && { options: column.options })} onSave={(val) => handleCellUpdate(lead.id, fieldKey, val)} placeholder={`Enter ${column.label.toLowerCase()}`} fieldName={fieldKey} lead={lead} schema={LeadSchema} entityType="lead" className="text-xs w-full" />
              ) : (
                <div className="flex items-center gap-1 overflow-hidden">
                  <div className="text-xs text-black truncate" title={displayValue}>{displayValue || defaultValue || 'N/A'}</div>
                  {fieldKey === 'clientName' && badgeStatus === 'JUST_ADDED' && (<span className="bg-green-100 text-green-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-green-200 shadow-sm animate-pulse whitespace-nowrap">JUST ADDED</span>)}
                  {fieldKey === 'clientName' && badgeStatus === 'NEW' && (<span className="bg-purple-100 text-purple-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-purple-200 shadow-sm animate-pulse">NEW</span>)}
                </div>
              )
            )}
          </div>
        );
      })}
      {showActions && (
        <div style={{ width: columnWidths.actions, minWidth: columnWidths.actions }} className="flex-shrink-0 px-2 py-1 flex items-center justify-center border-l border-gray-100" onClick={(e) => e.stopPropagation()}>
          {actionButtons && actionButtons(lead)}
        </div>
      )}
    </div>
  );
});

const LeadTable = function LeadTable({
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
  roleFilter,
  stickyHeader = true // Always sticky in this layout
}: LeadTableProps) {
  const { leads: contextLeads, getFilteredLeads } = useLeads();
  const { getDisplayName, updateHeader, headerConfig } = useHeaders();
  const { getVisibleColumns, getColumnByKey } = useColumns();
  const [sortField, setSortField] = useState<SortField>('');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [editingHeader, setEditingHeader] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);
  const [mobileModalOpen, setMobileModalOpen] = useState<string | null>(null);
  const [columnManagementOpen, setColumnManagementOpen] = useState(false);
  const [columnOperation, setColumnOperation] = useState<{ type: 'settings' | 'addBefore' | 'addAfter' | 'delete', fieldKey?: string } | null>(null);

  const headerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<List>(null);
  const { ref: containerRef, width: containerWidth, height: containerHeight } = useResizeObserver<HTMLDivElement>();

  const leads = customLeads || contextLeads;

  // Sorting Logic
  const filteredLeads = useMemo(() => {
    let result: Lead[];
    if (customLeads) {
      result = customLeads;
    } else {
      result = getFilteredLeads(filters);
    }
    if (roleFilter) {
      result = roleFilter(result);
    }
    return result;
  }, [getFilteredLeads, filters, customLeads, roleFilter]);

  const stringCollator = useMemo(() => new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }), []);
  const dateParseCache = useMemo(() => new Map<string, number>(), []);
  const numberParseCache = useMemo(() => new Map<string, number>(), []);

  const parseDateForSorting = useCallback((dateString: string): number => {
    // ... same logic as before ...
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

  const parseNumericForSorting = useCallback((value: string): number => {
    // ... same logic as before ...
    if (!value) return 0;
    const cached = numberParseCache.get(value);
    if (cached !== undefined) return cached;
    const numericMatch = value.toString().match(/\d+/);
    const parsed = numericMatch ? parseInt(numericMatch[0]) : 0;
    numberParseCache.set(value, parsed);
    return parsed;
  }, [numberParseCache]);

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
      } else if (columnType === 'number') {
        const aNum = parseNumericForSorting(String(aValue || ''));
        const bNum = parseNumericForSorting(String(bValue || ''));
        comparison = aNum - bNum;
      } else if (typeof aValue === 'string' && typeof bValue === 'string') {
        comparison = stringCollator.compare(aValue, bValue);
      } else {
        comparison = aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      }
      if (comparison === 0) return aIndex - bIndex;
      return sortDirection === 'asc' ? comparison : -comparison;
    };
  }, [sortField, sortDirection, getColumnByKey, parseDateForSorting, parseNumericForSorting, stringCollator]);

  const sortedLeads = useMemo(() => {
    if (!sortField) return filteredLeads;
    const indexed = filteredLeads.map((lead, index) => ({ lead, index }));
    indexed.sort((a, b) => createComparator(a.lead, b.lead, a.index, b.index));
    return indexed.map(item => item.lead);
  }, [filteredLeads, sortField, createComparator]);

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField, sortDirection]);

  // Helper functions
  const formatDate = useCallback((dateString: string) => {
    if (!dateString) return '';
    if (dateString.match(/^\d{2}-\d{2}-\d{4}$/)) return dateString;
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return dateString;
      return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;
    } catch { return dateString; }
  }, []);

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

  const getMobileNumbers = useCallback((lead: Lead) => {
    if (!lead.mobileNumbers) return [];
    if (Array.isArray(lead.mobileNumbers)) return lead.mobileNumbers;
    try { const parsed = JSON.parse(lead.mobileNumbers as string); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }, []);

  const getMainMobileNumber = useCallback((lead: Lead) => {
    const mobileNumbers = getMobileNumbers(lead);
    const mainNumber = mobileNumbers.find(m => m.isMain)?.number;
    return mainNumber || lead.mobileNumber || '';
  }, [getMobileNumbers]);

  const getDisplayValue = useCallback((lead: Lead, fieldKey: string): any => {
    return lead.submitted_payload?.[fieldKey] ?? (lead as any)[fieldKey];
  }, []);

  // Row Renderer for FixedSizeList
  const Row = useCallback(({ index, style }: ListChildComponentProps) => {
    const lead = sortedLeads[index];
    if (!lead) return null;
    return (
      <LeadRow
        lead={lead}
        style={style}
        onLeadClick={onLeadClick}
        selectedLeads={selectedLeads}
        onLeadSelection={onLeadSelection}
        visibleColumns={getVisibleColumns()}
        editable={editable}
        handleCellUpdate={onCellUpdate ? async (id, f, v) => await onCellUpdate(id, f, v) : async () => { }} // simplified prop
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
        columnWidths={COLUMN_WIDTHS}
      />
    );
  }, [sortedLeads, onLeadClick, selectedLeads, onLeadSelection, getVisibleColumns, editable, onCellUpdate, validationErrors, showActions, actionButtons, getStatusColor, formatDate, getColumnByKey, getMobileNumbers, getMainMobileNumber, getDisplayValue, highlightedLeadId]);

  const handleHeaderSave = useCallback((field: string, newLabel: string) => {
    try { updateHeader(field, newLabel); setEditingHeader(null); } catch (error) { console.error(error); }
  }, [updateHeader]);


  // Sync Scroll Handling
  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    if (headerRef.current) {
      headerRef.current.scrollLeft = event.currentTarget.scrollLeft;
    }
  };

  // Calculate Total Width
  const visibleCol = getVisibleColumns();
  const totalWidth =
    (onLeadSelection ? COLUMN_WIDTHS.checkbox : 0) +
    visibleCol.reduce((acc, col) => {
      const fieldKey = col.fieldKey;
      let width = COLUMN_WIDTHS[fieldKey] || COLUMN_WIDTHS.default;
      if (col.type === 'date' || fieldKey.toLowerCase().includes('date')) width = COLUMN_WIDTHS.date;
      if (fieldKey === 'status') width = COLUMN_WIDTHS.status;
      if (fieldKey === 'kva') width = COLUMN_WIDTHS.kva;
      if (fieldKey === 'discom') width = COLUMN_WIDTHS.discom;
      if (fieldKey === 'company' || fieldKey.includes('company')) width = COLUMN_WIDTHS.company;
      if (fieldKey === 'clientName' || fieldKey.includes('name')) width = COLUMN_WIDTHS.clientName;
      if (fieldKey === 'mobileNumber') width = COLUMN_WIDTHS.mobileNumber;
      return acc + width;
    }, 0) +
    (showActions ? COLUMN_WIDTHS.actions : 0);

  return (
    <div className={`relative flex flex-col h-full bg-white rounded-lg shadow-sm ${className}`}>

      {/* Sticky Header */}
      <div ref={headerRef} className="w-full overflow-hidden bg-white border-b border-gray-200 z-10 flex-shrink-0">
        <div className="flex items-center" style={{ width: totalWidth, minWidth: '100%' }}>
          {onLeadSelection && (
            <div style={{ width: COLUMN_WIDTHS.checkbox, minWidth: COLUMN_WIDTHS.checkbox }} className="flex-shrink-0 px-1 py-1 text-center bg-gray-50 border-r border-gray-200">
              <input type="checkbox" checked={selectAll} onChange={(e) => onSelectAll?.(e.target.checked)} className="cursor-pointer" />
            </div>
          )}
          {visibleCol.map((column) => {
            const field = column.fieldKey;
            let width = COLUMN_WIDTHS[field] || COLUMN_WIDTHS.default;
            if (column.type === 'date' || field.toLowerCase().includes('date')) width = COLUMN_WIDTHS.date;
            if (field === 'status') width = COLUMN_WIDTHS.status;
            if (field === 'kva') width = COLUMN_WIDTHS.kva;
            if (field === 'discom') width = COLUMN_WIDTHS.discom;
            if (field === 'company' || field.includes('company')) width = COLUMN_WIDTHS.company;
            if (field === 'clientName' || field.includes('name')) width = COLUMN_WIDTHS.clientName;
            if (field === 'mobileNumber') width = COLUMN_WIDTHS.mobileNumber;

            const isEditing = editingHeader === field;
            const displayName = getDisplayName(field);

            return (
              <div
                key={field}
                style={{ width, minWidth: width }}
                className="flex-shrink-0 px-2 py-1.5 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider bg-gray-50 border-r border-gray-200 overflow-hidden cursor-pointer hover:bg-gray-100 flex items-center"
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
                      onAddColumnBefore={() => { }}
                      onAddColumnAfter={() => { }}
                      onDeleteColumn={() => { }}
                      onColumnSettings={() => { }}
                    />
                    {!isEditing && (
                      <span className="flex-shrink-0 text-gray-500">
                        {sortField === field ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    {displayName}
                    {sortField === field ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
                  </div>
                )}
              </div>
            );
          })}
          {showActions && (
            <div style={{ width: COLUMN_WIDTHS.actions, minWidth: COLUMN_WIDTHS.actions }} className="flex-shrink-0 px-2 py-1.5 text-center bg-gray-50 text-[11px] font-bold text-gray-700 uppercase tracking-wider">
              Actions
            </div>
          )}
        </div>
      </div>

      {/* Virtualized Body */}
      <div className="flex-1 w-full bg-white relative" ref={containerRef}>
        {sortedLeads.length > 0 ? (
          <List
            ref={listRef}
            height={containerHeight || 400}
            itemCount={sortedLeads.length}
            itemSize={38} // balanced compact row height
            width={containerWidth || '100%'}
            outerElementType={React.forwardRef((props, ref) => (
              <div ref={ref} {...props} onScroll={(e) => { handleScroll(e); props.onScroll?.(e); }} />
            ))}
            innerElementType={React.forwardRef(({ style, ...rest }: any, ref) => (
              <div
                ref={ref}
                style={{
                  ...style,
                  width: Math.max(totalWidth, containerWidth), // Force width to enable horizontal scroll
                  position: 'relative'
                }}
                {...rest}
              />
            ))}
          >
            {Row}
          </List>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            {emptyMessage}
          </div>
        )}
      </div>

      {/* Modals... */}
      {mobileModalOpen && (
        <Suspense fallback={<LoadingSpinner text="Loading..." />}>
          <MobileNumbersModal
            isOpen={true}
            onClose={() => setMobileModalOpen(null)}
            lead={sortedLeads.find(lead => lead.id === mobileModalOpen)!}
            onSave={async (updatedLead) => {
              if (onCellUpdate) {
                await onCellUpdate(updatedLead.id, 'mobileNumbers', JSON.stringify(updatedLead.mobileNumbers));
                const mainMobileNumber = updatedLead.mobileNumbers.find(m => m.isMain)?.number || updatedLead.mobileNumbers[0]?.number || '';
                await onCellUpdate(updatedLead.id, 'mobileNumber', mainMobileNumber);
              }
              setMobileModalOpen(null);
            }}
          />
        </Suspense>
      )}

      {columnManagementOpen && (
        <Suspense fallback={<LoadingSpinner text="Loading..." />}>
          <ColumnManagementModal
            isOpen={columnManagementOpen}
            onClose={() => {
              setColumnManagementOpen(false);
              setColumnOperation(null);
            }}
            onColumnAdded={(column) => {
              onColumnAdded?.(column);
              setColumnManagementOpen(false);
              setColumnOperation(null);
              // Scroll to start to show new column (optional)
              if (headerRef.current) headerRef.current.scrollLeft = 0;
            }}
            onColumnDeleted={(fieldKey) => {
              onColumnDeleted?.(fieldKey);
              setColumnManagementOpen(false);
              setColumnOperation(null);
            }}
            {...(columnOperation && { operation: columnOperation })}
          />
        </Suspense>
      )}

    </div>
  );
};

export default LeadTable;