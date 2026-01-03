import { Lead } from '../types/shared';

// Column order for display - defines the sequence of columns in the table
// @deprecated Use getColumnOrder() from ColumnContext instead for dynamic column ordering
export const COLUMN_ORDER: (keyof Lead)[] = [
  'kva',
  'connectionDate',
  'consumerNumber',
  'company',
  'clientName',
  'discom',
  'mobileNumber',
  'status',
  'lastActivityDate',
  'followUpDate'
];

// Dynamic column ordering function
export const getColumnOrder = (): (keyof Lead)[] => {
  // This function should be called from ColumnContext to get current column order
  // For now, return the static COLUMN_ORDER as fallback
  console.warn('getColumnOrder() called from constants - consider using ColumnContext.getVisibleColumns() instead');
  return COLUMN_ORDER;
};

// Default header labels for each field
export const DEFAULT_HEADER_LABELS: Record<keyof Lead, string> = {
  id: 'ID',
  kva: 'KVA',
  connectionDate: 'Connection Date',
  consumerNumber: 'Consumer Number',
  company: 'Company',
  clientName: 'Client Name',
  discom: 'Discom',
  gidc: 'GIDC',
  gstNumber: 'GST Number',
  mobileNumbers: 'Mobile Numbers',
  mobileNumber: 'Mobile Number',
  companyLocation: 'Company Location',
  unitType: 'Unit Type',
  marketingObjective: 'Marketing Objective',
  budget: 'Budget',
  termLoan: 'Term Loan',
  timeline: 'Timeline',
  status: 'Status',
  contactOwner: 'Contact Owner',
  lastActivityDate: 'Last Activity Date',
  followUpDate: 'Follow Up Date',
  finalConclusion: 'Final Conclusion',
  notes: 'Notes',
  isDone: 'Is Done',
  isDeleted: 'Is Deleted',
  isUpdated: 'Is Updated',
  activities: 'Activities',
  mandateStatus: 'Mandate Status',
  documentStatus: 'Document Status',
  convertedToCaseId: 'Converted To Case ID',
  convertedAt: 'Converted At'
};

// Field types for validation and rendering
export const FIELD_TYPES: Record<keyof Lead, 'text' | 'date' | 'select' | 'number'> = {
  id: 'text',
  kva: 'text',
  connectionDate: 'date',
  consumerNumber: 'text',
  company: 'text',
  clientName: 'text',
  discom: 'text',
  gidc: 'text',
  gstNumber: 'text',
  mobileNumbers: 'text',
  mobileNumber: 'text',
  companyLocation: 'text',
  unitType: 'select',
  marketingObjective: 'text',
  budget: 'text',
  termLoan: 'text',
  timeline: 'text',
  status: 'select',
  contactOwner: 'text',
  lastActivityDate: 'date',
  followUpDate: 'date',
  finalConclusion: 'text',
  notes: 'text',
  isDone: 'select',
  isDeleted: 'select',
  isUpdated: 'select',
  activities: 'text',
  mandateStatus: 'select',
  documentStatus: 'select',
  convertedToCaseId: 'text',
  convertedAt: 'date'
};

// Fields that support sorting
export const SORTABLE_FIELDS: (keyof Lead)[] = [
  'kva',
  'connectionDate',
  'consumerNumber',
  'company',
  'clientName',
  'discom',
  'mobileNumber',
  'status',
  'lastActivityDate',
  'followUpDate'
];

// Required fields that cannot be empty
export const REQUIRED_FIELDS: (keyof Lead)[] = [
  'clientName',
  'mobileNumber',
  'status'
];

// Status options for the status field
export const STATUS_OPTIONS = [
  'New',
  'Contacted',
  'Qualified',
  'Proposal',
  'Negotiation',
  'Closed Won',
  'Closed Lost',
  'Follow Up'
];

