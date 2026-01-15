'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback, lazy, Suspense, startTransition } from 'react';
import { useLeads } from '../context/LeadContext';
// import { useCases } from '../context/CaseContext';
import type { Lead } from '../types/shared';
import { useHeaders } from '../context/HeaderContext';
import { useColumns } from '../context/ColumnContext';
import { useUsers } from '../context/UserContext';
import { useRouter } from 'next/navigation';
import EditableTable from '../components/EditableTable';
import LoadingSpinner from '../components/LoadingSpinner';
import { validateLeadField, validateDynamicField } from '../hooks/useValidation';
import { useDebouncedValue } from '../utils/debounce';
import { validateExportHeaders, validateRequiredHeaders, getExportSuggestions, getHeaderPatternScore } from '../constants/exportUtils';
import { findBestFuzzyMatch, normalizeHeader, getHeaderVariations } from '../utils/stringUtils';
import * as XLSX from 'xlsx';
import { useWebSocketConflicts } from '../hooks/useWebSocketConflicts';
import ConflictResolutionModal from '../components/ConflictResolutionModal';
import { applyResolution } from '../utils/optimistic';
import { useUpdateLeadMutation } from '../hooks/mutations/useLeadsMutations';

const LeadDetailModal = lazy(() => import('../components/LeadDetailModal'));
const PasswordModal = lazy(() => import('../components/PasswordModal'));

// Shared field mapping constants for import/export
// @deprecated Use getExportHeaders from '../constants/exportUtils' instead for dynamic headers
export const EXPORT_HEADERS = [
  'con.no',
  'KVA',
  'Connection Date',
  'Company Name',
  'Client Name',
  'Discom',
  'GIDC',
  'GST Number',
  'Unit Type',
  'Main Mobile Number',
  'Lead Status',
  'Last Discussion',
  'Address',
  'Next Follow-up Date',
  'Last Activity Date',
  'Term Loan',
  'Mobile Number 2',
  'Contact Name 2',
  'Mobile Number 3',
  'Contact Name 3'
] as const;


// Legacy static mappings - now handled dynamically by fieldMapping
// This constant is kept for reference but should not be used in new code
// @ts-ignore - Kept for reference only
const _LEGACY_IMPORT_FIELD_MAPPINGS = {
  'con.no': 'consumerNumber',
  'consumer number': 'consumerNumber',
  'connection number': 'consumerNumber',
  'kva': 'kva',
  'name': 'kva',
  'full name': 'kva',
  'lead name': 'kva',
  'contact name': 'kva',
  'connection date': 'connectionDate',
  'company': 'company',
  'company name': 'company',
  'organization': 'company',
  'client name': 'clientName',
  'client': 'clientName',
  'discom': 'discom',
  'gidc': 'gidc',
  'gst number': 'gstNumber',
  'gst': 'gstNumber',
  'unit type': 'unitType',
  'type': 'unitType',
  'main mobile number': 'mobileNumber',
  'mobile number': 'mobileNumber',
  'phone': 'mobileNumber',
  'mobile number 2': 'mobileNumber2',
  'mobile number 3': 'mobileNumber3',
  'contact name 2': 'contactName2',
  'contact name 3': 'contactName3',
  'lead status': 'status',
  'status': 'status',
  'last discussion': 'notes',
  'notes': 'notes',
  'discussion': 'notes',
  'address': 'companyLocation',
  'company location': 'companyLocation',
  'location': 'companyLocation',
  'next follow-up date': 'followUpDate',
  'follow-up date': 'followUpDate',
  'followup date': 'followUpDate',
  'last activity date': 'lastActivityDate',
  'last activity': 'lastActivityDate',
  'activity date': 'lastActivityDate',
  'term loan': 'termLoan',
  'termloan': 'termLoan',
  'loan term': 'termLoan',
  'loan duration': 'termLoan'
} as const;

