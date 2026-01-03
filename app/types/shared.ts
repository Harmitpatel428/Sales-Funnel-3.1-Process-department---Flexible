/**
 * Shared type definitions for the Lead Management System
 * 
 * This file contains all shared interfaces to prevent circular dependencies.
 * Import types from here instead of from context files.
 */

// ============================================================================
// MOBILE NUMBER TYPES
// ============================================================================

/**
 * Mobile number interface for lead contacts
 */
export interface MobileNumber {
  id: string;
  number: string;
  name: string;
  isMain: boolean;
}

// ============================================================================
// ACTIVITY TYPES
// ============================================================================

/**
 * Activity interface for lead activity tracking
 */
export interface Activity {
  id: string;
  leadId: string;
  description: string;
  timestamp: string;
  employeeName?: string;
  activityType?: 'call' | 'email' | 'meeting' | 'follow_up' | 'note' | 'status_change' | 'edit' | 'created' | 'other';
  duration?: number;
  metadata?: Record<string, any>;
}

/**
 * Work session interface for tracking time spent on leads
 */
export interface WorkSession {
  id: string; // Unique session identifier
  leadId: string; // Lead being worked on
  leadName: string; // Lead name for display
  startTime: string; // ISO timestamp when session started
  endTime?: string; // ISO timestamp when session ended (undefined if ongoing)
  duration?: number; // Calculated duration in minutes
  employeeName: string; // Employee who worked on this session
}

/**
 * Work stats interface for personal analytics
 */
export interface WorkStats {
  totalActivities: number; // Total activities logged by this employee
  totalLeadsTouched: number; // Unique leads worked on
  totalTimeSpent: number; // Total minutes spent in work sessions
  activitiesByType: Record<string, number>; // Count per activity type (call: 5, email: 3, etc.)
  lastActivityDate: string; // ISO timestamp of last activity
  periodStart: string; // Start of reporting period
  periodEnd: string; // End of reporting period
}

// ============================================================================
// LEAD TYPES
// ============================================================================

/**
 * Main Lead interface containing all lead properties
 */
export interface Lead {
  id: string;
  kva: string;
  connectionDate: string;
  consumerNumber: string;
  company: string;
  clientName: string;
  discom?: string;
  gidc?: string; // New field for GIDC
  gstNumber?: string; // New field for GST Number
  mobileNumbers: MobileNumber[]; // Updated to support multiple mobile numbers
  mobileNumber: string; // Keep for backward compatibility
  companyLocation?: string; // New field for company location
  unitType: 'New' | 'Existing' | 'Other' | string; // Allow custom unit types
  marketingObjective?: string;
  budget?: string;
  termLoan?: string;
  timeline?: string;
  status: 'New' | 'CNR' | 'Busy' | 'Follow-up' | 'Deal Close' | 'Work Alloted' | 'Hotlead' | 'Mandate Sent' | 'Documentation' | 'Others' | 'Fresh Lead';
  contactOwner?: string;
  lastActivityDate: string;
  followUpDate: string;
  finalConclusion?: string;
  notes?: string;
  isDone: boolean;
  isDeleted: boolean; // New field to mark leads as deleted instead of removing them
  isUpdated: boolean; // New field to track if lead has been updated
  activities?: Activity[];
  mandateStatus?: 'Pending' | 'In Progress' | 'Completed';
  documentStatus?: 'Pending Documents' | 'Documents Submitted' | 'Documents Reviewed' | 'Signed Mandate';
}

/**
 * Lead filters interface for filtering leads
 */
export interface LeadFilters {
  status?: Lead['status'][];
  followUpDateStart?: string;
  followUpDateEnd?: string;
  searchTerm?: string;
}

/**
 * Saved view interface for storing filter configurations
 */
export interface SavedView {
  id: string;
  name: string;
  filters: LeadFilters;
}

// ============================================================================
// COLUMN TYPES
// ============================================================================

/**
 * Column configuration interface for dynamic columns
 */
export interface ColumnConfig {
  id: string;
  fieldKey: string;
  label: string;
  type: 'text' | 'date' | 'select' | 'number' | 'email' | 'phone';
  required: boolean;
  sortable: boolean;
  width: number;
  visible: boolean;
  options?: string[]; // For select type
  defaultValue?: any;
  description?: string;
  maxLength?: number; // Maximum length for text fields
  min?: number; // Minimum value for number fields or minimum date
  max?: number; // Maximum value for number fields or maximum date
  allowPast?: boolean; // Whether past dates are allowed for date fields
}

// ============================================================================
// CONTEXT TYPES
// ============================================================================

/**
 * Lead context type interface
 */
export interface LeadContextType {
  leads: Lead[];
  setLeads: React.Dispatch<React.SetStateAction<Lead[]>>;
  addLead: (lead: Lead, columnConfigs?: ColumnConfig[]) => void;
  updateLead: (updatedLead: Lead, opts?: { touchActivity?: boolean }) => void;
  deleteLead: (id: string) => void;
  permanentlyDeleteLead: (id: string) => void;
  markAsDone: (id: string) => void;
  addActivity: (leadId: string, description: string, options?: {
    activityType?: Activity['activityType'],
    duration?: number,
    metadata?: Record<string, any>
  }) => void;
  getFilteredLeads: (filters: LeadFilters) => Lead[];
  resetUpdatedLeads: () => void;
  savedViews: SavedView[];
  addSavedView: (view: SavedView) => void;
  deleteSavedView: (id: string) => void;
  migrateLeadsForNewColumn: (columnConfig: ColumnConfig) => void;
  removeColumnFromLeads: (fieldKey: string) => void;
  getLeadFieldValue: (lead: Lead, fieldKey: string, defaultValue?: any, columnConfig?: ColumnConfig) => any;
  getLeadWithDefaults: (lead: Lead, columnConfigs: ColumnConfig[]) => Lead;
  validateLeadAgainstColumns: (lead: Lead, columnConfigs: ColumnConfig[]) => string[];
  skipPersistence?: boolean;
  setSkipPersistence?: (skip: boolean) => void;
}

/**
 * Column context type interface
 */
export interface ColumnContextType {
  columns: ColumnConfig[];
  addColumn: (config: Omit<ColumnConfig, 'id'>) => { success: boolean; message: string };
  deleteColumn: (fieldKey: string) => { success: boolean; message: string };
  reorderColumns: (newOrder: string[]) => boolean;
  toggleColumnVisibility: (fieldKey: string) => boolean;
  updateColumn: (fieldKey: string, updates: Partial<ColumnConfig>) => boolean;
  getColumnByKey: (fieldKey: string) => ColumnConfig | undefined;
  getVisibleColumns: () => ColumnConfig[];
  validateColumnConfig: (config: Partial<ColumnConfig>, isUpdate?: boolean) => { valid: boolean; errors: string[] };
  getColumnMigrationStatus: (fieldKey: string) => { migrated: boolean; totalLeads: number; migratedLeads: number };
  resetColumnToDefault: (fieldKey: string) => { success: boolean; message: string };
  exportColumnConfig: () => string;
  importColumnConfig: (configJson: string) => { success: boolean; message: string };
}
