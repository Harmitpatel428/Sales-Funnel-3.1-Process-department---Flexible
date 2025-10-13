'use client';

import React, { useState } from 'react';
import type { Lead } from '../types/shared';
import { useColumns } from '../context/ColumnContext';
import QuickBenefitModal from './QuickBenefitModal';

interface LeadDetailModalProps {
  lead: Lead;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (lead: Lead) => void;
  onDelete: (lead: Lead) => void;
}

export default function LeadDetailModal({ 
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

  if (!isOpen) return null;

  // Define permanent fields that should always appear in the modal
  const permanentFields = ['mobileNumbers', 'mobileNumber', 'unitType', 'status', 'followUpDate', 'companyLocation', 'notes', 'lastActivityDate'];

  // Copy to clipboard function
  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000); // Reset after 2 seconds
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  // WhatsApp redirect function
  const handleWhatsAppRedirect = (lead: Lead) => {
    // Get the main phone number
    const mainPhoneNumber = lead.mobileNumbers && lead.mobileNumbers.length > 0 
      ? lead.mobileNumbers.find(m => m.isMain)?.number || lead.mobileNumbers[0]?.number || lead.mobileNumber
      : lead.mobileNumber;

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


  // Script generation function
  const handleScriptGeneration = (lead: Lead) => {
    // Get consultant name from localStorage or use default
    const consultantName = localStorage.getItem('consultantName') || 'સબસીડી કન્સલ્ટન્ટ';
    
    // Get company name from lead data or use default
    const companyName = lead.company || 'v4u biz solutions';
    
    // Get client name from lead data or use default
    const clientName = lead.clientName || 'Sir';

    // Base script template
    const script = `નમસ્તે સર, ${companyName} માંથી ${clientName} વાત કરો છો?

V4U Biz Solutions, અમદાવાદ માંથી ${consultantName} વાત કરું છું. અમારી કંપની મેન્યુફેક્ચરિંગ યુનિટને ગુજરાત સરકાર દ્વારા અપાતી સબસીડી અને બિઝનેસ લોન મેળવવામાં સહાય કરે છે.

જો આપનું લોન અથવા સબસીડી નું કામ હજી બાકી હોય તો તમારા યુનિટ ને સબસીડી ના કેટલા લાભ મળી શકે તેમ છે તેની હું ચોક્કસ માહિતી આપી શકું છું.`;

    // Show script preview modal instead of copying to clipboard
    setGeneratedScript(script);
    setShowScriptModal(true);
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

  // Helper function to format different field types
  const formatFieldValue = (value: any, type: string): string => {
    if (value === undefined || value === null || value === '') return 'N/A';
    
    switch (type) {
      case 'date':
        return formatDateToDDMMYYYY(value);
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
  };

  // Get current column configuration
  const visibleColumns = getVisibleColumns();
  const customColumns = visibleColumns.filter(col => !permanentFields.includes(col.fieldKey));
  
  if (process.env.NODE_ENV === 'development') {
    console.log('🔍 LeadDetailModal - visibleColumns:', visibleColumns.length);
    console.log('🔍 LeadDetailModal - customColumns:', customColumns.length);
    console.log('🔍 LeadDetailModal - permanentFields:', permanentFields);
  }

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-5 mx-auto p-2 border w-11/12 md:w-5/6 lg:w-4/5 xl:w-3/4 shadow-lg rounded-md bg-white">
        <div className="mt-1">
          {/* Modal Header */}
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-xs font-medium text-black">Lead Details</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-black transition-colors"
              title="Close modal"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Modal Content */}
          <div className="space-y-2">
            {/* Permanent Fields Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {/* Mobile Numbers */}
              <div className="bg-gray-50 p-2 rounded-md">
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-medium text-black">Main Phone</label>
                  <button
                    onClick={() => {
                      const phoneNumber = lead.mobileNumbers && lead.mobileNumbers.length > 0 
                        ? lead.mobileNumbers.find(m => m.isMain)?.number || lead.mobileNumbers[0]?.number || 'N/A'
                        : lead.mobileNumber || 'N/A';
                      copyToClipboard(phoneNumber, 'mainPhone');
                    }}
                    className="text-gray-400 hover:text-black transition-colors"
                    title="Copy main phone number"
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
                    const phoneNumber = lead.mobileNumbers && lead.mobileNumbers.length > 0 
                      ? lead.mobileNumbers.find(m => m.isMain)?.number || lead.mobileNumbers[0]?.number || 'N/A'
                      : lead.mobileNumber || 'N/A';
                    return phoneNumber;
                  })()}
                </p>
              </div>

              {/* Unit Type */}
              <div className="bg-gray-50 p-2 rounded-md">
                <label className="block text-xs font-medium text-black mb-1">Unit Type</label>
                <p className="text-xs font-medium text-black">{lead.unitType}</p>
              </div>

              {/* Status */}
              <div className="bg-gray-50 p-2 rounded-md">
                <label className="block text-xs font-medium text-black mb-1">Status</label>
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      lead.status === 'New' ? 'bg-blue-100 text-blue-800' :
                      lead.status === 'CNR' ? 'bg-orange-100 text-orange-800' :
                      lead.status === 'Busy' ? 'bg-yellow-100 text-yellow-800' :
                      lead.status === 'Follow-up' ? 'bg-purple-100 text-purple-800' :
                      lead.status === 'Deal Close' ? 'bg-green-100 text-green-800' :
                      lead.status === 'Work Alloted' ? 'bg-indigo-100 text-indigo-800' :
                      lead.status === 'Hotlead' ? 'bg-red-100 text-red-800' :
                      lead.status === 'Others' ? 'bg-gray-100 text-black' :
                      'bg-gray-100 text-black'
                    }`}>
                      {lead.status === 'Work Alloted' ? 'WAO' : lead.status}
                    </span>
              </div>

              {/* Follow-up Date */}
              <div className="bg-gray-50 p-2 rounded-md">
                <label className="block text-xs font-medium text-black mb-1">Follow-up Date</label>
                <p className="text-xs font-medium text-black">
                  {lead.followUpDate ? formatDateToDDMMYYYY(lead.followUpDate) : 'N/A'}
                </p>
              </div>

              {/* Company Location */}
              {lead.companyLocation && (
                <div className="bg-gray-50 p-2 rounded-md">
                  <label className="block text-xs font-medium text-black mb-1">Company Location</label>
                  <p className="text-xs font-medium text-black">{lead.companyLocation}</p>
                </div>
              )}

              {/* Notes */}
              {lead.notes && (
                <div className="bg-gray-50 p-2 rounded-md">
                  <label className="block text-xs font-medium text-black mb-1">Last Discussion</label>
                  <p className="text-xs font-medium text-black line-clamp-3">{lead.notes}</p>
                </div>
              )}

              {/* Last Activity Date */}
              <div className="bg-gray-50 p-2 rounded-md">
                <label className="block text-xs font-medium text-black mb-1">Last Activity</label>
                <p className="text-xs font-medium text-black">{formatDateToDDMMYYYY(lead.lastActivityDate)}</p>
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
                          onClick={() => copyToClipboard(mobile.number, `mobile${index + 1}`)}
                          className="text-gray-400 hover:text-black transition-colors"
                          title="Copy mobile number"
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
                    const value = (lead as any)[column.fieldKey];
                    const displayValue = formatFieldValue(value, column.type);
                    
                    return (
                      <div key={column.fieldKey} className="bg-white p-2 rounded border">
                        <div className="flex justify-between items-center mb-1">
                          <div className="text-xs font-medium text-black">{column.label}</div>
                          {displayValue !== 'N/A' && (
                            <button
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
                    );
                  })}
                </div>
              </div>
            )}

            {/* Final Conclusion */}
            {lead.finalConclusion && (
              <div className="bg-gray-50 p-2 rounded-md">
                <label className="block text-xs font-medium text-black mb-1">Final Conclusion</label>
                <p className="text-xs font-medium text-black line-clamp-3">{lead.finalConclusion}</p>
              </div>
            )}

            {/* Recent Activities - Compact */}
            {lead.activities && lead.activities.filter(activity => activity.description !== 'Lead created').length > 0 && (
              <div className="bg-gray-50 p-2 rounded-md">
                <label className="block text-xs font-medium text-black mb-1">Recent Activities</label>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {lead.activities.filter(activity => activity.description !== 'Lead created').slice(-3).map((activity) => (
                    <div key={activity.id} className="bg-white p-1 rounded text-xs">
                      <p className="text-black font-medium">{activity.description}</p>
                      <p className="text-black">
                        {new Date(activity.timestamp).toLocaleDateString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Modal Footer */}
          <div className="flex justify-between items-center mt-3 pt-2 border-t">
            <div className="flex space-x-2">
              <button 
                onClick={() => {
                  // Build dynamic fields info
                  const dynamicFieldsInfo = customColumns
                    .map(column => {
                      const value = (lead as any)[column.fieldKey];
                      const displayValue = formatFieldValue(value, column.type);
                      return `${column.label}: ${displayValue}`;
                    })
                    .join('\n');

                  const allInfo = `Phone: ${(() => {
                    const phoneNumber = lead.mobileNumbers && lead.mobileNumbers.length > 0 
                      ? lead.mobileNumbers.find(m => m.isMain)?.number || lead.mobileNumbers[0]?.number || 'N/A'
                      : lead.mobileNumber || 'N/A';
                    const contactName = lead.mobileNumbers && lead.mobileNumbers.length > 0 
                      ? lead.mobileNumbers.find(m => m.isMain)?.name || lead.clientName || 'N/A'
                      : lead.clientName || 'N/A';
                    return `${phoneNumber} - ${contactName}`;
                  })()}