// Column metadata for dynamic column management
export const COLUMN_METADATA: Record<keyof Lead, {
  type: 'text' | 'date' | 'select' | 'number' | 'email' | 'phone';
  required: boolean;
  sortable: boolean;
  width: number;
  description: string;
  options?: string[];
  defaultValue?: any;
}> = {
  kva: {
    type: 'text',
    required: false,
    sortable: true,
    width: 80,
    description: 'KVA rating'
  },
  connectionDate: {
    type: 'date',
    required: false,
    sortable: true,
    width: 120,
    description: 'Connection date'
  },
  consumerNumber: {
    type: 'text',
    required: false,
    sortable: true,
    width: 120,
    description: 'Consumer number'
  },
  company: {
    type: 'text',
    required: false,
    sortable: true,
    width: 150,
    description: 'Company name'
  },
  clientName: {
    type: 'text',
    required: true,
    sortable: true,
    width: 120,
    description: 'Client name'
  },
  discom: {
    type: 'select',
    required: false,
    sortable: true,
    width: 100,
    description: 'Distribution company',
    options: ['UGVCL', 'MGVCL', 'DGVCL', 'PGVCL']
  },
  mobileNumber: {
    type: 'phone',
    required: true,
    sortable: true,
    width: 120,
    description: 'Mobile number'
  },
  status: {
    type: 'select',
    required: true,
    sortable: true,
    width: 100,
    description: 'Lead status',
    options: STATUS_OPTIONS,
    defaultValue: 'New'
  },
  lastActivityDate: {
    type: 'date',
    required: false,
    sortable: true,
    width: 120,
    description: 'Last activity date'
  },
  followUpDate: {
    type: 'date',
    required: false,
    sortable: true,
    width: 120,
    description: 'Follow up date'
  },
  id: {
    type: 'text',
    required: true,
    sortable: true,
    width: 80,
    description: 'Unique identifier'
  },
  gidc: {
    type: 'text',
    required: false,
    sortable: true,
    width: 100,
    description: 'GIDC number'
  },
  gstNumber: {
    type: 'text',
    required: false,
    sortable: true,
    width: 120,
    description: 'GST number'
  },
  mobileNumbers: {
    type: 'phone',
    required: false,
    sortable: false,
    width: 150,
    description: 'Mobile numbers'
  },
  companyLocation: {
    type: 'text',
    required: false,
    sortable: true,
    width: 150,
    description: 'Company location'
  },
  unitType: {
    type: 'select',
    required: false,
    sortable: true,
    width: 100,
    description: 'Unit type',
    options: ['New', 'Existing', 'Other']
  },
  marketingObjective: {
    type: 'text',
    required: false,
    sortable: true,
    width: 150,
    description: 'Marketing objective'
  },
  budget: {
    type: 'text',
    required: false,
    sortable: true,
    width: 100,
    description: 'Budget'
  },
  termLoan: {
    type: 'text',
    required: false,
    sortable: true,
    width: 100,
    description: 'Term Loan'
  },
  timeline: {
    type: 'text',
    required: false,
    sortable: true,
    width: 100,
    description: 'Timeline'
  },
  contactOwner: {
    type: 'text',
    required: false,
    sortable: true,
    width: 120,
    description: 'Contact owner'
  },
  finalConclusion: {
    type: 'text',
    required: false,
    sortable: true,
    width: 150,
    description: 'Final conclusion'
  },
  notes: {
    type: 'text',
    required: false,
    sortable: true,
    width: 150,
    description: 'Notes'
  },
  isDone: {
    type: 'select',
    required: false,
    sortable: true,
    width: 80,
    description: 'Is done',
    options: ['true', 'false'],
    defaultValue: false
  },
  isDeleted: {
    type: 'select',
    required: false,
    sortable: true,
    width: 80,
    description: 'Is deleted',
    options: ['true', 'false'],
    defaultValue: false
  },
  isUpdated: {
    type: 'select',
    required: false,
    sortable: true,
    width: 80,
    description: 'Is updated',
    options: ['true', 'false'],
    defaultValue: false
  },
  activities: {
    type: 'text',
    required: false,
    sortable: false,
    width: 150,
    description: 'Activities'
  },
  mandateStatus: {
    type: 'select',
    required: false,
    sortable: true,
    width: 120,
    description: 'Mandate status',
    options: ['Pending', 'In Progress', 'Completed']
  },
  documentStatus: {
    type: 'select',
    required: false,
    sortable: true,
    width: 150,
    description: 'Document status',
    options: ['Pending Documents', 'Documents Submitted', 'Documents Reviewed', 'Signed Mandate']
  },
  convertedToCaseId: {
    type: 'text',
    required: false,
    sortable: true,
    width: 120,
    description: 'Converted Case ID'
  },
  convertedAt: {
    type: 'date',
    required: false,
    sortable: true,
    width: 120,
    description: 'Date converted to case'
  }
};

// Available field types with their configurations
export const AVAILABLE_FIELD_TYPES = [
  {
    type: 'text',
    label: 'Text',
    description: 'Single line text input',
    icon: '📝'
  },
  {
    type: 'email',
    label: 'Email',
    description: 'Email address input',
    icon: '📧'
  },
  {
    type: 'phone',
    label: 'Phone',
    description: 'Phone number input',
    icon: '📞'
  },
  {
    type: 'number',
    label: 'Number',
    description: 'Numeric input',
    icon: '🔢'
  },
  {
    type: 'date',
    label: 'Date',
    description: 'Date picker',
    icon: '📅'
  },
  {
    type: 'select',
    label: 'Select',
    description: 'Dropdown selection',
    icon: '📋'
  }
];

