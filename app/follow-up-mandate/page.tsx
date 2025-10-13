'use client';

import { useState, useEffect } from 'react';
import { useLeads } from '../context/LeadContext';
import type { Lead } from '../types/shared';
import { useRouter, useSearchParams } from 'next/navigation';
import LeadTable from '../components/LeadTable';

export default function FollowUpMandatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { leads, deleteLead } = useLeads();
  const [activeTab, setActiveTab] = useState<'pending' | 'signed'>('pending');
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Handle URL parameters to set the correct tab when returning from add-lead form
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'signed' || tab === 'mandate-sent') {
      setActiveTab('signed');
    } else if (tab === 'pending' || tab === 'documentation') {
      setActiveTab('pending');
    }
  }, [searchParams]);

  // Filter leads based on status
  const documentation = leads.filter(lead => 
    !lead.isDeleted && lead.status === 'Documentation' && !lead.isDone
  );

  const mandateSent = leads.filter(lead => 
    !lead.isDeleted && lead.status === 'Mandate Sent' && !lead.isDone
  );

  // Modal functions
  const openModal = (lead: Lead) => {
    setSelectedLead(lead);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setSelectedLead(null);
    setIsModalOpen(false);
  };

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isModalOpen) {
        closeModal();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isModalOpen]);

  // Handle modal return from edit form
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const returnToModal = urlParams.get('returnToModal');
    const leadId = urlParams.get('leadId');
    
    if (returnToModal === 'true' && leadId) {
      // Ensure tab is set correctly first
      const tab = urlParams.get('tab');
      if (tab === 'signed' || tab === 'mandate-sent') {
        setActiveTab('signed');
      } else if (tab === 'pending' || tab === 'documentation') {
        setActiveTab('pending');
      }
      
      // Find the lead and open the modal
      const lead = leads.find(l => l.id === leadId);
      if (lead) {
        setSelectedLead(lead);
        setIsModalOpen(true);
      }
      
      // Clean up URL parameters while preserving tab parameter
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('returnToModal');
      newUrl.searchParams.delete('leadId');
      // Preserve the tab parameter if it exists
      if (tab) {
        newUrl.searchParams.set('tab', tab);
      }
      window.history.replaceState({}, '', newUrl.toString());
    }
  }, [leads]);

  // Handle lead click
  const handleLeadClick = (lead: any) => {
    openModal(lead);
  };

  // Handle lead selection
  const handleLeadSelection = (leadId: string, checked: boolean) => {
    const newSelected = new Set(selectedLeads);
    if (checked) {
      newSelected.add(leadId);
    } else {
      newSelected.delete(leadId);
    }
    setSelectedLeads(newSelected);
  };

  // Handle select all
  const handleSelectAll = (checked: boolean) => {
    const currentLeads = activeTab === 'pending' ? documentation : mandateSent;
    if (checked) {
      setSelectedLeads(new Set(currentLeads.map(lead => lead.id)));
    } else {
      setSelectedLeads(new Set());
    }
  };

  // Handle bulk delete - no password protection
  const handleBulkDeleteClick = () => {
    if (selectedLeads.size === 0) return;
    
    // Direct deletion without password protection
    selectedLeads.forEach(leadId => {
      deleteLead(leadId);
    });
    
    setSelectedLeads(new Set());
  };

  // Handle edit lead
  const handleEditLead = (lead: Lead) => {
    // Store the lead data in localStorage for editing
    localStorage.setItem('editingLead', JSON.stringify(lead));
    // Store modal return data for ESC key functionality
    const sourcePage = activeTab === 'pending' ? 'documentation' : 'mandate-sent';
    localStorage.setItem('modalReturnData', JSON.stringify({
      sourcePage: sourcePage,
      leadId: lead.id
    }));
    // Navigate to add-lead page with a flag to indicate we're editing
    router.push(`/add-lead?mode=edit&id=${lead.id}&from=${sourcePage}`);
  };

  // Action buttons for the table
  const renderActionButtons = (lead: any) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        localStorage.setItem('editingLead', JSON.stringify(lead));
        // Include source page information for proper navigation back
        const sourcePage = activeTab === 'pending' ? 'documentation' : 'mandate-sent';
        router.push(`/add-lead?mode=edit&id=${lead.id}&from=${sourcePage}`);
      }}
      className={`px-3 py-1 text-sm rounded-md transition-colors ${
        activeTab === 'pending' 
          ? 'bg-orange-600 hover:bg-orange-700 text-white' 
          : 'bg-green-600 hover:bg-green-700 text-white'
      }`}
    >
      Update Status
    </button>
  );

  return (
    <div className="container mx-auto px-4 py-2">
      {/* Header */}
      <div className="flex justify-between items-center mb-2">
        <div>
          <h1 className="text-sm font-bold text-White-800">Follow-up Mandate & Documentation</h1>
          <p className="text-sm text-white mt-2">Manage mandate status and document tracking</p>
        </div>
        <button 
          onClick={() => router.push('/dashboard')}
          className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md transition-colors"
        >
          Back to Dashboard
        </button>
      </div>


      {/* Tab Navigation */}
      <div className="bg-white rounded-lg shadow-md mb-6">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('pending')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'pending'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-black hover:text-black hover:border-gray-300'
              }`}
            >
              Documentation ({documentation.length})
            </button>
            <button
              onClick={() => setActiveTab('signed')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'signed'
                  ? 'border-green-500 text-green-600'
                  : 'border-transparent text-black hover:text-black hover:border-gray-300'
              }`}
            >
              Mandate Sent ({mandateSent.length})
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'pending' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-black">Documentation</h2>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => handleSelectAll(selectedLeads.size === documentation.length ? false : true)}
                    className="px-3 py-1 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                  >
                    {selectedLeads.size === documentation.length ? 'Deselect All' : 'Select All'}
                  </button>
                  {selectedLeads.size > 0 && (
                    <button
                      onClick={handleBulkDeleteClick}
                      className="px-3 py-1 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                    >
                      Delete Selected ({selectedLeads.size})
                    </button>
                  )}
                </div>
              </div>
              <LeadTable
                leads={documentation}
                onLeadClick={handleLeadClick}
                selectedLeads={selectedLeads}
                onLeadSelection={handleLeadSelection}
                showActions={true}
                actionButtons={renderActionButtons}
                emptyMessage="No leads waiting for documents"
              />
            </div>
          )}

          {activeTab === 'signed' && (
            <div>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-black">Mandate Sent</h2>
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => handleSelectAll(selectedLeads.size === mandateSent.length ? false : true)}
                    className="px-3 py-1 text-sm bg-gray-600 text-white rounded-md hover:bg-gray-700 transition-colors"
                  >
                    {selectedLeads.size === mandateSent.length ? 'Deselect All' : 'Select All'}
                  </button>
                  {selectedLeads.size > 0 && (
                    <button
                      onClick={handleBulkDeleteClick}
                      className="px-3 py-1 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                    >
                      Delete Selected ({selectedLeads.size})
                    </button>
                  )}
                </div>
              </div>
              <LeadTable
                leads={mandateSent}
                onLeadClick={handleLeadClick}
                selectedLeads={selectedLeads}
                onLeadSelection={handleLeadSelection}
                showActions={true}
                actionButtons={renderActionButtons}
                emptyMessage="No leads with mandate sent"
              />
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && selectedLead && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-5 mx-auto p-2 border w-11/12 md:w-5/6 lg:w-4/5 xl:w-3/4 shadow-lg rounded-md bg-white">
            <div className="mt-1">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-xs font-medium text-black">Lead Details</h3>
                <button
                  onClick={closeModal}
                  className="text-gray-400 hover:text-black transition-colors"
                  title="Close modal"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-4">
                <p className="text-sm text-gray-600">Lead details for: {selectedLead.clientName}</p>
                <div className="mt-4 flex space-x-2">
                  <button
                    onClick={closeModal}
                    className="px-3 py-1 text-xs font-medium text-black bg-gray-100 border border-gray-300 rounded hover:bg-gray-200"
                  >
                    Close
                  </button>
                  {!selectedLead.isDeleted && (
                    <button
                      onClick={() => {
                        closeModal();
                        handleEditLead(selectedLead);
                      }}
                      className="px-3 py-1 text-xs font-medium text-white bg-blue-600 border border-transparent rounded hover:bg-blue-700"
                    >
                      Edit Lead
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
