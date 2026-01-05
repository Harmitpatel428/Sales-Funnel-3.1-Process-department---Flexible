'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { useLeads } from './LeadContext';
import { ColumnConfig, ColumnContextType } from '../types/shared';

// Default column configuration
const DEFAULT_COLUMNS: ColumnConfig[] = [
  {
    id: 'kva',
    fieldKey: 'kva',
    label: 'KVA',
    type: 'text',
    required: true,
    sortable: true,
    width: 80,
    visible: true,
    description: 'KVA rating'
  },
  {
    id: 'connectionDate',
    fieldKey: 'connectionDate',
    label: 'Connection Date',
    type: 'date',
    required: true,
    sortable: true,
    width: 150,
    visible: true,
    description: 'Connection date'
  },
  {
    id: 'consumerNumber',
    fieldKey: 'consumerNumber',
    label: 'Consumer Number',
    type: 'text',
    required: true,
    sortable: true,
    width: 150,
    visible: true,
    description: 'Consumer number'
  },
  {
    id: 'company',
    fieldKey: 'company',
    label: 'Company',
    type: 'text',
    required: true,
    sortable: true,
    width: 200,
    visible: true,
    description: 'Company name'
  },
  {
    id: 'clientName',
    fieldKey: 'clientName',
    label: 'Client Name',
    type: 'text',
    required: true,
    sortable: true,
    width: 150,
    visible: true,
    description: 'Client name'
  },
  {
    id: 'discom',
    fieldKey: 'discom',
    label: 'Discom',
    type: 'select',
    required: false,
    sortable: true,
    width: 100,
    visible: true,
    options: ['UGVCL', 'MGVCL', 'DGVCL', 'PGVCL'],
    description: 'Distribution company'
  },
  {
    id: 'mobileNumber',
    fieldKey: 'mobileNumber',
    label: 'Mobile Number',
    type: 'phone',
    required: true,
    sortable: true,
    width: 150,
    visible: true,
    description: 'Mobile number'
  },
  {
    id: 'status',
    fieldKey: 'status',
    label: 'Status',
    type: 'select',
    required: true,
    sortable: true,
    width: 120,
    visible: true,
    options: ['New', 'CNR', 'Busy', 'Follow-up', 'Deal Close', 'Work Alloted', 'Hotlead', 'Mandate Sent', 'Documentation', 'Others'],
    defaultValue: 'New',
    description: 'Lead status'
  },
  {
    id: 'lastActivityDate',
    fieldKey: 'lastActivityDate',
    label: 'Last Activity Date',
    type: 'date',
    required: true,
    sortable: true,
    width: 150,
    visible: true,
    description: 'Last activity date'
  },
  {
    id: 'followUpDate',
    fieldKey: 'followUpDate',
    label: 'Follow Up Date',
    type: 'date',
    required: true,
    sortable: true,
    width: 150,
    visible: true,
    description: 'Follow up date'
  },
  {
    id: 'termLoan',
    fieldKey: 'termLoan',
    label: 'Term Loan',
    type: 'text',
    required: false,
    sortable: true,
    width: 120,
    visible: true,
    description: 'Term loan duration or amount'
  }
];

// Create context
const ColumnContext = createContext<ColumnContextType | undefined>(undefined);

