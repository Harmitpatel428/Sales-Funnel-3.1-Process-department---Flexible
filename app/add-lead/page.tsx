'use client';

import React, { useState, FormEvent, ChangeEvent, useEffect } from 'react';
import { useLeads } from '../context/LeadContext';
import type { Lead, MobileNumber } from '../types/shared';
import { useColumns } from '../context/ColumnContext';
import { useRouter } from 'next/navigation';
import { useValidation } from '../hooks/useValidation';

export default function AddLeadPage() {
  const router = useRouter();
  const { addLead, updateLead, leads, addActivity } = useLeads();
  const { getVisibleColumns } = useColumns();
  const { validateLeadField, validateMobileNumbers, validateCustomUnitType } = useValidation();

  // Define permanent fields that should always appear in the form
  const permanentFields = ['mobileNumbers', 'mobileNumber', 'unitType', 'status', 'followUpDate', 'companyLocation', 'notes', 'lastActivityDate'];

  // Track where the user came from
  const [cameFromHome, setCameFromHome] = useState(false);
  const [sourcePage, setSourcePage] = useState<string>('');

  const [formData, setFormData] = useState({
    mobileNumber: '', // Keep for backward compatibility
    mobileNumbers: [
      { id: '1', number: '', name: '', isMain: true },
      { id: '2', number: '', name: '', isMain: false },
      { id: '3', number: '', name: '', isMain: false }
    ] as MobileNumber[],
    companyLocation: '',
    unitType: 'New' as string,
    status: 'New' as Lead['status'],
    lastActivityDate: '', // Will be auto-set to current date on submission
    followUpDate: '',
    finalConclusion: '',
    notes: '',
  });

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('info');
  const [errors, setErrors] = useState<Partial<Record<keyof typeof formData, string>>>({});
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [customUnitType, setCustomUnitType] = useState<string>('');
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [customFields, setCustomFields] = useState<Record<string, any>>({});
  const sanitizePhone = (num?: string) => (num ? num.replace(/[^0-9]/g, '').slice(0, 10) : '');
  const buildMobileNumbersFromLead = (leadData: any): MobileNumber[] => {
    const mobileNumbers: MobileNumber[] = [
      { id: '1', number: '', name: '', isMain: true },
      { id: '2', number: '', name: '', isMain: false },
      { id: '3', number: '', name: '', isMain: false }
    ];

    if (leadData?.mobileNumbers && Array.isArray(leadData.mobileNumbers)) {
      leadData.mobileNumbers.forEach((mobile: { id?: string; number?: string; name?: string; isMain?: boolean }, index: number) => {
        if (index < 3) {
          mobileNumbers[index] = {
            id: mobile.id || String(index + 1),
            number: sanitizePhone(mobile.number),
            name: mobile.name || '',
            isMain: mobile.isMain || index === 0
          };
        }
      });
    }

    const fallbackCandidates = [
      sanitizePhone(leadData?.mobileNumber),
      sanitizePhone(leadData?.phoneNumber),
      sanitizePhone(leadData?.phone_no),
      sanitizePhone(leadData?.phoneNo),
      sanitizePhone(leadData?.phone),
      sanitizePhone(leadData?.primaryPhone),
      sanitizePhone(leadData?.primary_phone),
      sanitizePhone(leadData?.Phone),
      sanitizePhone(leadData?.Mobile),
      sanitizePhone(leadData?.contactNumber),
      sanitizePhone(leadData?.contactNo)
    ].filter(Boolean);

    fallbackCandidates.forEach((num) => {
      const nextSlot = mobileNumbers.findIndex(m => !m.number);
      if (nextSlot !== -1) {
        mobileNumbers[nextSlot] = {
          ...mobileNumbers[nextSlot],
          number: num,
          isMain: nextSlot === 0 ? true : mobileNumbers[nextSlot].isMain
        };
      }
    });

    if (!mobileNumbers.some(m => m.isMain)) {
      mobileNumbers[0].isMain = true;
    }

    return mobileNumbers;
  };

  // Extract address from notes helper function
  const extractAddressFromNotes = (notes: string) => {
    if (!notes || !notes.includes('Address:')) {
      return { address: '', cleanNotes: notes };
    }

    // More comprehensive regex to catch different address formats
    const addressMatch = notes.match(/Address:\s*(.+?)(?:\s*\||\s*$)/i);
    if (addressMatch && addressMatch[1]) {
      const address = addressMatch[1].trim();
      // Remove the entire address line including "Address:" prefix
      let cleanNotes = notes.replace(/Address:\s*.+?(?:\s*\||\s*$)/i, '').trim();
      // Remove any trailing pipes or extra whitespace
      cleanNotes = cleanNotes.replace(/\|\s*$/, '').replace(/\s+$/, '').trim();
      return { address, cleanNotes };
    }

    return { address: '', cleanNotes: notes };
  };





  // Show toast notification
  const showToastNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);

    // Auto-hide after 4 seconds
    setTimeout(() => {
      setShowToast(false);
    }, 4000);
  };

  // Check if we're in edit mode and load lead data
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const mode = searchParams.get('mode');
    const from = searchParams.get('from');
    const tab = searchParams.get('tab');
    const id = searchParams.get('id');

    console.log('🔍 Add-lead page params:', { mode, from, tab, id, leadsCount: leads.length });

    // Check if user came from home page
    if (from === 'home') {
      setCameFromHome(true);
    }

    // Store source page for navigation back
    if (from) {
      setSourcePage(from);
    }

    // Store tab information for proper navigation back
    if (tab) {
      localStorage.setItem('returnTab', tab);
    }

    if (mode === 'edit') {
      console.log('🔍 Edit mode detected, looking for lead data...');
      const storedLead = localStorage.getItem('editingLead');
      console.log('🔍 Stored lead in localStorage:', storedLead ? 'exists' : 'not found');

      if (storedLead) {
        try {
          const leadData = JSON.parse(storedLead);
          setIsEditMode(true);
          setEditingLeadId(leadData.id);
          // Extract address from notes if it exists
          const { address, cleanNotes } = extractAddressFromNotes(leadData.notes || '');

          // Handle mobile numbers - convert old format to new format if needed
          const mobileNumbers: MobileNumber[] = buildMobileNumbersFromLead(leadData);

          if (process.env.NODE_ENV === 'development') {
            console.log('Mobile numbers being set:', mobileNumbers); // Debug log
            console.log('Lead data discom:', leadData.discom); // Debug log for discom
          }

          // Determine primary mobile number with all known key variants to hydrate the legacy field
          const primaryMobileNumber = mobileNumbers.find(m => m.isMain && m.number)?.number
            || sanitizePhone(leadData.mobileNumber)
            || sanitizePhone(leadData.phoneNumber)
            || sanitizePhone(leadData.phone_no)
            || sanitizePhone(leadData.phoneNo)
            || sanitizePhone(leadData.phone)
            || sanitizePhone(leadData.primaryPhone)
            || sanitizePhone(leadData.primary_phone)
            || sanitizePhone(leadData.Phone)
            || sanitizePhone(leadData.Mobile)
            || sanitizePhone(leadData.contactNumber)
            || sanitizePhone(leadData.contactNo)
            || '';

          // Handle custom unit type for editing
          const unitType = leadData.unitType || 'New';
          const isCustomUnitType = !['New', 'Existing', 'Other'].includes(unitType);

          setFormData({
            mobileNumber: primaryMobileNumber, // Keep for backward compatibility
            mobileNumbers: mobileNumbers,
            companyLocation: leadData.companyLocation || address, // Use existing or extracted address
            unitType: isCustomUnitType ? 'Other' : unitType,
            status: leadData.status || 'New',
            lastActivityDate: leadData.lastActivityDate || '', // Keep existing or blank
            followUpDate: leadData.followUpDate || '',
            finalConclusion: leadData.finalConclusion || '',
            notes: cleanNotes || '', // Use clean notes without address
          });

          // Set custom unit type if it's a custom value
          if (isCustomUnitType) {
            setCustomUnitType(unitType);
          }

          // Load custom fields from lead data
          const visibleColumns = getVisibleColumns();
          const customColumns = visibleColumns.filter(col => !permanentFields.includes(col.fieldKey));
          const customFieldValues: Record<string, any> = {};

          customColumns.forEach(column => {
            if (leadData[column.fieldKey as keyof Lead] !== undefined) {
              customFieldValues[column.fieldKey] = leadData[column.fieldKey as keyof Lead];
            }
          });

          setCustomFields(customFieldValues);
        } catch (error) {
          console.error('Error parsing stored lead data:', error);
        }
      } else if (id && leads.length > 0) {
        console.log('🔍 No stored lead, but found ID in URL, searching leads...', id);
        const leadData = leads.find(lead => lead.id === id);
        console.log('🔍 Found lead by ID:', leadData ? 'yes' : 'no');

        if (leadData) {
          console.log('🔍 Setting up edit mode with lead from context...');
          setIsEditMode(true);
          setEditingLeadId(leadData.id);
          // Extract address from notes if it exists
          const { address, cleanNotes } = extractAddressFromNotes(leadData.notes || '');

          // Handle mobile numbers - convert old format to new format if needed
          const mobileNumbers: MobileNumber[] = buildMobileNumbersFromLead(leadData);

          if (process.env.NODE_ENV === 'development') {
            console.log('Mobile numbers being set:', mobileNumbers); // Debug log
            console.log('Lead data discom:', leadData.discom); // Debug log for discom
          }

          // Handle custom unit type for editing
          const unitType = leadData.unitType || 'New';
          const isCustomUnitType = !['New', 'Existing', 'Other'].includes(unitType);

          setFormData({
            mobileNumber: leadData.mobileNumber || '', // Keep for backward compatibility
            mobileNumbers: mobileNumbers,
            companyLocation: leadData.companyLocation || address, // Use existing or extracted address
            unitType: isCustomUnitType ? 'Other' : unitType,
            status: leadData.status || 'New',
            lastActivityDate: leadData.lastActivityDate || '', // Keep existing or blank
            followUpDate: leadData.followUpDate || '',
            finalConclusion: leadData.finalConclusion || '',
            notes: cleanNotes || '', // Use clean notes without address
          });

          // Set custom unit type if it's a custom value
          if (isCustomUnitType) {
            setCustomUnitType(unitType);
          }

          // Load custom fields from lead data
          const visibleColumns = getVisibleColumns();
          const customColumns = visibleColumns.filter(col => !permanentFields.includes(col.fieldKey));
          const customFieldValues: Record<string, any> = {};

          customColumns.forEach(column => {
            if (leadData[column.fieldKey as keyof Lead] !== undefined) {
              customFieldValues[column.fieldKey] = leadData[column.fieldKey as keyof Lead];
            }
          });

          setCustomFields(customFieldValues);
          console.log('🔍 Edit mode setup complete with lead from context');
        }
      } else {
        console.log('🔍 No lead data found - neither in localStorage nor by ID');
      }
    }

    setIsHydrated(true);
  }, [leads]);

  // Auto-detect client name when leads are loaded and first mobile number is complete
  useEffect(() => {
    if (leads.length > 0 && formData.mobileNumbers[0]?.number?.length === 10 && !customFields.clientName?.trim()) {
      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 useEffect: Attempting auto-detection for mobile:', formData.mobileNumbers[0].number);
      }

      const existingLead = leads.find(lead => {
        // Check main mobile number (backward compatibility)
        if (lead.mobileNumber && lead.mobileNumber.trim() === formData.mobileNumbers[0]?.number) {
          if (process.env.NODE_ENV === 'development') {
            console.log('✅ useEffect: Found match in main mobile number:', lead.clientName);
          }
          return true;
        }

        // Check mobile numbers array
        if (lead.mobileNumbers && Array.isArray(lead.mobileNumbers)) {
          const hasMatch = lead.mobileNumbers.some(m =>
            m.number && m.number.trim() === formData.mobileNumbers[0]?.number
          );
          if (hasMatch) {
            if (process.env.NODE_ENV === 'development') {
              console.log('✅ useEffect: Found match in mobile numbers array:', lead.clientName);
            }
            return true;
          }
        }

        return false;
      });

      if (existingLead) {
        if (process.env.NODE_ENV === 'development') {
          console.log('🎉 useEffect: Auto-populating client name:', existingLead.clientName);
        }
        setCustomFields(prev => ({
          ...prev,
          clientName: existingLead.clientName
        }));
      } else {
        if (process.env.NODE_ENV === 'development') {
          console.log('❌ useEffect: No matching lead found for mobile:', formData.mobileNumbers[0].number);
        }
      }
    }
  }, [leads, formData.mobileNumbers[0]?.number, customFields.clientName]);

  // Handle ESC key to close/cancel form
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [cameFromHome, sourcePage, isEditMode]); // Include dependencies that handleCancel uses

  // Debug logging for mobile numbers display
  useEffect(() => {
    if (isEditMode && process.env.NODE_ENV === 'development') {
      console.log('Mobile numbers in formData:', formData.mobileNumbers);
      console.log('Mobile numbers display check:', formData.mobileNumbers.map(m => ({ id: m.id, number: m.number, name: m.name })));
    }
  }, [formData.mobileNumbers, isEditMode]);

  // Force mobile number loading fix
  useEffect(() => {
    if (isEditMode && editingLeadId) {
      const storedLead = localStorage.getItem('editingLead');
      if (storedLead) {
        try {
          const leadData = JSON.parse(storedLead);
          console.log('🔍 FORCE LOADING MOBILE NUMBERS:');
          console.log('🔍 leadData.mobileNumbers:', leadData.mobileNumbers);
          console.log('🔍 leadData.mobileNumber:', leadData.mobileNumber);

          // Check if mobile numbers are empty and try to load them
          const hasEmptyNumbers = formData.mobileNumbers.every(m => !m.number || m.number.trim() === '');

          if (hasEmptyNumbers) {
            console.log('🔍 Mobile numbers are empty, attempting to reload...');

            const newMobileNumbers: MobileNumber[] = [
              { id: '1', number: '', name: '', isMain: true },
              { id: '2', number: '', name: '', isMain: false },
              { id: '3', number: '', name: '', isMain: false }
            ];

            if (leadData.mobileNumbers && Array.isArray(leadData.mobileNumbers) && leadData.mobileNumbers.length > 0) {
              console.log('🔍 Reloading from mobileNumbers array');
              leadData.mobileNumbers.forEach((mobile: any, index: number) => {
                if (index < 3 && mobile && mobile.number) {
                  newMobileNumbers[index] = {
                    id: mobile.id || String(index + 1),
                    number: mobile.number || '',
                    name: mobile.name || '',
                    isMain: mobile.isMain || (index === 0)
                  };
                }
              });
            } else if (leadData.mobileNumber && leadData.mobileNumber.trim() !== '') {
              console.log('🔍 Reloading from mobileNumber field');
              newMobileNumbers[0] = {
                id: '1',
                number: leadData.mobileNumber.trim(),
                name: leadData.clientName || '',
                isMain: true
              };
            }

            console.log('🔍 New mobile numbers:', newMobileNumbers);

            // Only update if we found actual numbers
            const hasNumbers = newMobileNumbers.some(m => m.number && m.number.trim() !== '');
            if (hasNumbers) {
              console.log('🔍 Updating formData with mobile numbers');
              setFormData(prev => ({
                ...prev,
                mobileNumbers: newMobileNumbers
              }));
            }
          }
        } catch (error) {
          console.error('Error in mobile number force loading:', error);
        }
      }
    }
  }, [isEditMode, editingLeadId, formData.mobileNumbers]);

  // Generate UUID function
  const generateId = (): string => {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    // Fallback UUID generation
    return 'id-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  };

  // Form validation using validation hook
  const validateForm = (): boolean => {
    const newErrors: Partial<Record<keyof typeof formData, string>> = {};

    // Create a temporary lead object for validation
    const tempLead: Lead = {
      id: '',
      kva: '', // Will be validated from custom fields
      consumerNumber: '', // Will be validated from custom fields
      company: '', // Will be validated from custom fields
      clientName: '', // Will be validated from custom fields
      connectionDate: '', // Will be validated from custom fields
      followUpDate: formData.followUpDate,
      lastActivityDate: formData.lastActivityDate,
      notes: formData.notes,
      status: formData.status,
      unitType: formData.unitType,
      mobileNumber: '',
      mobileNumbers: [],
      isDone: false,
      isDeleted: false,
      isUpdated: false
    };

    // Validate permanent fields using the validation hook
    const permanentFieldsToValidate: (keyof typeof formData)[] = [
      'followUpDate', 'notes'
    ];

    permanentFieldsToValidate.forEach(field => {
      const error = validateLeadField(field as keyof Lead, formData[field], tempLead);
      if (error) {
        newErrors[field] = error;
      }
    });

    // Validate mobile numbers
    const mobileErrors = validateMobileNumbers(formData.mobileNumbers);
    Object.assign(newErrors, mobileErrors);

    // Validate custom unit type
    const unitTypeError = validateCustomUnitType(formData.unitType, customUnitType);
    if (unitTypeError) {
      newErrors.unitType = unitTypeError;
    }

    // Validate custom fields based on column configuration
    const visibleColumns = getVisibleColumns();
    const customColumns = visibleColumns.filter(col => !permanentFields.includes(col.fieldKey));

    customColumns.forEach(column => {
      if (column.required) {
        const value = customFields[column.fieldKey];
        if (!value || (typeof value === 'string' && !value.trim())) {
          newErrors[`custom_${column.fieldKey}` as keyof typeof formData] = `${column.label} is required`;
        }
      }
    });
    // Statuses that do NOT require follow-up date and conclusion: WAO (Work Alloted) and Others ONLY
    const statusesExemptFromFollowUp = ['Work Alloted', 'Others'];

    // Require follow-up date for ALL statuses EXCEPT Work Alloted and Others
    if (!statusesExemptFromFollowUp.includes(formData.status) && (!formData.followUpDate || !formData.followUpDate.trim())) {
      newErrors.followUpDate = 'Next Follow-up Date is required';
    }

    // Require conclusion/notes for ALL statuses EXCEPT Work Alloted and Others
    if (!statusesExemptFromFollowUp.includes(formData.status) && (!formData.notes || !formData.notes.trim())) {
      newErrors.notes = 'Last Discussion is required';
    }

    // Clear any errors for exempt statuses
    if (statusesExemptFromFollowUp.includes(formData.status)) {
      delete newErrors.followUpDate;
      delete newErrors.notes;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Enforce follow-up date requirement reactively - required for ALL statuses EXCEPT WAO and Others
  useEffect(() => {
    const statusesExemptFromFollowUp = ['Work Alloted', 'Others'];

    setErrors(prev => {
      const updated = { ...prev };

      // If status is exempt (WAO or Others), clear any follow-up errors
      if (statusesExemptFromFollowUp.includes(formData.status)) {
        if (updated.followUpDate) delete updated.followUpDate;
        if (updated.notes) delete updated.notes;
      } else {
        // All other statuses require follow-up date
        if (!formData.followUpDate || !formData.followUpDate.trim()) {
          updated.followUpDate = 'Next Follow-up Date is required';
        } else {
          delete updated.followUpDate;
        }
      }

      return updated;
    });
  }, [formData.status, formData.followUpDate]);

  // Handle mobile number changes - only allow numeric input with max 10 digits
  const handleMobileNumberChange = (index: number, value: string) => {
    // Only allow numeric characters (0-9) and limit to 10 digits
    const numericValue = value.replace(/[^0-9]/g, '').slice(0, 10);

    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Mobile number change:', { index, value, numericValue, leadsCount: leads.length });
    }

    setFormData(prev => {
      let updatedMobileNumbers = prev.mobileNumbers.map((mobile, i) =>
        i === index ? { ...mobile, number: numericValue } : mobile
      );

      // Auto-detect client name from first mobile number if it's complete (10 digits)
      if (index === 0 && numericValue.length === 10 && !customFields.clientName?.trim()) {
        if (process.env.NODE_ENV === 'development') {
          console.log('🎯 Auto-detection triggered for mobile:', numericValue);
          console.log('📊 Available leads:', leads.length);
        }

        // Try to find existing lead with this mobile number
        const existingLead = leads.find(lead => {
          // Check main mobile number (backward compatibility)
          if (lead.mobileNumber && lead.mobileNumber.trim() === numericValue) {
            if (process.env.NODE_ENV === 'development') {
              console.log('✅ Found match in main mobile number:', lead.clientName);
            }
            return true;
          }

          // Check mobile numbers array
          if (lead.mobileNumbers && Array.isArray(lead.mobileNumbers)) {
            const hasMatch = lead.mobileNumbers.some(m =>
              m.number && m.number.trim() === numericValue
            );
            if (hasMatch) {
              if (process.env.NODE_ENV === 'development') {
                console.log('✅ Found match in mobile numbers array:', lead.clientName);
              }
              return true;
            }
          }

          return false;
        });

        if (existingLead) {
          if (process.env.NODE_ENV === 'development') {
            console.log('🎉 Auto-populating client name:', existingLead.clientName);
          }

          // Also auto-populate the first mobile number's name if it's empty
          if (updatedMobileNumbers[0] && !updatedMobileNumbers[0].name.trim()) {
            updatedMobileNumbers = updatedMobileNumbers.map((mobile, i) =>
              i === 0 ? { ...mobile, name: existingLead.clientName } : mobile
            );
          }
        } else {
          if (process.env.NODE_ENV === 'development') {
            console.log('❌ No matching lead found for mobile:', numericValue);
          }
        }
      }

      return {
        ...prev,
        mobileNumbers: updatedMobileNumbers
      };
    });

    // Update custom fields if client name was auto-detected
    if (index === 0 && numericValue.length === 10 && !customFields.clientName?.trim()) {
      const existingLead = leads.find(lead => {
        if (lead.mobileNumber && lead.mobileNumber.trim() === numericValue) {
          return true;
        }
        if (lead.mobileNumbers && Array.isArray(lead.mobileNumbers)) {
          return lead.mobileNumbers.some(m =>
            m.number && m.number.trim() === numericValue
          );
        }
        return false;
      });

      if (existingLead) {
        setCustomFields(prev => ({
          ...prev,
          clientName: existingLead.clientName
        }));
      }
    }

    // Clear error for this field
    const errorKey = `mobileNumber_${index}` as keyof typeof formData;
    if (errors[errorKey]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[errorKey];
        return newErrors;
      });
    }
  };

  // Handle mobile number name changes
  const handleMobileNameChange = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      mobileNumbers: prev.mobileNumbers.map((mobile, i) =>
        i === index ? { ...mobile, name: value } : mobile
      )
    }));
  };

  // Handle custom field change
  const handleCustomFieldChange = (fieldKey: string, value: any) => {
    // Get column configuration for validation
    const visibleColumns = getVisibleColumns();
    const columnConfig = visibleColumns.find(col => col.fieldKey === fieldKey);

    // Basic validation based on column type
    let validatedValue = value;
    if (columnConfig) {
      if (columnConfig.type === 'number' && value !== '') {
        validatedValue = parseFloat(value) || 0;
      } else if (columnConfig.type === 'phone' && value !== '') {
        // Ensure phone numbers are numeric only
        validatedValue = value.replace(/[^0-9]/g, '').slice(0, 10);
      } else if (columnConfig.type === 'email' && value !== '') {
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          console.warn(`Invalid email format for ${fieldKey}: ${value}`);
        }
      }
    }

    setCustomFields(prev => ({
      ...prev,
      [fieldKey]: validatedValue
    }));
  };

  // Handle main mobile number selection
  const handleMainMobileNumberChange = (index: number) => {
    setFormData(prev => ({
      ...prev,
      mobileNumbers: prev.mobileNumbers.map((mobile, i) => ({
        ...mobile,
        isMain: i === index
      }))
    }));
  };



  // Handle input changes
  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ): void => {
    const { name, value } = e.target;

    // If notes are being changed, automatically extract address
    if (name === 'notes') {
      const { address, cleanNotes } = extractAddressFromNotes(value);

      // Auto-capitalize the first letter of the notes
      const capitalizedNotes = cleanNotes.charAt(0).toUpperCase() + cleanNotes.slice(1);

      setFormData(prev => ({
        ...prev,
        [name]: capitalizedNotes, // Use capitalized clean notes without address
        companyLocation: address || prev.companyLocation // Set address if found, otherwise keep existing
      }));
    } else {
      setFormData(prev => {
        const updatedFormData = {
          ...prev,
          [name]: value
        };

        // Auto-populate first mobile number's name when client name is entered
        if (name === 'clientName' && value.trim() && prev.mobileNumbers && prev.mobileNumbers[0] && !prev.mobileNumbers[0].name.trim()) {
          updatedFormData.mobileNumbers = prev.mobileNumbers.map((mobile, index) =>
            index === 0 ? { ...mobile, name: value.trim() } : mobile
          );
        }

        // Clear custom unit type when unit type changes away from "Other"
        if (name === 'unitType' && value !== 'Other') {
          setCustomUnitType('');
        }

        return updatedFormData;
      });
    }

    // Clear error for this field
    if (errors[name as keyof typeof formData]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name as keyof typeof formData];
        return newErrors;
      });
    }
  };


  // Handle form submission
  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Always set Last Activity Date to current date on form submission
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      const currentDate = day + '-' + month + '-' + year;

      if (isEditMode && editingLeadId) {
        // Get main mobile number for backward compatibility
        const mainMobileNumber = formData.mobileNumbers.find(mobile => mobile.isMain)?.number || formData.mobileNumbers[0]?.number || '';

        // Prevent overwrite during submit - exclude mobileNumber and companyLocation from customFields
        const { mobileNumber, companyLocation, ...restCustom } = customFields;

        // Update existing lead with all current columns (permanent + custom)
        const updatedLead: Lead = {
          id: editingLeadId,
          kva: '', // Will be set from custom fields
          connectionDate: '', // Will be set from custom fields
          consumerNumber: '', // Will be set from custom fields
          company: '', // Will be set from custom fields
          clientName: '', // Will be set from custom fields
          discom: '', // Will be set from custom fields
          gidc: '', // Will be set from custom fields
          gstNumber: '', // Will be set from custom fields
          mobileNumber: mainMobileNumber, // Keep for backward compatibility
          mobileNumbers: formData.mobileNumbers,
          companyLocation: formData.companyLocation,
          unitType: formData.unitType === 'Other' ? customUnitType : formData.unitType,
          status: formData.status,
          lastActivityDate: currentDate, // Always update to current date
          followUpDate: formData.status === 'Work Alloted' ? '' : formData.followUpDate,
          finalConclusion: formData.finalConclusion,
          notes: formData.notes,
          isDone: false,
          isDeleted: false,
          isUpdated: false,
          mandateStatus: 'Pending',
          documentStatus: formData.status === 'Mandate Sent' ? 'Signed Mandate' :
            formData.status === 'Documentation' ? 'Pending Documents' : 'Pending Documents',
          // Include custom field values (excluding mobileNumber and companyLocation)
          ...restCustom
        };

        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        updateLead(updatedLead);

        // Log lead edit activity
        addActivity(editingLeadId, 'Lead information updated', {
          activityType: 'edit'
        });

        // Clear stored editing data
        localStorage.removeItem('editingLead');

        // Check if we came from a modal and should return to it
        const modalReturnData = localStorage.getItem('modalReturnData');
        if (modalReturnData) {
          try {
            const { sourcePage: modalSourcePage, tab } = JSON.parse(modalReturnData);
            // Navigate back to the specific source page without reopening modal
            const routeMap: { [key: string]: string } = {
              'documentation': '/follow-up-mandate?tab=pending',
              'mandate-sent': '/follow-up-mandate?tab=signed',
              'due-today': '/due-today',
              'upcoming': '/upcoming',
              'all-leads': '/all-leads',
              'dashboard': '/dashboard'
            };

            // Handle tab-specific navigation for due-today
            let targetRoute = routeMap[modalSourcePage] || '/dashboard';
            if (modalSourcePage === 'due-today' && tab) {
              targetRoute = `/due-today?tab=${tab}`;
            }

            router.push(targetRoute);
            localStorage.removeItem('modalReturnData');
            return;
          } catch (error) {
            console.error('Error parsing modal return data:', error);
            localStorage.removeItem('modalReturnData');
          }
        }

        // Navigate back to appropriate page
        if (cameFromHome) {
          router.push('/');
        } else if (sourcePage) {
          // Navigate back to the specific source page with proper route mapping
          const routeMap: { [key: string]: string } = {
            'documentation': '/follow-up-mandate?tab=pending',
            'mandate-sent': '/follow-up-mandate?tab=signed',
            'due-today': '/due-today',
            'upcoming': '/upcoming',
            'all-leads': '/all-leads',
            'dashboard': '/dashboard'
          };

          // Check if we have tab information for due-today
          const returnTab = localStorage.getItem('returnTab');
          let targetRoute = routeMap[sourcePage] || '/dashboard';

          if (sourcePage === 'due-today' && returnTab) {
            targetRoute = `/due-today?tab=${returnTab}`;
            localStorage.removeItem('returnTab'); // Clean up after use
          }

          // Show notification if follow-up date was cleared due to Work Alloted status
          if (formData.status === 'Work Alloted' && formData.followUpDate && formData.followUpDate.trim() !== '') {
            showToastNotification('Lead saved. Follow-up date was cleared because status is set to WAO.', 'info');
          }

          router.push(targetRoute);
        } else {
          // Add a flag to indicate successful update
          localStorage.setItem('leadUpdated', 'true');

          // Show notification if follow-up date was cleared due to Work Alloted status
          if (formData.status === 'Work Alloted' && formData.followUpDate && formData.followUpDate.trim() !== '') {
            showToastNotification('Lead saved. Follow-up date was cleared because status is set to WAO.', 'info');
          }

          router.push('/dashboard');
        }
      } else {
        // Add new lead
        const leadId = generateId();

        // Auto-populate contact name ONLY for the first mobile number (index 0) if no contact name is provided
        const updatedMobileNumbers = formData.mobileNumbers.map((mobile, index) => {
          // ONLY apply to the first mobile number (index 0) - regardless of isMain status
          if (index === 0 && mobile.number && mobile.number.trim() !== '' && !mobile.name && customFields.clientName) {
            return { ...mobile, name: customFields.clientName };
          }
          // For all other mobile numbers (index 1, 2, etc.), keep them exactly as they are
          return mobile;
        });

        // Get main mobile number for backward compatibility
        const mainMobileNumber = updatedMobileNumbers.find(mobile => mobile.isMain)?.number || updatedMobileNumbers[0]?.number || '';

        // Prevent overwrite during submit - exclude mobileNumber and companyLocation from customFields
        const { mobileNumber, companyLocation, ...restCustom } = customFields;

        // Create lead with all current columns (permanent + custom)
        const newLead: Lead = {
          id: leadId,
          kva: '', // Will be set from custom fields
          connectionDate: '', // Will be set from custom fields
          consumerNumber: '', // Will be set from custom fields
          company: '', // Will be set from custom fields
          clientName: '', // Will be set from custom fields
          discom: '', // Will be set from custom fields
          gidc: '', // Will be set from custom fields
          gstNumber: '', // Will be set from custom fields
          mobileNumber: mainMobileNumber, // Keep for backward compatibility
          mobileNumbers: updatedMobileNumbers,
          companyLocation: formData.companyLocation,
          unitType: formData.unitType === 'Other' ? customUnitType : formData.unitType,
          status: formData.status,
          lastActivityDate: currentDate, // Always set to current date
          followUpDate: formData.status === 'Work Alloted' ? '' : formData.followUpDate,
          finalConclusion: formData.finalConclusion,
          notes: formData.notes,
          isDone: false,
          isDeleted: false,
          isUpdated: false,
          mandateStatus: 'Pending',
          documentStatus: formData.status === 'Mandate Sent' ? 'Signed Mandate' :
            formData.status === 'Documentation' ? 'Pending Documents' : 'Pending Documents',
          activities: [{
            id: generateId(),
            leadId: leadId,
            description: 'Lead created',
            timestamp: new Date().toISOString(),
            activityType: 'created' as const,
            employeeName: 'Unknown'
          }],
          // Include custom field values (excluding mobileNumber and companyLocation)
          ...restCustom
        };

        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Get current column configuration to ensure all fields have defaults
        const visibleColumns = getVisibleColumns();

        addLead(newLead, visibleColumns);

        // Log lead creation activity
        addActivity(newLead.id, 'Lead created', {
          activityType: 'created'
        });

        // Set flag to notify dashboard of successful lead addition
        localStorage.setItem('leadAdded', 'true');

        // Reset form after successful submission
        setFormData({
          mobileNumber: '', // Keep for backward compatibility
          mobileNumbers: [
            { id: '1', number: '', name: '', isMain: true },
            { id: '2', number: '', name: '', isMain: false },
            { id: '3', number: '', name: '', isMain: false }
          ],
          companyLocation: '',
          unitType: 'New',
          status: 'New',
          lastActivityDate: '', // Will be auto-set to current date on submission
          followUpDate: '',
          finalConclusion: '',
          notes: '',
        });

        // Reset custom fields
        setCustomFields({});

        // Navigate back to appropriate page
        if (cameFromHome) {
          router.push('/');
        } else if (sourcePage) {
          // Navigate back to the specific source page with proper route mapping
          const routeMap: { [key: string]: string } = {
            'documentation': '/follow-up-mandate?tab=pending',
            'mandate-sent': '/follow-up-mandate?tab=signed',
            'due-today': '/due-today',
            'upcoming': '/upcoming',
            'all-leads': '/all-leads',
            'dashboard': '/dashboard'
          };

          // Check if we have tab information for due-today
          const returnTab = localStorage.getItem('returnTab');
          let targetRoute = routeMap[sourcePage] || '/dashboard';

          if (sourcePage === 'due-today' && returnTab) {
            targetRoute = `/due-today?tab=${returnTab}`;
            localStorage.removeItem('returnTab'); // Clean up after use
          }

          // Show notification if follow-up date was cleared due to Work Alloted status
          if (formData.status === 'Work Alloted' && formData.followUpDate && formData.followUpDate.trim() !== '') {
            showToastNotification('Lead saved. Follow-up date was cleared because status is set to WAO.', 'info');
          }

          router.push(targetRoute);
        } else {
          // Show notification if follow-up date was cleared due to Work Alloted status
          if (formData.status === 'Work Alloted' && formData.followUpDate && formData.followUpDate.trim() !== '') {
            showToastNotification('Lead saved. Follow-up date was cleared because status is set to WAO.', 'info');
          }

          router.push('/dashboard');
        }
      }

    } catch (error) {
      console.error('Error saving lead:', error);
      alert('Error saving lead. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = (): void => {
    // Clear stored editing data if in edit mode
    if (isEditMode) {
      localStorage.removeItem('editingLead');
    }

    // Check if we came from a modal and should return to it
    const modalReturnData = localStorage.getItem('modalReturnData');
    if (modalReturnData) {
      try {
        const { sourcePage: modalSourcePage, tab } = JSON.parse(modalReturnData);
        // Navigate back to the specific source page without reopening modal
        const routeMap: { [key: string]: string } = {
          'documentation': '/follow-up-mandate?tab=pending',
          'mandate-sent': '/follow-up-mandate?tab=signed',
          'due-today': '/due-today',
          'upcoming': '/upcoming',
          'all-leads': '/all-leads',
          'dashboard': '/dashboard'
        };

        // Handle tab-specific navigation for due-today
        let targetRoute = routeMap[modalSourcePage] || '/dashboard';
        if (modalSourcePage === 'due-today' && tab) {
          targetRoute = `/due-today?tab=${tab}`;
        }

        router.push(targetRoute);
        localStorage.removeItem('modalReturnData');
        return;
      } catch (error) {
        console.error('Error parsing modal return data:', error);
        localStorage.removeItem('modalReturnData');
      }
    }

    // Navigate back to appropriate page (original logic)
    if (cameFromHome) {
      router.push('/');
    } else if (sourcePage) {
      // Navigate back to the specific source page with proper route mapping
      const routeMap: { [key: string]: string } = {
        'documentation': '/follow-up-mandate?tab=pending',
        'mandate-sent': '/follow-up-mandate?tab=signed',
        'due-today': '/due-today',
        'upcoming': '/upcoming',
        'all-leads': '/all-leads',
        'dashboard': '/dashboard'
      };
      const targetRoute = routeMap[sourcePage] || '/dashboard';
      router.push(targetRoute);
    } else {
      router.push('/dashboard');
    }
  };

  // Show loading state during hydration
  if (!isHydrated) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="flex items-center justify-center min-h-96">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
          </div>
        </div>
      </div>
    );
  }

  // Debug log to show current form data
  if (process.env.NODE_ENV === 'development') {
    console.log('Current form data mobile numbers:', formData.mobileNumbers);
    console.log('Available leads for auto-detection:', leads.length);
  }

  // Manual trigger for auto-detection (for first mobile number only)
  const triggerAutoDetection = () => {
    console.log('🔧 Auto-Detect button clicked!');
    console.log('📱 First mobile number:', formData.mobileNumbers[0]?.number);
    console.log('📊 Available leads:', leads.length);

    // Check if first mobile number exists and is complete
    const firstMobileNumber = formData.mobileNumbers[0]?.number?.trim();

    if (!firstMobileNumber) {
      console.log('❌ No mobile number entered in first contact box');
      return;
    }

    if (firstMobileNumber.length !== 10) {
      console.log('❌ Mobile number is not complete (10 digits required)');
      return;
    }

    console.log('🔍 Searching for mobile number:', firstMobileNumber);

    // Search through all leads for matching mobile number
    const existingLead = leads.find(lead => {
      console.log('🔍 Checking lead:', lead.clientName, 'with mobile:', lead.mobileNumber);

      // Check main mobile number (backward compatibility)
      if (lead.mobileNumber && lead.mobileNumber.trim() === firstMobileNumber) {
        console.log('✅ Found match in main mobile number:', lead.clientName);
        return true;
      }

      // Check mobile numbers array
      if (lead.mobileNumbers && Array.isArray(lead.mobileNumbers)) {
        const hasMatch = lead.mobileNumbers.some(m => {
          console.log('🔍 Checking mobile in array:', m.number);
          return m.number && m.number.trim() === firstMobileNumber;
        });
        if (hasMatch) {
          console.log('✅ Found match in mobile numbers array:', lead.clientName);
          return true;
        }
      }

      return false;
    });

    if (existingLead) {
      console.log('🎉 Auto-populating client name:', existingLead.clientName);
      setFormData(prev => ({
        ...prev,
        clientName: existingLead.clientName
      }));

      // Also auto-populate the first mobile number's name if it's empty
      if (formData.mobileNumbers[0] && !formData.mobileNumbers[0].name.trim()) {
        setFormData(prev => ({
          ...prev,
          mobileNumbers: prev.mobileNumbers.map((mobile, index) =>
            index === 0 ? { ...mobile, name: existingLead.clientName } : mobile
          )
        }));
      }

      console.log('✅ Client name auto-detected:', existingLead.clientName);
    } else {
      console.log('❌ No matching lead found for mobile:', firstMobileNumber);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-1">
      <div className="bg-white rounded-lg shadow-lg p-2">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-lg font-bold text-black">
            {isEditMode ? 'Edit Lead' : 'Add New Lead'}
          </h1>
          <button
            type="button"
            onClick={handleCancel}
            className="text-gray-600 hover:text-gray-800 transition-colors duration-200"
            aria-label="Go back"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-2 pb-2" noValidate>
          {/* Basic Information Section */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-black border-b border-gray-200 pb-1">
              Basic Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {/* Mobile Numbers Section */}
              <div className="md:col-span-2 space-y-2">
                <label className="block text-[11px] font-medium text-black">
                  Mobile Numbers
                </label>
                <div className="space-y-1">
                  {formData.mobileNumbers.map((mobile, index) => (
                    <div key={`mobile-${index}-${mobile.id}`} className="space-y-1">
                      <div className="flex items-center space-x-1">
                        <div className="flex-1">
                          <input
                            type="text"
                            value={mobile.name}
                            onChange={(e) => handleMobileNameChange(index, e.target.value)}
                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-200 text-black"
                            placeholder={`Contact ${index + 1}`}
                            disabled={isSubmitting}
                          />
                        </div>
                        <div className="flex-1">
                          <input
                            type="text"
                            value={mobile?.number || ''}
                            onChange={(e) => handleMobileNumberChange(index, e.target.value)}
                            className={`w-full px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-200 text-black ${errors[`mobileNumber_${index}` as keyof typeof formData] ? 'border-red-500 bg-red-50' : 'border-gray-300'
                              }`}
                            placeholder={`Mobile ${index + 1}`}
                            disabled={isSubmitting}
                            pattern="[0-9]*"
                            inputMode="numeric"
                            data-mobile-index={index}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleMainMobileNumberChange(index)}
                          disabled={isSubmitting}
                          className={`flex items-center space-x-1 px-1 py-1 text-xs rounded border transition-all duration-200 ${mobile.isMain
                            ? 'border-purple-500 bg-purple-50 text-purple-700'
                            : 'border-gray-300 bg-white text-gray-600 hover:border-purple-300 hover:bg-purple-25'
                            }`}
                        >
                          <div className={`w-3 h-3 rounded-full border flex items-center justify-center ${mobile.isMain ? 'border-purple-500 bg-purple-500' : 'border-gray-400'
                            }`}>
                            {mobile.isMain && (
                              <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
                            )}
                          </div>
                          <span className="font-medium">
                            {mobile.isMain ? 'Main' : 'Main'}
                          </span>
                        </button>
                        {index === 0 && (
                          <button
                            type="button"
                            onClick={triggerAutoDetection}
                            className="px-2 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors duration-200"
                            disabled={isSubmitting}
                          >
                            Auto-Detect
                          </button>
                        )}
                      </div>
                      {errors[`mobileNumber_${index}` as keyof typeof formData] && (
                        <p className="text-xs text-red-600 flex items-center">
                          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          {errors[`mobileNumber_${index}` as keyof typeof formData]}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
                {errors.mobileNumbers && (
                  <p className="text-xs text-red-600 flex items-center">
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {errors.mobileNumbers}
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <label htmlFor="companyLocation" className="block text-[11px] font-medium text-black">
                  Address
                </label>
                <input
                  type="text"
                  id="companyLocation"
                  name="companyLocation"
                  value={formData.companyLocation}
                  onChange={handleChange}
                  className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-200 text-black text-xs placeholder:text-black"
                  placeholder="Enter address"
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="unitType" className="block text-[11px] font-medium text-black">
                  Unit Type <span className="text-red-500">*</span>
                </label>
                <select
                  id="unitType"
                  name="unitType"
                  value={formData.unitType}
                  onChange={handleChange}
                  required
                  className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-200 text-black text-xs placeholder:text-black"
                  disabled={isSubmitting}
                >
                  <option value="New">New</option>
                  <option value="Existing">Existing</option>
                  <option value="Other">Other</option>
                </select>
                {formData.unitType === 'Other' && (
                  <input
                    type="text"
                    placeholder="Enter custom unit type..."
                    value={customUnitType}
                    onChange={(e) => setCustomUnitType(e.target.value)}
                    className={`w-full px-2 py-1 border rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-200 text-black text-xs mt-1 ${errors.unitType ? 'border-red-500 bg-red-50' : 'border-gray-300'
                      }`}
                    disabled={isSubmitting}
                    required
                  />
                )}
                {errors.unitType && (
                  <p className="text-red-500 text-xs mt-1">{errors.unitType}</p>
                )}
              </div>

              <div className="space-y-1">
                <label htmlFor="status" className="block text-[11px] font-medium text-black">
                  Lead Status <span className="text-red-500">*</span>
                </label>
                <select
                  id="status"
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  required
                  className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-200 text-black text-xs placeholder:text-black"
                  disabled={isSubmitting}
                >
                  <option value="New">New</option>
                  <option value="Fresh Lead">FL1 (Fresh Lead)</option>
                  <option value="CNR">CNR</option>
                  <option value="Busy">Busy</option>
                  <option value="Follow-up">Follow-up</option>
                  <option value="Deal Close">Deal Close</option>
                  <option value="Work Alloted">WAO</option>
                  <option value="Hotlead">Hotlead</option>
                  <option value="Mandate Sent">Mandate Sent</option>
                  <option value="Documentation">Documentation</option>
                  <option value="WOA">WOA (Waiting On Approval)</option>
                  <option value="Others">Others</option>
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="lastActivityDate" className="block text-[11px] font-medium text-black">
                  Last Activity Date
                </label>
                <div className="relative">
                  <input
                    type="date"
                    id="lastActivityDate"
                    name="lastActivityDate"
                    value={formData.lastActivityDate ? (() => {
                      // Convert DD-MM-YYYY to YYYY-MM-DD for date input
                      const [day, month, year] = formData.lastActivityDate.split('-');
                      return `${year}-${month}-${day}`;
                    })() : ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        // Convert YYYY-MM-DD to DD-MM-YYYY
                        const [year, month, day] = e.target.value.split('-');
                        const formattedDate = `${day}-${month}-${year}`;
                        setFormData(prev => ({
                          ...prev,
                          lastActivityDate: formattedDate
                        }));
                      } else {
                        // Handle clear button - set lastActivityDate to empty string
                        setFormData(prev => ({
                          ...prev,
                          lastActivityDate: ''
                        }));
                      }
                    }}
                    className={`w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-200 text-black text-xs placeholder:text-black ${isEditMode ? 'bg-gray-100 cursor-not-allowed' : ''
                      }`}
                    disabled={isSubmitting || isEditMode}
                    readOnly={isEditMode}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label htmlFor="followUpDate" className="block text-[11px] font-medium text-black">
                  Next Follow-up Date
                  {['Follow-up', 'Hotlead', 'Mandate Sent', 'Documentation', 'Meeting Requested', 'Work Confirmation Pending', 'WOA'].includes(formData.status) && (
                    <span className="text-red-500">*</span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type="date"
                    id="followUpDate"
                    name="followUpDate"
                    value={formData.followUpDate ? (() => {
                      // Convert DD-MM-YYYY to YYYY-MM-DD for date input
                      const [day, month, year] = formData.followUpDate.split('-');
                      return `${year}-${month}-${day}`;
                    })() : ''}
                    onChange={(e) => {
                      if (e.target.value) {
                        // Convert YYYY-MM-DD to DD-MM-YYYY
                        const [year, month, day] = e.target.value.split('-');
                        const formattedDate = `${day}-${month}-${year}`;
                        setFormData(prev => ({
                          ...prev,
                          followUpDate: formattedDate
                        }));
                      } else {
                        // Handle clear button - set followUpDate to empty string
                        setFormData(prev => ({
                          ...prev,
                          followUpDate: ''
                        }));
                      }
                      // Clear error if exists
                      if (errors.followUpDate) {
                        setErrors(prev => {
                          const newErrors = { ...prev };
                          delete newErrors.followUpDate;
                          return newErrors;
                        });
                      }
                    }}
                    min={new Date().toISOString().split('T')[0]}
                    className={`w-full px-2 py-1 border rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-200 text-black text-xs placeholder:text-black ${errors.followUpDate ? 'border-red-500 bg-red-50' : 'border-gray-300'
                      }`}
                    disabled={isSubmitting}
                    required={formData.status === 'WOA'}
                  />
                </div>
                {errors.followUpDate && (
                  <p className="text-xs text-red-600 flex items-center">
                    <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {errors.followUpDate}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="notes" className="block text-[11px] font-medium text-black">
              Last Discussion
              {['Follow-up', 'Hotlead', 'Mandate Sent', 'Documentation', 'Meeting Requested', 'Work Confirmation Pending'].includes(formData.status) && (
                <span className="text-red-500">*</span>
              )}
            </label>
            <textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={2}
              className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-200 resize-vertical text-black text-xs placeholder:text-black"
              placeholder="Enter details about the last discussion with this lead"
              disabled={isSubmitting}
            />
            {errors.notes && (
              <p className="text-xs text-red-600 flex items-center">
                <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {errors.notes}
              </p>
            )}
          </div>

          {/* Dynamic Custom Fields Section */}
          {(() => {
            const visibleColumns = getVisibleColumns();
            const customColumns = visibleColumns.filter(col => !permanentFields.includes(col.fieldKey));

            if (customColumns.length === 0) return null;

            return (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-black border-b border-gray-200 pb-1">
                  Additional Fields
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {customColumns.map((column) => (
                    <div key={column.fieldKey} className="space-y-1">
                      <label htmlFor={column.fieldKey} className="block text-[11px] font-medium text-black">
                        {column.label}
                        {column.required && <span className="text-red-500">*</span>}
                      </label>

                      {column.type === 'text' && (
                        <input
                          type="text"
                          id={column.fieldKey}
                          value={customFields[column.fieldKey] || ''}
                          onChange={(e) => handleCustomFieldChange(column.fieldKey, e.target.value)}
                          className={`w-full px-2 py-1 border rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-200 text-black text-xs placeholder:text-black ${errors[`custom_${column.fieldKey}` as keyof typeof formData] ? 'border-red-500 bg-red-50' : 'border-gray-300'
                            }`}
                          placeholder={`Enter ${column.label.toLowerCase()}`}
                          disabled={isSubmitting}
                        />
                      )}

                      {column.type === 'date' && (
                        <input
                          type="date"
                          id={column.fieldKey}
                          value={customFields[column.fieldKey] ? (() => {
                            // Convert DD-MM-YYYY to YYYY-MM-DD for date input
                            const dateStr = customFields[column.fieldKey];
                            if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
                              const [day, month, year] = dateStr.split('-');
                              return `${year}-${month}-${day}`;
                            }
                            return dateStr;
                          })() : ''}
                          onChange={(e) => {
                            if (e.target.value) {
                              // Convert YYYY-MM-DD to DD-MM-YYYY
                              const [year, month, day] = e.target.value.split('-');
                              const formattedDate = `${day}-${month}-${year}`;
                              handleCustomFieldChange(column.fieldKey, formattedDate);
                            } else {
                              handleCustomFieldChange(column.fieldKey, '');
                            }
                          }}
                          className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-200 text-black text-xs placeholder:text-black"
                          disabled={isSubmitting}
                        />
                      )}

                      {column.type === 'select' && (
                        <select
                          id={column.fieldKey}
                          value={customFields[column.fieldKey] || ''}
                          onChange={(e) => handleCustomFieldChange(column.fieldKey, e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-200 text-black text-xs placeholder:text-black"
                          disabled={isSubmitting}
                        >
                          <option value="">Select {column.label}</option>
                          {column.options?.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      )}

                      {column.type === 'number' && (
                        <input
                          type="number"
                          id={column.fieldKey}
                          value={customFields[column.fieldKey] || ''}
                          onChange={(e) => handleCustomFieldChange(column.fieldKey, e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-200 text-black text-xs placeholder:text-black"
                          placeholder={`Enter ${column.label.toLowerCase()}`}
                          disabled={isSubmitting}
                        />
                      )}

                      {column.type === 'email' && (
                        <input
                          type="email"
                          id={column.fieldKey}
                          value={customFields[column.fieldKey] || ''}
                          onChange={(e) => handleCustomFieldChange(column.fieldKey, e.target.value)}
                          className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-200 text-black text-xs placeholder:text-black"
                          placeholder={`Enter ${column.label.toLowerCase()}`}
                          disabled={isSubmitting}
                        />
                      )}

                      {column.type === 'phone' && (
                        <input
                          type="tel"
                          id={column.fieldKey}
                          value={customFields[column.fieldKey] || ''}
                          onChange={(e) => {
                            // Only allow numeric input for phone
                            const numericValue = e.target.value.replace(/[^0-9]/g, '').slice(0, 10);
                            handleCustomFieldChange(column.fieldKey, numericValue);
                          }}
                          className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-200 text-black text-xs placeholder:text-black"
                          placeholder={`Enter ${column.label.toLowerCase()}`}
                          disabled={isSubmitting}
                        />
                      )}

                      {/* Error display for custom fields */}
                      {errors[`custom_${column.fieldKey}` as keyof typeof formData] && (
                        <p className="text-xs text-red-600 flex items-center">
                          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          {errors[`custom_${column.fieldKey}` as keyof typeof formData]}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Form Actions */}
          <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-gray-200">
            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex-1 sm:flex-none sm:px-4 py-2 rounded font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 text-sm ${isSubmitting
                ? 'bg-gray-400 cursor-not-allowed text-white'
                : 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg hover:shadow-xl transform hover:-translate-y-0.5'
                }`}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {isEditMode ? 'Updating Lead...' : 'Adding Lead...'}
                </span>
              ) : (
                isEditMode ? 'Update Lead' : 'Add Lead'
              )}
            </button>

            <button
              type="button"
              onClick={handleCancel}
              disabled={isSubmitting}
              className="flex-1 sm:flex-none sm:px-4 py-2 border border-gray-300 rounded text-black font-medium hover:bg-gray-50 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>

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