export default function AllLeadsPage() {
  const router = useRouter();
  const { leads, setLeads, permanentlyDeleteLead, updateLead, forwardToProcess } = useLeads();
  // const { cases, updateCase } = useCases();
  const { headerConfig } = useHeaders();
  const { getVisibleColumns } = useColumns();
  const { currentUser, canViewAllLeads } = useUsers();
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const isSearching = searchInput !== debouncedSearch;
  const canSeeAllLeads = canViewAllLeads();

  // Conflict Resolution
  // Conflict Resolution
  const conflictFilter = useCallback((c: any) => c.entityType === 'lead', []);
  const { conflictState, cancelConflict } = useWebSocketConflicts(conflictFilter);
  const updateLeadMutation = useUpdateLeadMutation();

  const handleConflictResolve = async (resolution: any) => {
    if (!conflictState) return;

    const resolvedEntity = applyResolution(resolution, conflictState);

    try {
      await updateLeadMutation.mutateAsync({
        id: conflictState.optimistic.id,
        ...resolvedEntity,
        version: conflictState.server.version
      });
      cancelConflict();
    } catch (error) {
      console.error('Failed to resolve conflict:', error);
    }
  };

  // Build dynamic field mapping that includes current custom headers and column configuration
  // Memoized to avoid rebuilding on every cell mapping
  const fieldMapping = useMemo(() => {
    const dynamicMapping: Record<string, keyof Lead> = {};

    // Load saved mappings from localStorage (highest priority)
    try {
      const savedMappings = localStorage.getItem('importColumnMappings');
      if (savedMappings) {
        const parsedMappings = JSON.parse(savedMappings);
        Object.entries(parsedMappings).forEach(([excelHeader, systemField]) => {
          dynamicMapping[normalizeHeader(excelHeader)] = systemField as keyof Lead;
          if (process.env.NODE_ENV === 'development') {
            console.log(`📌 Applied saved mapping: '${excelHeader}' → '${systemField}'`);
          }
        });
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Failed to load saved mappings:', error);
      }
    }

    // Add current custom header names to the mapping
    Object.entries(headerConfig).forEach(([fieldKey, customLabel]) => {
      const labelLower = customLabel.toLowerCase().trim();
      const normalized = labelLower.replace(/\s+/g, ' '); // Normalize multiple spaces
      dynamicMapping[labelLower] = fieldKey as keyof Lead;
      dynamicMapping[normalized] = fieldKey as keyof Lead;

      // Generate header variations using stringUtils
      const variations = getHeaderVariations(customLabel);
      variations.forEach(variation => {
        dynamicMapping[variation] = fieldKey as keyof Lead;
      });

      // Add reverse mapping for exported headers
      // If a column label is customized, also map the original default label
      const defaultLabels: Record<string, string> = {
        'mobileNumber': 'Mobile Number',
        'clientName': 'Client Name',
        'kva': 'KVA',
        'status': 'Status',
        'connectionDate': 'Connection Date',
        'consumerNumber': 'Consumer Number',
        'company': 'Company',
        'lastActivityDate': 'Last Activity Date',
        'followUpDate': 'Follow Up Date'
      };

      if (defaultLabels[fieldKey]) {
        const defaultLabel = defaultLabels[fieldKey].toLowerCase();
        dynamicMapping[defaultLabel] = fieldKey as keyof Lead;

        // Generate variations for default labels too
        const defaultVariations = getHeaderVariations(defaultLabels[fieldKey]);
        defaultVariations.forEach(variation => {
          dynamicMapping[variation] = fieldKey as keyof Lead;
        });
      }
    });

    // Add current column configuration to the mapping
    const visibleColumns = getVisibleColumns();
    visibleColumns.forEach(column => {
      const labelLower = column.label.toLowerCase().trim();
      const normalized = labelLower.replace(/\s+/g, ' '); // Normalize multiple spaces
      dynamicMapping[labelLower] = column.fieldKey as keyof Lead;
      dynamicMapping[normalized] = column.fieldKey as keyof Lead;

      // Generate header variations using centralized function
      const variations = getHeaderVariations(column.label);
      variations.forEach(variation => {
        dynamicMapping[variation] = column.fieldKey as keyof Lead;
      });
    });

    // Add special handling for mobile number fields
    const mobileNumberMappings = {
      'mobile number 2': 'mobileNumber2',
      'mobile number2': 'mobileNumber2',
      'mobile2': 'mobileNumber2',
      'phone 2': 'mobileNumber2',
      'phone2': 'mobileNumber2',
      'contact number 2': 'mobileNumber2',
      'contact2': 'mobileNumber2',
      'mobile number 3': 'mobileNumber3',
      'mobile number3': 'mobileNumber3',
      'mobile3': 'mobileNumber3',
      'phone 3': 'mobileNumber3',
      'phone3': 'mobileNumber3',
      'contact number 3': 'mobileNumber3',
      'contact3': 'mobileNumber3',
      'contact name 2': 'contactName2',
      'contact name2': 'contactName2',
      'contact2 name': 'contactName2',
      'contact name 3': 'contactName3',
      'contact name3': 'contactName3',
      'contact3 name': 'contactName3'
    };

    Object.entries(mobileNumberMappings).forEach(([header, field]) => {
      dynamicMapping[header] = field as keyof Lead;
    });

    // Add legacy static mappings for backward compatibility
    // These will be used when no dynamic mapping is found
    const legacyMappings = {
      // Consumer Number variations
      'con.no': 'consumerNumber',
      'con.no.': 'consumerNumber',
      'connection number': 'consumerNumber',
      'consumer number': 'consumerNumber',
      'consumernumber': 'consumerNumber',

      // KVA/Name variations
      'kva': 'kva',
      'name': 'kva',
      'full name': 'kva',
      'lead name': 'kva',
      'contact name': 'kva',

      // Connection Date variations
      'connection date': 'connectionDate',
      'connectiondate': 'connectionDate',

      // Company variations
      'company': 'company',
      'company name': 'company',
      'organization': 'company',

      // Company Location variations
      'company location': 'companyLocation',
      'companylocation': 'companyLocation',
      'location': 'companyLocation',
      'address': 'companyLocation',

      // Client Name variations
      'client name': 'clientName',
      'clientname': 'clientName',
      'client': 'clientName',

      // Mobile Number variations
      'mo.no': 'mobileNumber',
      'mo.no.': 'mobileNumber',
      'mo .no': 'mobileNumber',
      'mo .no.': 'mobileNumber',
      'mobile number': 'mobileNumber',
      'mobilenumber': 'mobileNumber',
      'mobile': 'mobileNumber',
      'phone': 'mobileNumber',
      'phone number': 'mobileNumber',
      'contact phone': 'mobileNumber',
      'telephone': 'mobileNumber',
      'main mobile number': 'mobileNumber',

      // Unit Type variations
      'unit type': 'unitType',
      'unittype': 'unitType',
      'type': 'unitType',

      // Status variations
      'status': 'status',
      'lead status': 'status',
      'current status': 'status',
      'leadstatus': 'status',
      'lead_status': 'status',
      'lead-status': 'status',

      // Follow-up Date variations
      'follow up date': 'followUpDate',
      'followup date': 'followUpDate',
      'follow_up_date': 'followUpDate',
      'follow-up-date': 'followUpDate',
      'followup': 'followUpDate',
      'follow_up': 'followUpDate',
      'follow-up': 'followUpDate',
      'next follow up': 'followUpDate',
      'nextfollowup': 'followUpDate',
      'next_follow_up': 'followUpDate',
      'next-follow-up': 'followUpDate',
      'next call date': 'followUpDate',
      'nextcalldate': 'followUpDate',
      'next_call_date': 'followUpDate',
      'next-call-date': 'followUpDate',
      'callback date': 'followUpDate',
      'callbackdate': 'followUpDate',
      'callback_date': 'followUpDate',
      'callback-date': 'followUpDate',
      'reminder date': 'followUpDate',
      'reminderdate': 'followUpDate',
      'reminder_date': 'followUpDate',
      'reminder-date': 'followUpDate',

      // Last Activity Date variations
      'last activity date': 'lastActivityDate',
      'lastactivitydate': 'lastActivityDate',
      'last_activity_date': 'lastActivityDate',
      'last activity': 'lastActivityDate',
      'lastactivity': 'lastActivityDate',
      'last_activity': 'lastActivityDate',
      'activity date': 'lastActivityDate',
      'activitydate': 'lastActivityDate',
      'activity_date': 'lastActivityDate',
      'last call date': 'lastActivityDate',
      'lastcalldate': 'lastActivityDate',
      'last_call_date': 'lastActivityDate',
      'last contact date': 'lastActivityDate',
      'lastcontactdate': 'lastActivityDate',
      'last_contact_date': 'lastActivityDate',

      // Notes variations
      'notes': 'notes',
      'discussion': 'notes',
      'last discussion': 'notes',
      'lastdiscussion': 'notes',
      'last_discussion': 'notes',
      'last-discussion': 'notes',
      'call notes': 'notes',
      'comments': 'notes',
      'comment': 'notes',
      'description': 'notes',

      // GIDC variations
      'gidc': 'gidc',

      // Discom variations
      'discom': 'discom',

      // GST Number variations
      'gst number': 'gstNumber',
      'gstnumber': 'gstNumber',
      'gst_number': 'gstNumber',
      'gst': 'gstNumber',

      // Final Conclusion variations
      'final conclusion': 'finalConclusion',
      'finalconclusion': 'finalConclusion',
      'final_conclusion': 'finalConclusion',
      'conclusion': 'finalConclusion'
    };

    // Add legacy mappings to dynamic mapping
    Object.entries(legacyMappings).forEach(([header, field]) => {
      if (!dynamicMapping[header]) {
        dynamicMapping[header] = field as keyof Lead;
      }
    });

    // Add logging for mapping conflicts
    const duplicates = Object.entries(dynamicMapping).filter(([, v], i, arr) =>
      arr.findIndex(([, v2]) => v === v2) !== i
    );

    if (duplicates.length > 0) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('⚠️ Duplicate mappings detected:', duplicates);
      }
    }

    if (process.env.NODE_ENV === 'development') {
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 Dynamic field mapping built:', dynamicMapping);
        console.log('🔍 Total mappings:', Object.keys(dynamicMapping).length);
        console.log('🔍 Mobile number mappings:', Object.entries(mobileNumberMappings).length);
      }
    }
    return dynamicMapping;
  }, [headerConfig, getVisibleColumns]);

  // Fuzzy header matching function
  const fuzzyMatchHeader = useCallback((header: string, dynamicMapping: Record<string, keyof Lead>): { fieldKey: keyof Lead; matchType: 'exact' | 'fuzzy'; score: number } | null => {
    const headerLower = normalizeHeader(header);

    // First try exact match
    if (dynamicMapping[headerLower]) {
      return {
        fieldKey: dynamicMapping[headerLower],
        matchType: 'exact',
        score: 1.0
      };
    }

    // Try fuzzy matching with all available field keys
    const availableFields = Object.keys(dynamicMapping);
    const fuzzyMatch = findBestFuzzyMatch(headerLower, availableFields, 0.7);

    if (fuzzyMatch) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔍 Fuzzy matched '${header}' to '${fuzzyMatch.match}' (score: ${Math.round(fuzzyMatch.score * 100)}%)`);
      }
      const fieldKey = dynamicMapping[fuzzyMatch.match];
      if (fieldKey) {
        return {
          fieldKey,
          matchType: 'fuzzy',
          score: fuzzyMatch.score
        };
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`❌ No mapping found for header '${header}' (exact or fuzzy)`);
    }
    return null;
  }, []);

  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showLeadModal, setShowLeadModal] = useState(false);

  // Bulk delete states
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());

  // Password modal states
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pendingDeleteOperation, setPendingDeleteOperation] = useState<{
    type: 'single' | 'bulk';
    lead?: Lead;
    leadIds?: string[];
  } | null>(null);

  // Export password modal state
  const [showExportPasswordModal, setShowExportPasswordModal] = useState<boolean>(false);

  // Clean up pending delete operation when modal closes
  useEffect(() => {
    if (!showPasswordModal) {
      setPendingDeleteOperation(null);
    }
  }, [showPasswordModal]);

  // Toast notification states
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('info');

  // Editable table states
  const [validationErrors, setValidationErrors] = useState<Record<string, Record<string, string>>>({});


  // Import progress tracking state
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });

  // Helper function to check if a lead has an associated case (via localStorage)
  const leadHasCase = useCallback((leadId: string): boolean => {
    try {
      const casesJson = localStorage.getItem('processCases');
      if (!casesJson) return false;
      const cases = JSON.parse(casesJson);
      return cases.some((c: { leadId: string }) => c.leadId === leadId);
    } catch (e) {
      console.error('Error checking lead case association:', e);
      return false;
    }
  }, []);

  // Session verification state
  const [isSessionVerified, setIsSessionVerified] = useState(false);

  // Check session verification status on component mount
  useEffect(() => {
    const checkSessionStatus = () => {
      const isVerified = sessionStorage.getItem('verified_rowManagement');
      setIsSessionVerified(!!isVerified);
    };

    checkSessionStatus();

    // Listen for storage changes to update state when verification is added/removed
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'verified_rowManagement') {
        checkSessionStatus();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

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
        if (process.env.NODE_ENV === 'development') {
          console.log('🔧 Cell update debug:', { leadId, field, value, columnConfig });
        }
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
      const updatedLead = {
        ...lead,
        [field]: formattedValue,
        lastActivityDate: new Date().toLocaleDateString('en-GB') // DD-MM-YYYY format
      } as Lead & Record<string, any>; // Allow dynamic properties

      // Only touch activity for important field changes
      const shouldTouchActivity = ['status', 'followUpDate', 'notes'].includes(field);
      setLeads(prev => prev.map(l => l.id === leadId ? {
        ...updatedLead,
        lastActivityDate: shouldTouchActivity ? updatedLead.lastActivityDate : l.lastActivityDate
      } : l));
      showToastNotification('Lead updated successfully!', 'success');
    } catch (error) {
      console.error('Error updating cell:', error);
      showToastNotification(error instanceof Error ? error.message : 'Failed to update lead', 'error');
      throw error;
    }
  }, [leads, setLeads, showToastNotification, getVisibleColumns]);

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

  // Filter leads based on status and search term
  // Dependencies use primitives and debounced search for optimal performance
  const allLeads = useMemo(() => {
    // First apply role-based visibility filtering for SALES_EXECUTIVE
    let filtered = canSeeAllLeads || currentUser?.role !== 'SALES_EXECUTIVE'
      ? leads
      : leads.filter(lead => lead.assignedTo === currentUser?.userId || !lead.assignedTo);

    if (debouncedSearch) {
      filtered = filtered.filter(lead => {
        const searchLower = debouncedSearch.toLowerCase();

        // Check if it's a phone number search (only digits)
        if (/^\d+$/.test(debouncedSearch)) {
          const allMobileNumbers = [
            lead.mobileNumber,
            ...(lead.mobileNumbers || []).map(m => m.number)
          ];

          for (const mobileNumber of allMobileNumbers) {
            if (mobileNumber) {
              const phoneDigits = mobileNumber.replace(/[^0-9]/g, '');
              if (phoneDigits.includes(debouncedSearch)) {
                return true;
              }
            }
          }
        }

        // Regular text search
        const allMobileNumbers = [
          lead.mobileNumber,
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
          lead.finalConclusion,
          lead.status
        ].filter(Boolean).map(field => field?.toLowerCase());

        return searchableFields.some(field => field?.includes(searchLower));
      });
    }

    // Sort leads: deleted leads first, then completed leads, then active leads
    return filtered.sort((a, b) => {
      // If one is deleted and the other isn't, deleted goes first
      if (a.isDeleted && !b.isDeleted) return -1;
      if (!a.isDeleted && b.isDeleted) return 1;

      // If both are deleted or both are not deleted, check completion status
      if (a.isDone && !b.isDone) return -1;
      if (!a.isDone && b.isDone) return 1;

      // If both have same deletion and completion status, sort by lastActivityDate (most recent first)
      const dateA = new Date(a.lastActivityDate).getTime();
      const dateB = new Date(b.lastActivityDate).getTime();
      return dateB - dateA; // Most recent first
    });
  }, [leads.length, debouncedSearch, canSeeAllLeads, currentUser?.role, currentUser?.userId]);


  // Modal functions
  const openModal = (lead: Lead) => {
    setSelectedLead(lead);
    setShowLeadModal(true);
    document.body.style.overflow = 'hidden';
  };

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showLeadModal) {
          setShowLeadModal(false);
          document.body.style.overflow = 'unset';
        }
        if (showPasswordModal) {
          setShowPasswordModal(false);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showLeadModal, showPasswordModal]);

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
        document.body.style.overflow = 'hidden';
      }

      // Clean up URL parameters
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('returnToModal');
      newUrl.searchParams.delete('leadId');
      window.history.replaceState({}, '', newUrl.toString());
    }
  }, [leads]);

  // Password protection functions using centralized PasswordContext
  const handleDeleteClick = (lead: Lead) => {
    // Check if user is already verified for this session
    const isVerified = sessionStorage.getItem('verified_rowManagement');

    if (isVerified) {
      // Execute delete operation directly without showing modal
      performSingleDelete(lead.id);
    } else {
      // Show password modal for verification
      setPendingDeleteOperation({ type: 'single', lead });
      setShowPasswordModal(true);
    }
  };

  // Clear session verification
  const clearSessionVerification = () => {
    sessionStorage.removeItem('verified_rowManagement');
    setIsSessionVerified(false);
    showToastNotification('Session verification cleared', 'info');
  };

  // Helper functions for delete operations
  const performSingleDelete = async (leadId: string, reason?: string) => {
    // Pass empty array for benefitTypes as this is a delete/forward operation from all-leads
    const result = await forwardToProcess(leadId, [], reason, 'all_leads');

    if (result.success) {
      showToastNotification(
        `Lead forwarded to Process pipeline and deleted. Case ${result.caseIds?.[0] || ''} created.`,
        'success'
      );
    } else {
      showToastNotification(`Failed to delete lead: ${result.message}`, 'error');
    }

    // Close Lead Detail Modal if it's open
    if (showLeadModal) {
      setShowLeadModal(false);
      document.body.style.overflow = 'unset';
    }
  };

  const performBulkDelete = async (leadIds: string[], reason?: string) => {
    const forwardPromises = leadIds.map(leadId =>
      forwardToProcess(leadId, [], reason, 'all_leads')
    );

    const results = await Promise.all(forwardPromises);
    const successCount = results.filter(r => r.success).length;
    const failCount = results.length - successCount;

    setSelectedLeads(new Set());

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
  };

  const handlePasswordSuccess = async (reason?: string) => {
    if (!pendingDeleteOperation) return;

    if (pendingDeleteOperation.type === 'single' && pendingDeleteOperation.lead) {
      await performSingleDelete(pendingDeleteOperation.lead.id, reason);
    } else if (pendingDeleteOperation.type === 'bulk' && pendingDeleteOperation.leadIds) {
      await performBulkDelete(pendingDeleteOperation.leadIds, reason);
    }

    setShowPasswordModal(false);
    setPendingDeleteOperation(null);

    // Update session verification state
    setIsSessionVerified(true);
  };

  const handlePasswordCancel = () => {
    setShowPasswordModal(false);
    setPendingDeleteOperation(null);
  };

  // Bulk delete functions
  const handleSelectLead = (leadId: string) => {
    const newSelected = new Set(selectedLeads);
    if (newSelected.has(leadId)) {
      newSelected.delete(leadId);
    } else {
      newSelected.add(leadId);
    }
    setSelectedLeads(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedLeads.size === allLeads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(allLeads.map(lead => lead.id)));
    }
  };

  const handleBulkDeleteClick = () => {
    if (selectedLeads.size === 0) return;

    // Check if user is already verified for this session
    const isVerified = sessionStorage.getItem('verified_rowManagement');

    if (isVerified) {
      // Execute delete operation directly without showing modal
      performBulkDelete(Array.from(selectedLeads));
    } else {
      // Show password modal for verification
      setPendingDeleteOperation({ type: 'bulk', leadIds: Array.from(selectedLeads) });
      setShowPasswordModal(true);
    }
  };

  // Bulk restore function
  const handleBulkRestoreClick = () => {
    if (selectedLeads.size === 0) return;

    // Restore all selected deleted leads
    setLeads(prev =>
      prev.map(lead =>
        selectedLeads.has(lead.id) && lead.isDeleted
          ? { ...lead, isDeleted: false }
          : lead
      )
    );

    setSelectedLeads(new Set());

    // Show success message
    alert(`${selectedLeads.size} leads have been restored successfully!`);
  };

  // Check if any selected leads are already deleted
  const hasDeletedLeads = Array.from(selectedLeads).some(leadId => {
    const lead = leads.find(l => l.id === leadId);
    return lead?.isDeleted;
  });




  // Handle lead click
  const handleLeadClick = (lead: Lead) => {
    openModal(lead);
  };

  // Handle edit lead
  const handleEditLead = (lead: Lead) => {
    // Store the lead data in localStorage for editing
    localStorage.setItem('editingLead', JSON.stringify(lead));
    // Store modal return data for ESC key functionality
    localStorage.setItem('modalReturnData', JSON.stringify({
      sourcePage: 'all-leads',
      leadId: lead.id
    }));
    // Navigate to add-lead page with a flag to indicate we're editing
    router.push(`/add-lead?mode=edit&id=${lead.id}&from=all-leads`);
  };

  // File input ref for import
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if a value is an Excel serial date (numeric)
  const isExcelDate = (value: any): boolean => {
    return typeof value === 'number' && !isNaN(value) && value > 0;
  };

  // Convert Excel serial date to readable date string in DD-MM-YYYY format
  const convertExcelDate = (value: string | number | Date | null | undefined): string => {
    const inputValue = value;
    const inputType = typeof value;

    if (process.env.NODE_ENV === 'development') {
      console.log('📅 Date conversion started:', { value: inputValue, type: inputType });
    }

    if (!value) {
      if (process.env.NODE_ENV === 'development') {
        console.log('📅 Empty value, returning empty string');
      }
      return '';
    }

    // If it's already a string, return as is
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (process.env.NODE_ENV === 'development') {
        console.log('📅 Processing string value:', trimmed);
      }

      // Check if it's already in DD-MM-YYYY format
      if (trimmed.match(/^\d{2}-\d{2}-\d{4}$/)) {
        if (process.env.NODE_ENV === 'development') {
          console.log('✅ Already in DD-MM-YYYY format:', trimmed);
        }
        return trimmed;
      } else if (trimmed.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // Convert from YYYY-MM-DD to DD-MM-YYYY
        const parts = trimmed.split('-');
        const year = parts[0];
        const month = parts[1];
        const day = parts[2];
        const converted = `${day}-${month}-${year}`;
        if (process.env.NODE_ENV === 'development') {
          console.log(`✅ Converting YYYY-MM-DD: ${trimmed} → DD-MM-YYYY: ${converted}`);
        }
        return converted;
      } else if (trimmed.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
        // Handle MM/DD/YYYY or DD/MM/YYYY format
        const parts = trimmed.split('/');
        if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
          // Assume DD/MM/YYYY format
          const day = parts[0].padStart(2, '0');
          const month = parts[1].padStart(2, '0');
          const year = parts[2];
          const converted = `${day}-${month}-${year}`;
          if (process.env.NODE_ENV === 'development') {
            console.log(`✅ Converting DD/MM/YYYY: ${trimmed} → DD-MM-YYYY: ${converted}`);
          }
          return converted;
        }
      } else {
        // Try to parse as date and convert
        const date = new Date(trimmed);
        if (!isNaN(date.getTime())) {
          const day = String(date.getDate()).padStart(2, '0');
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const year = date.getFullYear();
          const converted = `${day}-${month}-${year}`;
          if (process.env.NODE_ENV === 'development') {
            console.log(`✅ Converting parsed date: ${trimmed} → DD-MM-YYYY: ${converted}`);
          }
          return converted;
        }
        if (process.env.NODE_ENV === 'development') {
          console.warn('⚠️ Date conversion failed for string value:', trimmed);
        }
        return trimmed; // Return original if can't parse
      }
    }

    // If it's a number (Excel serial date), convert it
    if (typeof value === 'number') {
      if (process.env.NODE_ENV === 'development') {
        console.log('📅 Processing Excel serial number:', value);
      }
      // Excel serial date (days since 1900-01-01, but Excel incorrectly treats 1900 as leap year)
      const excelEpoch = new Date(1900, 0, 1);
      const date = new Date(excelEpoch.getTime() + (value - 2) * 24 * 60 * 60 * 1000);

      if (!isNaN(date.getTime())) {
        const day = date.getDate();
        const month = date.getMonth() + 1;
        const year = date.getFullYear();

        // Validate date components before formatting
        if (isNaN(day) || isNaN(month) || isNaN(year) || day < 1 || day > 31 || month < 1 || month > 12 || year < 1900) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('⚠️ Invalid date components:', { day, month, year });
          }
          return '';
        }

        const converted = `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;
        if (process.env.NODE_ENV === 'development') {
          console.log(`✅ Converting Excel serial: ${value} → DD-MM-YYYY: ${converted}`);
        }
        return converted;
      } else {
        if (process.env.NODE_ENV === 'development') {
          console.warn('⚠️ Invalid Excel serial date:', value);
        }
        return '';
      }
    }

    // If it's a Date object
    if (value instanceof Date) {
      if (process.env.NODE_ENV === 'development') {
        console.log('📅 Processing Date object:', value);
      }

      // Validate date object
      if (isNaN(value.getTime())) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('⚠️ Invalid Date object');
        }
        return '';
      }

      const day = value.getDate();
      const month = value.getMonth() + 1;
      const year = value.getFullYear();

      // Validate date components before formatting
      if (isNaN(day) || isNaN(month) || isNaN(year) || day < 1 || day > 31 || month < 1 || month > 12 || year < 1900) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('⚠️ Invalid date components:', { day, month, year });
        }
        return '';
      }

      const converted = `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;
      if (process.env.NODE_ENV === 'development') {
        console.log(`✅ Converting Date object → DD-MM-YYYY: ${converted}`);
      }
      return converted;
    }

    if (process.env.NODE_ENV === 'development') {
      console.error('❌ Date conversion failed - unsupported value type:', { value: inputValue, type: inputType });
    }
    return '';
  };

  // Set default values for required fields and validate custom fields
  const setDefaultValues = (lead: Partial<Lead>, skipValidation = false) => {
    if (!lead.status) lead.status = 'New';
    if (!lead.unitType) lead.unitType = 'New';
    if (!lead.lastActivityDate) lead.lastActivityDate = new Date().toLocaleDateString('en-GB');
    if (!lead.isDone) lead.isDone = false;
    if (!lead.isDeleted) lead.isDeleted = false;
    if (!lead.isUpdated) lead.isUpdated = false;
    if (!lead.activities) lead.activities = [];
    if (!lead.mandateStatus) lead.mandateStatus = 'Pending';
    if (!lead.documentStatus) lead.documentStatus = 'Pending Documents';
    if (!lead.mobileNumbers) lead.mobileNumbers = [];

    // Apply column-based defaults for all visible columns and validate custom fields
    const visibleColumns = getVisibleColumns();
    const validationErrors: string[] = [];

    visibleColumns.forEach(column => {
      const currentValue = (lead as any)[column.fieldKey];

      // Set default value if undefined
      if (currentValue === undefined) {
        let defaultValue = column.defaultValue;

        if (defaultValue === undefined) {
          switch (column.type) {
            case 'date':
              defaultValue = new Date().toLocaleDateString('en-GB');
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

        (lead as any)[column.fieldKey] = defaultValue;
      } else {
        // Validate existing values for custom fields (skip during import for performance)
        if (!skipValidation) {
          const validationError = validateDynamicField(column.fieldKey, currentValue, column.type, {
            required: column.required,
            maxLength: column.maxLength,
            min: column.min,
            max: column.max,
            options: column.options,
            allowPast: column.allowPast
          });

          if (validationError) {
            validationErrors.push(`${column.label}: ${validationError}`);
          }
        }
      }
    });

    // Add validation errors to lead if any
    if (validationErrors.length > 0) {
      (lead as any).validationErrors = validationErrors;
    }
  };

  // Helper function to ensure mobile number slots are properly initialized
  const ensureMobileNumberSlots = (lead: Partial<Lead>, count: number) => {
    if (!lead.mobileNumbers) {
      lead.mobileNumbers = [];
      if (process.env.NODE_ENV === 'development') {
        console.log('Initialized mobileNumbers array');
      }
    }

    while (lead.mobileNumbers.length < count) {
      lead.mobileNumbers.push({
        id: String(lead.mobileNumbers.length + 1),
        number: '',
        name: '',
        isMain: lead.mobileNumbers.length === 0
      });
      if (process.env.NODE_ENV === 'development') {
        console.log('Added slot', lead.mobileNumbers.length, 'isMain:', lead.mobileNumbers[lead.mobileNumbers.length - 1]?.isMain);
      }
    }

    // Ensure main mobile number is in slot 0 if we have one
    if (lead.mobileNumber && (!lead.mobileNumbers[0] || !lead.mobileNumbers[0].number)) {
      lead.mobileNumbers[0] = {
        id: '1',
        number: lead.mobileNumber,
        name: lead.clientName || lead.mobileNumbers[0]?.name || '',
        isMain: true
      };
      if (process.env.NODE_ENV === 'development') {
        console.log('Added main mobile number to slot 0:', lead.mobileNumbers[0]);
      }
    }
  };

  // Map header to lead field - enhanced to support custom headers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapHeaderToField = (lead: Partial<Lead>, header: string, value: any) => {
    const headerLower = header.toLowerCase().trim();
    if (process.env.NODE_ENV === 'development') {
      console.log('=== MAPPING DEBUG ===');
      console.log('Header: "' + header + '" -> "' + headerLower + '"');
      console.log('Value: "' + value + '" (type: ' + typeof value + ')');
      console.log('Value length: ' + (value ? value.toString().length : 'undefined'));
      console.log('Is empty: ' + (!value || value === '' || value === null || value === undefined));
      console.log('Processing header: ' + headerLower);
    }

    // First, try to map using dynamic field mapping (includes custom headers and columns)
    const dynamicMapping = fieldMapping;
    const fieldKey = dynamicMapping[headerLower];

    if (fieldKey) {
      if (process.env.NODE_ENV === 'development') {
        console.log('🎯 DYNAMIC MAPPING FOUND:', headerLower, '->', fieldKey);
      }

      // Get column configuration for type-specific handling
      const visibleColumns = getVisibleColumns();
      const columnConfig = visibleColumns.find(col => col.fieldKey === fieldKey);

      // Apply the value based on field type
      if (columnConfig?.type === 'date' ||
        ['connectionDate', 'lastActivityDate', 'followUpDate'].includes(fieldKey)) {
        // Handle date fields
        if (value && value !== '') {
          const dateValue = isExcelDate(value) ? convertExcelDate(value) : String(value);
          (lead as any)[fieldKey] = dateValue;
          if (process.env.NODE_ENV === 'development') {
            console.log('Mapped date field:', fieldKey, '=', dateValue);
          }
        }
      } else if (columnConfig?.type === 'number') {
        // Handle number fields
        if (value && value !== '') {
          const numValue = Number(value);
          if (!isNaN(numValue)) {
            (lead as any)[fieldKey] = numValue;
            if (process.env.NODE_ENV === 'development') {
              console.log('Mapped number field:', fieldKey, '=', numValue);
            }
          } else {
            (lead as any)[fieldKey] = String(value);
            if (process.env.NODE_ENV === 'development') {
              console.log('Mapped number field as string:', fieldKey, '=', String(value));
            }
          }
        }
      } else if (columnConfig?.type === 'phone') {
        // Handle phone fields - clean numeric input
        if (value && value !== '') {
          const phoneValue = String(value).replace(/[^0-9]/g, '');
          (lead as any)[fieldKey] = phoneValue;
          if (process.env.NODE_ENV === 'development') {
            console.log('Mapped phone field:', fieldKey, '=', phoneValue);
          }
        }
      } else if (columnConfig?.type === 'email') {
        // Handle email fields
        if (value && value !== '') {
          (lead as any)[fieldKey] = String(value).toLowerCase().trim();
          if (process.env.NODE_ENV === 'development') {
            console.log('Mapped email field:', fieldKey, '=', String(value));
          }
        }
      } else {
        // Handle other fields as strings
        (lead as any)[fieldKey] = String(value);
        if (process.env.NODE_ENV === 'development') {
          console.log('Mapped field:', fieldKey, '=', String(value));
        }
      }
      return; // Exit early if mapping found
    }

    // Try fuzzy matching if exact match not found
    const fuzzyMatch = fuzzyMatchHeader(header, dynamicMapping);
    if (fuzzyMatch) {
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 FUZZY MAPPING FOUND:', headerLower, '->', fuzzyMatch.fieldKey, `(${fuzzyMatch.matchType}, score: ${Math.round(fuzzyMatch.score * 100)}%)`);
      }

      // Get column configuration for type-specific handling
      const visibleColumns = getVisibleColumns();
      const columnConfig = visibleColumns.find(col => col.fieldKey === fuzzyMatch.fieldKey);

      // Apply the value based on field type
      if (columnConfig?.type === 'date' ||
        ['connectionDate', 'lastActivityDate', 'followUpDate'].includes(fuzzyMatch.fieldKey)) {
        // Handle date fields
        if (value && value !== '') {
          const dateValue = isExcelDate(value) ? convertExcelDate(value) : String(value);
          (lead as any)[fuzzyMatch.fieldKey] = dateValue;
          if (process.env.NODE_ENV === 'development') {
            console.log('Mapped date field (fuzzy):', fuzzyMatch.fieldKey, '=', dateValue);
          }
        }
      } else if (columnConfig?.type === 'number') {
        // Handle number fields
        if (value && value !== '') {
          const numValue = Number(value);
          if (!isNaN(numValue)) {
            (lead as any)[fuzzyMatch.fieldKey] = numValue;
            if (process.env.NODE_ENV === 'development') {
              console.log('Mapped number field (fuzzy):', fuzzyMatch.fieldKey, '=', numValue);
            }
          } else {
            (lead as any)[fuzzyMatch.fieldKey] = String(value);
            if (process.env.NODE_ENV === 'development') {
              console.log('Mapped number field as string (fuzzy):', fuzzyMatch.fieldKey, '=', String(value));
            }
          }
        }
      } else if (columnConfig?.type === 'phone') {
        // Handle phone fields - clean numeric input
        if (value && value !== '') {
          const phoneValue = String(value).replace(/[^0-9]/g, '');
          (lead as any)[fuzzyMatch.fieldKey] = phoneValue;
          if (process.env.NODE_ENV === 'development') {
            console.log('Mapped phone field (fuzzy):', fuzzyMatch.fieldKey, '=', phoneValue);
          }
        }
      } else if (columnConfig?.type === 'email') {
        // Handle email fields
        if (value && value !== '') {
          (lead as any)[fuzzyMatch.fieldKey] = String(value).toLowerCase().trim();
          if (process.env.NODE_ENV === 'development') {
            console.log('Mapped email field (fuzzy):', fuzzyMatch.fieldKey, '=', String(value));
          }
        }
      } else {
        // Handle other fields as strings
        (lead as any)[fuzzyMatch.fieldKey] = String(value);
        if (process.env.NODE_ENV === 'development') {
          console.log('Mapped field (fuzzy):', fuzzyMatch.fieldKey, '=', String(value));
        }
      }
      return; // Exit early if fuzzy mapping found
    }

    // If no dynamic mapping found, try legacy static mappings for backward compatibility
    if (process.env.NODE_ENV === 'development') {
      console.log('⚠️ No dynamic mapping found, trying legacy mappings for:', headerLower);
    }

    // Special handling for discom headers - check if header contains "discom" in any case
    if (headerLower.includes('discom')) {
      if (process.env.NODE_ENV === 'development') {
        console.log('=== DISCOM HEADER DETECTED ===');
        console.log('Original header:', header);
        console.log('Header lowercase:', headerLower);
        console.log('Value:', value);
        console.log('Value type:', typeof value);
        console.log('String value:', String(value));
      }
      lead.discom = String(value);
      if (process.env.NODE_ENV === 'development') {
        console.log('Mapped discom:', lead.discom);
        console.log('=== END DISCOM MAPPING DEBUG ===');
      }
      return; // Exit early to avoid switch statement
    }

    // Handle complex mobile number array logic that can't be easily mapped dynamically
    switch (headerLower) {
      // Main mobile number - complex array logic
      case 'mo.no':
      case 'mo.no.':
      case 'mo .no':
      case 'mo .no.':
      case 'mobile number':
      case 'mobilenumber':
      case 'mobile':
      case 'phone':
      case 'phone number':
      case 'contact phone':
      case 'telephone':
      case 'main mobile number':
        if (process.env.NODE_ENV === 'development') {
          console.log('*** MOBILE NUMBER MAPPING ***');
          console.log('Setting mobileNumber to: "' + String(value) + '"');
          console.log('Original value: "' + value + '" (type: ' + typeof value + ')');
        }
        lead.mobileNumber = String(value);
        if (process.env.NODE_ENV === 'development') {
          console.log('Lead mobileNumber after setting: "' + lead.mobileNumber + '"');
        }

        // Also populate the mobileNumbers array with the main mobile number
        if (!lead.mobileNumbers) {
          lead.mobileNumbers = [];
        }

        // Ensure we have at least one slot
        if (lead.mobileNumbers.length === 0) {
          lead.mobileNumbers.push({
            id: '1',
            number: String(value),
            name: lead.clientName || '', // Auto-populate contact name with client name
            isMain: true
          });
          if (process.env.NODE_ENV === 'development') {
            console.log('Added main mobile number to mobileNumbers array:', lead.mobileNumbers[0]);
          }
        } else {
          // Update the first slot if it exists
          lead.mobileNumbers[0] = {
            id: '1',
            number: String(value),
            name: lead.clientName || lead.mobileNumbers[0]?.name || '', // Auto-populate contact name with client name
            isMain: true
          };
          if (process.env.NODE_ENV === 'development') {
            console.log('Updated main mobile number in mobileNumbers array:', lead.mobileNumbers[0]);
          }
        }
        break;
      // Mobile Number 2 - complex array logic
      case 'mobile number 2':
      case 'mobile number2':
      case 'mobile2':
      case 'phone 2':
      case 'phone2':
      case 'mobile no 2':
      case 'mobile no. 2':
      case 'mobile no2':
      case 'contact number 2':
      case 'contact no 2':
      case 'mobile 2':
      case 'phone no 2':
      case 'phone no. 2':
      case 'phone no2':
      case 'tel 2':
      case 'tel2':
      case 'telephone 2':
      case 'telephone2':
        if (process.env.NODE_ENV === 'development') {
          console.log('*** MOBILE NUMBER 2 MAPPING ***');
          console.log('Setting mobileNumber2 to: "' + String(value) + '"');
          console.log('Current lead.mobileNumber:', lead.mobileNumber);
          console.log('Current lead.mobileNumbers:', lead.mobileNumbers);
        }

        // Use helper function to ensure proper initialization
        ensureMobileNumberSlots(lead, 2);

        // Set the second mobile number (index 1)
        lead.mobileNumbers![1] = {
          id: '2',
          number: String(value),
          name: lead.mobileNumbers![1]?.name || '',
          isMain: false
        };
        if (process.env.NODE_ENV === 'development') {
          console.log('Set mobile number 2:', lead.mobileNumbers![1]);
          console.log('Final mobileNumbers array:', lead.mobileNumbers);
        }
        break;
      // Mobile Number 3 - complex array logic
      case 'mobile number 3':
      case 'mobile number3':
      case 'mobile3':
      case 'phone 3':
      case 'phone3':
      case 'mobile no 3':
      case 'mobile no. 3':
      case 'mobile no3':
      case 'contact number 3':
      case 'contact no 3':
        if (process.env.NODE_ENV === 'development') {
          console.log('*** MOBILE NUMBER 3 MAPPING ***');
          console.log('Setting mobileNumber3 to: "' + String(value) + '"');
        }

        // Use helper function to ensure proper initialization
        ensureMobileNumberSlots(lead, 3);

        // Set the third mobile number (index 2)
        lead.mobileNumbers![2] = {
          id: '3',
          number: String(value),
          name: lead.mobileNumbers![2]?.name || '',
          isMain: false
        };
        if (process.env.NODE_ENV === 'development') {
          console.log('Set mobile number 3:', lead.mobileNumbers![2]);
        }
        break;
      // Contact Name 2 - complex array logic
      case 'contact name 2':
      case 'contact name2':
      case 'contact2':
      case 'name 2':
      case 'name2':
      case 'contact person 2':
      case 'person name 2':
      case 'contact person2':
      case 'contact 2':
      case 'person 2':
      case 'person2':
      case 'contact person name 2':
      case 'contact person name2':
      case 'person contact 2':
      case 'person contact2':
        if (process.env.NODE_ENV === 'development') {
          console.log('*** CONTACT NAME 2 MAPPING ***');
          console.log('Setting contact name 2 to: "' + String(value) + '"');
          console.log('Current lead.mobileNumber:', lead.mobileNumber);
          console.log('Current lead.mobileNumbers:', lead.mobileNumbers);
        }

        // Use helper function to ensure proper initialization
        ensureMobileNumberSlots(lead, 2);

        // Set the second contact name (index 1)
        lead.mobileNumbers![1] = {
          id: '2',
          number: lead.mobileNumbers![1]?.number || '',
          name: String(value),
          isMain: false
        };
        if (process.env.NODE_ENV === 'development') {
          console.log('Set contact name 2:', lead.mobileNumbers![1]);
          console.log('Final mobileNumbers array:', lead.mobileNumbers);
        }
        break;
      // Contact Name 3 - complex array logic
      case 'contact name 3':
      case 'contact name3':
      case 'contact3':
      case 'name 3':
      case 'name3':
      case 'contact person 3':
      case 'person name 3':
      case 'contact person3':
        if (process.env.NODE_ENV === 'development') {
          console.log('*** CONTACT NAME 3 MAPPING ***');
          console.log('Setting contact name 3 to: "' + String(value) + '"');
        }

        // Use helper function to ensure proper initialization
        ensureMobileNumberSlots(lead, 3);

        // Set the third contact name (index 2)
        lead.mobileNumbers![2] = {
          id: '3',
          number: lead.mobileNumbers![2]?.number || '',
          name: String(value),
          isMain: false
        };
        if (process.env.NODE_ENV === 'development') {
          console.log('Set contact name 3:', lead.mobileNumbers![2]);
        }
        break;
      // Status - complex mapping logic
      case 'lead status':
      case 'leadstatus':
      case 'status':
      case 'current status':
      case 'lead_status':
      case 'lead-status':
        if (process.env.NODE_ENV === 'development') {
          console.log('*** STATUS MAPPING ***');
          console.log('Status value: "' + String(value) + '"');
        }
        const statusValue = String(value).toLowerCase().trim();
        if (statusValue === 'new') {
          lead.status = 'New';
          if (process.env.NODE_ENV === 'development') {
            console.log('✅ Mapped to New');
          }
        } else if (statusValue === 'cnr') {
          lead.status = 'CNR';
          if (process.env.NODE_ENV === 'development') {
            console.log('✅ Mapped to CNR');
          }
        } else if (statusValue === 'busy') {
          lead.status = 'Busy';
          if (process.env.NODE_ENV === 'development') {
            console.log('✅ Mapped to Busy');
          }
        } else if (statusValue === 'follow-up' || statusValue === 'followup' || statusValue === 'follow up') {
          lead.status = 'Follow-up';
          if (process.env.NODE_ENV === 'development') {
            console.log('✅ Mapped to Follow-up');
          }
        } else if (statusValue === 'deal close' || statusValue === 'dealclose' || statusValue === 'deal_close') {
          lead.status = 'Deal Close';
          if (process.env.NODE_ENV === 'development') {
            console.log('✅ Mapped to Deal Close');
          }
        } else if (statusValue === 'work alloted' || statusValue === 'workalloted' || statusValue === 'work_alloted' || statusValue === 'wao') {
          lead.status = 'Work Alloted';
          if (process.env.NODE_ENV === 'development') {
            console.log(`✅ Mapped "${statusValue}" to Work Alloted (will display as WAO)`);
          }
        } else if (statusValue === 'hotlead' || statusValue === 'hot lead' || statusValue === 'hot_lead') {
          lead.status = 'Hotlead';
          if (process.env.NODE_ENV === 'development') {
            console.log('✅ Mapped to Hotlead');
          }
        } else if (statusValue === 'mandate sent' || statusValue === 'mandatesent' || statusValue === 'mandate_sent') {
          lead.status = 'Mandate Sent';
          if (process.env.NODE_ENV === 'development') {
            console.log('✅ Mapped to Mandate Sent');
          }
        } else if (statusValue === 'documentation') {
          lead.status = 'Documentation';
          if (process.env.NODE_ENV === 'development') {
            console.log('✅ Mapped to Documentation');
          }
        } else if (statusValue === 'others' || statusValue === 'other') {
          lead.status = 'Others';
          if (process.env.NODE_ENV === 'development') {
            console.log('✅ Mapped to Others');
          }
        } else {
          // Flexible mapping for variations
          if (statusValue.includes('new')) {
            lead.status = 'New';
            if (process.env.NODE_ENV === 'development') {
              console.log('✅ Flexible mapping: New');
            }
          } else if (statusValue.includes('cnr')) {
            lead.status = 'CNR';
            if (process.env.NODE_ENV === 'development') {
              console.log('✅ Flexible mapping: CNR');
            }
          } else if (statusValue.includes('busy')) {
            lead.status = 'Busy';
            if (process.env.NODE_ENV === 'development') {
              console.log('✅ Flexible mapping: Busy');
            }
          } else if (statusValue.includes('follow')) {
            lead.status = 'Follow-up';
            if (process.env.NODE_ENV === 'development') {
              console.log('✅ Flexible mapping: Follow-up');
            }
          } else if (statusValue.includes('deal') || statusValue.includes('close')) {
            lead.status = 'Deal Close';
            if (process.env.NODE_ENV === 'development') {
              console.log('✅ Flexible mapping: Deal Close');
            }
          } else if (statusValue.includes('work') || statusValue.includes('allot') || statusValue.includes('wao')) {
            lead.status = 'Work Alloted';
            if (process.env.NODE_ENV === 'development') {
              console.log(`✅ Flexible mapping: "${statusValue}" -> Work Alloted (will display as WAO)`);
            }
          } else if (statusValue.includes('hot')) {
            lead.status = 'Hotlead';
            if (process.env.NODE_ENV === 'development') {
              console.log('✅ Flexible mapping: Hotlead');
            }
          } else if (statusValue.includes('mandate')) {
            lead.status = 'Mandate Sent';
            if (process.env.NODE_ENV === 'development') {
              console.log('✅ Flexible mapping: Mandate Sent');
            }
          } else if (statusValue.includes('document')) {
            lead.status = 'Documentation';
            if (process.env.NODE_ENV === 'development') {
              console.log('✅ Flexible mapping: Documentation');
            }
          } else if (statusValue.includes('other')) {
            lead.status = 'Others';
            if (process.env.NODE_ENV === 'development') {
              console.log('✅ Flexible mapping: Others');
            }
          } else {
            lead.status = 'New'; // Default fallback
            if (process.env.NODE_ENV === 'development') {
              console.log('⚠️ Default mapping: New');
            }
          }
        }
        break;
      // Unit Type - complex mapping logic
      case 'unit type':
      case 'unittype':
      case 'unit_type':
      case 'type':
        if (process.env.NODE_ENV === 'development') {
          console.log('*** UNIT TYPE MAPPING ***');
          console.log('Unit type value: "' + String(value) + '"');
        }
        const unitTypeValue = String(value).toLowerCase().trim();
        if (unitTypeValue === 'new') {
          lead.unitType = 'New';
          if (process.env.NODE_ENV === 'development') {
            console.log('✅ Mapped to New');
          }
        } else if (unitTypeValue === 'existing') {
          lead.unitType = 'Existing';
          if (process.env.NODE_ENV === 'development') {
            console.log('✅ Mapped to Existing');
          }
        } else if (unitTypeValue === 'other' || unitTypeValue === 'others') {
          lead.unitType = 'Other';
          if (process.env.NODE_ENV === 'development') {
            console.log('✅ Mapped to Other');
          }
        } else {
          // Allow custom unit types
          lead.unitType = String(value).trim();
          if (process.env.NODE_ENV === 'development') {
            console.log('✅ Custom unit type:', lead.unitType);
          }
        }
        break;
      // Follow-up Date - complex date logic
      case 'follow-up date':
      case 'followup date':
      case 'follow_up_date':
      case 'followupdate':
      case 'next follow-up':
      case 'next followup':
      case 'next_follow_up':
      case 'nextfollowup':
      case 'follow up date':
      case 'followup':
      case 'follow-up':
      case 'next follow up':
      case 'next follow-up date':
      case 'next followup date':
      case 'next_follow_up_date':
      case 'nextfollowupdate':
      case 'follow_up':
      case 'followup_date':
      case 'next_followup':
      case 'nextfollowup_date':
        if (process.env.NODE_ENV === 'development') {
          console.log('*** FOLLOW-UP DATE MAPPING ***');
          console.log('Follow-up date value: "' + String(value) + '"');
          console.log('Follow-up date value type:', typeof value);
        }
        lead.followUpDate = convertExcelDate(value);
        if (process.env.NODE_ENV === 'development') {
          console.log('Follow-up date after setting: "' + lead.followUpDate + '"');
        }
        break;
      // Last Activity Date - complex date logic
      case 'last activity date':
      case 'lastactivitydate':
      case 'last_activity_date':
      case 'last activity':
      case 'lastactivity':
      case 'last_activity':
      case 'activity date':
      case 'activitydate':
      case 'activity_date':
      case 'last call date':
      case 'lastcalldate':
      case 'last_call_date':
      case 'last contact date':
      case 'lastcontactdate':
      case 'last_contact_date':
        if (process.env.NODE_ENV === 'development') {
          console.log('*** LAST ACTIVITY DATE MAPPING ***');
          console.log('Last activity date value: "' + String(value) + '"');
          console.log('Last activity date value type:', typeof value);
        }
        lead.lastActivityDate = convertExcelDate(value);
        if (process.env.NODE_ENV === 'development') {
          console.log('Last activity date after setting: "' + lead.lastActivityDate + '"');
        }
        break;
      // Notes - complex append logic
      case 'notes':
      case 'discussion':
      case 'last discussion':
      case 'lastdiscussion':
      case 'last_discussion':
      case 'last-discussion':
      case 'call notes':
      case 'comments':
      case 'comment':
      case 'description':
        // If notes already exist, append the new value
        if (lead.notes) {
          lead.notes = `${lead.notes} | ${String(value)}`;
        } else {
          lead.notes = String(value);
        }
        break;
      // Simple field mappings (now handled by dynamic mapping, but kept for backward compatibility)
      case 'gidc':
        lead.gidc = String(value);
        break;
      case 'gst number':
      case 'gstnumber':
      case 'gst_number':
      case 'gst':
        lead.gstNumber = String(value);
        break;
      case 'final conclusion':
      case 'finalconclusion':
      case 'final_conclusion':
      case 'conclusion':
        lead.finalConclusion = String(value);
        break;
      default:
        if (process.env.NODE_ENV === 'development') {
          console.log('⚠️ UNMAPPED HEADER: ' + headerLower);
        }
        break;
    }

    // Fallback: Check for partial matches for mobile number 2 and contact name 2
    if (headerLower.includes('mobile') && headerLower.includes('2') && !headerLower.includes('name')) {
      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 FALLBACK: Mobile Number 2 detected via partial match:', headerLower);
      }

      // Use helper function to ensure proper initialization
      ensureMobileNumberSlots(lead, 2);

      lead.mobileNumbers![1] = {
        id: '2',
        number: String(value),
        name: lead.mobileNumbers![1]?.name || '',
        isMain: false
      };
      return;
    }

    if (headerLower.includes('contact') && headerLower.includes('2') && headerLower.includes('name')) {
      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 FALLBACK: Contact Name 2 detected via partial match:', headerLower);
      }

      // Use helper function to ensure proper initialization
      ensureMobileNumberSlots(lead, 2);

      lead.mobileNumbers![1] = {
        id: '2',
        number: lead.mobileNumbers![1]?.number || '',
        name: String(value),
        isMain: false
      };
      return;
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('=== END MAPPING DEBUG ===');
    }
  };

  // Helper functions for header detection
  const isEmptyRow = (row: any[]): boolean => {
    if (!row || row.length === 0) return true;
    return row.every(cell =>
      cell === null ||
      cell === undefined ||
      cell === '' ||
      (typeof cell === 'string' && cell.trim() === '')
    );
  };


  const detectHeaderRowIndex = (rows: any[][]): number => {
    if (!rows || rows.length === 0) return 0;

    let bestIndex = 0;
    let bestScore = 0;

    // Check first 10 rows for header patterns
    const maxRowsToCheck = Math.min(10, rows.length);

    for (let i = 0; i < maxRowsToCheck; i++) {
      const row = rows[i];
      if (!row || isEmptyRow(row)) continue;

      const score = getHeaderPatternScore(row);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    if (process.env.NODE_ENV === 'development') {
      if (process.env.NODE_ENV === 'development') {
        console.log(`🔍 Detected header row at index ${bestIndex} with confidence ${Math.round((bestScore / 10) * 100)}%`);
      }
    }
    return bestIndex;
  };

  // Parse CSV file using XLSX library for robust parsing
  const parseCSV = (content: string): Partial<Lead>[] => {
    try {
      // Use XLSX library to parse CSV robustly
      const workbook = XLSX.read(content, { type: 'string' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) return [];

      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) return [];

      const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        raw: false,
        defval: ''
      });

      if (jsonData.length < 2) return [];

      // Convert to rows for header detection
      const rows = jsonData as any[][];

      // Use intelligent header detection
      const headerRowIndex = detectHeaderRowIndex(rows);
      const headers = (rows[headerRowIndex] as string[]).map(h => String(h ?? '').trim());
      const dataRows = rows.slice(headerRowIndex + 1);

      if (process.env.NODE_ENV === 'development') {
        console.log('CSV Headers (detected):', headers);
        console.log('CSV Data rows:', dataRows.length);
      }

      // Show import mapping preview for CSV
      showImportMappingPreview(headers);

      return dataRows.map((values) => {
        const lead: Partial<Lead> = {};

        headers.forEach((header, index) => {
          const value = values[index] || '';
          mapHeaderToField(lead, header, value);
        });

        // Note: setDefaultValues will be called later in handleFileImport for performance
        return lead;
      });
    } catch (error) {
      console.error('CSV parsing error:', error);
      // Fallback to simple parsing if XLSX fails
      const lines = content.split('\n').filter(line => line.trim());
      if (lines.length < 2) return [];

      const rows = lines.map(line => line.split(',').map(h => h.trim().replace(/"/g, '')));
      const headerRowIndex = detectHeaderRowIndex(rows);
      const headers = (rows[headerRowIndex] as string[]).map(h => String(h ?? '').trim());
      const dataRows = rows.slice(headerRowIndex + 1);

      return dataRows.map((values) => {
        const lead: Partial<Lead> = {};
        headers.forEach((header, index) => {
          const value = values[index] || '';
          mapHeaderToField(lead, header, value);
        });
        // Note: setDefaultValues will be called later in handleFileImport for performance
        return lead;
      });
    }
  };

  // Parse Excel file using xlsx library
  const parseExcel = async (file: File): Promise<Partial<Lead>[]> => {
    if (process.env.NODE_ENV === 'development') {
      console.log('Starting Excel parsing...');
    }

    try {
      if (process.env.NODE_ENV === 'development') {
        console.log('Starting Excel parsing with XLSX library');
      }

      return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            if (process.env.NODE_ENV === 'development') {
              console.log('File read successfully, size:', e.target?.result);
              console.log('Data converted to Uint8Array, length:', data.length);
            }

            // Validate XLSX library is loaded
            if (typeof XLSX === 'undefined') {
              throw new Error('XLSX library not loaded');
            }

            // Log XLSX version for debugging
            if (process.env.NODE_ENV === 'development') {
              console.log('📚 XLSX library version:', XLSX.version);
            }

            const workbook = XLSX.read(data, { type: 'array' });
            if (process.env.NODE_ENV === 'development') {
              console.log('Workbook read, sheet names:', workbook.SheetNames);
            }

            // Validate workbook structure
            if (!workbook.SheetNames || !Array.isArray(workbook.SheetNames) || workbook.SheetNames.length === 0) {
              throw new Error('Invalid workbook structure: no sheets found');
            }

            if (process.env.NODE_ENV === 'development') {
              console.log('📊 Sheet structure:', {
                sheetNames: workbook.SheetNames,
                sheetCount: workbook.SheetNames.length
              });
            }

            // Get the first sheet
            const sheetName = workbook.SheetNames[0];
            if (!sheetName) {
              reject(new Error('No sheets found in Excel file'));
              return;
            }
            const worksheet = workbook.Sheets[sheetName];
            if (!worksheet) {
              reject(new Error('Could not load worksheet'));
              return;
            }
            if (process.env.NODE_ENV === 'development') {
              console.log('Worksheet loaded:', sheetName);
            }

            // Convert to JSON with proper date handling
            const jsonData = XLSX.utils.sheet_to_json(worksheet, {
              header: 1,
              raw: false,
              defval: '',
              dateNF: 'DD-MM-YYYY'
            });
            if (process.env.NODE_ENV === 'development') {
              console.log('JSON data:', jsonData);
            }

            if (jsonData.length < 2) {
              reject(new Error('No data rows found in Excel file'));
              return;
            }

            // Use intelligent header detection instead of assuming row 0 is headers
            if (process.env.NODE_ENV === 'development') {
              console.log('🔍 Detecting header row...');
            }
            const headerRowIndex = detectHeaderRowIndex(jsonData as any[][]);
            const headers = (jsonData[headerRowIndex] as string[]).map(h => String(h ?? '').trim());
            const dataRows = jsonData.slice(headerRowIndex + 1);

            if (process.env.NODE_ENV === 'development') {
              console.log('📊 Detected headers:', headers);
              console.log('📊 Data starts at row:', headerRowIndex + 1);
              console.log('📊 Processing', dataRows.length, 'data rows');
            }

            // Update import statistics (commented out to avoid runtime issues)
            // setImportStats(prev => updateImportStats(prev, 'totalRows', jsonData.length));
            // setImportStats(prev => updateImportStats(prev, 'headerRowIndex', headerRowIndex));
            // setImportStats(prev => updateImportStats(prev, 'dataRowsProcessed', dataRows.length));

            // Show import mapping preview
            showImportMappingPreview(headers);

            // Set import progress
            setIsImporting(true);
            setImportProgress({ current: 0, total: dataRows.length });

            const leads = dataRows.map((row: unknown, index: number) => {
              const rowArray = row as any[];
              const lead: Partial<Lead> = {};

              // Update progress every 10 rows
              if (index % 10 === 0) {
                setImportProgress({ current: index, total: dataRows.length });
              }

              headers.forEach((header, colIndex) => {
                const value = rowArray[colIndex];
                if (value !== undefined && value !== null && value !== '') {
                  if (process.env.NODE_ENV === 'development') {
                    console.log(`Processing row ${index + 1}, header: "${header}", value: "${value}"`);

                    // Special debug for discom headers
                    if (header && header.toLowerCase().includes('discom')) {
                      console.log('=== DISCOM HEADER DEBUG ===');
                      console.log('Header:', header);
                      console.log('Value:', value);
                      console.log('Value type:', typeof value);
                      console.log('Value length:', value ? value.toString().length : 'undefined');
                      console.log('=== END DISCOM HEADER DEBUG ===');
                    }

                    // Special debug for follow-up date headers
                    if (header && (header.toLowerCase().includes('follow') || header.toLowerCase().includes('next'))) {
                      console.log('=== FOLLOW-UP DATE HEADER DEBUG ===');
                      console.log('Header:', header);
                      console.log('Value:', value);
                      console.log('Value type:', typeof value);
                      console.log('Value length:', value ? value.toString().length : 'undefined');
                      console.log('=== END FOLLOW-UP DATE HEADER DEBUG ===');
                    }

                    // Special debug for last activity date headers
                    if (header && (header.toLowerCase().includes('activity') || header.toLowerCase().includes('last'))) {
                      console.log('=== LAST ACTIVITY DATE HEADER DEBUG ===');
                      console.log('Header:', header);
                      console.log('Value:', value);
                      console.log('Value type:', typeof value);
                      console.log('Value length:', value ? value.toString().length : 'undefined');
                      console.log('=== END LAST ACTIVITY DATE HEADER DEBUG ===');
                    }
                  }

                  mapHeaderToField(lead, header, value);
                }
              });

              // Normalize date fields using convertExcelDate
              const dateFields = ['connectionDate', 'lastActivityDate', 'followUpDate'];
              dateFields.forEach(field => {
                const value = (lead as any)[field];
                if (value && typeof value === 'string') {
                  const normalizedDate = convertExcelDate(value);
                  if (normalizedDate !== value) {
                    if (process.env.NODE_ENV === 'development') {
                      console.log(`📅 Normalized ${field}: "${value}" → "${normalizedDate}"`);
                    }
                    (lead as any)[field] = normalizedDate;
                  }
                }
              });

              // Note: setDefaultValues will be called later in handleFileImport for performance
              if (process.env.NODE_ENV === 'development') {
                console.log('Processed lead:', lead);
              }
              return lead;
            });

            if (process.env.NODE_ENV === 'development') {
              console.log('All leads processed:', leads);
            }

            // Reset import progress
            setIsImporting(false);
            setImportProgress({ current: 0, total: 0 });

            resolve(leads);
          } catch (error) {
            console.error('Excel parsing error:', error);
            reject(new Error(`Error parsing Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`));
          }
        };

        reader.onerror = () => {
          console.error('FileReader error');
          reject(new Error('Failed to read file'));
        };

        if (process.env.NODE_ENV === 'development') {
          console.log('Starting file read...');
        }
        reader.readAsArrayBuffer(file);
      });
    } catch (error) {
      console.error('Failed to parse Excel file:', error);
      throw new Error('Failed to parse Excel file. Please ensure the file is a valid Excel format (.xlsx or .xls)');
    }
  };

  // Show import mapping preview
  const showImportMappingPreview = (headers: string[]) => {
    if (process.env.NODE_ENV !== 'development') {
      return; // Skip preview in production for performance
    }

    const dynamicMapping = fieldMapping;
    const visibleColumns = getVisibleColumns();

    if (process.env.NODE_ENV === 'development') {
      console.log('📊 Import Mapping Preview:');
      console.log('Excel Headers:', headers);
      console.log('Available Mappings:', Object.keys(dynamicMapping).length);
    }

    const mappingPreview = headers.map(header => {
      const headerLower = header.toLowerCase().trim();
      const mappedField = dynamicMapping[headerLower];
      const columnConfig = visibleColumns.find(col => col.fieldKey === mappedField);

      return {
        excelHeader: header,
        mappedField: mappedField || 'UNMAPPED',
        columnLabel: columnConfig?.label || 'Unknown',
        columnType: columnConfig?.type || 'text',
        isMapped: !!mappedField
      };
    });

    if (process.env.NODE_ENV === 'development') {
      console.log('📊 Mapping Preview:', mappingPreview);
    }

    // Enhanced validation for critical fields
    const criticalFields = ['clientName', 'mobileNumber', 'status'];
    const criticalMappings = criticalFields.map(field => {
      const column = visibleColumns.find(col => col.fieldKey === field);
      const mappedHeader = mappingPreview.find(m => m.mappedField === field);
      return {
        field,
        label: column?.label || field,
        isMapped: !!mappedHeader,
        mappedHeader: mappedHeader?.excelHeader || null
      };
    });

    if (process.env.NODE_ENV === 'development') {
      console.log('📊 Critical Field Mapping:', criticalMappings);
    }

    // Check for missing critical fields
    const missingCritical = criticalMappings.filter(m => !m.isMapped);
    if (missingCritical.length > 0) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('⚠️ Critical fields missing from import:', missingCritical.map(m => m.label));
      }
    }

    const mappedCount = mappingPreview.filter(m => m.isMapped).length;
    const unmappedCount = mappingPreview.filter(m => !m.isMapped).length;

    if (process.env.NODE_ENV === 'development') {
      console.log(`📊 Mapping Summary: ${mappedCount} mapped, ${unmappedCount} unmapped`);
    }

    // Enhanced suggestions for unmapped headers
    const unmappedHeaders = mappingPreview.filter(m => !m.isMapped);
    if (unmappedHeaders.length > 0) {
      const suggestions = unmappedHeaders.map(unmapped => {
        const header = unmapped.excelHeader.toLowerCase();
        const suggestions: string[] = [];

        // Fuzzy matching suggestions
        if (header.includes('client') || header.includes('name')) {
          suggestions.push('Client Name');
        }
        if (header.includes('mobile') || header.includes('phone')) {
          suggestions.push('Mobile Number');
        }
        if (header.includes('status')) {
          suggestions.push('Status');
        }
        if (header.includes('date') && header.includes('follow')) {
          suggestions.push('Follow Up Date');
        }
        if (header.includes('date') && header.includes('last')) {
          suggestions.push('Last Activity Date');
        }
        if (header.includes('kva') || header.includes('name')) {
          suggestions.push('KVA');
        }

        return {
          header: unmapped.excelHeader,
          suggestions: suggestions.length > 0 ? suggestions : ['No suggestions available']
        };
      });

      if (process.env.NODE_ENV === 'development') {
        console.log('📊 Unmapped Header Suggestions:', suggestions);
      }

      const unmappedList = unmappedHeaders.map(h => h.excelHeader).join(', ');
      const availableColumns = visibleColumns.map(col => col.label).join(', ');

      let message = `⚠️ ${unmappedCount} headers could not be mapped: ${unmappedList}`;

      if (missingCritical.length > 0) {
        message += `\n\n❌ Missing critical fields: ${missingCritical.map(m => m.label).join(', ')}`;
      }

      message += `\n\nAvailable column labels: ${availableColumns}`;

      // Add specific suggestions
      const specificSuggestions = suggestions.filter(s => s.suggestions[0] !== 'No suggestions available');
      if (specificSuggestions.length > 0) {
        message += `\n\nSuggestions:\n${specificSuggestions.map(s =>
          `• "${s.header}" → try "${s.suggestions[0]}"`
        ).join('\n')}`;
      }

      message += `\n\nConsider renaming headers to match current column labels for better import results.`;

      // Show as toast notification
      setShowToast(true);
      setToastMessage(message);
      setToastType('info');

      // Auto-hide after 10 seconds for longer message
      setTimeout(() => {
        setShowToast(false);
      }, 10000);
    }

    return mappingPreview;
  };

  // Handle Excel/CSV import
  const handleFileImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (process.env.NODE_ENV === 'development') {
      console.log('=== EXCEL IMPORT STARTED ===');
    }
    const file = event.target.files?.[0];
    if (!file) {
      if (process.env.NODE_ENV === 'development') {
        console.log('No file selected');
      }
      return;
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('File selected:', file.name, file.type, file.size);
    }

    try {
      let importedLeadsData: Partial<Lead>[] = [];

      const name = file.name.toLowerCase();
      const type = (file.type || '').toLowerCase();
      const isCSV = type === 'text/csv' || name.endsWith('.csv');
      const isExcel = name.endsWith('.xlsx') || name.endsWith('.xls') ||
        type.includes('spreadsheetml') || type === 'application/vnd.ms-excel';

      if (isCSV) {
        if (process.env.NODE_ENV === 'development') {
          console.log('Processing CSV file...');
        }
        const content = await file.text();
        importedLeadsData = parseCSV(content);
      } else if (isExcel) {
        if (process.env.NODE_ENV === 'development') {
          console.log('Processing Excel file...');
        }
        importedLeadsData = await parseExcel(file);
      } else {
        throw new Error('Unsupported file format. Please select a CSV (.csv) or Excel (.xlsx/.xls) file.');
      }

      if (process.env.NODE_ENV === 'development') {
        console.log('Parsed leads:', importedLeadsData);
      }

      // Direct import without preview modal
      if (importedLeadsData.length === 0) {
        throw new Error('No valid data found in the file.');
      }

      // Skip persistence during bulk import for performance
      // Note: Persistence skipping removed for now
      const leadsWithIds = importedLeadsData.map((lead, index) => {
        setDefaultValues(lead, true);
        return {
          ...lead,
          id: `imported-${Date.now()}-${index}`,
        };
      }) as Lead[];

      // ============================================================================
      // SIMPLE DUPLICATE DETECTION & IMPORT
      // ============================================================================
      // - If a match is found (active OR deleted): SKIP IT (duplicate)
      // - If no match is found: CREATE new lead

      // Helper: Sanitize mobile number to last 10 digits for consistent matching
      const sanitizeMobileNumber = (phone: string | undefined | null): string => {
        if (!phone) return '';
        const digits = phone.replace(/[^0-9]/g, '');
        return digits.slice(-10);
      };

      // Build lookup maps for O(1) duplicate detection
      const mobileToLeadMap = new Map<string, boolean>();
      const consumerToLeadMap = new Map<string, boolean>();

      leads.forEach(existingLead => {
        // Map by consumer number (mark as exists)
        if (existingLead.consumerNumber && existingLead.consumerNumber.trim() !== '') {
          consumerToLeadMap.set(existingLead.consumerNumber.trim().toLowerCase(), true);
        }

        // Map by sanitized mobile number
        const sanitizedMobile = sanitizeMobileNumber(existingLead.mobileNumber);
        if (sanitizedMobile.length === 10) {
          mobileToLeadMap.set(sanitizedMobile, true);
        }

        // Map additional mobile numbers
        (existingLead.mobileNumbers || []).forEach(m => {
          const sanitized = sanitizeMobileNumber(m.number);
          if (sanitized.length === 10) {
            mobileToLeadMap.set(sanitized, true);
          }
        });
      });

      if (process.env.NODE_ENV === 'development') {
        console.log(`📊 Built lookup maps: ${mobileToLeadMap.size} mobile, ${consumerToLeadMap.size} consumer`);
      }

      // Check if lead is a duplicate (exists in any form)
      const isDuplicate = (newLead: Lead): boolean => {
        // Check consumer number
        if (newLead.consumerNumber && newLead.consumerNumber.trim() !== '') {
          if (consumerToLeadMap.has(newLead.consumerNumber.trim().toLowerCase())) {
            return true;
          }
        }

        // Check main mobile number
        const newMobileSanitized = sanitizeMobileNumber(newLead.mobileNumber);
        if (newMobileSanitized.length === 10 && mobileToLeadMap.has(newMobileSanitized)) {
          return true;
        }

        // Check additional mobile numbers
        for (const m of (newLead.mobileNumbers || [])) {
          const sanitized = sanitizeMobileNumber(m.number);
          if (sanitized.length === 10 && mobileToLeadMap.has(sanitized)) {
            return true;
          }
        }

        return false;
      };

      // Process imported leads
      const leadsToCreate: Lead[] = [];
      let skippedDuplicateCount = 0;

      leadsWithIds.forEach(newLead => {
        if (isDuplicate(newLead)) {
          skippedDuplicateCount++;
          if (process.env.NODE_ENV === 'development') {
            console.log(`🚫 Skipped duplicate: ${newLead.clientName || newLead.kva || 'Unknown'}`);
          }
        } else {
          leadsToCreate.push(newLead);
        }
      });

      // Add new leads to state
      if (leadsToCreate.length > 0) {
        startTransition(() => {
          setLeads(prev => [...prev, ...leadsToCreate]);
        });
      }

      // Show toast notification
      setShowToast(true);
      if (leadsToCreate.length > 0 || skippedDuplicateCount > 0) {
        let message = `Imported ${leadsToCreate.length} leads.`;
        if (skippedDuplicateCount > 0) {
          message += ` Skipped ${skippedDuplicateCount} duplicates.`;
        }
        setToastMessage(message);
        setToastType('success');
      } else {
        setToastMessage('No new data to import.');
        setToastType('info');
      }

      // Auto-hide toast after 5 seconds
      setTimeout(() => {
        setShowToast(false);
      }, 5000);

      // Clear the file input
      event.target.value = '';
    } catch (error) {
      console.error('=== IMPORT ERROR ===');
      console.error('Import error:', error);

      // Show error notification
      setShowToast(true);
      setToastMessage(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setToastType('error');

      // Auto-hide toast after 5 seconds
      setTimeout(() => {
        setShowToast(false);
      }, 5000);
    }
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
        if (process.env.NODE_ENV === 'development') {
          console.error('❌ Invalid date format for export:', dateString);
        }
        return ''; // Return empty string if invalid
      }

      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();

      const formattedDate = `${day}-${month}-${year}`;

      // Validate the final string format
      if (!formattedDate.match(/^\d{2}-\d{2}-\d{4}$/)) {
        if (process.env.NODE_ENV === 'development') {
          console.error('❌ Invalid date format for export:', formattedDate);
        }
        return ''; // Return empty string if format is invalid
      }

      return formattedDate;
    } catch {
      if (process.env.NODE_ENV === 'development') {
        console.error('❌ Invalid date format for export:', dateString);
      }
      return ''; // Return empty string if conversion fails
    }
  };

  // Export function (copied from dashboard)
  const handleExportExcel = async () => {
    if (sessionStorage.getItem('verified_export')) {
      await performExport();
    } else {
      setShowExportPasswordModal(true);
    }
  };

  const handleExportPasswordSuccess = () => {
    setShowExportPasswordModal(false);
    performExport();
  };

  const performExport = async () => {
    try {
      // Small delay to ensure pending header edits are saved
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get filtered leads
      const leadsToExport = allLeads;

      // COMPREHENSIVE EXPORT: Include ALL lead fields, not just visible columns
      // Define all exportable fields with their labels
      const allExportFields = [
        { fieldKey: 'kva', label: 'KVA' },
        { fieldKey: 'connectionDate', label: 'Connection Date', type: 'date' },
        { fieldKey: 'consumerNumber', label: 'Consumer Number' },
        { fieldKey: 'company', label: 'Company' },
        { fieldKey: 'clientName', label: 'Client Name' },
        { fieldKey: 'discom', label: 'Discom' },
        { fieldKey: 'gidc', label: 'GIDC' },
        { fieldKey: 'gstNumber', label: 'GST Number' },
        { fieldKey: 'mobileNumber', label: 'Mobile Number' },
        { fieldKey: 'mobileNumber2', label: 'Mobile Number 2' },
        { fieldKey: 'contactName2', label: 'Contact Name 2' },
        { fieldKey: 'mobileNumber3', label: 'Mobile Number 3' },
        { fieldKey: 'contactName3', label: 'Contact Name 3' },
        { fieldKey: 'companyLocation', label: 'Company Location' },
        { fieldKey: 'unitType', label: 'Unit Type' },
        { fieldKey: 'termLoan', label: 'Term Loan' },
        { fieldKey: 'status', label: 'Status' },
        { fieldKey: 'lastActivityDate', label: 'Last Activity Date', type: 'date' },
        { fieldKey: 'followUpDate', label: 'Follow Up Date', type: 'date' },
        { fieldKey: 'notes', label: 'Last Discussion' },
        { fieldKey: 'finalConclusion', label: 'Final Conclusion' },
        { fieldKey: 'mandateStatus', label: 'Mandate Status' },
        { fieldKey: 'documentStatus', label: 'Document Status' },
      ];

      // Also add any custom columns from visible columns that aren't in the standard list
      const visibleColumns = getVisibleColumns();
      const standardFieldKeys = allExportFields.map(f => f.fieldKey);
      const customColumns = visibleColumns.filter(col => !standardFieldKeys.includes(col.fieldKey));

      // Combine standard fields with custom columns
      const allFields = [...allExportFields, ...customColumns.map(col => ({
        fieldKey: col.fieldKey,
        label: col.label,
        type: col.type
      }))];

      const headers = allFields.map(field => field.label);

      // Add logging to track export headers
      console.log('📤 Export Headers (ALL FIELDS):', headers);
      console.log('📤 Total columns:', headers.length);

      // Convert leads to Excel rows with ALL data
      const rows = leadsToExport.map(lead => {
        // Get mobile numbers and contacts
        const mobileNumbers = lead.mobileNumbers || [];
        const mainMobile = mobileNumbers.find(m => m.isMain) || mobileNumbers[0] || { number: lead.mobileNumber || '', name: '' };

        // Format main mobile number (phone number only, no contact name)
        const mainMobileDisplay = mainMobile.number || '';

        // Map data for ALL fields
        const rowData = allFields.map(field => {
          const fieldKey = field.fieldKey;
          const value = (lead as any)[fieldKey] ?? '';

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
            case 'gidc':
              return lead.gidc || '';
            case 'gstNumber':
              return lead.gstNumber || '';
            case 'mobileNumber':
              return mainMobileDisplay;
            case 'mobileNumber2':
              return mobileNumbers[1]?.number || '';
            case 'mobileNumber3':
              return mobileNumbers[2]?.number || '';
            case 'contactName2':
              return mobileNumbers[1]?.name || '';
            case 'contactName3':
              return mobileNumbers[2]?.name || '';
            case 'companyLocation':
              return lead.companyLocation || '';
            case 'unitType':
              return lead.unitType || '';
            case 'termLoan':
              return lead.termLoan || '';
            case 'status':
              // Export full status value for round-trip compatibility
              return lead.status || 'New';
            case 'lastActivityDate':
              return formatDateForExport(lead.lastActivityDate || '');
            case 'followUpDate':
              return formatDateForExport(lead.followUpDate || '');
            case 'notes':
              return lead.notes || '';
            case 'finalConclusion':
              return lead.finalConclusion || '';
            case 'mandateStatus':
              return lead.mandateStatus || '';
            case 'documentStatus':
              return lead.documentStatus || '';
            default:
              // Handle custom columns
              if (field.type === 'date') {
                return formatDateForExport(value);
              }
              return value || '';
          }
        });

        return rowData;
      });

      console.log('📤 Exporting', leadsToExport.length, 'leads with', headers.length, 'columns (ALL FIELDS)');

      // Create workbook and worksheet
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(wb, ws, 'Leads');

      // Generate Excel file and download
      XLSX.writeFile(wb, `leads-export-all-${new Date().toISOString().split('T')[0]}.xlsx`);

      // Show success notification
      setShowToast(true);
      setToastMessage(`Successfully exported ${leadsToExport.length} leads with ALL fields (${headers.length} columns)`);
      setToastType('success');

      // Auto-hide toast after 5 seconds
      setTimeout(() => {
        setShowToast(false);
      }, 5000);
    } catch (error) {
      console.error('Export error:', error);
      setShowToast(true);
      setToastMessage('Failed to export leads. Please try again.');
      setToastType('error');

      // Auto-hide toast after 5 seconds
      setTimeout(() => {
        setShowToast(false);
      }, 5000);
    }
  };



  return (
    <div className="container mx-auto px-1 py-1">
      {/* Import Progress Indicator */}
      {isImporting && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-blue-500 text-white px-6 py-3 rounded-lg shadow-lg">
          <div className="flex items-center space-x-3">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            <span>Importing leads... {importProgress.current} / {importProgress.total}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-800 rounded-lg mb-2 p-2">
        {/* Title Section */}
        <div className="text-center mb-1">
          <h1 className="text-lg md:text-xl font-bold text-white mb-1">
            All Leads
          </h1>
          <p className="text-blue-100 text-xs font-medium">
            Administrative Access Only
          </p>
        </div>

        {/* Stats and Action Buttons */}
        <div className="flex flex-col lg:flex-row items-center justify-between space-y-1 lg:space-y-0 lg:space-x-1">
          {/* Total Leads Stat Box - Enhanced */}
          <div className="relative group">
            {/* Animated Border Glow */}
            <div className="absolute -inset-1 bg-gradient-to-r from-emerald-400 via-blue-500 to-purple-500 rounded-2xl blur-sm opacity-0 group-hover:opacity-25 transition-all duration-600 animate-pulse"></div>

            {/* Main Container */}
            <div className="relative bg-white border-2 border-blue-200 rounded-lg px-3 py-2 shadow-lg hover:shadow-xl transition-all duration-300 hover:border-blue-300 overflow-hidden">
              {/* Animated Background Waves */}
              <div className="absolute inset-0 bg-gradient-to-r from-blue-50/40 via-emerald-50/20 to-purple-50/40 opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
              <div className="absolute inset-0 bg-gradient-to-br from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

              {/* Floating Dots */}
              <div className="absolute top-4 right-4 w-1 h-1 bg-emerald-400 rounded-full opacity-0 group-hover:opacity-70 animate-bounce animation-delay-1000"></div>
              <div className="absolute bottom-4 left-4 w-1 h-1 bg-blue-400 rounded-full opacity-0 group-hover:opacity-70 animate-bounce animation-delay-2000"></div>
              <div className="absolute top-1/2 right-6 w-0.5 h-0.5 bg-purple-400 rounded-full opacity-0 group-hover:opacity-70 animate-bounce animation-delay-3000"></div>

              {/* Content */}
              <div className="relative z-10 text-center">
                <div className="text-lg md:text-xl font-bold text-blue-600 mb-1 group-hover:text-blue-700 transition-colors duration-300 group-hover:scale-105 transform transition-transform duration-300">
                  {allLeads.length}
                </div>
                <div className="text-black text-xs font-semibold uppercase tracking-wide group-hover:text-black transition-colors duration-300">
                  Total Leads
                </div>
              </div>

              {/* Top and Bottom Accent Lines */}
              <div className="absolute top-0 left-1/2 right-1/2 h-0.5 bg-gradient-to-r from-emerald-400 to-blue-500 transform -translate-x-1/2 scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-center"></div>
              <div className="absolute bottom-0 left-1/2 right-1/2 h-0.5 bg-gradient-to-r from-blue-500 to-purple-500 transform -translate-x-1/2 scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-center"></div>

              {/* Side Accent Lines */}
              <div className="absolute top-1/2 left-0 w-0.5 h-8 bg-gradient-to-b from-emerald-400 to-blue-500 transform -translate-y-1/2 scale-y-0 group-hover:scale-y-100 transition-transform duration-500 origin-center"></div>
              <div className="absolute top-1/2 right-0 w-0.5 h-8 bg-gradient-to-b from-blue-500 to-purple-500 transform -translate-y-1/2 scale-y-0 group-hover:scale-y-100 transition-transform duration-500 origin-center"></div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap justify-center items-center space-x-1">
            {/* Import Section */}
            <div className="flex items-center space-x-2">
              {/* Import Button */}
              <div className="relative">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.xlsm,.csv"
                  onChange={handleFileImport}
                  className="hidden"
                  id="file-import"
                />
                <label
                  htmlFor="file-import"
                  className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded cursor-pointer flex items-center space-x-1 text-xs font-semibold transition-colors shadow-lg"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                  </svg>
                  <span>Import Leads</span>
                </label>
              </div>
            </div>

            {/* Export Button */}
            <button
              onClick={handleExportExcel}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded flex items-center space-x-1 text-xs font-semibold transition-colors shadow-lg"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Export All Leads</span>
            </button>


          </div>
        </div>
      </div>



      {/* Leads Table */}
      <div className="bg-white rounded-lg shadow-md mb-2">
        <div className="p-1">
          <div className="flex justify-between items-center mb-1">
            <div className="flex items-center space-x-1">
              <h2 className="text-sm font-semibold text-black">All Leads</h2>

              {/* Search Input */}
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-2 flex items-center pointer-events-none">
                  <svg className="h-3 w-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  id="search"
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search leads..."
                  className="block w-40 pl-6 pr-8 py-1 border border-gray-300 rounded leading-5 bg-white placeholder:text-black focus:outline-none focus:placeholder:text-black focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-xs text-black"
                />
                {isSearching && (
                  <div className="absolute right-8 top-1/2 transform -translate-y-1/2">
                    <div className="animate-spin h-3 w-3 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                  </div>
                )}
                {searchInput && (
                  <button
                    onClick={() => setSearchInput('')}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-black"
                    title="Clear search"
                  >
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={handleSelectAll}
                className="px-3 py-1 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                {selectedLeads.size === allLeads.length ? 'Deselect All' : 'Select All'}
              </button>
              {selectedLeads.size > 0 && (
                <>
                  <button
                    onClick={handleBulkDeleteClick}
                    className="px-3 py-1 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
                  >
                    Delete Selected ({selectedLeads.size})
                  </button>
                  {isSessionVerified && (
                    <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full flex items-center gap-1">
                      🔓 Session Verified
                    </span>
                  )}
                  {isSessionVerified && (
                    <button
                      onClick={clearSessionVerification}
                      className="px-2 py-1 text-xs bg-gray-500 text-white rounded-md hover:bg-gray-600"
                      title="Clear session verification"
                    >
                      Clear Session
                    </button>
                  )}
                  {hasDeletedLeads && (
                    <button
                      onClick={handleBulkRestoreClick}
                      className="px-3 py-1 text-sm bg-green-600 text-white rounded-md hover:bg-green-700"
                    >
                      Restore Selected ({selectedLeads.size})
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          <EditableTable
            leads={allLeads}
            onLeadClick={handleLeadClick}
            selectedLeads={selectedLeads}
            onLeadSelection={handleSelectLead}
            showActions={false}
            emptyMessage="No leads found in the system"
            editable={true}
            headerEditable={true}
            onCellUpdate={handleCellUpdate}
            validationErrors={validationErrors}
            onColumnAdded={(column) => {
              // Handle column addition
              if (process.env.NODE_ENV === 'development') {
                console.log('Column added:', column);
              }
            }}
            onColumnDeleted={(fieldKey) => {
              // Handle column deletion
              if (process.env.NODE_ENV === 'development') {
                console.log('Column deleted:', fieldKey);
              }
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

      {/* Conflict Resolution Modal */}
      {conflictState && (
        <ConflictResolutionModal
          isOpen={true}
          entityType={conflictState.entityType as any}
          conflicts={conflictState.conflicts}
          optimisticEntity={conflictState.optimistic}
          serverEntity={conflictState.server}
          onResolve={handleConflictResolve}
          onCancel={cancelConflict}
        />
      )}

      {/* Lead Detail Modal */}
      {showLeadModal && (
        <Suspense fallback={<LoadingSpinner text="Loading..." />}>
          <LeadDetailModal
            isOpen={showLeadModal}
            onClose={() => {
              setShowLeadModal(false);
              document.body.style.overflow = 'unset';
            }}
            lead={selectedLead!}
            onEdit={handleEditLead}
            onDelete={handleDeleteClick}
          />
        </Suspense>
      )}

      {/* Password Protection Modal */}
      {showPasswordModal && (
        <Suspense fallback={<LoadingSpinner text="Loading..." />}>
          <PasswordModal
            isOpen={showPasswordModal}
            onClose={handlePasswordCancel}
            operation="rowManagement"
            onSuccess={(reason) => handlePasswordSuccess(reason)}
            title={pendingDeleteOperation?.type === 'bulk' ? 'Delete Multiple Leads' : 'Delete Lead'}
            description={
              pendingDeleteOperation?.type === 'bulk'
                ? `You are about to permanently delete ${pendingDeleteOperation.leadIds?.length || 0} leads from the system. This action cannot be undone.`
                : `You are about to permanently delete this lead from the system: ${pendingDeleteOperation?.lead?.clientName} - ${pendingDeleteOperation?.lead?.company}. This action cannot be undone.`
            }
            captureReason={true}
          />
        </Suspense>
      )}

      {/* Export Password Protection Modal */}
      {showExportPasswordModal && (
        <Suspense fallback={<LoadingSpinner text="Loading..." />}>
          <PasswordModal
            isOpen={showExportPasswordModal}
            onClose={() => setShowExportPasswordModal(false)}
            operation="export"
            onSuccess={handleExportPasswordSuccess}
            title="Export All Leads"
            description="You are about to export all leads data to an Excel file. This will include all lead information currently visible in the table."
          />
        </Suspense>
      )}

      {/* Toast Notification */}
      {showToast && (
        <div className="fixed top-4 right-4 z-50">
          <div className={`px-4 py-2 rounded-md shadow-lg ${toastType === 'success' ? 'bg-green-500 text-white' :
            toastType === 'error' ? 'bg-red-500 text-white' :
              'bg-blue-500 text-white'
            }`}>
            {toastMessage}
          </div>
        </div>
      )}

    </div>
  );
}

