'use client';

import React, { useState, useCallback } from 'react';
import type { Lead, LeadFilters } from '../types/shared';
import LeadTable from './LeadTable';
import PasswordModal from './PasswordModal';
import PasswordSettingsModal from './PasswordSettingsModal';
import ColumnManagementModal from './ColumnManagementModal';
import RowManagementModal from './RowManagementModal';

interface EditableTableProps {
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
  onExportClick?: () => void;
  onImportClick?: () => void;
  headerEditable?: boolean;
  onHeaderUpdate?: (field: string, newLabel: string) => void;
  onColumnAdded?: (column: any) => void;
  onColumnDeleted?: (fieldKey: string) => void;
  onColumnReorder?: (newOrder: string[]) => void;
  onRowsAdded?: (count: number) => void;
  onRowsDeleted?: (count: number) => void;
}

const EditableTable: React.FC<EditableTableProps> = ({
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
  onExportClick,
  onImportClick,
  headerEditable = true,
  onColumnAdded,
  onColumnDeleted,
  onColumnReorder,
  onRowsAdded,
  onRowsDeleted
}) => {
  const [editMode, setEditMode] = useState(false);
  const [headerEditMode, setHeaderEditMode] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [undoStack, setUndoStack] = useState<Array<{ leadId: string; field: string; oldValue: string; newValue: string }>>([]);
  const [redoStack, setRedoStack] = useState<Array<{ leadId: string; field: string; oldValue: string; newValue: string }>>([]);
  const [verifiedOperations, setVerifiedOperations] = useState<Set<string>>(new Set());
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [passwordSettingsOpen, setPasswordSettingsOpen] = useState(false);
  const [columnManagementOpen, setColumnManagementOpen] = useState(false);
  const [rowManagementOpen, setRowManagementOpen] = useState(false);
  const [pendingOperation, setPendingOperation] = useState<string | null>(null);

  // Toggle header edit mode
  const toggleHeaderEditMode = useCallback(() => {
    setHeaderEditMode(prev => !prev);
  }, []);

  const handleExportClick = useCallback(() => {
    if (verifiedOperations.has('export') || sessionStorage.getItem('verified_export')) {
      onExportClick?.();
    } else {
      setPendingOperation('export');
      setPasswordModalOpen(true);
    }
  }, [onExportClick, verifiedOperations]);

  const handleColumnManagement = useCallback(() => {
    if (verifiedOperations.has('columnManagement') || sessionStorage.getItem('verified_columnManagement')) {
      setColumnManagementOpen(true);
    } else {
      setPendingOperation('columnManagement');
      setPasswordModalOpen(true);
    }
  }, [verifiedOperations]);

  const handleRowManagement = useCallback(() => {
    if (verifiedOperations.has('rowManagement') || sessionStorage.getItem('verified_rowManagement')) {
      setRowManagementOpen(true);
    } else {
      setPendingOperation('rowManagement');
      setPasswordModalOpen(true);
    }
  }, [verifiedOperations]);

  const handlePasswordSuccess = useCallback(() => {
    setPasswordModalOpen(false);
    
    if (pendingOperation) {
      setVerifiedOperations(prev => new Set([...prev, pendingOperation]));
      
      switch (pendingOperation) {
        case 'editMode':
          setEditMode(!editMode);
          break;
        case 'headerEdit':
          setHeaderEditMode(!headerEditMode);
          break;
        case 'export':
          onExportClick?.();
          break;
        case 'columnManagement':
          setColumnManagementOpen(true);
          break;
        case 'rowManagement':
          setRowManagementOpen(true);
          break;
      }
      
      setPendingOperation(null);
    }
  }, [pendingOperation, editMode, headerEditMode, onExportClick]);

  // Handle cell update with undo/redo support
  const handleCellUpdate = useCallback(async (leadId: string, field: string, value: string) => {
    if (!onCellUpdate) return;

    // Find the current value for undo support
    const currentLead = customLeads?.find(lead => lead.id === leadId);
    if (!currentLead) return;

    const oldValue = String((currentLead as any)[field] || '');
    
    // Add to undo stack
    setUndoStack(prev => [...prev, { leadId, field, oldValue, newValue: value }]);
    setRedoStack([]); // Clear redo stack when new action is performed

    setSaveStatus('saving');
    
    try {
      await onCellUpdate(leadId, field, value);
      setSaveStatus('saved');
      
      // Auto-hide saved status after 2 seconds
      setTimeout(() => {
        setSaveStatus('idle');
      }, 2000);
    } catch (error) {
      setSaveStatus('error');
      console.error('Error updating cell:', error);
      
      // Auto-hide error status after 3 seconds
      setTimeout(() => {
        setSaveStatus('idle');
      }, 3000);
    }
  }, [onCellUpdate, customLeads]);

  // Undo functionality
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0 || !onCellUpdate) return;

    const lastAction = undoStack[undoStack.length - 1];
    if (!lastAction) return;
    
    // Add to redo stack
    setRedoStack(prev => [...prev, lastAction]);
    
    // Remove from undo stack
    setUndoStack(prev => prev.slice(0, -1));
    
    // Perform undo
    onCellUpdate(lastAction.leadId, lastAction.field, lastAction.oldValue);
  }, [undoStack, onCellUpdate]);

  // Redo functionality
  const handleRedo = useCallback(() => {
    if (redoStack.length === 0 || !onCellUpdate) return;

    const lastAction = redoStack[redoStack.length - 1];
    if (!lastAction) return;
    
    // Add back to undo stack
    setUndoStack(prev => [...prev, lastAction]);
    
    // Remove from redo stack
    setRedoStack(prev => prev.slice(0, -1));
    
    // Perform redo
    onCellUpdate(lastAction.leadId, lastAction.field, lastAction.newValue);
  }, [redoStack, onCellUpdate]);

  // Keyboard shortcuts
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey) {
        switch (event.key) {
          case 'z':
            event.preventDefault();
            if (event.shiftKey) {
              handleRedo();
            } else {
              handleUndo();
            }
            break;
          case 's':
            event.preventDefault();
            // Save all changes (could be implemented)
            break;
          case 'h':
            if (headerEditable) {
              event.preventDefault();
              toggleHeaderEditMode();
            }
            break;
        }
      }
    };

    if (editMode) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [editMode, handleUndo, handleRedo]);

  const getSaveStatusIcon = () => {
    switch (saveStatus) {
      case 'saving':
        return (
          <div className="flex items-center space-x-1 text-blue-600">
            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
            <span className="text-xs">Saving...</span>
          </div>
        );
      case 'saved':
        return (
          <div className="flex items-center space-x-1 text-green-600">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            <span className="text-xs">Saved</span>
          </div>
        );
      case 'error':
        return (
          <div className="flex items-center space-x-1 text-red-600">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span className="text-xs">Error</span>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* Editable Table Toolbar */}
      {editable && (
        <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center space-x-4">

            {/* Undo/Redo Buttons */}
            {editMode && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleUndo}
                  disabled={undoStack.length === 0}
                  className="px-2 py-1 text-xs font-medium bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Undo (Ctrl+Z)"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                </button>
                <button
                  onClick={handleRedo}
                  disabled={redoStack.length === 0}
                  className="px-2 py-1 text-xs font-medium bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Redo (Ctrl+Shift+Z)"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
                  </svg>
                </button>
              </div>
            )}


            {/* Column Management */}
            <div className="flex items-center space-x-2">
              <button
                onClick={handleColumnManagement}
                className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                title="Manage columns (Ctrl+Shift+C)"
              >
                <svg className="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                Columns
              </button>
              
              <button
                onClick={handleRowManagement}
                className="px-3 py-1 text-xs font-medium bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors"
                title="Manage rows (Ctrl+Shift+R)"
              >
                <svg className="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Rows
              </button>
            </div>

            {/* Save Status */}
            {editMode && getSaveStatusIcon()}
          </div>

          <div className="flex items-center space-x-2">
            {/* Export/Import Buttons */}
            {onExportClick && (
              <button
                onClick={handleExportClick}
                className="px-3 py-1 text-xs font-medium bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
                title="Export to Excel"
              >
                <svg className="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export
              </button>
            )}
            
            {onImportClick && (
              <button
                onClick={onImportClick}
                className="px-3 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                title="Import from Excel"
              >
                <svg className="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Import
              </button>
            )}

            {/* Password Settings */}
            <button
              onClick={() => setPasswordSettingsOpen(true)}
              className="px-3 py-1 text-xs font-medium bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors"
              title="Password Settings"
            >
              <svg className="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Settings
            </button>

            {/* Edit Mode Indicator */}
            {editMode && (
              <div className="flex items-center space-x-1 text-purple-600">
                <div className="w-2 h-2 bg-purple-600 rounded-full animate-pulse"></div>
                <span className="text-xs font-medium">Edit Mode</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lead Table */}
      <LeadTable
        filters={filters}
        {...(onLeadClick && { onLeadClick })}
        selectedLeads={selectedLeads}
        {...(onLeadSelection && { onLeadSelection })}
        selectAll={selectAll}
        {...(onSelectAll && { onSelectAll })}
        {...(customLeads && { leads: customLeads })}
        showActions={showActions}
        {...(actionButtons && { actionButtons })}
        emptyMessage={emptyMessage}
        editable={editable && editMode}
        onCellUpdate={handleCellUpdate}
        validationErrors={validationErrors}
        headerEditable={headerEditable && headerEditMode}
        {...(onColumnAdded && { onColumnAdded })}
        {...(onColumnDeleted && { onColumnDeleted })}
        {...(onColumnReorder && { onColumnReorder })}
      />

      {/* Keyboard Shortcuts Help */}
      {editMode && (
        <div className="absolute bottom-4 right-4 bg-gray-800 text-white text-xs p-2 rounded shadow-lg">
          <div className="font-medium mb-1">Keyboard Shortcuts:</div>
          <div>Ctrl+Z: Undo</div>
          <div>Ctrl+Shift+Z: Redo</div>
          {headerEditable && <div>Ctrl+H: Toggle header edit</div>}
          <div>Ctrl+Shift+C: Column management</div>
          <div>Ctrl+Shift+R: Row management</div>
          <div>Enter: Save cell</div>
          <div>Escape: Cancel edit</div>
        </div>
      )}

      {/* Modals */}
      <PasswordModal
        isOpen={passwordModalOpen}
        onClose={() => {
          setPasswordModalOpen(false);
          setPendingOperation(null);
        }}
        operation={pendingOperation as any || 'editMode'}
        onSuccess={handlePasswordSuccess}
      />

      <PasswordSettingsModal
        isOpen={passwordSettingsOpen}
        onClose={() => setPasswordSettingsOpen(false)}
        onPasswordChanged={() => {
          // Refresh verification status
          setVerifiedOperations(new Set());
        }}
      />

      <ColumnManagementModal
        isOpen={columnManagementOpen}
        onClose={() => setColumnManagementOpen(false)}
        onColumnAdded={(column) => {
          onColumnAdded?.(column);
          setColumnManagementOpen(false);
        }}
        onColumnDeleted={(fieldKey) => {
          onColumnDeleted?.(fieldKey);
          setColumnManagementOpen(false);
        }}
      />

      <RowManagementModal
        isOpen={rowManagementOpen}
        onClose={() => setRowManagementOpen(false)}
        onRowsAdded={(count) => {
          onRowsAdded?.(count);
          setRowManagementOpen(false);
        }}
        onRowsDeleted={(count) => {
          onRowsDeleted?.(count);
          setRowManagementOpen(false);
        }}
      />
    </div>
  );
};

export default EditableTable;
