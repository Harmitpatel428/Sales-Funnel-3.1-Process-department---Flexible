'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { parseDateFromDDMMYYYY } from '../utils/dateUtils';
import { Lead, LeadFilters, SavedView, LeadContextType, ColumnConfig, Activity, LeadDeletionAuditLog } from '../types/shared';
import { getEmployeeName } from '../utils/employeeStorage';
import { sanitizeLead } from '../utils/sanitizer'; // SV-004: XSS prevention
import { addAuditLog } from '../utils/storage';
import { SystemAuditLog, AuditActionType } from '../types/shared';

// Helper function to format today's date as DD-MM-YYYY
const todayDDMMYYYY = () => {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

const LeadContext = createContext<LeadContextType | undefined>(undefined);

// Non-searchable fields to avoid performance issues and irrelevant data
const NON_SEARCHABLE_KEYS = ['id', 'isDeleted', 'isDone', 'isUpdated', 'activities', 'mobileNumbers'];

export function LeadProvider({ children }: { children: ReactNode }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [skipPersistence, setSkipPersistence] = useState(false);

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

  const createLeadAuditLog = (
    actionType: AuditActionType,
    leadId: string,
    description: string,
    metadata?: Record<string, any>
  ): void => {
    try {
      const currentUserJson = localStorage.getItem('currentUser');
      const currentUser = currentUserJson ? JSON.parse(currentUserJson) : null;

      const auditLog: SystemAuditLog = {
        id: crypto.randomUUID(),
        actionType,
        entityType: 'lead',
        entityId: leadId,
        performedBy: currentUser?.userId || 'system',
        performedByName: currentUser?.name || 'System',
        performedAt: new Date().toISOString(),
        description,
        metadata
      };

      addAuditLog(auditLog);
    } catch (error) {
      console.error('Error creating lead audit log:', error);
    }
  };

  // Load leads from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('leads');
      if (stored) {
        const parsedLeads = JSON.parse(stored);
        if (process.env.NODE_ENV === 'development') {
          console.log('🔍 Loading leads from localStorage:', parsedLeads.length, 'leads');
          console.log('📊 Lead details:', parsedLeads.map((l: Lead) => ({
            id: l.id,
            kva: l.kva,
            status: l.status,
            isDeleted: l.isDeleted,
            isDone: l.isDone
          })));
        }
        setLeads(parsedLeads);
      } else {
        if (process.env.NODE_ENV === 'development') {
          console.log('🔍 No leads found in localStorage');
        }
      }

      const storedViews = localStorage.getItem('savedViews');
      if (storedViews) {
        setSavedViews(JSON.parse(storedViews));
      }
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  // Save leads to localStorage whenever they change (debounced)
  // Skip persistence during bulk operations (imports) to improve performance
  // Persistence will resume automatically after skipPersistence is set to false
  useEffect(() => {
    if (!isHydrated || skipPersistence) return;

    const timeoutId = setTimeout(() => {
      try {
        localStorage.setItem('leads', JSON.stringify(leads));
      } catch (error) {
        console.error('Error saving leads to localStorage:', error);
      }
    }, 500); // Increased debounce for better performance

    return () => clearTimeout(timeoutId);
  }, [leads, isHydrated]);

  // Save views to localStorage whenever they change (debounced)
  useEffect(() => {
    if (!isHydrated) return;

    const timeoutId = setTimeout(() => {
      try {
        localStorage.setItem('savedViews', JSON.stringify(savedViews));
      } catch (error) {
        console.error('Error saving views to localStorage:', error);
      }
    }, 500); // Increased debounce for better performance

    return () => clearTimeout(timeoutId);
  }, [savedViews, isHydrated]);

  const addLead = useCallback((lead: Lead, columnConfigs?: ColumnConfig[]) => {
    // SV-004: Sanitize lead data to prevent XSS attacks
    const sanitizedLead = sanitizeLead(lead) as Lead;

    // Apply defaults for all current columns if columnConfigs provided
    const leadWithDefaults = columnConfigs ? getLeadWithDefaults(sanitizedLead, columnConfigs) : sanitizedLead;

    // Ensure the lead has all required flags set correctly
    // Preserve submitted_payload for immutability
    const finalLead = {
      ...leadWithDefaults,
      isUpdated: false,
      isDeleted: lead.isDeleted || false,
      isDone: lead.isDone || false,
      createdAt: new Date().toISOString(),
      submitted_payload: lead.submitted_payload // Preserve submitted_payload from input
    };

    // Create audit log
    createLeadAuditLog(
      'LEAD_CREATED',
      finalLead.id,
      `Lead created: ${finalLead.clientName || finalLead.company}`,
      { kva: finalLead.kva, status: finalLead.status }
    );

    setLeads(prev => [...prev, finalLead]);
  }, []);

  const updateLead = useCallback((updatedLead: Lead, opts?: { touchActivity?: boolean }) => {
    // SV-004: Sanitize lead data to prevent XSS attacks
    const sanitizedLead = sanitizeLead(updatedLead) as Lead;
    const touchActivity = opts?.touchActivity !== false; // Default to true if not specified
    setLeads(prev =>
      prev.map(lead => lead.id === sanitizedLead.id ? {
        ...sanitizedLead,
        isUpdated: true,
        lastActivityDate: touchActivity ? new Date().toISOString() : lead.lastActivityDate,
        // Preserve original submitted_payload - this field is immutable after submission
        submitted_payload: lead.submitted_payload || sanitizedLead.submitted_payload
      } : lead)
    );

    // Create audit log for updates
    createLeadAuditLog(
      'LEAD_UPDATED',
      sanitizedLead.id,
      `Lead updated: ${sanitizedLead.clientName || sanitizedLead.company}`,
      {
        oldStatus: leads.find(l => l.id === sanitizedLead.id)?.status,
        newStatus: sanitizedLead.status
      }
    );
  }, [leads]);

  const deleteLead = useCallback((id: string) => {
    // Get lead info before deletion for audit log
    const leadToDelete = leads.find(l => l.id === id);

    setLeads(prev =>
      prev.map(lead =>
        lead.id === id
          ? { ...lead, isDeleted: true, lastActivityDate: new Date().toISOString() }
          : lead
      )
    );

    // Create audit log for soft delete
    if (leadToDelete) {
      createLeadAuditLog(
        'LEAD_DELETED',
        id,
        `Lead soft-deleted: ${leadToDelete.clientName || leadToDelete.company}`,
        {
          previousStatus: leadToDelete.status,
          softDelete: true,
          leadSnapshot: { ...leadToDelete }
        }
      );
    }
  }, [leads]);

  const permanentlyDeleteLead = useCallback((id: string) => {
    // Get lead info before deletion for audit log
    const leadToDelete = leads.find(l => l.id === id);

    // Create audit log before removing the lead
    if (leadToDelete) {
      createLeadAuditLog(
        'LEAD_PERMANENTLY_DELETED',
        id,
        `Lead permanently deleted: ${leadToDelete.clientName || leadToDelete.company}`,
        {
          leadSnapshot: { ...leadToDelete }
        }
      );
    }

    setLeads(prev => prev.filter(lead => lead.id !== id));
  }, [leads]);

  const markAsDone = useCallback((id: string) => {
    // Get lead info before status change for audit log
    const leadToMark = leads.find(l => l.id === id);
    const oldStatus = leadToMark?.status;

    setLeads(prev =>
      prev.map(l => (l.id === id ? {
        ...l,
        isDone: true,
        lastActivityDate: new Date().toISOString() // Update timestamp when marked as done
      } : l))
    );

    // Create audit log for status change
    if (leadToMark) {
      createLeadAuditLog(
        'LEAD_STATUS_CHANGED',
        id,
        `Lead marked as done: ${leadToMark.clientName || leadToMark.company}`,
        {
          oldStatus,
          newStatus: 'Done',
          isDone: true
        }
      );
    }
  }, [leads]);

  const addActivity = useCallback((
    leadId: string,
    description: string,
    options?: {
      activityType?: Activity['activityType'],
      duration?: number,
      metadata?: Record<string, any>
    }
  ) => {
    const newActivity: Activity = {
      id: crypto.randomUUID(),
      leadId,
      description,
      timestamp: new Date().toISOString(),
      activityType: options?.activityType || 'note',
      employeeName: getEmployeeName() || 'Unknown',
      duration: options?.duration || undefined,
      metadata: options?.metadata
    };

    setLeads(prev =>
      prev.map(lead => {
        if (lead.id === leadId) {
          const activities = lead.activities || [];
          return {
            ...lead,
            activities: [...activities, newActivity],
            lastActivityDate: new Date().toISOString()
          };
        }
        return lead;
      })
    );
  }, []);

  const assignLead = useCallback((leadId: string, userId: string, assignedBy: string) => {
    setLeads(prev =>
      prev.map(lead =>
        lead.id === leadId
          ? {
            ...lead,
            assignedTo: userId,
            assignedBy: assignedBy,
            assignedAt: new Date().toISOString(),
            lastActivityDate: new Date().toISOString()
          }
          : lead
      )
    );

    // Create audit log
    createLeadAuditLog(
      'LEAD_ASSIGNED',
      leadId,
      `Lead assigned to user ${userId}`,
      { assignedBy, assignedTo: userId }
    );
  }, []);

  const unassignLead = useCallback((leadId: string) => {
    setLeads(prev =>
      prev.map(lead =>
        lead.id === leadId
          ? {
            ...lead,
            assignedTo: undefined,
            assignedBy: undefined,
            assignedAt: undefined,
            lastActivityDate: new Date().toISOString()
          }
          : lead
      )
    );

    // Create audit log
    createLeadAuditLog(
      'LEAD_UNASSIGNED',
      leadId,
      `Lead unassigned`,
      { previousAssignee: leads.find(l => l.id === leadId)?.assignedTo }
    );
  }, [leads]);

  const forwardToProcess = useCallback(async (
    leadId: string,
    reason?: string,
    deletedFrom: 'sales_dashboard' | 'all_leads' = 'sales_dashboard'
  ): Promise<{ success: boolean; message: string; caseIds?: string[] }> => {
    // Find the lead
    const lead = leads.find(l => l.id === leadId);
    if (!lead) {
      return { success: false, message: 'Lead not found' };
    }

    // Check if lead is already deleted
    if (lead.isDeleted) {
      return { success: false, message: 'Lead is already deleted' };
    }

    try {
      // Get current user info
      const currentUserJson = localStorage.getItem('currentUser');
      const currentUser = currentUserJson ? JSON.parse(currentUserJson) : null;

      // Create case(s) in Process pipeline using CaseContext
      // Access CaseContext's createCase method via localStorage to avoid circular dependency
      const casesJson = localStorage.getItem('processCases') || '[]';
      const existingCases = JSON.parse(casesJson);

      // Generate case data from lead
      const now = new Date().toISOString();
      let caseCounter = 1;
      try {
        caseCounter = parseInt(localStorage.getItem('caseCounter') || '0', 10) + 1;
        localStorage.setItem('caseCounter', caseCounter.toString());
      } catch (e) { console.error(e) }

      const year = new Date().getFullYear();
      const paddedCounter = caseCounter.toString().padStart(4, '0');
      const caseNumber = `CASE-${year}-${paddedCounter}`;
      const caseId = crypto.randomUUID();

      // Create a single case with full lead data preserved
      const newCase = {
        caseId,
        leadId: lead.id,
        caseNumber,
        schemeType: 'Forward from Deletion', // Default scheme type
        caseType: 'Standard',
        benefitTypes: [], // Empty initially, can be assigned later
        companyType: lead.unitType || 'Other',
        contacts: lead.mobileNumbers?.map(m => ({
          name: m.name || lead.clientName,
          designation: 'Contact',
          customDesignation: '',
          phoneNumber: m.number
        })) || [],
        assignedProcessUserId: null,
        assignedRole: null,
        processStatus: 'DOCUMENTS_PENDING',
        priority: 'MEDIUM',
        createdAt: now,
        updatedAt: now,
        // Preserve all lead data - use submitted_payload if available
        clientName: lead.submitted_payload?.clientName || lead.clientName || '',
        company: lead.submitted_payload?.company || lead.company || '',
        mobileNumber: lead.submitted_payload?.mobileNumber || lead.mobileNumber || (lead.mobileNumbers?.[0]?.number || ''),
        consumerNumber: lead.submitted_payload?.consumerNumber || lead.consumerNumber,
        kva: lead.submitted_payload?.kva || lead.kva,
        // Store full submitted_payload for complete data preservation
        originalLeadData: lead.submitted_payload || lead
      };

      existingCases.push(newCase);
      localStorage.setItem('processCases', JSON.stringify(existingCases));

      // Create audit log entry
      const auditLog: LeadDeletionAuditLog = {
        id: crypto.randomUUID(),
        leadId: lead.id,
        leadData: { ...lead }, // Full snapshot
        caseIds: [caseId],
        deletedBy: currentUser?.userId || 'unknown',
        deletedByName: currentUser?.name || 'Unknown User',
        deletedFrom,
        deletedAt: now,
        reason: reason || undefined,
        metadata: {
          leadStatus: lead.status,
          leadCreatedAt: lead.createdAt,
          hasActivities: (lead.activities?.length || 0) > 0
        }
      };

      // Store audit log
      const auditLogsJson = localStorage.getItem('leadDeletionAuditLog') || '[]';
      const auditLogs = JSON.parse(auditLogsJson);
      auditLogs.push(auditLog);
      localStorage.setItem('leadDeletionAuditLog', JSON.stringify(auditLogs));

      // Create system audit log for forward-to-process action
      createLeadAuditLog(
        'LEAD_FORWARDED_TO_PROCESS',
        lead.id,
        `Lead forwarded to process: ${lead.clientName || lead.company}`,
        {
          deletedFrom,
          reason: reason || undefined,
          caseIds: [caseId],
          caseNumber,
          leadSnapshot: { ...lead }
        }
      );

      // Now soft-delete the lead (mark as deleted, don't remove)
      setLeads(prev =>
        prev.map(l =>
          l.id === leadId
            ? { ...l, isDeleted: true, lastActivityDate: now }
            : l
        )
      );

      return {
        success: true,
        message: `Lead forwarded to Process pipeline and marked as deleted. Case ${caseNumber} created.`,
        caseIds: [caseId]
      };
    } catch (error) {
      console.error('Error forwarding lead to process:', error);
      return {
        success: false,
        message: `Failed to forward lead: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }, [leads]);

  // Note: Filter state persistence for the dashboard is handled at the component level using localStorage, not through this context
  const getFilteredLeads = useCallback((filters: LeadFilters): Lead[] => {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 getFilteredLeads called with filters:', filters);
      console.log('📊 Total leads before filtering:', leads.length);
      console.log('📊 All leads details:', leads.map(l => ({
        id: l.id,
        kva: l.kva,
        status: l.status,
        isDeleted: l.isDeleted,
        isDone: l.isDone,
        clientName: l.clientName
      })));
    }

    const filtered = leads.filter(lead => {
      // Filter out deleted leads (isDeleted: true) - they should not appear in dashboard
      if (lead.isDeleted) {
        if (process.env.NODE_ENV === 'development') {
          console.log('❌ Lead filtered out (deleted):', lead.clientName || lead.kva);
        }
        return false;
      }

      // Filter out completed leads (isDone: true)
      if (lead.isDone) {
        if (process.env.NODE_ENV === 'development') {
          console.log('❌ Lead filtered out (done):', lead.clientName || lead.kva);
        }
        return false;
      }

      // For main dashboard (no status filter), show all non-deleted, non-done leads
      // Only filter by status if explicitly provided
      if (filters.status && filters.status.length > 0 && !filters.status.includes(lead.status)) {
        if (process.env.NODE_ENV === 'development') {
          console.log('❌ Lead filtered out (status):', lead.clientName || lead.kva, 'status:', lead.status, 'filter:', filters.status);
        }
        return false;
      }

      // Filter by follow-up date range - parse dates as Date objects for accurate comparison
      const leadDate = toDate(lead.followUpDate);
      const startDate = toDate(filters.followUpDateStart);
      const endDate = toDate(filters.followUpDateEnd);

      if (startDate && leadDate && leadDate < startDate) {
        if (process.env.NODE_ENV === 'development') {
          console.log('❌ Lead filtered out (follow-up date start):', lead.clientName || lead.kva);
        }
        return false;
      }
      if (endDate && leadDate && leadDate > endDate) {
        if (process.env.NODE_ENV === 'development') {
          console.log('❌ Lead filtered out (follow-up date end):', lead.clientName || lead.kva);
        }
        return false;
      }

      // Debug log for invalid dates
      if (lead.followUpDate && !leadDate) {
        console.warn('Invalid followUpDate', lead.id, lead.followUpDate);
      }

      // Search term (search in all lead properties dynamically)
      if (filters.searchTerm) {
        const searchTerm = filters.searchTerm.toLowerCase();

        // Check if it's a phone number search (only digits)
        if (/^\d+$/.test(filters.searchTerm)) {
          // Search in all mobile numbers
          const allMobileNumbers = [
            lead.mobileNumber, // backward compatibility
            ...(lead.mobileNumbers || []).map(m => m.number)
          ];

          for (const mobileNumber of allMobileNumbers) {
            if (mobileNumber) {
              const phoneDigits = mobileNumber.replace(/[^0-9]/g, '');
              if (phoneDigits.includes(filters.searchTerm)) {
                if (process.env.NODE_ENV === 'development') {
                  console.log('✅ Lead matches phone search:', lead.clientName || lead.kva);
                }
                return true;
              }
            }
          }

          // Also search in consumer number digits
          if (extractDigits(lead.consumerNumber).includes(filters.searchTerm)) {
            if (process.env.NODE_ENV === 'development') {
              console.log('✅ Lead matches consumer number search:', lead.clientName || lead.kva);
            }
            return true;
          }
        }

        // Dynamic text search through all lead properties
        const nonSearchableKeys = NON_SEARCHABLE_KEYS;
        const searchableValues: string[] = [];

        // Include all mobile numbers and mobile names explicitly for compatibility
        const allMobileNumbers = [
          lead.mobileNumber, // backward compatibility
          ...(lead.mobileNumbers || []).map(m => m.number)
        ].filter(Boolean);

        const allMobileNames = (lead.mobileNumbers || []).map(m => m.name).filter(Boolean);

        // Add mobile numbers and names to searchable values
        searchableValues.push(...allMobileNumbers.map(num => num.toLowerCase()));
        searchableValues.push(...allMobileNames.map(name => name.toLowerCase()));

        // Iterate through all enumerable properties of the lead object
        Object.entries(lead).forEach(([key, value]) => {
          // Skip non-searchable fields
          if (nonSearchableKeys.includes(key)) {
            return;
          }

          // Handle different value types
          if (value !== null && value !== undefined) {
            if (Array.isArray(value)) {
              // Skip arrays - we handle mobileNumbers specially above
              return;
            } else if (typeof value === 'object') {
              // Skip objects to avoid performance issues
              return;
            } else {
              // Handle primitives (string, number, boolean, date)
              searchableValues.push(String(value).toLowerCase());
            }
          }
        });

        const matches = searchableValues.some(value => value.includes(searchTerm));
        if (!matches) {
          if (process.env.NODE_ENV === 'development') {
            console.log('❌ Lead filtered out (search term):', lead.clientName || lead.kva);
          }
        }
        return matches;
      }

      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Lead passes all filters:', lead.clientName || lead.kva);
      }
      return true;
    });

    if (process.env.NODE_ENV === 'development') {
      console.log('📊 Final filtered leads count:', filtered.length);
    }
    return filtered;
  }, [leads]);

  const resetUpdatedLeads = useCallback(() => {
    setLeads(prev =>
      prev.map(lead => ({ ...lead, isUpdated: false }))
    );
  }, []);

  const addSavedView = useCallback((view: SavedView) => {
    setSavedViews(prev => [...prev, view]);
  }, []);

  const deleteSavedView = useCallback((id: string) => {
    setSavedViews(prev => prev.filter(view => view.id !== id));
  }, []);

  // Column integration methods - enhanced to handle different column types
  const migrateLeadsForNewColumn = useCallback((columnConfig: ColumnConfig) => {
    setLeads(prev => {
      const migrated = prev.map(lead => {
        // Check if lead already has this field
        if ((lead as any)[columnConfig.fieldKey] !== undefined) {
          return lead;
        }

        let defaultValue = columnConfig.defaultValue;

        // Set appropriate default value based on column type
        if (defaultValue === undefined) {
          switch (columnConfig.type) {
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
              defaultValue = columnConfig.options?.[0] || '';
              break;
            default:
              defaultValue = '';
          }
        }

        // Preserve existing flags and properties
        const updatedLead = {
          ...lead,
          [columnConfig.fieldKey]: defaultValue,
          // Explicitly preserve these flags to prevent accidental modification
          isDeleted: lead.isDeleted || false,
          isDone: lead.isDone || false,
          isUpdated: lead.isUpdated || false
        };

        return updatedLead;
      });

      return migrated;
    });
  }, []);

  const removeColumnFromLeads = useCallback((fieldKey: string) => {
    setLeads(prev => prev.map(lead => {
      const { [fieldKey]: removedField, ...rest } = lead as any;
      return rest;
    }));
  }, []);

  const getLeadFieldValue = useCallback((lead: Lead, fieldKey: string, defaultValue?: any, columnConfig?: ColumnConfig): any => {
    const value = (lead as any)[fieldKey];

    if (value !== undefined && value !== null) {
      // Handle type conversion based on column configuration
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

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
    leads,
    setLeads,
    addLead,
    updateLead,
    deleteLead,
    permanentlyDeleteLead,
    markAsDone,
    addActivity,
    getFilteredLeads,
    resetUpdatedLeads,
    savedViews,
    addSavedView,
    deleteSavedView,
    migrateLeadsForNewColumn,
    removeColumnFromLeads,
    getLeadFieldValue,
    getLeadWithDefaults,
    validateLeadAgainstColumns,
    skipPersistence,
    setSkipPersistence,
    assignLead,
    unassignLead,
    forwardToProcess
  }), [
    leads,
    savedViews,
    skipPersistence,
    addLead,
    updateLead,
    deleteLead,
    permanentlyDeleteLead,
    markAsDone,
    addActivity,
    getFilteredLeads,
    resetUpdatedLeads,
    addSavedView,
    deleteSavedView,
    migrateLeadsForNewColumn,
    removeColumnFromLeads,
    getLeadFieldValue,
    getLeadWithDefaults,
    validateLeadAgainstColumns,
    assignLead,
    unassignLead,
    forwardToProcess
  ]);

  return (
    <LeadContext.Provider value={contextValue}>
      {!isHydrated ? (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        </div>
      ) : (
        children
      )}
    </LeadContext.Provider>
  );
}

export function useLeads() {
  const ctx = useContext(LeadContext);
  if (!ctx) throw new Error('useLeads must be used inside LeadProvider');
  return ctx;
}