// Column provider component
export const ColumnProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS);
  const leadsCtx = useLeads();

  // Load columns from localStorage on mount
  useEffect(() => {
    const savedColumns = localStorage.getItem('leadColumnConfig');
    if (savedColumns) {
      try {
        const parsed = JSON.parse(savedColumns);
        setColumns(parsed);

        // Check if termLoan column is missing and add it
        const hasTermLoan = parsed.some((col: ColumnConfig) => col.fieldKey === 'termLoan');
        if (!hasTermLoan) {
          const termLoanColumn = DEFAULT_COLUMNS.find(col => col.fieldKey === 'termLoan');
          if (termLoanColumn) {
            const mergedColumns = [...parsed, termLoanColumn];
            setColumns(mergedColumns);
            localStorage.setItem('leadColumnConfig', JSON.stringify(mergedColumns));

            // Migrate existing leads for the new column
            try {
              leadsCtx.migrateLeadsForNewColumn(termLoanColumn);
            } catch (error) {
              console.error('Error migrating leads for termLoan column:', error);
            }
          }
        }
      } catch (error) {
        console.error('Error loading column config:', error);
      }
    }
  }, []);

  // Save columns to localStorage
  const saveColumns = (newColumns: ColumnConfig[]) => {
    localStorage.setItem('leadColumnConfig', JSON.stringify(newColumns));
    setColumns(newColumns);
  };

  // Add column
  const addColumn = (config: Omit<ColumnConfig, 'id'>): { success: boolean; message: string } => {
    try {
      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 Starting column addition process:', config);
      }

      const id = config.fieldKey || `column_${Date.now()}`;
      const newColumn: ColumnConfig = {
        id,
        ...config,
        fieldKey: config.fieldKey || id
      };

      // Use enhanced validation
      const validation = validateColumnConfig(newColumn);
      if (!validation.valid) {
        if (process.env.NODE_ENV === 'development') {
          console.log('❌ Column validation failed:', validation.errors);
        }
        return { success: false, message: validation.errors.join('. ') };
      }

      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Column validation passed, starting data migration...');
      }

      // Migrate existing lead data to include the new column
      try {
        leadsCtx.migrateLeadsForNewColumn(newColumn);
        if (process.env.NODE_ENV === 'development') {
          console.log(`✅ Successfully migrated leads for new column: ${newColumn.fieldKey}`);
        }
      } catch (error) {
        console.error('❌ Error migrating leads for new column:', error);
        return { success: false, message: 'Failed to migrate existing data for the new column. Please try again.' };
      }

      const newColumns = [...columns, newColumn];
      saveColumns(newColumns);

      if (process.env.NODE_ENV === 'development') {
        console.log(`🎉 Column "${newColumn.label}" added successfully with ID: ${newColumn.id}`);
      }
      return { success: true, message: `Column "${newColumn.label}" added successfully and will appear in the table immediately.` };
    } catch (error) {
      console.error('❌ Error adding column:', error);
      return { success: false, message: 'An error occurred while adding the column. Please try again.' };
    }
  };

  // Delete column
  const deleteColumn = (fieldKey: string): { success: boolean; message: string } => {
    try {
      const column = columns.find(col => col.fieldKey === fieldKey);
      if (!column) {
        return { success: false, message: 'Column not found.' };
      }

      // Allow deletion of all columns, including required ones
      // The warning is handled in the UI component

      // Remove column data from all leads
      try {
        leadsCtx.removeColumnFromLeads(fieldKey);
        if (process.env.NODE_ENV === 'development') {
          console.log(`Removed column "${fieldKey}" from leads`);
        }
      } catch (error) {
        console.error('Error removing column from leads:', error);
      }

      const newColumns = columns.filter(col => col.fieldKey !== fieldKey);
      saveColumns(newColumns);

      if (process.env.NODE_ENV === 'development') {
        console.log(`Column "${column.label}" deleted successfully`);
      }
      return { success: true, message: `Column "${column.label}" deleted successfully.` };
    } catch (error) {
      console.error('Error deleting column:', error);
      return { success: false, message: 'An error occurred while deleting the column. Please try again.' };
    }
  };

  // Reorder columns
  const reorderColumns = (newOrder: string[]): boolean => {
    if (newOrder.length !== columns.length) {
      return false;
    }

    const reorderedColumns = newOrder.map(fieldKey =>
      columns.find(col => col.fieldKey === fieldKey)
    ).filter(Boolean) as ColumnConfig[];

    saveColumns(reorderedColumns);
    return true;
  };

  // Toggle column visibility
  const toggleColumnVisibility = (fieldKey: string): boolean => {
    const column = columns.find(col => col.fieldKey === fieldKey);
    if (!column) {
      return false;
    }

    const newColumns = columns.map(col =>
      col.fieldKey === fieldKey ? { ...col, visible: !col.visible } : col
    );
    saveColumns(newColumns);
    return true;
  };

  // Update column
  const updateColumn = (fieldKey: string, updates: Partial<ColumnConfig>): boolean => {
    const columnIndex = columns.findIndex(col => col.fieldKey === fieldKey);
    if (columnIndex === -1) {
      return false;
    }

    const updatedColumn = { ...columns[columnIndex], ...updates } as ColumnConfig;

    // Validate the updated column (but allow fieldKey changes for existing columns)
    const validation = validateColumnConfig(updatedColumn, true);
    if (!validation.valid) {
      console.error('Column update validation failed:', validation.errors);
      return false;
    }

    const newColumns = [...columns];
    newColumns[columnIndex] = updatedColumn;
    saveColumns(newColumns);

    if (process.env.NODE_ENV === 'development') {
      console.log(`Column "${fieldKey}" updated successfully`);
    }
    return true;
  };

  // Get column by key
  const getColumnByKey = useCallback((fieldKey: string): ColumnConfig | undefined => {
    return columns.find(col => col.fieldKey === fieldKey);
  }, [columns]);

  // Get visible columns
  const getVisibleColumns = useCallback((): ColumnConfig[] => {
    const visible = columns.filter(col => col.visible).sort((a, b) => {
      // Sort by the order they appear in the columns array
      return columns.indexOf(a) - columns.indexOf(b);
    });

    return visible;
  }, [columns]);

  // Validate column configuration
  const validateColumnConfig = (config: Partial<ColumnConfig>, isUpdate: boolean = false): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    // Check required fields
    if (!config.fieldKey) {
      errors.push('Field key is required');
    } else {
      // Check field key format
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(config.fieldKey)) {
        errors.push('Field key must start with a letter and contain only letters, numbers, and underscores');
      }

      // Check if field key already exists (only for new columns, not updates)
      if (!isUpdate && columns.some(col => col.fieldKey === config.fieldKey)) {
        errors.push('A column with this field key already exists');
      }
    }

    if (!config.label) {
      errors.push('Label is required');
    }

    if (!config.type) {
      errors.push('Type is required');
    } else if (!['text', 'date', 'select', 'number', 'email', 'phone'].includes(config.type)) {
      errors.push('Invalid type. Must be one of: text, date, select, number, email, phone');
    }

    // Validate select type requirements
    if (config.type === 'select' && (!config.options || config.options.length === 0)) {
      errors.push('Select type columns must have at least one option');
    }

    // Validate width
    if (config.width !== undefined && (config.width < 50 || config.width > 500)) {
      errors.push('Width must be between 50 and 500 pixels');
    }

    return { valid: errors.length === 0, errors };
  };

  // Get column migration status
  const getColumnMigrationStatus = (fieldKey: string): { migrated: boolean; totalLeads: number; migratedLeads: number } => {
    const leads = leadsCtx.leads;
    const totalLeads = leads.length;
    const migratedLeads = leads.filter(lead => (lead as any)[fieldKey] !== undefined).length;
    const migrated = migratedLeads === totalLeads;

    return { migrated, totalLeads, migratedLeads };
  };

  // Reset column to default configuration
  const resetColumnToDefault = (fieldKey: string): { success: boolean; message: string } => {
    try {
      const defaultColumn = DEFAULT_COLUMNS.find(col => col.fieldKey === fieldKey);
      if (!defaultColumn) {
        return { success: false, message: 'No default configuration found for this column' };
      }

      const columnIndex = columns.findIndex(col => col.fieldKey === fieldKey);
      if (columnIndex === -1) {
        return { success: false, message: 'Column not found' };
      }

      const newColumns = [...columns];
      const existingColumn = newColumns[columnIndex];
      if (existingColumn) {
        newColumns[columnIndex] = { ...defaultColumn, id: existingColumn.id };
      }
      saveColumns(newColumns);

      if (process.env.NODE_ENV === 'development') {
        console.log(`Column "${fieldKey}" reset to default configuration`);
      }
      return { success: true, message: `Column "${fieldKey}" has been reset to default configuration` };
    } catch (error) {
      console.error('Error resetting column:', error);
      return { success: false, message: 'An error occurred while resetting the column' };
    }
  };

  // Export column configuration
  const exportColumnConfig = (): string => {
    try {
      const configToExport = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        columns: columns.map(col => ({
          fieldKey: col.fieldKey,
          label: col.label,
          type: col.type,
          required: col.required,
          sortable: col.sortable,
          width: col.width,
          visible: col.visible,
          options: col.options,
          defaultValue: col.defaultValue,
          description: col.description
        }))
      };

      return JSON.stringify(configToExport, null, 2);
    } catch (error) {
      console.error('Error exporting column config:', error);
      return '';
    }
  };

  // Import column configuration
  const importColumnConfig = (configJson: string): { success: boolean; message: string } => {
    try {
      const parsed = JSON.parse(configJson);

      if (!parsed.columns || !Array.isArray(parsed.columns)) {
        return { success: false, message: 'Invalid configuration format' };
      }

      // Validate each column
      const validationErrors: string[] = [];
      parsed.columns.forEach((col: any, index: number) => {
        const validation = validateColumnConfig(col);
        if (!validation.valid) {
          validationErrors.push(`Column ${index + 1}: ${validation.errors.join(', ')}`);
        }
      });

      if (validationErrors.length > 0) {
        return { success: false, message: `Validation errors: ${validationErrors.join('; ')}` };
      }

      // Convert to ColumnConfig format
      const importedColumns: ColumnConfig[] = parsed.columns.map((col: any, index: number) => ({
        id: col.fieldKey || `imported_${index}`,
        fieldKey: col.fieldKey,
        label: col.label,
        type: col.type,
        required: col.required || false,
        sortable: col.sortable !== false,
        width: col.width || 150,
        visible: col.visible !== false,
        options: col.options,
        defaultValue: col.defaultValue,
        description: col.description
      }));

      // Check for conflicts with existing columns
      const conflicts = importedColumns.filter(imported =>
        columns.some(existing => existing.fieldKey === imported.fieldKey)
      );

      if (conflicts.length > 0) {
        return {
          success: false,
          message: `Column conflicts detected: ${conflicts.map(c => c.fieldKey).join(', ')}. Please resolve conflicts before importing.`
        };
      }

      // Merge with existing columns
      const mergedColumns = [...columns, ...importedColumns];
      saveColumns(mergedColumns);

      if (process.env.NODE_ENV === 'development') {
        console.log(`Successfully imported ${importedColumns.length} columns`);
      }
      return { success: true, message: `Successfully imported ${importedColumns.length} columns` };
    } catch (error) {
      console.error('Error importing column config:', error);
      return { success: false, message: 'Invalid JSON format or corrupted configuration' };
    }
  };

  // Memoize context value to prevent unnecessary re-renders
  const contextValue: ColumnContextType = useMemo(() => ({
    columns,
    addColumn,
    deleteColumn,
    reorderColumns,
    toggleColumnVisibility,
    updateColumn,
    getColumnByKey,
    getVisibleColumns,
    validateColumnConfig,
    getColumnMigrationStatus,
    resetColumnToDefault,
    exportColumnConfig,
    importColumnConfig
  }), [columns, getColumnByKey, getVisibleColumns]);

  return (
    <ColumnContext.Provider value={contextValue}>
      {children}
    </ColumnContext.Provider>
  );
};

// Hook to use column context
export const useColumns = (): ColumnContextType => {
  const context = useContext(ColumnContext);
  if (context === undefined) {
    throw new Error('useColumns must be used within a ColumnProvider');
  }
  return context;
};