Status: ${lead.status}
Unit Type: ${lead.unitType}
Follow-up Date: ${lead.followUpDate ? formatDateToDDMMYYYY(lead.followUpDate) : 'N/A'}
Last Activity: ${formatDateToDDMMYYYY(lead.lastActivityDate)}
${lead.companyLocation ? `Location: ${lead.companyLocation}` : ''}
${lead.notes ? `Last Discussion: ${lead.notes}` : ''}
${lead.finalConclusion ? `Conclusion: ${lead.finalConclusion}` : ''}
${dynamicFieldsInfo ? `\nAdditional Information:\n${dynamicFieldsInfo}` : ''}`;
                  copyToClipboard(allInfo, 'allInfo');
                }}
                className="px-3 py-1 text-xs font-medium text-black bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors flex items-center space-x-1"
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
                onClick={() => handleScriptGeneration(lead)}
                className="px-3 py-1 text-xs font-medium text-white bg-purple-600 border border-transparent rounded hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors flex items-center space-x-1"
                title="Generate call script"
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
                onClick={() => handleWhatsAppRedirect(lead)}
                className="px-3 py-1 text-xs font-medium text-white bg-green-600 border border-transparent rounded hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors flex items-center space-x-1"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.885 3.488"/>
                </svg>
                <span>WhatsApp</span>
              </button>
            </div>
            <div className="flex space-x-2">
              <button 
                onClick={onClose}
                className="px-3 py-1 text-xs font-medium text-black bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
              >
                Close
              </button>
              <button 
                onClick={() => onEdit(lead)}
                className="px-3 py-1 text-xs font-medium text-white bg-blue-600 border border-transparent rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                Edit Lead
              </button>
              <button
                onClick={() => onDelete(lead)}
                className="px-3 py-1 text-xs font-medium text-white bg-red-600 border border-transparent rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors"
              >
                Delete Lead
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Script Preview Modal */}
      {showScriptModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Call Script Preview</h3>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setShowSettingsModal(true)}
                  className="text-gray-400 hover:text-gray-600 p-1"
                  title="Settings"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
                <button
                  onClick={() => setShowScriptModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                  title="Close script preview"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            
            <div className="mb-4">
              <div className="bg-gray-50 p-4 rounded-lg border">
                <p className="text-gray-800 leading-relaxed gujarati-text text-lg whitespace-pre-line">
                  {generatedScript}
                </p>
              </div>
            </div>
            
            <div className="flex justify-between">
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowQuickBenefitModal(true)}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
                >
                  Quick Benefit
                </button>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(generatedScript);
                    setCopiedField('script');
                    setTimeout(() => setCopiedField(null), 2000);
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-purple-600 border border-transparent rounded hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 transition-colors"
                >
                  {copiedField === 'script' ? 'Copied!' : 'Copy Script'}
                </button>
                <button
                  onClick={() => setShowScriptModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Settings</h3>
              <button
                onClick={() => setShowSettingsModal(false)}
                className="text-gray-400 hover:text-gray-600"
                title="Close settings"
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
                onClick={() => setShowSettingsModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSettings}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Quick Benefit Modal */}
      <QuickBenefitModal
        isOpen={showQuickBenefitModal}
        onClose={() => setShowQuickBenefitModal(false)}
      />
    </div>
  );
}