// Column templates for quick addition
export const COLUMN_TEMPLATES = {
  company: {
    label: 'Company',
    type: 'text' as const,
    required: false,
    sortable: true,
    width: 150,
    visible: true,
    description: 'Company name'
  },
  position: {
    label: 'Position',
    type: 'text' as const,
    required: false,
    sortable: true,
    width: 120,
    visible: true,
    description: 'Job position'
  },
  budget: {
    label: 'Budget',
    type: 'number' as const,
    required: false,
    sortable: true,
    width: 100,
    visible: true,
    description: 'Budget amount'
  },
  priority: {
    label: 'Priority',
    type: 'select' as const,
    required: false,
    sortable: true,
    width: 100,
    visible: true,
    options: ['Low', 'Medium', 'High', 'Critical'],
    defaultValue: 'Medium',
    description: 'Lead priority level'
  },
  assignedTo: {
    label: 'Assigned To',
    type: 'text' as const,
    required: false,
    sortable: true,
    width: 120,
    visible: true,
    description: 'Person assigned to this lead'
  }
};

// Validation functions for column operations
export const validateColumnName = (name: string, existingColumns: string[], fieldKey?: string): string | null => {
  if (!name || name.trim().length === 0) {
    return 'Column name is required';
  }

  if (name.length > 50) {
    return 'Column name must be 50 characters or less';
  }

  if (existingColumns.includes(name) && existingColumns.indexOf(name) !== existingColumns.indexOf(fieldKey || '')) {
    return 'Column name already exists';
  }

  return null;
};

export const validateColumnType = (type: string): string | null => {
  if (!type) {
    return 'Column type is required';
  }

  const validTypes = ['text', 'email', 'phone', 'number', 'date', 'select'];
  if (!validTypes.includes(type)) {
    return 'Invalid column type';
  }

  return null;
};

export const validateColumnDeletion = (fieldKey: string, requiredFields: string[]): string | null => {
  if (requiredFields.includes(fieldKey)) {
    return 'Cannot delete required columns';
  }

  if (!fieldKey) {
    return 'Field key is required';
  }

  return null;
};

// Column migration utilities
export const migrateDataForNewColumn = (leads: any[], columnConfig: any): any[] => {
  return leads.map(lead => ({
    ...lead,
    [columnConfig.fieldKey]: columnConfig.defaultValue || ''
  }));
};

export const backupDataForColumnDeletion = (leads: any[], fieldKey: string): any[] => {
  return leads.map(lead => {
    const { [fieldKey]: deletedField, ...rest } = lead;
    return rest;
  });
};

export const restoreDataFromBackup = (backup: any[]): any[] => {
  return backup;
};

// Column width and display utilities
export const getColumnWidth = (fieldKey: keyof Lead): string => {
  const metadata = COLUMN_METADATA[fieldKey];
  if (!metadata) return 'w-20';

  if (metadata.width <= 80) return 'w-8';
  if (metadata.width <= 100) return 'w-10';
  if (metadata.width <= 120) return 'w-12';
  if (metadata.width <= 150) return 'w-16';
  if (metadata.width <= 200) return 'w-20';
  return 'w-24';
};

export const getDefaultValue = (fieldKey: keyof Lead): any => {
  const metadata = COLUMN_METADATA[fieldKey];
  return metadata?.defaultValue || '';
};

// Utility functions for column management
export const validateColumnConfig = (config: any): string | null => {
  if (!config.fieldKey || !config.label) {
    return 'Field key and label are required';
  }

  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(config.fieldKey)) {
    return 'Field key must start with a letter and contain only letters, numbers, and underscores';
  }

  const validTypes = ['text', 'email', 'phone', 'number', 'date', 'select'];
  if (!validTypes.includes(config.type)) {
    return 'Invalid column type';
  }

  if (config.type === 'select' && (!config.options || config.options.length === 0)) {
    return 'Select columns must have at least one option';
  }

  return null;
};

export const getDefaultValueForType = (type: string): any => {
  switch (type) {
    case 'text':
    case 'email':
    case 'phone':
      return '';
    case 'number':
      return 0;
    case 'date':
      return '';
    case 'select':
      return '';
    default:
      return '';
  }
};

export const formatColumnValue = (value: any, type: string): string => {
  if (value === null || value === undefined) {
    return '';
  }

  switch (type) {
    case 'date':
      if (typeof value === 'string' && value.match(/^\d{2}-\d{2}-\d{4}$/)) {
        return value; // Already in DD-MM-YYYY format
      }
      try {
        const date = new Date(value);
        if (isNaN(date.getTime())) return String(value);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
      } catch {
        return String(value);
      }
    case 'number':
      return String(value);
    default:
      return String(value);
  }
};