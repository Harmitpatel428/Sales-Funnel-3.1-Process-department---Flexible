'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import type { Lead } from '../types/shared';
import { useColumns } from '../context/ColumnContext';
import { useCases } from '../context/CaseContext';
import { useUsers } from '../context/UserContext';
import { useLeads } from '../context/LeadContext';
import QuickBenefitModal from './QuickBenefitModal';
import ForwardToProcessModal from './ForwardToProcessModal';
import { getGlobalTemplate, saveGlobalTemplate, resolveToTemplate, getResolvedScriptForLead } from '../utils/callScript';
import { FieldPermissionGuard } from './FieldPermissionGuard';
import { PresenceIndicator } from './PresenceIndicator';


interface LeadDetailModalProps {
  lead: Lead;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (lead: Lead) => void;
  onDelete?: (lead: Lead) => void;
}

export default React.memo(function LeadDetailModal({
  lead,
  isOpen,
  onClose,
  onEdit,
  onDelete
}: LeadDetailModalProps) {
  const { getVisibleColumns } = useColumns();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showScriptModal, setShowScriptModal] = useState(false);
  const [generatedScript, setGeneratedScript] = useState('');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [consultantName, setConsultantName] = useState(localStorage.getItem('consultantName') || 'સબસીડી કન્સલ્ટન્ટ');
  const [showQuickBenefitModal, setShowQuickBenefitModal] = useState(false);
  const [isEditingScript, setIsEditingScript] = useState(false);
  const [editableScript, setEditableScript] = useState('');
  const [isSavingScript, setIsSavingScript] = useState(false);
  // When true, the editor shows the template with placeholders (e.g. {client_name}) instead of the resolved values
  const [editingAsTemplate, setEditingAsTemplate] = useState(false);

  // Refs to track modal states for stable ESC key handler
  const showScriptModalRef = useRef(false);
  const showSettingsModalRef = useRef(false);
  const showQuickBenefitModalRef = useRef(false);
  // Track which lead the current script was built for to avoid showing another lead's script
  const lastBuiltForLeadId = useRef<string | null>(null);

  const router = useRouter();
  const { createCase } = useCases();
  const { canConvertToCase, canAssignLeads, getUsersByRole, getUserById, currentUser } = useUsers();
  const { assignLead, unassignLead } = useLeads();
  const [isConverting, setIsConverting] = useState(false);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const canConvert = canConvertToCase();
  const canAssign = canAssignLeads();

  const handleConvertToCase = () => {
    if (!canConvert) {
      alert("You don't have permission to forward leads to process.");
      return;
    }
    // Open the forward to process form modal
    setShowForwardModal(true);
  };

  // Handle form submission from ForwardToProcessModal
  const handleForwardSubmit = async (formData: any) => {
    setShowForwardModal(false);
    setIsConverting(true);

    try {
      // Use form data for scheme type, or fall back to policy type
      const schemeType = formData.policyType || 'General';

      const result = createCase(lead.id, schemeType, {
        caseType: formData.caseType,
        benefitTypes: formData.benefitTypes,
        companyName: formData.companyName,
        companyType: formData.companyType,
        contacts: formData.contacts,
        // Financial/Location fields - previously missing
        talukaCategory: formData.talukaCategory,
        termLoanAmount: formData.termLoanAmount,
        plantMachineryValue: formData.plantMachineryValue,
        electricityLoad: formData.electricityLoad,
        electricityLoadType: formData.electricityLoadType
      });

      if (result.success && result.caseIds && result.caseIds.length > 0) {
        onClose();
        router.push(`/case-details?id=${result.caseIds[0]}`);
      } else {
        alert(`Failed to forward: ${result.message}`);
      }
    } catch (error) {
      console.error('Forward error:', error);
      alert('An error occurred during forwarding.');
    } finally {
      setIsConverting(false);
    }
  };

  // Update refs when modal states change
  useEffect(() => {
    showScriptModalRef.current = showScriptModal;
  }, [showScriptModal]);

  useEffect(() => {
    showSettingsModalRef.current = showSettingsModal;
  }, [showSettingsModal]);

  useEffect(() => {
    showQuickBenefitModalRef.current = showQuickBenefitModal;
  }, [showQuickBenefitModal]);

  // ESC key handler to close LeadDetailModal with proper event handling
  // Stable listener that doesn't re-attach on modal state changes
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Only close LeadDetailModal if no child modals are open
        if (!showScriptModalRef.current && !showSettingsModalRef.current && !showQuickBenefitModalRef.current) {
          e.stopPropagation();
          onClose();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  // Initialize the script when the modal opens or the lead changes
  // NOTE: hooks must not be called conditionally, so keep this effect near the top-level effects
  useEffect(() => {
    if (!showScriptModal) return;

    // If we already built for this lead, do nothing
    if (lastBuiltForLeadId.current === lead.id && generatedScript && generatedScript.trim()) return;

    // Prefer global template when present
    const rawGlobal = getGlobalTemplate();
    if (rawGlobal && rawGlobal.trim()) {
      const resolved = getResolvedScriptForLead(lead);
      setGeneratedScript(resolved);
      setEditableScript(editingAsTemplate ? rawGlobal : resolved);
      lastBuiltForLeadId.current = lead.id;
      setIsEditingScript(false);
      return;
    }

    const resolved = getResolvedScriptForLead(lead);
    setGeneratedScript(resolved);
    setEditableScript(resolved);
    lastBuiltForLeadId.current = lead.id;
    setIsEditingScript(false);
  }, [showScriptModal, lead, generatedScript, editingAsTemplate]);

  if (!isOpen) return null;

  // Helper function to get display value from submitted_payload or current lead fields
  // Prioritizes submitted_payload as the source of truth for display
  const getDisplayValue = (fieldKey: string): any => {
    return lead.submitted_payload?.[fieldKey] ?? lead[fieldKey as keyof Lead];
  };

  // Define permanent fields that should always appear in the modal
  const permanentFields = ['mobileNumbers', 'mobileNumber', 'unitType', 'status', 'followUpDate', 'companyLocation', 'notes', 'lastActivityDate'];

  // Copy to clipboard function
  const copyToClipboard = useCallback(async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000); // Reset after 2 seconds
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  }, []);

  // WhatsApp redirect function
  const handleWhatsAppRedirect = (lead: Lead) => {
    // Get the main phone number
    const mainPhoneNumber = getPrimaryPhoneNumber(lead);

    if (!mainPhoneNumber || mainPhoneNumber.trim() === '') {
      alert('No phone number available for this lead.');
      return;
    }

    // Clean the phone number (remove any non-digit characters)
    const cleanNumber = mainPhoneNumber.replace(/[^0-9]/g, '');

    // Check if number is valid (should be 10 digits for Indian numbers)
    if (cleanNumber.length !== 10) {
      alert(`Invalid phone number: ${mainPhoneNumber}. Please check the number format.`);
      return;
    }

    // Create WhatsApp URL
    const whatsappUrl = `https://wa.me/91${cleanNumber}`;

    // Open WhatsApp in new tab
    window.open(whatsappUrl, '_blank');
  };

  // Settings modal handler
  const handleSaveSettings = () => {
    localStorage.setItem('consultantName', consultantName);
    setShowSettingsModal(false);

    // Regenerate script with new consultant name if script modal is open
    if (showScriptModal) {
      handleScriptGeneration(lead);
    }
  };


  // Build the default script template using the exact Gujarati template and lead data
  // NOTE: moved to util file for testability
  // keep a local shim that delegates to util (import below)

  // import replaced below - see top of file


  // NOTE: placeholder replacement handled in utils/getResolvedScriptForLead

  // Script generation handler - initialize or rebuild when opening for a new lead
  const handleScriptGeneration = (lead: Lead) => {
    // Open the script modal; effect will initialize generatedScript/editableScript
    setIsEditingScript(false);
    setShowScriptModal(true);
  };



  const handleSaveEditedScript = () => {
    const nextScriptRaw = editableScript.trim() || generatedScript;
    setIsSavingScript(true);

    try {
      // Save as GLOBAL template. If user is editing in "template" mode, take the template as-is.
      // Otherwise, convert the resolved text into a template by replacing lead-specific values.
      const templateToSave = editingAsTemplate ? nextScriptRaw : resolveToTemplate(nextScriptRaw, lead);
      saveGlobalTemplate(templateToSave);

      // Update local state with the resolved version for current lead
      const resolved = getResolvedScriptForLead(lead);
      setGeneratedScript(resolved);
      setEditableScript(editingAsTemplate ? templateToSave : resolved);
    } catch (error) {
      console.error('Failed to persist global call script template', error);
    }

    setIsEditingScript(false);
    setIsSavingScript(false);
  };

  // Helper function to format date to DD-MM-YYYY
  const formatDateToDDMMYYYY = useCallback((dateString: string): string => {
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
  }, []);

  // Helper function to format different field types
  const formatFieldValue = useCallback((value: unknown, type: string): string => {
    if (value === undefined || value === null || value === '') return 'N/A';

    switch (type) {
      case 'date':
        return formatDateToDDMMYYYY(String(value));
      case 'number':
        return typeof value === 'number' ? value.toLocaleString() : String(value);
      case 'email':
        return String(value);
      case 'phone':
        return String(value);
      case 'url':
        return String(value);
      default:
        return String(value);
    }
  }, [formatDateToDDMMYYYY]);

  // Normalize primary phone number across all known key variants so sheet data maps correctly
  const getPrimaryPhoneNumber = useCallback((lead: Lead): string => {
    const fromArray = lead.mobileNumbers && lead.mobileNumbers.length > 0
      ? lead.mobileNumbers.find(m => m.isMain)?.number || lead.mobileNumbers[0]?.number || ''
      : '';
    if (fromArray && fromArray.trim()) return fromArray.trim();

    const fallbackNumbers = [
      (lead as unknown as Record<string, unknown>).mobileNumber,
      (lead as unknown as Record<string, unknown>).phoneNumber,
      (lead as unknown as Record<string, unknown>).phone_no,
      (lead as unknown as Record<string, unknown>).phoneNo,
      (lead as unknown as Record<string, unknown>).phone,
      (lead as unknown as Record<string, unknown>).primaryPhone,
      (lead as unknown as Record<string, unknown>).primary_phone,
      (lead as unknown as Record<string, unknown>).Phone,
      (lead as unknown as Record<string, unknown>).Mobile,
      (lead as unknown as Record<string, unknown>).contactNumber,
      (lead as unknown as Record<string, unknown>).contactNo
    ];

    const firstMatch = fallbackNumbers
      .map(val => (typeof val === 'string' ? val.trim() : ''))
      .find(Boolean);

    return firstMatch || 'N/A';
  }, []);

  // Get current column configuration - memoize to prevent recalculation
  const visibleColumns = useMemo(() => getVisibleColumns(), [getVisibleColumns]);
  const customColumns = useMemo(() =>
    visibleColumns.filter(col => !permanentFields.includes(col.fieldKey)),
    [visibleColumns]
  );

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-5 mx-auto p-2 border w-11/12 md:w-5/6 lg:w-4/5 xl:w-3/4 shadow-lg rounded-md bg-white">
        <div className="mt-1">
          {/* Modal Header */}
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-4">
              <h3 className="text-xs font-medium text-black">Lead Details</h3>
              <PresenceIndicator entityType="lead" entityId={lead.id} />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-black transition-colors"
              title="Close modal"
              aria-label="Close modal"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="max-h-[70vh] overflow-y-auto pr-2">
            <div className="space-y-2">
              {/* Permanent Fields Section */}
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {/* Mobile Numbers */}
                <div className="bg-gray-50 p-2 rounded-md">
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-medium text-black">Main Phone</label>
                    <button
                      type="button"
                      onClick={() => {
                        const phoneNumber = getPrimaryPhoneNumber(lead);
                        copyToClipboard(phoneNumber, 'mainPhone');
                      }}
                      className="text-gray-400 hover:text-black transition-colors"
                      title="Copy main phone number"
                      aria-label="Copy main phone number"
                    >
                      {copiedField === 'mainPhone' ? (
                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <p className="text-xs font-medium text-black">
                    {(() => {
                      // Try to get phone from submitted_payload first
                      const payloadMobileNumbers = lead.submitted_payload?.mobileNumbers;
                      if (payloadMobileNumbers && Array.isArray(payloadMobileNumbers) && payloadMobileNumbers.length > 0) {
                        const mainMobile = payloadMobileNumbers.find((m: any) => m.isMain) || payloadMobileNumbers[0];
                        if (mainMobile?.number) return mainMobile.number;
                      }
                      return getPrimaryPhoneNumber(lead);
                    })()}
                  </p>
                </div>

                {/* Unit Type */}
                <div className="bg-gray-50 p-2 rounded-md">
                  <label className="block text-xs font-medium text-black mb-1">Unit Type</label>
                  <p className="text-xs font-medium text-black">{getDisplayValue('unitType') || lead.unitType}</p>
                </div>

                {/* Status */}
                <div className="bg-gray-50 p-2 rounded-md">
                  <label className="block text-xs font-medium text-black mb-1">Status</label>
                  {(() => {
                    const statusValue = getDisplayValue('status') || lead.status;
                    return (
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${statusValue === 'New' ? 'bg-blue-100 text-blue-800' :
                        statusValue === 'Fresh Lead' ? 'bg-emerald-100 text-emerald-800' :
                          statusValue === 'CNR' ? 'bg-orange-100 text-orange-800' :
                            statusValue === 'Busy' ? 'bg-yellow-100 text-yellow-800' :
                              statusValue === 'Follow-up' ? 'bg-purple-100 text-purple-800' :
                                statusValue === 'Deal Close' ? 'bg-green-100 text-green-800' :
                                  statusValue === 'Work Alloted' ? 'bg-indigo-100 text-indigo-800' :
                                    statusValue === 'Hotlead' ? 'bg-red-100 text-red-800' :
                                      statusValue === 'Others' ? 'bg-gray-100 text-black' :
                                        'bg-gray-100 text-black'
                        }`}>
                        {statusValue === 'Work Alloted' ? 'WAO' : statusValue === 'Fresh Lead' ? 'FL1' : statusValue}
                      </span>
                    );
                  })()}
                </div>

                {/* Follow-up Date */}
                <div className="bg-gray-50 p-2 rounded-md">
                  <label className="block text-xs font-medium text-black mb-1">Follow-up Date</label>
                  <p className="text-xs font-medium text-black">
                    {(() => {
                      const followUpValue = getDisplayValue('followUpDate') || lead.followUpDate;
                      return followUpValue ? formatDateToDDMMYYYY(followUpValue) : 'N/A';
                    })()}
                  </p>
                </div>

                {/* Address */}
                {(() => {
                  const locationValue = getDisplayValue('companyLocation') || lead.companyLocation;
                  return locationValue ? (
                    <div className="bg-gray-50 p-2 rounded-md">
                      <label className="block text-xs font-medium text-black mb-1">Address</label>
                      <p className="text-xs font-medium text-black">{locationValue}</p>
                    </div>
                  ) : null;
                })()}

                {/* Notes */}
                {(() => {
                  const notesValue = getDisplayValue('notes') || lead.notes;
                  return notesValue ? (
                    <div className="bg-gray-50 p-2 rounded-md">
                      <label className="block text-xs font-medium text-black mb-1">Last Discussion</label>
                      <p className="text-xs font-medium text-black break-words">{notesValue}</p>
                    </div>
                  ) : null;
                })()}

                {/* Last Activity Date */}
                <div className="bg-gray-50 p-2 rounded-md">
                  <label className="block text-xs font-medium text-black mb-1">Last Activity</label>
                  <p className="text-xs font-medium text-black">{formatDateToDDMMYYYY(getDisplayValue('lastActivityDate') || lead.lastActivityDate)}</p>
                </div>

                {/* Assigned To - Sales Lead Assignment */}
                <div className="bg-gray-50 p-2 rounded-md">
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-medium text-black">Assigned To</label>
                    {canAssign && (
                      <button
                        type="button"
                        onClick={() => setShowAssignModal(true)}
                        className="text-purple-600 hover:text-purple-800 text-xs font-medium"
                        title="Reassign lead"
                      >
                        {lead.assignedTo ? 'Reassign' : 'Assign'}
                      </button>
                    )}
                  </div>
                  <p className="text-xs font-medium text-black">
                    {lead.assignedTo
                      ? getUserById(lead.assignedTo)?.name || 'Unknown User'
                      : 'Unassigned'}
                  </p>
                  {lead.assignedAt && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      Assigned: {formatDateToDDMMYYYY(lead.assignedAt.split('T')[0])}
                    </p>
                  )}
                </div>
              </div>

              {/* Additional Numbers */}
              {lead.mobileNumbers && lead.mobileNumbers.length > 0 && (
                <div className="bg-gray-50 p-2 rounded-md">
                  <label className="block text-xs font-medium text-black mb-1">All Mobile Numbers</label>
                  <div className="space-y-1">
                    {lead.mobileNumbers.filter(m => m.number && m.number.trim()).map((mobile, index) => (
                      <div key={index} className="flex items-center justify-between bg-white px-2 py-1 rounded border">
                        <div className="flex-1">
                          <div className="text-xs font-medium text-black">
                            {mobile.name ? `${mobile.name}` : `Mobile ${index + 1}`}
                          </div>
                          <div className="text-xs text-black">{mobile.number}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          {mobile.isMain && (
                            <span className="px-2 py-1 text-xs font-bold bg-blue-100 text-blue-800 rounded-full">
                              Main
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => copyToClipboard(mobile.number, `mobile${index + 1}`)}
                            className="text-gray-400 hover:text-black transition-colors"
                            title="Copy mobile number"
                            aria-label={`Copy mobile number ${index + 1}`}
                          >
                            {copiedField === `mobile${index + 1}` ? (
                              <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Dynamic Fields Section */}
              {customColumns.length > 0 && (
                <div className="bg-gray-50 p-2 rounded-md">
                  <label className="block text-xs font-medium text-black mb-1">Additional Information</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                    {customColumns.map((column) => {
                      const value = (lead as unknown as Record<string, unknown>)[column.fieldKey] as unknown;
                      const displayValue = formatFieldValue(value, column.type);

                      return (
                        <FieldPermissionGuard key={column.fieldKey} resource="leads" fieldName={column.fieldKey} mode="view">
                          <div className="bg-white p-2 rounded border">
                            <div className="flex justify-between items-center mb-1">
                              <div className="text-xs font-medium text-black">{column.label}</div>
                              {displayValue !== 'N/A' && (
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(String(value), column.fieldKey)}
                                  className="text-gray-400 hover:text-black transition-colors"
                                  title={`Copy ${column.label}`}
                                  aria-label={`Copy ${column.label} to clipboard`}
                                >
                                  {copiedField === column.fieldKey ? (
                                    <svg className="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  ) : (
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                  )}
                                </button>
                              )}
                            </div>
                            <div className="text-xs text-black">{displayValue}</div>
                          </div>
                        </FieldPermissionGuard>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Final Conclusion */}
              {lead.finalConclusion && (
                <div className="bg-gray-50 p-2 rounded-md">
                  <label className="block text-xs font-medium text-black mb-1">Final Conclusion</label>
                  <p className="text-xs font-medium text-black break-words">{lead.finalConclusion}</p>
                </div>
              )}

            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex justify-between items-center mt-3 pt-2 border-t">
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => {
                  // Build dynamic fields info
                  const dynamicFieldsInfo = customColumns
                    .map(column => {
                      const value = (lead as unknown as Record<string, unknown>)[column.fieldKey];
                      const displayValue = formatFieldValue(value, column.type);
                      return `${column.label}: ${displayValue}`;
                    })
                    .join('\n');

                  const allInfo = `Phone: ${(() => {
                    const phoneNumber = getPrimaryPhoneNumber(lead);
                    const contactName = lead.mobileNumbers && lead.mobileNumbers.length > 0
                      ? lead.mobileNumbers.find(m => m.isMain)?.name || lead.clientName || 'N/A'
                      : lead.clientName || 'N/A';
                    return `${phoneNumber} - ${contactName}`;
                  })()}
Status: ${lead.status}
Unit Type: ${lead.unitType}
Follow-up Date: ${lead.followUpDate ? formatDateToDDMMYYYY(lead.followUpDate) : 'N/A'}
Last Activity: ${formatDateToDDMMYYYY(lead.lastActivityDate)}
${lead.companyLocation ? `Address: ${lead.companyLocation}` : ''}
${lead.notes ? `Last Discussion: ${lead.notes}` : ''}
${lead.finalConclusion ? `Conclusion: ${lead.finalConclusion}` : ''}
${dynamicFieldsInfo ? `\nAdditional Information:\n${dynamicFieldsInfo}` : ''}`;
                  copyToClipboard(allInfo, 'allInfo');
                }}
                className="px-3 py-1 text-xs font-medium text-black bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors flex items-center space-x-1"
                aria-label="Copy all lead information"
              >
                {copiedField === 'allInfo' ? (
                  <>
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>Copy All Info</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleScriptGeneration(lead)}
                className="px-3 py-1 text-xs font-medium text-white bg-purple-600 border border-transparent rounded hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors flex items-center space-x-1"
                title="Generate call script"
                aria-label="Generate call script"
              >
                {copiedField === 'script' ? (
                  <>
                    <svg className="w-4 h-4 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Script Copied!</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Script</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleWhatsAppRedirect(lead)}
                className="px-3 py-1 text-xs font-medium text-white bg-green-600 border border-transparent rounded hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors flex items-center space-x-1"
                aria-label="Open WhatsApp chat"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488" />
                </svg>
                <span>WhatsApp</span>
              </button>
            </div>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1 text-xs font-medium text-black bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
                aria-label="Close modal"
              >
                Close
              </button>

              {/* Conversion Button */}
              {canConvert && !lead.convertedToCaseId && (
                <button
                  type="button"
                  onClick={handleConvertToCase}
                  disabled={isConverting}
                  className="px-3 py-1 text-xs font-medium text-white bg-purple-600 border border-transparent rounded hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors disabled:opacity-50"
                  aria-label="Forward To Process"
                >
                  {isConverting ? 'Forwarding...' : 'Forward To Process'}
                </button>
              )}

              {/* View Process Button (if already converted) */}
              {lead.convertedToCaseId && (
                <button
                  type="button"
                  onClick={() => router.push(`/case-details?id=${lead.convertedToCaseId}`)}
                  className="px-3 py-1 text-xs font-medium text-white bg-purple-600 border border-transparent rounded hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors"
                  aria-label="View Process"
                >
                  View Process
                </button>
              )}

              <button
                type="button"
                onClick={() => onEdit(lead)}
                className="px-3 py-1 text-xs font-medium text-white bg-blue-600 border border-transparent rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                aria-label="Edit lead"
              >
                Edit Lead
              </button>
              {onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(lead)}
                  className="px-3 py-1 text-xs font-medium text-white bg-red-600 border border-transparent rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
                  aria-label="Delete lead"
                >
                  Delete Lead
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Script Preview Modal */}
      {
        showScriptModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Call Script Preview</h3>
                <div className="flex items-center space-x-2">
                  {/* Edit mode toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      const next = !editingAsTemplate;
                      setEditingAsTemplate(next);

                      // If currently editing, convert the editor content appropriately
                      if (isEditingScript) {
                        if (next) {
                          const rawGlobal = getGlobalTemplate();
                          if (rawGlobal && rawGlobal.trim()) {
                            setEditableScript(rawGlobal);
                          } else {
                            setEditableScript(resolveToTemplate(editableScript || generatedScript, lead));
                          }
                        } else {
                          setEditableScript(getResolvedScriptForLead(lead));
                        }
                      }
                    }}
                    className={`text-gray-400 hover:text-gray-600 p-1 ${editingAsTemplate ? 'ring-2 ring-offset-1 ring-indigo-300' : ''}`}
                    title="Toggle editing as template (placeholders)"
                    aria-pressed={editingAsTemplate}
                    aria-label="Toggle template edit mode"
                  >
                    {editingAsTemplate ? (
                      <span className="text-xs font-medium">Template</span>
                    ) : (
                      <span className="text-xs font-medium">Resolved</span>
                    )}
                  </button>

                  {isEditingScript ? (
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingScript(prev => {
                          const next = !prev;
                          if (!prev) {
                            const rawGlobal = getGlobalTemplate();
                            if (editingAsTemplate) {
                              setEditableScript((rawGlobal && rawGlobal.trim()) ? rawGlobal : resolveToTemplate(generatedScript, lead));
                            } else {
                              setEditableScript(generatedScript);
                            }
                          }
                          return next;
                        });
                      }}
                      className="text-gray-400 hover:text-gray-600 p-1"
                      title="Exit edit mode"
                      aria-pressed={isEditingScript}
                      aria-label="Exit edit mode"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setIsEditingScript(prev => {
                          const next = !prev;
                          if (!prev) {
                            setEditableScript(generatedScript);
                          }
                          return next;
                        });
                      }}
                      className="text-gray-400 hover:text-gray-600 p-1"
                      title="Edit script"
                      aria-pressed={isEditingScript}
                      aria-label="Edit script"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 11l6.232-6.232a2.5 2.5 0 113.536 3.536L12.536 14.5H9v-3.5z" />
                      </svg>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowSettingsModal(true)}
                    className="text-gray-400 hover:text-gray-600 p-1"
                    title="Settings"
                    aria-label="Script settings"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowScriptModal(false);
                      setIsEditingScript(false);
                    }}
                    className="text-gray-400 hover:text-gray-600"
                    title="Close script preview"
                    aria-label="Close script preview"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="mb-4">
                <div className="bg-gray-50 p-4 rounded-lg border">
                  {isEditingScript ? (
                    <textarea
                      value={editableScript}
                      onChange={(e) => setEditableScript(e.target.value)}
                      aria-label="Edit call script"
                      title="Edit call script"
                      placeholder="Edit call script..."
                      className="w-full min-h-[220px] bg-white border border-gray-300 rounded-md p-3 text-black text-base leading-relaxed gujarati-text focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 whitespace-pre-wrap placeholder-black"
                    />
                  ) : (
                    <p className="text-gray-800 leading-relaxed gujarati-text text-lg whitespace-pre-line text-left" dir="ltr">
                      {generatedScript}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-between">
                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={() => setShowQuickBenefitModal(true)}
                    className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
                    aria-label="Open Quick Benefit modal"
                  >
                    Quick Benefit
                  </button>
                </div>
                <div className="flex space-x-3">
                  {isEditingScript && (
                    <button
                      type="button"
                      onClick={handleSaveEditedScript}
                      disabled={isSavingScript || !editableScript.trim()}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="Save script changes"
                    >
                      {isSavingScript ? 'Saving...' : 'Save Changes'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedScript);
                      setCopiedField('script');
                      setTimeout(() => setCopiedField(null), 2000);
                    }}
                    className="px-4 py-2 text-sm font-medium text-white bg-purple-600 border border-transparent rounded hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors"
                    aria-label="Copy script to clipboard"
                  >
                    {copiedField === 'script' ? 'Copied!' : 'Copy Script'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowScriptModal(false);
                      setIsEditingScript(false);
                    }}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
                    aria-label="Close script preview"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* Settings Modal */}
      {
        showSettingsModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Settings</h3>
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                  title="Close settings"
                  aria-label="Close settings"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="mb-4">
                <label htmlFor="consultantName" className="block text-sm font-medium text-gray-700 mb-2">
                  Subsidy Consultant Name
                </label>
                <input
                  type="text"
                  id="consultantName"
                  value={consultantName}
                  onChange={(e) => setConsultantName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent gujarati-text placeholder-black text-black"
                  placeholder="Enter your name"
                />
                <p className="text-xs text-gray-500 mt-1">
                  This name will be used in generated call scripts
                </p>
              </div>

              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
                  aria-label="Cancel settings"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveSettings}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                  aria-label="Save settings"
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Quick Benefit Modal */}
      <QuickBenefitModal
        isOpen={showQuickBenefitModal}
        onClose={() => setShowQuickBenefitModal(false)}
        onSave={(payload) => {
          // Handle the new template-based payload
          console.log('Template saved:', payload.templateName, 'Content:', payload.content);
          // You can add additional logic here if needed for template processing
        }}
      />

      {/* Forward To Process Modal */}
      <ForwardToProcessModal
        isOpen={showForwardModal}
        onClose={() => setShowForwardModal(false)}
        onSubmit={handleForwardSubmit}
        lead={lead}
      />

      {/* Lead Assignment Modal */}
      {
        showAssignModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-4 max-w-md w-full mx-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  {lead.assignedTo ? 'Reassign Lead' : 'Assign Lead'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  Select a Sales Executive to assign this lead to:
                </p>

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {/* Unassign option */}
                  {lead.assignedTo && (
                    <button
                      type="button"
                      onClick={() => {
                        unassignLead(lead.id);
                        setShowAssignModal(false);
                      }}
                      className="w-full p-2 text-left rounded border border-gray-200 hover:bg-gray-50 text-sm text-gray-700"
                    >
                      <span className="font-medium text-red-600">Unassign Lead</span>
                      <span className="block text-xs text-gray-500">Remove current assignment</span>
                    </button>
                  )}

                  {/* List of Sales Executives */}
                  {getUsersByRole('SALES_EXECUTIVE').map(user => (
                    <button
                      key={user.userId}
                      type="button"
                      onClick={() => {
                        assignLead(lead.id, user.userId, currentUser?.userId || '');
                        setShowAssignModal(false);
                      }}
                      className={`w-full p-2 text-left rounded border ${lead.assignedTo === user.userId
                        ? 'border-purple-300 bg-purple-50'
                        : 'border-gray-200 hover:bg-gray-50'
                        } text-sm`}
                    >
                      <span className="font-medium text-gray-900">{user.name}</span>
                      {lead.assignedTo === user.userId && (
                        <span className="ml-2 text-xs text-purple-600">(Currently Assigned)</span>
                      )}
                      <span className="block text-xs text-gray-500">{user.email}</span>
                    </button>
                  ))}

                  {getUsersByRole('SALES_EXECUTIVE').length === 0 && (
                    <p className="text-sm text-gray-500 p-2">
                      No Sales Executives available. Create users with the SALES_EXECUTIVE role first.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end mt-4">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
});
