'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { parseDateFromDDMMYYYY } from '../utils/dateUtils';
import { Lead, LeadFilters, SavedView, LeadContextType, ColumnConfig } from '../types/shared';

// Helper function to format today's date as DD-MM-YYYY
const todayDDMMYYYY = () => {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

const LeadContext = createContext<LeadContextType | undefined>(undefined);

export function LeadProvider({ children }: { children: ReactNode }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [skipPersistence, setSkipPersistence] = useState(false);

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

  const addLead = (lead: Lead, columnConfigs?: ColumnConfig[]) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Adding lead:', lead);
      console.log('📊 Lead status:', lead.status);
      console.log('📊 Lead isDeleted:', lead.isDeleted);
      console.log('📊 Lead isDone:', lead.isDone);
      console.log('📊 Column configs provided:', columnConfigs?.length || 0);
    }
    
    // Apply defaults for all current columns if columnConfigs provided
    const leadWithDefaults = columnConfigs ? getLeadWithDefaults(lead, columnConfigs) : lead;
    
    // Ensure the lead has all required flags set correctly
    const finalLead = {
      ...leadWithDefaults,
      isUpdated: false,
      isDeleted: lead.isDeleted || false,
      isDone: lead.isDone || false
    };
    
    setLeads(prev => {
      const newLeads = [...prev, finalLead];
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Updated leads count:', newLeads.length);
        console.log('📊 All leads statuses:', newLeads.map(l => ({ id: l.id, status: l.status, isDeleted: l.isDeleted, isDone: l.isDone })));
      }
      return newLeads;
    });
  };
  
  const updateLead = (updatedLead: Lead, opts?: { touchActivity?: boolean }) => {
    const touchActivity = opts?.touchActivity !== false; // Default to true if not specified
    setLeads(prev => 
      prev.map(lead => lead.id === updatedLead.id ? { 
        ...updatedLead, 
        isUpdated: true,
        lastActivityDate: touchActivity ? new Date().toISOString() : lead.lastActivityDate
      } : lead)
    );
  };
  
  const deleteLead = (id: string) => {
    setLeads(prev => {
      const updated = prev.map(lead => 
        lead.id === id 
          ? { ...lead, isDeleted: true, lastActivityDate: new Date().toISOString() }
          : lead
      );
      return updated;
    });
  };

  const permanentlyDeleteLead = (id: string) => {
    setLeads(prev => prev.filter(lead => lead.id !== id));
  };

  const markAsDone = (id: string) => {
    setLeads(prev =>
      prev.map(l => (l.id === id ? { 
        ...l, 
        isDone: true,
        lastActivityDate: new Date().toISOString() // Update timestamp when marked as done
      } : l))
    );
  };
  
  const addActivity = (leadId: string, description: string) => {
    const newActivity = {
      id: crypto.randomUUID(),
      leadId,
      description,
      timestamp: new Date().toISOString()
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
  };
  
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
      
      // Filter by discom - robust comparison
      if (filters.discom && filters.discom !== '') {
        const leadDiscom = String(lead.discom || '').trim().toUpperCase();
        const filterDiscom = String(filters.discom).trim().toUpperCase();
        
        if (leadDiscom !== filterDiscom) {
          if (process.env.NODE_ENV === 'development') {
            console.log('❌ Lead filtered out (discom):', lead.clientName || lead.kva, 'lead discom:', leadDiscom, 'filter:', filterDiscom);
          }
          return false;
        }
      }
      
      // Search term (search in name, company, email, notes, etc.)
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
        }
        
        // Regular text search
        const allMobileNumbers = [
          lead.mobileNumber, // backward compatibility
          ...(lead.mobileNumbers || []).map(m => m.number)
        ].filter(Boolean);
        
        const allMobileNames = (lead.mobileNumbers || []).map(m => m.name).filter(Boolean);
        
        const searchableFields = [
          lead.clientName,
          lead.company,
          ...allMobileNumbers,
          ...allMobileNames,
          lead.consumerNumber,
          lead.kva,
          lead.discom,
          lead.companyLocation,
          lead.notes,
          lead.finalConclusion
        ].filter(Boolean).map(field => field?.toLowerCase());
        
        const matches = searchableFields.some(field => field?.includes(searchTerm));
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

  const resetUpdatedLeads = () => {
    setLeads(prev => 
      prev.map(lead => ({ ...lead, isUpdated: false }))
    );
  };
  
  const addSavedView = (view: SavedView) => {
    setSavedViews(prev => [...prev, view]);
  };
  
  const deleteSavedView = (id: string) => {
    setSavedViews(prev => prev.filter(view => view.id !== id));
  };

  // Column integration methods - enhanced to handle different column types
  const migrateLeadsForNewColumn = (columnConfig: ColumnConfig) => {
    console.log(`🔄 Starting migration for new column: ${columnConfig.fieldKey}`);
    console.log(`📊 Total leads to migrate: ${leads.length}`);
    
    setLeads(prev => {
      const migrated = prev.map(lead => {
        // Check if lead already has this field
        if ((lead as any)[columnConfig.fieldKey] !== undefined) {
          console.log(`⚠️ Lead ${lead.clientName || lead.kva} already has field ${columnConfig.fieldKey}, skipping`);
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
        
        console.log(`✅ Migrated lead ${lead.clientName || lead.kva} with field ${columnConfig.fieldKey} = ${defaultValue}`);
        return updatedLead;
      });
      
      console.log(`🎉 Migration complete for column: ${columnConfig.fieldKey}`);
      return migrated;
    });
  };

  const removeColumnFromLeads = (fieldKey: string) => {
    setLeads(prev => prev.map(lead => {
      const { [fieldKey]: removedField, ...rest } = lead as any;
      return rest;
    }));
    console.log(`Removed column "${fieldKey}" from ${leads.length} leads`);
  };

  const getLeadFieldValue = (lead: Lead, fieldKey: string, defaultValue?: any, columnConfig?: ColumnConfig): any => {
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
  };

  // Additional helper functions for dynamic columns
  const getLeadWithDefaults = (lead: Lead, columnConfigs: ColumnConfig[]): Lead => {
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
  };

  const validateLeadAgainstColumns = (lead: Lead, columnConfigs: ColumnConfig[]): string[] => {
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
  };

  return (
    <LeadContext.Provider value={{
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
      setSkipPersistence
    }}>
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
