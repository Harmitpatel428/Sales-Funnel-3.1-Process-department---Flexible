'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { parseDateFromDDMMYYYY } from '../utils/dateUtils';
import { Lead, LeadFilters, SavedView, LeadContextType, ColumnConfig, Activity, LeadDeletionAuditLog } from '../types/shared';
import { getEmployeeName } from '../utils/employeeStorage';
import { sanitizeLead } from '../utils/sanitizer'; // SV-004: XSS prevention
import { useUsers } from './UserContext';

// React Query hooks
import { useLeadsQuery, leadKeys } from '../hooks/queries/useLeadsQuery';
import {
  useCreateLeadMutation,
  useUpdateLeadMutation,
  useDeleteLeadMutation,
  useAssignLeadMutation,
  useUnassignLeadMutation,
  useForwardLeadMutation,
  useAddLeadActivityMutation,
  useMarkLeadDoneMutation,
} from '../hooks/mutations/useLeadsMutations';

const todayDDMMYYYY = () => {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

const LeadContext = createContext<LeadContextType | undefined>(undefined);

// Non-searchable fields to avoid performance issues and irrelevant data (Set for O(1) lookup)
const NON_SEARCHABLE_KEYS = new Set(['id', 'isDeleted', 'isDone', 'isUpdated', 'activities', 'mobileNumbers']);

export function LeadProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useUsers();
  const queryClient = useQueryClient();

  // React Query for leads data - API as source of truth
  const {
    data: leads = [],
    isLoading,
    isFetching,
    error
  } = useLeadsQuery(undefined, {
    enabled: isAuthenticated,
  });

  // UI state that can remain in localStorage
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  // Mutations
  const createLeadMutation = useCreateLeadMutation();
  const updateLeadMutation = useUpdateLeadMutation();
  const deleteLeadMutation = useDeleteLeadMutation();
  const assignLeadMutation = useAssignLeadMutation();
  const unassignLeadMutation = useUnassignLeadMutation();
  const forwardLeadMutation = useForwardLeadMutation();
  const addActivityMutation = useAddLeadActivityMutation();
  const markDoneMutation = useMarkLeadDoneMutation();

  // Helper function to extract digits from a string
  const extractDigits = (str: string | undefined | null): string => {
    return str ? str.replace(/[^0-9]/g, '') : '';
  };

  // Helper function to parse dates from various formats
  const toDate = (v?: string) => {
    if (!v) return null;
    // Try DD-MM-YYYY first
    const ddmmyyyy = parseDateFromDDMMYYYY(v);
    if (ddmmyyyy && !isNaN(ddmmyyyy.getTime())) return ddmmyyyy;
    // Fallback to native Date (ISO etc.)
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };

  // Load saved views from localStorage (UI preference only)
  useEffect(() => {
    const storedViews = localStorage.getItem('savedViews');
    if (storedViews) {
      setSavedViews(JSON.parse(storedViews));
    }
    setIsHydrated(true);
  }, []);

  // Save views to localStorage
  useEffect(() => {
    if (!isHydrated) return;
    localStorage.setItem('savedViews', JSON.stringify(savedViews));
  }, [savedViews, isHydrated]);

  const addLead = useCallback(async (lead: Lead, columnConfigs?: ColumnConfig[]) => {
    // SV-004: Sanitize lead data
    const sanitizedLead = sanitizeLead(lead) as Lead;

    // Apply defaults
    const leadWithDefaults = columnConfigs ? getLeadWithDefaults(sanitizedLead, columnConfigs) : sanitizedLead;

    const finalLead = {
      ...leadWithDefaults,
      isUpdated: false,
      isDeleted: lead.isDeleted || false,
      isDone: lead.isDone || false,
      createdAt: new Date().toISOString(),
      submitted_payload: lead.submitted_payload
    };

    // Use React Query mutation
    createLeadMutation.mutate(finalLead);
  }, [createLeadMutation]);

  const updateLead = useCallback(async (updatedLead: Lead, opts?: { touchActivity?: boolean }) => {
    const sanitizedLead = sanitizeLead(updatedLead) as Lead;
    // Use React Query mutation
    updateLeadMutation.mutate(sanitizedLead);
  }, [updateLeadMutation]);

  const deleteLead = useCallback(async (id: string) => {
    // Use React Query mutation
    deleteLeadMutation.mutate(id);
  }, [deleteLeadMutation]);

  const permanentlyDeleteLead = useCallback(async (id: string) => {
    // For permanent delete, use the same delete endpoint
    // Backend handles soft vs hard delete based on implementation
    deleteLeadMutation.mutate(id);
  }, [deleteLeadMutation]);

  const markAsDone = useCallback(async (id: string) => {
    const lead = leads.find(l => l.id === id);
    if (lead) {
      markDoneMutation.mutate(lead);
    }
  }, [leads, markDoneMutation]);

  const addActivity = useCallback(async (
    leadId: string,
    description: string,
    options?: {
      activityType?: Activity['activityType'],
      duration?: number,
      metadata?: Record<string, any>
    }
  ) => {
    addActivityMutation.mutate({
      leadId,
      description,
      activityType: options?.activityType || 'note',
      duration: options?.duration,
      metadata: options?.metadata,
    });
  }, [addActivityMutation]);

  const assignLead = useCallback(async (leadId: string, userId: string, assignedBy: string) => {
    assignLeadMutation.mutate({ leadId, userId, assignedBy });
  }, [assignLeadMutation]);

  const unassignLead = useCallback(async (leadId: string) => {
    unassignLeadMutation.mutate(leadId);
  }, [unassignLeadMutation]);

  const forwardToProcess = useCallback(async (
    leadId: string,
    benefitTypes?: string[],
    reason?: string,
    deletedFrom: 'sales_dashboard' | 'all_leads' = 'sales_dashboard'
  ): Promise<{ success: boolean; message: string; caseIds?: string[] }> => {
    if (!benefitTypes || benefitTypes.length === 0) {
      return { success: false, message: 'At least one benefit type must be selected' };
    }

    try {
      const result = await forwardLeadMutation.mutateAsync({
        leadId,
        benefitTypes,
        reason,
      });
      return {
        success: result.success,
        message: result.message,
        caseIds: result.data?.caseIds
      };
    } catch (error: any) {
      return { success: false, message: error.message || 'Network error' };
    }
  }, [forwardLeadMutation]);

  // Client-side filtering of leads from React Query cache
  const getFilteredLeads = useCallback((filters: LeadFilters): Lead[] => {
    // Pre-compute values outside the filter loop for better performance
    const searchTermLower = filters.searchTerm?.toLowerCase() || '';
    const isPhoneSearch = filters.searchTerm ? /^\d+$/.test(filters.searchTerm) : false;

    // Use Set for O(1) status lookup instead of array.includes (O(n))
    const statusSet = filters.status && filters.status.length > 0
      ? new Set(filters.status)
      : null;

    // Pre-parse date filters once
    const startDate = toDate(filters.followUpDateStart);
    const endDate = toDate(filters.followUpDateEnd);

    const filtered = leads.filter(lead => {
      // Filter out deleted leads (isDeleted: true) - they should not appear in dashboard
      if (lead.isDeleted) {
        return false;
      }

      // Filter out completed leads (isDone: true)
      if (lead.isDone) {
        return false;
      }

      // Status filter with O(1) Set lookup
      if (statusSet && !statusSet.has(lead.status)) {
        return false;
      }

      // Filter by follow-up date range
      const leadDate = toDate(lead.followUpDate);

      if (startDate && leadDate && leadDate < startDate) {
        return false;
      }
      if (endDate && leadDate && leadDate > endDate) {
        return false;
      }

      // Search term filter - optimized with early returns
      if (searchTermLower) {
        // Phone number search (only digits)
        if (isPhoneSearch) {
          // Search in all mobile numbers
          const allMobileNumbers = [
            lead.mobileNumber,
            ...(lead.mobileNumbers || []).map(m => m.number)
          ];

          for (const mobileNumber of allMobileNumbers) {
            if (mobileNumber) {
              const phoneDigits = mobileNumber.replace(/[^0-9]/g, '');
              if (phoneDigits.includes(filters.searchTerm!)) {
                return true; // Early return on match
              }
            }
          }

          // Also search in consumer number digits
          if (extractDigits(lead.consumerNumber).includes(filters.searchTerm!)) {
            return true; // Early return on match
          }
        }

        // Text search - using for...in for better performance
        let matched = false;

        // Include mobile numbers and names explicitly
        const mobileNumbers = lead.mobileNumbers || [];
        for (const m of mobileNumbers) {
          if (m.number && m.number.toLowerCase().includes(searchTermLower)) {
            matched = true;
            break;
          }
          if (m.name && m.name.toLowerCase().includes(searchTermLower)) {
            matched = true;
            break;
          }
        }

        if (!matched && lead.mobileNumber?.toLowerCase().includes(searchTermLower)) {
          matched = true;
        }

        // Search other properties if not yet matched
        if (!matched) {
          for (const key in lead) {
            // Skip non-searchable keys using O(1) Set lookup
            if (NON_SEARCHABLE_KEYS.has(key)) {
              continue;
            }

            const value = (lead as any)[key];
            if (value !== null && value !== undefined && typeof value !== 'object' && !Array.isArray(value)) {
              if (String(value).toLowerCase().includes(searchTermLower)) {
                matched = true;
                break; // Early exit on first match
              }
            }
          }
        }

        return matched;
      }

      return true;
    });

    return filtered;
  }, [leads]);

  const resetUpdatedLeads = useCallback(() => {
    // This is a local UI state update - not needed with React Query
    // as we don't track isUpdated in the same way
  }, []);

  const addSavedView = useCallback((view: SavedView) => {
    setSavedViews(prev => [...prev, view]);
  }, []);

  const deleteSavedView = useCallback((id: string) => {
    setSavedViews(prev => prev.filter(view => view.id !== id));
  }, []);

  // Column integration methods - enhanced to handle different column types
  const migrateLeadsForNewColumn = useCallback((columnConfig: ColumnConfig) => {
    // Migration is now handled by backend
    // This function can trigger a refetch if needed
    queryClient.invalidateQueries({ queryKey: leadKeys.lists() });
  }, [queryClient]);

  const removeColumnFromLeads = useCallback((fieldKey: string) => {
    // No-op for backend - columns are managed separately
  }, []);

  const getLeadFieldValue = useCallback((lead: Lead, fieldKey: string, defaultValue?: any, columnConfig?: ColumnConfig): any => {
    const value = (lead as any)[fieldKey];
    if (value !== undefined && value !== null) {
      if (columnConfig) {
        switch (columnConfig.type) {
          case 'date':
            // Ensure date is in DD-MM-YYYY format
            if (typeof value === 'string' && value.match(/^\d{2}-\d{2}-\d{4}$/)) {
              return value;
            }
            // Convert other date formats to DD-MM-YYYY
            try {
              const date = new Date(value);
              if (!isNaN(date.getTime())) {
                const day = String(date.getDate()).padStart(2, '0');
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const year = date.getFullYear();
                return `${day}-${month}-${year}`;
              }
            } catch {
              return value;
            }
            break;
          case 'number':
            return Number(value) || 0;
          case 'phone':
            // Clean phone number
            return String(value).replace(/[^0-9]/g, '');
          case 'email':
            return String(value).toLowerCase().trim();
          case 'select':
            return String(value);
          case 'text':
          default:
            return String(value);
        }
      }
      return value;
    }
    // Return appropriate default value based on column type
    if (columnConfig) {
      switch (columnConfig.type) {
        case 'date':
          return defaultValue || todayDDMMYYYY();
        case 'number':
          return defaultValue || 0;
        case 'phone':
        case 'email':
        case 'text':
        case 'select':
          return defaultValue || '';
        default:
          return defaultValue || '';
      }
    }
    return defaultValue || '';
  }, []);

  // Additional helper functions for dynamic columns
  const getLeadWithDefaults = useCallback((lead: Lead, columnConfigs: ColumnConfig[]): Lead => {
    const leadWithDefaults = { ...lead };

    columnConfigs.forEach(column => {
      if (leadWithDefaults[column.fieldKey as keyof Lead] === undefined) {
        let defaultValue = column.defaultValue;

        if (defaultValue === undefined) {
          switch (column.type) {
            case 'date':
              defaultValue = todayDDMMYYYY();
              break;
            case 'number':
              defaultValue = 0;
              break;
            case 'phone':
            case 'email':
            case 'text':
              defaultValue = '';
              break;
            case 'select':
              defaultValue = column.options?.[0] || '';
              break;
            default:
              defaultValue = '';
          }
        }

        (leadWithDefaults as any)[column.fieldKey] = defaultValue;
      }
    });

    return leadWithDefaults;
  }, []);

  const validateLeadAgainstColumns = useCallback((lead: Lead, columnConfigs: ColumnConfig[]): string[] => {
    const errors: string[] = [];

    columnConfigs.forEach(column => {
      if (column.required) {
        const value = (lead as any)[column.fieldKey];
        if (!value || (typeof value === 'string' && !value.trim())) {
          errors.push(`${column.label} is required`);
        }
      }
    });

    return errors;
  }, []);

  const batchUpdate = useCallback((updates: () => void) => {
    updates(); // Just execute, React Query handles batching internally
  }, []);

  // Setter for leads - now triggers a refetch instead of local state update
  const setLeads = useCallback((updater: React.SetStateAction<Lead[]>) => {
    // For compatibility, we can invalidate queries to trigger refetch
    // This is a migration helper - ideally components should use mutations directly
    queryClient.invalidateQueries({ queryKey: leadKeys.lists() });
  }, [queryClient]);

  // Memoize context value
  const contextValue: LeadContextType = useMemo(() => ({
    leads,
    setLeads,
    savedViews,
    isHydrated,
    addLead,
    updateLead,
    deleteLead,
    permanentlyDeleteLead,
    markAsDone,
    addActivity,
    assignLead,
    unassignLead,
    forwardToProcess,
    getFilteredLeads,
    resetUpdatedLeads,
    addSavedView,
    deleteSavedView,
    migrateLeadsForNewColumn,
    removeColumnFromLeads,
    getLeadFieldValue,
    getLeadWithDefaults,
    validateLeadAgainstColumns,
    batchUpdate,
    isLoading
  }), [
    leads,
    setLeads,
    savedViews,
    isHydrated,
    addLead,
    updateLead,
    deleteLead,
    permanentlyDeleteLead,
    markAsDone,
    addActivity,
    assignLead,
    unassignLead,
    forwardToProcess,
    getFilteredLeads,
    resetUpdatedLeads,
    addSavedView,
    deleteSavedView,
    migrateLeadsForNewColumn,
    removeColumnFromLeads,
    getLeadFieldValue,
    getLeadWithDefaults,
    validateLeadAgainstColumns,
    batchUpdate,
    isLoading
  ]);

  return (
    <LeadContext.Provider value={contextValue}>
      {children}
    </LeadContext.Provider>
  );
}

export function useLeads() {
  const ctx = useContext(LeadContext);
  if (!ctx) throw new Error('useLeads must be used inside LeadProvider');
  return ctx;
}
