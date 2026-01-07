'use client';

import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { useLeads } from '../context/LeadContext';
import type { Lead, LeadFilters } from '../types/shared';
import { useNavigation } from '../context/NavigationContext';
import { useColumns } from '../context/ColumnContext';
import { useUsers } from '../context/UserContext';
import EditableTable from '../components/EditableTable';
import LoadingSpinner from '../components/LoadingSpinner';
import { useRouter } from 'next/navigation';
import { useDebouncedValue } from '../utils/debounce';
import * as XLSX from 'xlsx';

const LeadDetailModal = lazy(() => import('../components/LeadDetailModal'));
const PasswordModal = lazy(() => import('../components/PasswordModal'));
import DeleteConfirmModal from '../components/DeleteConfirmModal';
const PasswordSettingsModal = lazy(() => import('../components/PasswordSettingsModal'));
import { validateLeadField } from '../hooks/useValidation';
import { RoleGuard, AccessDenied } from '../components/RoleGuard';

export default function DashboardPage() {
  const router = useRouter();
  const { leads, deleteLead, getFilteredLeads, updateLead, addActivity, forwardToProcess } = useLeads();
  const { setOnExportClick } = useNavigation();
  const { getVisibleColumns } = useColumns();
  const { currentUser, canViewAllLeads, getUserById } = useUsers();

  // Check if current user can see all leads (SALES_MANAGER or ADMIN)
  const canSeeAllLeads = canViewAllLeads();

  // Helper function to extract digits from a string
  const extractDigits = (str: string | undefined | null): string => {
    return str ? str.replace(/[^0-9]/g, '') : '';
  };
  const [activeFilters, setActiveFilters] = useState<LeadFilters>({});
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const isSearching = searchInput !== debouncedSearch;
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [deleteReason, setDeleteReason] = useState<string | undefined>(undefined);
  const [selectAll, setSelectAll] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState<Lead[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState<Lead | null>(null);
  const [showMassDeleteModal, setShowMassDeleteModal] = useState(false);
  const [leadsToDelete, setLeadsToDelete] = useState<Lead[]>([]);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('info');
  const [showEmptyStatusNotification, setShowEmptyStatusNotification] = useState(false);
  const [emptyStatusMessage, setEmptyStatusMessage] = useState('');
  const [showExportPasswordModal, setShowExportPasswordModal] = useState(false);
  const [passwordSettingsOpen, setPasswordSettingsOpen] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, Record<string, string>>>({});
  const [columnCount, setColumnCount] = useState(0);
  const [highlightedLeadId, setHighlightedLeadId] = useState<string | null>(null);

  // Drag and drop state for status buttons
  const [draggedItem, setDraggedItem] = useState<string | null>(null);
  const [statusOrder, setStatusOrder] = useState<string[]>([
    'New', 'FL1', 'CNR', 'Busy', 'Follow-up', 'Deal Close', 'WAO',
    'Hotlead', 'Mandate Sent', 'Documentation', 'Others'
  ]);

  // Create a stable reference for activeFilters to prevent infinite loops
  const activeFiltersKey = useMemo(() => {
    return `${activeFilters.status?.join(',') || 'none'}-${activeFilters.searchTerm || 'none'}`;
  }, [activeFilters.status, activeFilters.searchTerm]);

  // Show toast notification
  const showToastNotification = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);

    // Auto-hide after 3 seconds
    setTimeout(() => {
      setShowToast(false);
    }, 3000);
  }, []);

  // Handle cell update
  const handleCellUpdate = useCallback(async (leadId: string, field: string, value: string) => {
    try {
      // Find the lead
      const lead = leads.find(l => l.id === leadId);
      if (!lead) {
        throw new Error('Lead not found');
      }

      // Get current column configuration to validate dynamic fields
      const visibleColumns = getVisibleColumns();
      const columnConfig = visibleColumns.find(col => col.fieldKey === field);

      if (process.env.NODE_ENV === 'development') {
        console.log('🔧 Cell update debug:', { leadId, field, value, columnConfig });
      }

      // Validate the field (including custom columns)
      const error = validateLeadField(field as keyof Lead, value, lead, columnConfig);

      if (error) {
        // Set validation error
        setValidationErrors(prev => ({
          ...prev,
          [leadId]: {
            ...prev[leadId],
            [field]: error
          }
        }));
        throw new Error(error);
      }

      // Clear validation error if exists
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        if (newErrors[leadId]) {
          delete newErrors[leadId][field];
          if (Object.keys(newErrors[leadId]).length === 0) {
            delete newErrors[leadId];
          }
        }
        return newErrors;
      });

      // Handle special field formatting
      let formattedValue = value;
      if (field === 'mobileNumbers') {
        // Parse JSON string for mobile numbers
        try {
          const mobileNumbers = JSON.parse(value);
          formattedValue = mobileNumbers;
        } catch {
          throw new Error('Invalid mobile numbers format');
        }
      } else if (columnConfig?.type === 'date' && value) {
        // Format date fields consistently
        formattedValue = formatDateToDDMMYYYY(value);
      }

      // Update the lead with proper field access using safe property assignment
      let updatedLead = {
        ...lead,
        [field]: formattedValue,
        lastActivityDate: new Date().toLocaleDateString('en-GB') // DD-MM-YYYY format
      } as Lead & Record<string, any>; // Allow dynamic properties

      // Clear follow-up date when status changes to "Work Alloted"
      if (field === 'status' && value === 'Work Alloted') {
        updatedLead = { ...updatedLead, followUpDate: '' };
      }

      // Only touch activity for important field changes
      const shouldTouchActivity = ['status', 'followUpDate', 'notes'].includes(field);
      await updateLead(updatedLead, { touchActivity: shouldTouchActivity });

      // Auto-log status changes
      if (field === 'status') {
        const oldStatus = lead.status;
        addActivity(leadId, `Status changed from ${oldStatus} to ${value}`, {
          activityType: 'status_change',
          metadata: { oldStatus, newStatus: value }
        });

        if (value === 'Work Alloted') {
          showToastNotification('Status changed to WAO. Follow-up date has been automatically cleared.', 'info');
          return; // Prevent generic success toast
        }
      }

      showToastNotification('Lead updated successfully!', 'success');
    } catch (error) {
      console.error('Error updating cell:', error);
      showToastNotification(error instanceof Error ? error.message : 'Failed to update lead', 'error');
      throw error;
    }
  }, [leads, updateLead, showToastNotification, getVisibleColumns]);

  // Update filters when debounced search changes
  useEffect(() => {
    setActiveFilters(prev => {
      const trimmedSearch = debouncedSearch.trim();
      if (trimmedSearch) {
        return { ...prev, searchTerm: trimmedSearch };
      } else {
        const { searchTerm, ...rest } = prev;
        return rest;
      }
    });
  }, [debouncedSearch]);

  // Reset selectAll state when filters change
  useEffect(() => {
    setSelectAll(false);
    setSelectedLeads(new Set());
  }, [activeFiltersKey]);

  // Column change detection to force re-render when columns are added/removed
  useEffect(() => {
    const currentColumnCount = getVisibleColumns().length;
    if (currentColumnCount !== columnCount) {
      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 Column count changed:', columnCount, '->', currentColumnCount);
      }
      setColumnCount(currentColumnCount);

      // Force more aggressive re-render by clearing cached filter results
      // This ensures the table completely re-mounts with new column configuration
      const tableKey = `table-${currentColumnCount}-${Date.now()}`;
      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 Forcing table re-mount with key:', tableKey);
      }

      // Force re-render by updating a dummy state
      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 Table re-mounted with', currentColumnCount, 'columns');
      }

      // Clear any validation errors that might be stale
      setValidationErrors({});
    }
  }, [getVisibleColumns, columnCount, showToastNotification]);

  // Show notification when no leads match current status filter
  useEffect(() => {
    if (activeFilters.status && activeFilters.status.length > 0) {
      const filtered = getFilteredLeads(activeFilters);
      setShowEmptyStatusNotification(filtered.length === 0);
    }
  }, [leads, activeFilters.status, getFilteredLeads]);

  // Handle return from edit page - refresh the view
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Clear any stored editing data when leaving the page
      localStorage.removeItem('editingLead');
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  // Check for lead update notification
  useEffect(() => {
    const leadUpdated = localStorage.getItem('leadUpdated');
    if (leadUpdated === 'true') {
      showToastNotification('Lead updated successfully! The lead has been removed from the main dashboard view but can be viewed by clicking on the status buttons.', 'success');
      localStorage.removeItem('leadUpdated');
    }
  }, [showToastNotification]);

  // Check for lead addition notification
  useEffect(() => {
    const leadAdded = localStorage.getItem('leadAdded');
    if (leadAdded === 'true') {
      showToastNotification('Lead added successfully! The new lead is now available in the dashboard.', 'success');
      localStorage.removeItem('leadAdded');

      // Don't automatically set status filter - let user see all leads by default
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Lead added notification received, dashboard will show all leads');
      }
    }
  }, [showToastNotification]);

  // Set up navigation handlers
  useEffect(() => {
    setOnExportClick(() => handleExportExcel);
  }, [setOnExportClick]);

  // Check for updated leads and clear main dashboard view if needed
  useEffect(() => {
    // Check if there are any leads marked as updated
    const hasUpdatedLeads = leads.some(lead => lead.isUpdated && !lead.isDeleted && !lead.isDone);

    // Only clear the main dashboard view if we're on main dashboard (no status filter) 
    // and there are updated leads, but DON'T clear if user has manually selected a status
    if (hasUpdatedLeads && (!activeFilters.status || activeFilters.status.length === 0)) {
      // This ensures updated leads are removed from the main dashboard view
      // but allows users to still click status buttons to see updated leads
      if (process.env.NODE_ENV === 'development') {
        console.log('Clearing main dashboard view due to updated leads');
      }
    }
  }, [leads.length, activeFiltersKey]);

  // Handle ESC key to close modals
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showLeadModal) {
          setShowLeadModal(false);
          document.body.style.overflow = 'unset';
          // Keep highlightedLeadId intact for highlighting after modal closes
        }
        if (showDeleteModal) {
          setShowDeleteModal(false);
          setLeadToDelete(null);
          setDeleteReason(undefined);
          document.body.style.overflow = 'unset';
        }
        if (showMassDeleteModal) {
          setShowMassDeleteModal(false);
          setLeadsToDelete([]);
          setDeleteReason(undefined);
          document.body.style.overflow = 'unset';
        }
        if (showExportPasswordModal) {
          setShowExportPasswordModal(false);
          document.body.style.overflow = 'unset';
        }
        if (passwordSettingsOpen) {
          setPasswordSettingsOpen(false);
          document.body.style.overflow = 'unset';
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showLeadModal, showDeleteModal, showMassDeleteModal, showExportPasswordModal]);

  // Handle modal return from edit form
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const returnToModal = urlParams.get('returnToModal');
    const leadId = urlParams.get('leadId');

    if (returnToModal === 'true' && leadId) {
      // Find the lead and open the modal
      const lead = leads.find(l => l.id === leadId);
      if (lead) {
        setSelectedLead(lead);
        setShowLeadModal(true);
        // Prevent body scrolling when modal is open
        document.body.style.overflow = 'hidden';
      }

      // Clean up URL parameters
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('returnToModal');
      newUrl.searchParams.delete('leadId');
      window.history.replaceState({}, '', newUrl.toString());
    }
  }, [leads]);

  // Restore filter state from localStorage on component mount
  useEffect(() => {
    try {
      const savedFilterState = localStorage.getItem('dashboardFilterState');
      if (savedFilterState) {
        const parsedStatus = JSON.parse(savedFilterState);
        if (Array.isArray(parsedStatus)) {
          setActiveFilters(prev => (!Array.isArray(prev.status) || prev.status.length === 0)
            ? { ...prev, status: parsedStatus }
            : prev);
          if (process.env.NODE_ENV === 'development') {
            console.log('🔄 Restored filter state:', parsedStatus);
          }
          // Clean up after restoration
          localStorage.removeItem('dashboardFilterState');
        }
      }
    } catch (error) {
      console.error('Error restoring filter state:', error);
      // Clean up corrupted data
      localStorage.removeItem('dashboardFilterState');
    }
  }, []);

  // Helper function to parse DD-MM-YYYY format dates
  const parseFollowUpDate = (dateString: string): Date | null => {
    if (!dateString) return null;

    try {
      // Handle DD-MM-YYYY format
      const dateParts = dateString.split('-');
      if (dateString.includes('-') && dateParts[0] && dateParts[0].length <= 2) {
        const [day, month, year] = dateString.split('-');
        if (day && month && year) {
          return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        }
      }
      // Handle other date formats
      return new Date(dateString);
    } catch {
      return null;
    }
  };

  // Helper function to format date to DD-MM-YYYY
  const formatDateToDDMMYYYY = (dateString: string): string => {
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
  };

  // Helper function to get display value from submitted_payload or current lead fields
  // Prioritizes submitted_payload as the source of truth for display
  const getDisplayValue = (lead: Lead, fieldKey: string): any => {
    return lead.submitted_payload?.[fieldKey] ?? (lead as any)[fieldKey];
  };

  // Apply role-based visibility filtering to leads
  // SALES_EXECUTIVE sees only: leads assigned to them OR unassigned leads
  // SALES_MANAGER and ADMIN see all leads
  const roleFilteredLeads = useMemo(() => {
    if (canSeeAllLeads) {
      return leads; // SALES_MANAGER and ADMIN see all leads
    }

    // SALES_EXECUTIVE: Filter to only show assigned leads (to them) or unassigned leads
    if (currentUser?.role === 'SALES_EXECUTIVE') {
      return leads.filter(lead =>
        lead.assignedTo === currentUser.userId || !lead.assignedTo
      );
    }

    return leads;
  }, [leads, canSeeAllLeads, currentUser?.role, currentUser?.userId]);

  // Calculate summary stats with memoization - uses role-filtered leads
  const summaryStats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysLater = new Date(today);
    sevenDaysLater.setDate(today.getDate() + 7);

    let dueToday = 0;
    let upcoming = 0;
    let overdue = 0;
    let followUpMandate = 0;
    let totalLeads = 0;

    roleFilteredLeads.forEach(lead => {
      if (!lead.isDeleted && !lead.isDone) {
        totalLeads++;
      }

      // Count Mandate & Documentation leads regardless of follow-up date
      if (!lead.isDeleted && !lead.isDone && (lead.status === 'Mandate Sent' || lead.status === 'Documentation')) {
        followUpMandate++;
      }

      // Only process follow-up date calculations if lead has a follow-up date
      if (lead.isDeleted || lead.isDone || !lead.followUpDate) return;

      const followUpDate = parseFollowUpDate(lead.followUpDate);
      if (!followUpDate) return;

      followUpDate.setHours(0, 0, 0, 0);

      if (followUpDate.getTime() === today.getTime()) {
        dueToday++;
      } else if (followUpDate > today && followUpDate <= sevenDaysLater) {
        upcoming++;
      } else if (followUpDate < today) {
        overdue++;
      }
    });

    return {
      totalLeads,
      dueToday,
      upcoming,
      overdue,
      followUpMandate
    };
  }, [roleFilteredLeads]);

  // Calculate status counts with memoization - use filtered leads based on current filters
  const statusCounts = useMemo(() => {
    const counts = {
      'New': 0,
      'FL1': 0,
      'CNR': 0,
      'Busy': 0,
      'Follow-up': 0,
      'Deal Close': 0,
      'WAO': 0,
      'Hotlead': 0,
      'Mandate Sent': 0,
      'Documentation': 0,
      'Others': 0
    };

    if (process.env.NODE_ENV === 'development') {
      console.log('=== STATUS COUNTS DEBUG ===');
      console.log('Total leads:', leads.length);
      console.log('Current activeFilters:', activeFilters);
    }

    // Create a temporary filter object that excludes status filtering to get leads for status counts
    const tempFilters = { ...activeFilters };
    delete tempFilters.status; // Remove status filter to count all statuses

    // Use getFilteredLeads then apply role-based filter for consistent visibility
    let filteredLeadsForCounts = getFilteredLeads(tempFilters);

    // Apply role-based filtering for SALES_EXECUTIVE visibility
    if (!canSeeAllLeads && currentUser?.role === 'SALES_EXECUTIVE') {
      filteredLeadsForCounts = filteredLeadsForCounts.filter(lead =>
        lead.assignedTo === currentUser.userId || !lead.assignedTo
      );
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('Filtered leads for status counts:', filteredLeadsForCounts.length);
    }

    filteredLeadsForCounts.forEach(lead => {
      if (process.env.NODE_ENV === 'development') {
        console.log(`Lead ${lead.kva}: status="${lead.status}", discom="${lead.discom}"`);
      }
      // Map Work Alloted to WAO and Fresh Lead to FL1 for counting
      const statusKey = lead.status === 'Work Alloted' ? 'WAO'
        : lead.status === 'Fresh Lead' ? 'FL1'
          : lead.status;
      if (statusKey in counts) {
        counts[statusKey as keyof typeof counts]++;
        if (process.env.NODE_ENV === 'development') {
          console.log(`✅ Incremented count for status: ${statusKey} (original: ${lead.status})`);
        }
      } else {
        if (process.env.NODE_ENV === 'development') {
          console.log(`❌ Status key "${statusKey}" not found in counts object`);
        }
      }
    });

    if (process.env.NODE_ENV === 'development') {
      console.log('Final status counts:', counts);
      console.log('=== END STATUS COUNTS DEBUG ===');
    }

    return counts;
  }, [leads, activeFilters, getFilteredLeads, canSeeAllLeads, currentUser?.role, currentUser?.userId]);

  // Apply role-based assignment filtering for SALES_EXECUTIVE
  // SALES_EXECUTIVE can only see leads assigned to them OR unassigned leads
  // SALES_MANAGER and ADMIN can see all leads
  const getRoleFilteredLeads = useCallback((leadsToFilter: Lead[]): Lead[] => {
    if (canSeeAllLeads) {
      return leadsToFilter; // SALES_MANAGER and ADMIN see all leads
    }

    // SALES_EXECUTIVE: Filter to only show assigned leads (to them) or unassigned leads
    if (currentUser?.role === 'SALES_EXECUTIVE') {
      return leadsToFilter.filter(lead =>
        lead.assignedTo === currentUser.userId || !lead.assignedTo
      );
    }

    return leadsToFilter;
  }, [canSeeAllLeads, currentUser?.role, currentUser?.userId]);


  const { dueToday, upcoming, overdue, followUpMandate } = summaryStats;



  // Handle lead click to view details
  const handleLeadClick = (lead: Lead) => {
    setSelectedLead(lead);
    setShowLeadModal(true);
    setHighlightedLeadId(lead.id); // Mark this lead for highlighting when modal closes
    // Prevent body scrolling when modal is open
    document.body.style.overflow = 'hidden';
  };















  // Show export password modal
  const handleExportExcel = () => {
    setShowExportPasswordModal(true);
  };

  // Handle password verification for export
  const handleExportPasswordSuccess = () => {
    setShowExportPasswordModal(false);
    performExport();
  };

  // Helper function to format dates for export (DD-MM-YYYY format only)
  const formatDateForExport = (dateString: string): string => {
    if (!dateString || dateString.trim() === '') {
      return '';
    }

    // If already in DD-MM-YYYY format, return as is
    if (dateString.match(/^\d{2}-\d{2}-\d{4}$/)) {
      return dateString;
    }

    // If it's an ISO date string or Date object, convert to DD-MM-YYYY
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return dateString; // Return original if invalid
      }

      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();

      return `${day}-${month}-${year}`;
    } catch {
      return dateString; // Return original if conversion fails
    }
  };

  // Actual export function with password verification
  const performExport = async () => {
    try {
      // Small delay to ensure pending header edits are saved
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get filtered leads based on current view
      const leadsToExport = getFilteredLeads(activeFilters);

      // Use fresh column configuration to ensure latest columns are included
      const visibleColumns = getVisibleColumns();
      if (process.env.NODE_ENV === 'development') {
        console.log('📊 Export Debug - Using columns:', visibleColumns.map(c => c.label));
        console.log('📊 Export Debug - Column types:', visibleColumns.map(c => ({ label: c.label, type: c.type, fieldKey: c.fieldKey })));
      }
      const headers = visibleColumns.map(column => column.label);

      // Convert leads to Excel rows with remapped data
      const rows = leadsToExport.map(lead => {
        // Get mobile numbers and contacts
        const mobileNumbers = lead.mobileNumbers || [];
        const mainMobile = mobileNumbers.find(m => m.isMain) || mobileNumbers[0] || { number: lead.mobileNumber || '', name: '' };

        // Format main mobile number (phone number only, no contact name)
        const mainMobileDisplay = mainMobile.number || '';
        if (process.env.NODE_ENV === 'development') {
          console.log('🔍 Export Debug - Lead:', lead.clientName, 'Main Mobile:', mainMobileDisplay);
        }

        // Map data according to visible columns using safe property access
        return visibleColumns.map(column => {
          const fieldKey = column.fieldKey;
          const value = (lead as any)[fieldKey] ?? '';

          if (process.env.NODE_ENV === 'development') {
            console.log(`🔍 Export Debug - Field: ${fieldKey}, Value: ${value}, Type: ${column.type}`);
          }

          // Handle special field formatting
          switch (fieldKey) {
            case 'kva':
              return lead.kva || '';
            case 'connectionDate':
              return formatDateForExport(lead.connectionDate || '');
            case 'consumerNumber':
              return lead.consumerNumber || '';
            case 'company':
              return lead.company || '';
            case 'clientName':
              return lead.clientName || '';
            case 'discom':
              return lead.discom || '';
            case 'mobileNumber':
              return mainMobileDisplay;
            case 'status':
              return lead.status === 'Work Alloted' ? 'WAO' : (lead.status || 'New');
            case 'lastActivityDate':
              return formatDateForExport(lead.lastActivityDate || '');
            case 'followUpDate':
              return formatDateForExport(lead.followUpDate || '');
            default:
              // Handle custom columns with proper type checking
              if (column.type === 'date' && value) {
                return formatDateForExport(value);
              } else if (column.type === 'number' && value) {
                return Number(value) || '';
              } else if (column.type === 'select' && value) {
                return value; // Select values are already strings
              } else {
                return value || '';
              }
          }
        });
      });

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Leads');

      // Generate Excel file and download
      XLSX.writeFile(wb, `leads-export-${new Date().toISOString().split('T')[0]}.xlsx`);

      // Close modal and show success message
      setShowExportPasswordModal(false);
      showToastNotification(`Successfully exported ${leadsToExport.length} leads to Excel format`, 'success');
    } catch (error) {
      console.error('Export error:', error);
      showToastNotification('Failed to export leads. Please try again.', 'error');
    }
  };

  // Search functionality
  const handleSearch = () => {
    // Debouncing handles filter updates automatically
    setShowSuggestions(false);
  };

  // Generate search suggestions
  const generateSuggestions = useCallback((query: string) => {
    if (query.length < 2) {
      setSearchSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const queryLower = query.toLowerCase();
    const queryNumbers = query.replace(/[^0-9]/g, ''); // Extract numbers for phone/consumer number search
    const visibleColumns = getVisibleColumns();

    const suggestions = leads.filter(lead => {
      // Search in KVA
      const kvaMatch = lead.kva?.toLowerCase().includes(queryLower) || false;

      // Search in Consumer Number (both original and cleaned)
      const consumerMatch = lead.consumerNumber?.toLowerCase().includes(queryLower) ||
        extractDigits(lead.consumerNumber).includes(queryNumbers) || false;

      // Search in Mobile Numbers (both original and cleaned)
      const allMobileNumbers = [
        lead.mobileNumber, // backward compatibility
        ...(lead.mobileNumbers || []).map(m => m.number)
      ].filter(Boolean);

      const mobileMatch = allMobileNumbers.some(mobileNumber =>
        mobileNumber?.toLowerCase().includes(queryLower) ||
        mobileNumber?.replace(/[^0-9]/g, '').includes(queryNumbers)
      );

      // Search in Mobile Number Names (including client name fallback only for main number)
      const allMobileNames = (lead.mobileNumbers || []).map(m => m.name || (m.isMain ? lead.clientName : '')).filter(Boolean);
      const mobileNameMatch = allMobileNames.some(mobileName =>
        mobileName?.toLowerCase().includes(queryLower)
      );

      // Search in Company Name
      const companyMatch = lead.company?.toLowerCase().includes(queryLower) || false;

      // Search in Address
      const locationMatch = lead.companyLocation?.toLowerCase().includes(queryLower) || false;

      // Search in Client Name
      const clientMatch = lead.clientName?.toLowerCase().includes(queryLower) || false;

      // Search in Connection Date
      const dateMatch = lead.connectionDate?.toLowerCase().includes(queryLower) || false;

      // Dynamic search through all visible columns
      const dynamicMatch = visibleColumns.some(column => {
        const value = (lead as any)[column.fieldKey];
        if (value === null || value === undefined) return false;

        // Handle different column types appropriately
        switch (column.type) {
          case 'phone':
            // For phone columns, search both original and cleaned versions
            const phoneStr = String(value);
            return phoneStr.toLowerCase().includes(queryLower) ||
              phoneStr.replace(/[^0-9]/g, '').includes(queryNumbers);
          case 'number':
            // For number columns, search both original and string versions
            return String(value).toLowerCase().includes(queryLower);
          case 'date':
            // For date columns, search the formatted date string
            return String(value).toLowerCase().includes(queryLower);
          case 'select':
            // For select columns, search the selected value
            return String(value).toLowerCase().includes(queryLower);
          case 'email':
          case 'text':
          default:
            // For text/email columns, direct string comparison
            return String(value).toLowerCase().includes(queryLower);
        }
      });

      return kvaMatch || consumerMatch || mobileMatch || mobileNameMatch || companyMatch || locationMatch || clientMatch || dateMatch || dynamicMatch;
    }).slice(0, 8); // Show more suggestions

    setSearchSuggestions(suggestions);
    setShowSuggestions(suggestions.length > 0);
  }, [leads, getVisibleColumns]);

  // Search input change handler
  const handleSearchInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchInput(value);

    // Generate suggestions immediately for better UX (not debounced)
    if (value.length >= 2) {
      generateSuggestions(value);
    } else {
      setSearchSuggestions([]);
      setShowSuggestions(false);
    }
  }, [generateSuggestions]);

  // Handle suggestion click
  const handleSuggestionClick = (lead: Lead) => {
    // Determine what field was matched and use that for the search
    const queryLower = searchInput.toLowerCase();
    const queryNumbers = searchInput.replace(/[^0-9]/g, '');

    // Get all mobile numbers for this lead
    const allMobileNumbers = [
      lead.mobileNumber, // backward compatibility
      ...(lead.mobileNumbers || []).map(m => m.number)
    ].filter(Boolean);

    // Get all mobile names for this lead (including client name fallback only for main number)
    const allMobileNames = (lead.mobileNumbers || []).map(m => m.name || (m.isMain ? lead.clientName : '')).filter(Boolean);

    let searchValue = lead.kva; // Default to KVA

    if (lead.consumerNumber.toLowerCase().includes(queryLower) || extractDigits(lead.consumerNumber).includes(queryNumbers)) {
      searchValue = lead.consumerNumber;
    } else if (allMobileNumbers.some(mobileNumber =>
      mobileNumber?.toLowerCase().includes(queryLower) ||
      mobileNumber?.replace(/[^0-9]/g, '').includes(queryNumbers)
    )) {
      // Show the main mobile number or the first one found
      const mainMobile = lead.mobileNumbers?.find(m => m.isMain)?.number || lead.mobileNumber || allMobileNumbers[0];
      searchValue = mainMobile || '';
    } else if (allMobileNames.some((mobileName: string) =>
      mobileName?.toLowerCase().includes(queryLower)
    )) {
      // Show the mobile name that matched (including client name fallback only for main number)
      const matchedMobile = lead.mobileNumbers?.find(m =>
        (m.name || (m.isMain ? lead.clientName : ''))?.toLowerCase().includes(queryLower)
      );
      searchValue = matchedMobile?.name || (matchedMobile?.isMain ? lead.clientName : '') || '';
    } else if (lead.company.toLowerCase().includes(queryLower)) {
      searchValue = lead.company;
    } else if (lead.companyLocation?.toLowerCase().includes(queryLower)) {
      searchValue = lead.companyLocation;
    } else if (lead.clientName.toLowerCase().includes(queryLower)) {
      searchValue = lead.clientName;
    } else if (lead.connectionDate.toLowerCase().includes(queryLower)) {
      searchValue = lead.connectionDate;
    }

    setSearchInput(searchValue);
    setShowSuggestions(false);
  };



  // Clear search
  const clearSearch = () => {
    setSearchInput('');
    setShowSuggestions(false);
  };

  // Clear all filters
  const clearAllFilters = () => {
    setSearchInput('');
    setActiveFilters({}); // Clear all filters to show all leads
    setSelectedLeads(new Set());
    setSelectAll(false);
  };

  // Handle status filter
  const handleStatusFilter = (status: string) => {
    // Map UI codes back to DB values for filtering
    const actualStatus = status === 'WAO' ? 'Work Alloted'
      : status === 'FL1' ? 'Fresh Lead'
        : status as Lead['status'];

    // Check if the status has zero leads
    if (statusCounts[status as keyof typeof statusCounts] === 0) {
      setEmptyStatusMessage(`Your ${status} lead is empty, please add lead to processed.`);
      setShowEmptyStatusNotification(true);
      // Auto-hide after 3 seconds
      setTimeout(() => {
        setShowEmptyStatusNotification(false);
      }, 3000);
      return;
    }

    // Set the status filter - this will show leads with this status (including updated ones)
    setActiveFilters(prev => ({
      ...prev,
      status: [actualStatus]
    }));
    setSelectedLeads(new Set());
    setSelectAll(false);
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, status: string) => {
    setDraggedItem(status);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', status);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dropStatus: string) => {
    e.preventDefault();

    if (draggedItem && draggedItem !== dropStatus) {
      const newOrder = [...statusOrder];
      const draggedIndex = newOrder.indexOf(draggedItem);
      const dropIndex = newOrder.indexOf(dropStatus);

      // Remove dragged item and insert at new position
      newOrder.splice(draggedIndex, 1);
      newOrder.splice(dropIndex, 0, draggedItem);

      setStatusOrder(newOrder);

      // Save to localStorage for persistence
      localStorage.setItem('statusButtonOrder', JSON.stringify(newOrder));
    }

    setDraggedItem(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
  };

  // Load saved order from localStorage
  useEffect(() => {
    const savedOrder = localStorage.getItem('statusButtonOrder');
    if (savedOrder) {
      try {
        const parsedOrder = JSON.parse(savedOrder);
        setStatusOrder(parsedOrder);
      } catch (error) {
        console.error('Error parsing saved button order:', error);
      }
    }
  }, []);

  // Helper function to get button styling
  const getButtonStyle = (status: string) => {
    // Map WAO to Work Alloted for active state checking
    const actualStatus = status === 'WAO' ? 'Work Alloted'
      : status === 'FL1' ? 'Fresh Lead'
        : status;
    const isActive = activeFilters.status?.length === 1 && activeFilters.status[0] === actualStatus;
    const isDragging = draggedItem === status;

    const baseClasses = "px-2.5 py-1.5 rounded-md transition-all duration-200 text-xs font-medium flex items-center gap-1 whitespace-nowrap";
    const draggingClasses = isDragging ? "opacity-50 transform rotate-2" : "";

    const colorMap: { [key: string]: { active: string; inactive: string; badge: string; badgeActive: string } } = {
      'New': {
        active: 'bg-blue-800 text-white',
        inactive: 'bg-blue-600 hover:bg-blue-700 text-white',
        badge: 'bg-blue-500 text-white',
        badgeActive: 'bg-blue-900 text-blue-100'
      },
      'FL1': {
        active: 'bg-emerald-800 text-white',
        inactive: 'bg-emerald-600 hover:bg-emerald-700 text-white',
        badge: 'bg-emerald-500 text-white',
        badgeActive: 'bg-emerald-900 text-emerald-100'
      },
      'CNR': {
        active: 'bg-orange-800 text-white',
        inactive: 'bg-orange-600 hover:bg-orange-700 text-white',
        badge: 'bg-orange-500 text-white',
        badgeActive: 'bg-orange-900 text-orange-100'
      },
      'Busy': {
        active: 'bg-yellow-800 text-white',
        inactive: 'bg-yellow-600 hover:bg-yellow-700 text-white',
        badge: 'bg-yellow-500 text-white',
        badgeActive: 'bg-yellow-900 text-yellow-100'
      },
      'Follow-up': {
        active: 'bg-purple-800 text-white',
        inactive: 'bg-purple-600 hover:bg-purple-700 text-white',
        badge: 'bg-purple-500 text-white',
        badgeActive: 'bg-purple-900 text-purple-100'
      },
      'Deal Close': {
        active: 'bg-green-800 text-white',
        inactive: 'bg-green-600 hover:bg-green-700 text-white',
        badge: 'bg-green-500 text-white',
        badgeActive: 'bg-green-900 text-green-100'
      },
      'WAO': {
        active: 'bg-indigo-800 text-white',
        inactive: 'bg-indigo-600 hover:bg-indigo-700 text-white',
        badge: 'bg-indigo-500 text-white',
        badgeActive: 'bg-indigo-900 text-indigo-100'
      },
      'Hotlead': {
        active: 'bg-red-800 text-white',
        inactive: 'bg-red-600 hover:bg-red-700 text-white',
        badge: 'bg-red-500 text-white',
        badgeActive: 'bg-red-900 text-red-100'
      },
      'Mandate Sent': {
        active: 'bg-teal-800 text-white',
        inactive: 'bg-teal-600 hover:bg-teal-700 text-white',
        badge: 'bg-teal-500 text-white',
        badgeActive: 'bg-teal-900 text-teal-100'
      },
      'Documentation': {
        active: 'bg-slate-800 text-white',
        inactive: 'bg-slate-600 hover:bg-slate-700 text-white',
        badge: 'bg-slate-500 text-white',
        badgeActive: 'bg-slate-900 text-slate-100'
      },
      'Others': {
        active: 'bg-gray-800 text-white',
        inactive: 'bg-gray-600 hover:bg-gray-700 text-white',
        badge: 'bg-gray-500 text-white',
        badgeActive: 'bg-gray-900 text-gray-100'
      }
    };

    const colors = colorMap[status] || colorMap['Others'];
    const colorClasses = isActive ? colors?.active : colors?.inactive;
    const badgeClasses = isActive ? colors?.badgeActive : colors?.badge;

    return {
      buttonClasses: `${baseClasses} ${colorClasses} ${draggingClasses}`,
      badgeClasses: `px-1 py-0.5 rounded-full text-xs font-bold ${badgeClasses}`
    };
  };

  // Handle individual lead selection
  const handleLeadSelection = (leadId: string, checked: boolean) => {
    const newSelectedLeads = new Set(selectedLeads);
    if (checked) {
      newSelectedLeads.add(leadId);
    } else {
      newSelectedLeads.delete(leadId);
    }
    setSelectedLeads(newSelectedLeads);

    // Update selectAll state based on selection
    const filteredLeads = getFilteredLeads(activeFilters);
    setSelectAll(newSelectedLeads.size === filteredLeads.length && filteredLeads.length > 0);
  };

  // Handle select all
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      // Select all filtered leads
      const filteredLeads = getFilteredLeads(activeFilters);
      setSelectedLeads(new Set(filteredLeads.map(lead => lead.id)));
      setSelectAll(true);
    } else {
      // Deselect all
      setSelectedLeads(new Set());
      setSelectAll(false);
    }
  };

  // Bulk delete selected leads
  const handleBulkDelete = () => {
    if (selectedLeads.size === 0) return;

    // Get the actual lead objects for the selected IDs
    const filteredLeads = getFilteredLeads(activeFilters);
    const selectedLeadObjects = filteredLeads.filter(lead => selectedLeads.has(lead.id));

    setLeadsToDelete(selectedLeadObjects);
    setShowMassDeleteModal(true);
  };

  // Bulk update status for selected leads
  const handleBulkStatusUpdate = (newStatus: Lead['status']) => {
    if (selectedLeads.size === 0) return;

    const filteredLeads = getFilteredLeads(activeFilters);
    const selectedLeadObjects = filteredLeads.filter(lead => selectedLeads.has(lead.id));

    // Update each selected lead's status
    selectedLeadObjects.forEach(lead => {
      const updatedLead = { ...lead, status: newStatus };
      updateLead(updatedLead);
    });

    // Show notification
    showToastNotification(`${selectedLeads.size} lead(s) status updated to "${newStatus}" and removed from main dashboard view`, 'success');

    // Clear selection
    setSelectedLeads(new Set());
    setSelectAll(false);
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedLeads(new Set());
    setSelectAll(false);
  };

  // Handle edit lead
  const handleEditLead = (lead: Lead) => {
    // Store the lead data in localStorage for editing
    localStorage.setItem('editingLead', JSON.stringify(lead));
    // Store modal return data for ESC key functionality
    localStorage.setItem('modalReturnData', JSON.stringify({
      sourcePage: 'dashboard',
      leadId: lead.id
    }));
    // Store current filter state to restore after editing
    if (Array.isArray(activeFilters.status) && activeFilters.status.length > 0) {
      localStorage.setItem('dashboardFilterState', JSON.stringify(activeFilters.status));
    } else {
      localStorage.removeItem('dashboardFilterState');
    }
    // Navigate to add-lead page with a flag to indicate we're editing
    router.push(`/add-lead?mode=edit&id=${lead.id}&from=dashboard`);
  };


  return (
    <RoleGuard
      allowedRoles={['ADMIN', 'SALES_EXECUTIVE', 'SALES_MANAGER']}
      fallback={<AccessDenied />}
    >
      <div className="container mx-auto px-1">
        {/* Status Filter Section */}
        <div className="bg-gradient-to-br from-slate-800 via-gray-700 to-slate-800 p-1 rounded-lg shadow-lg border border-slate-600/30 mb-1 relative overflow-hidden mx-auto w-fit mt-2">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 via-transparent to-cyan-500/5"></div>
          <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500"></div>
          <div className="relative">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-1">
              <h3 className="text-sm font-semibold text-white">Filter by Status</h3>
              <span className="text-xs text-white/80">Click any status to filter leads</span>
            </div>
            <div className="flex items-center justify-center gap-1.5 flex-wrap">
              {statusOrder.map((status) => {
                const styles = getButtonStyle(status);
                return (
                  <button
                    key={status}
                    draggable
                    onClick={() => handleStatusFilter(status)}
                    onDragStart={(e) => handleDragStart(e, status)}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, status)}
                    onDragEnd={handleDragEnd}
                    className={styles.buttonClasses}
                    title={`Drag to reorder • Click to filter ${status} leads`}
                  >
                    {status}
                    <span className={styles.badgeClasses}>
                      {statusCounts[status === 'WAO' ? 'WAO' : status as keyof typeof statusCounts]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Bulk Actions Section */}
        <div className="bg-white p-1 rounded-lg shadow-md mb-1">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-1">
            {/* Search Input */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-none">
                <input
                  type="text"
                  placeholder="Search leads..."
                  value={searchInput}
                  onChange={handleSearchInputChange}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  onFocus={() => searchInput.length >= 2 && setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  className="w-full sm:w-64 px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-black placeholder:text-black text-sm"
                />
                {isSearching && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <div className="animate-spin h-4 w-4 border-2 border-purple-600 border-t-transparent rounded-full"></div>
                  </div>
                )}

                {/* Search Suggestions Dropdown */}
                {showSuggestions && searchSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                    {searchSuggestions.map((lead) => {
                      // Determine what field matched for highlighting
                      const queryLower = searchInput.toLowerCase();
                      const queryNumbers = searchInput.replace(/[^0-9]/g, '');

                      const getMatchType = () => {
                        if (lead.kva?.toLowerCase().includes(queryLower)) return 'KVA';
                        if (lead.consumerNumber?.toLowerCase().includes(queryLower) || extractDigits(lead.consumerNumber).includes(queryNumbers)) return 'Consumer No.';

                        // Check all mobile numbers
                        const allMobileNumbers = [
                          lead.mobileNumber, // backward compatibility
                          ...(lead.mobileNumbers || []).map(m => m.number)
                        ].filter(Boolean);

                        if (allMobileNumbers.some(mobileNumber =>
                          mobileNumber?.toLowerCase().includes(queryLower) ||
                          mobileNumber?.replace(/[^0-9]/g, '').includes(queryNumbers)
                        )) return 'Phone';

                        // Check mobile number names (including client name fallback only for main number)
                        const allMobileNames = (lead.mobileNumbers || []).map(m => m.name || (m.isMain ? lead.clientName : '')).filter(Boolean);
                        if (allMobileNames.some(mobileName =>
                          mobileName?.toLowerCase().includes(queryLower)
                        )) return 'Contact';

                        if (lead.company?.toLowerCase().includes(queryLower)) return 'Company';
                        if (lead.companyLocation?.toLowerCase().includes(queryLower)) return 'Address';
                        if (lead.clientName?.toLowerCase().includes(queryLower)) return 'Client';
                        if (lead.connectionDate?.toLowerCase().includes(queryLower)) return 'Date';
                        return 'Match';
                      };

                      const matchType = getMatchType();

                      return (
                        <div
                          key={lead.id}
                          onClick={() => handleSuggestionClick(lead)}
                          className="px-3 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-100 last:border-b-0 text-sm"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="font-medium text-black">{lead.kva}</div>
                              <div className="text-xs text-black">{lead.company} • {lead.clientName}</div>
                            </div>
                            <div className="ml-2">
                              <span className="inline-flex px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                                {matchType}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                onClick={handleSearch}
                className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-xs"
              >
                Search
              </button>

              {activeFilters.searchTerm && (
                <button
                  onClick={clearSearch}
                  className="px-3 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors text-xs"
                >
                  Clear
                </button>
              )}
            </div>

            <button
              onClick={() => handleSelectAll(!selectAll)}
              className={`px-3 py-2 text-xs rounded-lg transition-colors ${selectAll
                ? 'bg-purple-600 text-white hover:bg-purple-700'
                : 'bg-gray-200 text-black hover:bg-gray-300'
                }`}
            >
              {selectAll ? 'Deselect All' : 'Select All'}
            </button>
            {selectedLeads.size > 0 && (
              <>
                <span className="text-sm text-black">
                  {selectedLeads.size} lead(s) selected
                </span>
                <select
                  onChange={(e) => {
                    const newStatus = e.target.value as Lead['status'];
                    if (newStatus) {
                      handleBulkStatusUpdate(newStatus);
                    }
                  }}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  defaultValue=""
                  aria-label="Update status for selected leads"
                >
                  <option value="" disabled>Update Status</option>
                  <option value="New">New</option>
                  <option value="CNR">CNR</option>
                  <option value="Busy">Busy</option>
                  <option value="Follow-up">Follow-up</option>
                  <option value="Deal Close">Deal Close</option>
                  <option value="Work Alloted">WAO</option>
                  <option value="Hotlead">Hotlead</option>
                  <option value="Mandate Sent">Mandate Sent</option>
                  <option value="Documentation">Documentation</option>
                  <option value="Others">Others</option>
                </select>
                <button
                  onClick={handleBulkDelete}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  Delete Selected
                </button>
                <button
                  onClick={clearSelection}
                  className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Close
                </button>
              </>
            )}

            {/* Status Filter Indicator */}
            {activeFilters.status && activeFilters.status.length === 1 ? (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center">
                  <svg className="w-3 h-3 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <circle cx="10" cy="10" r="3" />
                  </svg>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-blue-800">Filtered: {activeFilters.status[0]}</span>
                  <button
                    onClick={clearAllFilters}
                    className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    Clear
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span className="text-sm text-green-800 font-medium">Showing all leads - click status buttons above to filter</span>
                <button
                  onClick={clearAllFilters}
                  className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium"
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>
        </div>


        {/* Empty Status Notification */}
        {showEmptyStatusNotification && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-yellow-800">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <circle cx="10" cy="10" r="3" />
                </svg>
                <span className="font-medium">{emptyStatusMessage}</span>
              </div>
              <button
                onClick={() => setShowEmptyStatusNotification(false)}
                className="text-yellow-600 hover:text-yellow-800 text-sm font-medium"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-1 mb-2">
          <div
            className="bg-white p-1 rounded shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 hover:bg-gray-50"
            onClick={() => router.push('/all-leads')}
          >
            <h3 className="text-xs font-semibold text-black">All Leads</h3>
            <p className="text-sm font-bold text-blue-600">{leads.length}</p>
          </div>
          <div
            className="bg-white p-1 rounded shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 hover:bg-gray-50"
            onClick={() => router.push('/due-today')}
          >
            <h3 className="text-xs font-semibold text-black">Due Today</h3>
            <p className="text-sm font-bold text-yellow-600">{dueToday}</p>
          </div>
          <div
            className="bg-white p-1 rounded shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 hover:bg-gray-50"
            onClick={() => router.push('/upcoming')}
          >
            <h3 className="text-xs font-semibold text-black">Upcoming (7 Days)</h3>
            <p className="text-sm font-bold text-green-600">{upcoming}</p>
          </div>
          <div
            className="bg-white p-1 rounded shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 hover:bg-gray-50"
            onClick={() => router.push('/due-today?tab=overdue')}
          >
            <h3 className="text-xs font-semibold text-black">Overdue</h3>
            <p className="text-sm font-bold text-red-600">{overdue}</p>
          </div>
          <div
            className="bg-white p-1 rounded shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 hover:bg-gray-50"
            onClick={() => router.push('/follow-up-mandate')}
          >
            <h3 className="text-xs font-semibold text-black">Mandate & Documentation</h3>
            <p className="text-sm font-bold text-purple-600">{followUpMandate}</p>
          </div>
        </div>



        {/* Lead Table */}
        <div data-lead-table className="relative">
          <div className="sticky top-0 z-10 bg-white shadow-sm rounded-lg">
            <EditableTable
              key={`table-${columnCount}-${Date.now()}`} // Force re-mount when columns change
              filters={activeFilters}
              onLeadClick={handleLeadClick}
              selectedLeads={selectedLeads}
              onLeadSelection={handleLeadSelection}
              selectAll={selectAll}
              onSelectAll={handleSelectAll}
              editable={true}
              onCellUpdate={handleCellUpdate}
              validationErrors={validationErrors}
              onExportClick={handleExportExcel}
              headerEditable={true}
              highlightedLeadId={highlightedLeadId}
              roleFilter={getRoleFilteredLeads}
              onColumnAdded={(column) => {
                // Handle column addition
                if (process.env.NODE_ENV === 'development') {
                  console.log('Column added:', column);
                }
                showToastNotification(`Column "${column.label}" added successfully!`, 'success');
              }}
              onColumnDeleted={(fieldKey) => {
                // Handle column deletion
                if (process.env.NODE_ENV === 'development') {
                  console.log('Column deleted:', fieldKey);
                }
                showToastNotification('Column deleted successfully!', 'success');
              }}
              onColumnReorder={(newOrder) => {
                // Handle column reordering
                if (process.env.NODE_ENV === 'development') {
                  console.log('Columns reordered:', newOrder);
                }
              }}
              onRowsAdded={(count) => {
                // Handle row addition
                if (process.env.NODE_ENV === 'development') {
                  console.log('Rows added:', count);
                }
              }}
              onRowsDeleted={(count) => {
                // Handle row deletion
                if (process.env.NODE_ENV === 'development') {
                  console.log('Rows deleted:', count);
                }
              }}
            />
          </div>
        </div>

        {/* Lead Detail Modal */}
        {showLeadModal && (
          <Suspense fallback={<LoadingSpinner text="Loading..." />}>
            <LeadDetailModal
              isOpen={showLeadModal}
              onClose={() => {
                setShowLeadModal(false);
                document.body.style.overflow = 'unset';
                // Keep highlightedLeadId set and clear it after 3 seconds
                setTimeout(() => setHighlightedLeadId(null), 3000);
              }}
              lead={selectedLead!}
              onEdit={handleEditLead}
            />
          </Suspense>
        )}

        {showDeleteModal && leadToDelete && (
          <DeleteConfirmModal
            isOpen={showDeleteModal}
            onClose={() => {
              setShowDeleteModal(false);
              setLeadToDelete(null);
              setDeleteReason(undefined);
            }}
            onConfirm={async (reason) => {
              if (!leadToDelete) return;

              setDeleteReason(reason);
              // Forward lead to process before deletion
              const result = await forwardToProcess(leadToDelete.id, reason, 'sales_dashboard');

              setShowDeleteModal(false);
              setShowLeadModal(false);
              setLeadToDelete(null);
              document.body.style.overflow = 'unset';

              if (result.success) {
                showToastNotification(
                  `Lead forwarded to Process pipeline and deleted. Case ${result.caseIds?.[0] || ''} created.`,
                  'success'
                );
              } else {
                showToastNotification(`Failed to delete lead: ${result.message}`, 'error');
              }
            }}
            title="Delete Lead"
            message="Are you sure you want to delete this lead? It will be forwarded to the Process pipeline before deletion."
            captureReason={true}
          />
        )}

        {/* Ultra Sleek Premium Mass Delete Modal */}
        {showMassDeleteModal && (
          <DeleteConfirmModal
            isOpen={showMassDeleteModal}
            onClose={() => {
              setShowMassDeleteModal(false);
              setLeadsToDelete([]);
              setDeleteReason(undefined);
            }}
            onConfirm={async (reason) => {
              setDeleteReason(reason);
              // Forward each lead to process before deletion
              const forwardPromises = leadsToDelete.map(lead =>
                forwardToProcess(lead.id, reason, 'sales_dashboard')
              );

              const results = await Promise.all(forwardPromises);
              const successCount = results.filter(r => r.success).length;
              const failCount = results.length - successCount;

              setShowMassDeleteModal(false);
              setLeadsToDelete([]);
              setSelectedLeads(new Set());
              setSelectAll(false);

              if (failCount === 0) {
                showToastNotification(
                  `${successCount} lead(s) forwarded to Process pipeline and deleted successfully`,
                  'success'
                );
              } else {
                showToastNotification(
                  `${successCount} succeeded, ${failCount} failed. Check console for details.`,
                  'error'
                );
              }
            }}
            title="Delete Leads"
            message={`You are about to delete ${leadsToDelete.length} lead(s). They will be forwarded to the Process pipeline before deletion.`}
            captureReason={true}
          />
        )}

        {/* Export Password Modal */}
        {showExportPasswordModal && (
          <Suspense fallback={<LoadingSpinner text="Loading..." />}>
            <PasswordModal
              isOpen={showExportPasswordModal}
              onClose={() => {
                setShowExportPasswordModal(false);
              }}
              operation="export"
              onSuccess={handleExportPasswordSuccess}
              title="Export Leads"
              description="Enter password to export leads data"
            />
          </Suspense>
        )}


        {/* Password Settings Modal */}
        {passwordSettingsOpen && (
          <Suspense fallback={<LoadingSpinner text="Loading..." />}>
            <PasswordSettingsModal
              isOpen={passwordSettingsOpen}
              onClose={() => setPasswordSettingsOpen(false)}
              onPasswordChanged={() => {
                // Refresh any cached verification status
              }}
            />
          </Suspense>
        )}


        {/* Toast Notification */}
        {showToast && (
          <div className="fixed top-4 right-4 z-50">
            <div className={`px-6 py-4 rounded-lg shadow-lg text-white font-medium ${toastType === 'success' ? 'bg-green-600' :
              toastType === 'error' ? 'bg-red-600' :
                'bg-blue-600'
              }`}>
              <div className="flex items-center space-x-3">
                {toastType === 'success' && (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {toastType === 'error' && (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                {toastType === 'info' && (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                )}
                <span>{toastMessage}</span>
                <button
                  onClick={() => setShowToast(false)}
                  className="ml-4 text-white hover:text-gray-200"
                  aria-label="Close notification"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </RoleGuard>
  );
}
